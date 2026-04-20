# Releasing

This document is for maintainers. It covers how to cut a release and publish packages to npm.

## Overview

sdk-forge uses [Changesets](https://github.com/changesets/changesets) for versioning. All three packages (`@sdk-forge/core`, `@sdk-forge/generator-typescript`, `sdk-forge`) are versioned in lockstep — they always share the same version number.

Publishing to npm is triggered automatically by pushing a `v*` tag to `main`. The GitHub Actions publish workflow handles the rest.

## Step 1 — Record changes as you work

Any time you merge a meaningful change (fix, feature, breaking change), add a changeset describing it:

```bash
bun changeset
```

This opens an interactive prompt:

1. Select which packages changed (use space to select, usually all three for anything touching the IR or generator)
2. Pick the bump type:
   - `patch` — bug fixes, non-breaking improvements
   - `minor` — new features, new capabilities (e.g. a new generator option)
   - `major` — breaking changes to the IR, generated output, or CLI interface
3. Write a one-line summary of what changed (this becomes the CHANGELOG entry)

A small markdown file is written to `.changeset/`. Commit it alongside your code changes.

## Step 2 — Prepare the release

When you're ready to ship, run:

```bash
bun run version
```

This will:
- Bump the version in all three `package.json` files
- Rewrite `workspace:*` dependencies to the actual new version number
- Consume all pending changeset files (deletes them)
- Update `CHANGELOG.md` with entries from each changeset

Review the diff — especially `CHANGELOG.md` and the version numbers — then commit:

```bash
git add .
git commit -m "chore: release v0.2.0"
```

## Step 3 — Tag and push

```bash
git tag v0.2.0
git push && git push --tags
```

The `publish.yml` GitHub Actions workflow fires on the `v*` tag, builds all packages, and publishes them to npm using `changeset publish`.

## Step 4 — Verify

Check that all three packages appear on npm:
- npmjs.com/package/sdk-forge
- npmjs.com/package/@sdk-forge/core
- npmjs.com/package/@sdk-forge/generator-typescript

## Semver guide

| Change | Bump |
|--------|------|
| Bug fix | `patch` |
| New CLI flag or generator option | `minor` |
| New language generator | `minor` |
| IR schema change (additive) | `minor` |
| IR schema change (breaking) | `major` |
| Breaking change to generated SDK shape | `major` |
| Breaking CLI interface change | `major` |

## Pre-1.0 note

While on `0.x.y`, only the latest version is supported. If a bug is found in an older version, users should upgrade to the latest rather than expecting a backport. Once `1.0.0` is released this policy will be revisited.

## Emergency hotfix

If a critical bug needs to ship outside the normal flow, skip `bun changeset` and bump the version manually:

1. Fix the bug on a branch, PR to `main`, merge
2. Manually edit the `version` field in all three `package.json` files to the new patch version
3. Update `CHANGELOG.md` with a brief entry
4. Commit, tag, push as normal
