# workdone

CLI to report work done in the current week from registered local git repositories.

Reports include only commits authored by your global git identity email from:
`git config --global user.email`.

## Install

`workdone` ships as native binaries for macOS Apple Silicon and Windows x64.

macOS Apple Silicon:

```bash
curl -fsSL https://raw.githubusercontent.com/codeunity/workdone/main/install.sh | sh
```

Windows PowerShell:

```powershell
irm https://raw.githubusercontent.com/codeunity/workdone/main/install.ps1 | iex
```

By default, the installers fetch the latest stable GitHub Release, verify its SHA256 checksum, install into a user-scoped directory, and update your user PATH.

To install a specific release instead, pass `--version` on macOS or set `WORKDONE_VERSION` on Windows:

```bash
curl -fsSL https://raw.githubusercontent.com/codeunity/workdone/main/install.sh | sh -s -- --version v0.1.2
```

```powershell
$env:WORKDONE_VERSION = "v0.1.2"
irm https://raw.githubusercontent.com/codeunity/workdone/main/install.ps1 | iex
```

If your shell does not pick up the new PATH entry immediately, open a new terminal window before running `workdone`.

## Commands

- `workdone report`
- `workdone report --source <alias-or-path>`
- `workdone report --files`
- `workdone report --view timeline`
- `workdone report --view by-source`
- `workdone report --format markdown`
- `workdone config`
- `workdone sources list`
- `workdone sources add <path> [--name <alias>]`
- `workdone sources remove <path-or-name>`
- `workdone sources validate`
- `workdone sources discover <folder> [--max-depth <n>] [--dry-run]`

Weeks start on Monday in local time.

## Development

Install dependencies:

```bash
bun install
```

Run the CLI:

```bash
bun run src/cli.ts --help
```

Run tests:

```bash
bun test
```

## Build Executable

Build Windows x64 and macOS arm64 binaries:

```bash
bun run build
```

Artifacts are written to `dist/`:

- `dist/workdone-windows-x64.exe`
- `dist/workdone-darwin-arm64`

Release assets use the same stable filenames so the installers can fetch them from the latest stable GitHub Release.

Run binaries:

```bash
dist/workdone-windows-x64.exe --help
dist/workdone-darwin-arm64 --help
```

Export markdown report:

```bash
workdone report --view by-source --files --format markdown > weekly-report.md
```

## CI and Release

This repository includes GitHub Actions workflows for CI, changelog/versioning, and release artifacts.

- `CI` (`.github/workflows/ci.yml`)
  - Runs tests on pull requests and pushes to `main`
  - Builds Windows x64 and macOS arm64 binaries on `main`
  - Uploads build artifacts for download from workflow runs
- `Release Please` (`.github/workflows/release-please.yml`)
  - Uses conventional commits to maintain `CHANGELOG.md`
  - Creates release PRs and GitHub releases
  - Automatically triggers release asset publishing when a release is created
- `Release Assets` (`.github/workflows/release-assets.yml`)
  - Builds release binaries for Windows x64 and macOS arm64
  - Uploads binaries and SHA256 checksum files to the GitHub release
- `Semantic PR` (`.github/workflows/semantic-pr.yml`)
  - Enforces conventional-commit style PR titles
