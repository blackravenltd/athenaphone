/**
 * Native modules have no JS implementation under Jest, so each one that the
 * app touches at import time is replaced with a stub here.
 */

require('react-native-gesture-handler/jestSetup');

// The library's own jest mock re-exports through @jest/globals and comes
// back empty here, so this provides the handful of names the app imports.
jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const insets = { top: 0, bottom: 0, left: 0, right: 0 };
  const frame = { x: 0, y: 0, width: 390, height: 844 };
  const passthrough = ({ children }) => React.createElement(React.Fragment, null, children);

  return {
    __esModule: true,
    SafeAreaProvider: passthrough,
    SafeAreaView: passthrough,
    SafeAreaInsetsContext: React.createContext(insets),
    SafeAreaFrameContext: React.createContext(frame),
    useSafeAreaInsets: () => insets,
    useSafeAreaFrame: () => frame,
    initialWindowMetrics: { insets, frame },
  };
});

jest.mock('react-native-webrtc', () => ({
  registerGlobals: jest.fn(),
  mediaDevices: { getUserMedia: jest.fn() },
  MediaStream: class {},
  RTCView: 'RTCView',
}));

jest.mock('react-native-callkeep', () => ({
  __esModule: true,
  default: {
    setup: jest.fn().mockResolvedValue(true),
    setAvailable: jest.fn(),
    registerAndroidEvents: jest.fn(),
    unregisterAndroidEvents: jest.fn(),
    canMakeMultipleCalls: jest.fn(),
    addEventListener: jest.fn(),
    displayIncomingCall: jest.fn(),
    startCall: jest.fn(),
    endCall: jest.fn(),
    endAllCalls: jest.fn(),
    reportEndCallWithUUID: jest.fn(),
    setCurrentCallActive: jest.fn(),
    setMutedCall: jest.fn(),
    setOnHold: jest.fn(),
    updateDisplay: jest.fn(),
    reportConnectedOutgoingCallWithUUID: jest.fn(),
    reportConnectingOutgoingCallWithUUID: jest.fn(),
  },
  CONSTANTS: {
    END_CALL_REASONS: {
      FAILED: 1,
      REMOTE_ENDED: 2,
      UNANSWERED: 3,
      ANSWERED_ELSEWHERE: 4,
      DECLINED_ELSEWHERE: 5,
      MISSED: 6,
    },
  },
}));

jest.mock('react-native-incall-manager', () => ({
  __esModule: true,
  default: {
    start: jest.fn(),
    stop: jest.fn(),
    startRingtone: jest.fn(),
    stopRingtone: jest.fn(),
    startRingback: jest.fn(),
    stopRingback: jest.fn(),
    setKeepScreenOn: jest.fn(),
    setForceSpeakerphoneOn: jest.fn(),
    setMicrophoneMute: jest.fn(),
    startProximitySensor: jest.fn(),
    stopProximitySensor: jest.fn(),
    chooseAudioRoute: jest.fn().mockResolvedValue(undefined),
    getIsWiredHeadsetPluggedIn: jest
      .fn()
      .mockResolvedValue({ isWiredHeadsetPluggedIn: false }),
  },
}));

// The SIP transports. Both libraries construct a NativeEventEmitter at import
// time, which throws without the native side present.
jest.mock('react-native-udp', () => ({
  __esModule: true,
  default: {
    createSocket: jest.fn(() => ({
      on: jest.fn(),
      bind: jest.fn((_port, cb) => cb?.()),
      send: jest.fn(),
      close: jest.fn(),
      removeAllListeners: jest.fn(),
    })),
  },
}));

jest.mock('react-native-tcp-socket', () => {
  const socket = () => ({
    on: jest.fn(),
    write: jest.fn(),
    destroy: jest.fn(),
    removeAllListeners: jest.fn(),
    setKeepAlive: jest.fn(),
    setNoDelay: jest.fn(),
  });
  return {
    __esModule: true,
    default: {
      createConnection: jest.fn((_options, cb) => {
        cb?.();
        return socket();
      }),
      connectTLS: jest.fn((_options, cb) => {
        cb?.();
        return socket();
      }),
    },
  };
});

jest.mock('react-native-keychain', () => ({
  setGenericPassword: jest.fn().mockResolvedValue(true),
  getGenericPassword: jest.fn().mockResolvedValue(false),
  resetGenericPassword: jest.fn().mockResolvedValue(true),
  ACCESSIBLE: { WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WhenUnlockedThisDeviceOnly' },
}));

jest.mock('react-native-permissions', () =>
  require('react-native-permissions/mock'),
);

// async-storage v3 no longer ships a jest mock, so this is a small
// in-memory stand-in with the same surface the app uses.
jest.mock('@react-native-async-storage/async-storage', () => {
  const store = new Map();
  return {
    __esModule: true,
    default: {
      getItem: jest.fn(key => Promise.resolve(store.get(key) ?? null)),
      setItem: jest.fn((key, value) => {
        store.set(key, value);
        return Promise.resolve();
      }),
      removeItem: jest.fn(key => {
        store.delete(key);
        return Promise.resolve();
      }),
      clear: jest.fn(() => {
        store.clear();
        return Promise.resolve();
      }),
    },
  };
});

// crypto.getRandomValues is polyfilled natively; Node's is close enough here.
global.crypto = global.crypto ?? require('node:crypto').webcrypto;
