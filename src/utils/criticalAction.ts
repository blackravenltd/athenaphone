//
// AthenaPhone - Open Source SIP Softphone
//
// Copyright (C) 2026 Tom Cully <mail@tomcully.com>
// Licensed under the GNU GPLv3 - see <https://www.gnu.org/licenses/gpl-3.0.html>
//

/**
 * Single-flight wrapper for actions that must not happen twice.
 *
 * On a phone, a duplicated action is not a cosmetic glitch: two taps on the
 * dial button place two calls, two taps on answer answer twice, two taps on
 * transfer transfers twice. The far end and the PBX both see the duplicate,
 * and on Android the telecom layer starts asking whether to end the call you
 * did not mean to make.
 *
 * Guarding only against re-entry is not sufficient. Placing a call is
 * asynchronous, and the window closes as soon as the INVITE is on the wire --
 * roughly a second -- while the causes of a duplicate (a bounced touch, a
 * repeated synthetic event, a user who taps again because nothing visibly
 * happened yet) land either side of that. So this holds the lock for a
 * cooldown after the action settles as well.
 *
 * Repeat invocations inside the window are *ignored*, not queued and not
 * rejected: the caller asked for one call, and got one.
 */
export interface SingleFlightOptions {
  /** How long to keep refusing after the action settles. */
  cooldownMs?: number;
  /** Called when an invocation is dropped, for logging or a UI hint. */
  onIgnored?: () => void;
}

/** Long enough to cover a bounced touch and an impatient second tap. */
export const DEFAULT_COOLDOWN_MS = 1500;

export function singleFlight<A extends unknown[], R>(
  action: (...args: A) => Promise<R>,
  { cooldownMs = DEFAULT_COOLDOWN_MS, onIgnored }: SingleFlightOptions = {},
): (...args: A) => Promise<R | undefined> {
  let running = false;
  let blockedUntil = 0;

  return async (...args: A): Promise<R | undefined> => {
    if (running || Date.now() < blockedUntil) {
      onIgnored?.();
      return undefined;
    }

    running = true;
    try {
      return await action(...args);
    } finally {
      running = false;
      // Start the cooldown when the action settles, not when it began, so a
      // slow action does not leave a shorter guard than a fast one.
      blockedUntil = Date.now() + cooldownMs;
    }
  };
}
