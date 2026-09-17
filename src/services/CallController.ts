//
// AthenaPhone - Open Source SIP Softphone
//
// Copyright (C) 2026 Tom Cully <mail@tomcully.com>
// Licensed under the GNU GPLv3 - see <https://www.gnu.org/licenses/gpl-3.0.html>
//

import { Platform } from 'react-native';

import { sipClient } from '../sip/SipClient';
import { useAccountStore } from '../store/accountStore';
import { useCallStore } from '../store/callStore';
import { useHistoryStore } from '../store/historyStore';
import { useSettingsStore } from '../store/settingsStore';
import type { Call, SipAccount } from '../types';
import { AudioService } from './AudioService';
import { CallKeepService } from './CallKeepService';
import { CredentialStore } from './CredentialStore';
import { PermissionsService } from './PermissionsService';

/**
 * The seam between the SIP engine and everything platform-shaped.
 *
 * `SipClient` knows nothing about CallKit, audio routing or persistence; the
 * stores know nothing about SIP. This module is the only place that knows
 * about both, so call actions from the UI go through here rather than
 * touching `sipClient` directly.
 */
class CallControllerImpl {
  private initialized = false;
  private unsubscribers: (() => void)[] = [];
  /** iOS defers audio to CallKit; this is the call waiting for that handshake. */
  private pendingAudioCallId?: string;

  async init(): Promise<void> {
    if (this.initialized) {
      return;
    }
    this.initialized = true;

    if (useSettingsStore.getState().useSystemCallUi) {
      await CallKeepService.setup();
    }
    this.bindSipEvents();
    this.bindCallKeepEvents();
  }

  // ------------------------------------------------------------- account

  /** Bring the active account online. Safe to call repeatedly. */
  async connectActiveAccount(): Promise<void> {
    const account = useAccountStore.getState().activeAccount();
    if (!account || !account.enabled) {
      await sipClient.stop();
      return;
    }
    await this.connect(account);
  }

  async connect(account: SipAccount): Promise<void> {
    const password = await CredentialStore.load(account.id);
    if (password === undefined) {
      useAccountStore.getState().setRegistration({
        state: 'failed',
        reason: 'No saved password for this account',
      });
      return;
    }
    await sipClient.start(account, password);
  }

  async disconnect(): Promise<void> {
    await sipClient.stop();
    useCallStore.getState().reset();
  }

  // ---------------------------------------------------------------- calls

  /**
   * Place a call. Throws if the microphone is denied, so the caller can show
   * a message rather than leaving a dead call on screen.
   */
  async placeCall(target: string, video?: boolean): Promise<Call> {
    const settings = useSettingsStore.getState();
    const wantsVideo = video ?? settings.preferVideo;

    const granted = await PermissionsService.requestForCall(wantsVideo);
    if (!granted) {
      throw new Error('Microphone permission is required to place a call');
    }

    const call = await sipClient.placeCall(target, { video: wantsVideo });
    CallKeepService.reportOutgoing(call);
    this.startAudio(call);
    return call;
  }

  async answerCall(callId: string, withVideo?: boolean): Promise<void> {
    const call = sipClient.getCall(callId);
    if (!call) {
      return;
    }
    const wantsVideo = withVideo ?? call.hasVideo;

    const granted = await PermissionsService.requestForCall(wantsVideo);
    if (!granted) {
      sipClient.rejectCall(callId);
      return;
    }

    AudioService.stopRingtone();
    await sipClient.answerCall(callId, wantsVideo);
    this.startAudio({ ...call, hasVideo: wantsVideo });
  }

  rejectCall(callId: string): void {
    AudioService.stopRingtone();
    sipClient.rejectCall(callId);
  }

  hangup(callId: string): void {
    sipClient.hangup(callId);
  }

  setMuted(callId: string, muted: boolean): void {
    sipClient.setMuted(callId, muted);
    AudioService.setMicrophoneMuted(muted);
    CallKeepService.syncMuted(callId, muted);
  }

  setHold(callId: string, held: boolean): void {
    sipClient.setHold(callId, held);
    CallKeepService.syncHold(callId, held);
  }

  setSpeaker(callId: string, on: boolean): void {
    AudioService.setSpeaker(on);
    const call = sipClient.getCall(callId);
    if (call) {
      useCallStore.getState().upsertCall({ ...call, speakerOn: on });
    }
  }

  setVideoEnabled(callId: string, enabled: boolean): void {
    sipClient.setVideoEnabled(callId, enabled);
  }

  switchCamera(callId: string): void {
    sipClient.switchCamera(callId);
  }

  async upgradeToVideo(callId: string): Promise<void> {
    const granted = await PermissionsService.requestForCall(true);
    if (!granted) {
      throw new Error('Camera permission is required for video');
    }
    await sipClient.upgradeToVideo(callId);
    AudioService.start(true);
  }

  sendDtmf(callId: string, digit: string): void {
    sipClient.sendDtmf(callId, digit);
    useCallStore.getState().appendDtmf(digit);
  }

