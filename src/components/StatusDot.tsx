//
// AthenaPhone - Open Source SIP Softphone
//
// Copyright (C) 2026 Tom Cully <mail@tomcully.com>
// Licensed under the GNU GPLv3 - see <https://www.gnu.org/licenses/gpl-3.0.html>
//

import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, type ViewStyle } from 'react-native';

import { toneColor, type StatusTone } from '../theme';

interface StatusDotProps {
  tone: StatusTone;
  size?: number;
  /** Fault states pulse so a failed registration is noticed, not just shown. */
  pulse?: boolean;
  style?: ViewStyle;
}

export function StatusDot({ tone, size = 8, pulse, style }: StatusDotProps) {
  const opacity = useRef(new Animated.Value(1)).current;
  const shouldPulse = pulse ?? tone === 'fault';

  useEffect(() => {
    if (!shouldPulse) {
      opacity.setValue(1);
      return;
    }
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.3,
          duration: 800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [opacity, shouldPulse]);

  return (
    <Animated.View
      style={[
        styles.dot,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: toneColor[tone],
          opacity,
        },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  dot: { flexGrow: 0, flexShrink: 0 },
});
