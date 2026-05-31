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
      <div class="folder-grid">
        <FolderCard v-for="folder in shownFolders" :key="folder.id" :folder="folder" @verify="verifying = $event" />
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
  padding: 28px;
}

.nav-content {
  display: grid;
  gap: 18px;
  margin: 0 auto;
  max-width: 1180px;
}

.nav-header {
  align-items: end;
  display: flex;
  justify-content: space-between;
  gap: 14px;
  min-height: 28vh;
}

h1 {
  font-size: clamp(42px, 8vw, 88px);
  line-height: 0.95;
  margin: 0;
}

.nav-header p {
  color: rgba(255, 255, 255, 0.76);
  font-size: 17px;
  margin: 12px 0 0;
  max-width: 640px;
}

.folder-grid {
  display: grid;
  gap: 14px;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
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
    padding: 18px;
  }

  .nav-header {
    align-items: flex-start;
    flex-direction: column;
    min-height: 18vh;
  }
}
</style>
