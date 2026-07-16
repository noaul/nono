<script setup lang="ts">
const updatedAt = '2026-07-16';
</script>

<template>
  <main class="privacy-page">
    <article class="privacy-content">
      <header class="privacy-header">
        <a class="privacy-brand" href="/" aria-label="返回 NONO 首页">NONO</a>
        <p class="privacy-kicker">Nono Smart Bookmark</p>
        <h1>隐私政策</h1>
        <p class="privacy-updated">最后更新：{{ updatedAt }}</p>
      </header>

      <section>
        <h2>适用范围</h2>
        <p>本政策适用于 Nono Smart Bookmark Chrome 扩展程序。该扩展用于将用户主动选择的当前网页保存到用户自行配置的 Nono 服务。</p>
      </section>

      <section>
        <h2>我们处理的数据</h2>
        <p>当用户点击扩展、使用快捷键或在网页右键菜单中发起收藏时，扩展会处理当前网页的 URL、标题、网站域名、meta 描述、Open Graph 元数据，以及最多 500 个字符的页面文本。此类信息属于网络记录和网站内容。</p>
        <p>扩展还会仅在本机 Chrome 扩展存储中保存用户配置的 Nono 服务地址、API Token 和最近一次使用的文件夹，以便维持连接和快速收藏功能。</p>
      </section>

      <section>
        <h2>数据用途与传输</h2>
        <p>网页信息仅用于创建书签、预填名称与描述、检查重复链接，以及在用户主动点击“AI 整理”时建议名称、描述和保存位置。</p>
        <p>扩展仅将收藏所需信息发送至用户自行配置的 Nono 服务。用户选择“AI 整理”时，相关网页信息可能由该 Nono 服务转发给用户在 Nono 后台配置的大模型服务商。扩展不会将数据发送至广告平台、分析服务或其他未配置的第三方。</p>
      </section>

      <section>
        <h2>数据保留与控制</h2>
        <p>书签及其内容由用户配置的 Nono 服务保存，保留期限由该服务的管理员控制。用户可以在 Nono 后台删除书签、撤销 API Token，或在 Chrome 中清除扩展数据以移除本机保存的连接配置。</p>
      </section>

      <section>
        <h2>我们不做的事</h2>
        <ul>
          <li>不会出售、出租或用于广告定向的用户数据。</li>
          <li>不会持续收集用户的浏览历史；只有在用户主动发起收藏时才读取当前网页信息。</li>
          <li>不会下载或执行远程代码；扩展所用 JavaScript 均包含在已发布的扩展包中。</li>
        </ul>
      </section>

      <section>
        <h2>政策更新</h2>
        <p>当扩展的数据处理方式发生实质变化时，本页面会同步更新。继续使用扩展即表示用户理解本政策所述的数据处理方式。</p>
      </section>
    </article>
  </main>
</template>

<style scoped>
.privacy-page {
  background: #f4f7ff;
  color: #1d2945;
  min-height: 100vh;
  padding: 56px 24px 80px;
}

.privacy-content {
  background: rgba(255, 255, 255, 0.86);
  border: 1px solid #dbe3f6;
  border-radius: 8px;
  box-shadow: 0 18px 48px rgba(49, 69, 124, 0.11);
  margin: 0 auto;
  max-width: 820px;
  overflow: hidden;
}

.privacy-header,
.privacy-content section {
  padding: 28px 34px;
}

.privacy-header {
  background: rgba(241, 245, 255, 0.76);
  border-bottom: 1px solid #dbe3f6;
}

.privacy-brand {
  color: #4f5ed9;
  font-size: 16px;
  font-weight: 800;
}

.privacy-kicker,
.privacy-updated {
  color: #6e7d9c;
  font-size: 13px;
  margin: 14px 0 0;
}

h1,
h2,
p,
ul {
  margin: 0;
}

h1 {
  font-size: 32px;
  line-height: 1.2;
  margin-top: 8px;
}

.privacy-content section + section {
  border-top: 1px solid #e7ecf7;
}

h2 {
  font-size: 18px;
  line-height: 1.35;
}

p,
li {
  color: #52617e;
  font-size: 15px;
  line-height: 1.8;
}

h2 + p,
p + p,
ul {
  margin-top: 12px;
}

ul {
  padding-left: 22px;
}

li + li {
  margin-top: 6px;
}

@media (max-width: 640px) {
  .privacy-page {
    padding: 24px 14px 48px;
  }

  .privacy-header,
  .privacy-content section {
    padding: 24px 20px;
  }

  h1 {
    font-size: 27px;
  }
}
</style>
