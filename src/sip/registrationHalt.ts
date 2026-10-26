//
// AthenaPhone - Open Source SIP Softphone
//
// Copyright (C) 2026 Tom Cully <mail@tomcully.com>
// Licensed under the GNU GPLv3 - see <https://www.gnu.org/licenses/gpl-3.0.html>
//

/**
 * A failed REGISTER that more attempts would only repeat, and when, if
 * ever, to try again on our own.
 */
export interface RegistrationHalt {
  /** What to show in place of the SIP reason phrase. */
  reason: string;
  /**
   * When to register again, epoch ms. Undefined means not until the account
   * is edited or activated again.
   */
  retryAt?: number;
}

/** The longest a Retry-After is honoured before asking the server again. */
export const MAX_RETRY_AFTER_SECONDS = 60 * 60;

/**
 * Decide whether a REGISTER failure should stop the client registering.
 *
 * JsSIP registers again on every transport reconnect, and a registrar
 * closes a connection that registered nobody, so a wrong stored password
 * is re-sent every few minutes for as long as the app runs. AthenaSIP bans
 * the address after ten wrong answers, and Asterisk and Kamailio have the
 * same guards, so the loop locks the phone out rather than just failing.
 *
 * - 401 or 407 after the challenge was answered: the credentials were
 *   refused. Stop until the account is edited.
 * - 403 with Retry-After (RFC 3261 20.33): the server says when to come
 *   back. Wait that long, capped, then register again.
 * - 403 without one: refused outright. Stop until the account is edited.
 *
 * Anything else (timeouts, 5xx, 423 which JsSIP retries itself) is left to
 * JsSIP's own behaviour.
 */
export function registrationHalt(
  statusCode: number | undefined,
  retryAfter: string | undefined,
  now: number = Date.now(),
): RegistrationHalt | undefined {
  if (statusCode === 401 || statusCode === 407) {
    return { reason: 'Username or password refused' };
  }
  if (statusCode === 403) {
    const seconds = retryAfterSeconds(retryAfter);
    if (seconds === undefined) {
      return { reason: 'Refused by the server (403)' };
    }
    const wait = Math.min(Math.max(seconds, 1), MAX_RETRY_AFTER_SECONDS);
    return {
      reason: `Refused by the server; retrying in ${describeSeconds(wait)}`,
      retryAt: now + wait * 1000,
    };
  }
  return undefined;
}

/**
 * The delay in a Retry-After header value: a number of seconds, which may
 * be followed by a comment and `;duration=` (RFC 3261 20.33). Undefined
 * when absent or not a number.
 */
export function retryAfterSeconds(header: string | undefined): number | undefined {
  const match = /^\s*(\d+)/.exec(header ?? '');
  return match ? Number(match[1]) : undefined;
}

function describeSeconds(seconds: number): string {
  return seconds >= 120 ? `${Math.round(seconds / 60)} min` : `${seconds} s`;
}
