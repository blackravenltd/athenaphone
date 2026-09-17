import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useAccountStore } from '../store/accountStore';
import {
  colors,
  space,
  toneColor,
  type as typography,
  type StatusTone,
} from '../theme';
import { StatusDot } from './StatusDot';

/**
 * The registration indicator under the dialer's header: a status dot, the
 * account name, and the SIP reason when something is wrong -- which is usually
 * the only clue a user gets about a bad password or an unreachable PBX.
 */
export function RegistrationBanner() {
  const registration = useAccountStore(state => state.registration);
  const account = useAccountStore(state => state.activeAccount());

  if (!account) {
    return (
      <View style={styles.banner}>
        <StatusDot tone="unknown" />
        <Text style={styles.detail} numberOfLines={1}>
          No account. Add one in Settings to start calling.
        </Text>
      </View>
    );
  }

  const tone = (
    {
      registered: 'ok',
      registering: 'warn',
      unregistered: 'unknown',
      failed: 'fault',
    } as const
  )[registration.state] as StatusTone;

  const status = {
    registered: 'Registered',
    registering: 'Connecting',
    unregistered: 'Offline',
    failed: registration.reason ?? 'Registration failed',
  }[registration.state];

  return (
    <View style={styles.banner}>
      <StatusDot tone={tone} />
      <Text style={styles.name} numberOfLines={1}>
        {account.name}
      </Text>
      <Text
        style={[styles.status, { color: toneColor[tone] }]}
        numberOfLines={1}
      >
        {status}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingBottom: space.sm,
  },
  name: { ...typography.caption, color: colors.textDim },
  status: { ...typography.caption, flex: 1, textAlign: 'right' },
  detail: { ...typography.caption, color: colors.textFaint, flex: 1 },
});
