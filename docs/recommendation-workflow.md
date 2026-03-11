# Recommendation Workflow

This workflow layer wires together the modules added so far.

## Inputs

- heuristic result
- refinement result
- recommendation metadata
- evidence pointers

## Outputs

- canonical recommendation record
- hoverboard proposal artifact
- Obsidian queue note

## Gate behavior

The workflow returns `null` when:

- heuristic gating failed, or
- refinement explicitly rejects promotion

That keeps downstream queue/proposal generation aligned with the fail-closed
policy.
