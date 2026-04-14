# workdone

[![CI](https://github.com/codeunity/workdone/actions/workflows/ci.yml/badge.svg)](https://github.com/codeunity/workdone/actions/workflows/ci.yml)

`workdone` is a CLI that reports work done from your local git repositories — filtered by your git identity, across any time range you choose.

## Install

`workdone` ships as native binaries for macOS Apple Silicon and Windows x64.

**macOS Apple Silicon**

```bash
curl -fsSL https://raw.githubusercontent.com/codeunity/workdone/main/install.sh | sh
```

**Windows PowerShell**

```powershell
irm https://raw.githubusercontent.com/codeunity/workdone/main/install.ps1 | iex
```

The installers fetch the latest stable release from GitHub, verify the SHA256 checksum, install into a user-scoped directory, and update your PATH.

To install a specific version:

```bash
# macOS
curl -fsSL https://raw.githubusercontent.com/codeunity/workdone/main/install.sh | sh -s -- --version v0.7.1
```

```powershell
# Windows
$env:WORKDONE_VERSION = "v0.7.1"
irm https://raw.githubusercontent.com/codeunity/workdone/main/install.ps1 | iex
```

> If the `workdone` command is not found after install, open a new terminal window to pick up the updated PATH.

## Getting Started

**1. Register your repositories**

Run `sources select` from your projects root folder. An interactive checklist lets you pick which git repos to track:

```bash
workdone sources select ~/code
```

Space toggles a repo, Enter confirms, Esc/q cancels. Aliases are assigned automatically and collisions are resolved deterministically.

**2. (Optional) Fetch remote work**

If you push commits from multiple machines, sync first so remote-tracking branches are up to date locally:

```bash
workdone sync
```

**3. Run a report**

```bash
workdone report
```

Reports are filtered by your git identity (`git config --global user.email`) and default to the current week (Monday–Sunday, local time).

### Example output

```
Week starting 3/24/2026 (Monday, local time)

Monday, March 24
Day total: 3 commits, 8 files, +142 -27 Δ169, 0 binary

Time   Hash      Files   +    -    Δ    Bin  Subject
-----  -------   -----  ---  ---  ---  ---  -------
09:14  3fa81bc       3   89    4   93    0  add user auth with JWT and refresh tokens
11:42  c2d905e       4   41   19   60    0  refactor token store to use repository pattern
16:08  a9e3d17       1   12    4   16    0  fix token expiry off-by-one on clock skew

Tuesday, March 25
Day total: 2 commits, 5 files, +67 -12 Δ79, 0 binary

Time   Hash      Files   +    -    Δ    Bin  Subject
-----  -------   -----  ---  ---  ---  ---  -------
10:33  8bc14f2       2   34    7   41    0  add password reset email flow
15:55  f01a3ec       3   33    5   38    0  add e2e tests for auth endpoints
```

## Commands

```
workdone report [options]
  -s, --source <alias|path>   Limit report to one source
  -f, --files                 Include per-file breakdown
  -V, --view <view>           timeline (default) | by-source
  -F, --format <format>       text (default) | markdown

  Date range (pick one):
      --week <value>          Relative: --week=-1 (last week)
                              Absolute: --week=5 or --week=2026-5
      --since <YYYY-MM-DD>    Start date; end defaults to now
      --until <YYYY-MM-DD>    End date; requires --since
      --today
      --yesterday
      --this-month
      --last-month

workdone sync [options]
  -s, --source <alias|path>   Sync one source only
  Runs git fetch --all --prune for each registered source.
  Exit code 0 when all synced, 1 when any source fails.

workdone sources list
workdone sources add <path> [--name <alias>]
workdone sources remove <alias|path>
workdone sources validate
workdone sources select <folder> [--max-depth <n>]
  Interactive TTY checklist — discovers git repos under <folder>,
  merges with your current config, and saves your selection.
  Reruns preserve aliases and checked state.

workdone users list
workdone users add <email>
workdone users remove <email>
  Configure additional author emails to include in reports.
  When multiple users are configured, each commit row shows the author.
  Falls back to your global git email when the list is empty.

workdone update
  Check for a newer release and, if one is available, prompt to apply it in place
  with checksum verification.

workdone config
  Print the config file path.

workdone --version
workdone --help
```

---

## Development

Requires [Bun](https://bun.sh).

```bash
bun install          # install dependencies
bun run src/cli.ts --help  # run CLI from source
bun test             # run tests
```

## Build

Build native binaries for Windows x64 and macOS arm64:

```bash
bun run build
```

Artifacts are written to `dist/`:

- `dist/workdone-windows-x64.exe`
- `dist/workdone-darwin-arm64`

## CI and Release

| Workflow | Trigger | Purpose |
|---|---|---|
| `ci.yml` | PR + push to `main` | Run tests, validate installers, smoke-check CLI and binaries |
| `release-please.yml` | Push to `main` | Maintain `CHANGELOG.md`, create release PRs and GitHub releases |
| `release-assets.yml` | Release created | Build and upload binaries + SHA256 checksums to the GitHub release |
| `semantic-pr.yml` | PR opened/updated | Enforce conventional-commit PR titles |

Releases follow [conventional commits](https://www.conventionalcommits.org). Merge a `feat:` PR to trigger a minor bump; `fix:` triggers a patch bump. `package.json` is updated automatically by release-please.
