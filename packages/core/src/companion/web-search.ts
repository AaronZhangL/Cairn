export interface SearchResult {
  readonly title: string;
  readonly url: string;
  readonly snippet: string;
}

export interface WebSearch {
  search(query: string, signal?: AbortSignal): Promise<readonly SearchResult[]>;
}
