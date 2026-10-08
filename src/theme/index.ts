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
 * button - on a phone, "connected" and "hang up" carry meaning that a neutral
 * brand colour would throw away.
 */
/**
 * The shared AthenaSIP palette, adopted from athenasip-admin
 * (`src/styles/tokens.css`). Dark-only, with macha's structure underneath.
 *
 * The rule that governs it:
 *
 *   THE ACCENT MARKS POSITION, NEVER APPROVAL.
 *
 * Accent is for where you are and what you are about to act on - the focused
 * control, the primary action. Green, amber and red are reserved for state a
 * reader must not have to interpret, and nothing else may use them. This app
 * previously used green as both accent and "ok", which is why it read as
 * relentlessly green; confining it to state makes it carry information again.
 *
 * The accent is blue-steel because AthenaSIP has no brand colour to inherit -
 * its logo is monochrome - and because steel leaves green and red free to
 * mean something.
 */
export const colors = {
  background: '#0e0e0f',
  backgroundLift: '#141416',
  surface: '#171719',
  surface2: '#222226',
  surface3: '#2a2a2e',

  text: '#e2e2e5',
  textDim: '#aaaab2',
  /**
   * Lifted from macha's #77777f, which measures 4.35:1 on the ground and only
   * 3.57:1 on `surface2`. Faint here is not decorative: it renders contact
   * numbers, the account's user@host, the unselected transport labels, the
   * remote party's URI mid-call and the inactive tab labels. #8a8a93 is 4.63:1
   * at worst and still reads as the faintest of the three steps.
   */
  textFaint: '#8a8a93',

  // White at low alpha, so borders hold on any surface.
  borderSoft: '#ffffff12',
  border: '#ffffff1a',
  borderStrong: '#ffffff24',
  track: '#ffffff24',
  scrim: 'rgba(6, 6, 7, 0.72)',

  /**
   * The accent ramp. Near-black through most of its length, so these are fills
   * and washes, not text - `accentText` is the one with enough contrast to
   * read on the ground.
   */
  accent: '#00223d',
  accentStrong: '#063458',
  accentSurface: '#00101da8',
  accentSurfaceStrong: '#00223dc2',

  /**
   * Interactive text, icons and the focus ring.
   *
   * The admin client lifted this from the bottom of the accent ramp, where
   * macha puts it: macha is read across a room with one thing focused, this is
   * a form with nine inputs. AthenaPhone has text entry too - the account
   * editor, search, the transfer prompt - so it takes the lifted value.
   *
   * #4d8ec3 rather than the admin client's #3d7fb5. There it is only ever a
   * ring, a border or a meter fill, so the 3:1 non-text bar applies and it
   * passes. Here it is genuinely text - Save, Add account, dialog actions -
   * so 4.5:1 applies, and #3d7fb5 gives only 4.18:1 on `surface` and 3.70:1
   * on `surface2`. Same hue, lowest value clearing 4.5:1 everywhere it lands.
   */
  accentText: '#4d8ec3',

  /* State. Reserved: nothing decorative may use these. */
  ok: '#58c07c',
  okSurface: '#0c2a18',
  warn: '#e0a758',
  warnSurface: '#2e2110',
  /** A light red, tuned for reading on black. Text and dots, not fills. */
  danger: '#ff9b9b',
  dangerSurface: '#3a0a10',
  dangerBorder: '#8a303b',

  /**
   * Call controls. Answer is exactly `ok`, so "registered", "up" and "answer"
   * are one green across both products. Hang up is saturated rather than the
   * light `danger` text red, which is unreadable as a filled button.
   *
   * Red against green is the pair that fails for the commonest colour vision
   * deficiency, so hue must not carry this alone. These two are far apart in
   * luminance - roughly 0.46 against 0.19 - so they stay light-against-dark
   * when hue drops out. Keep that gap if either is ever adjusted, and keep
   * position and shape doing the primary work: answer left, hang up right,
   * never swapped between screens.
   */
  callAnswer: '#58c07c',
  callEnd: '#e0484f',
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
 * this tall - doubly so here, where controls get pressed mid-call without
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
