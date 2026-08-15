import { create } from 'zustand';
import {
  api,
  type ClipDetail,
  type ClipListItem,
  type ClipStatus,
  type ClipTag,
  type HighlightAnchor,
} from '../services/api';

export type ClipView = 'list' | 'compact';

const VIEW_STORAGE_KEY = 'nono.clipper.view';

export interface ClipFilters {
  status?: ClipStatus;
  starred?: boolean;
  domain?: string;
  tagId?: number;
}

interface ClipState {
  items: ClipListItem[];
  total: number;
  offset: number;
  limit: number;
  loading: boolean;
  error: string | null;

  filters: ClipFilters;
  view: ClipView;

  query: string;
  searching: boolean;
  searchResults: ClipListItem[] | null;

  tags: ClipTag[];
  openClip: ClipDetail | null;
  openLoading: boolean;

  loadClips(reset?: boolean): Promise<void>;
  loadMore(): Promise<void>;
  setFilters(filters: ClipFilters): Promise<void>;
  setView(view: ClipView): void;
  search(query: string): Promise<void>;
  clearSearch(): void;

  openReader(id: number): Promise<void>;
  closeReader(): void;
  setStatus(id: number, status: ClipStatus): Promise<void>;
  toggleStar(id: number): Promise<void>;
  removeClip(id: number): Promise<void>;
  refetch(id: number): Promise<void>;

  loadTags(): Promise<void>;
  createTag(name: string, color?: string): Promise<void>;
  renameTag(id: number, name: string): Promise<void>;
  deleteTag(id: number): Promise<void>;
  assignTags(clipId: number, tagIds: number[]): Promise<void>;

  addHighlight(clipId: number, input: { text: string; anchor: HighlightAnchor; note?: string }): Promise<void>;
  removeHighlight(id: number): Promise<void>;
}

function storedView(): ClipView {
  try {
    // window.localStorage, not the bare global: Node exposes an experimental localStorage that
    // shadows the jsdom one and is unavailable without a CLI flag.
    return window.localStorage.getItem(VIEW_STORAGE_KEY) === 'compact' ? 'compact' : 'list';
  } catch {
    return 'list';
  }
}

function message(error: unknown) {
  return error instanceof Error ? error.message : 'Something went wrong';
}

export const useClipStore = create<ClipState>((set, get) => ({
  items: [],
  total: 0,
  offset: 0,
  limit: 30,
  loading: false,
  error: null,

  filters: {},
  view: storedView(),

  query: '',
  searching: false,
  searchResults: null,

  tags: [],
  openClip: null,
  openLoading: false,

  async loadClips(reset = true) {
    const { filters, limit } = get();
    set({ loading: true, error: null, ...(reset ? { offset: 0 } : {}) });
    try {
      const offset = reset ? 0 : get().offset;
      const response = await api.listClips({
        ...filters,
        starred: filters.starred === undefined ? undefined : String(filters.starred),
        limit,
        offset,
      });
      set((state) => ({
        items: reset ? response.items : [...state.items, ...response.items],
        total: response.total,
        offset: offset + response.items.length,
        loading: false,
      }));
    } catch (error) {
      set({ loading: false, error: message(error) });
    }
  },

  async loadMore() {
    if (get().loading || get().items.length >= get().total) return;
    await get().loadClips(false);
  },

  async setFilters(filters) {
    set({ filters });
    await get().loadClips(true);
  },

  setView(view) {
    // Reader and list preferences are local; they never touch the stored clip.
    try {
      window.localStorage.setItem(VIEW_STORAGE_KEY, view);
    } catch {
      // A blocked localStorage must not break the toggle.
    }
    set({ view });
  },

  async search(query) {
    const trimmed = query.trim();
    set({ query: trimmed });
    if (!trimmed) {
      set({ searchResults: null, searching: false });
      return;
    }
    set({ searching: true, error: null });
    try {
      const response = await api.search(trimmed);
      set({ searchResults: response.items, searching: false });
    } catch (error) {
      set({ searching: false, error: message(error) });
    }
  },

  clearSearch() {
    set({ query: '', searchResults: null });
  },

  async openReader(id) {
    set({ openLoading: true, error: null });
    try {
      // Full content is fetched only here, never in the list.
      const clip = await api.getClip(id);
      set({ openClip: clip, openLoading: false });
      if (clip.status === 'unread') void get().setStatus(id, 'reading');
    } catch (error) {
      set({ openLoading: false, error: message(error) });
    }
  },

  closeReader() {
    set({ openClip: null });
  },

  async setStatus(id, status) {
    try {
      await api.updateClip(id, { status });
      set((state) => ({
        items: state.items.map((item) => (item.id === id ? { ...item, status } : item)),
        openClip: state.openClip?.id === id ? { ...state.openClip, status } : state.openClip,
      }));
    } catch (error) {
      set({ error: message(error) });
    }
  },

  async toggleStar(id) {
    const current = get().items.find((item) => item.id === id)?.starred ?? get().openClip?.starred ?? false;
    try {
      await api.updateClip(id, { starred: !current });
      set((state) => ({
        items: state.items.map((item) => (item.id === id ? { ...item, starred: !current } : item)),
        openClip: state.openClip?.id === id ? { ...state.openClip, starred: !current } : state.openClip,
      }));
    } catch (error) {
      set({ error: message(error) });
    }
  },

  async removeClip(id) {
    try {
      await api.deleteClip(id);
      set((state) => ({
        items: state.items.filter((item) => item.id !== id),
        total: Math.max(0, state.total - 1),
        openClip: state.openClip?.id === id ? null : state.openClip,
      }));
    } catch (error) {
      set({ error: message(error) });
    }
  },

  async refetch(id) {
    try {
      await api.refetchClip(id);
      if (get().openClip?.id === id) await get().openReader(id);
      await get().loadClips(true);
    } catch (error) {
      set({ error: message(error) });
    }
  },

  async loadTags() {
    try {
      set({ tags: await api.listTags() });
    } catch (error) {
      set({ error: message(error) });
    }
  },

  async createTag(name, color) {
    try {
      await api.createTag(name, color);
      await get().loadTags();
    } catch (error) {
      set({ error: message(error) });
    }
  },

  async renameTag(id, name) {
    try {
      await api.updateTag(id, { name });
      await get().loadTags();
    } catch (error) {
      set({ error: message(error) });
    }
  },

  async deleteTag(id) {
    try {
      await api.deleteTag(id);
      await get().loadTags();
    } catch (error) {
      set({ error: message(error) });
    }
  },

  async assignTags(clipId, tagIds) {
    try {
      await api.assignTags(clipId, tagIds);
      if (get().openClip?.id === clipId) await get().openReader(clipId);
    } catch (error) {
      set({ error: message(error) });
    }
  },

  async addHighlight(clipId, input) {
    try {
      const highlight = await api.addHighlight(clipId, input);
      set((state) => ({
        openClip: state.openClip?.id === clipId
          ? { ...state.openClip, highlights: [...state.openClip.highlights, highlight] }
          : state.openClip,
      }));
    } catch (error) {
      set({ error: message(error) });
    }
  },

  async removeHighlight(id) {
    try {
      await api.deleteHighlight(id);
      set((state) => ({
        openClip: state.openClip
          ? { ...state.openClip, highlights: state.openClip.highlights.filter((item) => item.id !== id) }
          : state.openClip,
      }));
    } catch (error) {
      set({ error: message(error) });
    }
  },
}));