  blindTransfer(callId: string, target: string): void {
    sipClient.blindTransfer(callId, target);
  }

  attendedTransfer(callId: string, consultCallId: string): void {
    sipClient.attendedTransfer(callId, consultCallId);
  }

  /**
   * Put the current call on hold and dial a second party, which is the first
   * half of an attended transfer and also how you start a conference.
   */
  async startConsultationCall(
    activeCallId: string,
    target: string,
  ): Promise<Call> {
    this.setHold(activeCallId, true);
    return this.placeCall(target, false);
  }

  // --------------------------------------------------------------- wiring

  private bindSipEvents(): void {
    const callStore = useCallStore.getState();

    this.unsubscribers.push(
      sipClient.on('registration', status => {
        useAccountStore.getState().setRegistration(status);
      }),

      sipClient.on('call:new', call => {
        callStore.upsertCall(call);
        if (call.direction === 'inbound') {
          this.handleIncoming(call);
        }
      }),

      sipClient.on('call:update', call => {
        useCallStore.getState().upsertCall(call);

        if (call.state === 'ringing' && call.direction === 'outbound') {
          CallKeepService.reportRinging(call.id);
          AudioService.startRingback();
        }
        if (call.state === 'active') {
          AudioService.stopRingback();
          CallKeepService.reportConnected(call.id, call.direction);
        }
      }),

      sipClient.on('call:streams', ({ callId, local, remote }) => {
        useCallStore.getState().setStreams(callId, { local, remote });
      }),

      sipClient.on('call:ended', call => {
        this.handleEnded(call);
      }),

      sipClient.on('dtmf:received', ({ callId, tone }) => {
        console.log(`[call ${callId}] remote DTMF: ${tone}`);
      }),
    );
  }

  private bindCallKeepEvents(): void {
    this.unsubscribers.push(
      CallKeepService.on('answer', ({ callId }) => {
        void this.answerCall(callId);
      }),

      CallKeepService.on('end', ({ callId }) => {
        // Covers both "decline" while ringing and "hang up" while connected.
        const call = sipClient.getCall(callId);
        if (call?.state === 'ringing' && call.direction === 'inbound') {
          this.rejectCall(callId);
        } else {
          this.hangup(callId);
        }
      }),

      CallKeepService.on('mute', ({ callId, muted }) => {
        sipClient.setMuted(callId, muted);
        AudioService.setMicrophoneMuted(muted);
      }),

      CallKeepService.on('hold', ({ callId, held }) => {
        sipClient.setHold(callId, held);
      }),

      CallKeepService.on('dtmf', ({ callId, digits }) => {
        sipClient.sendDtmf(callId, digits);
      }),

      // iOS hands us the audio session only after CallKit has set it up.
      CallKeepService.on('audioSessionActivated', () => {
        const callId = this.pendingAudioCallId;
        const call = callId ? sipClient.getCall(callId) : undefined;
        AudioService.start(call?.hasVideo ?? false);
        this.pendingAudioCallId = undefined;
      }),

      CallKeepService.on('audioSessionDeactivated', () => {
        AudioService.stop();
      }),

      CallKeepService.on('startCall', ({ handle, video }) => {
        void this.placeCall(handle, video);
      }),
    );
  }

  private handleIncoming(call: Call): void {
    const settings = useSettingsStore.getState();

    if (settings.useSystemCallUi && CallKeepService.isReady) {
      // CallKit / ConnectionService owns the ringtone and the call screen.
      CallKeepService.reportIncoming(call);
    } else if (settings.ringtoneEnabled) {
      AudioService.startRingtone();
    }

    if (settings.autoAnswer) {
      void this.answerCall(call.id);
    }
  }

  private handleEnded(call: Call): void {
    const store = useCallStore.getState();
    store.removeCall(call.id);
    void useHistoryStore.getState().recordCall(call);

    const wasMissed =
      call.direction === 'inbound' && call.answeredAt === undefined;
    CallKeepService.reportEnded(
      call.id,
      wasMissed
        ? 'missed'
        : call.state === 'failed'
        ? 'failed'
        : call.endReason === 'local-hangup'
        ? 'local'
        : 'remote',
    );

    // Only release the audio session once the last leg is gone, so ending a
    // consultation call does not mute the call we are returning to.
    if (useCallStore.getState().calls.length === 0) {
      AudioService.stop(call.endReason === 'busy');
      this.pendingAudioCallId = undefined;
    }
  }

  /**
   * Enter in-call audio mode. On iOS this waits for CallKit's
   * `didActivateAudioSession`; on Android we can start right away.
   */
  private startAudio(call: Call): void {
    if (Platform.OS === 'ios' && CallKeepService.isReady) {
      this.pendingAudioCallId = call.id;
      return;
    }
    AudioService.start(call.hasVideo);
  }

  dispose(): void {
    for (const unsubscribe of this.unsubscribers) {
      unsubscribe();
    }
    this.unsubscribers = [];
    CallKeepService.teardown();
    this.initialized = false;
  }
}

export const CallController = new CallControllerImpl();
