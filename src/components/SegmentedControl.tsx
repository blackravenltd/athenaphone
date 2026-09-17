import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, space, type as typography, TOUCH_TARGET } from '../theme';

interface SegmentedControlProps<T extends string> {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  accessibilityLabel?: string;
}

/** A small one-of-N picker, for choices short enough to show in full. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
}: SegmentedControlProps<T>) {
  return (
    <View style={styles.group} accessibilityLabel={accessibilityLabel}>
      {options.map(option => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={option.label}
            style={({ pressed }) => [
              styles.segment,
              selected && styles.segmentSelected,
              pressed && !selected && styles.segmentPressed,
            ]}>
            <Text style={[styles.label, selected && styles.labelSelected]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    flexDirection: 'row',
    gap: space.xs,
    padding: space.xs,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  segment: {
    flex: 1,
    minHeight: TOUCH_TARGET - space.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
  },
  segmentSelected: { backgroundColor: colors.surface3 },
  segmentPressed: { opacity: 0.6 },
  label: { ...typography.label, color: colors.textFaint },
  labelSelected: { color: colors.text },
});
