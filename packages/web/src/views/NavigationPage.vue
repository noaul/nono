<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { Bookmark, X } from 'lucide-vue-next';
import FolderCard from '@/components/FolderCard.vue';
import SearchBar from '@/components/SearchBar.vue';
import { apiRequest, buildSearchUrl, jsonBody } from '@/api/client';
import type { Folder, Link } from '@/api/types';
import { useNavigationStore } from '@/stores/navigation';

const route = useRoute();
const navigation = useNavigationStore();
const query = ref('');
const password = ref('');
const verifying = ref<Folder | null>(null);
const expandedFolder = ref<Folder | null>(null);
const error = ref('');

const username = computed(() => String(route.params.username || 'admin'));
const payload = computed(() => navigation.payload);
const allLinks = computed(() => payload.value?.folders.flatMap((folder) => folder.links || []) || []);
const shownFolders = computed(() => {
  const q = query.value.trim().toLowerCase();
  if (!payload.value || !q) return payload.value?.folders || [];
  return payload.value.folders.map((folder) => ({
    ...folder,
    links: (folder.links || []).filter((link) => `${link.name} ${link.description || ''} ${link.url}`.toLowerCase().includes(q)),
  }));
});
const foldersWithLinks = computed(() => shownFolders.value.filter((folder) => folder.locked || (folder.links?.length || 0) > 0 || !query.value.trim()));

async function load() {
  await navigation.load(username.value);
}

function submitSearch() {
  const q = query.value.trim();
  if (!q) return;
  const hasLocalMatch = allLinks.value.some((link: Link) => `${link.name} ${link.description || ''} ${link.url}`.toLowerCase().includes(q.toLowerCase()));
  if (!hasLocalMatch || payload.value?.site.localSearchFirst === false) {
    window.location.href = buildSearchUrl(q, payload.value?.site.searchUrlTemplate);
  }
}

async function verifyFolder() {
  if (!verifying.value) return;
  error.value = '';
  try {
    const result = await apiRequest<{ verified: boolean; links: Link[] }>(`/api/navigation/${username.value}/folder/${verifying.value.id}/verify`, {
      method: 'POST',
      body: jsonBody({ password: password.value }),
    });
    if (!result.verified) {
      error.value = '密码不正确';
      return;
    }
    verifying.value.links = result.links;
    verifying.value.locked = false;
    verifying.value = null;
    password.value = '';
  } catch (event) {
    error.value = event instanceof Error ? event.message : '验证失败';
  }
}

onMounted(load);
watch(username, load);
</script>

<template>
  <main
    class="nav-page"
    :style="{
      backgroundImage: payload?.site.backgroundImage ? `linear-gradient(rgba(0,0,0,.38), rgba(0,0,0,.66)), url(${payload.site.backgroundImage})` : undefined,
      backgroundColor: payload?.site.backgroundColor || '#111318',
      color: payload?.site.fontColor || '#fff',
    }"
  >
    <div class="nav-content">
      <header class="nav-header">
        <div>
          <h1>{{ payload?.site.name || 'Nono' }}</h1>
          <p>{{ payload?.site.description || '一个可自托管的网址导航主页' }}</p>
        </div>
        <RouterLink class="button secondary" to="/admin">后台</RouterLink>
      </header>
      <SearchBar v-model="query" @submit="submitSearch" />
      <div class="trace-link">我的足迹 ^</div>
      <nav class="folder-tabs" aria-label="文件夹">
        <a v-for="folder in payload?.folders || []" :key="folder.id" :href="`#folder-${folder.id}`">{{ folder.name }}</a>
      </nav>
      <div class="adaptive-folder-grid">
        <FolderCard v-for="folder in foldersWithLinks" :key="folder.id" :folder="folder" @verify="verifying = $event" @expand="expandedFolder = $event" />
      </div>
    </div>

    <div v-if="expandedFolder" class="folder-expand-backdrop" @click.self="expandedFolder = null">
      <section class="folder-expand-modal" role="dialog" aria-modal="true" :aria-label="expandedFolder.name">
        <header class="folder-expand-head">
          <h2>{{ expandedFolder.name }}</h2>
          <button class="folder-expand-close" type="button" title="关闭" @click="expandedFolder = null">
            <X :size="22" />
          </button>
        </header>
        <div class="expanded-link-grid">
          <a v-for="link in expandedFolder.links || []" :key="link.id" class="expanded-link" :href="link.url" target="_blank" rel="noreferrer">
            <span class="expanded-link-icon"><Bookmark :size="24" /></span>
            <span class="expanded-link-copy">
              <strong>{{ link.name }}</strong>
              <small v-if="link.description">{{ link.description }}</small>
            </span>
          </a>
          <p v-if="!(expandedFolder.links || []).length" class="expanded-empty">这个文件夹还没有可展示的书签。</p>
        </div>
      </section>
    </div>

    <div v-if="verifying" class="modal-backdrop">
      <form class="modal" @submit.prevent="verifyFolder">
        <h2>{{ verifying.name }}</h2>
        <p v-if="verifying.passwordHint">{{ verifying.passwordHint }}</p>
        <p v-if="error" class="error">{{ error }}</p>
        <div class="field">
          <label>文件夹密码</label>
          <input v-model="password" type="password" autofocus />
        </div>
        <div class="toolbar">
          <button class="button" type="submit">确认</button>
          <button class="button secondary" type="button" @click="verifying = null">取消</button>
        </div>
      </form>
    </div>
  </main>
