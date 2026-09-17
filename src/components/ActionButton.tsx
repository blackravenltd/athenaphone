import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';

import { colors, space, type as typography, TOUCH_TARGET } from '../theme';
import type { IconProps } from './Icons';

export type ActionTone = 'neutral' | 'accept' | 'reject' | 'active';

interface ActionButtonProps {
  label: string;
  Icon: React.ComponentType<IconProps>;
  onPress: () => void;
  tone?: ActionTone;
  disabled?: boolean;
  size?: number;
  style?: ViewStyle;
}

const BACKGROUND: Record<ActionTone, string> = {
  neutral: colors.surface2,
  accept: colors.ok,
  reject: colors.danger,
  active: colors.text,
};

const FOREGROUND: Record<ActionTone, string> = {
  neutral: colors.text,
  accept: colors.background,
  reject: colors.background,
  active: colors.background,
};

/**
 * The round controls on the call screen: answer, hang up, mute, speaker.
 * `tone` carries the meaning; `active` is the toggled-on state, which inverts
 * to a light fill so it reads at a glance without being looked at directly.
 */
export function ActionButton({
  label,
  Icon,
  onPress,
  tone = 'neutral',
  disabled = false,
  size = 62,
  style,
}: ActionButtonProps) {
  return (
    <View style={[styles.wrapper, style]}>
      <Pressable
        onPress={onPress}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled, selected: tone === 'active' }}
        style={({ pressed }) => [
          styles.button,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: BACKGROUND[tone],
            borderColor: tone === 'neutral' ? colors.border : 'transparent',
            opacity: disabled ? 0.35 : pressed ? 0.7 : 1,
          },
        ]}
      >
        <Icon size={Math.round(size * 0.42)} color={FOREGROUND[tone]} />
      </Pressable>
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { alignItems: 'center', width: 84, minHeight: TOUCH_TARGET },
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  label: {
    ...typography.caption,
    marginTop: space.sm,
    color: colors.textDim,
  },
});
