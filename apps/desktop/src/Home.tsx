import type { ReactElement } from 'react';
import { ACCEPTED_EXTENSIONS } from '@cairn/core/parse';
import type { LibraryEntry } from '@cairn/core/store/library';
import { inShell } from './bridge';

/**
 * The first screen: put a book in.
 *
 * Opening straight into whichever book happens to be first in the library made
 * the app look like it owned that book. The entry point is the drop zone; the
 * shelf below it is for walking a path again, and nothing opens until it is picked.
 */
export function Home({
  books, onAdd, onOpen,
}: {
  books: readonly LibraryEntry[];
  onAdd: () => void;
  onOpen: (bookId: string) => void;
}): ReactElement {
  return (
    <div className="home">
      <header className="home-head">
        <h1>Cairn</h1>
        <p>把一本你已经有的电子书，变成一条可以走到头的路。</p>
      </header>

      <button type="button" className="drop-zone" onClick={onAdd} disabled={!inShell}>
        <span className="drop-title">放一本电子书进来</span>
        <span className="drop-sub">
          支持 {ACCEPTED_EXTENSIONS.join(' / ')} · 书不会离开这台机器
        </span>
        <span className="drop-cta">
          {inShell ? '选择文件…' : '开发模式下不能选文件，用 `bun run start` 启动桌面应用'}
        </span>
      </button>

      {books.length > 0 && (
        <section className="shelf">
          <h2 className="shelf-title">书架</h2>
          {books.map((b) => (
            <button key={b.id} type="button" className="shelf-item" onClick={() => onOpen(b.id)}>
              <span className="shelf-name">{b.title}</span>
              <span className="shelf-meta">
                {b.stations} 站 · {b.complete === false ? '约 ' : ''}{b.minutes} 分钟
                {b.complete === false && (
                  <span className="shelf-building">
                    {' · 已建 '}{b.built ?? 0}/{b.stations} 站
                  </span>
                )}
                {b.author ? ` · ${b.author}` : ''}
              </span>
            </button>
          ))}
        </section>
      )}
    </div>
  );
}