</template>

<style scoped>
.nav-page {
  background-position: center;
  background-size: cover;
  min-height: 100vh;
  padding: 32px 0 64px;
}

.nav-content {
  --folder-card-width: 445px;
  display: grid;
  gap: 24px;
  margin: 0 auto;
  max-width: 2048px;
  padding: 0 40px;
}

.nav-header {
  display: grid;
  justify-items: center;
  gap: 14px;
  min-height: 180px;
  text-align: center;
}

h1 {
  font-size: clamp(38px, 6vw, 64px);
  line-height: 1;
  margin: 0;
  font-weight: 800;
  letter-spacing: -0.03em;
  color: #fff;
  text-shadow: 0 4px 12px rgba(0,0,0,0.3);
}

.nav-header p {
  color: rgba(255, 255, 255, 0.75);
  font-size: 16px;
  margin: 12px 0 0;
  max-width: 640px;
  font-weight: 500;
  text-shadow: 0 2px 4px rgba(0,0,0,0.2);
}

.trace-link {
  color: rgba(255, 255, 255, 0.6);
  font-size: 14px;
  font-weight: 600;
  justify-self: end;
  margin: 8px 6% 0 0;
  background: rgba(255, 255, 255, 0.05);
  padding: 6px 14px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  cursor: pointer;
  transition: all 0.2s ease;
}

.trace-link:hover {
  color: #fff;
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.15);
}

.folder-tabs {
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  background: rgba(20, 24, 33, 0.45);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 999px;
  display: flex;
  gap: 6px;
  justify-content: center;
  margin: 10px auto;
  max-width: fit-content;
  overflow-x: auto;
  padding: 6px 12px;
  box-shadow: 0 4px 20px rgba(0,0,0,0.15);
}

.folder-tabs a {
  border-radius: 999px;
  flex: 0 0 auto;
  padding: 6px 16px;
  font-size: 14px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.7);
  transition: all 0.2s ease;
}

.folder-tabs a:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
}

.adaptive-folder-grid {
  align-items: stretch;
  display: grid;
  gap: 38px 32px;
  grid-template-columns: repeat(auto-fit, var(--folder-card-width));
  justify-content: center;
}

.folder-expand-backdrop {
  align-items: start;
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  background: rgba(10, 12, 16, 0.6);
  display: grid;
  inset: 0;
  padding: 82px 36px 36px;
  position: fixed;
  z-index: 40;
  animation: fadeIn 0.2s ease-out;
}

