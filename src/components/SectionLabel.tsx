//
// AthenaPhone - Open Source SIP Softphone
//
// Copyright (C) 2026 Tom Cully <mail@tomcully.com>
// Licensed under the GNU GPLv3 - see <https://www.gnu.org/licenses/gpl-3.0.html>
//

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, space, type as typography } from '../theme';

interface SectionLabelProps {
  children: string;
  /** Right-aligned counterpart: a count, or a short status. */
  trailing?: string;
}

/** A section heading over a list or a group of settings rows. */
export function SectionLabel({ children, trailing }: SectionLabelProps) {
  return (
    <View style={styles.row}>
      <Text style={typography.heading}>{children}</Text>
      {trailing ? <Text style={styles.trailing}>{trailing}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    paddingBottom: space.sm,
  },
  trailing: { ...typography.caption, color: colors.textFaint },
});
