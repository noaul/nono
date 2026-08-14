# NoDesk Unified Backup Center Implementation Plan

## Goal

Move all user-facing backup controls into NoDesk Settings and split them by destination: WebDAV and Local. WebDAV uses one encrypted credential set and fixed `/nono/...` directories. Every module and full-site batch supports verified restore with safety snapshots and rollback. Local backups are manual downloads with upload-and-restore, without schedules or retention.

## Contracts

- Modules: `nono`, `nodesk`, `nostar`, `nomoney`, `yumi`.
- Fixed WebDAV collections: `/nono/batches/` and `/nono/{module}/`.
- A full-site action creates separate module artifacts linked by one checksummed batch manifest.
- Restore validates kind, version, module, size and SHA-256 before changing data.
- Restore snapshots every affected module first and rolls restored modules back if any step fails.
- Shared WebDAV password is encrypted in `AppConfig.settings`; API responses never return it.
- Existing deployment safety archives and CLI restore behavior remain intact.

## Work

1. Add module adapters for Nono, NoDesk, NoStar, NoMoney and Yumi.
2. Add the WebDAV batch service, fixed-path client, history index, restore coordinator and local bundle format.
3. Add authenticated admin routes for configuration, connection testing, backup, history, download, upload and restore.
4. Add internal NoMoney/Yumi backup endpoints protected by the existing internal token.
5. Rebuild the NoDesk backup center as short tabbed views for WebDAV and Local workflows.
6. Replace the mutually exclusive schedule/task panels with one responsive planner and a project-styled date/time picker.
7. Compact the browser extension popup into a rounded, clipped, single-screen frosted panel and package a new version.
8. Run focused tests, full checks, builds and responsive visual QA; then commit, push and deploy to `nc48`.
