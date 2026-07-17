# NoMoney 生产迁移手册

本文档用于将独立 MoneyPulse 合并到 Nono 单业务镜像，并在同域名 `/nomoney` 提供服务。PostgreSQL 仍是独立容器；Nono、Nodesk 和 NoMoney 位于同一个业务镜像和容器中。

## 持久化边界

| 数据 | 容器路径 | 默认 Compose 卷 |
| --- | --- | --- |
| Nono PostgreSQL | `/var/lib/postgresql/data` | `nono_nono_pg_data` |
| Nodesk 内容 | `/app/nodesk-content` | `nono_nodesk_content` |
| NoMoney SQLite | `/app/nomoney-data/app.db` | `nono_nomoney_data` |

升级和回滚时不得删除以上三个卷。

## 必需环境变量

```dotenv
SESSION_SECRET=<long-random-value>
ENCRYPTION_KEY=<64-hex-characters>
NOMONEY_JWT_SECRET=<long-random-value>
NOMONEY_COOKIE_SECURE=true
```

从独立 MoneyPulse 迁移时，建议将原 `JWT_SECRET` 的值作为 `NOMONEY_JWT_SECRET`，以保持会话签名兼容。不要在终端输出、提交或记录实际密钥。

## 切换前备份

创建权限为 `700` 的时间戳目录，并至少保存：

1. `pg_dump -Fc` 生成的 Nono PostgreSQL 归档。
2. `nono_nodesk_content` 卷的完整 tar 归档。
3. 使用 SQLite `.backup` 生成的 MoneyPulse `app.db` 一致性快照。
4. Nono 和 MoneyPulse 的 Compose 文件及 `.env`。
5. 所有备份文件的 SHA-256 清单。

验证要求：

```bash
docker exec -i nono-postgres pg_restore --list < nono-postgres.dump
tar -tzf nodesk-content.tar.gz
sqlite3 nomoney-app.db 'PRAGMA integrity_check;'
sha256sum -c SHA256SUMS
```

仅有备份文件不算完成，以上验证必须全部通过。

## NoMoney 数据迁移

迁移脚本会创建 SQLite 一致性快照，比较逻辑哈希，并验证表数量和数据库完整性：

```bash
docker volume create nono_nomoney_data
target=$(docker volume inspect nono_nomoney_data --format '{{.Mountpoint}}')
./scripts/migrate-nomoney-data.sh /root/moneypulse/data/app.db "$target"
```

重复执行且数据一致时会直接跳过。目标存在不同数据时，脚本退出码为 `3` 并拒绝覆盖。确认备份后才可显式替换：

```bash
./scripts/migrate-nomoney-data.sh --replace /root/moneypulse/data/app.db "$target"
```

显式替换会先在目标目录生成 `app.db.pre-migration-时间戳`。

## 临时端口演练

正式切换前，使用独立网络、独立 PostgreSQL 卷、独立 Nodesk 卷和独立 NoMoney 卷启动候选镜像。临时端口只绑定回环地址，例如：

```text
127.0.0.1:18189 -> candidate container:3000
```

至少验收以下路径：

```text
/
/admin
/nodesk
/nomoney
/nomoney/dashboard
/healthz
/nomoney/api/health
```

同时核对：

- Nono 各 PostgreSQL 表数量与生产一致。
- Nodesk 文件数量与归档一致。
- NoMoney 的用户、设置、手机号、VPS、域名、订阅、支出和提醒记录数量一致。
- 登录 Cookie 为 `Path=/nomoney`、`HttpOnly`、`SameSite=Lax`。
- 重启候选容器后 NoMoney 逻辑哈希和记录数量不变。
- 现有生产端口和独立 MoneyPulse 全程保持运行。

## 正式切换

1. 记录当前提交和镜像 ID，并给旧镜像增加回滚标签。
2. 再次执行 PostgreSQL、Nodesk 和 MoneyPulse 最终备份。
3. 停止独立 MoneyPulse，冻结 SQLite 写入。
4. 将最终 `app.db` 迁移到 `nono_nomoney_data`。
5. 更新 `/opt/nono/.env`，加入 NoMoney 密钥和 Cookie 配置。
6. 拉取已验收提交并构建业务镜像。
7. 执行 `docker compose up -d --build app`。
8. 验证全部路径、数据数量、登录、Cookie、日志和卷挂载。
9. 保留独立 MoneyPulse 容器、镜像和数据目录，暂不删除。

现有反向代理如果已经将 `noaul.com` 整体转发到 Nono 的 `8188`，无需新增 `/nomoney` 代理规则；单镜像网关会处理该路径。

## 回滚

出现登录失败、数据数量不一致、路由错误或持久化异常时：

1. 停止新业务容器，不删除任何卷。
2. 恢复切换前的 Compose、`.env` 和旧业务镜像标签。
3. 启动旧 Nono 业务容器并验证 `/`、`/admin`、`/nodesk` 和 `/healthz`。
4. 重新启动独立 MoneyPulse，并验证其原端口和数据。
5. 如果新 NoMoney 已产生写入，单独保留 `nono_nomoney_data`，不得用旧库直接覆盖。

PostgreSQL 和 Nodesk 在本次集成中没有格式迁移，通常不需要恢复数据；只有校验确认它们被意外修改时才使用切换前备份恢复。

## 2026-07-17 nc48 演练结果

- 候选提交：`c0ef4b3`
- 候选端口：`127.0.0.1:18189`
- 生产 Nono 和候选 Nono 表数量一致：`User 1`、`Folder 72`、`Link 381`、`ApiToken 1`、`AppConfig 1`、`Site 1`
- NoMoney 数据一致：`users 1`、`settings 17`、`phones 15`、`domains 9`、`reminder_logs 1`
- Nodesk 归档包含根目录项在内共 `384` 项，候选卷实际内容 `383` 项，数量一致
- Cookie 路径、认证接口、全部公开路径和容器重启持久化验证通过
- 线上 `8188` 和独立 MoneyPulse `18096` 未切换、未停止

## 2026-07-17 nc48 正式切换结果

- 部署提交：`184ea29`
- 最终备份：`/opt/backups/nono-nomoney-cutover-20260717-082227`
- 旧 Nono 镜像标签：`nono-app:pre-nomoney-20260717-082227`
- 生产入口：`https://noaul.com/nomoney`
- 生产容器：`nono`，绑定 `127.0.0.1:8188`
- NoMoney 生产卷：`nono_nomoney_data`
- 独立 `moneypulse-app-1` 已停止但未删除，可用于回滚
- 临时候选容器、卷、网络和镜像标签已清理

正式切换后的内部与公网路径 `/`、`/admin`、`/nodesk`、`/nomoney`、`/nomoney/dashboard`、`/healthz` 和 `/nomoney/api/health` 均返回 `200`。NoMoney Cookie 实测包含 `Path=/nomoney`、`HttpOnly`、`Secure` 和 `SameSite=Lax`。生产 SQLite 的逻辑哈希在容器重启前后保持一致，PostgreSQL、Nodesk 和 NoMoney 数据数量均与切换前备份一致。

第一次切换尝试在生成 SHA-256 清单时因相对路径错误触发失败保护。自动回滚成功恢复旧 Nono 和独立 MoneyPulse，两个服务健康检查均返回 `200`。修正清单生成目录后第二次切换成功，证明本手册中的回滚路径可用。
