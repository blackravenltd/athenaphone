//
// AthenaPhone - Open Source SIP Softphone
//
// Copyright (C) 2026 Tom Cully <mail@tomcully.com>
// Licensed under the GNU GPLv3 - see <https://www.gnu.org/licenses/gpl-3.0.html>
//

import type { Call } from '../src/types';
import { describeOutcome, shouldHoldOutcome } from '../src/utils/callOutcome';

function call(changes: Partial<Call>): Call {
  return {
    id: 'c1',
    accountId: 'a1',
    direction: 'outbound',
    state: 'failed',
    remoteUri: '1002',
    hasVideo: false,
    muted: false,
    videoEnabled: false,
    speakerOn: false,
    createdAt: 1_000,
    ...changes,
  };
}

describe('describeOutcome', () => {
  it('says why an outbound call never connected, with the response', () => {
    expect(
      describeOutcome(
        call({
          endReason: 'unavailable',
          endStatus: { code: 480, phrase: 'Temporarily Unavailable' },
        }),
      ),
    ).toEqual({
      headline: 'Unavailable',
      detail: '480 Temporarily Unavailable',
      failed: true,
    });
  });

  it('reports busy and no answer in plain words', () => {
    expect(describeOutcome(call({ endReason: 'busy' })).headline).toBe('Busy');
    expect(describeOutcome(call({ endReason: 'no-answer' })).headline).toBe(
      'No answer',
    );
  });

  it('gives the length of a call that was answered', () => {
    expect(
      describeOutcome(
        call({
          state: 'ended',
          endReason: 'remote-hangup',
          answeredAt: 2_000,
          endedAt: 85_000,
        }),
      ),
    ).toEqual({ headline: 'Call ended', detail: '1:23', failed: false });
  });

  it('calls a dropped connection a failure even after answering', () => {
    expect(
      describeOutcome(
        call({ endReason: 'network-error', answeredAt: 2_000, endedAt: 9_000 }),
      ).headline,
    ).toBe('Connection lost');
  });

  it('falls back to a generic failure with whatever the server said', () => {
    expect(
      describeOutcome(
        call({
          endReason: 'error',
          endStatus: { code: 404, phrase: 'Not Found' },
        }),
      ),
    ).toEqual({
      headline: 'Call failed',
      detail: '404 Not Found',
      failed: true,
    });
  });
});

describe('shouldHoldOutcome', () => {
  it('holds a call the far end or the network ended', () => {
    expect(shouldHoldOutcome(call({ endReason: 'busy' }))).toBe(true);
    expect(
      shouldHoldOutcome(
        call({ direction: 'inbound', answeredAt: 2_000, state: 'ended' }),
      ),
    ).toBe(true);
  });

  it('lets the screen go when the user ended the call', () => {
    expect(shouldHoldOutcome(call({ endedLocally: true }))).toBe(false);
  });

  it('does not hold an incoming call that was never answered', () => {
    expect(
      shouldHoldOutcome(call({ direction: 'inbound', endReason: 'cancelled' })),
    ).toBe(false);
  });
});
