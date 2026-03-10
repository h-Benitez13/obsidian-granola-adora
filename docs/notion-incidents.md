# Notion Incident Database Contract

Structured incident publishing expects a database with at least these property
names:

- `Name` (title)
- `Severity` (rich text or equivalent text field)
- `Status`
- `Repo`
- `Root Cause`

The page body carries the richer narrative sections:

- Summary
- Fix
- Learning
- Evidence
- Related Records

This keeps incident reporting queryable while still preserving readable context.
