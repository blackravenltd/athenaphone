//
// AthenaPhone - Open Source SIP Softphone
//
// Copyright (C) 2026 Tom Cully <mail@tomcully.com>
// Licensed under the GNU GPLv3 - see <https://www.gnu.org/licenses/gpl-3.0.html>
//

import type { MediaStream } from 'react-native-webrtc';
import { create } from 'zustand';

import type { Call } from '../types';

interface CallState {
  /** Live call legs, newest last. Ended calls are removed. */
  calls: Call[];
  /** Which leg the in-call UI is showing. */
  focusedCallId?: string;
  /** Media streams, kept outside `calls` because they are not plain data. */
  localStreams: Record<string, MediaStream>;
  remoteStreams: Record<string, MediaStream>;
  /** Digits collected by the in-call keypad, shown above the dialpad. */
  dtmfBuffer: string;
  /**
   * The last call to end, kept on the call screen with its outcome until the
   * user dismisses it -- so a failure is shown rather than the screen just
   * vanishing. Cleared by a new call.
   */
  concluded?: Call;

  upsertCall: (call: Call) => void;
  removeCall: (callId: string) => void;
  setStreams: (
    callId: string,
    streams: { local?: MediaStream; remote?: MediaStream },
  ) => void;
  focusCall: (callId: string | undefined) => void;
  appendDtmf: (digit: string) => void;
  clearDtmf: () => void;
  conclude: (call: Call) => void;
  dismissConcluded: () => void;
  reset: () => void;
}

export const useCallStore = create<CallState>((set, get) => ({
  calls: [],
  focusedCallId: undefined,
  localStreams: {},
  remoteStreams: {},
  dtmfBuffer: '',

  upsertCall(call) {
    const existing = get().calls.findIndex(entry => entry.id === call.id);
    const calls =
      existing >= 0
        ? get().calls.map(entry => (entry.id === call.id ? call : entry))
        : [...get().calls, call];

    set({
      calls,
      focusedCallId: get().focusedCallId ?? call.id,
      concluded: undefined,
    });
  },

  removeCall(callId) {
    const calls = get().calls.filter(call => call.id !== callId);
    const { [callId]: _local, ...localStreams } = get().localStreams;
    const { [callId]: _remote, ...remoteStreams } = get().remoteStreams;

    set({
      calls,
      localStreams,
      remoteStreams,
      // Fall back to whatever is still up, so ending one leg of two does not
      // drop the user out of the call screen.
      focusedCallId:
        get().focusedCallId === callId
          ? calls[calls.length - 1]?.id
          : get().focusedCallId,
      dtmfBuffer: calls.length === 0 ? '' : get().dtmfBuffer,
    });
  },

  setStreams(callId, { local, remote }) {
    set({
      localStreams: local
        ? { ...get().localStreams, [callId]: local }
        : get().localStreams,
      remoteStreams: remote
        ? { ...get().remoteStreams, [callId]: remote }
        : get().remoteStreams,
    });
  },

  focusCall(callId) {
    set({ focusedCallId: callId, dtmfBuffer: '' });
  },

  appendDtmf(digit) {
    set({ dtmfBuffer: get().dtmfBuffer + digit });
  },

  clearDtmf() {
    set({ dtmfBuffer: '' });
  },

  conclude(call) {
    set({ concluded: call });
  },

  dismissConcluded() {
    set({ concluded: undefined });
  },

  reset() {
    set({
      calls: [],
      focusedCallId: undefined,
      localStreams: {},
      remoteStreams: {},
      dtmfBuffer: '',
      concluded: undefined,
    });
  },
}));

/** The leg the in-call UI should render, if any. */
export function selectFocusedCall(state: CallState): Call | undefined {
  return (
    state.calls.find(call => call.id === state.focusedCallId) ?? state.calls[0]
  );
}

/** True when any leg is up. */
export function selectHasActiveCall(state: CallState): boolean {
  return state.calls.length > 0;
}

/** What the navigator watches: a call is up, or an outcome awaits dismissal. */
export function selectShowCallScreen(state: CallState): boolean {
  return state.calls.length > 0 || state.concluded !== undefined;
}
