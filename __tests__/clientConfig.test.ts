//
// AthenaPhone - Open Source SIP Softphone
//
// Copyright (C) 2026 Tom Cully <mail@tomcully.com>
// Licensed under the GNU GPLv3 - see <https://www.gnu.org/licenses/gpl-3.0.html>
//

import {
  authorization,
  configUrl,
  fetchClientConfig,
  parseChallenges,
  usableIceServers,
} from '../src/sip/ClientConfig';

// AthenaSIP's challenge, as fetch joins its two WWW-Authenticate headers.
const CHALLENGE =
  'Digest realm="10.35.1.123", qop="auth", algorithm=SHA-256, nonce="n1", ' +
  'Digest realm="10.35.1.123", qop="auth", algorithm=MD5, nonce="n1"';

describe('parseChallenges', () => {
  it('reads both of a comma-joined pair', () => {
    expect(parseChallenges(CHALLENGE)).toEqual([
      {
        realm: '10.35.1.123',
        nonce: 'n1',
        algorithm: 'SHA-256',
        qop: ['auth'],
        stale: false,
      },
      {
        realm: '10.35.1.123',
        nonce: 'n1',
        algorithm: 'MD5',
        qop: ['auth'],
        stale: false,
      },
    ]);
  });

  it('reads stale, opaque and quoted escapes, and skips other schemes', () => {
    expect(
      parseChallenges(
        'Basic realm="x", Digest realm="a\\"b", nonce="n", opaque="o", stale=TRUE',
      ),
    ).toEqual([
      {
        realm: 'a"b',
        nonce: 'n',
        algorithm: 'MD5',
        qop: [],
        opaque: 'o',
        stale: true,
      },
    ]);
  });
});

describe('authorization', () => {
  it('answers RFC 7616 3.9.1 with its published MD5 response', () => {
    const value = authorization(
      [
        {
          realm: 'http-auth@example.org',
          nonce: '7ypf/xlj9XXwfDPEoM4URrv/xwf94BcCAzFZH4GiTo0v',
          algorithm: 'MD5',
          qop: ['auth', 'auth-int'],
          opaque: 'FQhe/qaU925kfnzjCev0ciny7QMkPqMAFRtzCUYo5tdS',
          stale: false,
        },
      ],
      {
        username: 'Mufasa',
        password: 'Circle of Life',
        method: 'GET',
        uri: '/dir/index.html',
        cnonce: 'f2/wE4q74E6zIJEtWaHKaf5wv/H5QzzpXusqGemxURZJ',
      },
    );
    expect(value).toContain('response="8ca523f5e9506fed4657c9700eebdbec"');
    expect(value).toContain('nc=00000001');
    expect(value).toContain('qop=auth');
    expect(value).toContain('uri="/dir/index.html"');
    expect(value).toContain(
      'opaque="FQhe/qaU925kfnzjCev0ciny7QMkPqMAFRtzCUYo5tdS"',
    );
  });

  it('picks MD5 when SHA-256 is offered first', () => {
    const value = authorization(parseChallenges(CHALLENGE), {
      username: '1001',
      password: 'athenaphone',
      method: 'GET',
      uri: '/api/v1/subscriber/10.35.1.123/config',
    });
    expect(value).toContain('algorithm=MD5');
  });

  it('declines a challenge without qop=auth', () => {
    expect(
      authorization(parseChallenges('Digest realm="r", nonce="n"'), {
        username: 'u',
        password: 'p',
        method: 'GET',
        uri: '/',
      }),
    ).toBeUndefined();
  });
});

describe('configUrl', () => {
  it('builds the route from a base with or without /api/v1', () => {
    expect(configUrl('https://sip.example.com:8443/', 'example.com')).toBe(
      'https://sip.example.com:8443/api/v1/subscriber/example.com/config',
    );
    expect(configUrl('http://10.35.1.123:8080/api/v1', '10.35.1.123')).toBe(
      'http://10.35.1.123:8080/api/v1/subscriber/10.35.1.123/config',
    );
  });
});

