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
