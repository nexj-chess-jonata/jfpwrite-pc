(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var ed = $('editor');
  var desk = $('desk');
  var desktop = window.jfpDesktop || null;
  var Rules = window.JFPRules;
  var BLOCKS = 'p,h1,h2,h3,li,blockquote,td,th';
  var KEY_PREFS = 'jfpwrite_proof';
  var KEY_IGNORED = 'jfpwrite_ignored';
  var KEY_DICT = 'jfpwrite_dict';
  var TYPES = ['ortho', 'gram', 'punct', 'style'];
  var LABELS = { ortho: 'Ortografia', gram: 'Gramática', punct: 'Pontuação', style: 'Estilo' };

  var prefs = { on: true, panel: false, level: 1 };
  var docText = '';
  var ignored = {};
  var dict = {};
  var issues = [];
  var filter = 'all';
  var spellReady = false;
  var spellState = 'none'; // none | loading | ready
  var cache = new Map();
  var inflight = {};
  var timer = null;

  // ------------------------------------------------------------------
  // Preferências e listas do usuário
  // ------------------------------------------------------------------

  function readJson(key, fallback) {
    try {
      var value = JSON.parse(localStorage.getItem(key));
      return value === null || value === undefined ? fallback : value;
    } catch (e) { return fallback; }
  }

  function writeJson(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* sem ação */ }
  }

  function load() {
    var p = readJson(KEY_PREFS, {});
    prefs.on = p.on !== false;
    prefs.panel = p.panel === true;
    prefs.level = typeof p.level === 'number' && p.level >= 0 && p.level <= 3 ? p.level : 1;
    (readJson(KEY_IGNORED, [])).forEach(function (k) { ignored[k] = true; });
    (readJson(KEY_DICT, [])).forEach(function (w) { dict[w] = true; });
  }

  function savePrefs() { writeJson(KEY_PREFS, prefs); }
  function saveIgnored() { writeJson(KEY_IGNORED, Object.keys(ignored).slice(-500)); }
  function saveDict() { writeJson(KEY_DICT, Object.keys(dict)); }

  function keyOf(issue) { return issue.rule + '|' + issue.text.toLowerCase(); }

  // ------------------------------------------------------------------
  // Texto do documento e posições
  // ------------------------------------------------------------------

  /** Junta o texto de um bloco, guardando de onde veio cada pedaço (para sublinhar depois). */
  function gather(block) {
    var pieces = [];
    var text = '';
    var walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, null);
    var n;
    while ((n = walker.nextNode())) {
      if (n.nodeType === 3) {
        if (n.parentElement.closest(BLOCKS) !== block) continue;
        var t = n.nodeValue.replace(/ /g, ' ');
        pieces.push({ node: n, start: text.length, end: text.length + t.length });
        text += t;
      } else if (n.tagName === 'BR' && n.closest(BLOCKS) === block) {
        text += '\n';
      }
    }
    return { text: text, pieces: pieces };
  }

  function toRange(pieces, start, end) {
    var a = null, b = null, ao = 0, bo = 0, i;
    for (i = 0; i < pieces.length; i++) {
      if (pieces[i].end > start) { a = pieces[i]; ao = Math.max(0, start - pieces[i].start); break; }
    }
    for (i = pieces.length - 1; i >= 0; i--) {
      if (pieces[i].start < end) { b = pieces[i]; bo = Math.min(pieces[i].end - pieces[i].start, end - pieces[i].start); break; }
    }
    if (!a || !b) return null;
    try {
      var range = document.createRange();
      range.setStart(a.node, ao);
      range.setEnd(b.node, bo);
      return range;
    } catch (e) { return null; }
  }

  // ------------------------------------------------------------------
  // Ortografia por dicionário (versão para PC)
  // ------------------------------------------------------------------

  var WORD_RE = /\p{L}(?:[\p{L}'’-]*\p{L})?/gu;
  var URL_RE = /(?:https?:\/\/|www\.)\S+|[\w.+-]+@[\w-]+\.[\w.-]+/gi;

  function spellIssues(text, unknown) {
    var out = [];
    var masked = [];
    var m;
    URL_RE.lastIndex = 0;
    while ((m = URL_RE.exec(text))) masked.push([m.index, m.index + m[0].length]);
    WORD_RE.lastIndex = 0;
    while ((m = WORD_RE.exec(text))) {
      var w = m[0];
      var s = m.index;
      var e = s + w.length;
      if (w.length < 2) continue;
      if (masked.some(function (r) { return s < r[1] && e > r[0]; })) continue;
      if (/\d/.test(text.charAt(s - 1)) || /\d/.test(text.charAt(e))) continue;
      if (w === w.toUpperCase()) continue;                       // siglas: SUS, COREN
      if (/\p{Lu}/u.test(w.slice(1)) && !/^\p{Lu}\p{Ll}+(-\p{Lu}\p{Ll}+)*$/u.test(w)) continue; // iPhone, McDonald
      if (/^\p{Lu}/u.test(w)) {                                  // nome próprio no meio da frase
        var before = text.slice(0, s).replace(/[\s"“”'(\[]+$/, '');
        if (before && !/[.!?:\n]$/.test(before)) continue;
      }
      if (dict[w.toLowerCase()]) continue;
      if (cache.has(w)) {
        var sug = cache.get(w);
        if (sug !== null) {
          out.push({ rule: 'spell', type: 'ortho', msg: 'Palavra não encontrada no dicionário.', start: s, end: e, text: w, fixes: sug, canAdd: true });
        }
      } else if (!inflight[w]) {
        unknown[w] = true;
      }
    }
    return out;
  }

  function requestSpell(unknown) {
    var words = Object.keys(unknown).slice(0, 300);
    if (!words.length || !desktop || !desktop.spellCheck) return;
    words.forEach(function (w) { inflight[w] = true; });
    desktop.spellCheck(words).then(function (wrong) {
      var bad = {};
      (wrong || []).forEach(function (item) { bad[item.w] = item.s || []; });
      words.forEach(function (w) {
        delete inflight[w];
        cache.set(w, Object.prototype.hasOwnProperty.call(bad, w) ? bad[w] : null);
      });
      schedule(50);
    }).catch(function () {
      words.forEach(function (w) { delete inflight[w]; cache.set(w, null); });
    });
  }

  function checkSpellStatus(tries) {
    if (!desktop || !desktop.spellStatus) return;
    desktop.spellStatus().then(function (state) {
      spellState = state;
      spellReady = state === 'ready';
      ed.spellcheck = !spellReady;
      showStatus();
      if (state === 'loading' && tries < 90) setTimeout(function () { checkSpellStatus(tries + 1); }, 2000);
      if (spellReady) schedule(50);
    });
  }

  // ------------------------------------------------------------------
  // Varredura
  // ------------------------------------------------------------------

  function schedule(delay) {
    clearTimeout(timer);
    timer = setTimeout(scan, delay === undefined ? 700 : delay);
  }

  function scan() {
    if (!prefs.on || !Rules) { issues = []; paint(); render(); showMetrics(); return; }
    var all = [];
    var unknown = {};
    docText = '';
    var blocks = ed.querySelectorAll(BLOCKS);
    for (var b = 0; b < blocks.length; b++) {
      var block = blocks[b];
      var g = gather(block);
      if (!g.text.trim()) continue;
      var paragraph = block.tagName === 'P' || block.tagName === 'BLOCKQUOTE';
      var list = Rules.analyze(g.text, { paragraph: paragraph });
      docText += g.text + '\n';
      if (window.JFPStyle) {
        var st = JFPStyle.analyze(g.text, { level: prefs.level }).filter(function (s) {
          return !list.some(function (r) { return s.start < r.end && s.end > r.start; });
        });
        list = list.concat(st).sort(function (x, y) { return x.start - y.start; });
      }
      if (spellReady) {
        var sp = spellIssues(g.text, unknown).filter(function (s) {
          return !list.some(function (r) { return s.start < r.end && s.end > r.start; });
        });
        list = list.concat(sp).sort(function (x, y) { return x.start - y.start; });
      }
      for (var i = 0; i < list.length; i++) {
        var issue = list[i];
        if (ignored[keyOf(issue)]) continue;
        var range = toRange(g.pieces, issue.start, issue.end);
        if (!range) continue;
        issue.range = range;
        issue.context = g.text.slice(Math.max(0, issue.start - 28), issue.start) + '\u0001' +
          issue.text + '\u0002' + g.text.slice(issue.end, issue.end + 28);
        all.push(issue);
      }
    }
    issues = all;
    paint();
    render();
    showMetrics();
    requestSpell(unknown);
  }

  // ------------------------------------------------------------------
  // Sublinhados no texto (não alteram o documento)
  // ------------------------------------------------------------------

  var canPaint = !!(window.CSS && CSS.highlights && typeof Highlight !== 'undefined');

  function paint() {
    if (!canPaint) return;
    TYPES.forEach(function (type) {
      var h = null;
      issues.forEach(function (issue) {
        if (issue.type !== type) return;
        if (!h) h = new Highlight();
        h.add(issue.range);
      });
      if (h) CSS.highlights.set('jfp-' + type, h);
      else CSS.highlights.delete('jfp-' + type);
    });
  }

  // ------------------------------------------------------------------
  // Painel de revisão
  // ------------------------------------------------------------------

  function showStatus() {
    var el = $('rv-status');
    if (!prefs.on) el.textContent = 'Revisão desligada';
    else if (!desktop) el.textContent = 'Regras de gramática ativas. Dicionário completo: só no aplicativo do PC.';
    else if (spellState === 'ready') el.textContent = 'Regras e dicionário ativos.';
    else if (spellState === 'loading') el.textContent = 'Carregando o dicionário...';
    else el.textContent = 'Dicionário indisponível: só as regras de gramática.';
  }

  function showMetrics() {
    var box = $('rv-metrics');
    if (!window.JFPStyle || !prefs.on) { box.hidden = true; return; }
    box.hidden = false;
    var m = JFPStyle.metrics(docText);
    if (!m) {
      box.textContent = 'Escreva um pouco mais (30 palavras) para medir a legibilidade.';
      return;
    }
    box.textContent = 'Legibilidade: ' + m.label + ' (' + m.score + ') · ' + String(m.wps).replace('.', ',') +
      ' palavras por frase · ' + m.words + ' palavras. Estimativa pelo índice de Flesch adaptado ao português.';
  }

  function fillLevels() {
    var sel = $('rv-level');
    sel.textContent = '';
    if (!window.JFPStyle) return;
    JFPStyle.LEVELS.forEach(function (lv, i) {
      var o = document.createElement('option');
      o.value = String(i);
      o.textContent = lv.name;
      sel.appendChild(o);
    });
    sel.value = String(prefs.level);
    $('rv-levelhint').textContent = JFPStyle.LEVELS[prefs.level].hint;
  }

  $('rv-level').addEventListener('change', function () {
    prefs.level = parseInt(this.value, 10);
    savePrefs();
    $('rv-levelhint').textContent = JFPStyle.LEVELS[prefs.level].hint;
    scan();
  });

  function visible() {
    return issues.filter(function (i) { return filter === 'all' || i.type === filter; });
  }

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function render() {
    var count = issues.length;
    $('rv-count').textContent = prefs.on && count ? '(' + count + ')' : '';
    showStatus();
    if ($('review').hidden) return;

    var tabs = $('rv-tabs');
    tabs.textContent = '';
    var counts = { all: count };
    TYPES.forEach(function (t) { counts[t] = issues.filter(function (i) { return i.type === t; }).length; });
    ['all'].concat(TYPES).forEach(function (t) {
      var b = el('button', 'rv-tab t-' + t + (filter === t ? ' on' : ''), (t === 'all' ? 'Todos' : LABELS[t]) + ' ' + counts[t]);
      b.setAttribute('data-filter', t);
      tabs.appendChild(b);
    });

    var list = $('rv-list');
    list.textContent = '';
    var shown = visible();
    if (!prefs.on) {
      list.appendChild(el('p', 'rv-empty', 'Ligue a revisão para ver as sugestões.'));
      return;
    }
    if (!shown.length) {
      list.appendChild(el('p', 'rv-empty', count ? 'Nada neste filtro.' : 'Nenhum problema encontrado.'));
      return;
    }
    shown.slice(0, 300).forEach(function (issue) {
      var idx = issues.indexOf(issue);
      var card = el('div', 'rv-item t-' + issue.type);
      card.setAttribute('data-i', idx);
      card.appendChild(el('div', 'rv-kind', LABELS[issue.type]));
      var ctx = el('div', 'rv-ctx');
      var parts = issue.context.split(/[\u0001\u0002]/);
      ctx.appendChild(document.createTextNode((parts[0].length >= 28 ? '…' : '') + parts[0]));
      ctx.appendChild(el('mark', null, parts[1]));
      ctx.appendChild(document.createTextNode(parts[2] + (parts[2].length >= 28 ? '…' : '')));
      card.appendChild(ctx);
      card.appendChild(el('div', 'rv-msg', issue.msg));
      var actions = el('div', 'rv-actions');
      issue.fixes.slice(0, 4).forEach(function (fix, k) {
        var b = el('button', 'rv-fix', fix);
        b.setAttribute('data-act', 'fix');
        b.setAttribute('data-k', k);
        actions.appendChild(b);
      });
      if (issue.canAdd) {
        var add = el('button', 'rv-sec', 'Adicionar ao dicionário');
        add.setAttribute('data-act', 'add');
        actions.appendChild(add);
      }
      var ign = el('button', 'rv-sec', 'Ignorar');
      ign.setAttribute('data-act', 'ignore');
      actions.appendChild(ign);
      card.appendChild(actions);
      list.appendChild(card);
    });
    if (shown.length > 300) list.appendChild(el('p', 'rv-empty', 'Mostrando os 300 primeiros. Corrija e volte para ver o resto.'));
  }

  function openPanel(open) {
    prefs.panel = open;
    savePrefs();
    $('review').hidden = !open;
    $('rv-on').checked = prefs.on;
    $('desk').dispatchEvent(new Event('scroll'));
    window.dispatchEvent(new Event('resize'));
    render();
  }

  function selectRange(range) {
    ed.focus();
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range.cloneRange());
  }

  function goTo(issue) {
    selectRange(issue.range);
    var rect = issue.range.getBoundingClientRect();
    var box = desk.getBoundingClientRect();
    if (rect.top < box.top + 60 || rect.bottom > box.bottom - 60) desk.scrollTop += rect.top - (box.top + box.height / 3);
  }

  function applyFix(issue, fix) {
    selectRange(issue.range);
    document.execCommand('insertText', false, fix);
    schedule(80);
  }

  function ignoreIssue(issue) {
    ignored[keyOf(issue)] = true;
    saveIgnored();
    scan();
  }

  function addToDictionary(issue) {
    dict[issue.text.toLowerCase()] = true;
    saveDict();
    scan();
  }

  $('rv-list').addEventListener('mousedown', function (event) {
    if (event.target.closest('button')) event.preventDefault();
  });

  $('rv-list').addEventListener('click', function (event) {
    var card = event.target.closest('.rv-item');
    if (!card) return;
    var issue = issues[parseInt(card.getAttribute('data-i'), 10)];
    if (!issue) return;
    var button = event.target.closest('button');
    var act = button ? button.getAttribute('data-act') : 'go';
    if (act === 'fix') applyFix(issue, issue.fixes[parseInt(button.getAttribute('data-k'), 10)]);
    else if (act === 'ignore') ignoreIssue(issue);
    else if (act === 'add') addToDictionary(issue);
    else goTo(issue);
  });

  $('rv-tabs').addEventListener('click', function (event) {
    var button = event.target.closest('button');
    if (!button) return;
    filter = button.getAttribute('data-filter');
    render();
  });

  $('rv-close').addEventListener('click', function () { openPanel(false); });

  $('rv-on').addEventListener('change', function () {
    prefs.on = this.checked;
    savePrefs();
    scan();
  });

  $('topbar').addEventListener('click', function (event) {
    var button = event.target.closest('button');
    if (button && button.getAttribute('data-act') === 'review') openPanel($('review').hidden);
  });

  document.addEventListener('keydown', function (event) {
    if (event.key === 'F7') {
      event.preventDefault();
      openPanel($('review').hidden);
    }
  });

  /** Com o painel aberto, clicar numa palavra sublinhada destaca o cartão dela. */
  document.addEventListener('selectionchange', function () {
    if ($('review').hidden) return;
    var sel = window.getSelection();
    if (!sel.rangeCount || !sel.isCollapsed || !ed.contains(sel.anchorNode)) return;
    var found = -1;
    for (var i = 0; i < issues.length; i++) {
      try {
        if (issues[i].range.isPointInRange(sel.anchorNode, sel.anchorOffset)) { found = i; break; }
      } catch (e) { /* posição fora do documento */ }
    }
    var cards = $('rv-list').querySelectorAll('.rv-item');
    for (var c = 0; c < cards.length; c++) {
      var on = parseInt(cards[c].getAttribute('data-i'), 10) === found;
      cards[c].classList.toggle('cur', on);
      if (on) cards[c].scrollIntoView({ block: 'nearest' });
    }
  });

  ed.addEventListener('input', function () { schedule(); });
  new MutationObserver(function () { schedule(); }).observe(ed, { childList: true, subtree: true, characterData: true });

  // ------------------------------------------------------------------
  // Início
  // ------------------------------------------------------------------

  load();
  $('rv-on').checked = prefs.on;
  fillLevels();
  $('review').hidden = !prefs.panel;
  if (desktop && desktop.spellStatus) {
    spellState = 'loading';
    checkSpellStatus(0);
  }
  showStatus();
  scan();
})();
