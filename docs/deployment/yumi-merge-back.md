# Yumi 合并回 NoMoney

Yumi 已下线。域名回到 NoMoney（`/nomoney/domains`）管理，RDAP 注册局到期同步和 TLS 证书检查也随之迁回 NoMoney。VPS 管理与 Status 监控不再提供。

| 内容 | 处理方式 |
| --- | --- |
| 域名及其费用、续费记录、提醒记录 | NoMoney 首次启动时从旧 Yumi 数据库导入 |
| VPS、VPS 费用与续费、Status 采样与告警 | 不导入；NoMoney 启动时删除自身数据库里拆分前留下的旧 VPS 行和 Status 表 |
| 旧 Yumi 数据库 `/app/yumi-data/app.db` | 原样保留，只读，作为存档 |
| `/yumi/...` 旧链接 | 网关 308 重定向：`/yumi/domains...` → `/nomoney/domains...`，其余 → `/nomoney/` |

## 升级步骤

1. 部署前创建并验证一份完整的生产备份（`backup:verify` 或 `backup:drill`）。这份备份仍包含 Yumi 数据库，是回到合并前状态的依据。
2. 部署新镜像。`yumi_data` 卷必须继续挂载在 `/app/yumi-data`（Compose 已保留），NoMoney 通过 `LEGACY_YUMI_DATA_DIR` 读取它。`YUMI_ENCRYPTION_KEY` 不再需要，可从 `.env` 删除；域名没有加密字段，合并不需要它。
3. NoMoney 启动日志出现 `Merged domains from Yumi: {...}`，其中列出导入的域名、费用、续费和提醒条数。
4. 检查 `/nomoney/domains` 的域名数量、到期日和续费历史，确认 `/yumi/` 会跳转到 `/nomoney/`。
5. 创建并验证一份新的全站备份。新归档为 v3，只含 PostgreSQL、NoDesk、NoMoney 三个组件。

## 合并规则

- 合并在 NoMoney 数据库的一个事务里完成，并在同一事务写入 `yumiMergeVersion` 标记，因此只执行一次；失败会整体回滚，NoMoney 不会启动，旧数据不受影响。
- NoMoney 里拆分时留下的旧域名副本会先被删除，再写入 Yumi 中的域名（包括回收站里的）。域名保留原 ID。
- 费用、续费、提醒记录与 NoMoney 自己的记录 ID 有重叠，因此会重新编号；续费记录关联的费用 ID 随之更新。
- 合并后会校验数量，并检查是否有指向不存在域名的费用。
- 只有 `productMode` 为 `yumi` 的数据库才会被导入；找不到 Yumi 数据库时 NoMoney 保持现有域名不变。

## 备份与恢复

- NoMoney 产品备份（WebDAV、下载文件、NoDesk 备份中心）现在包含域名，版本为 3。
- 恢复合并前的 NoMoney 备份（不含 `domains`）时，只替换备份里有的资产类型，当前域名和它们的费用、续费记录保持不变。旧备份里的 VPS 行会被忽略。Yumi 产品备份不能恢复到 NoMoney。
- 恢复备份不会清除 `yumiMergeVersion` 标记，所以不会触发第二次合并。
- 全站恢复 v2 归档时仍会把其中的 Yumi 数据库写回 `/app/yumi-data`。归档里的 NoMoney 数据库是合并前的版本，没有标记，重启后会重新从这份 Yumi 数据库合并域名，得到与当时一致的状态。

## 以后清理

稳定运行并确认至少一份 v3 异地备份可用后，可在后续版本中移除 `yumi_data` 卷挂载、`LEGACY_YUMI_DATA_DIR` 和合并代码。移除卷之前先单独备份 `/app/yumi-data/app.db`；里面仍有已下线的 VPS 数据。
