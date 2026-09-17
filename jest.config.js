//
// AthenaPhone - Open Source SIP Softphone
//
// Copyright (C) 2026 Tom Cully <mail@tomcully.com>
// Licensed under the GNU GPLv3 - see <https://www.gnu.org/licenses/gpl-3.0.html>
//

module.exports = {
  preset: '@react-native/jest-preset',
  setupFiles: ['<rootDir>/jest.setup.js'],
  // The RN ecosystem ships untranspiled ESM, so these must go through babel.
  transformIgnorePatterns: [
    'node_modules/(?!(?:jest-)?react-native|@react-native|@react-navigation|react-native-.*|jssip)',
  ],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  // Unit tests only. The integration suite needs the Asterisk fixture
  // running, so `npm run check` must not pull it in -- it has its own config
  // and its own script.
  testMatch: ['<rootDir>/__tests__/**/*.test.{ts,tsx}'],
};
