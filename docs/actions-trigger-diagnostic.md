# GitHub Actions trigger diagnostic

This change checks whether the existing `.github/workflows/ci.yml` workflow
starts for pull requests in A67med/frame after the repository transfer.

Expected behavior: opening this PR should create at least one workflow run.
No app code, release version, updater settings, or build configuration is changed.

This file may be removed once GitHub Actions is confirmed operational.
