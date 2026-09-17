import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  card,
  cardPressed,
  colors,
  space,
  toneColor,
  type as typography,
  TOUCH_TARGET,
  type StatusTone,
} from '../theme';
import { StatusDot } from './StatusDot';

interface RowProps {
  /** The main line: who or what this row is. */
  title: string;
  /** The supporting line underneath. */
  detail?: string;
  /** Short status text on the right, coloured by `tone`. */
  meta?: string;
  tone?: StatusTone;
  /** Show a status dot before the title. Off for plain list rows. */
  showDot?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
  /** Rendered at the right-hand end: a call shortcut, a chevron. */
  accessory?: React.ReactNode;
}

/** The standard list row, used for history, contacts and accounts. */
export function Row({
  title,
  detail,
  meta,
  tone = 'unknown',
  showDot = false,
  onPress,
  onLongPress,
  accessory,
}: RowProps) {
  const content = (pressed: boolean) => (
    <View style={[pressed ? cardPressed : card, styles.row]}>
      {showDot ? <StatusDot tone={tone} /> : null}
      <View style={styles.body}>
        <Text style={typography.body} numberOfLines={1}>
          {title}
        </Text>
        {detail ? (
          <Text style={styles.detail} numberOfLines={1}>
            {detail}
          </Text>
        ) : null}
      </View>
      {meta ? (
        <Text
          style={[styles.meta, { color: toneColor[tone] }]}
          numberOfLines={1}
        >
          {meta}
        </Text>
      ) : null}
      {accessory}
    </View>
  );

  if (!onPress && !onLongPress) {
    return content(false);
  }

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="button"
    >
      {({ pressed }) => content(pressed)}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: TOUCH_TARGET + 8,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
  },
  body: { flex: 1, gap: 2 },
  detail: { ...typography.caption, color: colors.textFaint },
  meta: { ...typography.caption, fontVariant: ['tabular-nums'] },
});
