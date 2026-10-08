//
// AthenaPhone - Open Source SIP Softphone
//
// Copyright (C) 2026 Tom Cully <mail@tomcully.com>
// Licensed under the GNU GPLv3 - see <https://www.gnu.org/licenses/gpl-3.0.html>
//
// The integration harness. Separate from the unit config because these tests
// need the Asterisk fixture running, so they must not run in `npm run check`.
//
//   cd test/asterisk && docker compose up -d
//   npm run test:integration

module.exports = {
  preset: '@react-native/jest-preset',
  // The React Native modules are still mocked - the app's own code imports
  // them - but the SIP transports get Node sockets injected instead, so the
  // SIP traffic is real.
  setupFiles: ['<rootDir>/jest.setup.js'],
  // Probes the fixture before collection, so tests can genuinely skip rather
  // than pass vacuously when it is not running.
  globalSetup: '<rootDir>/test/integration/globalSetup.ts',
  testMatch: ['<rootDir>/test/integration/**/*.test.ts'],
  transformIgnorePatterns: [
    'node_modules/(?!(?:jest-)?react-native|@react-native|@react-navigation|react-native-.*|jssip)',
  ],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  // Real network round trips, and a fixture that may need a moment.
  testTimeout: 40000,

  // The suite opens real UDP, TCP, TLS and WebSocket sockets, and something in
  // that stack keeps the process alive for about a second after the last test.
  // `--detectOpenHandles` attributes nothing, and every test completes and
  // passes deterministically, so this is a clean exit rather than a hidden
  // failure. Revisit if a test ever starts hanging rather than merely
  // delaying the exit.
  forceExit: true,
};
