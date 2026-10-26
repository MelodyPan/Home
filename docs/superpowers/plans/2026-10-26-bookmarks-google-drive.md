# Bookmarks Google Drive Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Bookmarks uses private Google Drive storage exclusively for personal cross-device use.

**Architecture:** A browser Drive store uploads immutable JSON snapshots with parent references, discovers data sets through appProperties, and detects multiple graph heads as conflicts. The existing UI consumes a cloud session; local servers serve assets and OAuth public config only. Existing growth storage remains unchanged.

**Tech Stack:** Existing plain JavaScript/CommonJS, Node test runner, Google Identity Services OAuth token client, Drive REST v3; no new runtime dependency.

**Spec:** `docs/superpowers/specs/2026-10-26-bookmarks-google-drive-design.md`

## Global Constraints

- bookmarks 一律使用雲端，不保留目前本機資料讀寫方式或模式切換。
- Tokens and unsynced drafts remain in memory. Only display preferences may persist in browser storage.
- No deletion or automatic upload of existing private files; no change to growth storage.
- No claims of real Google account verification without configured credentials and an actual account test.

## Review Focus

- Concurrent creation and uncertain upload outcomes must preserve all versions, not overwrite another device.
- Account changes during a pending upload must never expose or retry another account's draft.
- Corrupt graph metadata, pagination, duplicate datasets and deleted parents must not silently load an empty library.
- Reconnection and page focus refresh must not discard unsynced memory drafts.
- Removing local bookmark services must not break growth, shutdown, static builds or startup health checks.

## Task 1: Drive snapshot store

**Files:** Create `apps/bookmarks/Javascript/bookmark-drive.js`, `apps/bookmarks/tests/bookmark-drive.test.cjs`.

**Interfaces:** `createDriveStore({request,token,uuid})` produces `account()`, `listLibraries()`, `create(document)`, `read(datasetId)`, `write(datasetId,document,expectedHeads)` and `resolve(datasetId,document,expectedHeads)`. Read returns `{datasetId,document,revision,heads}`; multiple heads throw `DriveError` with `code: 'conflict'` and head choices. `revision` is an array of immutable Drive file IDs. Requests are authenticated with an in-memory token getter.

- [x] Write failing tests for two clients saving the same revision, restore choices, incomplete uploads, pagination, malformed metadata and forbidden/auth errors.
- [x] Run `node --test tests/bookmark-drive.test.cjs` in `apps/bookmarks`; expect missing module failure.
- [x] Implement immutable snapshots (`format`, `datasetId`, `parents`, `data`). Metadata contains purpose, dataset and ordinary parent; merge snapshots identify themselves and their full parents are validated from the envelope. Preallocate file IDs for retriable uploads; never overwrite snapshot files.
- [x] Run targeted tests; expect all pass.

## Task 2: Browser cloud session and UI

**Files:** Create `Javascript/bookmark-cloud.js` and `tests/bookmark-cloud.test.cjs`; modify `Javascript/home.js`, `src/home.html`, `src/home.css`, generated `bookmarks.html`.

**Interfaces:** `createCloudSession({store,authorize,onChange})` owns connection/account/dataset/revision/draft, exposes `connect()`, `open(datasetId)`, `create(document)`, `save(document)`, `retry()`, `refresh()`, `resolve(headId)`, `disconnect()`, `state`. Session forbids wrong-account draft recovery and handles all pending work before clearing state. Browser adapter wires Google token client and explicit connect, import/create, dataset choices, conflict choices and disconnect buttons.

- [x] Write failing session tests: account isolation, memory draft retry, focus refresh, conflict, auth expiry, offline mutation guard, disconnected empty state and pending work.
- [x] Run session test; expect missing module failure.
- [x] Implement session and UI with clear errors, import count confirmation and manual export. Remove private localStorage reads/writes, local fetch and background URL-check calls from home.js; retain display layout preferences only. Re-render navigation after connection and data reload.
- [x] Run session and existing editing/core tests; expect pass.

## Task 3: Cloud-only serving and public configuration

**Files:** Modify `apps/bookmarks/scripts/server.cjs`, `scripts/home-site-server.cjs`, `scripts/home-site-build.cjs`, `apps/shared/Javascript/app-runtime.js`; create `apps/bookmarks/scripts/drive-config.cjs`, root `bookmarks.config.json`; update server/build integration tests in bookmarks and scripts.

**Interfaces:** `loadDriveConfig(homeRoot,env)` returns allowlisted `{mode:'drive',googleClientId,homeUrl}`. `BOOKMARKS_GOOGLE_CLIENT_ID` overrides public config. Every server/build sends bookmarks cloud config, including localhost; growth keeps existing preview/local modes.

