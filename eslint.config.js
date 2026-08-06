import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
      // Honour the leading-underscore convention the codebase already writes.
      // Positional bindings often cannot be dropped — a tuple element you must
      // skip past, a destructured field kept to document the shape, a handler
      // whose signature is fixed by its caller. Authors marked those `_pid`,
      // `_droppedIncrease`, `_notificationType` and so on, meaning "unused on
      // purpose", but the rule was left at its defaults and flagged them
      // anyway. The signal only works if the linter respects it, so make it so
      // rather than deleting bindings that are deliberately there.
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
        },
      ],
    },
  }
);
