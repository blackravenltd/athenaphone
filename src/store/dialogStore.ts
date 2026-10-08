//
// AthenaPhone - Open Source SIP Softphone
//
// Copyright (C) 2026 Tom Cully <mail@tomcully.com>
// Licensed under the GNU GPLv3 - see <https://www.gnu.org/licenses/gpl-3.0.html>
//

import { create } from 'zustand';

import { uuidv4 } from '../utils/id';

export interface DialogAction {
  label: string;
  /** `danger` is for destructive choices; `cancel` dismisses without acting. */
  tone?: 'default' | 'danger' | 'cancel';
  onPress?: () => void;
}

export interface DialogRequest {
  id: string;
  title: string;
  message?: string;
  actions: DialogAction[];
  /** Resolved with the chosen action's label once the dialog closes. */
  resolve: (label: string | undefined) => void;
}

interface DialogState {
  /** A queue rather than a single slot, so a second alert is never swallowed. */
  queue: DialogRequest[];
  push: (request: Omit<DialogRequest, 'id'>) => void;
  dismiss: (id: string, label?: string) => void;
}

export const useDialogStore = create<DialogState>((set, get) => ({
  queue: [],

  push(request) {
    set({ queue: [...get().queue, { ...request, id: uuidv4() }] });
  },

  dismiss(id, label) {
    const request = get().queue.find(entry => entry.id === id);
    set({ queue: get().queue.filter(entry => entry.id !== id) });
    request?.resolve(label);
  },
}));

/**
 * Imperative dialogs, replacing React Native's `Alert`.
 *
 * The platform alert cannot be styled, looks like a different application on
 * top of this one, and differs between iOS and Android in button order and in
 * what it supports - `Alert.prompt` is iOS-only. Everything here is drawn by
 * `DialogHost` in the app's own language instead.
 */
export const Dialog = {
  /** A message with a single dismiss button. */
  alert(title: string, message?: string): Promise<void> {
    return new Promise(resolve => {
      useDialogStore.getState().push({
        title,
        message,
        actions: [{ label: 'OK' }],
        resolve: () => resolve(),
      });
    });
  },

  /** A yes/no question. Resolves true only if the confirming action was chosen. */
  confirm(options: {
    title: string;
    message?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    destructive?: boolean;
  }): Promise<boolean> {
    const confirmLabel = options.confirmLabel ?? 'Confirm';
    return new Promise(resolve => {
      useDialogStore.getState().push({
        title: options.title,
        message: options.message,
        actions: [
          { label: options.cancelLabel ?? 'Cancel', tone: 'cancel' },
          { label: confirmLabel, tone: options.destructive ? 'danger' : 'default' },
        ],
        resolve: label => resolve(label === confirmLabel),
      });
    });
  },

  /** A short menu of choices, as a long-press menu on a row. */
  actions(options: {
    title: string;
    message?: string;
    actions: DialogAction[];
  }): Promise<void> {
    return new Promise(resolve => {
      useDialogStore.getState().push({
        title: options.title,
        message: options.message,
        actions: [...options.actions, { label: 'Cancel', tone: 'cancel' }],
        resolve: () => resolve(),
      });
    });
  },
};
