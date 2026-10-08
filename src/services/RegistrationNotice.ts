//
// AthenaPhone - Open Source SIP Softphone
//
// Copyright (C) 2026 Tom Cully <mail@tomcully.com>
// Licensed under the GNU GPLv3 - see <https://www.gnu.org/licenses/gpl-3.0.html>
//

import { NativeModules, Platform } from 'react-native';

import { useAccountStore } from '../store/accountStore';
import { useSettingsStore } from '../store/settingsStore';
import type { RegistrationStatus, SipAccount } from '../types';

interface NativeRegistrationService {
  show(title: string, text: string): void;
  hide(): void;
}

const native: NativeRegistrationService | undefined =
  Platform.OS === 'android' ? NativeModules.RegistrationService : undefined;

/** The notification's text for a registration state, or null to hide it. */
export function noticeText(
  account: Pick<SipAccount, 'username' | 'domain'>,
  status: RegistrationStatus,
): string | null {
  const address = `${account.username}@${account.domain}`;
  switch (status.state) {
    case 'registered':
      return `Online as ${address}`;
    case 'registering':
      return `Connecting as ${address}`;
    case 'failed':
      return `Not registered: ${status.reason ?? 'registration failed'}`;
    case 'unregistered':
      return null;
  }
}

/**
 * The Android foreground service that keeps the process, and so the SIP
 * connection, alive while an account is online. Its notification follows the
 * registration state, and it runs only while "Remain in background" is on. A
 * no-op on iOS, which has no equivalent: there, calls to a backgrounded app
 * need PushKit.
 */
export const RegistrationNotice = {
  /** Bring the service into line with the current account, state and setting. */
  sync(): void {
    if (!native) {
      return;
    }
    const accounts = useAccountStore.getState();
    const account = accounts.activeAccount();
    const text =
      account && useSettingsStore.getState().remainInBackground
        ? noticeText(account, accounts.registration)
        : null;
    if (text === null || !account) {
      native.hide();
      return;
    }
    native.show(account.name || 'AthenaPhone', text);
  },
};
