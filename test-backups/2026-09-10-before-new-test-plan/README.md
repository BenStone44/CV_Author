# Test Suite Backup

Snapshot date: 2026-09-10 UTC

This directory preserves the test suite that existed immediately before the
new user-authored test plan. It is intentionally outside `cv-author-app/`, so
Vitest does not discover and execute the backup as a second test suite.

Contents:

- `cv-author-app/src/tests/`: complete active Vitest test directory.
- `cv-author-app/package.json`: test command and dependency metadata.
- `cv-author-app/package-lock.json`: locked dependency versions.
- `cv-author-app/vite.config.ts`: Vite/Vitest configuration at snapshot time.

The active files were copied without modification. Do not edit this snapshot;
create a new dated backup if another test baseline needs to be preserved.
