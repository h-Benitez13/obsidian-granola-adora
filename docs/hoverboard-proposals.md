# Hoverboard Proposal Contract

Phase 1 does **not** open live PRs automatically.

Instead, it creates additive **proposal files** for hoverboard in a dedicated
branch or worktree.

## Contract fields

Every proposal artifact must contain:

- title
- slug
- target kind (`skill` or `command`)
- review state
- confidence score
- risk level
- generated timestamp
- destination branch
- destination path
- source canonical IDs
- evidence pointers
- rationale

## Default destination paths

- skills → `proposals/skills/<slug>.md`
- commands → `proposals/commands/<slug>.md`

These are intentionally additive so Phase 1 can remain recommend-only and
low-risk.

## Review model

Proposal files are meant to be:

1. generated from approved/reviewed recommendations
2. written into a hoverboard branch or worktree
3. inspected by humans before any real integration work happens

This keeps the loop practical without requiring direct mutation of existing
hoverboard skill/command files in the first phase.
