(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var ed = $('editor');
  var desk = $('desk');
  var sheet = $('sheet');
  var desktop = window.jfpDesktop || null;
  var PREFS_KEY = 'jfpwrite_prefs';
  var PX_PER_CM = 96 / 2.54;

  var SIZES = {
    A4: { w: 21, h: 29.7, label: 'A4' },
    LETTER: { w: 21.59, h: 27.94, label: 'Carta' },
    A5: { w: 14.8, h: 21, label: 'A5' }
  };

  var DEFAULT = {
    size: 'A4', landscape: false,
    mt: 2.5, mb: 2.5, ml: 2.5, mr: 2.5,
    lh: 1.5,
    header: '', footer: '', numbering: 'none'
  };

  var page = clone(DEFAULT);
  var prefs = { dark: false, tw: false };
  var api = { onChange: null };

  function clone(obj) { return JSON.parse(JSON.stringify(obj)); }

  function num(value, fallback, min, max) {
    var n = parseFloat(String(value).replace(',', '.'));
    if (!isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  }

  /** Aceita qualquer coisa vinda de arquivo e devolve configurações válidas. */
  function normalize(raw) {
    var p = clone(DEFAULT);
    if (!raw || typeof raw !== 'object') return p;
    if (SIZES[raw.size]) p.size = raw.size;
    p.landscape = raw.landscape === true;
    p.mt = num(raw.mt, p.mt, 0.5, 6);
    p.mb = num(raw.mb, p.mb, 0.5, 6);
    p.ml = num(raw.ml, p.ml, 0.5, 6);
    p.mr = num(raw.mr, p.mr, 0.5, 6);
    p.lh = num(raw.lh, p.lh, 1, 3);
    p.header = typeof raw.header === 'string' ? raw.header.slice(0, 120) : '';
    p.footer = typeof raw.footer === 'string' ? raw.footer.slice(0, 120) : '';
    p.numbering = raw.numbering === 'center' || raw.numbering === 'right' ? raw.numbering : 'none';
    return p;
  }

  function dims() {
    var s = SIZES[page.size];
    var w = page.landscape ? s.h : s.w;
    var h = page.landscape ? s.w : s.h;
    return { w: w, h: h };
  }

  // ------------------------------------------------------------------
  // Aplicar a página na tela
  // ------------------------------------------------------------------

  function applyPage() {
    var d = dims();
    var root = document.documentElement.style;
    root.setProperty('--pw', Math.round(d.w * PX_PER_CM) + 'px');
    root.setProperty('--ph', Math.round(d.h * PX_PER_CM) + 'px');
    root.setProperty('--mt', page.mt + 'cm');
    root.setProperty('--mb', page.mb + 'cm');
    root.setProperty('--ml', page.ml + 'cm');
    root.setProperty('--mr', page.mr + 'cm');
    root.setProperty('--lh', String(page.lh));
    $('hdr-preview').textContent = page.header;
    $('ftr-preview').textContent = page.footer;
    $('lh').value = String(page.lh);
    var style = $('print-style');
    style.textContent = '@page { size: ' + d.w + 'cm ' + d.h + 'cm; margin: ' +
      page.mt + 'cm ' + page.mr + 'cm ' + page.mb + 'cm ' + page.ml + 'cm; }';
    layout();
  }

  var layoutQueued = false;
  function layout() {
    if (layoutQueued) return;
    layoutQueued = true;
    requestAnimationFrame(function () {
      layoutQueued = false;
      measure();
    });
  }

  var pages = 1;

  function metrics() {
    var cs = getComputedStyle(ed);
    var ph = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ph')) || 1123;
    var pt = parseFloat(cs.paddingTop) || 0;
    var pb = parseFloat(cs.paddingBottom) || 0;
    return { ph: ph, pt: pt, pb: pb, text: Math.max(100, ph - pt - pb) };
  }

  /** Estima onde cada página termina: a altura útil de uma página é o papel menos as margens. */
  function measure() {
    var m = metrics();
    var content = ed.scrollHeight - m.pt - m.pb;
    var count = Math.max(1, Math.ceil((content - 1) / m.text));
    pages = count;
    var html = '';
    for (var k = 1; k < count; k++) {
      html += '<div class="pbreak" style="top:' + Math.round(m.pt + k * m.text) + 'px"><span>Página ' + (k + 1) + '</span></div>';
    }
    $('marks').innerHTML = html;
    updatePageInfo();
  }

  function caretPage() {
    var sel = window.getSelection();
    if (!sel.rangeCount || !ed.contains(sel.anchorNode)) return 1;
    var rect = sel.getRangeAt(0).getClientRects()[0];
    if (!rect) {
      var node = sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement;
      rect = node.getBoundingClientRect();
    }
    var m = metrics();
    var top = rect.top - ed.getBoundingClientRect().top - m.pt;
    return Math.min(pages, Math.max(1, Math.floor((top + 2) / m.text) + 1));
  }

  function updatePageInfo() {
    $('pageinfo').textContent = 'Página ' + caretPage() + ' de ' + pages;
  }

  // ------------------------------------------------------------------
  // Janela "Configurar página"
  // ------------------------------------------------------------------

  var PRESETS = {
    normal: [2.5, 2.5, 2.5, 2.5],
    abnt: [3, 2, 3, 2],
    narrow: [1.27, 1.27, 1.27, 1.27],
    wide: [2.54, 2.54, 5.08, 5.08]
  };

  function fillDialog() {
    $('p-size').value = page.size;
    $('p-orient').value = page.landscape ? 'landscape' : 'portrait';
    $('p-mt').value = page.mt;
    $('p-mb').value = page.mb;
    $('p-ml').value = page.ml;
    $('p-mr').value = page.mr;
    $('p-preset').value = '';
    $('p-header').value = page.header;
    $('p-footer').value = page.footer;
    $('p-number').value = page.numbering;
  }

  function readDialog() {
    return normalize({
      size: $('p-size').value,
      landscape: $('p-orient').value === 'landscape',
      mt: $('p-mt').value, mb: $('p-mb').value, ml: $('p-ml').value, mr: $('p-mr').value,
      lh: page.lh,
      header: $('p-header').value.replace(/\s+/g, ' ').trim(),
      footer: $('p-footer').value.replace(/\s+/g, ' ').trim(),
      numbering: $('p-number').value
    });
  }

  $('p-preset').addEventListener('change', function () {
    var values = PRESETS[this.value];
    if (!values) return;
    $('p-mt').value = values[0];
    $('p-mb').value = values[1];
    $('p-ml').value = values[2];
    $('p-mr').value = values[3];
  });

  function openPageDialog() {
    fillDialog();
    var dlg = $('dlg-page');
    dlg.returnValue = '';
    dlg.addEventListener('close', function handler() {
      dlg.removeEventListener('close', handler);
      if (dlg.returnValue !== 'ok') return;
      var next = readDialog();
      if (JSON.stringify(next) !== JSON.stringify(page)) {
        page = next;
        applyPage();
        changed();
      }
    });
    dlg.showModal();
  }

  $('lh').addEventListener('change', function () {
    page.lh = num(this.value, 1.5, 1, 3);
    applyPage();
    changed();
  });

  function changed() {
    if (typeof api.onChange === 'function') api.onChange();
  }

  // ------------------------------------------------------------------
  // Modos: foco, máquina de escrever, tema escuro
  // ------------------------------------------------------------------

  function loadPrefs() {
    try {
      var raw = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}');
      prefs.dark = raw.dark === true;
      prefs.tw = raw.tw === true;
    } catch (e) { /* usa o padrão */ }
  }

  function savePrefs() {
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch (e) { /* sem ação */ }
  }

  function showModes() {
    document.body.classList.toggle('dark', prefs.dark);
    document.body.classList.toggle('tw', prefs.tw);
    var buttons = document.querySelectorAll('[data-mode]');
    for (var i = 0; i < buttons.length; i++) {
      var mode = buttons[i].getAttribute('data-mode');
      var on = mode === 'focus' ? document.body.classList.contains('focus') : !!prefs[mode];
      buttons[i].classList.toggle('on', on);
      buttons[i].setAttribute('aria-pressed', on ? 'true' : 'false');
    }
  }

  var hintTimer = null;
  function hint(text) {
    var el = $('hint');
    el.textContent = text;
    el.hidden = false;
    clearTimeout(hintTimer);
    hintTimer = setTimeout(function () { el.hidden = true; }, 2600);
  }

  function toggleMode(mode) {
    if (mode === 'focus') {
      var on = !document.body.classList.contains('focus');
      document.body.classList.toggle('focus', on);
      markCurrent();
      if (on) hint('Modo foco ligado. Aperte Esc para sair.');
      layout();
    } else {
      prefs[mode] = !prefs[mode];
      savePrefs();
    }
    showModes();
    if (mode === 'tw' && prefs.tw) centerCaret();
    ed.focus();
  }

  /** Marca o bloco onde está o cursor; os outros ficam esmaecidos no modo foco. */
  function markCurrent() {
    var old = ed.querySelectorAll('.cur');
    for (var i = 0; i < old.length; i++) old[i].classList.remove('cur');
    if (!document.body.classList.contains('focus')) return;
    var sel = window.getSelection();
    if (!sel.rangeCount || !ed.contains(sel.anchorNode)) return;
    var node = sel.anchorNode;
    while (node && node.parentNode !== ed) node = node.parentNode;
    if (node && node.nodeType === 1) node.classList.add('cur');
  }

  /** Máquina de escrever: a linha onde se escreve fica sempre na mesma altura da tela. */
  function centerCaret() {
    if (!prefs.tw) return;
    var sel = window.getSelection();
    if (!sel.rangeCount || !ed.contains(sel.anchorNode)) return;
    var rect = sel.getRangeAt(0).getClientRects()[0];
    if (!rect) {
      var node = sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement;
      rect = node.getBoundingClientRect();
    }
    var box = desk.getBoundingClientRect();
    var delta = (rect.top + rect.height / 2) - (box.top + desk.clientHeight * 0.45);
    if (Math.abs(delta) > 2) desk.scrollTop += delta;
  }

  document.addEventListener('selectionchange', function () {
    markCurrent();
    updatePageInfo();
  });
  ed.addEventListener('input', function () { centerCaret(); });
  ed.addEventListener('keyup', function (event) {
    if (/^(Arrow|Page|Home|End)/.test(event.key)) centerCaret();
  });

  // ------------------------------------------------------------------
  // Imprimir / salvar em PDF
  // ------------------------------------------------------------------

  function printDocument() {
    markCurrentOff();
    if (desktop && desktop.printPdf) {
      var d = dims();
      desktop.printPdf({
        width: d.w, height: d.h,
        mt: page.mt, mb: page.mb, ml: page.ml, mr: page.mr,
        header: page.header, footer: page.footer, numbering: page.numbering,
        suggestedName: (document.title.replace(/\s*[•-]\s*JFPWrite$/, '').replace(/\s*•$/, '') || 'Documento')
      });
    } else {
      window.print();
    }
  }

  function markCurrentOff() {
    var old = ed.querySelectorAll('.cur');
    for (var i = 0; i < old.length; i++) old[i].classList.remove('cur');
  }

  // ------------------------------------------------------------------
  // Botões e atalhos
  // ------------------------------------------------------------------

  $('topbar').addEventListener('click', function (event) {
    var button = event.target.closest('button');
    if (!button) return;
    var act = button.getAttribute('data-act');
    var mode = button.getAttribute('data-mode');
    if (act === 'page') openPageDialog();
    else if (act === 'print') printDocument();
    else if (mode) toggleMode(mode);
  });

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && document.body.classList.contains('focus') && !document.querySelector('dialog[open]')) {
      toggleMode('focus');
      return;
    }
    if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
    var key = event.key.toLowerCase();
    if (key === 'p') {
      event.preventDefault();
      printDocument();
    } else if (key === 'f' && event.shiftKey) {
      event.preventDefault();
      toggleMode('focus');
    }
  });

  window.addEventListener('resize', layout);
  ed.addEventListener('load', layout, true);
  new MutationObserver(function (records) {
    for (var i = 0; i < records.length; i++) {
      if (records[i].target !== ed) { layout(); return; }
    }
  }).observe(ed, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['style', 'src', 'width', 'height'] });
  window.addEventListener('beforeprint', markCurrentOff);

  // ------------------------------------------------------------------
  // Interface com o editor
  // ------------------------------------------------------------------

  api.get = function () { return clone(page); };
  api.set = function (raw) { page = normalize(raw); applyPage(); };
  api.reset = function () { page = clone(DEFAULT); applyPage(); };
  api.print = printDocument;

  loadPrefs();
  showModes();
  applyPage();
  window.JFPPage = api;
})();