type Reply = { status: number; challenge?: string; body?: unknown };

function fakeFetch(replies: Reply[]) {
  const sent: { url: string; authorization?: string }[] = [];
  const impl = jest.fn(async (url: string, init: RequestInit) => {
    const headers = (init.headers ?? {}) as Record<string, string>;
    sent.push({ url, authorization: headers.Authorization });
    const reply = replies.shift();
    if (!reply) {
      throw new Error('no more replies');
    }
    return {
      status: reply.status,
      ok: reply.status >= 200 && reply.status < 300,
      headers: {
        get: (name: string) =>
          name.toLowerCase() === 'www-authenticate'
            ? reply.challenge ?? null
            : null,
      },
      json: async () => reply.body,
    };
  });
  return { impl: impl as unknown as typeof fetch, sent };
}

const CONFIG = {
  ice_servers: [{ urls: 'stun:10.35.1.123:3478' }],
  realm: { name: '10.35.1.123', registration: { expires: 3600, minimum: 0 } },
};

const request = {
  baseUrl: 'http://10.35.1.123:8080',
  realm: '10.35.1.123',
  username: '1001',
  password: 'athenaphone',
};

describe('fetchClientConfig', () => {
  it('signs the request after the challenge and returns the configuration', async () => {
    const { impl, sent } = fakeFetch([
      { status: 401, challenge: CHALLENGE },
      { status: 200, body: CONFIG },
    ]);
    await expect(
      fetchClientConfig({ ...request, fetchImpl: impl }),
    ).resolves.toEqual(CONFIG);
    expect(sent[0].authorization).toBeUndefined();
    expect(sent[1].authorization).toContain(
      'uri="/api/v1/subscriber/10.35.1.123/config"',
    );
    expect(sent[1].authorization).toContain('username="1001"');
  });

  it('answers a stale re-challenge once more', async () => {
    const { impl, sent } = fakeFetch([
      { status: 401, challenge: CHALLENGE },
      { status: 401, challenge: CHALLENGE.replace(/nonce="n1"/g, 'nonce="n2", stale=true') },
      { status: 200, body: CONFIG },
    ]);
    await expect(
      fetchClientConfig({ ...request, fetchImpl: impl }),
    ).resolves.toEqual(CONFIG);
    expect(sent[2].authorization).toContain('nonce="n2"');
  });

  it('stops after a plain second 401 rather than guessing again', async () => {
    const { impl, sent } = fakeFetch([
      { status: 401, challenge: CHALLENGE },
      { status: 401, challenge: CHALLENGE },
    ]);
    await expect(
      fetchClientConfig({ ...request, fetchImpl: impl }),
    ).rejects.toThrow('401');
    expect(sent).toHaveLength(2);
  });

  it('rejects an answer with no ice_servers', async () => {
    const { impl } = fakeFetch([{ status: 200, body: {} }]);
    await expect(
      fetchClientConfig({ ...request, fetchImpl: impl }),
    ).rejects.toThrow('ice_servers');
  });
});

describe('usableIceServers', () => {
  const NOW = 1_700_000_000_000;

  it('keeps STUN and live TURN, drops expired or uncredentialled TURN', () => {
    expect(
      usableIceServers(
        [
          { urls: 'stun:a:3478' },
          {
            urls: 'turn:a:3478?transport=udp',
            username: '1700000600:1001_r',
            credential: 'c',
            expires_at: NOW / 1000 + 600,
          },
          {
            urls: 'turn:a:3478?transport=tcp',
            username: '1699999000:1001_r',
            credential: 'c',
            expires_at: NOW / 1000 - 1,
          },
          { urls: 'turns:a:5349' },
        ],
        NOW,
      ),
    ).toEqual([
      { urls: 'stun:a:3478' },
      {
        urls: 'turn:a:3478?transport=udp',
        username: '1700000600:1001_r',
        credential: 'c',
      },
    ]);
  });
});
