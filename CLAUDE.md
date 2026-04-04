# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

English-to-Korean word gloss tool: a Tampermonkey userscript that displays Korean translations above English words on any webpage using `<ruby>` tags. Uses a 3-tier translation API fallback chain for reliability.

## Architecture

- **`tampermonkey.js`** — Tampermonkey userscript (v2.0). Walks the DOM for text nodes, extracts English words, batch-translates via API fallback chain, and replaces text nodes with `<ruby>` annotated elements using DocumentFragment. Caches translations in `localStorage` under key `tm_gloss_cache_v2`. Uses MutationObserver for dynamic content.
- **`docker-compose.yml`** — Runs LibreTranslate on port 5555 (maps to container port 5000), loads only `en,ko` language models. Used as optional offline fallback only.

## Translation API Fallback Chain

1. **Google Translate** (primary) — `translate.googleapis.com` unofficial API, best quality, no key needed
2. **Lingva Translate** (fallback) — `lingva.ml`, Google Translate proxy
3. **LibreTranslate** (offline) — `localhost:5555`, requires Docker

Auto-detected at startup via test translation of "hello".

## Key Implementation Details

- Words batched in chunks of 50, joined by `\n` for API requests
- DOM replacement uses `DocumentFragment` (not innerHTML) to prevent layout breakage
- Wrapper `<span data-kr-gloss>` uses `display: contents` to be layout-invisible
- Already-processed nodes skipped via `data-kr-gloss` attribute selector
- Skips tags: SCRIPT, STYLE, TEXTAREA, INPUT, CODE, PRE, KBD, SAMP, RT, RUBY, SVG, MATH, NOSCRIPT
- Word filter: 2-25 characters, English alphabet only
- Cache: localStorage with 20,000 entry limit and debounced saves
- `MutationObserver` with 500ms debounce for SPA/dynamic content

## Running

```bash
# Optional: Start LibreTranslate for offline fallback
docker compose up -d

# Test LibreTranslate API
curl -X POST http://localhost:5555/translate \
  -H "Content-Type: application/json" \
  -d '{"q":["hello"],"source":"en","target":"ko"}'
```

Install `tampermonkey.js` via Tampermonkey's "Create new script" in the browser.
