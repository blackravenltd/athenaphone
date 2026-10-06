//
// AthenaPhone - Open Source SIP Softphone
//
// Copyright (C) 2026 Tom Cully <mail@tomcully.com>
// Licensed under the GNU GPLv3 - see <https://www.gnu.org/licenses/gpl-3.0.html>
//

import { Platform } from 'react-native';
import RNCallKeep, {
  CONSTANTS as CK,
  type IOptions,
} from 'react-native-callkeep';

import type { Call } from '../types';
import { TypedEmitter } from '../utils/emitter';
import { displayTarget } from '../utils/sipUri';

/**
 * Actions the *system* call UI asked us to perform. The user tapped Answer in
 * CallKit or the Android telecom notification, not in our own UI.
 */
export interface CallKeepEvents {
  answer: { callId: string };
  end: { callId: string };
  mute: { callId: string; muted: boolean };
  hold: { callId: string; held: boolean };
  dtmf: { callId: string; digits: string };
  /** iOS only: CallKit has handed us the audio session. */
  audioSessionActivated: undefined;
  audioSessionDeactivated: undefined;
  /** The user dialled from Contacts/Recents and the OS routed it to us. */
  startCall: { handle: string; callId?: string; video: boolean };
}

const OPTIONS: IOptions = {
  ios: {
    appName: 'AthenaPhone',
    supportsVideo: true,
    maximumCallGroups: '2',
    maximumCallsPerCallGroup: '4',
    includesCallsInRecents: true,
  },
  android: {
    alertTitle: 'Phone account permission',
    alertDescription:
      'AthenaPhone needs permission to manage calls so incoming SIP calls ' +
      'can use the system call screen.',
    cancelButton: 'Not now',
    okButton: 'Continue',
    additionalPermissions: [],
    // Self-managed keeps our calls out of the system dialer's call log and
    // lets us render our own in-call UI.
    selfManaged: true,
    foregroundService: {
      channelId: 'com.athenaphone.calls',
      channelName: 'AthenaPhone calls',
      notificationTitle: 'AthenaPhone is running',
    },
  },
};

/**
 * Bridges AthenaPhone to CallKit (iOS) and ConnectionService (Android) so
 * calls appear on the lock screen and survive backgrounding.
 *
 * Call ids are UUIDs shared with `SipClient` - the same string identifies a
 * call here and there, which is why `uuidv4()` is used for `Call.id`.
 */
class CallKeepServiceImpl extends TypedEmitter<CallKeepEvents> {
  private ready = false;
  /**
   * Outbound calls we have just reported, by call id and by dialled handle.
   *
   * Telecom echoes `RNCallKeep.startCall()` straight back as
   * `didReceiveStartCallAction`. That event is meant for calls dialled from
   * outside the app - the system dialer, Contacts, a tel: link - so acting
   * on it is correct in general, but acting on our own echo places the call a
   * second time. See `bindEvents`.
   */
  private readonly selfInitiated = new Map<string, number>();

  /** How long an echo can plausibly take to come back. */
  private static readonly ECHO_WINDOW_MS = 5000;

  async setup(): Promise<boolean> {
    if (this.ready) {
      return true;
    }
    try {
      await RNCallKeep.setup(OPTIONS);
      if (Platform.OS === 'android') {
        RNCallKeep.setAvailable(true);
        RNCallKeep.registerAndroidEvents();
      }
      RNCallKeep.canMakeMultipleCalls(true);
      this.bindEvents();
      this.ready = true;

      // Clears anything left in CallKeep's own connection map - a JS reload
      // with a call up, or a second init.
      //
      // It does NOT clear an orphan from a previous *process*: endAllCalls
      // iterates VoiceConnectionService.currentConnections, which is static
      // and therefore empty in a fresh process. A connection left behind by a
      // crash lives on in the system telecom service, where nothing this app
      // can call will reach it. The symptom is Android asking "placing this
      // call will end your AthenaPhone call" before every outbound call, with
      // no call anywhere in the app to end.
      //
      // Recovery is to unregister the phone account and restart:
      //
      //   adb shell telecom unregister-phone-account \
      //     com.athenaphone/io.wazo.callkeep.VoiceConnectionService AthenaPhone 0
      //
      // The real defence is not creating orphans: never let an exception
      // escape into a ConnectionService callback, and never report a call to
      // telecom that we will not also report the end of.
      RNCallKeep.endAllCalls();

      return true;
    } catch (error) {
      // A device without a telecom stack, or a user who declined the phone
      // account. The app still works; calls just use our own UI only.
      console.warn('[callkeep] setup failed, falling back to in-app UI', error);
      return false;
    }
  }

  get isReady(): boolean {
    return this.ready;
  }

  teardown(): void {
    if (Platform.OS === 'android') {
      RNCallKeep.setAvailable(false);
      RNCallKeep.unregisterAndroidEvents();
    }
    this.removeAllListeners();
    this.ready = false;
  }

  // ------------------------------------------------------------- reporting

  /** Tell the OS a call is ringing so it can show the incoming-call screen. */
  reportIncoming(call: Call): void {
    if (!this.ready) {
      return;
    }
    RNCallKeep.displayIncomingCall(
      call.id,
      displayTarget(call.remoteUri),
      call.remoteDisplayName ?? displayTarget(call.remoteUri),
      'number',
      call.hasVideo,
    );
  }

