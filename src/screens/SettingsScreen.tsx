//
// AthenaPhone - Open Source SIP Softphone
//
// Copyright (C) 2026 Tom Cully <mail@tomcully.com>
// Licensed under the GNU GPLv3 - see <https://www.gnu.org/licenses/gpl-3.0.html>
//

import React, { useCallback } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Row } from '../components/Row';
import { Screen } from '../components/Screen';
import { SectionLabel } from '../components/SectionLabel';
import { Toggle } from '../components/Toggle';
import { CallController } from '../services/CallController';
import { Dialog } from '../store/dialogStore';
import { useAccountStore } from '../store/accountStore';
import { useSettingsStore, type AppSettings } from '../store/settingsStore';
import {
  colors,
  radius,
  space,
  type as typography,
  TOUCH_TARGET,
  type StatusTone,
} from '../theme';
import type { SipAccount } from '../types';

interface SettingsScreenProps {
  onEditAccount: (accountId?: string) => void;
}

export function SettingsScreen({ onEditAccount }: SettingsScreenProps) {
  const accounts = useAccountStore(state => state.accounts);
  const activeAccountId = useAccountStore(state => state.activeAccountId);
  const registration = useAccountStore(state => state.registration);
  const setActiveAccount = useAccountStore(state => state.setActiveAccount);
  const removeAccount = useAccountStore(state => state.removeAccount);

  const settings = useSettingsStore();

  const update = useCallback(
    <K extends keyof AppSettings>(key: K) =>
      (value: AppSettings[K]) => {
        void settings.set(key, value);
      },
    [settings],
  );

  const selectAccount = useCallback(
    async (account: SipAccount) => {
      await setActiveAccount(account.id);
      await CallController.connectActiveAccount();
    },
    [setActiveAccount],
  );

  const accountActions = useCallback(
    (account: SipAccount) => {
      void Dialog.actions({
        title: account.name,
        message: account.domain,
        actions: [
          { label: 'Edit', onPress: () => onEditAccount(account.id) },
          {
            label: 'Delete',
            tone: 'danger',
            onPress: () => {
              void removeAccount(account.id).then(() =>
                CallController.connectActiveAccount(),
              );
            },
          },
        ],
      });
    },
    [onEditAccount, removeAccount],
  );

  const toneFor = (account: SipAccount): StatusTone => {
    if (account.id !== activeAccountId) {
      return 'unknown';
    }
    return (
      {
        registered: 'ok',
        registering: 'warn',
        unregistered: 'unknown',
        failed: 'fault',
      } as const
    )[registration.state];
  };

  const summaryFor = (account: SipAccount): string => {
    if (account.id !== activeAccountId) {
      return 'Inactive';
    }
    return {
      registered: 'Registered',
      registering: 'Connecting',
      unregistered: 'Offline',
      failed: registration.reason ?? 'Registration failed',
    }[registration.state];
  };

  return (
    <Screen title="Settings">
      <ScrollView contentContainerStyle={styles.content}>
        <SectionLabel trailing={`${accounts.length}`}>
          SIP accounts
        </SectionLabel>
        <View style={styles.group}>
          {accounts.map(account => (
            <Row
              key={account.id}
              title={account.name}
              detail={`${account.username}@${account.domain}`}
              meta={summaryFor(account)}
              tone={toneFor(account)}
              showDot
              onPress={() => void selectAccount(account)}
              onLongPress={() => accountActions(account)}
            />
          ))}

          <Pressable
            onPress={() => onEditAccount(undefined)}
            style={styles.addButton}
          >
            <Text style={styles.addLabel}>Add account</Text>
          </Pressable>
        </View>

        <SectionLabel>Calls</SectionLabel>
        <View style={styles.group}>
          <Toggle
            label="System call screen"
            detail="Show incoming calls in CallKit or the Android telecom UI"
            value={settings.useSystemCallUi}
            onChange={update('useSystemCallUi')}
          />
          <Toggle
            label="Auto answer"
            detail="Answer incoming calls without touching the phone"
            value={settings.autoAnswer}
            onChange={update('autoAnswer')}
          />
          <Toggle
            label="Prefer video"
            detail="Dial with video by default"
            value={settings.preferVideo}
            onChange={update('preferVideo')}
          />
          <Toggle
            label="Speaker for video calls"
            detail="Route video call audio to the loudspeaker"
            value={settings.autoSpeakerOnVideo}
            onChange={update('autoSpeakerOnVideo')}
          />
          <Toggle
            label="Start video muted"
            detail="Join video calls with the camera off"
            value={settings.startVideoMuted}
            onChange={update('startVideoMuted')}
          />
        </View>

        <SectionLabel>Alerts</SectionLabel>
        <View style={styles.group}>
          <Toggle
            label="Ringtone"
            detail="Ring for incoming calls. Android rings in-app even with the system call screen on."
            value={settings.ringtoneEnabled}
            onChange={update('ringtoneEnabled')}
            disabled={settings.useSystemCallUi}
          />
          <Toggle
            label="Vibrate"
            value={settings.vibrateOnRing}
            onChange={update('vibrateOnRing')}
          />
          <Toggle
            label="Dialpad feedback"
            detail="Haptic feedback on each key press"
            value={settings.dialpadTones}
            onChange={update('dialpadTones')}
          />
        </View>

        <SectionLabel>Diagnostics</SectionLabel>
        <View style={styles.group}>
          <Toggle
            label="Verbose SIP logging"
            detail="Print SIP signalling to the console. Noisy."
            value={settings.verboseSipLogging}
            onChange={update('verboseSipLogging')}
          />
          <Pressable
            onPress={() => void CallController.connectActiveAccount()}
            style={styles.addButton}
          >
            <Text style={styles.addLabel}>Reconnect</Text>
          </Pressable>
        </View>

        <Text style={styles.footer}>AthenaPhone - open source SIP client</Text>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: space.xxl },
  group: { paddingHorizontal: space.lg, gap: space.sm },
  addButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: TOUCH_TARGET,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: 'dashed',
    borderColor: colors.borderStrong,
  },
  addLabel: { ...typography.label, color: colors.accentText },
  footer: {
    ...typography.caption,
    color: colors.textFaint,
    textAlign: 'center',
    paddingTop: space.xl,
  },
});
