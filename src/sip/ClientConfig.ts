//
// AthenaPhone - Open Source SIP Softphone
//
// Copyright (C) 2026 Tom Cully <mail@tomcully.com>
// Licensed under the GNU GPLv3 - see <https://www.gnu.org/licenses/gpl-3.0.html>
//

import { Utils } from 'jssip';

import type { IceServerConfig } from '../types';
import '../utils/id';

/**
 * What a server tells a subscriber's client about itself:
 * `GET /api/v1/subscriber/{realm}/config` on AthenaSIP, signed with HTTP
 * Digest (RFC 7616) using the subscriber's own SIP credentials.
 *
 * Only the fields the phone reads are typed; the rest is kept as given.
 */
export interface ClientConfig {
  websocket_uri?: string;
  websocket_uris?: string[];
  transports?: {
    transport: string;
    address: string;
    port: number;
    uri?: string;
  }[];
  ice_servers: (IceServerConfig & { expires_at?: number })[];
  realm?: {
    name: string;
    registration?: { expires?: number; minimum?: number };
    outbound?: { flows?: number };
    conferences?: { prefix: string; trunk: string }[];
  };
}

export interface DigestChallenge {
  realm: string;
  nonce: string;
  /** `MD5` when the challenge names none (RFC 7616 3.3). */
  algorithm: string;
  qop: string[];
  opaque?: string;
  /** The nonce had expired or was used: sign the new one. */
  stale: boolean;
}

/**
 * Every Digest challenge in a `WWW-Authenticate` value. Several headers
 * arrive joined with commas, so one value may hold more than one challenge;
 * other schemes are skipped.
 */
