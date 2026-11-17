// F-33b: `next lint` had no configuration. ESLint 9 flat config wrapping Next's recommended rules.
// Builds are unaffected: next.config.ts sets eslint.ignoreDuringBuilds.
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FlatCompat } from '@eslint/eslintrc';

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

export default [
  { ignores: ['.next/**', 'node_modules/**', 'out/**', 'public/**', 'next-env.d.ts'] },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
];
