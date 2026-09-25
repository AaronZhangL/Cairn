# Cairn

Turns an ebook the reader already owns into a path they can walk to the end: stations of narrated
slides, sourced from the book's own text.

## Language

### The book and its path

**Book**:
An ebook the reader owns and added, parsed locally into chapters. Its language comes from its
text, never from the interface.
_Avoid_: Document, file (once parsed)

**Chapter note**:
The map stage's compression of one chapter — gist, key points, verbatim quotes and structured
material. Everything after map reads notes, never the book.
_Avoid_: Summary, chunk

**Budget**:
The reading length the reader picks, one of four rungs (skim, gist, read, walk it all) whose
minutes derive from the book's shape. The budget decides the station count, not the reverse.
_Avoid_: Length setting, mode

**Path**:
The ordered list of stations for one book at one budget, grouped into stages.
_Avoid_: Course, curriculum, outline

**Station**:
One stop on a path: a short deck with narration that must make one thing clear, traceable to
the chapters it came from. `PathNode` in code.
_Avoid_: Node (in anything the reader sees), lesson, step

**Stage**:
A contiguous run of stations, named for what the reader is doing, not for the book's table of
contents.
_Avoid_: Section, part, chapter

**Recap station**:
The single closing station, appended after reduce and built from the path itself rather than the
notes.
_Avoid_: Summary station, conclusion

### What a station is made of

**Deck**:
A station's slides plus its narration and audio timing. Keyed by its content, never its position.
_Avoid_: Video, presentation

**Slide**:
One card of structured data in a deck, drawn by a layout. Never an image.
_Avoid_: Frame, page

**Layout**:
The shape of claim a slide makes — compare, flow, cycle, quadrant — with the data that shape needs.
_Avoid_: Template, theme, skin

**Voice**:
The narration voice a book is built with, fixed when the book is added and kept for its life.
_Avoid_: Speaker

### Where books live

**Library**:
The data directory's books, their shelf index and their generation cache; `Library` in code is the
one module that writes it.
_Avoid_: Store, database

**Shelf**:
What the reader sees of the library: the list of added books and how far each is built.
_Avoid_: Bookcase, collection

**Book builder**:
What adding a book does — map, classify, reduce, install the path, then build decks in walking
order — and resuming or removing one. Shared by the app and `add-book`.
_Avoid_: Generator, pipeline driver

**Companion**:
The chat beside the player that answers questions about the current book, citing where each claim
came from.
_Avoid_: Assistant, bot, ask pane
