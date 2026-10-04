//
// AthenaPhone - Open Source SIP Softphone
//
// Copyright (C) 2026 Tom Cully <mail@tomcully.com>
// Licensed under the GNU GPLv3 - see <https://www.gnu.org/licenses/gpl-3.0.html>
//

import React, { useCallback, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutRectangle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RTCView } from 'react-native-webrtc';

import { ActionButton } from '../components/ActionButton';
import { Dialpad } from '../components/Dialpad';
import {
  CameraFlipIcon,
  KeypadIcon,
  MicIcon,
  MicOffIcon,
  PauseIcon,
  PhoneDownIcon,
  PhoneIcon,
  SpeakerIcon,
  TransferIcon,
  VideoIcon,
} from '../components/Icons';
import { Watermark } from '../components/Logo';
import { PromptModal } from '../components/PromptModal';
import { StatusDot } from '../components/StatusDot';
import {
  VideoCallToolbar,
  type ToolbarAction,
} from '../components/VideoCallToolbar';
import { useCallTimer } from '../hooks/useCallTimer';
import { useCriticalAction } from '../hooks/useCriticalAction';
import { CallController } from '../services/CallController';
import { Dialog } from '../store/dialogStore';
import { selectFocusedCall, useCallStore } from '../store/callStore';
import {
  colors,
  monospace,
  radius,
  space,
  type as typography,
  type StatusTone,
} from '../theme';
import type { Call } from '../types';
import { displayTarget } from '../utils/sipUri';

/** What the header says while the call is not yet up. */
const STATE_LABEL: Record<Call['state'], string> = {
  idle: '',
  connecting: 'Calling',
  ringing: 'Ringing',
  answering: 'Connecting',
  active: '',
  held: 'On hold',
  'remote-held': 'Held by remote',
  ended: 'Call ended',
  failed: 'Call failed',
};

const STATE_TONE: Record<Call['state'], StatusTone> = {
  idle: 'unknown',
  connecting: 'warn',
  ringing: 'warn',
  answering: 'warn',
  active: 'ok',
  held: 'warn',
  'remote-held': 'warn',
  ended: 'unknown',
  failed: 'fault',
};

