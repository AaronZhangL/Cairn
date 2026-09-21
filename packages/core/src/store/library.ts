/**
 * On-disk layout for generated books.
 *
 * One directory per book so adding a second one never clobbers the first, plus a
 * flat index the app reads at startup to populate its switcher.
 */
export interface LibraryEntry {
  readonly id: string;
  readonly title: string;
  readonly author?: string;
  readonly stations: number;
  readonly minutes: number;
  readonly budgetId: string;
  readonly generatedAt: string;
}

export const LIBRARY_INDEX = 'books.json';

export const bookDir = (id: string): string => `books/${id}`;
export const bookFile = (id: string, name: string): string => `${bookDir(id)}/${name}`;
export const audioFile = (id: string, nodeId: string): string =>
  `${bookDir(id)}/audio/${nodeId}.mp3`;

/**
 * ASCII-safe directory name, derived from the title plus the source file.
 *
 * The file is part of the id because two different books can share a title — a
 * translation and its original, say — and keying on the title alone lets the
 * second one silently replace the first. Regenerating the *same* file at another
 * budget still lands on the same id, which is what you want.
 */
export function bookSlug(
  title: string,
  hash: (s: string) => string,
  sourcePath = '',
): string {
  const ascii = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const suffix = hash(sourcePath).slice(0, 6);
  return ascii.length >= 3 ? `${ascii.slice(0, 33)}-${suffix}` : `book-${suffix}`;
}
