# 全站备份与恢复

统一备份覆盖以下持久化数据：

- PostgreSQL：Nono、NoStar、用户、Passkey、设备会话和加密配置。
- Nodesk：文章、图片、站点配置与日程内容。
- NoMoney：`app.db` SQLite 数据库。
- Yumi：独立的 `app.db` SQLite 数据库，包括 VPS Status 历史。

备份文件保存在 `nono_backups` Docker 命名卷。每次创建都会生成一个 `.tar.gz` 归档和一个同名 `.json` 清单，记录来源提交、文件大小以及归档和组件的 SHA-256。创建成功前会执行 `pg_restore --list` 与 SQLite `PRAGMA integrity_check`。

## 创建与校验

后台管理员可以在 NoDesk 设置中心的“备份与恢复”中操作当前账户的模块备份。服务器命令用于完整数据库与卷的灾难恢复：

```bash
cd /opt/nono
npm run backup:create -- --dir /opt/nono
npm run backup:list -- --dir /opt/nono
npm run backup:verify -- --dir /opt/nono --id 20260718T140000Z
npm run backup:drill -- --dir /opt/nono --id 20260718T140000Z
```

`backup:drill` 会先完成归档与四个组件的校验，再创建临时 PostgreSQL 数据库并执行完整 `pg_restore`，同时把 NoDesk 内容解压到临时目录，并分别校验 NoMoney、Yumi SQLite。演练不会写入生产数据，结束后会删除临时数据库和目录。

## 自动备份

NoDesk 的 WebDAV/本地导出与恢复通过后台任务执行，接口立即返回 `202`，界面显示任务记录并查询最终结果。网络断开不代表恢复失败；重新连接后先查询原任务，避免重复恢复。任务记录与本地下载文件持久化在备份卷的 `jobs` 子目录，进程重启后未完成任务标记为“中断”，不会自动重做恢复。

同一进程中的备份、恢复、删除和自动保留策略共享互斥保护，冲突请求返回 `409`。历史兼容接口 `POST /api/admin/backups` 仍同步响应，但已受同一互斥保护；浏览器应使用设置中心的新任务接口。

在“后台 → 备份与恢复”中开启自动备份，并设置：

- 频率：每天或每周。
- 执行小时：`0–23`，按容器 `TZ` 计算；未配置时使用 `Asia/Shanghai`。
- 保留天数：超过天数的归档在成功备份后删除。
- 最大份数：超出数量的最旧归档在成功备份后删除。

调度器每分钟检查一次当前计划窗口，窗口标识和执行结果保存在 PostgreSQL，因此应用重启不会重复执行同一窗口。自动或手动创建成功后都会应用保留策略。失败不会反复每分钟重试，而会记录失败状态并进入通知中心；管理员修复原因后可以点击“创建备份”立即重试。

轮询和启动延迟可通过 `BACKUP_AUTOMATION_POLL_SECONDS` 与 `BACKUP_AUTOMATION_START_DELAY_SECONDS` 调整，默认均为 `60` 秒。轮询最小值为 `10` 秒；日常部署无需修改。

下载后的归档应保存到另一台服务器或受控对象存储。仅保留同一服务器上的 Docker 卷无法应对整机磁盘损坏。

## 恢复

恢复需要两次填写相同的备份 ID，防止误操作：

```bash
cd /opt/nono
npm run backup:restore -- \
  --dir /opt/nono \
  --base-url http://127.0.0.1:8188 \
  --id 20260718T140000Z \
  --confirm 20260718T140000Z
```

恢复器按以下顺序执行：

1. 深度校验目标归档、归档路径、四个组件的 SHA-256、PostgreSQL TOC 和两套 SQLite 完整性。
2. 锁定当前不可变应用镜像并停止业务容器，阻止继续写入。
3. 使用临时容器创建并验证停写后的安全快照，保存至 `/app/backups/deployment-safety`，不参与常规保留策略。
4. 恢复 PostgreSQL、清空并恢复 NoDesk、原子替换 NoMoney 与 Yumi 数据库。
5. 在隔离端口启动，使用维护凭证验收；重新绑定正常端口后仍保持维护模式，再次验收后才开放访问。
6. 开放访问前失败时停止应用，恢复步骤 3 的安全快照并再次验收。开放操作结果不确定时不覆盖数据，应先人工确认现场。

部署/恢复时用 `flock` 串行执行（详见 [部署手册](compose-verified-deploy.md)）。恢复剪藏退役前的完整数据库必须同时使用匹配的旧镜像；新版本启动会执行删除剪藏表的迁移。旧安全备份保留，可用于人工恢复。

恢复 PostgreSQL 会同时恢复备份时的账号、Passkey、API Token 和设备会话。恢复完成后应使用备份时有效的账号登录。

当前四组件归档版本为 v2。恢复器仍接受旧 v1 三组件归档；恢复 v1 时只恢复 PostgreSQL、NoDesk 和 NoMoney，不会清空或覆盖当前 Yumi 数据库。升级后的首个生产备份必须使用 v2，并完成一次 `backup:verify` 或 `backup:drill`。

## 跨服务器恢复

将归档和对应的 `.json` 清单复制进新服务器的备份卷：

```bash
docker compose cp nono-backup-20260718T140000Z.tar.gz app:/app/backups/
docker compose cp nono-backup-20260718T140000Z.json app:/app/backups/
npm run backup:verify -- --dir /opt/nono --id 20260718T140000Z
```

然后运行上一节的恢复命令。新服务器必须配置原来的 `ENCRYPTION_KEY`、`NOMONEY_ENCRYPTION_KEY` 和 `YUMI_ENCRYPTION_KEY`，否则各数据库中已加密的集成、WebDAV 和 VPS 凭据无法解密。

## 安全边界

- 全站归档本身未额外加密，包含密码哈希和业务数据，应限制文件访问并使用加密存储传输。
- 归档不包含 `.env`、TLS 证书或反向代理配置；这些文件需要单独加密备份。
- 网页端只提供当前账户的模块备份与恢复任务；完整数据库与数据卷的灾难恢复必须从服务器执行，不通过普通 Web 请求覆盖全站数据。
- 删除 Docker 卷会删除备份。不要使用带 `-v` 的 Compose 清理命令，除非已经确认异地副本可用。
