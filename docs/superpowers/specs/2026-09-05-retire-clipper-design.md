# Retire Clipper and harden operations

Approved in conversation on 2026-09-05: remove all clipping functionality, entry points and existing clipping data; implement the remaining review recommendations, push and redeploy Nono on nc48.

## Scope

- Remove the Clipper application, API, extraction dependencies, extension clipping workflows, NoDesk search/links, token scopes, backup module and build/test wiring. Ordinary bookmarks and AI bookmark assistance stay supported.
- Keep immutable historical Prisma migrations; add a forward migration dropping only the four clipping tables and removing clipping scopes/settings. Do not drop shared extensions or unrelated user data. A verified full backup precedes the production migration.
- Base deployment migration approval on the database's pending migrations, not Git pull changes. Fail closed when applied migration state cannot be determined for an existing deployment. Build before quiescing all application writers, then take the rollback snapshot from an ephemeral container while the app is stopped. Keep the public entry point unavailable until acceptance succeeds; restore snapshot and old immutable image on failure.
- Run backup/restore requests as authenticated, inspectable jobs. Prevent concurrent destructive operations and duplicate submissions. Preserve browser-only admin authorization and prevent unauthenticated access to job results. Ensure failures and process interruption are visible rather than reporting success.
- Add real PostgreSQL/API integration verification in an isolated test database, including migrations and tenant separation, and behavioral regressions for deployment failure ordering. Never point integration tests at production.
- Generate extension test packages in temporary directories. Update operational and product documentation.

## Deployment

Target: SSH alias `nc48`, repository `/opt/nono`, application `nono`, database `nono-postgres`, public loopback port `8188`. Preserve remote local environment files. Push only verified changes; record commit, backup identifier, deployment results and deletion verification. The user's explicit data-deletion approval covers live clipping tables, not destruction of pre-upgrade safety backups.

## Acceptance

No clipping navigation, API or extension actions remain. Fresh and upgrade migrations pass. Existing bookmaking, NoDesk, NoMoney, Yumi and NoStar tests/builds remain green. Migration gate cannot be bypassed by retry. Data rollback snapshots follow writer shutdown. Long jobs survive request timeouts and reject overlapping mutations. nc48 serves the new revision with healthy remaining modules and no live clipping tables.
