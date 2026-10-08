//
// AthenaPhone - Open Source SIP Softphone
//
// Copyright (C) 2026 Tom Cully <mail@tomcully.com>
// Licensed under the GNU GPLv3 - see <https://www.gnu.org/licenses/gpl-3.0.html>
//

import { noticeText } from '../src/services/RegistrationNotice';

const account = { username: '1003', domain: 'macnessa.athenasip.org' };

describe('noticeText', () => {
  it('names the address once registered', () => {
    expect(noticeText(account, { state: 'registered' })).toBe(
      'Online as 1003@macnessa.athenasip.org',
    );
  });

  it('says it is connecting while a REGISTER is outstanding', () => {
    expect(noticeText(account, { state: 'registering' })).toBe(
      'Connecting as 1003@macnessa.athenasip.org',
    );
  });

  it('keeps the notification up with the reason when registration fails', () => {
    expect(
      noticeText(account, { state: 'failed', reason: 'Request Timeout' }),
    ).toBe('Not registered: Request Timeout');
  });

  it('hides the notification once the account is offline on purpose', () => {
    expect(noticeText(account, { state: 'unregistered' })).toBeNull();
  });
});
