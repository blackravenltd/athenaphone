//
// AthenaPhone - Open Source SIP Softphone
//
// Copyright (C) 2026 Tom Cully <mail@tomcully.com>
// Licensed under the GNU GPLv3 - see <https://www.gnu.org/licenses/gpl-3.0.html>
//

import { create } from 'zustand';

import { Storage, StorageKeys } from '../services/Storage';
import type { Call, CallHistoryEntry } from '../types';

/** Keep the log bounded; the UI never paginates past this. */
const MAX_ENTRIES = 500;

interface HistoryState {
  entries: CallHistoryEntry[];
  hydrated: boolean;

  hydrate: () => Promise<void>;
  recordCall: (call: Call) => Promise<void>;
  markSeen: () => Promise<void>;
  removeEntry: (id: string) => Promise<void>;
  clear: () => Promise<void>;
  missedCount: () => number;
}

/** Turn a finished call into a log entry. */
function toEntry(call: Call): CallHistoryEntry {
  const answered = call.answeredAt !== undefined;
  const durationSec = answered
    ? Math.round(((call.endedAt ?? Date.now()) - call.answeredAt!) / 1000)
    : 0;

  return {
    id: call.id,
    accountId: call.accountId,
    direction: call.direction,
    remoteUri: call.remoteUri,
    remoteDisplayName: call.remoteDisplayName,
    hasVideo: call.hasVideo,
    startedAt: call.createdAt,
    durationSec,
    missed: call.direction === 'inbound' && !answered,
    endReason: call.endReason,
  };
}

export const useHistoryStore = create<HistoryState>((set, get) => ({
  entries: [],
  hydrated: false,

  async hydrate() {
    const entries = await Storage.read<CallHistoryEntry[]>(
      StorageKeys.history,
      [],
    );
    // Drop duplicates a previous build may have persisted, keeping the newest.
    const seen = new Set<string>();
    const unique = entries.filter(entry =>
      seen.has(entry.id) ? false : (seen.add(entry.id), true),
    );
    set({ entries: unique, hydrated: true });
    if (unique.length !== entries.length) {
      await Storage.write(StorageKeys.history, unique);
    }
  },

  async recordCall(call) {
    // Newest first, so the list renders without sorting. Keyed by call id and
    // replaced rather than appended, so recording the same call twice - a
    // second end event, or a dev reload re-running the listeners - cannot
    // leave two rows with one key.
    const entries = [
      toEntry(call),
      ...get().entries.filter(entry => entry.id !== call.id),
    ].slice(0, MAX_ENTRIES);
    set({ entries });
    await Storage.write(StorageKeys.history, entries);
  },

  /** Clear the missed-call badge once the user has looked at the list. */
  async markSeen() {
    const entries = get().entries.map(entry =>
      entry.missed ? { ...entry, missed: false } : entry,
    );
    set({ entries });
    await Storage.write(StorageKeys.history, entries);
  },

  async removeEntry(id) {
    const entries = get().entries.filter(entry => entry.id !== id);
    set({ entries });
    await Storage.write(StorageKeys.history, entries);
  },

  async clear() {
    set({ entries: [] });
    await Storage.write(StorageKeys.history, []);
  },

  missedCount() {
    return get().entries.filter(entry => entry.missed).length;
  },
}));
