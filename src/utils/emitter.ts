/**
 * A tiny typed event emitter.
 *
 * React Native's `EventEmitter` is untyped and Node's is not available, so
 * this gives the SIP layer compile-time checked events without a dependency.
 */

//
// AthenaPhone - Open Source SIP Softphone
//
// Copyright (C) 2026 Tom Cully <mail@tomcully.com>
// Licensed under the GNU GPLv3 - see <https://www.gnu.org/licenses/gpl-3.0.html>
//
export type EventMap = object;

type Listener<T> = (payload: T) => void;

export class TypedEmitter<E extends EventMap> {
  private listeners: { [K in keyof E]?: Set<Listener<E[K]>> } = {};

  on<K extends keyof E>(event: K, listener: Listener<E[K]>): () => void {
    const set = (this.listeners[event] ??= new Set());
    set.add(listener);
    return () => this.off(event, listener);
  }

  once<K extends keyof E>(event: K, listener: Listener<E[K]>): () => void {
    const unsubscribe = this.on(event, payload => {
      unsubscribe();
      listener(payload);
    });
    return unsubscribe;
  }

  off<K extends keyof E>(event: K, listener: Listener<E[K]>): void {
    this.listeners[event]?.delete(listener);
  }

  emit<K extends keyof E>(event: K, payload: E[K]): void {
    // Copy before iterating: a listener may unsubscribe itself.
    const set = this.listeners[event];
    if (!set) {
      return;
    }
    for (const listener of [...set]) {
      try {
        listener(payload);
      } catch (error) {
        console.error(`[emitter] listener for "${String(event)}" threw`, error);
      }
    }
  }

  removeAllListeners(): void {
    this.listeners = {};
  }
}
