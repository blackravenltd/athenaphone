//
// AthenaPhone - Open Source SIP Softphone
//
// Copyright (C) 2026 Tom Cully <mail@tomcully.com>
// Licensed under the GNU GPLv3 - see <https://www.gnu.org/licenses/gpl-3.0.html>
//

import type { Call } from '../types';
import { formatDuration } from './sipUri';

export interface CallOutcome {
  /** One or two words, e.g. "No answer". */
  headline: string;
  /** Supporting detail: the duration, or the server's response. */
  detail?: string;
  /** Whether it went wrong, as opposed to ending normally. */
  failed: boolean;
}

/**
 * What to tell the user about a call that has ended, in the words a phone
 * uses rather than SIP's.
 */
export function describeOutcome(call: Call): CallOutcome {
  const answered = call.answeredAt !== undefined;
  const status = call.endStatus
    ? `${call.endStatus.code} ${call.endStatus.phrase}`.trim()
    : undefined;

  if (answered) {
    const length =
      call.endedAt !== undefined
        ? formatDuration(Math.round((call.endedAt - call.answeredAt!) / 1000))
        : undefined;
    if (call.endReason === 'network-error') {
      return { headline: 'Connection lost', detail: length, failed: true };
    }
    if (call.endReason === 'transferred') {
      return { headline: 'Transferred', detail: length, failed: false };
    }
    return { headline: 'Call ended', detail: length, failed: false };
  }

  switch (call.endReason) {
    case 'busy':
      return { headline: 'Busy', detail: status, failed: true };
    case 'no-answer':
      return { headline: 'No answer', detail: status, failed: true };
    case 'rejected':
      return { headline: 'Declined', detail: status, failed: true };
    case 'unavailable':
      return { headline: 'Unavailable', detail: status, failed: true };
    case 'network-error':
      return {
        headline: 'Could not connect',
        detail: status ?? 'No response from the server',
        failed: true,
      };
    case 'cancelled':
    case 'local-hangup':
      return { headline: 'Cancelled', failed: false };
    default:
      return { headline: 'Call failed', detail: status, failed: true };
  }
}

/**
 * Whether the ended call stays on screen until dismissed. Kept when the far
 * end or the network ended it, so a failure is never just a vanishing
 * screen; not when the user ended it themselves, nor for an incoming call
 * that was never answered, which Recents already reports as missed.
 */
export function shouldHoldOutcome(call: Call): boolean {
  if (call.endedLocally) {
    return false;
  }
  if (call.direction === 'inbound' && call.answeredAt === undefined) {
    return false;
  }
  return true;
}