- [x] Write failing tests proving local bookmark routes are absent, startup does not create bookmark files, unknown config fields never publish, and build copies Drive modules but no private data.
- [x] Run targeted server/build tests; expect failure against old endpoints.
- [x] Remove obsolete local bookmark persistence and recheck routes/tests; retain shutdown security, health and growth delegation. Replace shared lock test with growth-only concurrency verification. Update version hash and static asset allowlists.
- [x] Run impacted server, startup, growth and build tests; expect pass.

## Task 4: Setup guide and full verification

**Files:** Update bookmarks README, user guide, home-integration and cloud-integration docs; create `docs/google-drive-setup.md` under bookmarks; update root README if necessary.

- [x] Document OAuth consent, Drive API, client ID, exact localhost and HTTPS origins, same client across devices, API quota/storage considerations, account consent expiry, imports, immutable snapshots, conflict recovery and manual backup.
- [x] Run `npm test` and `npm run build`, keeping verbose output in task logs; expect all suites pass and public build contains empty embedded bookmark data plus cloud-only code/config.
- [x] Inspect UI using available browser controls if possible; no real Google API claims with blank Client ID.
- [x] Run a fresh final code review and fix material findings with regression tests, then deliver changes and explicitly identify remaining user Google configuration.

## Execution record

- User approved implementation on 2026-10-26; proceed in this session without another plan approval round.
- Work remains in the user's requested checkout as reviewable uncommitted changes. Do not create another worktree or commit/push without further need.
- Task 1–2 share store document/revision/error contracts; Task 2–3 share config/runtime assets. All refer to the signatures above.
- No atomic Drive overwrite assumption: append-only snapshots were explicitly allowed in the approved design. Files grow over time; first version keeps history instead of automatic cleanup.

## Verification record — 2026-10-26

- Tasks 1–4 complete for code, simulated verification and setup documentation. Changes remain uncommitted and unpublished in the existing checkout.
- `npm test`: 155 passed, 0 failed (bookmarks 65, growth 53, shared 1, admin 25, scripts 11).
- `npm run build`: passed; public bookmarks config selects Drive with a blank Client ID awaiting user setup; no local bookmark data endpoint or startup file initialization remains.
- `node apps/bookmarks/tests/bookmark-drive.browser.cjs` with bundled Playwright and Edge: passed 9 scenarios, including concurrent two-client edits and explicit resolution, account-change failures, clearing disconnected UI, private localStorage absence and mobile width.
- Final independent review: no remaining actionable Critical/Important findings or meaningful minors. Two material findings fixed with failing regression tests before implementation: invalidate previous account identity during new authorization; preserve initial dataset identity across uncertain creation and subsequent-device writes.
- Additional regression tests verify failed-resolution retry and reconnecting a conflict without losing the in-memory draft.
- Ruling: keep immutable history without automatic deletion, as allowed by the approved design; Drive space usage grows with saves and is documented.
- Ruling: retain changes in the requested checkout without commit/push or publication; the user authorized implementation, not website deployment.
- Review boundaries: real Google OAuth/Drive behavior and actual cross-device acceptance require the user's Client ID and account. These are explicitly pending, not declared complete. Temporary transformation files and logs are excluded from the deliverable and removed.
- User confirmed no Client ID yet and requested setup instructions; see `apps/bookmarks/docs/google-drive-setup.md`. No private data was automatically uploaded.

## 後續介面與資料夾驗證
- Drive 功能集中於右上角「登入」管理視窗；移除首頁同步提示、成長相簿入口、左下 Home 首頁入口及歡迎橫幅。
- npm test：159 項通過。Drive 設定測試在移除 Home 入口後再次通過。
- 模擬 OAuth/Drive 的 Edge 瀏覽器測試通過：重新匯入、MelodyHome 資料夾、跨裝置、衝突處理、手機寬度。npm run build 通過。
- 真實 Google 帳號的資料夾建立與舊版本搬移，須由使用者重新連接後確認。

## 登入恢復與閒置期限
依使用者要求，授權憑證改存分頁 sessionStorage；重新整理先檢查授權及閒置期限，再向 Drive 確認帳號、重載書籤。pointer/keyboard/scroll/touch 操作延長 10 分鐘；滿期或 Google 憑證過期清除登入、畫面與草稿。書籤及草稿不寫入瀏覽器儲存。新增登入快取測試，161 項測試通過；Edge 模擬測試驗證 F5 恢復、操作延長、逾時登出及逾時後 F5 不恢復。公開建置通過。
