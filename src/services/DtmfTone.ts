//
// AthenaPhone - Open Source SIP Softphone
//
// Copyright (C) 2026 Tom Cully <mail@tomcully.com>
// Licensed under the GNU GPLv3 - see <https://www.gnu.org/licenses/gpl-3.0.html>
//

import { NativeModules, Platform } from 'react-native';

const native: { play(digit: string, inCall: boolean): void } | undefined =
  Platform.OS === 'android' ? NativeModules.DtmfTone : undefined;

/**
 * The key tone the user hears on their own phone. Sending DTMF to the far
 * end makes no local sound, so this plays it, as a normal dialler does.
 */
export const DtmfTone = {
  play(digit: string, inCall: boolean): void {
    native?.play(digit, inCall);
  },
};
