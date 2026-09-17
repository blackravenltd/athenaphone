module.exports = {
  preset: '@react-native/jest-preset',
  setupFiles: ['<rootDir>/jest.setup.js'],
  // The RN ecosystem ships untranspiled ESM, so these must go through babel.
  transformIgnorePatterns: [
    'node_modules/(?!(?:jest-)?react-native|@react-native|@react-navigation|react-native-.*|jssip)',
  ],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
};
