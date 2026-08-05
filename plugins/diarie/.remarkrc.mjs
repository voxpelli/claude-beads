// The shared preset IS the config. remark resolves config by walking up from the
// FILE being linted, so a plugin destined to leave this monorepo needs its own —
// without it an extracted copy finds nothing, falls back to tool defaults, reports
// clean and exits 0. That is the silent green, in the one directory where
// self-containment is the acceptance criterion.
export { default } from '@voxpelli/remark-preset'