export function CallScreen() {
  const call = useCallStore(selectFocusedCall);
  const calls = useCallStore(state => state.calls);
  const localStream = useCallStore(state =>
    call ? state.localStreams[call.id] : undefined,
  );
  const remoteStream = useCallStore(state =>
    call ? state.remoteStreams[call.id] : undefined,
  );
  const dtmfBuffer = useCallStore(state => state.dtmfBuffer);

  const [showKeypad, setShowKeypad] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const [area, setArea] = useState<LayoutRectangle | null>(null);
  const timer = useCallTimer(call);

  const sendDtmf = useCallback(
    (digit: string) => {
      if (call) {
        CallController.sendDtmf(call.id, digit);
      }
    },
    [call],
  );

  const callId = call?.id;

  // Everything that starts, answers, ends or redirects a call is guarded:
  // these are the controls people press twice when nothing appears to happen.
  const { run: answer, busy: answering } = useCriticalAction(
    async (withVideo: boolean) => {
      if (callId) {
        await CallController.answerCall(callId, withVideo);
      }
    },
  );

  const { run: decline, busy: declining } = useCriticalAction(() => {
    if (callId) {
      CallController.rejectCall(callId);
    }
  });

  const { run: hangup, busy: hangingUp } = useCriticalAction(() => {
    if (callId) {
      CallController.hangup(callId);
    }
  });

  const { run: upgradeToVideo, busy: upgradingVideo } = useCriticalAction(
    async () => {
      if (!callId) {
        return;
      }
      try {
        await CallController.upgradeToVideo(callId);
      } catch (error) {
        void Dialog.alert(
          'Could not start video',
          error instanceof Error ? error.message : 'Unknown error',
        );
      }
    },
  );

  const { run: doTransfer } = useCriticalAction((target: string) => {
    setShowTransfer(false);
    if (callId) {
      CallController.blindTransfer(callId, target);
    }
  });

  if (!call) {
    return null;
  }

  const isIncomingRinging =
    call.direction === 'inbound' && call.state === 'ringing';
  const isConnected =
    call.state === 'active' ||
    call.state === 'held' ||
    call.state === 'remote-held';

  const name = call.remoteDisplayName ?? displayTarget(call.remoteUri);
  const showVideo = call.hasVideo && Boolean(remoteStream);
  // With a picture up, the controls shrink to a bar that can be dragged off
  // whatever it would cover. The keypad still takes the full footer.
  const compact = showVideo && !isIncomingRinging && !showKeypad;

  const toolbarActions: ToolbarAction[] = [
    {
      label: call.muted ? 'Unmute' : 'Mute',
      Icon: call.muted ? MicOffIcon : MicIcon,
      tone: call.muted ? 'active' : 'neutral',
      onPress: () => CallController.setMuted(call.id, !call.muted),
    },
    {
      label: 'Speaker',
      Icon: SpeakerIcon,
      tone: call.speakerOn ? 'active' : 'neutral',
      onPress: () => CallController.setSpeaker(call.id, !call.speakerOn),
    },
    {
      label: 'Flip camera',
      Icon: CameraFlipIcon,
      onPress: () => CallController.switchCamera(call.id),
    },
    { label: 'Keypad', Icon: KeypadIcon, onPress: () => setShowKeypad(true) },
    {
      label: 'Hold',
      Icon: PauseIcon,
      tone: call.state === 'held' ? 'active' : 'neutral',
      disabled: !isConnected,
      onPress: () => CallController.setHold(call.id, call.state !== 'held'),
    },
    {
      label: 'Transfer',
      Icon: TransferIcon,
      disabled: !isConnected,
      onPress: () => setShowTransfer(true),
    },
    {
      label: 'End call',
      Icon: PhoneDownIcon,
      tone: 'reject',
      disabled: hangingUp,
      onPress: hangup,
    },
  ];

  return (
    <View style={styles.screen}>
      {showVideo && remoteStream ? (
        <RTCView
          streamURL={remoteStream.toURL()}
          style={StyleSheet.absoluteFill}
          objectFit="cover"
          zOrder={0}
        />
      ) : (
        // Only when there is no picture: drawing over remote video is a
        // defect, not decoration.
        <Watermark />
      )}

      <SafeAreaView
        style={styles.content}
        edges={['top', 'bottom']}
        onLayout={event => {
          const { width, height } = event.nativeEvent.layout;
          setArea({ x: 0, y: 0, width, height });
        }}
      >
        {compact ? null : (
          <View style={styles.header}>
            <View style={styles.kindRow}>
              <StatusDot tone={STATE_TONE[call.state]} />
              <Text style={styles.kind}>
                {call.direction === 'inbound' ? 'Incoming' : 'Outgoing'}
                {call.hasVideo ? ' video' : ''}
              </Text>
            </View>

            <Text style={styles.name} numberOfLines={1} adjustsFontSizeToFit>
              {name}
            </Text>

            {name !== displayTarget(call.remoteUri) ? (
              <Text style={styles.uri}>{displayTarget(call.remoteUri)}</Text>
            ) : null}

            <Text style={styles.status}>
              {timer || STATE_LABEL[call.state]}
            </Text>

            {calls.length > 1 ? (
              <Text style={styles.otherCalls}>
                {calls.length - 1} other call{calls.length > 2 ? 's' : ''} on
                hold
              </Text>
            ) : null}
          </View>
        )}

        {call.hasVideo && localStream ? (
          <View style={styles.pip}>
            <RTCView
              streamURL={localStream.toURL()}
              style={styles.pipVideo}
              objectFit="cover"
              mirror
              zOrder={1}
            />
          </View>
        ) : null}

        {compact ? (
          <View style={styles.toolbarSlot} pointerEvents="box-none">
            <VideoCallToolbar
              title={name}
              status={timer || STATE_LABEL[call.state]}
              actions={toolbarActions}
              bounds={area}
            />
          </View>
        ) : null}

        <View style={[styles.footer, compact && styles.footerCompact]}>
          {compact ? null : showKeypad ? (
            <View style={styles.keypad}>
              <Text style={styles.dtmf} numberOfLines={1}>
                {dtmfBuffer || ' '}
              </Text>
              <Dialpad onPress={sendDtmf} compact />
              <Pressable onPress={() => setShowKeypad(false)} hitSlop={12}>
                <Text style={styles.hideKeypad}>Hide keypad</Text>
              </Pressable>
            </View>
          ) : isIncomingRinging ? (
            <View style={styles.controls}>
              <ActionButton
                label="Decline"
                Icon={PhoneDownIcon}
                tone="reject"
                size={70}
                disabled={declining}
                onPress={decline}
              />
              {call.hasVideo ? (
                <ActionButton
                  label="Audio"
                  Icon={PhoneIcon}
                  tone="accept"
                  size={70}
                  disabled={answering}
                  onPress={() => answer(false)}
                />
              ) : null}
              <ActionButton
                label={call.hasVideo ? 'Video' : 'Answer'}
                Icon={call.hasVideo ? VideoIcon : PhoneIcon}
                tone="accept"
                size={70}
                onPress={() =>
                  CallController.answerCall(call.id, call.hasVideo)
                }
              />
            </View>
          ) : (
            <>
              <View style={styles.controls}>
                <ActionButton
                  label={call.muted ? 'Unmute' : 'Mute'}
                  Icon={call.muted ? MicOffIcon : MicIcon}
                  tone={call.muted ? 'active' : 'neutral'}
                  onPress={() => CallController.setMuted(call.id, !call.muted)}
                />
                <ActionButton
                  label="Keypad"
                  Icon={KeypadIcon}
                  onPress={() => setShowKeypad(true)}
                />
                <ActionButton
                  label="Speaker"
                  Icon={SpeakerIcon}
                  tone={call.speakerOn ? 'active' : 'neutral'}
                  onPress={() =>
                    CallController.setSpeaker(call.id, !call.speakerOn)
                  }
                />
              </View>

              <View style={styles.controls}>
                <ActionButton
                  label="Hold"
                  Icon={PauseIcon}
                  tone={call.state === 'held' ? 'active' : 'neutral'}
                  disabled={!isConnected}
                  onPress={() =>
                    CallController.setHold(call.id, call.state !== 'held')
                  }
                />
                <ActionButton
                  label="Transfer"
                  Icon={TransferIcon}
                  disabled={!isConnected}
                  onPress={() => setShowTransfer(true)}
                />
                {call.hasVideo ? (
                  <ActionButton
                    label="Flip"
                    Icon={CameraFlipIcon}
                    onPress={() => CallController.switchCamera(call.id)}
                  />
                ) : (
                  <ActionButton
                    label="Video"
                    Icon={VideoIcon}
                    disabled={!isConnected || upgradingVideo}
                    onPress={upgradeToVideo}
                  />
                )}
              </View>
            </>
          )}

          <PromptModal
            visible={showTransfer}
            title="Blind transfer"
            message="The call is handed to this number and you drop out."
            placeholder="Number or SIP address"
            confirmLabel="Transfer"
            keyboardType="phone-pad"
            onConfirm={doTransfer}
            onCancel={() => setShowTransfer(false)}
          />

          {isIncomingRinging || compact ? null : (
            <View style={styles.hangupRow}>
              <ActionButton
                label="End call"
                Icon={PhoneDownIcon}
                tone="reject"
                size={70}
                disabled={hangingUp}
                onPress={hangup}
              />
            </View>
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1, justifyContent: 'space-between' },
  header: {
    alignItems: 'center',
    gap: space.sm,
    paddingTop: space.xxl,
    paddingHorizontal: space.xl,
  },
  kindRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  kind: { ...typography.micro, color: colors.textDim },
  name: {
    fontSize: 30,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
  },
  uri: { ...typography.caption, color: colors.textFaint },
  status: {
    ...typography.body,
    fontSize: 17,
    color: colors.textDim,
    marginTop: space.xs,
    fontVariant: ['tabular-nums'],
  },
  otherCalls: { ...typography.caption, color: colors.textFaint },
  pip: {
    position: 'absolute',
    top: space.xxl * 2,
    right: space.lg,
    width: 96,
    height: 140,
    borderRadius: radius.md,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  pipVideo: { flex: 1 },
  footer: { gap: space.xl, paddingBottom: space.lg },
  footerCompact: { paddingBottom: 0 },
  // Fills the content area so the toolbar's own layout is in the same
  // coordinates as the drag bounds; passes touches through where empty.
  toolbarSlot: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    justifyContent: 'flex-end',
    paddingBottom: space.lg,
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: space.md,
  },
  hangupRow: { alignItems: 'center', paddingTop: space.sm },
  keypad: { alignItems: 'center', gap: space.lg },
  dtmf: {
    fontFamily: monospace,
    fontSize: 22,
    letterSpacing: 3,
    color: colors.text,
    minHeight: 28,
  },
  hideKeypad: {
    ...typography.label,
    color: colors.textDim,
    paddingVertical: space.md,
  },
});