  /** Tell the OS we are placing a call, so it can suspend other audio. */
  reportOutgoing(call: Call): void {
    if (!this.ready) {
      return;
    }
    const handle = displayTarget(call.remoteUri);
    // Record before telling telecom, because the echo can arrive immediately.
    this.rememberSelfInitiated(call.id);
    this.rememberSelfInitiated(handle);

    RNCallKeep.startCall(
      call.id,
      handle,
      call.remoteDisplayName ?? handle,
      'number',
      call.hasVideo,
    );
  }

  /** Note that we started this call, so the telecom echo can be dropped. */
  private rememberSelfInitiated(key: string): void {
    const now = Date.now();
    this.selfInitiated.set(key, now);

    for (const [existing, at] of this.selfInitiated) {
      if (now - at > CallKeepServiceImpl.ECHO_WINDOW_MS) {
        this.selfInitiated.delete(existing);
      }
    }
  }

  /** True when this start action is telecom repeating our own request back. */
  private isSelfInitiated(...keys: (string | undefined)[]): boolean {
    const now = Date.now();
    return keys.some(key => {
      if (!key) {
        return false;
      }
      const at = this.selfInitiated.get(key);
      return at !== undefined && now - at <= CallKeepServiceImpl.ECHO_WINDOW_MS;
    });
  }

  /** Outbound call reached 180 Ringing. */
  reportRinging(callId: string): void {
    if (this.ready && Platform.OS === 'ios') {
      RNCallKeep.reportConnectingOutgoingCallWithUUID(callId);
    }
  }

  /** Media is flowing; start the system call timer. */
  reportConnected(callId: string, direction: Call['direction']): void {
    if (!this.ready) {
      return;
    }
    if (direction === 'outbound' && Platform.OS === 'ios') {
      RNCallKeep.reportConnectedOutgoingCallWithUUID(callId);
    }
    RNCallKeep.setCurrentCallActive(callId);
  }

  /**
   * Remove the call from the system UI. `remote` distinguishes "they hung up"
   * from "we hung up", which changes what the OS logs.
   */
  reportEnded(
    callId: string,
    reason: 'local' | 'remote' | 'missed' | 'failed',
  ): void {
    if (!this.ready) {
      return;
    }
    if (reason === 'local') {
      RNCallKeep.endCall(callId);
      return;
    }
    const code =
      reason === 'missed'
        ? CK.END_CALL_REASONS.MISSED
        : reason === 'failed'
        ? CK.END_CALL_REASONS.FAILED
        : CK.END_CALL_REASONS.REMOTE_ENDED;
    RNCallKeep.reportEndCallWithUUID(callId, code);
  }

  endAll(): void {
    if (this.ready) {
      RNCallKeep.endAllCalls();
    }
  }

  /** Mirror in-app mute/hold into the system UI so the two agree. */
  syncMuted(callId: string, muted: boolean): void {
    if (this.ready && Platform.OS === 'ios') {
      RNCallKeep.setMutedCall(callId, muted);
    }
  }

  syncHold(callId: string, held: boolean): void {
    if (this.ready) {
      RNCallKeep.setOnHold(callId, held);
    }
  }

  /** Replace the placeholder handle once we know who is really calling. */
  updateDisplay(call: Call): void {
    if (this.ready) {
      RNCallKeep.updateDisplay(
        call.id,
        call.remoteDisplayName ?? displayTarget(call.remoteUri),
        displayTarget(call.remoteUri),
      );
    }
  }

  // ---------------------------------------------------------------- events

  private bindEvents(): void {
    RNCallKeep.addEventListener('answerCall', ({ callUUID }) => {
      this.emit('answer', { callId: callUUID });
    });

    RNCallKeep.addEventListener('endCall', ({ callUUID }) => {
      this.emit('end', { callId: callUUID });
    });

    RNCallKeep.addEventListener(
      'didPerformSetMutedCallAction',
      ({ callUUID, muted }) => {
        this.emit('mute', { callId: callUUID, muted });
      },
    );

    RNCallKeep.addEventListener(
      'didToggleHoldCallAction',
      ({ callUUID, hold }) => {
        this.emit('hold', { callId: callUUID, held: hold });
      },
    );

    RNCallKeep.addEventListener(
      'didPerformDTMFAction',
      ({ callUUID, digits }) => {
        this.emit('dtmf', { callId: callUUID, digits });
      },
    );

    RNCallKeep.addEventListener('didActivateAudioSession', () => {
      this.emit('audioSessionActivated', undefined);
    });

    RNCallKeep.addEventListener('didDeactivateAudioSession', () => {
      this.emit('audioSessionDeactivated', undefined);
    });

    // Calls dialled from outside the app - the system dialer, Contacts, a
    // tel: link - arrive here, and we place them. Our own outbound calls
    // arrive here too, because telecom echoes RNCallKeep.startCall() back,
    // and placing those again is how one tap became two calls a second apart.
    RNCallKeep.addEventListener(
      'didReceiveStartCallAction',
      ({ handle, callUUID }) => {
        if (!handle) {
          return;
        }
        if (this.isSelfInitiated(callUUID, handle)) {
          return;
        }
        this.emit('startCall', { handle, callId: callUUID, video: false });
      },
    );
  }
}

export const CallKeepService = new CallKeepServiceImpl();
