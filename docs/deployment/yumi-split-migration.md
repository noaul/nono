# Yumi 数据拆分

Yumi 与 NoMoney 共用应用源码，但在生产中是两个独立产品进程：

| 产品 | 入口 | Cookie Path | 数据库 |
| --- | --- | --- | --- |
| NoMoney | `/nomoney` | `/nomoney` | `/app/nomoney-data/app.db` |
| Yumi | `/yumi` | `/yumi` | `/app/yumi-data/app.db` |

NoMoney 只管理电话卡、订阅、账号及相关费用；Yumi 只管理 VPS、域名、续费、相关费用和 Status。两者使用独立 JWT、加密密钥和 WebDAV 备份文件。

## 首次升级

1. 在部署前创建并验证完整的生产备份。
2. 在 `.env` 中加入独立随机的 `YUMI_JWT_SECRET` 和 64 位十六进制 `YUMI_ENCRYPTION_KEY`。
3. 部署新镜像。Yumi 首次启动最多等待 30 秒，直到 NoMoney 数据库可用。
4. Yumi 从 NoMoney 复制用户、设置、VPS、域名和对应的费用、续费、提醒记录，并用 Yumi 密钥重新加密 VPS 与 WebDAV 凭据。
5. 迁移完成后检查 `/yumi/api/readyz`、`/yumi/`、记录数量、VPS 凭据可用性和 Status 探测。
6. 立即创建并验证首份包含 Yumi 的 v2 四组件全站备份。

迁移通过临时数据库、事务、关系计数校验和原子重命名完成。目标数据库带迁移版本标记；容器重启不会重复导入。

## 回滚与最终清理

首版部署不会从 NoMoney 数据库删除旧 VPS、域名和关联记录。NoMoney API 与界面会隐藏这些行，Yumi 是唯一活动数据源；保留旧行是为了允许快速回滚。

不要在首次部署时调用 `finalizeNoMoneySplit()`。完成一段稳定运行、核对 Yumi 数据并验证异地备份后，才可安排单独维护窗口清理 NoMoney 中的旧基础设施行。清理前必须再次备份，且不得在两个产品同时写入旧数据期间执行。

## WebDAV 备份

NoMoney 默认使用 `nomoney-backup.json.enc`，Yumi 默认使用 `yumi-backup.json.enc`。新载荷带 `product` 标记，禁止跨产品恢复；共享的费用、续费和提醒表也只导入当前产品的资产类型。无产品标记的旧备份仍可读取，但无法自动识别来源，恢复前必须人工确认。
