//
// AthenaPhone - Open Source SIP Softphone
//
// Copyright (C) 2026 Tom Cully <mail@tomcully.com>
// Licensed under the GNU GPLv3 - see <https://www.gnu.org/licenses/gpl-3.0.html>
//

import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { SvgXml } from 'react-native-svg';

import { ATHENA_MARK_ASPECT, ATHENA_MARK_SVG } from '../assets/athenaMark';
import { colors } from '../theme';

interface AthenaMarkProps {
  /** The mark is sized by height; width follows from its aspect ratio. */
  height?: number;
  opacity?: number;
  color?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * The AthenaPhone mark. Decorative everywhere it is used, so it never takes
 * touches away from what is underneath it.
 */
export function AthenaMark({
  height = 24,
  opacity = 1,
  color = colors.text,
  style,
}: AthenaMarkProps) {
  const width = Math.round(height * ATHENA_MARK_ASPECT);

  return (
    <View style={[{ width, height, opacity }, style]} pointerEvents="none">
      <SvgXml
        xml={ATHENA_MARK_SVG}
        width={width}
        height={height}
        color={color}
      />
    </View>
  );
}

/**
 * The faint mark sitting behind ordinary screens.
 *
 * Deliberately absent from the call screen whenever remote video is up:
 * anything drawn over the picture is a defect rather than decoration.
 */
export function Watermark() {
  return (
    <View pointerEvents="none" style={watermarkStyle}>
      <AthenaMark height={300} opacity={0.04} />
    </View>
  );
}

const watermarkStyle: ViewStyle = {
  position: 'absolute',
  top: '24%',
  left: 0,
  right: 0,
  alignItems: 'center',
};
