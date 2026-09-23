# nanobot web search and fetch

Checked against HKUDS/nanobot `main` at commit [`ecf6519`](https://github.com/HKUDS/nanobot/tree/ecf6519ef1fc1f8af30d593ebbcc6f6b15a28c52) on 2026-09-23. This is a snapshot of upstream behavior, not a guarantee for older installed releases.

## Why no Tavily key was needed

- Both built-in web tools are enabled by default. The default `tools.web.search.provider` is `duckduckgo`, with five results; DuckDuckGo search uses the `ddgs` package and needs no API key. [Configuration guide](https://github.com/HKUDS/nanobot/blob/ecf6519ef1fc1f8af30d593ebbcc6f6b15a28c52/docs/guides/configure-web-search.md), [config and implementation](https://github.com/HKUDS/nanobot/blob/ecf6519ef1fc1f8af30d593ebbcc6f6b15a28c52/nanobot/agent/tools/web.py#L47-L84), [DuckDuckGo implementation](https://github.com/HKUDS/nanobot/blob/ecf6519ef1fc1f8af30d593ebbcc6f6b15a28c52/nanobot/agent/tools/web.py#L1024-L1050).
- Tavily is only an optional search provider. If selected, nanobot reads `tools.web.search.apiKey` or `TAVILY_API_KEY`; when both are absent, its Tavily branch falls back to DuckDuckGo. An actual Tavily HTTP failure returns an error rather than falling back. [Provider dispatch and credential selection](https://github.com/HKUDS/nanobot/blob/ecf6519ef1fc1f8af30d593ebbcc6f6b15a28c52/nanobot/agent/tools/web.py#L477-L526), [Tavily branch](https://github.com/HKUDS/nanobot/blob/ecf6519ef1fc1f8af30d593ebbcc6f6b15a28c52/nanobot/agent/tools/web.py#L633-L650).
- Other selectable providers include Brave, SearXNG, Jina, Kagi, Exa, Olostep, Bocha, Volcengine, KeenAble, AnySearch, and Serper. Credentials and availability differ by provider; the simplest keyless configuration is the default DuckDuckGo. [Provider list](https://github.com/HKUDS/nanobot/blob/ecf6519ef1fc1f8af30d593ebbcc6f6b15a28c52/nanobot/agent/tools/web.py#L47-L60), [configuration reference](https://github.com/HKUDS/nanobot/blob/ecf6519ef1fc1f8af30d593ebbcc6f6b15a28c52/docs/configuration.md).

Minimal explicit configuration, though it is not needed to use the defaults:

```json
{
  "tools": {
    "web": {
      "enable": true,
      "search": { "provider": "duckduckgo" }
    }
  }
}
```

The WebUI exposes this under Settings → Web, or it can be set in `~/.nanobot/config.json`. [Setup guide](https://github.com/HKUDS/nanobot/blob/ecf6519ef1fc1f8af30d593ebbcc6f6b15a28c52/docs/guides/configure-web-search.md).

## Fetch is independent of search credentials

`web_fetch` takes a URL, validates it against an SSRF guard, and extracts readable content; it does not use the Tavily key. Its default `useJinaReader: true` first tries the hosted Jina Reader and falls back to local `readability-lxml` conversion if that fails. `JINA_API_KEY` is attached only if present, so it is not required for the fetch path. [Fetch implementation](https://github.com/HKUDS/nanobot/blob/ecf6519ef1fc1f8af30d593ebbcc6f6b15a28c52/nanobot/agent/tools/web.py#L1118-L1270), [configuration reference](https://github.com/HKUDS/nanobot/blob/ecf6519ef1fc1f8af30d593ebbcc6f6b15a28c52/docs/configuration.md).

Privacy implication: the default hosted reader receives the fetched URL. nanobot routes URLs with recognizable credentials to local extraction, but cannot detect every secret in a path. Set `tools.web.fetch.useJinaReader` to `false` to keep conversion local. This still downloads the page from its source. [Configuration warning](https://github.com/HKUDS/nanobot/blob/ecf6519ef1fc1f8af30d593ebbcc6f6b15a28c52/docs/configuration.md), [reader selection](https://github.com/HKUDS/nanobot/blob/ecf6519ef1fc1f8af30d593ebbcc6f6b15a28c52/nanobot/agent/tools/web.py#L1212-L1237).
