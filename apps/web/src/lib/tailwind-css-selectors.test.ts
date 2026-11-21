// Regression: Tailwind `file:` variants once mangled custom rules in globals.css
// into invalid selectors (`::file-selector-buttontable`), breaking CSS parsing.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const root = process.cwd()

test('compiled globals.css has no mangled pseudo-element selectors', async () => {
  const postcss = require('postcss')
  const tailwind = require('tailwindcss')
  const css = readFileSync(join(root, 'src/app/globals.css'), 'utf8')
  const out = await postcss([tailwind({ config: join(root, 'tailwind.config.ts') })]).process(css, {
    from: join(root, 'src/app/globals.css'),
  })
  assert.deepEqual(out.css.match(/::file-selector-button[A-Za-z0-9_.-]/g) ?? [], [])
})
