//
// AthenaPhone - Open Source SIP Softphone
//
// Copyright (C) 2026 Tom Cully <mail@tomcully.com>
// Licensed under the GNU GPLv3 - see <https://www.gnu.org/licenses/gpl-3.0.html>
//

import { Platform } from 'react-native';
import {
  PERMISSIONS,
  RESULTS,
  check,
  request,
  requestNotifications,
  type Permission,
} from 'react-native-permissions';

/**
 * Runtime permissions the phone needs. Microphone is required to call at all;
 * the rest degrade gracefully, so we ask for them but do not block on them.
 */
function permissionsFor(video: boolean): Permission[] {
  if (Platform.OS === 'ios') {
    return video
      ? [PERMISSIONS.IOS.MICROPHONE, PERMISSIONS.IOS.CAMERA]
      : [PERMISSIONS.IOS.MICROPHONE];
  }

  const android: Permission[] = [PERMISSIONS.ANDROID.RECORD_AUDIO];
  if (video) {
    android.push(PERMISSIONS.ANDROID.CAMERA);
  }
  if (Number(Platform.Version) >= 31) {
    android.push(PERMISSIONS.ANDROID.BLUETOOTH_CONNECT);
  }
  return android;
}

async function ensure(permission: Permission): Promise<boolean> {
  const current = await check(permission);
  if (current === RESULTS.GRANTED || current === RESULTS.LIMITED) {
    return true;
  }
  // BLOCKED means the user has to go to Settings; asking again is a no-op.
  if (current === RESULTS.BLOCKED || current === RESULTS.UNAVAILABLE) {
    return false;
  }
  const outcome = await request(permission);
  return outcome === RESULTS.GRANTED || outcome === RESULTS.LIMITED;
}

export const PermissionsService = {
  /**
   * Request everything a call needs. Resolves true only when the microphone
   * was granted -- without it there is no call to place.
   */
  async requestForCall(video: boolean): Promise<boolean> {
    const results = await Promise.all(permissionsFor(video).map(ensure));
    return results[0] === true;
  },

  /**
   * Telecom permissions, needed before CallKeep may be used on Android.
   *
   * CallKeep's VoiceConnectionService calls TelecomManager.getPhoneAccount()
   * when placing an outbound call, and that throws SecurityException without
   * READ_PHONE_NUMBERS -- inside a system service callback, where it is not
   * catchable from JS, so the app dies outright. Declaring the permission in
   * the manifest is not enough: it is a runtime permission and must be
   * granted.
   *
   * Resolves false when the user declines, which is the caller's cue to run
   * without the system call UI rather than to crash the first time someone
   * dials.
   */
  async requestForTelecom(): Promise<boolean> {
    if (Platform.OS !== 'android') {
      return true;
    }
    // Which permission covers getPhoneAccount() changed at API 30, and
    // react-native-callkeep's own manifest caps READ_PHONE_STATE at
    // maxSdkVersion 29. The merger applies that cap to our declaration too,
    // so on API 30+ READ_PHONE_STATE is not in the APK at all and asking for
    // it can only ever fail -- which would disable CallKeep on every modern
    // device. Ask for whichever one actually exists.
    const permission =
      Number(Platform.Version) >= 30
        ? PERMISSIONS.ANDROID.READ_PHONE_NUMBERS
        : PERMISSIONS.ANDROID.READ_PHONE_STATE;

    return ensure(permission);
  },

  /**
   * Needed for the incoming-call notification on Android 13+, and for
   * missed-call alerts everywhere.
   */
  async requestNotifications(): Promise<boolean> {
    const { status } = await requestNotifications(['alert', 'sound']);
    return status === RESULTS.GRANTED || status === RESULTS.LIMITED;
  },

  async requestContacts(): Promise<boolean> {
    return ensure(
      Platform.OS === 'ios'
        ? PERMISSIONS.IOS.CONTACTS
        : PERMISSIONS.ANDROID.READ_CONTACTS,
    );
  },
};
