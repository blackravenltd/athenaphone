import { Platform } from 'react-native';
import InCallManager from 'react-native-incall-manager';

import type { AudioRoute } from '../types';

/**
 * Owns the audio session for the lifetime of a call: routing, proximity
 * sensor, ringback and ringtone.
 *
 * On iOS, CallKit activates the audio session for us, so we deliberately do
 * not start InCallManager until `didActivateAudioSession` fires. On Android
 * there is no such handshake and we start it directly.
 */
class AudioServiceImpl {
  private started = false;
  private route: AudioRoute = 'earpiece';

  /** Enter in-call audio mode. `video` picks the loudspeaker by default. */
  start(video: boolean): void {
    if (this.started) {
      this.setMedia(video);
      return;
    }
    InCallManager.start({ media: video ? 'video' : 'audio', auto: true });
    InCallManager.setKeepScreenOn(video);
    if (video) {
      // Blanking the screen when the handset nears your face is wrong when
      // the point of the call is to look at it.
      InCallManager.stopProximitySensor();
    } else {
      InCallManager.startProximitySensor();
    }
    this.started = true;
    this.setSpeaker(video);
  }

  /** Leave in-call audio mode and restore the normal media routing. */
  stop(playBusyTone = false): void {
    if (!this.started) {
      return;
    }
    InCallManager.stopRingtone();
    InCallManager.stopRingback();
    InCallManager.stop(playBusyTone ? { busytone: '_BUNDLE_' } : undefined);
    InCallManager.stopProximitySensor();
    InCallManager.setKeepScreenOn(false);
    this.started = false;
    this.route = 'earpiece';
  }

  /**
   * Local ringtone for an inbound call, when CallKit is not doing it.
   * The vibrate pattern is ms on/off, repeated until stopRingtone().
   */
  startRingtone(): void {
    InCallManager.startRingtone('_BUNDLE_', [0, 1000, 800], 'playback', 30);
  }

  stopRingtone(): void {
    InCallManager.stopRingtone();
  }

  /** Ringback for an outbound call that has reached 180 Ringing. */
  startRingback(): void {
    InCallManager.startRingback('_BUNDLE_');
  }

  stopRingback(): void {
    InCallManager.stopRingback();
  }

  setSpeaker(on: boolean): void {
    // forceSpeakerphoneOn overrides the automatic routing, which is what the
    // user means when they tap the speaker button.
    InCallManager.setForceSpeakerphoneOn(on);
    this.route = on ? 'speaker' : 'earpiece';
  }

  setMicrophoneMuted(muted: boolean): void {
    InCallManager.setMicrophoneMute(muted);
  }

  get currentRoute(): AudioRoute {
    return this.route;
  }

  /**
   * Outputs to show in the in-call audio picker.
   *
   * InCallManager cannot enumerate Bluetooth devices, so on Android we offer
   * the route unconditionally and let the native side no-op when nothing is
   * paired. iOS routes audio through CallKit's own picker.
   */
  async listRoutes(): Promise<AudioRoute[]> {
    const available: AudioRoute[] = ['earpiece', 'speaker'];
    try {
      const { isWiredHeadsetPluggedIn } =
        await InCallManager.getIsWiredHeadsetPluggedIn();
      if (isWiredHeadsetPluggedIn) {
        available.push('headset');
      }
    } catch {
      // Not fatal -- the picker just shows one option fewer.
    }
    if (Platform.OS === 'android') {
      available.push('bluetooth');
    }
    return available;
  }

  selectRoute(route: AudioRoute): void {
    if (route === 'speaker') {
      this.setSpeaker(true);
      return;
    }
    this.setSpeaker(false);
    if (route === 'bluetooth') {
      InCallManager.chooseAudioRoute('BLUETOOTH');
    } else if (route === 'headset') {
      InCallManager.chooseAudioRoute('WIRED_HEADSET');
    } else {
      InCallManager.chooseAudioRoute('EARPIECE');
    }
    this.route = route;
  }

  /** Switch an already-running session between audio and video profiles. */
  private setMedia(video: boolean): void {
    InCallManager.setKeepScreenOn(video);
    if (video && this.route === 'earpiece') {
      this.setSpeaker(true);
    }
  }
}

export const AudioService = new AudioServiceImpl();
