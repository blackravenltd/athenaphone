//
// AthenaPhone - Open Source SIP Softphone
//
// Copyright (C) 2026 Tom Cully <mail@tomcully.com>
// Licensed under the GNU GPLv3 - see <https://www.gnu.org/licenses/gpl-3.0.html>
//

import { singleFlight } from '../src/utils/criticalAction';

describe('singleFlight', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('runs the action once for a single call', async () => {
    const action = jest.fn().mockResolvedValue('ok');
    const guarded = singleFlight(action);

    await expect(guarded()).resolves.toBe('ok');
    expect(action).toHaveBeenCalledTimes(1);
  });

  it('ignores a second call while the first is still running', async () => {
    let release: (value: string) => void = () => {};
    const action = jest.fn(
      () => new Promise<string>(resolve => (release = resolve)),
    );
    const guarded = singleFlight(action);

    const first = guarded();
    const second = guarded();

    release('done');
    await expect(first).resolves.toBe('done');
    await expect(second).resolves.toBeUndefined();
    expect(action).toHaveBeenCalledTimes(1);
  });

  it('keeps refusing during the cooldown after the action settles', async () => {
    const action = jest.fn().mockResolvedValue('ok');
    const guarded = singleFlight(action, { cooldownMs: 1500 });

    await guarded();
    expect(action).toHaveBeenCalledTimes(1);

    // The real duplicate that prompted this arrived about a second later,
    // well after the in-flight window had closed.
    jest.advanceTimersByTime(1000);
    await expect(guarded()).resolves.toBeUndefined();
    expect(action).toHaveBeenCalledTimes(1);
  });

  it('allows the action again once the cooldown expires', async () => {
    const action = jest.fn().mockResolvedValue('ok');
    const guarded = singleFlight(action, { cooldownMs: 1500 });

    await guarded();
    jest.advanceTimersByTime(1501);
    await expect(guarded()).resolves.toBe('ok');
    expect(action).toHaveBeenCalledTimes(2);
  });

  it('reports ignored invocations', async () => {
    const onIgnored = jest.fn();
    const guarded = singleFlight(jest.fn().mockResolvedValue(undefined), {
      cooldownMs: 1000,
      onIgnored,
    });

    await guarded();
    await guarded();

    expect(onIgnored).toHaveBeenCalledTimes(1);
  });

  it('starts the cooldown even when the action throws', async () => {
    const action = jest.fn().mockRejectedValue(new Error('no network'));
    const guarded = singleFlight(action, { cooldownMs: 1500 });

    await expect(guarded()).rejects.toThrow('no network');

    // A failed call must not leave the button hot: the usual response to an
    // error is to press it again immediately.
    jest.advanceTimersByTime(500);
    await expect(guarded()).resolves.toBeUndefined();
    expect(action).toHaveBeenCalledTimes(1);
  });

  it('passes arguments through', async () => {
    const action = jest.fn().mockResolvedValue(undefined);
    const guarded = singleFlight(action);

    await guarded('103', true);

    expect(action).toHaveBeenCalledWith('103', true);
  });
});
