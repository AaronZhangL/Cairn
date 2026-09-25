/**
 * The library this process reads and writes: one instance, because its write
 * chain and read cache are per instance — a second one would race the first
 * and hand the companion a path the builder had already replaced.
 */
import { defaultLibraryDir, openLibrary } from '@cairn/core/store/library-disk';

export const DATA_DIR = defaultLibraryDir();
export const library = openLibrary(DATA_DIR);
