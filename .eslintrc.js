//
// AthenaPhone - Open Source SIP Softphone
//
// Copyright (C) 2026 Tom Cully <mail@tomcully.com>
// Licensed under the GNU GPLv3 - see <https://www.gnu.org/licenses/gpl-3.0.html>
//

module.exports = {
  root: true,
  extends: '@react-native',
  rules: {
    // `void somePromise()` is how this codebase marks a deliberately
    // unawaited promise, including inside arrow bodies.
    'no-void': 'off',
    '@typescript-eslint/no-unused-vars': [
      'error',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
    ],
    // react-navigation's `tabBar` prop is invoked as a function, so the
    // component has to be constructed inline for its hooks to work.
    'react/no-unstable-nested-components': ['warn', { allowAsProps: true }],
  },
  overrides: [
    {
      // UUID generation is bit manipulation by definition.
      files: ['src/utils/id.ts'],
      rules: { 'no-bitwise': 'off' },
    },
  ],
};
