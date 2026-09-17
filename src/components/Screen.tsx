//
// AthenaPhone - Open Source SIP Softphone
//
// Copyright (C) 2026 Tom Cully <mail@tomcully.com>
// Licensed under the GNU GPLv3 - see <https://www.gnu.org/licenses/gpl-3.0.html>
//

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, space, type as typography } from '../theme';
import { AthenaMark, Watermark } from './Logo';

interface ScreenProps {
  title: string;
  /** Action rendered at the right-hand end of the header. */
  headerRight?: React.ReactNode;
  /** Rendered directly under the header: a registration banner, a search box. */
  below?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Shared screen chrome: the watermark, and a compact header carrying the mark
 * on the left with the screen's title beside it.
 *
 * Children are laid out in a plain flex view rather than a scroller, because
 * most screens here own a `FlatList` or `SectionList` that has to be the
 * scrolling element itself.
 */
export function Screen({ title, headerRight, below, children }: ScreenProps) {
  return (
    <View style={styles.root}>
      <Watermark />

      <SafeAreaView style={styles.flex} edges={['top']}>
        <View style={styles.header}>
          <AthenaMark height={24} />
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          {headerRight}
        </View>

        {below}

        <View style={styles.flex}>{children}</View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    paddingBottom: space.md,
  },
  title: { ...typography.display, flex: 1 },
});
