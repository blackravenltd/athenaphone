//
// AthenaPhone - Open Source SIP Softphone
//
// Copyright (C) 2026 Tom Cully <mail@tomcully.com>
// Licensed under the GNU GPLv3 - see <https://www.gnu.org/licenses/gpl-3.0.html>
//

import React, { useCallback, useState } from 'react';
import {
  Pressable, StyleSheet, Text, View } from 'react-native';

import { Dialpad } from '../components/Dialpad';
import { BackspaceIcon, PhoneIcon, VideoIcon } from '../components/Icons';
import { RegistrationBanner } from '../components/RegistrationBanner';
import { Screen } from '../components/Screen';
import { CallController } from '../services/CallController';
import { Dialog } from '../store/dialogStore';
import { useAccountStore } from '../store/accountStore';
import {
  colors,
  radius,
  space,
  type as typography,
  TOUCH_TARGET,
} from '../theme';

export function DialerScreen() {
  const [target, setTarget] = useState('');
  const account = useAccountStore(state => state.activeAccount());
  const registration = useAccountStore(state => state.registration);

  const canDial = registration.state === 'registered' && target.length > 0;

  const append = useCallback((digit: string) => {
    setTarget(current => current + digit);
  }, []);

  const handleLongPress = useCallback(
    (digit: string) => {
      if (digit === '0') {
        setTarget(current => `${current}+`);
      } else if (digit === '1' && account?.voicemailNumber) {
        setTarget(account.voicemailNumber);
      }
    },
    [account],
  );

  const dial = useCallback(
    async (video: boolean) => {
      if (!canDial) {
        return;
      }
      try {
        await CallController.placeCall(target, video);
        setTarget('');
      } catch (error) {
        void Dialog.alert(
          'Could not place call',
          error instanceof Error ? error.message : 'Unknown error',
        );
      }
    },
    [canDial, target],
  );

  return (
    <Screen title="AthenaPhone" below={<RegistrationBanner />}>
      <View style={styles.display}>
        <Text
          style={styles.target}
          numberOfLines={1}
          adjustsFontSizeToFit
          accessibilityLabel={target ? `Dialling ${target}` : 'Enter a number'}
        >
          {target || ' '}
        </Text>
        {target.length > 0 ? (
          <Pressable
            onPress={() => setTarget(current => current.slice(0, -1))}
            onLongPress={() => setTarget('')}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Delete last digit"
            style={styles.backspace}
          >
            <BackspaceIcon size={22} color={colors.textDim} />
          </Pressable>
        ) : (
          <Text style={styles.hint}>Number or SIP address</Text>
        )}
      </View>

      <Dialpad onPress={append} onLongPress={handleLongPress} />

      <View style={styles.actions}>
        <View style={styles.side} />

        <Pressable
          onPress={() => dial(false)}
          disabled={!canDial}
          style={({ pressed }) => [
            styles.call,
            { opacity: !canDial ? 0.3 : pressed ? 0.8 : 1 },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Start audio call"
        >
          <PhoneIcon size={28} color={colors.background} />
        </Pressable>

        <View style={styles.side}>
          <Pressable
            onPress={() => dial(true)}
            disabled={!canDial || !account?.videoEnabled}
            hitSlop={8}
            style={({ pressed }) => [
              styles.video,
              {
                opacity:
                  !canDial || !account?.videoEnabled ? 0.3 : pressed ? 0.8 : 1,
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Start video call"
          >
            <VideoIcon size={22} color={colors.text} />
          </Pressable>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  display: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    paddingHorizontal: space.xl,
    paddingVertical: space.lg,
    minHeight: 104,
  },
  target: {
    fontSize: 38,
    fontWeight: '300',
    letterSpacing: 1,
    color: colors.text,
  },
  backspace: { padding: space.xs },
  hint: { ...typography.caption, color: colors.textFaint },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: space.xl,
    marginTop: 'auto',
  },
  side: { width: 96, alignItems: 'center' },
  call: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
  },
  video: {
    width: TOUCH_TARGET,
    height: TOUCH_TARGET,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
});
