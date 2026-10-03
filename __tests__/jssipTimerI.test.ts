//
// AthenaPhone - Open Source SIP Softphone
//
// Copyright (C) 2026 Tom Cully <mail@tomcully.com>
// Licensed under the GNU GPLv3 - see <https://www.gnu.org/licenses/gpl-3.0.html>
//

// Guards patches/jssip+*.patch. Unpatched, JsSIP ends an INVITE server
// transaction on a zero-length timer after the ACK, so a proxy that ACKs our
// 488 and re-offers in the same read is answered 482 Loop Detected.

const Transactions = require('jssip/lib/Transactions');
const sanityCheck = require('jssip/lib/sanityCheck');
const Parser = require('jssip/lib/Parser');

const BRANCH = 'z9hG4bKfirst';

/** The proxy's second attempt: new branch, same From tag, Call-ID and CSeq. */
const REINVITE = [
  'INVITE sip:phone@device.invalid SIP/2.0',
  'Via: SIP/2.0/TCP 10.0.0.1:5060;branch=z9hG4bKsecond',
  'From: <sip:1001@10.0.0.1>;tag=caller',
  'To: <sip:phone@10.0.0.1>',
  'Call-ID: call-1',
  'CSeq: 2 INVITE',
  'Max-Forwards: 69',
  'Content-Length: 0',
  '',
  '',
].join('\r\n');

function uaWithCompletedInvite() {
  const transaction = {
    id: BRANCH,
    state: Transactions.C.STATUS_COMPLETED,
    request: { from_tag: 'caller', call_id: 'call-1', cseq: 2 },
    stateChanged(state: number) {
      this.state = state;
    },
    timer_I() {
      this.stateChanged(Transactions.C.STATUS_TERMINATED);
      delete ua._transactions.ist[this.id];
    },
  };
  const ua: any = {
    _transactions: { ist: { [BRANCH]: transaction }, nist: {} },
    configuration: { uri: { scheme: 'sip' } },
  };
  return { ua, transaction };
}

describe('JsSIP INVITE server transaction after a non-2xx final response', () => {
  it('is gone as soon as the ACK has been processed', () => {
    const { ua, transaction } = uaWithCompletedInvite();

    const absorbed = Transactions.checkTransaction(ua, {
      method: 'ACK',
      via_branch: BRANCH,
    });

    expect(absorbed).toBe(true);
    expect(transaction.state).toBe(Transactions.C.STATUS_TERMINATED);
    expect(ua._transactions.ist[BRANCH]).toBeUndefined();
  });

  it('does not answer 482 to a re-INVITE that follows the ACK in the same tick', () => {
    const { ua } = uaWithCompletedInvite();
    const sent: string[] = [];
    const transport = { send: (message: string) => sent.push(message) };
    const reinvite = Parser.parseMessage(REINVITE, ua);

    // Unpatched, the first transaction is still listed here and this is 482.
    Transactions.checkTransaction(ua, { method: 'ACK', via_branch: BRANCH });

    expect(sanityCheck(reinvite, ua, transport)).toBe(true);
    expect(sent).toHaveLength(0);
  });

  it('still answers 482 while the first transaction is live', () => {
    const { ua } = uaWithCompletedInvite();
    const sent: string[] = [];
    const transport = { send: (message: string) => sent.push(message) };

    expect(sanityCheck(Parser.parseMessage(REINVITE, ua), ua, transport)).toBe(
      false,
    );
    expect(sent[0]).toMatch(/^SIP\/2.0 482 /);
  });
});
