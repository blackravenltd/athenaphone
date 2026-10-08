//
// AthenaPhone - Open Source SIP Softphone
//
// Copyright (C) 2026 Tom Cully <mail@tomcully.com>
// Licensed under the GNU GPLv3 - see <https://www.gnu.org/licenses/gpl-3.0.html>
//

import { Buffer } from 'buffer';

import { sockets, type StreamSocket } from './sockets';

/** Longest message we will buffer before assuming the stream is desynchronised. */
const MAX_MESSAGE_BYTES = 256 * 1024;

/**
 * The `buffer` package types `subarray` as returning a plain `Uint8Array`,
 * which loses `toString(encoding)`. These keep the framing code readable
 * without casts scattered through it.
 */
function sliceBuffer(source: Buffer, start: number, end?: number): Buffer {
  return Buffer.from(source.subarray(start, end));
}

function decode(source: Buffer, start: number, end?: number): string {
  return sliceBuffer(source, start, end).toString('utf8');
}

/**
 * SIP over TCP or TLS, as a JsSIP `Socket`.
 *
 * Unlike UDP, a stream transport has no message boundaries: a single read can
 * carry half a message or three of them. RFC 3261 section 7.5 makes
 * Content-Length mandatory here for exactly that reason, and this class does
 * the framing - accumulate bytes, find the CRLFCRLF that ends the headers,
 * read Content-Length, and only surface a message once its whole body has
 * arrived.
 *
 * TLS is the same code with a different socket, because the framing problem is
 * identical once the bytes are decrypted.
 */
export class StreamTransport {
  readonly url: string;
  readonly sip_uri: string;
  via_transport: string;

  private socket?: StreamSocket;
  private buffer: Buffer = Buffer.alloc(0);
  private connected = false;
  private connecting = false;

  // Assigned by JsSIP once the transport is attached.
  onconnect: () => void = () => {};
  ondisconnect: (error: boolean, code?: number, reason?: string) => void = () => {};
  ondata: (data: string) => void = () => {};

  constructor(
    private readonly host: string,
    private readonly port: number,
    private readonly secure: boolean,
    /** PEM for a private CA. AthenaSIP ships a self-signed cert by default. */
    private readonly caPem?: string,
  ) {
    const scheme = secure ? 'tls' : 'tcp';
    this.via_transport = secure ? 'TLS' : 'TCP';
    this.url = `${scheme}://${host}:${port}`;
    this.sip_uri = `sip:${host}:${port};transport=${scheme}`;
  }

  isConnected(): boolean {
    return this.connected;
  }

  isConnecting(): boolean {
    return this.connecting;
  }

  connect(): void {
    if (this.connected || this.connecting) {
      return;
    }
    this.connecting = true;
    this.buffer = Buffer.alloc(0);

    const onReady = () => {
      this.connecting = false;
      this.connected = true;
      this.socket?.setNoDelay?.(true);
      // SIP registrations are long-lived and mostly idle; without this a NAT
      // or a load balancer quietly drops the connection between REGISTERs.
      // No initial delay: react-native-tcp-socket ignores the parameter and
      // warns on every connect if one is passed, and the OS default is fine.
      this.socket?.setKeepAlive?.(true);
      this.onconnect();
    };

    const options = { host: this.host, port: this.port, ca: this.caPem };
    const socket = this.secure
      ? sockets().connectTls(options, onReady)
      : sockets().connectStream(options, onReady);

    this.socket = socket;

    socket.on('data', data => {
      const chunk = typeof data === 'string' ? Buffer.from(data, 'binary') : data;
      this.buffer = Buffer.concat([this.buffer, chunk]);
      this.drain();
    });

    socket.on('error', error => {
      this.fail(error?.message ?? 'Stream socket error');
    });

    socket.on('close', hadError => {
      if (this.connected || this.connecting) {
        this.fail(hadError ? 'Connection closed after an error' : undefined, !hadError);
      }
    });
  }

  disconnect(): void {
    const wasUp = this.connected;
    this.connected = false;
    this.connecting = false;
    this.teardown();
    if (wasUp) {
      this.ondisconnect(false);
    }
  }

  send(message: string | ArrayBufferLike | ArrayBufferView | Blob): boolean {
    if (!this.socket || !this.connected) {
      return false;
    }
    const payload = typeof message === 'string' ? message : String(message);
    try {
      this.socket.write(Buffer.from(payload, 'utf8'));
      return true;
    } catch (error) {
      console.warn('[stream] write failed', error);
      return false;
    }
  }

  // ---------------------------------------------------------------- framing

  /** Pull every complete SIP message out of the buffer. */
  private drain(): void {
    for (;;) {
      // RFC 5626 keep-alives: CRLFCRLF is a ping (JsSIP answers it), a bare
      // CRLF is the pong. Both appear between messages, not inside one.
      if (this.startsWith('\r\n\r\n')) {
        this.buffer = sliceBuffer(this.buffer, 4);
        this.ondata('\r\n\r\n');
        continue;
      }
      if (this.startsWith('\r\n')) {
        this.buffer = sliceBuffer(this.buffer, 2);
        continue;
      }

      const headerEnd = this.buffer.indexOf('\r\n\r\n');
      if (headerEnd === -1) {
        // Headers are still arriving. Guard against a peer that never sends
        // the terminator, which would otherwise grow this buffer forever.
        if (this.buffer.length > MAX_MESSAGE_BYTES) {
          this.fail('SIP message headers exceeded the buffer limit');
        }
        return;
      }

      const headers = decode(this.buffer, 0, headerEnd);
      const contentLength = parseContentLength(headers);
      const total = headerEnd + 4 + contentLength;

      if (total > MAX_MESSAGE_BYTES) {
        this.fail(`SIP message of ${total} bytes exceeds the buffer limit`);
        return;
      }
      if (this.buffer.length < total) {
        // Body still in flight.
        return;
      }

      const message = decode(this.buffer, 0, total);
      this.buffer = sliceBuffer(this.buffer, total);
      this.ondata(message);
    }
  }

  private startsWith(prefix: string): boolean {
    return (
      this.buffer.length >= prefix.length &&
      decode(this.buffer, 0, prefix.length) === prefix
    );
  }

  private fail(reason?: string, clean = false): void {
    const wasUp = this.connected || this.connecting;
    this.connected = false;
    this.connecting = false;
    this.teardown();
    if (wasUp) {
      this.ondisconnect(!clean, undefined, reason);
    }
  }

  private teardown(): void {
    const socket = this.socket;
    this.socket = undefined;
    this.buffer = Buffer.alloc(0);
    if (!socket) {
      return;
    }
    try {
      socket.removeAllListeners();
      socket.destroy();
    } catch {
      // Already gone.
    }
  }
}

/**
 * Read Content-Length from a header block, accepting the compact form `l`.
 *
 * A stream transport requires the header, but a lenient reading of a missing
 * one as zero is better than desynchronising the stream on a peer that omits
 * it for a bodyless message.
 */
function parseContentLength(headers: string): number {
  for (const line of headers.split('\r\n')) {
    const match = /^(content-length|l)\s*:\s*(\d+)\s*$/i.exec(line);
    if (match) {
      return Number(match[2]);
    }
  }
  return 0;
}
