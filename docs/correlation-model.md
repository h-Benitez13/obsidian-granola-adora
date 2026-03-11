# Incident and Support Correlation Model

This module defines how source records can be correlated before they are turned
into incidents, learnings, or hoverboard recommendations.

## Goals

- prefer exact evidence over heuristic guesses
- preserve confidence and review requirements
- keep ambiguous matches out of automatic promotion paths

## Evidence order

### Strong evidence

- shared `relatedIds`
- shared Linear issue IDs like `WEB-42`
- shared evidence URLs/permalinks

These can produce **high-confidence** correlations.

### Weak / heuristic evidence

- same repo
- temporal proximity (within 72h)
- overlapping keywords in titles/summaries

These remain **review-required** unless paired with exact evidence.

## Review rule

A correlation is automatically review-required when:

- it lacks exact evidence, or
- multiple candidates score within `0.05` of the top score

That second rule prevents the system from over-committing when several plausible
targets exist.

## Current intent

This is a reusable scoring model. It does not yet replace the existing Obsidian
linker flows; it provides the durable correlation contract that later tasks can
use to connect incidents, support signals, PRs, and recommendations.
