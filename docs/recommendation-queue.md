# Recommendation Queue

The recommendation queue is the first human review surface inside Obsidian.

## Output format

Each queue item is a markdown note under:

`<baseFolderPath>/Recommendations/`

with machine-readable frontmatter including:

- `type`
- `title`
- `target_kind`
- `review_state`
- `confidence_score`
- `generated_at`
- `source_canonical_ids`
- optional hoverboard proposal branch/path metadata

## Why this exists

It keeps the approval workflow close to the memory layer while preserving enough
structure for later reporting and export.

## Relationship to hoverboard

Queue notes are not hoverboard files.

They are the Obsidian-side review artifact that can point to a generated
hoverboard proposal branch/path once a recommendation is ready for export.
