//
// AthenaPhone - Open Source SIP Softphone
//
// Copyright (C) 2026 Tom Cully <mail@tomcully.com>
// Licensed under the GNU GPLv3 - see <https://www.gnu.org/licenses/gpl-3.0.html>
//

import { Platform, StyleSheet, type ViewStyle } from 'react-native';

/**
 * The AthenaPhone palette, following `macha-client-rn`'s structure: a
 * near-black neutral ground with a layered surface ramp and a three-step text
 * ramp. Dark-only, because a phone is used in the dark far more than not.
 *
 * Where Macha's accent is crimson, AthenaPhone's is the green of an answer
 * button -- on a phone, "connected" and "hang up" carry meaning that a neutral
 * brand colour would throw away.
 */
export const colors = {
  background: '#0e0e0f',
  backgroundLift: '#141416',
  surface: '#171719',
  surface2: '#222226',
  surface3: '#2a2a2e',

  text: '#e2e2e5',
  textDim: '#aaaab2',
  textFaint: '#77777f',

  border: 'rgba(226, 226, 229, 0.09)',
  borderStrong: 'rgba(226, 226, 229, 0.16)',
  track: 'rgba(226, 226, 229, 0.16)',
  scrim: 'rgba(6, 6, 7, 0.72)',

  /** Answer, registered, in-call. The accent of a working phone. */
  accent: '#59c07b',
  accentSurface: 'rgba(89, 192, 123, 0.14)',

  ok: '#59c07b',
  warn: '#e8b33a',
  danger: '#ff6b6b',
} as const;

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 22,
  pill: 999,
} as const;

export const type = StyleSheet.create({
  display: {
    fontSize: 26,
    fontWeight: '600',
    letterSpacing: 0.2,
    color: colors.text,
  },
  title: { fontSize: 20, fontWeight: '600', color: colors.text },
  heading: { fontSize: 16, fontWeight: '600', color: colors.text },
  body: { fontSize: 15, fontWeight: '400', color: colors.text },
  label: { fontSize: 13, fontWeight: '500', color: colors.text },
  caption: { fontSize: 12, fontWeight: '400', color: colors.textDim },
  micro: {
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: 0.8,
    color: colors.textFaint,
  },
});

/**
 * The smallest comfortable touch target. Every interactive control is at least
 * this tall -- doubly so here, where controls get pressed mid-call without
 * being looked at.
 */
export const TOUCH_TARGET = 44;

export const monospace = Platform.select({
  ios: 'Menlo',
  android: 'monospace',
  default: 'monospace',
}) as string;

export type StatusTone = 'ok' | 'warn' | 'fault' | 'unknown';

/** Status colours for registration state, call state and history rows. */
export const toneColor: Record<StatusTone, string> = {
  ok: colors.ok,
  warn: colors.warn,
  fault: colors.danger,
  unknown: colors.textFaint,
};

/** The standard list row: a lifted surface with a hairline border. */
export const card = {
  backgroundColor: colors.surface,
  borderWidth: StyleSheet.hairlineWidth,
  borderColor: colors.border,
  borderRadius: radius.lg,
} satisfies ViewStyle;

export const cardPressed = {
  ...card,
  backgroundColor: colors.surface2,
  borderColor: colors.borderStrong,
} satisfies ViewStyle;
