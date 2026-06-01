---
name: Release Checklist
about: Checklist for creating a new release
title: 'Release v'
labels: release
---

## Release Checklist

- [ ] Update VERSION in `packages/shared/src/constants.ts`
- [ ] Run `bun run version:set -- <version>` to sync all version numbers
- [ ] Run `bun run version:check` to verify
- [ ] Run `bun run typecheck` + `bun test` locally
- [ ] Update CHANGELOG.md with release notes
- [ ] Commit version bump: `git commit -m "chore: release v<version>"`
- [ ] Create git tag: `git tag v<version>`
- [ ] Push commit and tag: `git push && git push --tags`
- [ ] Create GitHub Release from tag with changelog notes
- [ ] Wait for release.yml workflow to complete
- [ ] Verify npm packages published: `npm view ymir version`
- [ ] Verify release assets uploaded to GitHub
- [ ] Test install: `npm install -g ymir`
- [ ] Test from-source: `bun run scripts/install.ts`
