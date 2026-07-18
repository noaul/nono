# 操作审计日志

Nono 对已认证的 `POST`、`PUT`、`PATCH` 和 `DELETE` 请求统一记录操作审计。未认证请求不会产生操作者日志，普通用户可以产生记录但不能读取日志；只有管理员可以访问后台“审计日志”和对应 API。

每条记录包含：

- 操作者 ID、用户名和操作时角色
- 操作类型、资源类型、资源 ID 和可读名称
- 成功或失败、HTTP 状态码和失败原因
- 可信代理处理后的来源 IP、User-Agent 和时间
- 核心资源的修改前、修改后快照，或批量操作摘要

密码、密码提示、哈希、Cookie、认证头、Token、API Key、私钥和加密密钥字段会递归删除。超过 500 个字符的正文只记录长度占位符，详情总量也受到限制。API Token 创建日志不会保存生成后的 Token 明文。

## 保留策略

默认保留 180 天，可在后台页头设置 7–3650 天。保存策略后立即清理过期记录，之后审计服务每天最多触发一次保留清理。删除用户时保留其历史日志与用户名快照，仅将关联用户 ID 置空。

## API

```text
GET /api/admin/audit
GET /api/admin/audit/settings
PUT /api/admin/audit/settings
```

列表接口支持 `page`、`pageSize`、`actor`、`action`、`resourceType`、`result`、`search`、`from` 和 `to`。`from`、`to` 使用 ISO 8601 时间。

审计表存储在 PostgreSQL，因此已包含在全站 PostgreSQL 备份和隔离恢复演练中，无需单独归档。
