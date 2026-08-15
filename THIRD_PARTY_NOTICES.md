# 第三方依赖声明

本文件记录 Clipper 模块引入的第三方依赖及其许可证。

> 本文件**不**为本仓库指定项目级开源许可证。截至目前 `nono` 仓库仍未附带 `LICENSE` 文件,
> 即默认保留所有权利。是否对外开源、以何种许可证开源，是与本特性无关的独立决策。

## Clipper 直接依赖

| 依赖 | 版本 | 许可证 | 用途 | 使用位置 |
| --- | --- | --- | --- | --- |
| [defuddle](https://github.com/kepano/defuddle) | 0.19.2 | MIT | 提取网页正文并输出 HTML 与 Markdown | 扩展内容脚本(`defuddle/full`)、服务端二次抓取(`defuddle/node`) |
| [DOMPurify](https://github.com/cure53/DOMPurify) | 3.4.13 | MPL-2.0 OR Apache-2.0 | 净化剪藏 HTML | `packages/server/src/services/clip-content.ts` |
| [jsdom](https://github.com/jsdom/jsdom) | 27.4.0 | MIT | 为 DOMPurify 提供服务端 DOM | `packages/server/src/services/clip-content.ts` |
| [esbuild](https://github.com/evanw/esbuild) | 0.28.1 | MIT | 打包 Chrome 扩展的三个执行上下文 | `packages/extension/scripts/build.mjs` |

## 传递依赖说明

`defuddle` 通过 optionalDependencies 引入 [turndown](https://github.com/mixmark-io/turndown)(7.2.4, MIT)
完成 HTML → Markdown 转换,以及 `mathml-to-latex`、`temml`、`linkedom`。核心包 `defuddle` 不含这些依赖,
因此**无法**产出 Markdown;只有 `defuddle/full` 与 `defuddle/node` 可以。

## 关于 DOMPurify 与 jsdom 的搭配

DOMPurify 需要一个具备 `document.implementation` 与 `NodeFilter` 的 DOM 实现。linkedom 两者皆无,
此时 DOMPurify 会进入 unsupported 分支,`sanitize()` **原样返回输入且不抛错** —— 即静默失去净化能力。
因此本项目使用 jsdom,并在 `clip-content.ts` 模块加载时断言 `isSupported`,让这类失效表现为启动失败
而不是静默放行。

## 被明确排除的方案

以下项目在选型阶段被排除,原因记录于此以免重复评估:

| 项目 | 许可证 | 排除原因 |
| --- | --- | --- |
| [SingleFile](https://github.com/gildas-lormeau/SingleFile) | AGPL-3.0 | AGPL 与本仓库当前的保留所有权利状态冲突 |
| [Karakeep](https://github.com/karakeep-app/karakeep) | AGPL-3.0 | 同上;且为完整应用而非可嵌入模块 |
