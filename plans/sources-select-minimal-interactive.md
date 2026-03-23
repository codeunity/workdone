# Plan: Minimal interactive `sources select`

> Source PRD: `https://github.com/codeunity/workdone/issues/18`

## Architectural decisions

Durable decisions that apply across all phases:

- **Command surface**: Replace `workdone sources discover <folder>` with `workdone sources select <folder> [--max-depth <n>]` for this slice, and remove `--dry-run`.
- **Config shape**: Keep the existing flat config model: versioned config with a `sources` collection of local git sources. This slice does not add root metadata or a separate selection-state model to persisted config.
- **Selection scope**: This issue only covers repositories discovered in the current scan. Reconciliation with stale or already-configured-but-undiscovered sources is deferred to later work.
- **Interaction contract**: The command is TTY-only. It presents a simple path-ordered checklist with move, toggle, confirm, and cancel controls. Confirm is the only write point; cancel leaves config unchanged.
- **Discovery and validation boundaries**: Folder existence and directory checks still happen before entering the interactive flow, and repository candidates continue to come from the existing recursive git-repo discovery behavior with `--max-depth`.
- **Source model**: Selected entries are still stored as local git sources with normalized path and alias/name data derived from the current source conventions.

---

## Phase 1: Rename and guard the command

**User stories**: 2, 21, 22, 23, 24, 25

### What to build

Replace the existing discovery command surface with `sources select`, keep the current folder-scanning entry path, and make the command safe to invoke in both interactive and non-interactive terminals. This phase establishes the new user-facing contract, updates help text, keeps `--max-depth`, removes `--dry-run`, and preserves the current folder validation behavior before the interactive session begins.

### Acceptance criteria

- [ ] `workdone sources select <folder> [--max-depth <n>]` is the supported command surface and help text no longer advertises `sources discover` or `--dry-run`.
- [ ] Invalid folder inputs still fail clearly before any interactive behavior begins.
- [ ] Running the command without an interactive terminal fails with a clear message explaining that a TTY is required.

---

## Phase 2: Add a minimal interactive checklist over discovered repos

**User stories**: 1, 5, 6

### What to build

Open a simple interactive selection session for repositories found under the requested root folder. The list should be path-ordered, support moving through items and toggling them on or off, and make confirm/cancel behavior obvious in the terminal so the user can curate the current scan result instead of accepting an all-or-nothing import.

### Acceptance criteria

- [ ] In an interactive terminal, the command renders a simple checklist of discovered repositories from the requested root folder.
- [ ] The checklist supports move, toggle, confirm, and cancel controls with a clear terminal prompt or legend.
- [ ] Cancel exits the session without mutating config.

---

## Phase 3: Persist confirmed selections and harden the flow

**User stories**: 1, 5, 6, 21, 23, 24

### What to build

Connect the interactive session to config persistence so the selected discovered repositories are written only when the user confirms. Finish the minimal slice with regression protection around parsing, save/cancel semantics, and the new command/help contract so the renamed flow is stable and shippable on its own.

### Acceptance criteria

- [ ] Confirm writes only the selected repositories from the current discovery result into config using the existing source model.
- [ ] Cancel leaves config unchanged even after the user has toggled selections during the session.
- [ ] Regression coverage protects command parsing/help behavior and save/cancel outcomes for the minimal interactive flow.
