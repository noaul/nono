import { computed, inject, ref, unref, watch, type Ref } from 'vue';
import { routeLocationKey, routerKey } from 'vue-router';

// In-page tabs whose selection lives in the URL hash, so /admin/account#access can be linked to and survives reloads.
// `aliases` maps older anchors (e.g. #api-tokens) onto the tab that now holds them.
export function useHashTabs<T extends string>(
  available: Ref<readonly T[]> | readonly T[],
  aliases: Record<string, T> = {},
) {
  const router = inject(routerKey, null);
  const route = inject(routeLocationKey, null);
  const ids = computed(() => unref(available));

  function fromHash(hash: string | undefined): T {
    const key = (hash || '').replace(/^#/, '');
    const id = (ids.value as readonly string[]).includes(key) ? (key as T) : aliases[key];
    return id && ids.value.includes(id) ? id : ids.value[0];
  }

  const currentHash = () => route?.hash ?? (typeof window === 'undefined' ? '' : window.location.hash);
  const active = ref(fromHash(currentHash())) as Ref<T>;

  if (route) watch(() => route.hash, (hash) => { active.value = fromHash(hash); });
  // A tab can appear late (e.g. admin-only ones once the session loads); re-read the hash so #users still lands.
  watch(ids, () => { active.value = fromHash(currentHash()); });

  function select(id: string) {
    if (!(ids.value as readonly string[]).includes(id)) return;
    active.value = id as T;
    if (router && route) void router.replace({ hash: id === ids.value[0] ? '' : `#${id}` });
  }

  return { active, select };
}
