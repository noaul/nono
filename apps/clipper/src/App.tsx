import { useEffect, useState } from 'react';
import { BookOpenText, Search, Tags } from 'lucide-react';
import { ClipListView } from './views/ClipListView';
import { ReaderView } from './views/ReaderView';
import { SearchView } from './views/SearchView';
import { TagManagerView } from './views/TagManagerView';
import { useClipStore } from './stores/clipStore';

type Pane = 'library' | 'search' | 'tags';

export function App() {
  const openClip = useClipStore((state) => state.openClip);
  const openLoading = useClipStore((state) => state.openLoading);
  const openReader = useClipStore((state) => state.openReader);
  const [pane, setPane] = useState<Pane>('library');

  useEffect(() => {
    const id = Number(new URLSearchParams(window.location.search).get('clip'));
    if (Number.isInteger(id) && id > 0) void openReader(id);
  }, [openReader]);

  return (
    <div className="clipper-shell">
      <header className="app-header">
        <div className="app-header-inner">
          <a className="app-brand" href="/">
            <span className="app-brand-mark"><BookOpenText size={17} /></span>
            <span><strong>Clipper</strong><small>Nono 网页剪藏</small></span>
          </a>
          <nav className="app-nav" aria-label="视图">
            <button type="button" className={pane === 'library' ? 'is-active' : ''} onClick={() => setPane('library')}><BookOpenText size={14} />剪藏</button>
            <button type="button" className={pane === 'search' ? 'is-active' : ''} onClick={() => setPane('search')}><Search size={14} />搜索</button>
            <button type="button" className={pane === 'tags' ? 'is-active' : ''} onClick={() => setPane('tags')}><Tags size={14} />标签</button>
          </nav>
        </div>
      </header>

      <main className="app-main">
        {openLoading ? <p className="state-message">正在打开...</p> : null}
        {!openClip && !openLoading ? (
          <div className="app-workspace">
          {pane === 'library' ? <ClipListView /> : null}
          {pane === 'search' ? <SearchView /> : null}
          {pane === 'tags' ? <TagManagerView /> : null}
          </div>
        ) : null}
        {openClip ? <ReaderView /> : null}
      </main>
    </div>
  );
}
