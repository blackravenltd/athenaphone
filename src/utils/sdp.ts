/**
 * Just enough SDP reading to decide whether an offer is worth ringing for.
 */

//
// AthenaPhone - Open Source SIP Softphone
//
// Copyright (C) 2026 Tom Cully <mail@tomcully.com>
// Licensed under the GNU GPLv3 - see <https://www.gnu.org/licenses/gpl-3.0.html>
//

/** An audio stream on a non-zero port, keyed over DTLS. */
const DTLS_AUDIO = /^m=audio [1-9]\d* (?:UDP\/TLS\/)?RTP\/SAVPF? /m;
const FINGERPRINT = /^a=fingerprint:/m;

/**
 * Whether the WebRTC stack can answer this offer.
 *
 * Media here is always DTLS-SRTP, so a plain `RTP/AVP` offer can only end in
 * 488. Knowing that before the call is presented lets it be refused without
 * ringing. An INVITE with no body is a request for us to make the offer, and
 * is always answerable.
 */
export function canAnswerOffer(sdp: string | undefined | null): boolean {
  if (!sdp || !sdp.trim()) {
    return true;
  }
  return DTLS_AUDIO.test(sdp) && FINGERPRINT.test(sdp);
}
