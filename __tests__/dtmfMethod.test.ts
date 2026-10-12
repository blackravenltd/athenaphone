//
// AthenaPhone - Open Source SIP Softphone
//
// Copyright (C) 2026 Tom Cully <mail@tomcully.com>
// Licensed under the GNU GPLv3 - see <https://www.gnu.org/licenses/gpl-3.0.html>
//

import type { RTCSession } from 'jssip/lib/RTCSession';

import { dtmfMethod } from '../src/sip/SipClient';

const WITH_EVENTS =
  'v=0\r\nm=audio 4000 RTP/AVP 9 8 0 126\r\na=rtpmap:9 G722/8000\r\n' +
  'a=rtpmap:126 telephone-event/8000\r\n';
const WITHOUT_EVENTS =
  'v=0\r\nm=audio 4000 RTP/AVP 0\r\na=rtpmap:0 PCMU/8000\r\n';

function session(sdp: string, canInsertDTMF: boolean | null): RTCSession {
  return {
    connection: {
      remoteDescription: { sdp },
      getSenders: () => [
        {
          track: { kind: 'audio' },
          dtmf: canInsertDTMF === null ? null : { canInsertDTMF },
        },
      ],
    },
  } as unknown as RTCSession;
}

describe('dtmfMethod', () => {
  it('sends RFC 4733 when the answer negotiated telephone-event', () => {
    expect(dtmfMethod('auto', session(WITH_EVENTS, true))).toBe('RFC2833');
    expect(dtmfMethod('rfc4733', session(WITH_EVENTS, true))).toBe('RFC2833');
  });

  it('falls back to SIP INFO when the answer has no telephone-event', () => {
    expect(dtmfMethod('auto', session(WITHOUT_EVENTS, true))).toBe('INFO');
    expect(dtmfMethod('rfc4733', session(WITHOUT_EVENTS, true))).toBe('INFO');
  });

  it('falls back to SIP INFO when the sender cannot insert events', () => {
    expect(dtmfMethod('auto', session(WITH_EVENTS, null))).toBe('INFO');
    expect(dtmfMethod('auto', session(WITH_EVENTS, false))).toBe('INFO');
  });

  it('uses SIP INFO when the account asks for it', () => {
    expect(dtmfMethod('info', session(WITH_EVENTS, true))).toBe('INFO');
  });

  it('treats in-band and the old rfc2833 value as automatic', () => {
    expect(dtmfMethod('inband', session(WITH_EVENTS, true))).toBe('RFC2833');
    expect(dtmfMethod('rfc2833', session(WITHOUT_EVENTS, true))).toBe('INFO');
  });
});
