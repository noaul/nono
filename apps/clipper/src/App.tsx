import { useState } from 'react';
import { ClipListView } from './views/ClipListView';
import { ReaderView } from './views/ReaderView';
import { SearchView } from './views/SearchView';
import { TagManagerView } from './views/TagManagerView';
import { useClipStore } from './stores/clipStore';

type Pane = 'library' | 'search' | 'tags';

export function App() {
  const openClip = useClipStore((state) => state.openClip);
  const openLoading = useClipStore((state) => state.openLoading);
  const [pane, setPane] = useState<Pane>('library');

  return (
    <div className="clipper-shell">
      <header className="app-header">
        <a className="app-back" href="/">Nono</a>
        <h1>Clipper</h1>
        <nav className="app-nav" aria-label="视图">
          <button type="button" className={pane === 'library' ? 'is-active' : ''} onClick={() => setPane('library')}>剪藏</button>
          <button type="button" className={pane === 'search' ? 'is-active' : ''} onClick={() => setPane('search')}>搜索</button>
          <button type="button" className={pane === 'tags' ? 'is-active' : ''} onClick={() => setPane('tags')}>标签</button>
        </nav>
      </header>

      <main className="app-main">
        <div className="app-column">
          {pane === 'library' ? <ClipListView /> : null}
          {pane === 'search' ? <SearchView /> : null}
          {pane === 'tags' ? <TagManagerView /> : null}
        </div>
        <div className="app-reader">
          {openLoading ? <p className="state-message">正在打开...</p> : null}
          {openClip ? <ReaderView /> : null}
          {!openClip && !openLoading ? <p className="state-message">选择左侧的剪藏开始阅读。</p> : null}
        </div>
      </main>
    </div>
  );
}
