//
// AthenaPhone - Open Source SIP Softphone
//
// Copyright (C) 2026 Tom Cully <mail@tomcully.com>
// Licensed under the GNU GPLv3 - see <https://www.gnu.org/licenses/gpl-3.0.html>
//

import { create } from 'zustand';

import { Storage, StorageKeys } from '../services/Storage';

export interface AppSettings {
  /** Hand incoming calls to CallKit / ConnectionService. */
  useSystemCallUi: boolean;
  /**
   * Ring for inbound calls. On Android this plays even when the system call
   * screen is on, because a SELF_MANAGED ConnectionService draws the UI but
   * never rings; on iOS CallKit owns the sound and this covers the in-app
   * path only.
   */
  ringtoneEnabled: boolean;
  vibrateOnRing: boolean;
  /** Play a short tone for each dialpad press. */
  dialpadTones: boolean;
  /** Offer video by default when dialling. */
  preferVideo: boolean;
  /** Start the front camera muted on video calls. */
  startVideoMuted: boolean;
  /** Turn the loudspeaker on automatically for video calls. */
  autoSpeakerOnVideo: boolean;
  /**
   * Keep the app running while an account is online, so calls arrive with
   * it off screen. On Android this is a foreground service and a standing
   * notification.
   */
  remainInBackground: boolean;
  /** Accept the next inbound call without user interaction (headset mode). */
  autoAnswer: boolean;
  /** Echo SIP traffic to the console. Noisy; off by default. */
  verboseSipLogging: boolean;
}

export const defaultSettings: AppSettings = {
  useSystemCallUi: true,
  ringtoneEnabled: true,
  vibrateOnRing: true,
  dialpadTones: true,
  preferVideo: false,
  startVideoMuted: false,
  autoSpeakerOnVideo: true,
  remainInBackground: true,
  autoAnswer: false,
  verboseSipLogging: false,
};

/**
 * Narrow the store back down to the persisted shape, so the action functions
 * and `hydrated` never reach storage.
 */
function pickSettings(state: AppSettings): AppSettings {
  return Object.fromEntries(
    (Object.keys(defaultSettings) as (keyof AppSettings)[]).map(key => [
      key,
      state[key],
    ]),
  ) as unknown as AppSettings;
}

interface SettingsState extends AppSettings {
  hydrated: boolean;
  hydrate: () => Promise<void>;
  set: <K extends keyof AppSettings>(
    key: K,
    value: AppSettings[K],
  ) => Promise<void>;
  resetToDefaults: () => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((setState, get) => ({
  ...defaultSettings,
  hydrated: false,

  async hydrate() {
    const stored = await Storage.read<Partial<AppSettings>>(
      StorageKeys.settings,
      {},
    );
    // Spread over the defaults so a settings blob written by an older build
    // does not leave new keys undefined.
    setState({ ...defaultSettings, ...stored, hydrated: true });
  },

  async set(key, value) {
    setState({ [key]: value } as unknown as Partial<SettingsState>);
    await Storage.write(
      StorageKeys.settings,
      pickSettings({ ...get(), [key]: value }),
    );
  },

  async resetToDefaults() {
    setState({ ...defaultSettings });
    await Storage.write(StorageKeys.settings, defaultSettings);
  },
}));
