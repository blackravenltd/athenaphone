//
// AthenaPhone - Open Source SIP Softphone
//
// Copyright (C) 2026 Tom Cully <mail@tomcully.com>
// Licensed under the GNU GPLv3 - see <https://www.gnu.org/licenses/gpl-3.0.html>
//

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  singleFlight,
  DEFAULT_COOLDOWN_MS,
  type SingleFlightOptions,
} from '../utils/criticalAction';

/**
 * Binds a critical action to a control, so one press does it exactly once.
 *
 * Every control that starts, answers, ends or redirects a call goes through
 * this rather than calling the controller directly. `busy` is true while the
 * action is in flight or cooling down, and is meant to be wired to the
 * control's `disabled` prop so the guard is visible as well as enforced.
 *
 * The wrapped function is created once and held in a ref: rebuilding it on
 * every render would reset the lock, which is the failure this exists to
 * prevent.
 */
export function useCriticalAction<A extends unknown[]>(
  action: (...args: A) => Promise<unknown> | unknown,
  options: SingleFlightOptions = {},
): { run: (...args: A) => void; busy: boolean } {
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);
  const latest = useRef(action);
  latest.current = action;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const cooldownMs = options.cooldownMs ?? DEFAULT_COOLDOWN_MS;
  const onIgnored = options.onIgnored;

  const guarded = useMemo(
    () =>
      singleFlight(
        async (...args: A) => {
          if (mounted.current) {
            setBusy(true);
          }
          try {
            await latest.current(...args);
          } finally {
            // Stay busy for the cooldown, so the control remains disabled for
            // exactly as long as the action is actually refused.
            setTimeout(() => {
              if (mounted.current) {
                setBusy(false);
              }
            }, cooldownMs);
          }
        },
        { cooldownMs, onIgnored },
      ),
    [cooldownMs, onIgnored],
  );

  const run = useCallback(
    (...args: A) => {
      void guarded(...args);
    },
    [guarded],
  );

  return { run, busy };
}
