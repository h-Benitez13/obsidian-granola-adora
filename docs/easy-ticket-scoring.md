# Easy Ticket Heuristic Scoring

This scorer is the first gate for bot-fixable low-level work.

## Principle

The classifier is **fail-closed**.

If context, verification, or risk information is missing, the ticket is **not**
treated as easy.

## Hard fail rules

- missing repo
- missing context
- no deterministic verification path
- more than 5 changed files
- multiple product areas involved
- touches infrastructure
- touches auth/permissions
- touches data model

## Positive scoring signals

- very small file count
- single product area
- tests exist
- deterministic verification exists
- context already available
- repeated known pattern
- low-risk fix type (`copy_change`, `config_small`, `ui_text`, `small_bugfix`)

## Output

The scorer returns:

- `easy`
- `score`
- `passedRules`
- `blockingReasons`
- `rationale`

This makes later LLM refinement explainable instead of replacing the heuristic
decision boundary.
