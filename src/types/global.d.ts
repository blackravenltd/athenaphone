/**
 * Ambient declarations for globals that only exist at runtime.
 *
 * We deliberately do not pull in TypeScript's "dom" lib: it would shadow
 * react-native-webrtc's own RTCPeerConnection/MediaStream types with the
 * browser ones, which differ in the parts we use.
 */

declare const crypto: {
  getRandomValues<T extends ArrayBufferView>(array: T): T;
};

/** Metro sets this; false in release builds. */
declare const __DEV__: boolean;
