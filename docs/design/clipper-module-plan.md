# Clipper 模块设计契约

> 状态:已定稿(实施契约) · 目标:新增与 NoStar / NoMoney / Yumi 平级的 **Clipper(剪藏)** 模块,并把剪藏能力并入现有 Chrome 扩展。
>
> 本文是实现的**契约**,不是构想稿。`tests/clipper-plan-contract.test.mjs` 会校验其中易错的决策项。修改本文前先看那个测试。

## 1. 架构定位

仓库现有三种模块形态,Clipper 采用 **NoStar 形态(A)**:

| 形态 | 代表 | 进程 | 认证 | 存储 |
| --- | --- | --- | --- | --- |
| **A. Nono 内嵌** | NoStar | 无独立进程,Nono 托管静态资源 + 同源 API | 复用 Nono Session / API Token | PostgreSQL |
| B. 独立后端 | NoMoney、Yumi | 独立 Express 子进程,网关分发 | 独立 JWT Cookie | 独立 SQLite |
| C. 内容站 | NoDesk | 独立 Next.js 子进程 | Nono 管理员 Session | 文件卷 |

**选择 A 的理由:**

1. 扩展已经用 `Authorization: Bearer` 认证 Nono。若走形态 B,扩展需要第二套凭据,这是产品体验和安全面上的净损失。
2. 剪藏与书签强相关,同库才能建外键、走同一事务。
3. 不新增进程 = 不占网关端口、不加子进程存活检查、**不改 `docker/gateway.mjs`**。
4. 通过 Prisma adapter 纳入统一备份,与 `createNoStarAdapter` 同构。

**落位:**

- 前端:`apps/clipper/`(React + Vite,`base: '/clipper/'`)
- 后端:`packages/server/src/routes/clipper/`,挂载在 `/api/clipper/*`
- 存储:PostgreSQL(`Clip*` 系列模型)
- 入口:`/clipper/`,由 `packages/server/src/app.ts` 的 SPA fallback 提供

浏览器侧只负责**提取**;校验、规范化、净化、租户检查、持久化、二次抓取安全与备份语义全部由服务端拥有。

## 2. 提取契约(Defuddle)

### 2.1 版本与入口

依赖 `defuddle@^0.19.2`(MIT)。三个入口的能力**不同**,选错会静默失效:

| 入口 | 体积 | 能否产出 Markdown | 用途 |
| --- | --- | --- | --- |
| `defuddle` | ~324 KB | **否** | 仅需 HTML 时 |
| `defuddle/full` | ~750 KB | **是** | **扩展内容脚本使用** |
| `defuddle/node` | — | 是 | 服务端二次抓取使用 |

核心包**不包含** Turndown,`contentMarkdown` 恒为 `undefined`。因此扩展内容脚本必须从 `defuddle/full` 导入,服务端从 `defuddle/node` 导入。

### 2.2 调用契约

```js
const result = new Defuddle(doc, {
  separateMarkdown: true,
  useAsync: false,
}).parse();

return {
  title: result.title,
  siteName: result.site,
  contentHtml: result.content,
  contentMd: result.contentMarkdown || '',
};
```

三个易错点:

- **`separateMarkdown: true` 必须显式传入**,默认为 `false`。Defuddle 响应体上并不存在名为 `markdown` 的字段;Markdown 只出现在 `result.contentMarkdown`。
- **`useAsync: false` 必须显式传入**,默认为 `true`。默认值允许 Defuddle 在本地 HTML 提取失败时调用第三方 API(YouTube 字幕、Reddit 评论等)。剪藏不得发起用户未要求的网络请求。
- 站点名取 `result.site`,不是 `result.siteName`。

### 2.3 URL 规范化

`extractCanonicalUrl()` 将主机名小写、移除默认端口与 fragment、排序查询参数,并且**只**移除以下追踪参数:`utm_source`、`utm_medium`、`utm_campaign`、`utm_term`、`utm_content`、`gclid`、`fbclid`、`mc_cid`、`mc_eid`。

原始 `url` 始终保留用于溯源。去重键是 `(userId, canonicalUrl)`;页面无 canonical 时,以规范化后的提交 URL 充当 `canonicalUrl`。

## 3. 扩展构建契约

`packages/extension/scripts/build.mjs` 目前是纯文件拷贝,没有打包器。引入 esbuild 后,**三个执行上下文的输出格式不同**:

