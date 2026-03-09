# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0][] - 2026-03-09

### Added

- **`skills/retrospective`** — Sprint retrospective generator. Reads git history,
  `UPSTREAM-*.md` files, and conversation context to produce `RETRO-NN.md` files.
  Every 4th sprint triggers a full trend review (UPSTREAM files, beads health,
  Basic Memory graph health). Promoted and generalized from a project-local skill.
- **`skills/upstream-tracker`** — Upstream issue tracking for vendor and npm
  packages. Manages `UPSTREAM-*.md` files with five workflows: log, review,
  resolve, trend-review, and retrospective-support. Vendor packages are declared
  via `.claude/vendor-registry.json` or `workspaces`. Promoted and generalized
  from a project-local skill.

[0.1.0]: https://github.com/voxpelli/claude-beads/releases/tag/v0.1.0
