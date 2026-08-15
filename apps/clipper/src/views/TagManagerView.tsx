import { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useClipStore } from '../stores/clipStore';

export function TagManagerView() {
  const tags = useClipStore((state) => state.tags);
  const loadTags = useClipStore((state) => state.loadTags);
  const createTag = useClipStore((state) => state.createTag);
  const renameTag = useClipStore((state) => state.renameTag);
  const deleteTag = useClipStore((state) => state.deleteTag);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    void loadTags();
  }, [loadTags]);

  return (
    <section className="tag-manager">
      <form
        className="search-row"
        onSubmit={(event) => {
          event.preventDefault();
          if (!draft.trim()) return;
          void createTag(draft.trim());
          setDraft('');
        }}
      >
        <label className="visually-hidden" htmlFor="clip-tag-input">新建标签</label>
        <input
          id="clip-tag-input"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="新建标签"
          maxLength={60}
        />
        <button type="submit" className="text-button">添加</button>
      </form>

      {tags.length === 0 ? <p className="state-message">还没有标签。</p> : null}

      <ul className="tag-list">
        {tags.map((tag) => (
          <li key={tag.id} className="tag-row">
            <input
              defaultValue={tag.name}
              maxLength={60}
              aria-label={`标签 ${tag.name}`}
              onBlur={(event) => {
                const next = event.target.value.trim();
                if (next && next !== tag.name) void renameTag(tag.id, next);
              }}
            />
            <button
              type="button"
              className="icon-button"
              aria-label={`删除 ${tag.name}`}
              onClick={() => void deleteTag(tag.id)}
            >
              <Trash2 size={15} />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
