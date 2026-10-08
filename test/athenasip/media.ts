//
// AthenaPhone - Open Source SIP Softphone
//
// Copyright (C) 2026 Tom Cully <mail@tomcully.com>
// Licensed under the GNU GPLv3 - see <https://www.gnu.org/licenses/gpl-3.0.html>
//

import {
  CipherContext,
  HashAlgorithm,
  MediaStream,
  MediaStreamTrack,
  NamedCurveAlgorithm,
  RTCCertificate,
  RTCPeerConnection as WeriftPeerConnection,
  RtpHeader,
  RtpPacket,
  SignatureAlgorithm,
} from 'werift';

/**
 * WebRTC for the app's SIP stack under Node, so calls can be tested without
 * a phone.
 *
 * On the device, JsSIP finds `RTCPeerConnection` as a global installed by
 * react-native-webrtc, and the app captures the microphone through
 * react-native-webrtc's `getUserMedia`. Here werift - a WebRTC stack in
 * TypeScript - stands in for the first, and a fake microphone that sends
 * RTP stands in for the second. Everything above that is the shipping code.
 *
 * What it cannot stand in for: RFC 4733 DTMF, which needs an RTCDTMFSender
 * werift lacks, and audio quality, since the payload is not real audio.
 */

/**
 * Certificates for the peer connections still to be made. werift otherwise
 * creates one per process and gives it to every connection, so both ends of
 * a call would present the same fingerprint - which no real pair of phones
 * does, and which a media relay in the middle may not expect.
 */
const certificates: RTCCertificate[] = [];

/** Generate `count` DTLS certificates ahead of the calls that need them. */
export async function prepareCertificates(count: number): Promise<void> {
  for (let i = 0; i < count; i += 1) {
    const { certPem, keyPem, signatureHash } =
      await CipherContext.createSelfSignedCertificateWithKey(
        {
          signature: SignatureAlgorithm.ecdsa_3,
          hash: HashAlgorithm.sha256_4,
        },
        NamedCurveAlgorithm.secp256r1_23,
      );
    certificates.push(new RTCCertificate(keyPem, certPem, signatureHash));
  }
}

/** Packets each peer connection has received, per media kind. */
const received = new WeakMap<object, { audio: number; video: number }>();

class TestPeerConnection extends WeriftPeerConnection {
  constructor(config?: { iceServers?: unknown[] }) {
    super({
      // The node is on this machine or the LAN; STUN would only add delay.
      iceServers: [],
      // Loopback and IPv6 candidates only lengthen gathering on a laptop.
      iceUseIpv4: true,
      iceUseIpv6: false,
      ...(config as object),
      ...(certificates.length > 0
        ? { certificates: [certificates.shift()!], dtls: {} }
        : {}),
    });
    // Answer as the DTLS server. As client, werift's handshake towards
    // rtpengine stalls whenever its first ClientHello arrives before the
    // answer has reached rtpengine through the node - every run without
    // debug logging, almost none with it. As server it waits for rtpengine's
    // ClientHello, which rtpengine retransmits until answered; the caller's
    // leg already works this way. Both are legal answers to actpass.
    const setLocal = this.setLocalDescription.bind(this);
    this.setLocalDescription = ((description?: {
      type?: string;
      sdp?: string;
    }) =>
      setLocal(
        (description?.type === 'answer'
          ? {
              ...description,
              sdp: (description.sdp ?? '').replace(
                /^a=setup:active$/gm,
                'a=setup:passive',
              ),
            }
          : description) as never,
      )) as typeof this.setLocalDescription;
    const setRemote = this.setRemoteDescription.bind(this);
    this.setRemoteDescription = description =>
      setRemote({
        ...description,
        sdp: fillRtcpAddress(description.sdp ?? ''),
      });
    const counts = { audio: 0, video: 0 };
    received.set(this, counts);
    this.onTrack.subscribe(track => {
      track.onReceiveRtp.subscribe(() => {
        counts[track.kind as 'audio' | 'video'] += 1;
      });
    });
  }
}

/**
 * werift requires an address on `a=rtcp`, which RFC 3605 makes optional and
 * rtpengine leaves out (`a=rtcp:22001`); it throws rather than parse it.
 * Browsers and the phone's libwebrtc accept it. Fill in the connection
 * address so the test stack reads what the real one does.
 */
export function fillRtcpAddress(sdp: string): string {
  let address = sdp.match(/^c=IN (IP[46]) (\S+)/m);
  return sdp
    .split(/\r?\n/)
    .map(line => {
      const connection = line.match(/^c=IN (IP[46]) (\S+)/);
      if (connection) {
        address = connection;
      }
      return /^a=rtcp:\d+$/.test(line) && address
        ? `${line} IN ${address[1]} ${address[2]}`
        : line;
    })
    .join('\r\n');
}

/**
 * The browser's `RTCSessionDescription` takes `{ type, sdp }`; werift's takes
 * `(sdp, type)`. JsSIP uses the browser form.
 */
class SessionDescription {
  type: string;
  sdp: string;
  constructor(init: { type: string; sdp: string }) {
    this.type = init.type;
    this.sdp = init.sdp;
  }
}

/** Make werift the WebRTC that JsSIP finds. Call once, before any call. */
export function installWebRtc(): void {
  const scope = globalThis as Record<string, unknown>;
  scope.RTCPeerConnection = TestPeerConnection;
  scope.RTCSessionDescription = SessionDescription;
  // JsSIP checks `window.RTCPeerConnection` before placing a call.
  const win = (scope.window ?? scope) as Record<string, unknown>;
  win.RTCPeerConnection = TestPeerConnection;
}

/** RTP packets a peer connection has received so far. */
export function packetsReceived(peerConnection: unknown): {
  audio: number;
  video: number;
} {
  return received.get(peerConnection as object) ?? { audio: 0, video: 0 };
}

/**
 * A microphone that sends a 20 ms Opus frame of silence every 20 ms until
 * its track is stopped, which is what the app does when a call ends.
 */
export function fakeMicrophone(): MediaStream {
  const track = new MediaStreamTrack({ kind: 'audio' });
  let sequenceNumber = 0;
  let timestamp = 0;
  // Opus TOC for a 20 ms SILK frame, then a silent payload.
  const silence = Buffer.from([0xf8, 0xff, 0xfe]);
  const timer = setInterval(() => {
    sequenceNumber = (sequenceNumber + 1) % 0x10000;
    timestamp = (timestamp + 960) % 0x100000000;
    track.writeRtp(
      new RtpPacket(
        new RtpHeader({ payloadType: 111, sequenceNumber, timestamp }),
        silence,
      ),
    );
  }, 20);
  // werift tracks have no stop(); the app calls it to release the
  // microphone, so give this one a stop that ends the packets.
  const stoppable = track as unknown as { stop?: () => void };
  const stop = stoppable.stop?.bind(track);
  stoppable.stop = () => {
    clearInterval(timer);
    stop?.();
  };
  return new MediaStream([track]);
}
