# word-translate
# 📘 English → Korean Word Gloss (Tampermonkey)

## 🎯 목적

웹 페이지(ebook 포함)의 **영어 단어 위에 한국어 번역을 작게 표시(ruby)** 하여 읽기 보조 도구로 사용합니다.

---

## 🏗️ 전체 구조

```
웹페이지
   ↓
Tampermonkey (단어 추출 + DOM 변환)
   ↓
번역 API (자동 감지 + fallback)
  1순위: Google Translate (최고 품질)
  2순위: Lingva Translate (Google 프록시)
  3순위: LibreTranslate (로컬 Docker)
   ↓
번역 결과 캐시(localStorage)
   ↓
<ruby>영어<rt>한국어</rt></ruby>
```

---

## ⚙️ 요구사항

* Tampermonkey (Chrome / Edge 확장)
* Docker (선택 — LibreTranslate 오프라인 fallback용)

---

## 🚀 설치

### 1. Tampermonkey 스크립트 설치

1. Tampermonkey 열기
2. "Create new script"
3. `tampermonkey.js` 내용 붙여넣기
4. 저장

### 2. (선택) LibreTranslate Docker 실행

오프라인 fallback이 필요한 경우에만:

```bash
docker compose up -d
```

---

## ▶️ 실행 방법

* 영어 문장이 있는 웹페이지 접속
* 자동으로 단어 위에 번역 표시됨

예:

```
hello
  안녕
```

---

## ⚡ 동작 방식

1. 페이지에서 텍스트 노드 추출
2. 영어 단어만 필터링 (2~25자)
3. 중복 제거
4. 캐시에 없는 단어만 50개씩 배치 API 요청
5. 번역 결과 localStorage 캐시 저장
6. DOM을 `<ruby>` 형태로 변경 (DocumentFragment 사용)
7. MutationObserver로 동적 콘텐츠 자동 감지 + 번역

---

## 🔄 번역 API Fallback

| 순위 | API | 품질 | 요구사항 |
|------|-----|------|----------|
| 1 | Google Translate | 최고 | 없음 (무료) |
| 2 | Lingva Translate | 높음 | 없음 (무료) |
| 3 | LibreTranslate | 보통 | Docker 실행 |

시작 시 "hello" 테스트 번역으로 자동 감지합니다.

---

## 🧠 캐싱 전략

* `localStorage` 사용 (키: `tm_gloss_cache_v2`)
* 동일 단어 재번역 방지
* 최대 20,000개 엔트리 관리
* 디바운스된 저장 (성능 최적화)

---

## ⚠️ 주의사항

### 1. HTTPS 문제

일부 사이트에서 LibreTranslate(`http://localhost`) 호출이 차단될 수 있음.
→ Google/Lingva API는 HTTPS이므로 이 문제 없음.

### 2. 번역 품질

* 단어 단위 번역은 문맥이 없어 의미가 부정확할 수 있음
* 예: "right" → 오른쪽 / 맞다

### 3. 성능

* 첫 로딩 시 번역 시간 발생
* 이후 캐시로 빠르게 동작

---

## 🧪 디버깅

브라우저 콘솔 확인 (`F12 → Console`):

```
[KR-Gloss] Starting v2.0
[KR-Gloss] Using google API
[KR-Gloss] Found 150 uncached words
[KR-Gloss] Ready
```

---

## 📈 개선 아이디어

* 폰트 크기 조절 UI
* 레벨 필터 (초급/중급/고급)
* hover 시만 표시
* 발음(TTS) 추가
* 문장 번역 병행

---

## 🙌 참고

* LibreTranslate: [https://github.com/LibreTranslate/LibreTranslate](https://github.com/LibreTranslate/LibreTranslate)
* Tampermonkey: [https://www.tampermonkey.net/](https://www.tampermonkey.net/)
* Lingva Translate: [https://github.com/thedaviddelta/lingva-translate](https://github.com/thedaviddelta/lingva-translate)
