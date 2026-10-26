//
// AthenaPhone - Open Source SIP Softphone
//
// Copyright (C) 2026 Tom Cully <mail@tomcully.com>
// Licensed under the GNU GPLv3 - see <https://www.gnu.org/licenses/gpl-3.0.html>
//

import {
  MAX_RETRY_AFTER_SECONDS,
  registrationHalt,
  retryAfterSeconds,
} from '../src/sip/registrationHalt';

const NOW = 1_700_000_000_000;

describe('registrationHalt', () => {
  it('stops for good when the credentials are refused', () => {
    expect(registrationHalt(401, undefined, NOW)).toEqual({
      reason: 'Username or password refused',
    });
    expect(registrationHalt(407, undefined, NOW)).toEqual({
      reason: 'Username or password refused',
    });
  });

  it('waits out a 403 with Retry-After', () => {
    expect(registrationHalt(403, '900', NOW)).toEqual({
      reason: 'Refused by the server; retrying in 15 min',
      retryAt: NOW + 900_000,
    });
    expect(registrationHalt(403, '30 (closed)', NOW)).toEqual({
      reason: 'Refused by the server; retrying in 30 s',
      retryAt: NOW + 30_000,
    });
  });

  it('caps a very long Retry-After and never retries at once', () => {
    expect(registrationHalt(403, '999999', NOW)?.retryAt).toBe(
      NOW + MAX_RETRY_AFTER_SECONDS * 1000,
    );
    expect(registrationHalt(403, '0', NOW)?.retryAt).toBe(NOW + 1000);
  });

  it('stops for good on a 403 without Retry-After', () => {
    expect(registrationHalt(403, undefined, NOW)).toEqual({
      reason: 'Refused by the server (403)',
    });
  });

  it('leaves every other failure to JsSIP', () => {
    for (const code of [408, 423, 480, 500, 503, undefined]) {
      expect(registrationHalt(code, undefined, NOW)).toBeUndefined();
    }
  });
});

describe('retryAfterSeconds', () => {
  it('reads the seconds and ignores what follows', () => {
    expect(retryAfterSeconds('120')).toBe(120);
    expect(retryAfterSeconds(' 5 (try later);duration=3600')).toBe(5);
  });

  it('is undefined when absent or not a number', () => {
    expect(retryAfterSeconds(undefined)).toBeUndefined();
    expect(retryAfterSeconds('')).toBeUndefined();
    expect(retryAfterSeconds('soon')).toBeUndefined();
  });
});
