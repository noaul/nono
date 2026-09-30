# PostgreSQL 16 → 18 升级

从 PostgreSQL 16 升级到 18 时，数据库换到新的数据卷，旧卷原样保留。在 `/opt/nono` 执行，保留服务器本地 `.env`，生产入口为回环地址 `http://127.0.0.1:8188`。迁移期间整站停机，时长主要取决于数据库导出和导入的耗时。

## 为什么不能直接部署

PostgreSQL 18 镜像不能读取 16 的数据目录，数据目录也改到了 `/var/lib/postgresql/18/docker`。Compose 因此改用新卷 `nono_pg18_data`，挂载到 `/var/lib/postgresql`。如果直接执行 `deploy:compose`，新数据库会是空库，应用会在空库上建表，验收也能通过，最后带着空数据库开放访问。所以部署脚本检测到运行中的数据库大版本和 Compose 配置不一致时会拒绝执行，必须改用本文的迁移脚本。

应用镜像同时改用 `postgresql18-client`。`pg_dump` 不能导出比自己版本新的服务端，所以迁移后不要回滚到仍带 16 客户端的旧镜像长期运行，否则备份会失败。

## 前置条件

- Docker Compose 2.24 或更高版本（回退用的 override 文件需要 `!override` 语法）。
- 宿主机 Node.js 22+ 和 `flock`。
- 备份卷至少有两份完整数据库导出的剩余空间；Docker 数据目录还要能再放一份数据库。
- 建议先把最近一次整站备份复制到异机。

## 执行迁移

```bash
cd /opt/nono
git pull --ff-only origin main
flock -n /var/lock/nono-deploy.lock npm run deploy:postgres-18 -- \
  --dir /opt/nono --base-url http://127.0.0.1:8188 --confirm postgres-18
```

待执行迁移中有破坏性 SQL 时，与 `deploy:compose` 一样会被拦截；审核后再加 `--allow-destructive-migrations`。

脚本先检查：Compose 已配置 PostgreSQL 18、运行中的是 PostgreSQL 16、`nono_pg18_data` 卷还不存在、能确定当前应用镜像、回退配置可以解析。任一项不满足就直接退出，不停止任何服务。检查通过后：

1. 构建新应用镜像，旧版本继续服务。
2. 停止 `app`，用旧镜像连接 PostgreSQL 16，创建并验证完整安全快照，保存在 `/app/backups/deployment-safety`。记录输出中的快照 ID。
3. 写入维护文件，停止并删除 PostgreSQL 16 容器。旧卷 `nono_pg_data` 不会被删除，快照之后也不再写入。
4. 在新卷上启动 PostgreSQL 18，等它通过健康检查后，用新镜像把快照恢复进去，包括 NoDesk、NoMoney、Yumi 数据卷。
5. 在备用回环端口和正常端口依次做维护模式验收，然后删除维护文件、开放访问。流程和 [Compose 部署手册](compose-verified-deploy.md) 相同。

## 自动回退

开放访问前任一步失败，脚本会自动回退：停止新应用；如果已经切换数据库，就删除 PostgreSQL 18 容器，通过 `docker/postgres16-rollback.compose.yml` 重新挂载旧卷，启动 PostgreSQL 16；用旧镜像恢复安全快照中的应用数据卷，最后先在备用端口验收旧版本，再绑定正常端口。

回退后 `nono_pg18_data` 卷会保留，供排查问题。确认不需要后删除它（Compose 项目名为 `nono` 时）：

```bash
docker volume rm nono_nono_pg18_data
```

删除后才能再次执行迁移。删除维护文件的步骤一旦开始，就视为可能已经开放写入；这时出错只报告，不会自动回退数据。

## 迁移后

PostgreSQL 16 的卷 `nono_nono_pg_data` 继续保留，Compose 不再声明它，所以 `docker compose down -v` 也删不到它。观察一段时间、确认新数据库的备份和恢复演练（`npm run backup:drill`）都正常后，再手动删除：

```bash
docker volume rm nono_nono_pg_data
```

开放访问后如果必须退回 PostgreSQL 16，迁移之后写入的数据会全部丢失。步骤如下，全程持有部署锁：

```bash
flock /var/lock/nono-deploy.lock sh -c '
  docker compose stop app &&
  docker compose stop postgres && docker compose rm -f postgres &&
  export COMPOSE_FILE=docker-compose.yml:docker/postgres16-rollback.compose.yml &&
  docker compose up -d --wait postgres &&
  NONO_APP_IMAGE=nono-app:rollback-<旧镜像 ID 前缀> docker compose run --rm --no-deps -T \
    --env BACKUP_DIR=/app/backups/deployment-safety --entrypoint node app \
    /app/nono/packages/server/dist/cli/backup.js restore --id <快照 ID> &&
  NONO_APP_IMAGE=nono-app:rollback-<旧镜像 ID 前缀> docker compose up -d --no-deps app
'
```

退回后，后续所有 `docker compose` 命令都要带同样的 `COMPOSE_FILE`，而 `deploy:compose` 会继续拒绝执行，直到重新完成迁移。

## 本地开发

本地的 `docker compose up -d postgres` 会创建一个空的 PostgreSQL 18 卷。重新执行 `node --env-file=.env node_modules/prisma/build/index.js migrate dev --config packages/server/prisma.config.ts` 即可。旧的本地卷不会被自动删除。