```js
await build({ entryPoints: ['content.js'],      outfile: 'dist/content.js',      bundle: true, format: 'iife', target: 'chrome110' });
await build({ entryPoints: ['background.js'],   outfile: 'dist/background.js',   bundle: true, format: 'esm',  target: 'chrome110' });
await build({ entryPoints: ['popup/popup.js'],  outfile: 'dist/popup/popup.js',  bundle: true, format: 'esm',  target: 'chrome110' });
```

注入型内容脚本**必须**是 `format: 'iife'`。Chrome 无法以 ES 模块的形式注入内容脚本;若产出带顶层 `import` / `export` 的产物,脚本会在页面里直接失效。后台 Service Worker 与 popup 则声明为模块,保持 `format: 'esm'`。

打包后不再拷贝源码 `shared/` 目录进产物,并要求连续两次打包的 ZIP 字节完全一致。

## 4. 数据模型

```prisma
model Clip {
  id               Int       @id @default(autoincrement())
  userId           Int
  user             User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  linkId           Int?      @unique
  link             Link?     @relation(fields: [linkId], references: [id], onDelete: SetNull)

  url              String
  canonicalUrl     String
  title            String
  author           String?
  siteName         String?
  domain           String
  description      String?
  excerpt          String
  contentHtml      String
  contentMd        String
  contentVersion   Int       @default(1)
  contentHash      String
  contentTruncated Boolean   @default(false)
  wordCount        Int       @default(0)
  lang             String?
  favicon          String?
  image            String?
  publishedAt      DateTime?

  status           String    @default("unread")
  starred          Boolean   @default(false)
  extractor        String
  sourceMeta       Json?
  clippedAt        DateTime  @default(now())
  updatedAt        DateTime  @updatedAt

  tags             ClipTagOnClip[]
  highlights       ClipHighlight[]

  @@unique([userId, canonicalUrl])
  @@index([userId, clippedAt])
  @@index([userId, status, clippedAt])
}
```

配套 `ClipTag`、`ClipTagOnClip`、`ClipHighlight`。要点:

- `ClipTagOnClip` 额外冗余 `userId`,以便直接做租户过滤,不必每次 join 回 `Clip`。
- `ClipTag` 同时保存展示用 `name` 与小写 NFKC 规范化的 `normalizedName`,唯一键是 `(userId, normalizedName)`。
- 状态字段用字符串,在 API 边界由 Zod 校验,不用数据库枚举。

### 4.1 检索存储

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE "Clip"
ADD COLUMN "searchText" TEXT
GENERATED ALWAYS AS (
  coalesce("title", '') || E'\n' || coalesce("contentMd", '')
) STORED;

CREATE INDEX "Clip_search_trgm_idx"
ON "Clip" USING GIN ("searchText" gin_trgm_ops);
```

迁移中所有驼峰列名必须加双引号,否则 PostgreSQL 会折叠为小写。

**已知代价与限制:**

- STORED 生成列会复制一份 `contentMd`,叠加 GIN 索引后单条剪藏约占 3 倍存储。
- 少于 3 个字符的查询无法命中三元组索引,会退化为全表扫描。两字中文查询正是常见情形。
- PostgreSQL 内置无中文分词器,首版不引入 zhparser(需要改 PostgreSQL 镜像,代价不成比例)。分词策略隔离在 `clip-search.ts` 内,后续可替换。

## 5. 服务端契约

### 5.1 体积上限

```ts
export const MAX_CLIP_CONTENT_BYTES = 2 * 1024 * 1024;      // 2 MiB,contentHtml 与 contentMd 各自
export const MAX_CLIP_SOURCE_META_BYTES = 256 * 1024;       // 256 KiB
export const CLIP_INGEST_BODY_LIMIT = 6 * 1024 * 1024;      // 6 MiB,POST 路由 bodyLimit
```

扩展在上传前按 UTF-8 边界截断 HTML 与 Markdown 至 2 MiB,并置 `contentTruncated: true`。服务端**不信任该标志**:任何仍超限的字段一律拒绝。整体请求体上限 6 MiB 在路由级配置。

### 5.2 净化

剪藏 HTML 是不可信输入。服务端用 DOMPurify + linkedom 净化后入库。

允许标签:`article` `section` `div` `p` `br` `hr` `h1`-`h6` `blockquote` `pre` `code` `strong` `em` `del` `mark` `ul` `ol` `li` `table` `thead` `tbody` `tr` `th` `td` `a` `img` `figure` `figcaption` `sup` `sub`。

允许属性:`href` `src` `alt` `title` `width` `height` `colspan` `rowspan`。

拒绝:样式、脚本、表单、`iframe`、`object`、所有事件属性,以及除 `http:` `https:` `mailto:` 和纯 fragment 之外的全部协议。

### 5.3 租户隔离

每一条查询与变更都必须带上已认证用户条件。书签归属通过 `link.findFirst({ where: { id: linkId, folder: { userId } } })` 在同一事务内校验 —— `Link` 上没有 `userId`,归属只能经 `folder` 推导。跨用户访问返回 404,不返回 403(不泄露资源存在性)。

### 5.4 二次抓取

必须走既有 `services.safeRequester`,参数 `maxBytes: 4 * 1024 * 1024`、`maxRedirects: 3`、`timeoutMs: 10_000`。私网主机放行仅对管理员生效。路由级限流 10 次 / 10 分钟。抓取结果同样经 §5.2 净化,内容变化时 `contentVersion` 递增。

不得为此新开一条 fetch 路径,否则等于绕过既有 SSRF 防护。

### 5.5 检索查询

```sql
SELECT "id", "title", "excerpt", "domain", "status", "starred", "clippedAt"
FROM "Clip"
WHERE "userId" = $1
  AND "searchText" ILIKE ('%' || $2 || '%') ESCAPE '\'
