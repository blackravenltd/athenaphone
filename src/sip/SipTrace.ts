//
// AthenaPhone - Open Source SIP Softphone
//
// Copyright (C) 2026 Tom Cully <mail@tomcully.com>
// Licensed under the GNU GPLv3 - see <https://www.gnu.org/licenses/gpl-3.0.html>
//

/**
 * A record of the SIP messages this device actually sent and received.
 *
 * Interoperability arguments are settled by what went over the wire, not by
 * what either end believed it sent, so the capture point here is the socket
 * itself rather than anything JsSIP reports. Every transport is wrapped by
 * `traceSocket`, which sees the raw message in both directions before JsSIP
 * has parsed it and after it has serialised it. Nothing above this layer can
 * paraphrase what is recorded.
 *
 * That placement also means the trace covers UDP, TCP, TLS and WebSocket
 * without knowing which is in use -- `SipClient.createSocket` is the one
 * place a socket is built, so one wrapper there catches all five accounts.
 *
 * Two outputs, deliberately:
 *
 * - The console, for watching a call live in Metro or `adb logcat`.
 * - A ring buffer, for producing the artefact afterwards via `dump()` or
 *   `sdpExchanges()`. Live console output scrolls away and interleaves with
 *   everything else the app prints; a buffer can be read back whole.
 */

/** Which way a message travelled, from this device's point of view. */
export type SipTraceDirection = 'sent' | 'received';

export interface SipTraceEntry {
  /** Wall clock, ISO 8601 with milliseconds. */
  at: string;
  /** Milliseconds since the first message in the buffer, for reading latency. */
  offsetMs: number;
  direction: SipTraceDirection;
  /** 'UDP' | 'TCP' | 'TLS' | 'WS', as the transport reports itself. */
  transport: string;
  /** Request line or status line, e.g. "INVITE sip:1001@..." or "SIP/2.0 200 OK". */
  summary: string;
  /** CSeq method, so a response can be tied to what it answers. */
  method?: string;
  callId?: string;
  /** Byte length on the wire, which is what fragments, not character count. */
  bytes: number;
  /** The whole message, headers and body, credentials redacted. */
  raw: string;
}

/**
 * An SDP body lifted out of a captured message.
 *
 * "Offered and answered SDP for each direction" is the question a profile
 * gets built from, and answering it from a raw trace by hand means reading
 * past several hundred lines of REGISTER traffic. This pulls out just the
 * bodies, tagged with enough context to say which is which.
 */
export interface SipSdpExchange {
  at: string;
  direction: SipTraceDirection;
  /** The message that carried it, e.g. "INVITE" or "SIP/2.0 200 OK". */
  carriedBy: string;
  /** CSeq method the body belongs to. */
  method?: string;
  callId?: string;
  /**
   * Offer/answer role under RFC 3264, as far as it can be told from one
   * message. A body in a request is an offer; a body in a 2xx to a request
   * that carried one is the answer. Where the request had no body the 2xx is
   * itself the offer, which this cannot see in isolation -- so treat this as
   * a label for reading, and the raw trace as the record.
   */
  role: 'offer' | 'answer';
  sdp: string;
}

/** Messages kept before the oldest is dropped. A REGISTER cycle is ~4. */
const MAX_ENTRIES = 500;

/**
 * Digest `response=` is credential material derived from the password. It is
 * not the password, but it is enough to replay a challenge, and these traces
 * get pasted into issues and handed to other people. Redacted by default;
 * `setRedactCredentials(false)` restores it for the rare case where the
 * digest computation itself is what is being debugged.
 */
const DIGEST_RESPONSE = /(\bresponse=)"[^"]*"/gi;

class SipTrace {
  private enabled = false;
  private redactCredentials = true;
  private entries: SipTraceEntry[] = [];
  private firstAt?: number;

