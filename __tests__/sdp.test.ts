//
// AthenaPhone - Open Source SIP Softphone
//
// Copyright (C) 2026 Tom Cully <mail@tomcully.com>
// Licensed under the GNU GPLv3 - see <https://www.gnu.org/licenses/gpl-3.0.html>
//

import { canAnswerOffer } from '../src/utils/sdp';

const lines = (...parts: string[]) => parts.join('\r\n') + '\r\n';

const session = ['v=0', 'o=- 1 1 IN IP4 10.0.0.1', 's=-', 'c=IN IP4 10.0.0.1', 't=0 0'];
const fingerprint = 'a=fingerprint:sha-256 AB:CD';

describe('canAnswerOffer', () => {
  it('accepts a DTLS-SRTP audio offer', () => {
    expect(
      canAnswerOffer(
        lines(...session, 'm=audio 30000 UDP/TLS/RTP/SAVPF 111 0', fingerprint),
      ),
    ).toBe(true);
  });

  it('accepts the older RTP/SAVPF spelling with a fingerprint', () => {
    expect(
      canAnswerOffer(lines(...session, 'm=audio 30000 RTP/SAVPF 111', fingerprint)),
    ).toBe(true);
  });

  it('refuses plain RTP, as sent by a server that takes us for a desk phone', () => {
    expect(canAnswerOffer(lines(...session, 'm=audio 22000 RTP/AVP 8'))).toBe(
      false,
    );
  });

  it('refuses a DTLS m-line with no fingerprint to verify', () => {
    expect(
      canAnswerOffer(lines(...session, 'm=audio 30000 UDP/TLS/RTP/SAVPF 111')),
    ).toBe(false);
  });

  it('refuses an offer whose only audio stream is disabled', () => {
    expect(
      canAnswerOffer(
        lines(...session, 'm=audio 0 UDP/TLS/RTP/SAVPF 111', fingerprint),
      ),
    ).toBe(false);
  });

  it('accepts an INVITE with no offer, which asks us to make one', () => {
    expect(canAnswerOffer(undefined)).toBe(true);
    expect(canAnswerOffer('')).toBe(true);
  });
});