.folder-expand-modal {
  background: rgba(20, 25, 35, 0.92);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  box-shadow: 0 28px 100px rgba(0, 0, 0, 0.55), 0 0 40px rgba(255,255,255,0.02);
  color: #f8fafc;
  display: grid;
  gap: 24px;
  margin: 0 auto;
  min-height: min(70vh, 730px);
  overflow: hidden;
  padding: 24px 32px 36px;
  width: min(100%, 1440px);
  animation: scaleIn 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.folder-expand-head {
  align-items: center;
  display: flex;
  gap: 16px;
  justify-content: space-between;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  padding-bottom: 16px;
}

.folder-expand-head h2 {
  font-size: 24px;
  font-weight: 800;
  letter-spacing: -0.02em;
  margin: 0;
  color: #fff;
}

.folder-expand-close {
  align-items: center;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 10px;
  color: rgba(255, 255, 255, 0.6);
  cursor: pointer;
  display: inline-flex;
  height: 38px;
  justify-content: center;
  padding: 0;
  transition: all 0.2s ease;
  width: 38px;
}

.folder-expand-close:hover,
.folder-expand-close:focus-visible {
  background: rgba(255, 255, 255, 0.12);
  border-color: rgba(255, 255, 255, 0.2);
  color: #ffffff;
  outline: none;
}

.expanded-link-grid {
  align-content: start;
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 320px), 1fr));
  overflow-y: auto;
  padding-right: 4px;
}

.expanded-link {
  align-items: center;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.04);
  border-radius: 12px;
  color: rgba(255, 255, 255, 0.9);
  display: grid;
  gap: 14px;
  grid-template-columns: 56px minmax(0, 1fr);
  min-height: 84px;
  padding: 14px;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.expanded-link:hover,
.expanded-link:focus-visible {
  background: rgba(76, 201, 167, 0.08);
  border-color: rgba(76, 201, 167, 0.35);
  color: var(--accent);
  outline: none;
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(76, 201, 167, 0.1);
}

.expanded-link:active {
  transform: translateY(0);
}

.expanded-link:hover small,
.expanded-link:focus-visible small {
  color: rgba(76, 201, 167, 0.6);
}

.expanded-link-icon {
  align-items: center;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 12px;
  display: inline-flex;
  height: 54px;
  justify-content: center;
  width: 54px;
  color: rgba(255, 255, 255, 0.4);
  transition: all 0.2s ease;
}

.expanded-link:hover .expanded-link-icon {
  background: rgba(76, 201, 167, 0.12);
  border-color: rgba(76, 201, 167, 0.25);
  color: var(--accent);
  transform: scale(1.04);
}

.expanded-link-copy {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.expanded-link strong,
.expanded-link small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.expanded-link strong {
  font-size: 16px;
  font-weight: 700;
  letter-spacing: -0.01em;
}

.expanded-link small {
  color: rgba(255, 255, 255, 0.4);
  font-size: 13px;
  font-weight: 500;
}

.expanded-empty {
  color: rgba(255, 255, 255, 0.4);
  margin: 40px auto;
  font-size: 15px;
}

.modal-backdrop {
  align-items: center;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  background: rgba(10, 12, 16, 0.65);
  display: grid;
  inset: 0;
  padding: 20px;
  position: fixed;
  z-index: 50;
  animation: fadeIn 0.2s ease-out;
}

.modal {
  background: rgba(20, 24, 33, 0.95);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  display: grid;
  gap: 18px;
  margin: 0 auto;
  max-width: 380px;
  padding: 24px;
  width: 100%;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.5);
  animation: scaleIn 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.modal h2 {
  font-size: 20px;
  font-weight: 800;
  margin: 0;
  color: #fff;
}

.modal p {
  color: rgba(255, 255, 255, 0.5);
  font-size: 13.5px;
  margin: 0;
  line-height: 1.4;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes scaleIn {
  from { transform: scale(0.95); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}

@media (max-width: 640px) {
  .nav-page {
    padding: 36px 12px;
  }

  .nav-content {
    --folder-card-width: min(100%, 445px);
    padding: 0 10px;
  }

  .adaptive-folder-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .nav-header {
    justify-items: stretch;
    min-height: 18vh;
    text-align: left;
  }

  .folder-tabs {
    margin-left: -10px;
    margin-right: -10px;
    border-radius: 0;
    max-width: 100%;
  }

  .folder-expand-backdrop {
    padding: 24px 12px;
  }

  .folder-expand-modal {
    min-height: calc(100vh - 48px);
    padding: 16px;
  }

  .expanded-link-grid {
    gap: 12px;
  }
}
</style>
