# Plan: Reconcile configured sources into `sources select`

> Source PRD: `https://github.com/codeunity/workdone/issues/19`

## Architectural decisions

Durable decisions that apply across all phases:

- **Command surface**: Keep the existing `workdone sources select <folder> [--max-depth <n>]` command introduced in issue `#18`. This issue evolves its behavior from one-shot import into source-set editing.
- **Config shape**: Preserve the current flat config model: config version `1` with `sources: Source[]`. This issue does not add persisted root metadata or a separate mapping of roots to selections.
- **Relevant source set**: The editable session for a scanned root is the union of repositories discovered under the requested root and currently configured sources that belong to that root context, including stale entries that are no longer discoverable.
- **Selection state**: Checked state is derived from current configured membership. Rerunning the command should feel like editing an existing selection, not re-importing from scratch.
- **Validation model**: Display status using the existing validation semantics (`missing`, `not_directory`, `not_git_repo`, `not_accessible`) so validation results remain consistent with the rest of the CLI.
- **Persistence scope**: Saving computes add/remove/keep changes only for the relevant source set tied to the current selection session. Sources outside that scope remain untouched.
- **Interaction contract**: The checklist remains TTY-only and path-ordered. This issue enriches the displayed items and save semantics without changing the basic move/toggle/confirm/cancel control model.

---

## Phase 1: Build one editable session from discovered and configured sources

**User stories**: 3, 11, 29, 30

### What to build

Change the selection session from a list of newly addable discoveries into a list that reflects the current source set for the scanned root. The session should merge repositories found in the current scan with the already-configured sources that belong to the same root context, and it should derive checked state from current configuration so reruns behave like editing the same set over time.

### Acceptance criteria

- [ ] Running `sources select` for the same root multiple times reflects the current configured membership rather than rebuilding a fresh default import list.
- [ ] The interactive session includes both current discoveries and relevant configured entries for the scanned root context in one path-ordered list.
- [ ] Checked state is driven by current config so the command behaves like an editor for the current source set.

---

## Phase 2: Surface stale entries and inline validation in the checklist

**User stories**: 7, 8, 9, 27

### What to build

Make the checklist informative enough that users can decide what to keep or remove without leaving the command. Configured-but-undiscovered entries should remain actionable in the same list, and every displayed item should show a compact validation-style status so the user can see whether an entry is healthy, missing, inaccessible, or no longer a git repository.

### Acceptance criteria

- [ ] Configured sources that are relevant to the current root context still appear even when they are not in the current scan result.
- [ ] Every displayed item shows a compact status derived from the CLI’s existing validation model.
- [ ] Users can evaluate stale or invalid entries directly in the checklist instead of needing a separate command to decide whether to keep them.

---

## Phase 3: Apply scoped add/remove/keep reconciliation on save

**User stories**: 4, 12, 13, 20, 26, 28

### What to build

Turn confirmation into a true reconciliation step. Saving should compare the edited session to the preexisting configuration and apply add/remove/keep changes only within the relevant source set for the current root context. This makes deselection meaningful while preserving the flat config shape and ensuring unrelated sources outside the current scope are not rewritten.

### Acceptance criteria

- [ ] Confirming the session computes add/remove/keep changes for the relevant source set instead of only appending new discoveries.
- [ ] Deselecting a relevant configured source removes it from config, while leaving unrelated sources outside the current scope untouched.
- [ ] The command reports a clear save summary that reflects the reconciliation outcome.

---

## Phase 4: Harden repeated-run behavior with regression coverage

**User stories**: 3, 8, 9, 11, 12, 28, 29

### What to build

Lock down the reconciliation model with regression coverage around the behaviors most likely to drift: repeated runs over the same root, stale configured entries, validation-state display inputs, and scoped persistence. This phase ensures the richer `sources select` model remains stable as later work, including alias resolution, builds on top of it.

### Acceptance criteria

- [ ] Regression coverage protects repeated-run behavior where checked state is derived from current config.
- [ ] Regression coverage protects stale-entry handling, validation-state inputs, and scoped add/remove/keep persistence.
- [ ] The completed issue remains demoable as an end-to-end “edit the current source set” flow for a scanned root.
