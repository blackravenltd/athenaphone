import { useEffect, useState } from 'react';

import type { Call } from '../types';
import { formatDuration } from '../utils/sipUri';

/**
 * Live call duration, ticking once a second from the moment the call was
 * answered. Returns an empty string before that, so the caller can show the
 * call state instead.
 */
export function useCallTimer(call: Call | undefined): string {
  const answeredAt = call?.answeredAt;
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (answeredAt === undefined) {
      setElapsed(0);
      return;
    }
    // Set immediately so the timer does not show 0:00 for a whole second.
    const tick = () => setElapsed((Date.now() - answeredAt) / 1000);
    tick();

    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [answeredAt]);

  return answeredAt === undefined ? '' : formatDuration(elapsed);
}
