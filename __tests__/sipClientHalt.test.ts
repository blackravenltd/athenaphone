//
// AthenaPhone - Open Source SIP Softphone
//
// Copyright (C) 2026 Tom Cully <mail@tomcully.com>
// Licensed under the GNU GPLv3 - see <https://www.gnu.org/licenses/gpl-3.0.html>
//

// A REGISTER refused for its credentials, or with a Retry-After, must not
// be re-sent on the next reconnect: a registrar bans an address after a
// handful of wrong answers, so the loop would lock the phone out.

import type { SipAccount } from '../src/types';

jest.mock('jssip', () => {
  const { EventEmitter: Emitter } = require('node:events');

  class UA extends Emitter {
    static instances: UA[] = [];
    stopped = false;

    constructor() {
      super();
      UA.instances.push(this);
    }

    start(): void {}

    stop(): void {
      this.stopped = true;
      this.emit('disconnected', { socket: {}, error: false });
    }

    isConnected(): boolean {
      return !this.stopped;
    }

    register(): void {}

    unregister(): void {}
  }

  class WebSocketInterface {}

  return { UA, WebSocketInterface };
});

// Imported after the mock so SipClient gets the fake UA.
interface FakeUa {
  stopped: boolean;
  emit(event: string, data: unknown): boolean;
}
const { UA } = jest.requireMock('jssip') as { UA: { instances: FakeUa[] } };
import { SipClient } from '../src/sip/SipClient';

const account: SipAccount = {
  id: 'fixture',
  name: 'Fixture',
  username: '1001',
  domain: '10.35.1.123',
  transport: 'tcp',
  registerExpires: 60,
  autoRegister: true,
  enabled: true,
  iceServers: [],
  dtmfMode: 'auto',
  videoEnabled: false,
  keepAliveInterval: 30,
  createdAt: 0,
};

function failRegistration(
  ua: FakeUa,
  status_code: number,
  headers: Record<string, string> = {},
): void {
  ua.emit('registrationFailed', {
    cause: 'SIP Failure Code',
    response: {
      status_code,
      getHeader: (name: string) => headers[name.toLowerCase()],
    },
  });
}

describe('SipClient after a REGISTER failure', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    UA.instances.length = 0;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('closes the UA and stays failed when the credentials are refused', async () => {
    const client = new SipClient();
    await client.start(account, 'wrong');
    const [ua] = UA.instances;

    failRegistration(ua, 401);
    expect(client.registrationStatus).toMatchObject({
      state: 'failed',
      statusCode: 401,
      reason: 'Username or password refused',
    });

    await jest.advanceTimersByTimeAsync(0);
    expect(ua.stopped).toBe(true);
    expect(client.isConnected()).toBe(false);
    // The failure stays on show rather than turning into "offline".
    expect(client.registrationStatus.state).toBe('failed');

    await jest.advanceTimersByTimeAsync(60 * 60 * 1000);
    expect(UA.instances).toHaveLength(1);
  });

  it('waits out a 403 Retry-After and then registers again', async () => {
    const client = new SipClient();
    await client.start(account, 'secret');
    const [ua] = UA.instances;

    failRegistration(ua, 403, { 'retry-after': '30' });
    expect(client.registrationStatus.retryAt).toBe(Date.now() + 30_000);

    await jest.advanceTimersByTimeAsync(0);
    expect(ua.stopped).toBe(true);

    await jest.advanceTimersByTimeAsync(29_000);
    expect(UA.instances).toHaveLength(1);

    await jest.advanceTimersByTimeAsync(1_000);
    expect(UA.instances).toHaveLength(2);
    expect(UA.instances[1].stopped).toBe(false);
  });

  it('does not retry once stopped on purpose during the wait', async () => {
    const client = new SipClient();
    await client.start(account, 'secret');
    const [ua] = UA.instances;

    failRegistration(ua, 403, { 'retry-after': '30' });
    await jest.advanceTimersByTimeAsync(0);
    await client.stop();
    expect(client.registrationStatus.state).toBe('unregistered');

    await jest.advanceTimersByTimeAsync(60_000);
    expect(UA.instances).toHaveLength(1);
  });

  it('leaves other failures to JsSIP', async () => {
    const client = new SipClient();
    await client.start(account, 'secret');
    const [ua] = UA.instances;

    failRegistration(ua, 408);
    await jest.advanceTimersByTimeAsync(0);
    expect(ua.stopped).toBe(false);
    expect(client.registrationStatus).toMatchObject({
      state: 'failed',
      statusCode: 408,
      reason: 'SIP Failure Code',
    });
  });
});
