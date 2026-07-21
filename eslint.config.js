import { voxpelli } from '@voxpelli/eslint-config'

// vp-beads ships pure markdown + JSON plus the .mjs validation tooling
// (validate-plugin.mjs and everything under scripts/). neostandard via
// @voxpelli/eslint-config lints that tooling; type-checking rules are
// deactivated by the config (the types-in-JS workflow delegates those to tsc),
// so JSDoc @typedef/@param style is preserved.
//
// Options chosen to fit the repo rather than reshape it:
//   - noMocha:   the check-*.mjs use a hand-rolled test() harness, not Mocha.
//   - semi:false the existing tooling is already semicolon-free (neostandard's
//                own default) — keep it.
//   - cliFiles:  there is no lib/ here — every .mjs IS a CLI tool, so
//                process.exit(), console, and sync I/O are correct everywhere.
export default [
  {
    // THE WORKSPACE OWNS ITS GATES; THE ROOT STOPS REACHING IN.
    //
    // This config used to lint `diarie/**/*.js` through a `cliFiles` glob — while `eslint` and
    // `@voxpelli/eslint-config` lived only in the ROOT devDependencies. So a `git subtree split
    // --prefix=diarie` would have taken the source and left the linter behind: an extracted
    // package with no lint config, no lint dependency, and nothing to say so.
    //
    // diarie now has its own `eslint.config.js` and its own devDeps, and the root delegates via
    // `check-workspaces` → `npm run check --workspaces --if-present`. Ignoring it here is not a coverage
    // loss — it is what stops diarie being linted TWICE, by two configs that can drift.
    name: 'vp-beads/delegate-to-workspace',
    ignores: ['diarie/**'],
  },
  ...voxpelli({
    noMocha: true,
    semi: false,
    cliFiles: ['scripts/**/*.mjs', 'plugins/diarie-adopt/scripts/**/*.mjs', 'validate-plugin.mjs'],
  }),
  {
    name: 'vp-beads/repo-style',
    rules: {
      // The tooling uses uniform NAMED imports for node builtins
      // (`import { join } from 'node:path'`). import-style would force node:path
      // alone to a default import, making the codebase internally inconsistent
      // for pure style churn.
      'unicorn/import-style': 'off',
      // This is file-validation tooling: it reads the plugin's OWN files by
      // paths computed from CLAUDE_PLUGIN_ROOT / import.meta.url / argv — never
      // untrusted external input. The non-literal-fs/regexp "taint" warnings are
      // inherent noise here.
      'security/detect-non-literal-fs-filename': 'off',
      'security/detect-non-literal-regexp': 'off',
    },
  },
]