ORDER BY "clippedAt" DESC
LIMIT $3 OFFSET $4;
```

必须转义 `\`、`%`、`_` 三个 LIKE 元字符;查询串上限 200 字符,单页上限 100 行;`"userId"` 条件不可省略。结果不含正文。

## 6. 令牌作用域

新增 `clips:read` 与 `clips:write`,加入 `API_TOKEN_SCOPES` 与 `DEFAULT_API_TOKEN_SCOPES`。`requiredApiTokenScope()` 中 `/api/clipper/*` 的 GET 需要 `clips:read`,其余方法需要 `clips:write`。

**不得给已存储的令牌静默授予新作用域。** 新建令牌带剪藏作用域;存量令牌通过 `PATCH /api/admin/tokens/:id` 显式补齐,该端点**只接受浏览器 Session**,拒绝 Bearer 调用者。修改作用域不重新签发凭据,令牌材料(token material)保持不变,用户无需在扩展里重新填写。

## 7. 标注锚点

标注不能只存文本偏移 —— 正文一旦二次抓取更新,偏移即失效并会锚定到错误位置。

存储:精确引文 `quote`、前文 `prefix`、后文 `suffix`、文本偏移量,以及当时的 `contentVersion`。

解析顺序:先按精确引文匹配,再按 prefix/suffix 上下文匹配。两者都失败时,该标注呈现为 **stale(过期标注)**并提示用户,**绝不**退化到按偏移强行附着。

## 8. 阅读器渲染

正文通过 `srcdoc` 沙箱 iframe 渲染,sandbox 属性为 `allow-same-origin allow-popups`,**不授予 `allow-scripts`**。样式由父页面注入,外链一律 `target="_blank" rel="noopener noreferrer"`。阅读设置(字号、宽度、主题)只存本地,不改动已存正文。

这是净化之后的第二道防线,两者都要有。

## 9. 备份语义

备份模块 id 为 `clipper`,排在 `BACKUP_MODULES` 中 `nono` 之后(恢复顺序依赖:书签必须先于剪藏恢复)。备份种类 `nono.clipper-backup`,版本 1,导出正文与标签、标注数据。

书签关联**不得**序列化原始 `linkId`。Nono 恢复时会重建书签并分配全新自增 ID,旧 ID 会指向错误记录或不存在的行。改用稳定引用:

```ts
type ClipBookmarkRef = {
  normalizedUrl: string;
  folderPath: string[];
};
```

恢复时先校验整个归档再改数据,随后在事务内删除该用户现有 Clipper 行、重建标签、剪藏、关联与标注。书签引用**仅在恰好匹配到一条该用户名下的链接时**才附着;匹配不到或匹配到多条时,剪藏保持 detached(游离)状态,而不是错误关联。

## 10. 首版范围

**包含:**整页与选区剪藏、阅读器、三元组检索、标签、标注、回收站、备份恢复、Docker 与部署验收。

**明确不包含(Deferred):**

- 公开分享单篇剪藏
- 图片下载与本地化、资源卷
- AI 摘要与自动打标
- 转换为 NoDesk 文章
- 语言相关的 PostgreSQL 分词器
- 同一书签关联多条剪藏
- 排除正文的精简备份产物
- 仓库级开源许可证决策

第三方依赖(Defuddle、DOMPurify、linkedom、esbuild)的许可证记入 `THIRD_PARTY_NOTICES.md`。本特性**不**顺带给仓库指定项目级许可证。
