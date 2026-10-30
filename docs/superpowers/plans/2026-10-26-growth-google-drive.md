# Growth monthly Google Drive implementation plan

> **For agentic workers:** Use superpowers:subagent-driven-development or superpowers:executing-plans to implement task-by-task.

**Goal:** Replace growth's local storage with private Google Drive, one complete snapshot per Taiwan calendar month, with separate photos and explicit import/backup.

**Architecture:** A growth-specific Drive store follows bookmarks' conditional writes and version ancestry. A cloud controller connects it to existing album rendering, using authorized blob URLs for photos. Local and published servers provide only public assets/configuration.

**Tech Stack:** Node.js 22, browser JavaScript, Google Identity Services, Drive v3, node:test.

**Spec:** docs/superpowers/specs/2026-10-26-growth-google-drive-design.md (approved 2026-10-26).

## Global constraints

- One `growth-YYYY-MM.json` per dataset/month, Asia/Taipei; each holds all children and records.
- Preserve source files; never automatically upload private local data or publish it.
- Do not overwrite concurrent changes; uncertain writes retry the same operation.
- No persistent album browser cache; tokens use existing tab login cache, idle 10 minutes.
- Preserve existing unrelated uncommitted bookmarks work; no deploy, push or commit mixed changes.

## Review focus

- Month rollover while an upload is uncertain must retry the original operation.
- Account changes and logout must not display old photos or allow stale asynchronous work to mutate another account.
- Missing photos must prevent incomplete import and complete-backup claims.
- Same-month simultaneous edits and cross-month creation must reject losing versions.
- Failed save, expiry, offline and dialog edits must retain recoverable drafts or explicitly discard on logout/idle expiry.

## Task 1: Monthly Drive store and portable album format

**Files:** growth Javascript/growth-data.js, growth-drive.js; growth tests/growth-drive.test.cjs and fixtures.

**Interfaces:** `GrowthData.validate(data)`, `photoIds(data)`, `empty()`; preserves schemaVersion 1 fields and adds optional `photoFiles` map of photo UUID filename to Drive ID. `GrowthDrive.createDriveStore({request,token,now,uuid})` offers account/listLibraries/create/read/readHead/write/resolve/reset and `uploadPhoto(blob,id?) -> {id,fileId}`, `readPhoto(id,fileId) -> Blob`; saves verify referenced photoFiles. Photo IDs keep legacy UUID.extension syntax.

- [x] Write failing monthly boundary, concurrency, uncertain retry, photo upload/download and malformed-document tests.
- [x] Run targeted tests and confirm failures.
- [x] Implement independent growth storage using bookmarks' version protocol; private MelodyHome with growth-specific dataset and photo markers. Do not edit bookmarks modules.
- [x] Run tests; verify same-month one file, next month retained snapshots, photo checks, no unauthenticated reads.

## Task 2: Static server and build integration

**Files:** growth scripts/server.cjs; Home server/build; integration tests; growth server tests.

**Interfaces:** Serve growth-data.js/growth-drive.js/growth-cloud-ui.js/growth-backup.js plus existing bookmark-cloud.js/bookmark-login.js under growth/Javascript. Supply existing Drive public configuration to growth in local and published builds. Disable growth local data/photo API; never read/init local store on startup. Existing validation regression tests may exercise the legacy store directly through a test-only harness; production server cannot select local mode.

- [x] Update route/build tests first: private API 404, sources untouched, Drive config and new assets served.
- [x] Observe failures, then implement allowlist and config changes.
- [x] Run Home/build tests and growth legacy validation regression tests.

## Task 3: Browser connection, migration and backup

**Files:** growth Javascript/growth.js, growth-cloud-ui.js, growth-backup.js; growth.html; growth CSS; new tests; README and guide.

**Interfaces:** `GrowthCloudUI.mount({onDocument,onState,hasEdits,onClear}) -> {save(next),uploadPhoto(blob),photoUrl(id),editable,hasUnsaved}`. UI owns token, session, photo map; save either succeeds or throws with draft retained. Existing view delegates storage, guards edits, releases images on clear. `GrowthBackup.readFiles(files) -> {document,photos:Map}` validates all required images before upload; `encode(document,readPhoto) -> Blob` and `decode(file)` implement a portable full backup usable without ZIP dependencies, including photos and integrity checks. Folder import and this portable backup both supported.

- [x] Write failing migration/backup and browser storage bridge tests; run them.
- [x] Implement login manager, library choice, conflict choice, refresh, create, import, retry, full backup, and expiration/account cleanup.
- [x] Bridge existing save/photo methods; preserve dialogs and dirty state, disable editing before auth/offline/conflict.
- [x] Run targeted tests and browser smoke verification; update user guide.

## Task 4: Final verification and review

- [x] Run npm test and npm run build; inspect produced assets/config and privacy boundaries.
- [x] Independent review of growth work, fix material findings with regression tests.
- [x] Report implementation and test results; distinguish real Google-account verification from simulations. Leave changes reviewable in current workspace.

## Execution ledger

- User approved the design after changing daily files to monthly files.
- Existing work is uncommitted; execute in place to incorporate it without discarding or copying private state. No commits or worktree creation requested.
- Baseline npm test passed before implementation.

- Tasks 1–3 complete: monthly store 18 targeted tests; static-only production server and private-route removal; browser login/import/backup integration.
- Final verification: npm test 201/201 (bookmarks 85, growth 79, shared 1, admin 25, Home 11); npm run build succeeded.
- Independent review found cloud Blob ownership and open-dialog refresh baseline defects. Both corrected with RED→GREEN regressions; browser verifies explicit conflict instead of silent overwrite.
- Browser checks passed under headless Edge with mocked Google/Drive: auth, monthly updates, photos, full backup, reload, offline, conflict choice, failed-save draft retry, logout cleanup, independent restore, mobile dialog.
- Ruling: portable backups use a .growth binary container with bounded JSON manifest and SHA-256 photo checksums — avoids adding ZIP dependencies; restore uses the application importer.
- Ruling: keep source changes uncommitted in current workspace — preserves the pre-existing bookmarks work; no deployment or live-account data migration performed.
- True Google account and two-device acceptance remain external verification, not claimed by mocked tests.
