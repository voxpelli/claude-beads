import { voxpelli } from '@voxpelli/eslint-config'

// diarie's OWN lint config. It did not have one: ESLint — the config AND the `eslint` /
// `@voxpelli/eslint-config` dependencies — lived only at the repo root, which reached in through
// a `cliFiles: ['diarie/**/*.js']` glob. So a `git subtree split --prefix=diarie` would have
// carried the source and left the linter behind entirely, and the extracted package would have
// shipped with no lint at all while reporting success. Same story for tsc, type-coverage and knip:
// the configs travelled, the SCRIPTS that invoke them did not. `diarie/package.json` had exactly
// one script, `test`.
//
// Now the workspace owns its gates and the root DELEGATES (`npm run check --workspace=diarie`)
// instead of reaching in. That inversion is what makes the split a no-op rather than an amputation.
//
// Options match the root's, deliberately: this package's style must not fork from the repo it
// still lives in.
//   - noMocha:   node:test, not Mocha.
//   - semi:false neostandard's default, and what every file here already is. (On extraction to
//                ~/Sites/node this flips to semicolons — a separate, deliberate decision.)
//   - cliFiles:  diarie is a library-with-a-bin, and `process.exit`/sync I/O are correct in the
//                bin and in the migrator. Preserved verbatim from the root's treatment of
//                `diarie/**/*.js`, so switching owners changes no rule.
export default [
  {
    name: 'diarie/generated-declarations',
    // The `.d.ts` that `npm run build` emits next to their sources (declaration.tsconfig.json), for
    // `prepack` to put in the tarball. They are TypeScript output — semicolons, double quotes — and
    // eslint fails them on sight, so a developer who builds and then checks gets a red gate over
    // generated files they did not write.
    //
    // Ignoring them is the fix, NOT a `clean` step before the check: `check` is `run-p check:*`, and a
    // cleaner racing six parallel gates is a bug waiting to be blamed on something else. tsc and knip
    // are both content with the files present (measured) — only eslint objects, so only eslint is told.
    //
    // `*-types.d.ts` is deliberately NOT ignored: that is the escape hatch for a HAND-WRITTEN ambient
    // declaration, which must stay linted and committed. It is the same convention the clean scripts in
    // @voxpelli/typed-utils use, and it is why the ignore is not a bare `*.d.ts`.
    ignores: ['lib/**/*.d.ts', 'lib/**/*.d.ts.map', '!lib/**/*-types.d.ts'],
  },
  ...voxpelli({
    noMocha: true,
    semi: false,
    // Exactly the root's old `diarie/**/*.js` glob, expressed from inside. Test files are included
    // deliberately: they were CLI-treated before this move, and switching owners must change no
    // rule. Dropping them re-armed `n/no-sync` across the suite, which builds its stores with
    // mkdtempSync — a gate change smuggled in under a packaging change.
    cliFiles: ['**/*.js'],
  }),
  {
    name: 'diarie/repo-style',
    rules: {
      // Uniform NAMED imports for node builtins (`import { join } from 'node:path'`).
      // import-style would force node:path alone to a default import.
      'unicorn/import-style': 'off',
      // Paths here are computed from argv, import.meta.url, or a --root the user passed —
      // never untrusted external input. The non-literal-fs "taint" warnings are inherent noise.
      'security/detect-non-literal-fs-filename': 'off',
      'security/detect-non-literal-regexp': 'off',
    },
  },
]
