# Rollout Controls and Audit Logs

This layer provides two reusable primitives:

- rollout gating
- automation audit rendering

## Rollout gating

`evaluateRolloutControl()` answers one question:

- should a side effect execute right now?

It blocks execution when:

- dry-run mode is enabled
- the execution budget is already exhausted

## Automation audit logs

Audit log helpers generate deterministic:

- log folder paths
- log file paths
- markdown blocks
- markdown file content

This keeps automation reporting consistent across recommendation, incident, and
ticket-generation flows.