export function parseChallenges(header: string): DigestChallenge[] {
  const found: Record<string, string>[] = [];
  let current: Record<string, string> | undefined;
  let at = 0;
  const token = /[A-Za-z0-9!#$%&'*+.^_`|~-]+/y;

  while (at < header.length) {
    while (at < header.length && /[\s,]/.test(header[at])) {
      at += 1;
    }
    token.lastIndex = at;
    const name = token.exec(header)?.[0];
    if (!name) {
      at += 1;
      continue;
    }
    at += name.length;
    while (header[at] === ' ' || header[at] === '\t') {
      at += 1;
    }
    if (header[at] !== '=') {
      // A scheme name starts a new challenge.
      current = name.toLowerCase() === 'digest' ? {} : undefined;
      if (current) {
        found.push(current);
      }
      continue;
    }
    at += 1;
    while (header[at] === ' ' || header[at] === '\t') {
      at += 1;
    }
    let value = '';
    if (header[at] === '"') {
      at += 1;
      while (at < header.length && header[at] !== '"') {
        if (header[at] === '\\') {
          at += 1;
        }
        value += header[at] ?? '';
        at += 1;
      }
      at += 1;
    } else {
      token.lastIndex = at;
      value = token.exec(header)?.[0] ?? '';
      at += value.length;
    }
    if (current) {
      current[name.toLowerCase()] = value;
    }
  }

  return found
    .filter(params => params.realm !== undefined && params.nonce !== undefined)
    .map(params => ({
      realm: params.realm,
      nonce: params.nonce,
      algorithm: (params.algorithm ?? 'MD5').toUpperCase(),
      qop: (params.qop ?? '')
        .split(',')
        .map(entry => entry.trim())
        .filter(Boolean),
      ...(params.opaque !== undefined ? { opaque: params.opaque } : {}),
      stale: params.stale?.toLowerCase() === 'true',
    }));
}

export interface DigestRequest {
  username: string;
  password: string;
  method: string;
  /** The request target exactly as sent: path and query. */
  uri: string;
  /** Fixed in tests; random otherwise. */
  cnonce?: string;
}

/**
 * The `Authorization` value answering the first MD5 challenge offered with
 * `qop=auth`, or undefined when there is none.
 *
 * MD5 only: React Native has no WebCrypto for SHA-256, and AthenaSIP offers
 * MD5 beside it for exactly that reason. Each nonce is answered once, so the
 * nonce count is always 1; a second request gets a fresh challenge.
 */
export function authorization(
  challenges: DigestChallenge[],
  request: DigestRequest,
): string | undefined {
  const challenge = challenges.find(
    candidate => candidate.algorithm === 'MD5' && candidate.qop.includes('auth'),
  );
  if (!challenge) {
    return undefined;
  }
  const md5 = Utils.calculateMD5;
  const nc = '00000001';
  const cnonce = request.cnonce ?? randomHex(16);
  const ha1 = md5(`${request.username}:${challenge.realm}:${request.password}`);
  const ha2 = md5(`${request.method}:${request.uri}`);
  const response = md5(`${ha1}:${challenge.nonce}:${nc}:${cnonce}:auth:${ha2}`);
  const quoted = (value: string) => `"${value.replace(/[\\"]/g, '\\$&')}"`;

  return [
    `Digest username=${quoted(request.username)}`,
    `realm=${quoted(challenge.realm)}`,
    `nonce=${quoted(challenge.nonce)}`,
    `uri=${quoted(request.uri)}`,
    'algorithm=MD5',
    'qop=auth',
    `nc=${nc}`,
    `cnonce=${quoted(cnonce)}`,
    `response=${quoted(response)}`,
    ...(challenge.opaque !== undefined
      ? [`opaque=${quoted(challenge.opaque)}`]
      : []),
  ].join(', ');
}

export interface ConfigRequest {
  /** The server's API, e.g. `https://sip.example.com:8443`. */
  baseUrl: string;
  /** The SIP domain, which names the realm. */
  realm: string;
  username: string;
  password: string;
  /** Give up after this long. */
  timeoutMs?: number;
  /** For tests; the global fetch otherwise. */
  fetchImpl?: typeof fetch;
}

/** How long to wait for the server before going on without its answer. */
export const CONFIG_TIMEOUT_MS = 4000;

/**
 * Fetch the subscriber's configuration. The first request goes unsigned to
 * get a nonce, and a stale re-challenge is answered once more. A second
 * plain 401 means the credentials were refused, and it stops there rather
 * than guessing again, since the server counts wrong answers.
 */
export async function fetchClientConfig(
  request: ConfigRequest,
): Promise<ClientConfig> {
  const fetchImpl = request.fetchImpl ?? fetch;
  const url = configUrl(request.baseUrl, request.realm);
  const target = pathOf(url);
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    request.timeoutMs ?? CONFIG_TIMEOUT_MS,
  );

  try {
    const send = (signature?: string) =>
      fetchImpl(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          ...(signature ? { Authorization: signature } : {}),
        },
        signal: controller.signal,
      });

    let response = await send();
    for (
      let answered = 0;
      response.status === 401 && answered < 2;
      answered += 1
    ) {
      const challenges = parseChallenges(
        response.headers.get('WWW-Authenticate') ?? '',
      );
      if (answered > 0 && !challenges.some(challenge => challenge.stale)) {
        break;
      }
      const signature = authorization(challenges, {
        username: request.username,
        password: request.password,
        method: 'GET',
        uri: target,
      });
      if (!signature) {
        throw new Error('The server offers no Digest this phone can answer');
      }
      response = await send(signature);
    }

    if (!response.ok) {
      throw new Error(
        `The server refused the configuration request: ${response.status}`,
      );
    }
    const config = (await response.json()) as ClientConfig;
    if (!Array.isArray(config?.ice_servers)) {
      throw new Error('The server answered with no ice_servers');
    }
    return config;
  } finally {
    clearTimeout(timer);
  }
}

/** The configuration route under `baseUrl`, with the realm escaped. */
export function configUrl(baseUrl: string, realm: string): string {
  const base = baseUrl.trim().replace(/\/+$/, '').replace(/\/api\/v1$/, '');
  return `${base}/api/v1/subscriber/${encodeURIComponent(realm)}/config`;
}

/**
 * The ICE servers to hand to a peer connection: TURN entries whose minted
 * credential has expired, or that came with none, are dropped, since they
 * would only fail. `expires_at` is not an RTCIceServer field, so it goes.
 */
export function usableIceServers(
  servers: ClientConfig['ice_servers'],
  now: number = Date.now(),
): IceServerConfig[] {
  return servers
    .filter(server => {
      const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
      const turn = urls.some(url => /^turns?:/i.test(url));
      if (!turn) {
        return true;
      }
      if (!server.username || !server.credential) {
        return false;
      }
      return server.expires_at === undefined || server.expires_at * 1000 > now;
    })
    .map(({ urls, username, credential }) => ({
      urls,
      ...(username !== undefined ? { username } : {}),
      ...(credential !== undefined ? { credential } : {}),
    }));
}

function pathOf(url: string): string {
  const match = /^[a-z][a-z0-9+.-]*:\/\/[^/]+(\/[^#]*)?/i.exec(url);
  return match?.[1] || '/';
}

/** Hex from the platform's CSPRNG (polyfilled by `src/utils/id` on React Native). */
function randomHex(bytes: number): string {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  return Array.from(buffer, byte => byte.toString(16).padStart(2, '0')).join('');
}
