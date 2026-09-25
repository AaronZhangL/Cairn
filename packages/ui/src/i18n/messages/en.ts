/**
 * English copy, and the shape every other locale must match.
 *
 * `Messages` is derived from this object, so a key added here fails the
 * typecheck of every translation until it is filled in — which is the only
 * mechanism that keeps two dictionaries from drifting apart.
 *
 * Entries that take a value are functions rather than templates with
 * placeholders: word order differs between languages, and a function lets each
 * locale put the number where its own grammar wants it.
 */
export const en = {
  /**
   * Failures, by the code the thrower used. Keyed exactly on `ErrorCode` so a
   * new code cannot be added without a sentence for it in both languages.
   */
  errors: {
    unsupported_format: (p: { ext?: string; accepted?: string }) =>
      `.${p.ext || '?'} files are not supported. Try ${p.accepted ?? 'EPUB, PDF, MOBI, AZW3 or TXT'}.`,
    empty_file: 'That file is empty.',
    corrupt_archive: 'That file is damaged, or is not the format its name says.',
    no_content: 'No readable text was found in that file.',
    decode_failed: 'That file’s text encoding could not be read.',
    scanned_pdf: 'That PDF is a scan with no text layer. Run it through OCR first, then add it.',
    unreadable_pdf: 'That PDF could not be opened: it is damaged or password-protected.',
    drm_protected: 'That Kindle book is DRM-protected, so its text cannot be read. Only DRM-free MOBI and AZW3 files work.',

    llm_timeout: 'The model took too long to answer.',
    llm_aborted: 'That call was cancelled.',
    llm_bad_output: 'The model returned something this app could not read.',
    llm_failed: 'The model command failed. Check that `codex` is installed and on PATH.',

    tts_missing: 'The narration service could not be reached, so nothing can be narrated. Check the network and try again.',
    tts_failed: 'Narration failed while synthesising.',
    tts_no_cues: 'The narration service returned no subtitle timings.',
    tts_unaligned: 'Without subtitle timings the narration cannot be aligned.',

    map_empty: 'Reading the chapters produced nothing.',
    reduce_empty: 'No usable chapters could be laid out for this book.',
    no_narration: (p: { label?: string }) => `${p.label ?? 'A chapter'} produced no narration script.`,
    missing_source_chapter: (p: { n?: number; title?: string }) =>
      `Chapter ${p.n ?? '?'} (${p.title ?? ''}) points at source chapters that do not exist.`,
    node_failed: 'That chapter could not be built.',
    generation_stopped: 'Building was stopped.',
    unknown_node: 'That chapter is not part of this path.',
    cancelled: 'Cancelled.',

    book_not_listed: 'That book is not on the shelf.',
    delete_failed: 'The book could not be deleted.',
    main_silent: 'The main process did not answer. Restart the app and try again.',
    bundle_failed: (p: { path?: string; status?: number }) =>
      `${p.path ?? 'A file'} could not be loaded (${p.status ?? '?'}).`,
    tavily_key_missing: 'No Tavily API key is set, so the web cannot be searched.',
    tavily_failed: (p: { status?: number }) => `Tavily answered with ${p.status ?? '?'}.`,
    brave_key_missing: 'No Brave Search API key is set, so it cannot search the web.',
    brave_failed: (p: { status?: number }) => `Brave Search answered with ${p.status ?? '?'}.`,
    firecrawl_failed: (p: { status?: number }) => `Firecrawl search answered with ${p.status ?? '?'}.`,

    offline_pick: 'Choosing a file needs the desktop app — run `bun run start`.',
    offline_generate: 'Building a path needs the desktop app — run `bun run start`.',
    offline_delete: 'Deleting a book needs the desktop app — run `bun run start`.',
    offline_chat: 'Asking about the book needs the desktop app — run `bun run start`.',
    offline_settings: 'Changing this setting needs the desktop app — run `bun run start`.',

    unknown: 'Something went wrong.',
  },

  unit: {
    /** A station, in the words the reader uses for it. */
    node: 'chapter',
    nth: (n: number) => `Chapter ${n}`,
    minutes: (n: number) => `${n} min`,
    count: (n: number) => `${n} ${n === 1 ? 'chapter' : 'chapters'}`,
    approx: 'about ',
    duration: (minutes: number) => (minutes < 60
      ? `${minutes} min`
      : `${Number.isInteger(minutes / 60) ? minutes / 60 : (minutes / 60).toFixed(1)} hr`),
    words: (n: number) => `${n.toLocaleString('en-US')} words`,
  },

  stage: {
    building: (n: number) => ` · ${n} still building`,
    notReady: 'queued',
    failed: 'failed',
    asked: (n: number) => `Asked about this chapter ${n} times`,
  },

  deck: {
    play: 'Play',
    pause: 'Pause',
    stageHint: 'Click the slide to pause or resume',
    pending: 'This chapter is still being built — one moment',
    failed: 'This chapter could not be built',
    mute: 'Mute',
    unmute: 'Unmute',
    volume: 'Volume',
    progress: 'Progress',
    rate: 'Playback speed · hold → temporary boost',
    fullscreen: 'Full screen',
    exitFullscreen: 'Leave full screen',
  },

  ask: {
    placeholder: 'Ask something…',
    send: 'Send',
    thinking: 'Thinking…',
    fromBook: 'From the book',
    chapter: (n: number) => `Chapter ${n}`,
    notInBook: 'The book does not cover this. Search the web for it?',
    outsideTag: 'Outside the book · from the web',
    dropQuote: 'Drop this quote',
  },

  companion: {
    placeholder: 'Ask about this book or anything else…',
    send: 'Send',
    thinking: 'Thinking…',
    stop: 'Stop',
    webSource: 'Web source',
    readingSource: 'Earlier reading',
    chapter: (n: number) => `Ch. ${n}`,
    busy: 'Another answer is still running.',
    error: (code: string) => ({
      no_credential: 'Set up a model in Settings to use the companion.',
      model_unavailable: 'The selected chat model is unavailable.',
      bad_citation: 'The answer could not be verified against its sources. Please try again.',
      aborted: 'Answer stopped.',
      tool_limit: 'The answer needed too many tool calls. Try a narrower question.',
      busy: 'Another answer is still running.',
    } as Record<string, string>)[code] ?? 'The companion could not finish that answer.',
  },

  menu: {
    addBook: 'Add a book',
    backToShelf: 'Back to the shelf',
    settings: 'Settings…',
  },

  panel: {
    expand: (what: string) => `Show ${what}`,
    collapse: (what: string) => `Hide ${what}`,
    stagePane: 'the chapter list',
    askPane: 'the question pane',
    splitterDrag: (collapsed: boolean) =>
      `Drag to resize, double-click to ${collapsed ? 'show' : 'hide'}`,
  },

  home: {
    tagline: 'Turn an ebook you already own into a path you can walk to the end.',
    dropTitle: 'Drop an ebook in',
    dropSub: (formats: string) => `${formats} · the book never leaves this machine`,
    dropCta: 'Choose a file…',
    devCta: 'File picking needs the desktop shell — run `bun run start`',
    shelf: 'Shelf',
    built: (done: number, total: number) => ` · ${done}/${total} built`,
    deleteAsk: 'Delete it, audio and all?',
    deleting: 'Deleting…',
    delete: 'Delete',
    cancel: 'Cancel',
    deleteAria: (title: string) => `Delete ${title}`,
    deleteTitle: 'Delete this book',
    settings: 'Settings',
  },

  add: {
    title: 'Add a book',
    parsing: 'Reading this book…',
    supported: 'EPUB, PDF, MOBI, AZW3 or TXT. The book never leaves this machine.',
    pick: 'Choose a file…',
    picking: 'Reading…',
    howLong: 'How long do you want to spend?',
    narratedIn: (language: string, voice: string) => `Narrated in ${language} · ${voice}`,
    languageName: { en: 'English', zh: 'Chinese' },
    budgetLabel: (duration: string, rung: string) => `${duration} · ${rung}`,
    budgetWarning: (wordsPerNode: number) =>
      `At this length each chapter would have to carry about ${wordsPerNode.toLocaleString('en-US')} words, which flattens it.`,
    recommended: 'suggested',
    another: 'Pick another',
    generating: 'Building',
    note: 'The book never leaves this machine. You can close this window while it builds.',
    stages: {
      map: 'Compressing each chapter',
      classify: 'Working out the kind of book',
      reduce: 'Designing the path',
      decks: 'Writing slides and narration',
      done: 'Done',
    },
  },

  app: {
    loading: 'Loading…',
    backToShelf: 'Back to the shelf',
  },

  quote: {
    source: (n: number) => `Chapter ${n} of the book`,
    noSource: 'No source found in the text',
  },

  settings: {
    title: 'Settings',
    close: 'Close settings',
    groups: {
      app: 'App',
      reading: 'Reading',
      generation: 'Generation',
    },
    pages: {
      general: 'General',
      appearance: 'Appearance',
      playback: 'Playback',
      models: 'Model',
      narration: 'Narration',
      search: 'Search',
      data: 'Data & cache',
    },
    general: {
      desc: 'Interface language and theme. Applied immediately.',
      language: 'Interface language',
      languageHint: 'The native menu bar follows this too.',
      theme: 'Theme',
      themeLight: 'Light',
      themeDark: 'Dark',
      themeSystem: 'System',
    },
    appearance: {
      desc: 'How large the interface and the captions are drawn.',
      slideText: 'Interface text size',
      slideTextHint:
        'Sidebars and captions. Slide type is not scaled here — it is already a fraction of the stage, and its length budgets are fixed.',
      sizeS: 'S',
      sizeM: 'M',
      sizeL: 'L',
      sizeXL: 'XL',
      sample: 'A chapter that cannot make one thing clear is worth nothing.',
      sampleCue: 'The sentence being read is lit like this',
    },
    models: {
      desc: 'Choose models for station generation and the reading companion.',
      providers: 'Providers',
      defaultLabel: 'Default',
      setDefault: 'Use for generation',
      getKey: 'Get a key',
      apiKey: 'API key',
      secretHint: 'A saved key stays in the main process and is never sent back here. Type a new one to replace it, or clear it. With none saved, the provider’s environment variable is read.',
      baseUrl: 'Endpoint',
      baseUrlHint: 'Leave empty for the provider’s own.',
      baseUrlRequired: 'Required — a custom endpoint has none of its own.',
      baseUrlPlaceholder: 'https://…/v1',
      modelName: 'Model',
      modelDefault: 'Provider default',
      modelHint: 'Models the provider will hold to a schema are listed first.',
      modelCustom: 'The model id this endpoint expects.',
      status: 'In force',
      statusReady: (provider: string, detail: string) => `${provider} · ${detail}`,
      statusNoKey: 'No API key yet — generation will fail until one is set.',
      recheck: 'Check again',
      chatSource: 'Companion model',
      chatHint: 'Only affects conversations. Station generation keeps the model above.',
      chatInherit: 'Use the generation model',
    },
    playback: {
      desc: 'Where a deck starts and what happens when it ends.',
      autoNext: 'Play the next chapter automatically',
      autoNextHint: 'Off means each chapter stops at its end.',
      resume: 'Reopen where you stopped',
      resumeHint: 'Both which book and the second you stopped at.',
    },
    narration: {
      desc: 'The voice that reads a book aloud, chosen when the book is built.',
      language: 'Narration language',
      languageHint: "Detected from the book's own text. Forcing a language reads a Chinese book aloud in English.",
      followBook: 'Follow the book',
      alwaysEn: 'Always English',
      alwaysZh: 'Always Chinese',
      voiceEn: 'Voice · English',
      voiceEnHint: 'Used for books detected as English.',
      voiceZh: 'Voice · Chinese',
      voiceZhHint: 'A book keeps the voice it was built with; this applies to books added afterwards.',
      preview: 'Preview',
      stop: 'Stop',
      voiceGender: { male: 'male', female: 'female' },
      voiceStyle: {
        narration: 'narration', warm: 'warm', casual: 'casual', youth: 'youthful',
      },
      budgets: {
        quick: 'The rough idea',
        brief: 'The key points',
        solid: 'Really read it',
        full: 'Walk it all',
      },
    },
    search: {
      desc: 'Credentials stay in the main process; the player never holds one.',
      searchProvider: 'Web search',
      searchProviderHint: 'Search queries are sent to the selected provider. Fetching pages remains separate.',
      braveProvider: 'Brave Search',
      firecrawlProvider: 'Firecrawl · key optional',
      tavilyProvider: 'Tavily · API key',
      brave: 'Brave Search API Key',
      braveHint: 'Required when Brave is selected. An empty field reads BRAVE_SEARCH_API_KEY.',
      firecrawl: 'Firecrawl API Key',
      firecrawlHint: 'Optional. Without a key, Firecrawl uses its limited free tier. An empty field reads FIRECRAWL_API_KEY.',
      tavily: 'Tavily API Key',
      tavilyHint:
        'Used only when Tavily is selected. Left empty, the TAVILY_API_KEY environment variable is read.',
      getKey: 'Get a key ↗',
      showKey: 'Show key',
      hideKey: 'Hide key',
      savedKey: 'Saved — type to replace it',
      clearKey: 'Clear'
    },
    data: {
      trace: 'Record every model call',
      traceHint: "Writes the book's full text into the cache a second time (CAIRN_TRACE).",
      desc: 'Where generated books live, and what can be thrown away.',
      location: 'Where books and audio live',
      reveal: 'Reveal in Finder',
      cache: 'Pipeline cache',
      cacheHint: 'Clearing it means the model runs again on the next generation.',
      clear: 'Clear cache',
      clearing: 'Clearing…',
      confirm: 'Delete it?',
      confirmYes: 'Clear',
      confirmNo: 'Cancel',
      cleared: 'Cleared',
    },
    offline: 'Needs the desktop shell — run `bun run start`.',
  },
};

/**
 * Deliberately not `as const`: a literal type per string would make every
 * Chinese entry a type error against its English original, which is the exact
 * opposite of what this type is for. Widening to `string` still keeps the shape
 * — a missing or misspelled key fails, a different sentence does not.
 */
export type Messages = typeof en;
