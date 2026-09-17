//
// AthenaPhone - Open Source SIP Softphone
//
// Copyright (C) 2026 Tom Cully <mail@tomcully.com>
// Licensed under the GNU GPLv3 - see <https://www.gnu.org/licenses/gpl-3.0.html>
//

import { Buffer } from 'buffer';
import dgram from 'react-native-udp';
import TcpSocket from 'react-native-tcp-socket';

/**
 * The socket surface the SIP transports need, and where it comes from.
 *
 * React Native's UDP and TCP modules cannot run outside an app, which would
 * normally mean the SIP layer can only be exercised on a device. It is
 * otherwise plain JavaScript, though, so the sockets are injected rather than
 * imported directly by the transports: the app installs the React Native
 * implementations, and the integration harness installs Node's `dgram`, `net`
 * and `tls` instead.
 *
 * That is what lets registration, authentication and message framing be tested
 * against a real SIP server with no device, no emulator and no Metro.
 */

/** Both libraries extend Node's untyped EventEmitter, so name what we use. */
export interface DatagramSocket {
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

export interface StreamSocket {
  on(event: 'data', listener: (data: Buffer | string) => void): void;
  on(event: 'error', listener: (error: Error) => void): void;
  on(event: 'close', listener: (hadError: boolean) => void): void;
  write(data: string | Buffer): boolean;
  destroy(): void;
  removeAllListeners(): void;
  setKeepAlive?(enable: boolean, initialDelay?: number): void;
  setNoDelay?(noDelay: boolean): void;
}

export interface StreamOptions {
  host: string;
  port: number;
  /** PEM for a private CA, for TLS against a self-signed certificate. */
  ca?: string;
}

export interface SocketFactories {
  createDatagram(): DatagramSocket;
  connectStream(options: StreamOptions, onReady: () => void): StreamSocket;
  connectTls(options: StreamOptions, onReady: () => void): StreamSocket;
}

/** The React Native implementations, used by the app. */
export const reactNativeSockets: SocketFactories = {
  createDatagram() {
    return dgram.createSocket({ type: 'udp4' }) as unknown as DatagramSocket;
  },

  connectStream({ host, port }, onReady) {
    return TcpSocket.createConnection({ host, port }, onReady) as unknown as StreamSocket;
  },

  connectTls({ host, port, ca }, onReady) {
    return TcpSocket.connectTLS(
      { host, port, ...(ca ? { ca } : {}) },
      onReady,
    ) as unknown as StreamSocket;
  },
};

let installed: SocketFactories = reactNativeSockets;

/**
 * Swap the socket implementation. The integration harness calls this with
 * Node-backed sockets before building a `SipClient`.
 */
export function setSocketFactories(factories: SocketFactories): void {
  installed = factories;
}

/** Restore the React Native sockets, so one test cannot leak into the next. */
export function resetSocketFactories(): void {
  installed = reactNativeSockets;
}

export function sockets(): SocketFactories {
  return installed;
}
