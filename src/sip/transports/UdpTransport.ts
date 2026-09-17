import { Buffer } from 'buffer';
import dgram from 'react-native-udp';

/**
 * The part of react-native-udp's socket we use.
 *
 * Its `UdpSocket` extends Node's `EventEmitter`, whose types we deliberately
 * do not pull in, so the emitter methods come back untyped. This names just
 * the surface this transport touches.
 */
interface DatagramSocket {
  on(event: 'message', listener: (msg: Buffer) => void): void;
  on(event: 'error', listener: (error: Error) => void): void;
  bind(port: number, callback: () => void): void;
  send(
    buffer: Buffer,
    offset: number,
    length: number,
    port: number,
    address: string,
    callback: (error?: Error) => void,
  ): void;
  removeAllListeners(): void;
  close(): void;
}

/**
 * SIP over UDP, as a JsSIP `Socket`.
 *
 * JsSIP only *ships* a WebSocket implementation; it does not require one. Its
 * transport layer talks to anything exposing `url`, `via_transport`,
 * `sip_uri`, `connect`/`disconnect`/`send`, and the `onconnect`,
 * `ondisconnect` and `ondata` callbacks. That is the whole contract, and a
 * datagram socket satisfies it -- which is what lets AthenaPhone reach the
 * ordinary UDP SIP servers that nearly every trunk provider runs, rather than
 * only the WebSocket listeners that a minority expose.
 *
 * UDP is a natural fit for the interface: one datagram is exactly one SIP
 * message, so there is no framing to do. (TCP is not -- it needs
 * Content-Length parsing to find message boundaries. See TcpTransport.)
 *
 * Caveats worth knowing:
 *
 * - UDP is connectionless, so "connected" here means "the socket is bound".
 *   A dead server is indistinguishable from a silent one until a request
 *   times out, which JsSIP's transaction layer handles.
 * - Datagrams over about 1300 bytes risk fragmentation. A large INVITE with
 *   video SDP can approach that. RFC 3261 says to switch to TCP at the MTU
 *   limit; we do not yet, and `send` warns instead.
 * - Behind NAT the Via and Contact carry this device's private address. We
 *   set `rport` so the server replies to the address it actually saw, which
 *   is what makes this work from a phone at all.
 */
export class UdpTransport {
  /** JsSIP reads these three; `sip_uri` must parse as a SIP URI. */
  readonly url: string;
  readonly sip_uri: string;
  via_transport = 'UDP';

  private socket?: DatagramSocket;
  private bound = false;
  private binding = false;

  // Assigned by JsSIP once the transport is attached.
  onconnect: () => void = () => {};
  ondisconnect: (error: boolean, code?: number, reason?: string) => void = () => {};
  ondata: (data: string) => void = () => {};

  constructor(
    private readonly host: string,
    private readonly port: number = 5060,
  ) {
    this.url = `udp://${host}:${port}`;
    this.sip_uri = `sip:${host}:${port};transport=udp`;
  }

  isConnected(): boolean {
    return this.bound;
  }

  isConnecting(): boolean {
    return this.binding;
  }

  connect(): void {
    if (this.bound || this.binding) {
      return;
    }
    this.binding = true;

    const socket = dgram.createSocket({ type: 'udp4' }) as unknown as DatagramSocket;
    this.socket = socket;

    socket.on('message', msg => {
      // One datagram is one SIP message.
      this.ondata(msg.toString('utf8'));
    });

    socket.on('error', error => {
      this.binding = false;
      const wasBound = this.bound;
      this.bound = false;
      this.teardown();
      // Only report a disconnect if we had reported a connect, or JsSIP will
      // fault a transport it never saw come up.
      if (wasBound) {
        this.ondisconnect(true, undefined, error?.message ?? 'UDP socket error');
      } else {
        this.ondisconnect(true, undefined, `Could not bind UDP socket: ${error?.message}`);
      }
    });

    // Port 0: let the OS choose. Binding a fixed local port would collide
    // with any other SIP client on the device.
    socket.bind(0, () => {
      this.binding = false;
      this.bound = true;
      this.onconnect();
    });
  }

  disconnect(): void {
    const wasBound = this.bound;
    this.bound = false;
    this.binding = false;
    this.teardown();
    if (wasBound) {
      this.ondisconnect(false);
    }
  }

  send(message: string | ArrayBufferLike | ArrayBufferView | Blob): boolean {
    const socket = this.socket;
    if (!socket || !this.bound) {
      return false;
    }

    const payload =
      typeof message === 'string' ? message : String(message);
    const buffer = Buffer.from(payload, 'utf8');

    if (buffer.length > 1300) {
      // RFC 3261 section 18.1.1 says to use a congestion-controlled transport
      // here. We cannot yet, so at least make the cause findable.
      console.warn(
        `[udp] SIP message is ${buffer.length} bytes and may fragment. ` +
          'Consider TCP or TLS for this account.',
      );
    }

    socket.send(buffer, 0, buffer.length, this.port, this.host, error => {
      if (error) {
        console.warn('[udp] send failed', error);
      }
    });
    return true;
  }

  private teardown(): void {
    const socket = this.socket;
    this.socket = undefined;
    if (!socket) {
      return;
    }
    try {
      socket.removeAllListeners();
      socket.close();
    } catch {
      // Already closed; nothing to unwind.
    }
  }
}
