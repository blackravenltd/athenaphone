//
// AthenaPhone - Open Source SIP Softphone
//
// Copyright (C) 2026 Tom Cully <mail@tomcully.com>
// Licensed under the GNU GPLv3 - see <https://www.gnu.org/licenses/gpl-3.0.html>
//

import dgram from 'node:dgram';
import net from 'node:net';
import tls from 'node:tls';

import type {
  DatagramSocket,
  SocketFactories,
  StreamSocket,
} from '../../src/sip/transports/sockets';

/**
 * Node-backed sockets for the integration harness.
 *
 * These stand in for react-native-udp and react-native-tcp-socket so the real
 * `SipClient` -- the same JsSIP configuration, the same transports, the same
 * framing -- can talk to a real SIP server from a test process. No device, no
 * emulator, no Metro.
 *
 * The shapes deliberately match the React Native modules rather than Node's
 * idiom, because the transports are written against the former. Where they
 * differ, the adaptation happens here and not in the transport, so the code
 * under test is the code that ships.
 */
export const nodeSockets: SocketFactories = {
  createDatagram(): DatagramSocket {
    const socket = dgram.createSocket('udp4');

    return {
      on(event: string, listener: (arg: never) => void) {
        socket.on(event, listener as (...args: unknown[]) => void);
      },
      // react-native-udp calls back on bind; Node signals it with 'listening'.
      bind(port: number, callback: () => void) {
        socket.bind(port, callback);
      },
      send(buffer, offset, length, port, address, callback) {
        // Node reports "no error" as null, react-native-udp as undefined.
        socket.send(buffer, offset, length, port, address, error =>
          callback(error ?? undefined),
        );
      },
      removeAllListeners() {
        socket.removeAllListeners();
      },
      close() {
        socket.close();
      },
    } as DatagramSocket;
  },

  connectStream({ host, port }, onReady): StreamSocket {
    const socket = net.createConnection({ host, port }, onReady);
    return wrapStream(socket);
  },

  connectTls({ host, port, ca }, onReady): StreamSocket {
    // RFC 6066 forbids an IP address in SNI, and Node warns about it. The
    // certificate still verifies: the fixture's carries the address as an IP
    // SAN, which is what verification checks.
    const isIpAddress = net.isIP(host) !== 0;

    const socket = tls.connect(
      {
        host,
        port,
        ...(ca ? { ca } : {}),
        ...(isIpAddress ? {} : { servername: host }),
      },
      onReady,
    );
    return wrapStream(socket);
  },
};

function wrapStream(socket: net.Socket): StreamSocket {
  return {
    on(event: string, listener: (arg: never) => void) {
      socket.on(event, listener as (...args: unknown[]) => void);
    },
    write(data) {
      return socket.write(data);
    },
    destroy() {
      socket.destroy();
    },
    removeAllListeners() {
      socket.removeAllListeners();
    },
    setKeepAlive(enable, initialDelay) {
      socket.setKeepAlive(enable, initialDelay);
    },
    setNoDelay(noDelay) {
      socket.setNoDelay(noDelay);
    },
  } as StreamSocket;
}
