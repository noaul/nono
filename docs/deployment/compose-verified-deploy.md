# Compose 验收与回滚部署

生产服务器使用带提交号的不可变镜像标签部署。脚本会记录当前容器镜像，拉取 `main`、构建新镜像、启动应用并验收以下路径：

- `/healthz`
- `/`
- `/nodesk`
- `/nomoney/api/health`
- `/yumi/api/readyz`
- `/yumi/`
- `/nostar/`
- NoStar 默认仓库页、README 和仓库编辑弹窗所需的 JavaScript 分块

## 自动部署

```bash
cd /opt/nono
npm run deploy:compose -- --dir /opt/nono --base-url http://127.0.0.1:8188
```

镜像名默认为 `nono-app:<git-commit>`。新版本验收失败时，脚本会用部署前容器的镜像重新创建 `app`，再次执行验收，并以非零状态退出，便于人工或监控识别失败。该流程直接在生产服务器执行，不依赖 GitHub Actions。

只验收当前版本：

```bash
npm run deploy:accept -- --base-url http://127.0.0.1:8188
```

## 手动回滚

先查看已有提交镜像：

```bash
docker image ls nono-app
```

指定镜像回滚并重新验收：

```bash
npm run deploy:rollback -- --dir /opt/nono --base-url http://127.0.0.1:8188 --image nono-app:<git-commit>
```

回滚只切换应用镜像，不修改 PostgreSQL、NoDesk、NoMoney 或 Yumi 数据卷，也不会改写 Git 历史。
