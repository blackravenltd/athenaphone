//
// AthenaPhone - Open Source SIP Softphone
//
// Copyright (C) 2026 Tom Cully <mail@tomcully.com>
// Licensed under the GNU GPLv3 - see <https://www.gnu.org/licenses/gpl-3.0.html>
//

import React, { useCallback, useEffect, useMemo } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { TrashIcon } from '../components/Icons';
import { Row } from '../components/Row';
import { Screen } from '../components/Screen';
import { SectionLabel } from '../components/SectionLabel';
import { useCriticalAction } from '../hooks/useCriticalAction';
import { CallController } from '../services/CallController';
import { Dialog } from '../store/dialogStore';
import { useHistoryStore } from '../store/historyStore';
import { colors, space, type as typography, type StatusTone } from '../theme';
import type { CallHistoryEntry } from '../types';
import { displayTarget, formatDuration } from '../utils/sipUri';

/** "14:32" today, "Mon 14:32" this week, "3 Feb" beyond that. */
function formatWhen(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const time = date.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });

  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) {
    return time;
  }

  const ageDays = (now.getTime() - timestamp) / 86_400_000;
  if (ageDays < 7) {
    return `${date.toLocaleDateString(undefined, {
      weekday: 'short',
    })} ${time}`;
  }
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

function toneFor(entry: CallHistoryEntry): StatusTone {
  if (entry.missed) {
    return 'fault';
  }
  if (entry.durationSec === 0) {
    return 'warn';
  }
  return 'ok';
}

function summaryFor(entry: CallHistoryEntry): string {
  if (entry.missed) {
    return 'Missed';
  }
  if (entry.durationSec > 0) {
    return formatDuration(entry.durationSec);
  }
  return entry.direction === 'outbound' ? 'No answer' : 'Not connected';
}

export function HistoryScreen() {
  const entries = useHistoryStore(state => state.entries);
  const markSeen = useHistoryStore(state => state.markSeen);
  const removeEntry = useHistoryStore(state => state.removeEntry);
  const clear = useHistoryStore(state => state.clear);

  // Opening the tab is what clears the missed badge.
  useEffect(() => {
    void markSeen();
  }, [markSeen]);

  const missedCount = useMemo(
    () => entries.filter(entry => entry.missed).length,
    [entries],
  );

  const { run: redial } = useCriticalAction(async (entry: CallHistoryEntry) => {
    try {
      await CallController.placeCall(entry.remoteUri, entry.hasVideo);
    } catch (error) {
      void Dialog.alert(
        'Could not place call',
        error instanceof Error ? error.message : 'Unknown error',
      );
    }
  });

  const confirmDelete = useCallback(
    (entry: CallHistoryEntry) => {
      void Dialog.confirm({
        title: 'Remove from history',
        message: displayTarget(entry.remoteUri),
        confirmLabel: 'Remove',
        destructive: true,
      }).then(confirmed => {
        if (confirmed) {
          void removeEntry(entry.id);
        }
      });
    },
    [removeEntry],
  );

  const confirmClear = useCallback(() => {
    void Dialog.confirm({
      title: 'Clear all history',
      message: 'This cannot be undone.',
      confirmLabel: 'Clear',
      destructive: true,
    }).then(confirmed => {
      if (confirmed) {
        void clear();
      }
    });
  }, [clear]);

  return (
    <Screen
      title="Recents"
      headerRight={
        entries.length > 0 ? (
          <Pressable
            onPress={confirmClear}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Clear call history"
          >
            <TrashIcon size={20} color={colors.textDim} />
          </Pressable>
        ) : null
      }
    >
      <SectionLabel
        trailing={missedCount > 0 ? `${missedCount} missed` : undefined}
      >
        Call history
      </SectionLabel>

      <FlatList
        data={entries}
        keyExtractor={entry => entry.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={typography.heading}>No calls yet</Text>
            <Text style={styles.emptyDetail}>
              Calls you make and receive will be listed here.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <Row
            title={item.remoteDisplayName ?? displayTarget(item.remoteUri)}
            detail={`${item.direction === 'inbound' ? 'Incoming' : 'Outgoing'}${
              item.hasVideo ? ' video' : ''
            } - ${summaryFor(item)}`}
            meta={formatWhen(item.startedAt)}
            tone={toneFor(item)}
            showDot
            onPress={() => redial(item)}
            onLongPress={() => confirmDelete(item)}
          />
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: {
    paddingHorizontal: space.lg,
    gap: space.sm,
    paddingBottom: space.xxl,
  },
  empty: {
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.xxl * 2,
  },
  emptyDetail: {
    ...typography.caption,
    color: colors.textFaint,
    textAlign: 'center',
  },
});
