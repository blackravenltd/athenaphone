//
// AthenaPhone - Open Source SIP Softphone
//
// Copyright (C) 2026 Tom Cully <mail@tomcully.com>
// Licensed under the GNU GPLv3 - see <https://www.gnu.org/licenses/gpl-3.0.html>
//
// AthenaPhone's half of AthenaSIP's combined suite: the app's SIP stack
// against a live AthenaSIP node, which AthenaSIP's runner provides. Run
// through `npm run test:athenasip`, which also runs the unit tests and
// writes the summary the runner reads.

module.exports = {
  preset: '@react-native/jest-preset',
  setupFiles: ['<rootDir>/jest.setup.js'],
  globalSetup: '<rootDir>/test/athenasip/globalSetup.ts',
  testMatch: ['<rootDir>/test/athenasip/**/*.test.ts'],
  transformIgnorePatterns: [
    'node_modules/(?!(?:jest-)?react-native|@react-native|@react-navigation|react-native-.*|jssip)',
  ],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  testTimeout: 40000,
  // Real sockets keep the process alive briefly after the last test; see
  // jest.integration.config.js.
  forceExit: true,
};
