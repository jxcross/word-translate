// ==UserScript==
// @name         영단어번역: English → Korean Ruby (Word Gloss v2)
// @namespace    http://tampermonkey.net/
// @version      2.0
// @description  Show Korean gloss above English words using ruby tags (Google/Lingva/LibreTranslate)
// @match        *://*/*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @connect      translate.googleapis.com
// @connect      lingva.ml
// @connect      localhost
// @connect      127.0.0.1
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const CONFIG = {
    BATCH_SIZE: 50,
    CACHE_KEY: 'tm_gloss_cache_v2',
    CACHE_MAX_ENTRIES: 20000,
    MAX_WORD_LENGTH: 25,
    MIN_WORD_LENGTH: 2,
    SKIP_TAGS: new Set([
      'SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'CODE', 'PRE',
      'KBD', 'SAMP', 'RT', 'RUBY', 'SVG', 'MATH', 'NOSCRIPT',
    ]),
    PROCESSED_ATTR: 'data-kr-gloss',
    RT_SIZE_KEY: 'tm_gloss_rt_size',
    RT_SIZE_DEFAULT: 0.5,
    RT_SIZE_MIN: 0.3,
    RT_SIZE_MAX: 0.9,
    RT_SIZE_STEP: 0.05,
  };

  const API = { GOOGLE: 'google', LINGVA: 'lingva', LIBRE: 'libre' };

  let cache = loadCache();
  let activeAPI = null;
  let saveCacheTimer = null;
  let rtSize = parseFloat(localStorage.getItem(CONFIG.RT_SIZE_KEY)) || CONFIG.RT_SIZE_DEFAULT;

  function applyRtSize() {
    document.documentElement.style.setProperty('--kr-gloss-rt-size', rtSize + 'em');
    localStorage.setItem(CONFIG.RT_SIZE_KEY, rtSize);
  }

  GM_addStyle(`
    :root { --kr-gloss-rt-size: ${rtSize}em; }
    ruby { ruby-align: center; }
    rt {
      font-size: var(--kr-gloss-rt-size);
      color: #999;
      font-weight: normal;
      opacity: 0.85;
      user-select: none;
    }
    span[data-kr-gloss] {
      display: contents;
    }
    #kr-gloss-panel {
      position: fixed;
      bottom: 16px;
      right: 16px;
      z-index: 999999;
      background: #222;
      color: #fff;
      border-radius: 8px;
      padding: 6px 10px;
      font: 13px/1.4 sans-serif;
      display: flex;
      align-items: center;
      gap: 6px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
      opacity: 0.35;
      transition: opacity 0.2s;
      cursor: default;
    }
    #kr-gloss-panel:hover { opacity: 1; }
    #kr-gloss-panel button {
      background: #444;
      color: #fff;
      border: none;
      border-radius: 4px;
      width: 26px;
      height: 26px;
      font-size: 16px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    #kr-gloss-panel button:hover { background: #666; }
    #kr-gloss-panel .kr-size-label {
      min-width: 36px;
      text-align: center;
      font-size: 12px;
    }
  `);

  function createPanel() {
    const panel = document.createElement('div');
    panel.id = 'kr-gloss-panel';

    const label = document.createElement('span');
    label.textContent = '글';
    label.style.fontSize = '12px';

    const sizeLabel = document.createElement('span');
    sizeLabel.className = 'kr-size-label';
    sizeLabel.textContent = Math.round(rtSize * 100) + '%';

    const btnMinus = document.createElement('button');
    btnMinus.textContent = '−';
    btnMinus.title = '번역 글씨 축소';

    const btnPlus = document.createElement('button');
    btnPlus.textContent = '+';
    btnPlus.title = '번역 글씨 확대';

    function updateSize(delta) {
      rtSize = Math.round(Math.min(CONFIG.RT_SIZE_MAX, Math.max(CONFIG.RT_SIZE_MIN, rtSize + delta)) * 100) / 100;
      applyRtSize();
      sizeLabel.textContent = Math.round(rtSize * 100) + '%';
    }

    btnMinus.addEventListener('click', () => updateSize(-CONFIG.RT_SIZE_STEP));
    btnPlus.addEventListener('click', () => updateSize(CONFIG.RT_SIZE_STEP));

    panel.append(label, btnMinus, sizeLabel, btnPlus);
    document.body.appendChild(panel);
  }

  // ── Cache ──

  function loadCache() {
    try {
      return JSON.parse(localStorage.getItem(CONFIG.CACHE_KEY) || '{}');
    } catch {
      return {};
    }
  }

  function pruneCache() {
    const keys = Object.keys(cache);
    if (keys.length > CONFIG.CACHE_MAX_ENTRIES) {
      const toRemove = keys.slice(0, keys.length - CONFIG.CACHE_MAX_ENTRIES);
      for (const k of toRemove) delete cache[k];
    }
  }

  function saveCache() {
    try {
      pruneCache();
      localStorage.setItem(CONFIG.CACHE_KEY, JSON.stringify(cache));
    } catch (e) {
      console.warn('[KR-Gloss] Cache save failed:', e);
    }
  }

  function debouncedSaveCache() {
    clearTimeout(saveCacheTimer);
    saveCacheTimer = setTimeout(saveCache, 2000);
  }

  // ── Translation APIs ──

  function translateGoogle(words) {
    const text = words.join('\n');
    const url = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=ko&dt=t&q=' + encodeURIComponent(text);

    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url,
        timeout: 10000,
        onload(res) {
          try {
            const json = JSON.parse(res.responseText);
            const fullTranslation = json[0].map(seg => seg[0]).join('');
            const translations = fullTranslation.split('\n');
            const result = new Map();
            words.forEach((w, i) => {
              if (translations[i] && translations[i].trim()) {
                result.set(w, translations[i].trim());
              }
            });
            resolve(result);
          } catch (e) {
            reject(new Error('Google parse error: ' + e.message));
          }
        },
        onerror() { reject(new Error('Google network error')); },
        ontimeout() { reject(new Error('Google timeout')); },
      });
    });
  }

  function translateLingva(words) {
    const text = words.join('\n');
    const url = 'https://lingva.ml/api/v1/en/ko/' + encodeURIComponent(text);

    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url,
        timeout: 10000,
        onload(res) {
          try {
            const json = JSON.parse(res.responseText);
            const translations = json.translation.split('\n');
            const result = new Map();
            words.forEach((w, i) => {
              if (translations[i] && translations[i].trim()) {
                result.set(w, translations[i].trim());
              }
            });
            resolve(result);
          } catch (e) {
            reject(new Error('Lingva parse error: ' + e.message));
          }
        },
        onerror() { reject(new Error('Lingva network error')); },
        ontimeout() { reject(new Error('Lingva timeout')); },
      });
    });
  }

  function translateLibre(words) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'POST',
        url: 'http://localhost:5555/translate',
        headers: { 'Content-Type': 'application/json' },
        data: JSON.stringify({ q: words, source: 'en', target: 'ko', format: 'text' }),
        timeout: 15000,
        onload(res) {
          try {
            const json = JSON.parse(res.responseText);
            const translated = json.translatedText;
            const result = new Map();
            if (Array.isArray(translated)) {
              words.forEach((w, i) => { if (translated[i]) result.set(w, translated[i]); });
            } else if (typeof translated === 'string') {
              const parts = translated.split('\n');
              words.forEach((w, i) => { if (parts[i]) result.set(w, parts[i].trim()); });
            }
            resolve(result);
          } catch (e) {
            reject(new Error('Libre parse error: ' + e.message));
          }
        },
        onerror() { reject(new Error('Libre network error')); },
        ontimeout() { reject(new Error('Libre timeout')); },
      });
    });
  }

  // ── API Detection & Dispatch ──

  async function detectAPI() {
    for (const [name, fn] of [[API.GOOGLE, translateGoogle], [API.LINGVA, translateLingva], [API.LIBRE, translateLibre]]) {
      try {
        const test = await fn(['hello']);
        if (test.size > 0) {
          activeAPI = name;
          return;
        }
      } catch { /* try next */ }
    }
    console.error('[KR-Gloss] No translation API available');
  }

  const TRANSLATORS = {
    [API.GOOGLE]: translateGoogle,
    [API.LINGVA]: translateLingva,
    [API.LIBRE]: translateLibre,
  };

  async function translateBatch(words) {
    const order = [API.GOOGLE, API.LINGVA, API.LIBRE];
    if (activeAPI) {
      order.splice(order.indexOf(activeAPI), 1);
      order.unshift(activeAPI);
    }

    for (const api of order) {
      try {
        return await TRANSLATORS[api](words);
      } catch (e) {
        console.warn('[KR-Gloss] ' + api + ' failed:', e.message);
      }
    }

    console.error('[KR-Gloss] All APIs failed for batch');
    return new Map();
  }

  // ── Word Collection ──

  function collectUncachedWords(root) {
    root = root || document.body;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const words = new Set();
    let node;

    while ((node = walker.nextNode())) {
      const parent = node.parentElement;
      if (!parent || parent.closest('[' + CONFIG.PROCESSED_ATTR + ']')) continue;
      if (CONFIG.SKIP_TAGS.has(parent.tagName)) continue;

      const matches = node.nodeValue.match(/[A-Za-z][A-Za-z'-]*/g);
      if (!matches) continue;

      for (const w of matches) {
        const n = w.toLowerCase();
        if (n.length < CONFIG.MIN_WORD_LENGTH || n.length > CONFIG.MAX_WORD_LENGTH) continue;
        if (!cache[n]) words.add(n);
      }
    }

    return Array.from(words);
  }

  // ── Batch Orchestration ──

  async function translateAllWords(words) {
    for (let i = 0; i < words.length; i += CONFIG.BATCH_SIZE) {
      const chunk = words.slice(i, i + CONFIG.BATCH_SIZE);
      const results = await translateBatch(chunk);
      for (const [word, translation] of results) {
        cache[word] = translation;
      }
    }
    debouncedSaveCache();
  }

  // ── DOM Replacement ──

  function replaceTextNode(textNode) {
    const text = textNode.nodeValue;
    if (!text || !text.trim()) return;

    const segments = text.split(/([A-Za-z][A-Za-z'-]*)/);

    let hasAnyTranslation = false;
    for (let i = 1; i < segments.length; i += 2) {
      const n = segments[i].toLowerCase();
      if (cache[n]) { hasAnyTranslation = true; break; }
    }
    if (!hasAnyTranslation) return;

    const fragment = document.createDocumentFragment();

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      if (!seg) continue;

      if (i % 2 === 0) {
        fragment.appendChild(document.createTextNode(seg));
      } else {
        const n = seg.toLowerCase();
        const ko = cache[n];
        if (ko && ko !== n && ko !== seg) {
          const ruby = document.createElement('ruby');
          ruby.appendChild(document.createTextNode(seg));
          const rt = document.createElement('rt');
          rt.textContent = ko;
          ruby.appendChild(rt);
          fragment.appendChild(ruby);
        } else {
          fragment.appendChild(document.createTextNode(seg));
        }
      }
    }

    const wrapper = document.createElement('span');
    wrapper.setAttribute(CONFIG.PROCESSED_ATTR, '');
    wrapper.style.cssText = 'all: unset; display: contents;';
    wrapper.appendChild(fragment);
    textNode.parentNode.replaceChild(wrapper, textNode);
  }

  function applyTranslations(root) {
    root = root || document.body;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const textNodes = [];
    let node;

    while ((node = walker.nextNode())) {
      const parent = node.parentElement;
      if (!parent || parent.closest('[' + CONFIG.PROCESSED_ATTR + ']')) continue;
      if (CONFIG.SKIP_TAGS.has(parent.tagName)) continue;
      textNodes.push(node);
    }

    for (const tn of textNodes) {
      replaceTextNode(tn);
    }
  }

  // ── MutationObserver ──

  function observeDOM() {
    let timer = null;
    const observer = new MutationObserver((mutations) => {
      const addedNodes = [];
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE && !node.closest('[' + CONFIG.PROCESSED_ATTR + ']')) {
            addedNodes.push(node);
          }
        }
      }
      if (addedNodes.length === 0) return;

      clearTimeout(timer);
      timer = setTimeout(() => processNodes(addedNodes), 500);
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }

  async function processNodes(nodes) {
    const allWords = new Set();
    for (const node of nodes) {
      if (!node.isConnected) continue;
      for (const w of collectUncachedWords(node)) {
        allWords.add(w);
      }
    }

    if (allWords.size > 0) {
      await translateAllWords(Array.from(allWords));
    }

    for (const node of nodes) {
      if (node.isConnected) {
        applyTranslations(node);
      }
    }
  }

  // ── Main ──

  async function run() {
    console.log('[KR-Gloss] Starting v2.0');

    await detectAPI();
    if (!activeAPI) {
      console.error('[KR-Gloss] No API available, aborting');
      return;
    }
    console.log('[KR-Gloss] Using ' + activeAPI + ' API');

    const words = collectUncachedWords();
    console.log('[KR-Gloss] Found ' + words.length + ' uncached words');

    if (words.length > 0) {
      await translateAllWords(words);
    }

    applyTranslations();
    observeDOM();
    createPanel();

    console.log('[KR-Gloss] Ready');
  }

  run().catch(e => console.error('[KR-Gloss] Fatal error:', e));
})();