  /**
   * Turn capture on or off. Off is the default and costs nothing: the socket
   * wrapper stays in place but does no work, so this can be toggled mid-call
   * without rebuilding the transport.
   */
  setEnabled(on: boolean): void {
    if (on === this.enabled) {
      return;
    }
    this.enabled = on;
    console.log(`[sip] trace ${on ? 'ON' : 'off'}`);
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  /** See `DIGEST_RESPONSE`. Leave this alone unless debugging digest auth. */
  setRedactCredentials(on: boolean): void {
    this.redactCredentials = on;
  }

  clear(): void {
    this.entries = [];
    this.firstAt = undefined;
  }

  all(): SipTraceEntry[] {
    return [...this.entries];
  }

  /**
   * Wrap a JsSIP socket so every message through it is recorded.
   *
   * A Proxy rather than a subclass because the `Socket` contract is part
   * property and part callback: JsSIP reads `url`, `sip_uri` and
   * `via_transport`, calls `connect`/`disconnect`/`send`, and *assigns*
   * `ondata`, `onconnect` and `ondisconnect` after construction. Outbound is
   * intercepted on the way in to `send`; inbound has to be caught by trapping
   * the assignment of `ondata` and substituting a handler that records before
   * delegating. Subclassing cannot see that assignment.
   */
  traceSocket<T extends object>(socket: T, transport: string): T {
    return new Proxy(socket, {
      get: (target, prop, receiver) => {
        if (prop === 'send') {
          return (message: unknown) => {
            const payload =
              typeof message === 'string' ? message : String(message);
            this.record('sent', transport, payload);
            return (target as Record<string, (m: unknown) => boolean>).send(
              message,
            );
          };
        }

        const value = Reflect.get(target, prop, receiver);
        // Bind so `this` inside the transport stays the transport and not
        // the proxy; the transports keep their sockets on instance fields.
        return typeof value === 'function' ? value.bind(target) : value;
      },

      set: (target, prop, value) => {
        if (prop === 'ondata' && typeof value === 'function') {
          const handler = value as (data: string) => void;
          (target as Record<string, unknown>).ondata = (data: string) => {
            this.record('received', transport, data);
            handler(data);
          };
          return true;
        }
        return Reflect.set(target, prop, value);
      },
    });
  }

  /**
   * Follow a call's peer connection: every ICE, DTLS and connection state
   * change, and a stats line every two seconds while it is up.
   *
   * The SIP trace says what was negotiated; it cannot say whether media then
   * flowed. "Answered, and silent" is a complete success as far as signalling
   * can tell, so without this the device has no view of which layer stalled:
   * ICE never connecting, DTLS never finishing, or packets leaving and
   * nothing coming back.
   */
  watchPeerConnection(peerconnection: unknown, callId: string): void {
    if (!this.enabled) {
      return;
    }
    const pc = peerconnection as WatchedPeerConnection;
    const tag = `[media] ${callId.slice(0, 8)}`;
    const states = () =>
      `ice=${pc.iceConnectionState} conn=${pc.connectionState} ` +
      `sig=${pc.signalingState} gather=${pc.iceGatheringState}`;

    console.log(`${tag} watching  ${states()}`);
    for (const event of [
      'iceconnectionstatechange',
      'connectionstatechange',
      'signalingstatechange',
      'icegatheringstatechange',
    ]) {
      pc.addEventListener(event, () => console.log(`${tag} ${event}  ${states()}`));
    }

    const timer = setInterval(() => {
      if (pc.signalingState === 'closed' || !this.enabled) {
        clearInterval(timer);
        return;
      }
      pc.getStats()
        .then(report => console.log(`${tag} ${summariseStats(report)}`))
        .catch(() => clearInterval(timer));
    }, 2000);
  }

  private record(
    direction: SipTraceDirection,
    transport: string,
    rawIn: string,
  ): void {
    if (!this.enabled) {
      return;
    }

    const raw = this.redactCredentials
      ? rawIn.replace(DIGEST_RESPONSE, '$1"<redacted>"')
      : rawIn;

    const now = Date.now();
    this.firstAt ??= now;

    // A datagram with only CRLFs is a NAT keep-alive, not a message. Worth
    // seeing that it happened, but not worth four lines of the buffer.
    const isKeepAlive = raw.trim().length === 0;

    const entry: SipTraceEntry = {
      at: new Date(now).toISOString(),
      offsetMs: now - this.firstAt,
      direction,
      transport,
      summary: isKeepAlive ? '(CRLF keep-alive)' : firstLine(raw),
      method: headerValue(raw, 'cseq')?.split(/\s+/)[1],
      callId: headerValue(raw, 'call-id'),
      bytes: byteLength(raw),
      raw,
    };

    this.entries.push(entry);
    if (this.entries.length > MAX_ENTRIES) {
      this.entries.shift();
    }

    const arrow = direction === 'sent' ? '-->' : '<--';
    if (isKeepAlive) {
      console.log(`[sip] ${arrow} ${transport} keep-alive`);
      return;
    }
    console.log(
      `[sip] ${arrow} ${transport} ${entry.bytes}B  ${entry.summary}`,
    );
    logChunked(indent(raw));
  }

  /**
   * Every SDP body seen, in order. This is the answer to "what did each end
   * offer and what did it agree to".
   */
  sdpExchanges(): SipSdpExchange[] {
    const out: SipSdpExchange[] = [];
    for (const entry of this.entries) {
      const sdp = sdpBody(entry.raw);
      if (!sdp) {
        continue;
      }
      out.push({
        at: entry.at,
        direction: entry.direction,
        carriedBy: entry.summary,
        method: entry.method,
        callId: entry.callId,
        role: entry.summary.startsWith('SIP/2.0') ? 'answer' : 'offer',
        sdp,
      });
    }
    return out;
  }

  /** The whole capture as text, for writing to a file or pasting into a report. */
  dump(): string {
    if (this.entries.length === 0) {
      return 'No SIP messages captured. Is "Verbose SIP logging" on?';
    }
    const lines = this.entries.map(entry => {
      const arrow = entry.direction === 'sent' ? '-->' : '<--';
      return (
        `=== +${entry.offsetMs}ms ${entry.at} ${arrow} ${entry.transport} ` +
        `${entry.bytes} bytes ===\n${entry.raw}`
      );
    });
    return lines.join('\n');
  }

  /** Just the SDP, as text. The narrower artefact, when the trace is too much. */
  dumpSdp(): string {
    const exchanges = this.sdpExchanges();
    if (exchanges.length === 0) {
      return 'No SDP captured.';
    }
    return exchanges
      .map(
        exchange =>
          `=== ${exchange.at} ${exchange.direction} ${exchange.role} ` +
          `(${exchange.carriedBy}) call-id ${exchange.callId ?? '?'} ===\n` +
          exchange.sdp,
      )
      .join('\n\n');
  }
}

// ------------------------------------------------------------------ helpers

/** The slice of RTCPeerConnection the media watch needs. */
interface WatchedPeerConnection {
  iceConnectionState: string;
  connectionState: string;
  signalingState: string;
  iceGatheringState: string;
  addEventListener: (type: string, listener: () => void) => void;
  getStats: () => Promise<{
    forEach: (fn: (stat: Record<string, unknown>) => void) => void;
  }>;
}

/**
 * One line answering the three questions that matter for a silent call: did
 * DTLS finish, which candidate pair is in use, and are packets moving in each
 * direction.
 */
function summariseStats(report: {
  forEach: (fn: (stat: Record<string, unknown>) => void) => void;
}): string {
  const byId = new Map<string, Record<string, unknown>>();
  report.forEach(stat => byId.set(String(stat.id), stat));

  let dtls = '?';
  let pair = 'none';
  let sent = 0;
  let received = 0;
  // Received audio energy is what separates "silence was sent" from "sound
  // arrived and was not played": it only climbs when the decoded samples do.
  let level = 0;
  let energy = 0;
  let sentEnergy = 0;
  byId.forEach(stat => {
    if (stat.type === 'transport') {
      dtls = String(stat.dtlsState ?? '?');
      const selected = byId.get(String(stat.selectedCandidatePairId));
      if (selected) {
        const local = byId.get(String(selected.localCandidateId));
        const remote = byId.get(String(selected.remoteCandidateId));
        const show = (c?: Record<string, unknown>) =>
          c ? `${c.address ?? c.ip}:${c.port}/${c.candidateType}` : '?';
        pair = `${show(local)} <> ${show(remote)} (${selected.state})`;
      }
    } else if (stat.type === 'outbound-rtp') {
      sent += Number(stat.packetsSent ?? 0);
    } else if (stat.type === 'inbound-rtp') {
      received += Number(stat.packetsReceived ?? 0);
      level = Number(stat.audioLevel ?? 0);
      energy = Number(stat.totalAudioEnergy ?? 0);
    } else if (stat.type === 'media-source' && stat.kind === 'audio') {
      sentEnergy = Number(stat.totalAudioEnergy ?? 0);
    }
  });
  return (
    `dtls=${dtls} pair=${pair} rtp sent=${sent} recv=${received} ` +
    `recvLevel=${level.toFixed(3)} recvEnergy=${energy.toFixed(3)} ` +
    `micEnergy=${sentEnergy.toFixed(3)}`
  );
}

function firstLine(message: string): string {
  const end = message.indexOf('\r\n');
  return (end === -1 ? message : message.slice(0, end)).trim();
}

/**
 * Read a header, case-insensitively and from the headers only.
 *
 * Deliberately does not search the body: an SDP `o=` line or a session name
 * can contain anything, including something that looks like a header.
 */
function headerValue(message: string, name: string): string | undefined {
  const headers = message.split('\r\n\r\n')[0] ?? '';
  const wanted = name.toLowerCase();
  for (const line of headers.split('\r\n').slice(1)) {
    const colon = line.indexOf(':');
    if (colon === -1) {
      continue;
    }
    if (line.slice(0, colon).trim().toLowerCase() === wanted) {
      return line.slice(colon + 1).trim();
    }
  }
  return undefined;
}

/** The SDP body, or undefined when the message does not carry one. */
function sdpBody(message: string): string | undefined {
  const split = message.indexOf('\r\n\r\n');
  if (split === -1) {
    return undefined;
  }
  const contentType = headerValue(message, 'content-type') ?? '';
  if (!contentType.toLowerCase().includes('application/sdp')) {
    return undefined;
  }
  const body = message.slice(split + 4);
  return body.length > 0 ? body : undefined;
}

/**
 * Length in bytes, not characters.
 *
 * This is the number that decides whether a datagram fragments, and a display
 * name or SDP session name outside ASCII makes the two differ.
 */
function byteLength(message: string): number {
  let bytes = 0;
  for (const char of message) {
    const code = char.codePointAt(0) ?? 0;
    bytes +=
      code <= 0x7f ? 1 : code <= 0x7ff ? 2 : code <= 0xffff ? 3 : 4;
  }
  return bytes;
}

/**
 * Android's logcat drops a log record over roughly 4 kB, and it truncates
 * silently -- the line simply ends. A WebRTC INVITE carrying video SDP and
 * ICE candidates is comfortably past that, so printing a message as one call
 * would lose exactly the part of the capture worth having. Split it well
 * under the limit and number the pieces so they can be reassembled and a
 * missing one is obvious.
 */
const LOG_CHUNK = 2500;

function logChunked(text: string): void {
  if (text.length <= LOG_CHUNK) {
    console.log(text);
    return;
  }
  const total = Math.ceil(text.length / LOG_CHUNK);
  for (let i = 0; i < total; i++) {
    console.log(
      `[sip] (part ${i + 1}/${total})\n${text.slice(i * LOG_CHUNK, (i + 1) * LOG_CHUNK)}`,
    );
  }
}

function indent(message: string): string {
  return message
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map(line => `    ${line}`)
    .join('\n')
    .trimEnd();
}

export const sipTrace = new SipTrace();
