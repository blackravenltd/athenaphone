//
// AthenaPhone - Open Source SIP Softphone
//
// Copyright (C) 2026 Tom Cully <mail@tomcully.com>
// Licensed under the GNU GPLv3 - see <https://www.gnu.org/licenses/gpl-3.0.html>
//

import React from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';

import {
  card,
  colors,
  space,
  type as typography,
  TOUCH_TARGET,
} from '../theme';

interface ToggleProps {
  label: string;
  detail?: string;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}

/** A settings row with a switch on the right. */
export function Toggle({
  label,
  detail,
  value,
  onChange,
  disabled,
}: ToggleProps) {
  return (
    <View style={[card, styles.row, disabled && styles.disabled]}>
      <View style={styles.body}>
        <Text style={typography.body}>{label}</Text>
        {detail ? <Text style={styles.detail}>{detail}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        trackColor={{ false: colors.track, true: colors.accentText }}
        thumbColor={colors.text}
        ios_backgroundColor={colors.track}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: TOUCH_TARGET + 8,
    paddingVertical: space.sm,
    paddingHorizontal: space.lg,
  },
  body: { flex: 1, gap: 2 },
  detail: { ...typography.caption, color: colors.textFaint },
  disabled: { opacity: 0.5 },
});
