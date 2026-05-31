<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
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
        <FolderCard v-for="folder in foldersWithLinks" :key="folder.id" :folder="folder" @verify="verifying = $event" />
      </div>
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
  display: grid;
  gap: 24px;
  margin: 0 auto;
  max-width: 1920px;
  padding: 0 40px;
}

.nav-header {
  display: grid;
  justify-items: center;
  gap: 14px;
  min-height: 200px;
  text-align: center;
}

h1 {
  font-size: clamp(38px, 6vw, 64px);
  line-height: 1;
  margin: 0;
}

.nav-header p {
  color: rgba(255, 255, 255, 0.76);
  font-size: 17px;
  margin: 12px 0 0;
  max-width: 640px;
}

.trace-link {
  color: rgba(255, 255, 255, 0.9);
  font-size: 18px;
  justify-self: end;
  margin: 18px 10% 8px 0;
}

.folder-tabs {
  backdrop-filter: blur(4px);
  background: rgba(0, 0, 0, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.22);
  border-left: 0;
  border-radius: 0;
  border-right: 0;
  display: flex;
  gap: 8px;
  justify-content: center;
  margin-left: -40px;
  margin-right: -40px;
  overflow-x: auto;
  padding: 10px;
}

.folder-tabs a {
  border-radius: 6px;
  flex: 0 0 auto;
  padding: 6px 14px;
}

.folder-tabs a:hover {
  background: rgba(255, 255, 255, 0.16);
}

.adaptive-folder-grid {
  display: grid;
  gap: 28px 20px;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, max(340px, 25vw)), 1fr));
}

.modal-backdrop {
  align-items: center;
  background: rgba(0, 0, 0, 0.62);
  display: grid;
  inset: 0;
  padding: 20px;
  position: fixed;
}

.modal {
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 8px;
  display: grid;
  gap: 14px;
  margin: 0 auto;
  max-width: 380px;
  padding: 18px;
  width: 100%;
}

.modal h2 {
  margin: 0;
}

@media (max-width: 640px) {
  .nav-page {
    padding: 36px 12px;
  }

  .nav-content {
    padding: 0 10px;
  }

  .nav-header {
    justify-items: stretch;
    min-height: 18vh;
    text-align: left;
  }

  .folder-tabs {
    margin-left: -10px;
    margin-right: -10px;
  }
}
</style>
