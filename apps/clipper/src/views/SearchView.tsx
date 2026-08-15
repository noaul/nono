import { useState } from 'react';
import { Search } from 'lucide-react';
import { useClipStore } from '../stores/clipStore';

export function SearchView() {
  const query = useClipStore((state) => state.query);
  const searching = useClipStore((state) => state.searching);
  const searchResults = useClipStore((state) => state.searchResults);
  const search = useClipStore((state) => state.search);
  const clearSearch = useClipStore((state) => state.clearSearch);
  const openReader = useClipStore((state) => state.openReader);
  const [draft, setDraft] = useState(query);

  return (
    <section className="clip-search">
      <form
        className="search-row"
        onSubmit={(event) => {
          event.preventDefault();
          void search(draft);
        }}
      >
        <label className="visually-hidden" htmlFor="clip-search-input">搜索剪藏</label>
        <input
          id="clip-search-input"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="搜索标题、标签与正文"
          maxLength={200}
        />
        <button type="submit" className="icon-button" aria-label="搜索"><Search size={16} /></button>
        {searchResults ? (
          <button
            type="button"
            className="text-button"
            onClick={() => {
              setDraft('');
              clearSearch();
            }}
          >
            清除
          </button>
        ) : null}
      </form>

      {searching ? <p className="state-message">搜索中...</p> : null}

      {searchResults && !searching ? (
        searchResults.length === 0 ? (
          <p className="state-message">没有匹配的剪藏。</p>
        ) : (
          <ul className="clip-items is-compact">
            {searchResults.map((clip) => (
              <li key={clip.id} className="clip-item">
                <button type="button" className="clip-open" onClick={() => void openReader(clip.id)}>
                  <span className="clip-title">{clip.title}</span>
                  <span className="clip-excerpt">{clip.excerpt}</span>
                </button>
              </li>
            ))}
          </ul>
        )
      ) : null}
    </section>
  );
}
