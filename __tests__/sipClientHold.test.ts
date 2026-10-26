//
// AthenaPhone - Open Source SIP Softphone
//
// Copyright (C) 2026 Tom Cully <mail@tomcully.com>
// Licensed under the GNU GPLv3 - see <https://www.gnu.org/licenses/gpl-3.0.html>
//

// JsSIP refuses a re-INVITE while another INVITE transaction is pending and
// says so only by returning false. A resume pressed while the hold was still
// being answered used to be dropped, leaving the call on hold.

import { SipClient } from '../src/sip/SipClient';

/** The parts of a JsSIP RTCSession that hold touches, with a pending flag. */
class FakeSession {
  localHold = false;
  pending = false;
  ended = false;
  sent: ('hold' | 'unhold')[] = [];
  private done?: () => void;

  isEnded() {
    return this.ended;
  }

  isOnHold() {
    return { local: this.localHold, remote: false };
  }

  hold(_options: unknown, done: () => void) {
    return this.reoffer(true, done);
  }

  unhold(_options: unknown, done: () => void) {
    return this.reoffer(false, done);
  }

  /** The far end answers the re-INVITE in flight. */
  answer() {
    this.pending = false;
    const done = this.done;
    this.done = undefined;
    done?.();
  }

  private reoffer(held: boolean, done: () => void) {
    if (this.localHold === held || this.pending || this.ended) {
      return false;
    }
    this.localHold = held;
    this.pending = true;
    this.done = done;
    this.sent.push(held ? 'hold' : 'unhold');
    return true;
  }
}

function clientWith(session: FakeSession): SipClient {
  const client = new SipClient();
  (client as unknown as { sessions: Map<string, unknown> }).sessions.set(
    'call-1',
    { session, call: { id: 'call-1' } },
  );
  return client;
}

describe('SipClient.setHold', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('sends a resume pressed during the hold once the hold is answered', () => {
    const session = new FakeSession();
    const client = clientWith(session);

    client.setHold('call-1', true);
    client.setHold('call-1', false);
    expect(session.sent).toEqual(['hold']);

    session.answer();
    expect(session.sent).toEqual(['hold', 'unhold']);
    expect(session.localHold).toBe(false);
  });

  it('retries on a timer when the dialog is busy for another reason', () => {
    const session = new FakeSession();
    session.pending = true;
    const client = clientWith(session);

    client.setHold('call-1', true);
    expect(session.sent).toEqual([]);

    session.pending = false;
    jest.advanceTimersByTime(100);
    expect(session.sent).toEqual(['hold']);
  });

  it('applies only the last of several presses', () => {
    const session = new FakeSession();
    const client = clientWith(session);

    client.setHold('call-1', true);
    client.setHold('call-1', false);
    client.setHold('call-1', true);
    session.answer();
    jest.advanceTimersByTime(1000);
    expect(session.sent).toEqual(['hold']);
    expect(session.localHold).toBe(true);
  });

  it('gives up once the call has ended', () => {
    const session = new FakeSession();
    session.pending = true;
    const client = clientWith(session);

    client.setHold('call-1', true);
    session.ended = true;
    session.pending = false;
    jest.advanceTimersByTime(1000);
    expect(session.sent).toEqual([]);
  });
});
