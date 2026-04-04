// ==UserScript==
// @name         영단어번역: English → Korean Ruby (Word Gloss v2)
// @namespace    http://tampermonkey.net/
// @version      2.1
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
    BATCH_SIZE: 10,
    CACHE_KEY: 'tm_gloss_cache_v3',
    CACHE_MAX_ENTRIES: 20000,
    MAX_WORD_LENGTH: 25,
    MIN_WORD_LENGTH: 2,
    SKIP_TAGS: new Set([
      'SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'CODE', 'PRE',
      'KBD', 'SAMP', 'RT', 'RUBY', 'SVG', 'MATH', 'NOSCRIPT',
    ]),
    PROCESSED_ATTR: 'data-kr-gloss',
    RT_SIZE_KEY: 'tm_gloss_rt_size',
    RT_SIZE_DEFAULT: 8,
    RT_SIZE_MIN: 4,
    RT_SIZE_MAX: 20,
    RT_SIZE_STEP: 1,
    RT_COLOR_KEY: 'tm_gloss_rt_color',
    RT_COLOR_DEFAULT: '#999999',
    RT_BG_KEY: 'tm_gloss_rt_bg',
    RT_BG_DEFAULT: 'transparent',
    RT_BG_OPACITY_KEY: 'tm_gloss_rt_bg_opacity',
    RT_BG_OPACITY_DEFAULT: 100,
    LEVEL_KEY: 'tm_gloss_level',
    POS_KEY: 'tm_gloss_pos',
  };

  // ── Word Frequency Tiers ──
  // TIER1: ~500 most basic function words & common words (skip at 중급+)
  // TIER2: ~1000 common everyday words (skip at 고급+)
  // TIER3: ~1500 regular vocabulary (skip at 전문가)

  const TIER1 = new Set(('the a an is are was were be been being have has had do does did will would shall should ' +
    'may might can could must need to of in for on with at by from up about into through during before after ' +
    'above below between out off over under again further then once here there when where why how all both ' +
    'each few more most other some such no nor not only own same so than too very just also now and but or ' +
    'if because although while since until unless as though whether yet me my we us our you your he him his ' +
    'she her it its they them their what which who whom this that these those am go get make know think take ' +
    'see come want look use find give tell work call try ask put keep let begin seem help show hear play run ' +
    'move live believe bring happen write provide sit stand lose pay meet include continue set learn change ' +
    'lead understand watch follow stop create speak read allow add spend grow open walk win offer remember ' +
    'love consider appear buy wait serve die send expect build stay fall cut reach kill remain say said ' +
    'going got good great back new first last long little big old high small large right left many much ' +
    'well still even way thing man men woman women child children people time year day world life hand part ' +
    'place case point group company end number fact eye head side house water room mother father family ' +
    'line name city home state area school turn away never always something another able being every down ' +
    'been own made really two three four five six seven eight nine ten hundred thousand million ' +
    'next after door best better during idea interest late open close hard start face important already ' +
    'between different early enough far however less power almost problem result second young').split(' '));

  const TIER2 = new Set(('accept across actually age ago agree air along already although among amount animal ' +
    'answer anyone anything arm army art attention bad bank base bear beat beautiful bed behind beyond bill bit ' +
    'black blood blue board body bone book born break brother build business buy car care carry catch cause ' +
    'center century certain chair chance character charge check choice church class clean clear cold college ' +
    'color common community concern condition control cook cool corner cost couple course cover cross cup ' +
    'current cut dark data daughter dead deal death decide deep degree describe design detail develop development ' +
    'difference difficult dinner direction discover discuss disease doctor dog draw dream dress drink drive drop ' +
    'eat edge education effect effort election energy enjoy entire environment especially evening event ' +
    'evidence exactly example experience explain fail family fast feeling field fight figure fill final ' +
    'finally financial finger finish fire floor fly food foot force foreign forget form former forward free ' +
    'friend front full future game garden general girl glass goal green ground growth guess gun guy hair half ' +
    'hang happy hat heart heat heavy herself himself history hit hold hope hot hotel hour human husband image ' +
    'impact indeed indicate industry information inside instead involve island issue item job join key kid ' +
    'kind kitchen knowledge land language laugh law lawyer lay lead learn letter level lie light likely list ' +
    'listen live local lot machine magazine main maintain major manage market material matter maybe measure ' +
    'media medical meeting memory mention method middle might military mind minute miss model modern moment ' +
    'money month morning mouth move movement Mr Mrs much music myself nation national natural nature near ' +
    'necessary network news newspaper night none north note nothing notice now offer office officer oh oil ' +
    'once one operation opportunity option order organization outside page paint paper parent particularly ' +
    'partner party pass past patient pattern peace per perform perhaps period person phone physical pick ' +
    'picture piece plan plant player please point police policy political poor popular population position ' +
    'possible practice prepare present president pressure pretty private process produce product production ' +
    'professional professor program project property protect prove public pull purpose push quality question ' +
    'quickly quite range rate rather reach ready real reality realize reason receive recent recently record ' +
    'red reduce reflect region relate relationship religious remain remember remove report represent require ' +
    'research resource respond response rest return reveal right risk road rock role rule safe scene science ' +
    'scientist score season seat section security seek sell senior sense series serious serve service several ' +
    'shake share she shoot short shot shoulder sign significant similar simple simply single sister sit site ' +
    'situation six size skill skin smile society soldier son song soon sort sound source south southern space ' +
    'speak special specific speech sport spring staff stage standard star statement station story strategy ' +
    'street strong structure student study stuff style subject success successful suddenly suffer suggest ' +
    'summer support sure surface system table talk task tax teach teacher team technology test thank theory ' +
    'thing those thought thousand threat throughout throw thus today together tonight top total tough toward ' +
    'town trade traditional training travel treat treatment tree trial trip trouble true truth TV type ' +
    'unit upon usually value various view violence visit voice vote wall war watch week weight west western ' +
    'whatever white whole whose wide wife window wish within without wonder worker wrong yard yeah yes ' +
    'yesterday').split(' '));

  const TIER3 = new Set(('abandon abstract academic accomplish accurate accuse acknowledge acquire adapt adequate ' +
    'adjust administration administrator adolescent adopt advanced adventure advertising advocate affordable ' +
    'aggregate aide aircraft alcohol allegation alliance alter alternative ambitious amendment analyst anchor ' +
    'annual anticipate anxiety apparent appeal appetite appliance applicable appoint appreciation approach ' +
    'appropriate approval arena argue arrangement array articulate assault assert assessment asset assign ' +
    'assistance associate assumption atmosphere attach attain attorney attribute auction audience authority ' +
    'automobile awareness barrier battery bedroom behavioral beloved benchmark beneath beneficial besides bias ' +
    'bind bitter blade blanket blend bless boom bounce boundary bracket brave breakdown breed brilliant broad ' +
    'broken broker browser buck buddy budget burden bureau cabinet calculate campaign capability capture carbon ' +
    'cargo catalog category caution cellular champion championship chronic chunk circuit circumstance cite ' +
    'civilian clarity classify clerk clinical cluster coalition cognitive collaboration collective column combat ' +
    'comedy comfort command commander comment commercial commission commit committee communicate comparison ' +
    'compensation compete complaint complement complex complicate component comprehensive compromise compute ' +
    'concentration concept conclude concrete conduct conference confidence confirm confront confusion congress ' +
    'connect connection consciousness consensus consequence conservative consideration consist consistent ' +
    'conspiracy constant constitute construct consultant consumption contact contemporary content contest ' +
    'context contract contrast contribute controversial controversy convention conventional conversation ' +
    'convert conviction cooperate coordinate cope core corporate correct correspond correspondent counsel ' +
    'counter coverage craft crash creation creative creature credit crew crime criminal crisis criteria critic ' +
    'critical crop crucial cultivate cultural currency curriculum custom cycle dairy database deadline dealer ' +
    'debate decade decent deck declaration decline deficit define definition deliberate deliver democracy ' +
    'demonstrate density depart dependent deploy depression deputy derive desktop desperate despite detect ' +
    'determination device devote dialogue differ dimension diminish diplomat disability disagree disaster ' +
    'discipline disclosure discount discourse discrimination disorder display dispute disrupt dissolve distant ' +
    'distinct distinction distinguish distribute distribution district diverse diversity documentary domain ' +
    'domestic dominant dominate donation donor doubt draft dramatic drift duration dynamic eager earnings echo ' +
    'economics editorial effectively efficiency efficient elaborate elderly elect electronic element eliminate ' +
    'elite elsewhere embrace emerge emission emotional emphasis empire employ encounter encourage endorse enemy ' +
    'enforcement engage engine engineer enhance enormous enterprise entertainment enthusiasm entity entrance ' +
    'entrepreneur envelope equation era erect erosion error escape essay essential establishment estate ethics ' +
    'evaluate evolve examination exceed exception excessive exchange exclude exclusive execute executive ' +
    'exercise exhibit existence expand expansion expectation expedition expense expertise explosion export ' +
    'expose exposure extend extensive extent external extract extraordinary extreme facility faculty fame ' +
    'fantasy fatal favorable feature federal feedback fence fiction fierce fifth filing fleet flesh flexibility ' +
    'float folk footage forecast formula forth fortune foundation founder fraction framework franchise fraud ' +
    'frequency frequent freshman frustrate fuel fulfill fundamental funeral furniture furthermore galaxy gang ' +
    'gap gear gender generate generation genetic genius genre genuine gesture giant given glad glimpse globe ' +
    'golf gorgeous govern governor grab grace grade graduate grain graphic grasp gravity grocery gross guarantee ' +
    'guardian guideline guilt habitat handful handle harbor hardware harsh harvest headline headquarters heal ' +
    'helpful heritage highlight highway hint hire historian historic holy homework horizon horror host hostile ' +
    'household housing humor hunting hypothesis identical identify ideology illustration immigrant immigration ' +
    'immune implement implication impose impressive incentive incident inclined incorporate incredible index ' +
    'indication indicator inevitable inflation influence infrastructure initial initiative injury innovation ' +
    'input inquiry insert insight inspection inspector inspiration install instance institutional instruction ' +
    'instructor instrument insurance intellectual intense intention interaction interfere interior internal ' +
    'interpretation intervention intimate introduce invasion investigate investigation investor invisible ' +
    'invitation isolation journal journalist judgment junior jurisdiction jury justify keen landscape laser ' +
    'launch lawn leadership lean lecture legacy legend legislation legitimate leisure liberal license lifestyle ' +
    'lifetime likewise limitation lineup link literacy literary literature locate logic longtime loyalty luxury ' +
    'mainstream majority mandate manufacture margin mask massive mature meanwhile mechanism mental mercy merely ' +
    'merit metaphor migration mineral minimal minister minor minority miracle mission mixed mixture moderate ' +
    'modification molecule monitor monopoly monument moral moreover mortgage motivation mount multiple murder ' +
    'muscle mutual mystery myth narrative nasty negotiate negotiation nerve nightmare noble nomination ' +
    'nonetheless norm notable notion novel nuclear numerous nutrition objection obligation observation obstacle ' +
    'occasional occupation odds offensive offensive ongoing opponent optical organic orientation origin overall ' +
    'overcome overlook overwhelming ownership oxygen pace pack panel panic parallel parameter parking partially ' +
    'participation partly passage passenger passion passive patch patience peak peer penalty penetrate pension ' +
    'perceive percentage perception permanent permission permit persist perspective petition phenomenon phrase ' +
    'pile pine pioneer pitch planet platform plead pledge plot plunge pole poll pollution portrait portray pose ' +
    'possession postpone potential poverty precise predict predominantly preference pregnancy prejudice premium ' +
    'prescription presence preserve presidential previously primarily primary prime principal principle prior ' +
    'priority prisoner privacy privilege probe proceed profile profound progressive prohibit prominent promise ' +
    'promote prompt proportion proposal propose prospect protein provision psychological publication pursue ' +
    'puzzle qualify quote racial radiation radical random ranking rapid ratio raw reaction reader realistic ' +
    'recognition recommendation recovery recruit reform refugee regime regulate regulation reinforce reject ' +
    'relief reluctant remarkable remedy render renovation repair repeat replacement republic reputation rescue ' +
    'resemble reservation residence resign resistance resolution resolve resort respective restore restriction ' +
    'retail retain retire revelation revenue reverse review revolution rhetoric rid rifle rival robust romance ' +
    'rope rotation rough routine royal ruling rumor rural sacrifice sake sanction satellite satisfaction ' +
    'scenario scholar scholarship scope scream sculpture secondary segment seize sensation sequence settle ' +
    'severe shadow shadow shed shelter shift shine shortage shrink signal significance silence similarly sink ' +
    'skeptic slice slot snap solely solid somewhat sophisticated soul sovereignty span spark specify spectrum ' +
    'spiritual spokesman stability stake stance statistical steady stem stereotype stimulus stir strain strand ' +
    'strategic strengthen strip stroke structural struggle submission subsequent substance substantial suburb ' +
    'successive sue suit summit supplement supreme surgery surplus surrender surrounding survey survival ' +
    'suspect suspend suspicion sustain swear sweep swim swing switch symbol syndrome tackle tale tank tap target ' +
    'teenage temple temporarily tenant tendency tender tenure terror textile theme thereby thesis thorough ' +
    'tobacco tolerance toll tone tourism tournament trace track tradition trait transaction transform transit ' +
    'transition transmission tremendous trend tribe trigger trim triumph troop tropical tunnel twist ultimate ' +
    'undergo undergo undermine undertake unemployment unfair uniform unique unity universal universe unknown ' +
    'unlikely unprecedented update upper upset urban urge utility utilize vacation valid valley valuable ' +
    'variation vast venture version versus veteran video viewer violation virtual virtue visible vision visual ' +
    'vital vocal volume voluntary vulnerable wage wander warehouse warrant weakness wealth weapon welfare wheat ' +
    'when whereas widely widespread willing wing wire witness workforce workshop worthy wrap yield zone').split(' '));

  const LEVELS = [
    { id: 'beginner',  label: '초급', desc: '전체 번역', skipTiers: [] },
    { id: 'intermediate', label: '중급', desc: '기본 단어 스킵', skipTiers: [TIER1] },
    { id: 'advanced',  label: '고급', desc: '일상 단어 스킵', skipTiers: [TIER1, TIER2] },
    { id: 'expert',    label: '전문가', desc: '희귀 단어만', skipTiers: [TIER1, TIER2, TIER3] },
  ];

  // ── POS (Part of Speech) Data ──

  const NOUN_DICT = new Set(('time year people way day man woman child world life hand part place case week ' +
    'company system program question government number night point home water room mother area money story ' +
    'fact month lot study book eye job word business issue side kind head house service friend father power ' +
    'hour game line end member law car city community name president team minute idea body information back ' +
    'parent face level office door health person art war history party result morning reason research girl ' +
    'guy moment air teacher force education food son field music plan paper market table class heart center ' +
    'street figure model road role letter film form student land river fish picture product fire animal ' +
    'island project bank sign stage position state college boy girl brother sister wife husband daughter ' +
    'kitchen window street garden summer winter spring church doctor nurse baby dog cat bird tree stone ' +
    'bridge mountain ocean lake forest desert sky sun moon star cloud rain snow wind flower grass seed fruit ' +
    'wood metal glass stone wall floor roof bed chair corner shop store farm town village street path hill ' +
    'valley season weather degree angle circle shape color sound voice noise music song poem story movie ' +
    'screen phone camera computer keyboard mouse button page file folder message email photo video image text ' +
    'data code software website blog post comment link user account password address network server database ' +
    'cloud platform device tool machine engine battery wheel frame screen board card box bag cup bottle glass ' +
    'plate bowl knife fork spoon dish meal breakfast lunch dinner restaurant kitchen recipe diet sugar salt ' +
    'oil butter bread rice milk cheese meat chicken beef pork fish egg cream sauce soup salad cake pie coffee ' +
    'tea juice beer wine bottle cap hat shirt dress coat jacket pants shoe boot ring watch clock key lock ' +
    'door gate fence wall tower flag map ticket price cost budget profit loss debt loan tax fee bill receipt ' +
    'contract agreement policy rule standard method approach strategy goal target audience client customer ' +
    'partner employee manager director leader chief expert agent victim witness crowd audience generation ' +
    'version structure feature aspect element factor component layer section segment module unit block chunk ' +
    'pattern trend cycle phase stage step process task activity event session episode chapter scene act').split(' '));

  const VERB_DICT = new Set(('be have do say go get make know think take see come want look use find give tell ' +
    'work call try ask need feel become leave put mean keep let begin seem help show hear play run move live ' +
    'believe bring happen write provide sit stand lose pay meet include continue set learn change lead ' +
    'understand watch follow stop create speak read allow add spend grow open walk win offer remember love ' +
    'consider appear buy wait serve die send expect build stay fall cut reach kill remain suggest raise pass ' +
    'sell require report decide pull develop hold carry break agree support miss pick wear choose receive ' +
    'determine produce seek draw fight throw manage fill deal wish drop push apply improve enjoy drive teach ' +
    'accept hang recognize join close form ring describe prepare protect prove catch handle treat avoid ' +
    'imagine prevent express reduce establish face claim identify lay cry share involve cover achieve attack ' +
    'fix grab belong deliver stick explain mention exist define bear replace sleep finish appreciate promise ' +
    'refuse collect relieve depend lift remove reveal represent argue contain assume reflect hope wonder ' +
    'indicate relate connect contribute announce maintain emerge divide warn adopt compete expand perform ' +
    'respond confirm operate invest press display generate complete adjust approve publish conduct demand ' +
    'enable negotiate obtain survive engage observe encourage strengthen participate organize preserve restore ' +
    'qualify eliminate communicate celebrate estimate consult possess convince commit transform select compare ' +
    'launch register complain assess extend acquire absorb remind restrict gather combine separate calculate ' +
    'distribute recruit sponsor investigate evaluate analyze inspect enforce measure monitor resign rescue ' +
    'assemble accumulate allocate adapt abandon accomplish enforce inherit prohibit stimulate motivate donate ' +
    'illustrate guarantee withdraw drag breathe dare satisfy fold bend shake twist stretch spread pour stir ' +
    'mix bake roast boil freeze melt burn glow shine flash spin float sink dive climb crawl slide slip trip ' +
    'rush hurry chase grab tap knock ring whisper shout scream sing hum chew swallow sip bite lick smell ' +
    'taste touch rub scratch dig plant harvest sew weave paint carve mold shape trim polish wrap pack load ' +
    'store stack arrange sort label mark stamp print scan copy paste delete edit save upload download install ' +
    'update upgrade reset restart launch deploy configure assign delegate schedule cancel postpone approve ' +
    'reject deny grant revoke suspend resume terminate conclude').split(' '));

  const POS_FILTERS = [
    { id: 'all',  label: 'ALL' },
    { id: 'noun', label: '명사' },
    { id: 'verb', label: '동사' },
  ];

  function classifyPOS(word) {
    if (NOUN_DICT.has(word)) return 'noun';
    if (VERB_DICT.has(word)) return 'verb';
    if (/(?:tion|sion|ment|ness|ity|ance|ence|ism|ist|ship|dom|hood|logy|graphy)$/.test(word)) return 'noun';
    if (/(?:ize|ise|ify|ate)$/.test(word)) return 'verb';
    return 'other';
  }

  const API = { GOOGLE: 'google', LINGVA: 'lingva', LIBRE: 'libre' };

  let cache = loadCache();
  let activeAPI = null;
  let saveCacheTimer = null;
  let rtSize = parseInt(localStorage.getItem(CONFIG.RT_SIZE_KEY)) || CONFIG.RT_SIZE_DEFAULT;
  let rtColor = localStorage.getItem(CONFIG.RT_COLOR_KEY) || CONFIG.RT_COLOR_DEFAULT;
  let rtBg = localStorage.getItem(CONFIG.RT_BG_KEY) || CONFIG.RT_BG_DEFAULT;
  let rtBgOpacity = parseInt(localStorage.getItem(CONFIG.RT_BG_OPACITY_KEY)) ?? CONFIG.RT_BG_OPACITY_DEFAULT;
  let currentLevel = parseInt(localStorage.getItem(CONFIG.LEVEL_KEY)) || 0;
  let currentPOS = parseInt(localStorage.getItem(CONFIG.POS_KEY)) || 0;

  function shouldSkipWord(word) {
    const tiers = LEVELS[currentLevel].skipTiers;
    for (const tier of tiers) {
      if (tier.has(word)) return true;
    }
    if (currentPOS > 0) {
      const posId = POS_FILTERS[currentPOS].id;
      if (classifyPOS(word) !== posId) return true;
    }
    return false;
  }

  function applyRtSize() {
    document.documentElement.style.setProperty('--kr-gloss-rt-size', rtSize + 'px');
    localStorage.setItem(CONFIG.RT_SIZE_KEY, rtSize);
  }

  function applyRtColor() {
    document.documentElement.style.setProperty('--kr-gloss-rt-color', rtColor);
    localStorage.setItem(CONFIG.RT_COLOR_KEY, rtColor);
  }

  function hexToRgba(hex, opacity) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + (opacity / 100) + ')';
  }

  function applyRtBg() {
    const val = (rtBg === 'transparent' || !rtBg) ? 'transparent' : hexToRgba(rtBg, rtBgOpacity);
    document.documentElement.style.setProperty('--kr-gloss-rt-bg', val);
    localStorage.setItem(CONFIG.RT_BG_KEY, rtBg);
    localStorage.setItem(CONFIG.RT_BG_OPACITY_KEY, rtBgOpacity);
  }

  GM_addStyle(`
    :root {
      --kr-gloss-rt-size: ${rtSize}px;
      --kr-gloss-rt-color: ${rtColor};
      --kr-gloss-rt-bg: ${rtBg === 'transparent' ? 'transparent' : 'rgba(' + parseInt(rtBg.slice(1,3),16) + ',' + parseInt(rtBg.slice(3,5),16) + ',' + parseInt(rtBg.slice(5,7),16) + ',' + (rtBgOpacity/100) + ')'};
    }
    ruby { ruby-align: center; }
    .kr-gloss-block { line-height: 2.2 !important; }
    h1.kr-gloss-block, h2.kr-gloss-block, h3.kr-gloss-block,
    h4.kr-gloss-block, h5.kr-gloss-block, h6.kr-gloss-block {
      line-height: 1.4 !important;
    }
    rt {
      font-size: var(--kr-gloss-rt-size) !important;
      color: var(--kr-gloss-rt-color) !important;
      background: var(--kr-gloss-rt-bg) !important;
      border-radius: 2px;
      font-weight: normal;
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
    #kr-gloss-panel .kr-divider {
      width: 1px;
      height: 18px;
      background: #555;
      margin: 0 2px;
    }
    #kr-gloss-panel .kr-level-btn {
      background: #444;
      color: #fff;
      border: none;
      border-radius: 4px;
      padding: 2px 8px;
      font-size: 12px;
      cursor: pointer;
      white-space: nowrap;
    }
    #kr-gloss-panel .kr-level-btn:hover { background: #666; }
    #kr-gloss-panel .kr-color-input {
      width: 22px;
      height: 22px;
      border: 1px solid #555;
      border-radius: 4px;
      padding: 0;
      cursor: pointer;
      background: none;
      -webkit-appearance: none;
      appearance: none;
    }
    #kr-gloss-panel .kr-color-input::-webkit-color-swatch-wrapper { padding: 1px; }
    #kr-gloss-panel .kr-color-input::-webkit-color-swatch { border: none; border-radius: 2px; }
    #kr-gloss-panel .kr-color-label {
      font-size: 10px;
      opacity: 0.7;
    }
  `);

  function createPanel() {
    const panel = document.createElement('div');
    panel.id = 'kr-gloss-panel';

    // Font size controls (px)
    const sizeLabel = document.createElement('span');
    sizeLabel.className = 'kr-size-label';
    sizeLabel.textContent = rtSize + 'px';

    const btnMinus = document.createElement('button');
    btnMinus.textContent = '−';
    btnMinus.title = '번역 글씨 축소';

    const btnPlus = document.createElement('button');
    btnPlus.textContent = '+';
    btnPlus.title = '번역 글씨 확대';

    function updateSize(delta) {
      rtSize = Math.min(CONFIG.RT_SIZE_MAX, Math.max(CONFIG.RT_SIZE_MIN, rtSize + delta));
      applyRtSize();
      sizeLabel.textContent = rtSize + 'px';
    }

    btnMinus.addEventListener('click', () => updateSize(-CONFIG.RT_SIZE_STEP));
    btnPlus.addEventListener('click', () => updateSize(CONFIG.RT_SIZE_STEP));

    // Divider
    const divider = document.createElement('div');
    divider.className = 'kr-divider';

    // Level selector
    const levelBtn = document.createElement('button');
    levelBtn.className = 'kr-level-btn';
    levelBtn.title = '번역 레벨 변경 (클릭하여 순환)';
    levelBtn.textContent = LEVELS[currentLevel].label;

    levelBtn.addEventListener('click', () => {
      currentLevel = (currentLevel + 1) % LEVELS.length;
      localStorage.setItem(CONFIG.LEVEL_KEY, currentLevel);
      levelBtn.textContent = LEVELS[currentLevel].label;
      reprocessPage();
    });

    // Divider 2
    const divider2 = document.createElement('div');
    divider2.className = 'kr-divider';

    // Text color picker
    const colorLabel = document.createElement('span');
    colorLabel.className = 'kr-color-label';
    colorLabel.textContent = '글';

    const colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.className = 'kr-color-input';
    colorInput.value = rtColor;
    colorInput.title = '번역 글자 색상';
    colorInput.addEventListener('input', (e) => {
      rtColor = e.target.value;
      applyRtColor();
    });

    // Background color picker + opacity
    const bgLabel = document.createElement('span');
    bgLabel.className = 'kr-color-label';
    bgLabel.textContent = '배경';

    const bgInput = document.createElement('input');
    bgInput.type = 'color';
    bgInput.className = 'kr-color-input';
    bgInput.value = (rtBg && rtBg !== 'transparent') ? rtBg : '#ffff00';
    bgInput.title = '번역 배경 색상';
    bgInput.addEventListener('input', (e) => {
      rtBg = e.target.value;
      applyRtBg();
    });

    const opacitySlider = document.createElement('input');
    opacitySlider.type = 'range';
    opacitySlider.min = '0';
    opacitySlider.max = '100';
    opacitySlider.value = rtBgOpacity;
    opacitySlider.title = '배경 투명도 (' + rtBgOpacity + '%)';
    opacitySlider.style.cssText = 'width: 50px; height: 14px; cursor: pointer; accent-color: #888;';
    opacitySlider.addEventListener('input', (e) => {
      rtBgOpacity = parseInt(e.target.value);
      opacitySlider.title = '배경 투명도 (' + rtBgOpacity + '%)';
      if (rtBgOpacity === 0) {
        rtBg = 'transparent';
      } else if (rtBg === 'transparent') {
        rtBg = bgInput.value;
      }
      applyRtBg();
    });

    // Divider 3
    const divider3 = document.createElement('div');
    divider3.className = 'kr-divider';

    // POS filter button
    const posBtn = document.createElement('button');
    posBtn.className = 'kr-level-btn';
    posBtn.title = '품사 필터 (클릭하여 순환: ALL → 명사 → 동사)';
    posBtn.textContent = POS_FILTERS[currentPOS].label;

    posBtn.addEventListener('click', () => {
      currentPOS = (currentPOS + 1) % POS_FILTERS.length;
      localStorage.setItem(CONFIG.POS_KEY, currentPOS);
      posBtn.textContent = POS_FILTERS[currentPOS].label;
      reprocessPage();
    });

    panel.append(btnMinus, sizeLabel, btnPlus, divider, levelBtn, divider2, colorLabel, colorInput, bgLabel, bgInput, opacitySlider, divider3, posBtn);
    document.body.appendChild(panel);
  }

  function reprocessPage() {
    // Remove block-level line-height classes
    document.querySelectorAll('.kr-gloss-block').forEach(function (el) {
      el.classList.remove('kr-gloss-block');
    });
    // Remove all existing gloss wrappers, restoring original English text only
    const existing = document.querySelectorAll('[' + CONFIG.PROCESSED_ATTR + ']');
    for (const el of existing) {
      let original = '';
      for (const child of el.childNodes) {
        if (child.nodeType === Node.TEXT_NODE) {
          original += child.textContent;
        } else if (child.tagName === 'RUBY') {
          for (const rc of child.childNodes) {
            if (rc.nodeType === Node.TEXT_NODE) original += rc.textContent;
          }
        }
      }
      el.parentNode.replaceChild(document.createTextNode(original), el);
    }
    // Re-apply with new settings
    applyTranslations();
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

  // ── Word Filters ──

  function isAcronymOrProper(word) {
    return /^[A-Z]{2,}s?$/.test(word) || /^[A-Z][a-z]+$/.test(word);
  }

  // ── Translation APIs ──

  function googleRequest(text) {
    const url = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=ko&dt=t&q=' + encodeURIComponent(text);
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url,
        timeout: 10000,
        onload(res) {
          try {
            const json = JSON.parse(res.responseText);
            const full = json[0].map(seg => seg[0]).join('');
            resolve(full);
          } catch (e) {
            reject(new Error('Google parse error: ' + e.message));
          }
        },
        onerror() { reject(new Error('Google network error')); },
        ontimeout() { reject(new Error('Google timeout')); },
      });
    });
  }

  async function translateGoogle(words) {
    // Try batch first
    const batchText = words.join('\n');
    const full = await googleRequest(batchText);
    const lines = full.split('\n');

    // If line count matches, use batch result
    if (lines.length === words.length) {
      const result = new Map();
      words.forEach((w, i) => {
        const t = lines[i] && lines[i].trim();
        if (t) result.set(w, t);
      });
      return result;
    }

    // Fallback: translate individually
    console.warn('[KR-Gloss] Batch mismatch (' + lines.length + ' vs ' + words.length + '), falling back to individual');
    const result = new Map();
    for (const w of words) {
      try {
        const t = (await googleRequest(w)).trim();
        if (t) result.set(w, t);
      } catch { /* skip failed word */ }
    }
    return result;
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
        if (isAcronymOrProper(w)) continue;
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
      if (isAcronymOrProper(segments[i])) continue;
      const n = segments[i].toLowerCase();
      if (cache[n] && !shouldSkipWord(n)) { hasAnyTranslation = true; break; }
    }
    if (!hasAnyTranslation) return;

    const fragment = document.createDocumentFragment();

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      if (!seg) continue;

      if (i % 2 === 0) {
        fragment.appendChild(document.createTextNode(seg));
      } else {
        if (isAcronymOrProper(seg)) {
          fragment.appendChild(document.createTextNode(seg));
          continue;
        }
        const n = seg.toLowerCase();
        const ko = cache[n];
        if (ko && ko !== n && ko !== seg && !shouldSkipWord(n)) {
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

    // Mark parent block elements for line-height adjustment
    root.querySelectorAll('[' + CONFIG.PROCESSED_ATTR + ']').forEach(function (el) {
      const block = el.closest('p, li, td, th, dd, dt, blockquote, article, section, figcaption, h1, h2, h3, h4, h5, h6');
      if (block) block.classList.add('kr-gloss-block');
    });
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
    console.log('[KR-Gloss] Starting v2.1');
    createPanel();

    await detectAPI();
    if (!activeAPI) {
      console.error('[KR-Gloss] No API available, aborting');
      return;
    }
    console.log('[KR-Gloss] Using ' + activeAPI + ' API');
    console.log('[KR-Gloss] Level: ' + LEVELS[currentLevel].label + ' (' + LEVELS[currentLevel].desc + ')');

    const words = collectUncachedWords();
    console.log('[KR-Gloss] Found ' + words.length + ' uncached words');

    if (words.length > 0) {
      await translateAllWords(words);
    }

    applyTranslations();
    observeDOM();

    console.log('[KR-Gloss] Ready');
  }

  run().catch(e => console.error('[KR-Gloss] Fatal error:', e));
})();
