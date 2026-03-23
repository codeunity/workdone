# Plan: Deterministic alias resolution for `sources select`

> Source PRD: `https://github.com/codeunity/workdone/issues/20`

## Architectural decisions

Durable decisions that apply across all phases:

- **Command surface**: Keep the existing `workdone sources select <folder> [--max-depth <n>]` flow introduced by issues `#18` and `#19`. This issue polishes alias behavior and user-facing clarity rather than changing the command structure.
- **Config shape**: Preserve the flat config model: config version `1` with `sources: Source[]`. Alias resolution changes only affect the `name` persisted for newly selected sources.
- **Configured alias preservation**: Existing configured sources keep their current alias/name unchanged throughout the session and on save.
- **New-source alias model**: Newly selected repositories still derive their default alias from the repository folder name, but collisions are now resolved instead of being skipped.
- **Collision strategy**: For new repositories, resolve alias conflicts deterministically by first prefixing with the nearest parent directory inside the scanned root and, if needed, falling back to numeric suffixes such as `-1`, `-2`, and so on.
- **Visibility rule**: The interactive checklist and save summary must expose the alias that will actually be persisted so users can understand the resolved outcome before confirming.
- **Persistence scope**: Continue using the scoped reconciliation model from issue `#19`: alias changes only apply within the relevant source set for the active selection session and do not rewrite unrelated sources outside that scope.

---

## Phase 1: Model visible alias proposals in the selection session

**User stories**: 14, 15, 17

### What to build

Extend the current source-selection session so each entry carries the alias that will be saved if the user confirms. Existing configured sources should display their preserved alias, while newly discovered repositories should display a proposed alias directly in the checklist instead of hiding alias behavior behind later persistence logic.

### Acceptance criteria

- [ ] Every session entry exposes the alias that would be persisted on confirm.
- [ ] Existing configured sources keep their current alias proposal unchanged.
- [ ] Newly discovered repositories display a visible proposed alias in the checklist.

---

## Phase 2: Add deterministic collision resolution for new repositories

**User stories**: 15, 16, 18, 19

### What to build

Replace the current skip-on-conflict behavior for new repositories with deterministic alias resolution. When a default folder-name alias collides, the selector should propose a readable parent-prefixed alias using the nearest parent directory inside the scanned root, and if that still collides or cannot be used, fall back to numeric suffixes. The result should be stable and predictable across reruns.

### Acceptance criteria

- [ ] New repositories are no longer skipped solely because their default alias collides.
- [ ] Collisions are resolved using the parent-prefix-then-numeric-suffix strategy from the PRD.
- [ ] The same inputs produce the same suggested alias outcomes across reruns.

---

## Phase 3: Polish checklist labels, help text, and save summaries

**User stories**: 17, 24, 28

### What to build

Make the finished alias behavior obvious and trustworthy in the user experience. The checklist should clearly show the persisted alias proposal, help text should explain the final behavior, and the post-confirm summary should reflect the completed `sources select` experience in terms a user can understand without opening the config file.

### Acceptance criteria

- [ ] The checklist labels clearly show the alias that will be saved for each relevant entry.
- [ ] Help text documents the final `sources select` behavior, including visible alias handling.
- [ ] Save summaries clearly communicate the final outcome of the selection session.

---

## Phase 4: Harden alias and final-flow behavior with regression coverage

**User stories**: 14, 15, 16, 17, 18, 19, 24, 28

### What to build

Protect the finished selector with regression coverage around the most fragile final-mile behaviors: configured alias preservation, deterministic collision resolution, visible alias labels, and end-to-end final-flow behavior. This phase should leave the completed parent feature stable for future maintenance.

### Acceptance criteria

- [ ] Regression coverage protects configured alias preservation and deterministic collision-resolution outcomes.
- [ ] Regression coverage protects visible alias labels and final save-summary behavior.
- [ ] The completed selector remains demoable as a polished end-to-end flow for selecting and naming sources under a root.
