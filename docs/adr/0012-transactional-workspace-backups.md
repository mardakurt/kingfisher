# 0012 — Workspace backup is versioned, validated, and transactional

**Status:** Accepted

## Context

The application is local-first and has no server copy. A useful backup must
cover authored work, preferences, and the Phase 3 entities, while imported game
collections can be far larger and are often reproducible from their source
PGNs. A malformed restore must never partially replace good local data.

## Decision

The JSON format has an explicit format name and version. Authored stores are
always included; imported game summaries, content, and position indexes are an
opt-in all-or-nothing triple. Every record is validated before a write
transaction starts.

Merge upserts matching IDs. Replace clears only the stores represented by the
backup and writes all replacements inside one transaction. A portable backup
that excludes games cannot clear or smuggle partial game data.

## Alternatives considered

- **Raw IndexedDB dump:** browser-specific and unable to validate domain data.
- **Always include games:** complete, but produces unnecessarily huge backups.
- **Clear then import in separate transactions:** simpler, but a failure loses
  the current workspace.

## Consequences

- Restore either commits as a complete unit or leaves current records intact.
- Future incompatible formats must add a version migration or be rejected
  explicitly.
- Cloud sync remains a separate concern; this format is a portable local
  safety mechanism, not a synchronization protocol.
