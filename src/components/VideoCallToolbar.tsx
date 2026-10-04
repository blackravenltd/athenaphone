//
// AthenaPhone - Open Source SIP Softphone
//
// Copyright (C) 2026 Tom Cully <mail@tomcully.com>
// Licensed under the GNU GPLv3 - see <https://www.gnu.org/licenses/gpl-3.0.html>
//

import React, { useMemo, useRef } from 'react';
import {
  Animated,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutRectangle,
} from 'react-native';

import { colors, radius, space, type as typography } from '../theme';
import type { ActionTone } from './ActionButton';
import type { IconProps } from './Icons';

export interface ToolbarAction {
  label: string;
  Icon: React.ComponentType<IconProps>;
  onPress: () => void;
  tone?: ActionTone;
  disabled?: boolean;
}

interface VideoCallToolbarProps {
  /** Who the call is with, shown on the grip so it is not drawn over video. */
  title: string;
  /** The timer or call state. */
  status: string;
  actions: ToolbarAction[];
  /** Area the toolbar may be dragged within, in the parent's coordinates. */
  bounds: LayoutRectangle | null;
}

const BUTTON = 40;

/** Translucent so the picture shows through; dark enough to hold white icons. */
const BAR = 'rgba(23, 23, 25, 0.62)';

const BACKGROUND: Record<ActionTone, string> = {
  neutral: 'rgba(255, 255, 255, 0.08)',
  accept: colors.callAnswer,
  reject: colors.callEnd,
  active: colors.text,
};

const FOREGROUND: Record<ActionTone, string> = {
  neutral: colors.text,
  accept: colors.background,
  reject: colors.text,
  active: colors.background,
};

/** Movement under this many points is a tap on a button, not a drag. */
const DRAG_SLOP = 6;

/**
 * The in-call controls during a video call: one compact, translucent row the
 * user can drag out of the way of the picture. Starts at the bottom; is kept
 * inside `bounds` wherever it is dropped.
 */
export function VideoCallToolbar({
  title,
  status,
  actions,
  bounds,
}: VideoCallToolbarProps) {
  const position = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const offset = useRef({ x: 0, y: 0 });
  const size = useRef({ width: 0, height: 0 });
  const home = useRef<{ x: number; y: number } | null>(null);
  const boundsRef = useRef(bounds);
  boundsRef.current = bounds;

  // Keep the whole bar on screen: the offset is measured from its starting
  // place, so the limits are the distances from there to each edge.
  const clamp = (x: number, y: number) => {
    const area = boundsRef.current;
    const start = home.current;
    if (!area || !start) {
      return { x, y };
    }
    const minX = area.x - start.x;
    const maxX = area.x + area.width - size.current.width - start.x;
    const minY = area.y - start.y;
    const maxY = area.y + area.height - size.current.height - start.y;
    return {
      x: Math.min(Math.max(x, minX), Math.max(minX, maxX)),
      y: Math.min(Math.max(y, minY), Math.max(minY, maxY)),
    };
  };

  const responder = useMemo(
    () =>
      PanResponder.create({
        // Only claim the gesture once it moves, so taps reach the buttons.
        onMoveShouldSetPanResponder: (_, g) =>
          Math.abs(g.dx) > DRAG_SLOP || Math.abs(g.dy) > DRAG_SLOP,
        onPanResponderMove: (_, g) => {
          const next = clamp(offset.current.x + g.dx, offset.current.y + g.dy);
          position.setValue(next);
        },
        onPanResponderRelease: (_, g) => {
          offset.current = clamp(
            offset.current.x + g.dx,
            offset.current.y + g.dy,
          );
          position.setValue(offset.current);
        },
        onPanResponderTerminationRequest: () => false,
      }),
    // clamp reads refs only, so the responder never needs rebuilding.
    [position],
  );

  return (
    <Animated.View
      {...responder.panHandlers}
      onLayout={event => {
        const { x, y, width, height } = event.nativeEvent.layout;
        size.current = { width, height };
        home.current ??= { x, y };
      }}
      style={[styles.bar, { transform: position.getTranslateTransform() }]}
      accessibilityLabel="Call controls. Drag to move."
    >
      <View style={styles.grip}>
        <View style={styles.handle} />
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.status} numberOfLines={1}>
          {status}
        </Text>
      </View>
      <View style={styles.row}>
        {actions.map(({ label, Icon, onPress, tone = 'neutral', disabled }) => (
          <Pressable
            key={label}
            onPress={onPress}
            disabled={disabled}
            hitSlop={4}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={{ disabled, selected: tone === 'active' }}
            style={({ pressed }) => [
              styles.button,
              {
                backgroundColor: BACKGROUND[tone],
                opacity: disabled ? 0.35 : pressed ? 0.7 : 1,
              },
            ]}
          >
            <Icon size={18} color={FOREGROUND[tone]} />
          </Pressable>
        ))}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bar: {
    alignSelf: 'center',
    paddingHorizontal: space.sm,
    paddingBottom: space.sm,
    borderRadius: radius.lg,
    backgroundColor: BAR,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  grip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingTop: space.sm,
    paddingBottom: space.sm,
    paddingHorizontal: space.xs,
  },
  handle: {
    width: 18,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.textFaint,
  },
  title: { ...typography.caption, color: colors.text, flexShrink: 1 },
  status: {
    ...typography.caption,
    color: colors.textDim,
    marginLeft: 'auto',
    fontVariant: ['tabular-nums'],
  },
  row: { flexDirection: 'row', gap: space.xs + 2 },
  button: {
    width: BUTTON,
    height: BUTTON,
    borderRadius: BUTTON / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
