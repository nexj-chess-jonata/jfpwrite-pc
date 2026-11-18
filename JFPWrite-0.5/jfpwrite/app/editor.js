(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var ed = $('editor');
  var desktop = window.jfpDesktop || null;
  var DRAFT_KEY = 'jfpwrite_draft';
  var EMPTY = '<p><br></p>';

  var filePath = null;
  var fileName = null;
  var dirty = false;
  var savedRange = null;
  var selectedImage = null;
  var parsedPage = null;

  // ------------------------------------------------------------------
  // Seleção e comandos
  // ------------------------------------------------------------------

  function insideEditor(node) {
    return !!node && (node === ed || ed.contains(node));
  }

  function restoreSelection() {
    ed.focus();
    if (!savedRange) return;
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(savedRange);
  }

  function exec(cmd, value) {
    restoreSelection();
    document.execCommand(cmd, false, value === undefined ? null : value);
    afterChange();
  }

  function anchorElement() {
    var sel = window.getSelection();
    if (!sel.rangeCount || !insideEditor(sel.anchorNode)) return null;
    var node = sel.anchorNode;
    return node.nodeType === 1 ? node : node.parentElement;
  }

  function currentCell() {
    var el = anchorElement();
    var cell = el ? el.closest('td, th') : null;
    return cell && insideEditor(cell) ? cell : null;
  }

  // ------------------------------------------------------------------
  // Estado do documento
  // ------------------------------------------------------------------

  function displayName() {
    return fileName || 'Documento sem título';
  }

  function setDirty(flag) {
    dirty = flag;
    $('docname').textContent = displayName() + (dirty ? ' •' : '');
    $('state').textContent = dirty ? 'Alterações não salvas' : (filePath || fileName ? 'Salvo' : 'Novo documento');
    var title = displayName() + (dirty ? ' • ' : ' ') + '- JFPWrite';
    document.title = title;
    if (desktop) {
      desktop.setDirty(dirty);
      desktop.setTitle(title);
    }
  }

  function updateCount() {
    var text = ed.innerText || '';
    var words = text.match(/\S+/g);
    var chars = text.replace(/\n/g, '').length;
    var total = words ? words.length : 0;
    $('count').textContent = total + (total === 1 ? ' palavra · ' : ' palavras · ') + chars + (chars === 1 ? ' caractere' : ' caracteres');
  }

  function afterChange() {
    fixFontSizes();
    normalizeBlocks();
    if (!ed.firstChild) ed.innerHTML = EMPTY;
    setDirty(true);
    updateCount();
    refreshToolbar();
  }

  function cleanHtml() {
    var copy = ed.cloneNode(true);
    var marked = copy.querySelectorAll('img.sel');
    for (var i = 0; i < marked.length; i++) marked[i].classList.remove('sel');
    return copy.innerHTML;
  }

  function setContent(html) {
    clearImageSelection();
    ed.innerHTML = html && html.trim() ? html : EMPTY;
    savedRange = null;
    ed.scrollTop = 0;
    $('desk').scrollTop = 0;
    updateCount();
    refreshToolbar();
  }

  // ------------------------------------------------------------------
  // Segurança: limpa HTML vindo de arquivos ou da área de transferência
  // ------------------------------------------------------------------

  function sanitize(html) {
    var doc = new DOMParser().parseFromString('<body>' + html + '</body>', 'text/html');
    var banned = doc.body.querySelectorAll(
      'script, style, iframe, object, embed, link, meta, base, form, input, button, select, textarea, video, audio, svg, math'
    );
    for (var i = 0; i < banned.length; i++) banned[i].remove();
    var all = doc.body.querySelectorAll('*');
    for (var j = 0; j < all.length; j++) {
      var el = all[j];
      var attrs = Array.prototype.slice.call(el.attributes);
      for (var k = 0; k < attrs.length; k++) {
        var name = attrs[k].name.toLowerCase();
        var value = String(attrs[k].value).replace(/\s+/g, '').toLowerCase();
        if (name.indexOf('on') === 0 || name === 'contenteditable' || name === 'id' || name === 'srcdoc') {
          el.removeAttribute(attrs[k].name);
        } else if ((name === 'href' || name === 'src') && /^(javascript|vbscript|file):/.test(value)) {
          el.removeAttribute(attrs[k].name);
        } else if (name === 'src' && el.tagName === 'IMG' && !/^(data:image\/|blob:|https?:)/.test(value)) {
          el.removeAttribute(attrs[k].name);
        }
      }
    }
    var images = doc.body.querySelectorAll('img:not([src])');
    for (var m = 0; m < images.length; m++) images[m].remove();
    return doc.body.innerHTML;
  }

  function escapeHtml(text) {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function baseName(path) {
    return String(path).split(/[\\/]/).pop();
  }

  /** Converte o conteúdo de um arquivo em HTML do editor. Devolve null se o arquivo for inválido. */
  function parseFile(name, content) {
    parsedPage = null;
    var lower = name.toLowerCase();
    if (/\.jfpw$/.test(lower)) {
      try {
        var data = JSON.parse(content);
        if (!data || typeof data.html !== 'string') return null;
        parsedPage = data.page || null;
        return sanitize(data.html);
      } catch (e) {
        return null;
      }
    }
    if (/\.html?$/.test(lower)) {
      return sanitize(content);
    }
    var lines = content.replace(/\r\n?/g, '\n').split('\n');
    return lines.map(function (line) {
      return '<p>' + (line ? escapeHtml(line) : '<br>') + '</p>';
    }).join('');
  }

  // ------------------------------------------------------------------
  // Perguntas (janela própria, funciona no PC e no celular)
  // ------------------------------------------------------------------

  function ask(text, labels) {
    var dlg = $('dlg-ask');
    $('ask-text').textContent = text;
    $('ask-yes').textContent = labels.yes;
    $('ask-no').textContent = labels.no || '';
    $('ask-no').hidden = !labels.no;
    $('ask-cancel').textContent = labels.cancel || 'Cancelar';
    $('ask-cancel').hidden = labels.cancel === null;
    return new Promise(function (resolve) {
      dlg.returnValue = '';
      dlg.addEventListener('close', function handler() {
        dlg.removeEventListener('close', handler);
        resolve(dlg.returnValue || 'cancel');
      });
      dlg.showModal();
    });
  }

  function tell(text) {
    return ask(text, { yes: 'OK', cancel: null });
  }

  // ------------------------------------------------------------------
  // Arquivo: novo, abrir, salvar
  // ------------------------------------------------------------------

  function clearDraft() {
    try { localStorage.removeItem(DRAFT_KEY); } catch (e) { /* sem ação */ }
  }

  function saveDraft() {
    if (!dirty) return;
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ html: cleanHtml(), name: fileName, path: filePath, page: window.JFPPage.get() }));
    } catch (e) { /* documento grande demais para o rascunho automático */ }
  }

  function serialize() {
    return JSON.stringify({ app: 'JFPWrite', v: 2, html: cleanHtml(), page: window.JFPPage.get() });
  }

  function download(name, content) {
    var blob = new Blob([content], { type: 'application/json' });
    var link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(link.href); }, 1000);
  }

  function save(forceNewName) {
    var content = serialize();
    if (desktop) {
      var suggested = (fileName || 'Documento').replace(/\.[^.]+$/, '');
      var target = forceNewName || !/\.jfpw$/i.test(filePath || '') ? null : filePath;
      return desktop.save({ path: target, content: content, suggestedName: suggested }).then(function (saved) {
        if (!saved) return false;
        filePath = saved;
        fileName = baseName(saved);
        clearDraft();
        setDirty(false);
        return true;
      });
    }
    var name = (fileName || 'Documento').replace(/\.[^.]+$/, '') + '.jfpw';
    download(name, content);
    fileName = name;
    clearDraft();
    setDirty(false);
    return Promise.resolve(true);
  }

  /** Antes de trocar de documento: pergunta o que fazer com alterações não salvas. */
  function confirmLeave() {
    if (!dirty) return Promise.resolve(true);
    return ask('O documento tem alterações que não foram salvas. Deseja salvar?', {
      yes: 'Salvar', no: 'Não salvar', cancel: 'Cancelar'
    }).then(function (answer) {
      if (answer === 'yes') return save(false);
      return answer === 'no';
    });
  }

  function loadDocument(name, path, content) {
    var html = parseFile(name, content);
    if (html === null) {
      tell('Não foi possível abrir este arquivo. Ele não parece ser um documento do JFPWrite.');
      return;
    }
    filePath = path;
    fileName = name;
    if (parsedPage) window.JFPPage.set(parsedPage); else window.JFPPage.reset();
    setContent(html);
    clearDraft();
    setDirty(false);
  }

  function newDocument() {
    confirmLeave().then(function (ok) {
      if (!ok) return;
      filePath = null;
      fileName = null;
      window.JFPPage.reset();
      setContent(EMPTY);
      clearDraft();
      setDirty(false);
      ed.focus();
    });
  }

  function openDocument() {
    confirmLeave().then(function (ok) {
      if (!ok) return;
      if (desktop) {
        desktop.open().then(function (file) {
          if (file) loadDocument(baseName(file.path), file.path, file.content);
        });
      } else {
        $('pick-doc').value = '';
        $('pick-doc').click();
      }
    });
  }

  $('pick-doc').addEventListener('change', function () {
    var file = this.files && this.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () { loadDocument(file.name, null, String(reader.result)); };
    reader.readAsText(file);
  });

  // ------------------------------------------------------------------
  // Formatação
  // ------------------------------------------------------------------

  var pendingSize = 12;

  /** O comando de tamanho do navegador só tem 7 níveis; aqui ele vira tamanho em pontos. */
  function fixFontSizes() {
    var marked = ed.querySelectorAll('font[size="7"], span[style*="xxx-large"]');
    for (var i = 0; i < marked.length; i++) {
      marked[i].removeAttribute('size');
      marked[i].style.fontSize = pendingSize + 'pt';
    }
  }

  /** O navegador às vezes põe listas e tabelas dentro de um parágrafo; aqui elas voltam para fora. */
  function normalizeBlocks() {
    var nested = ed.querySelectorAll('p > ul, p > ol, p > table, p > p, p > h1, p > h2, p > h3, p > blockquote');
    for (var i = 0; i < nested.length; i++) {
      var holder = nested[i].parentElement;
      if (!holder || holder.tagName !== 'P' || !holder.parentElement) continue;
      var parent = holder.parentElement;
      while (holder.firstChild) parent.insertBefore(holder.firstChild, holder);
      holder.remove();
    }
  }

  function setFontSize(points) {
    pendingSize = points;
    restoreSelection();
    document.execCommand('fontSize', false, '7');
    afterChange();
  }

  function refreshToolbar() {
    var toggles = document.querySelectorAll('button.tgl');
    for (var i = 0; i < toggles.length; i++) {
      var on = false;
      try { on = document.queryCommandState(toggles[i].getAttribute('data-cmd')); } catch (e) { on = false; }
      toggles[i].classList.toggle('on', on);
    }
    var block = '';
    try { block = String(document.queryCommandValue('formatBlock') || '').toUpperCase(); } catch (e) { block = ''; }
    var blockSelect = $('block');
    blockSelect.value = blockSelect.querySelector('option[value="' + block + '"]') ? block : 'P';

    var el = anchorElement();
    if (el) {
      var px = parseFloat(window.getComputedStyle(el).fontSize);
      var pt = String(Math.round(px * 0.75));
      var sizeSelect = $('size');
      for (var j = 0; j < sizeSelect.options.length; j++) {
        if (sizeSelect.options[j].value === pt) sizeSelect.value = pt;
      }
    }
    $('row-table').hidden = !currentCell();
    $('row-image').hidden = !selectedImage;
  }

  $('block').addEventListener('change', function () { exec('formatBlock', '<' + this.value + '>'); });
  $('font').addEventListener('change', function () { exec('fontName', this.value); });
  $('size').addEventListener('change', function () { setFontSize(parseInt(this.value, 10)); });
  $('forecolor').addEventListener('input', function () { exec('foreColor', this.value); });
  $('backcolor').addEventListener('input', function () { exec('hiliteColor', this.value); });

  // ------------------------------------------------------------------
  // Tabelas
  // ------------------------------------------------------------------

  function newCell() {
    var td = document.createElement('td');
    td.appendChild(document.createElement('br'));
    return td;
  }

  function insertTable(rows, cols) {
    var html = '<table><tbody>';
    for (var r = 0; r < rows; r++) {
      html += '<tr>';
      for (var c = 0; c < cols; c++) html += '<td><br></td>';
      html += '</tr>';
    }
    html += '</tbody></table><p><br></p>';
    exec('insertHTML', html);
  }

  function tableAction(action) {
    var cell = currentCell();
    if (!cell) return;
    var row = cell.parentElement;
    var table = cell.closest('table');
    var index = cell.cellIndex;
    var i;
    if (action === 'rowAbove' || action === 'rowBelow') {
      var fresh = document.createElement('tr');
      for (i = 0; i < row.cells.length; i++) fresh.appendChild(newCell());
      row.parentElement.insertBefore(fresh, action === 'rowAbove' ? row : row.nextSibling);
    } else if (action === 'colLeft' || action === 'colRight') {
      for (i = 0; i < table.rows.length; i++) {
        var cells = table.rows[i].cells;
        var ref = cells[Math.min(index, cells.length - 1)];
        table.rows[i].insertBefore(newCell(), action === 'colLeft' ? ref : ref.nextSibling);
      }
    } else if (action === 'delRow') {
      if (table.rows.length <= 1) table.remove(); else row.remove();
    } else if (action === 'delCol') {
      if (row.cells.length <= 1) {
        table.remove();
      } else {
        for (i = 0; i < table.rows.length; i++) {
          if (table.rows[i].cells[index]) table.rows[i].cells[index].remove();
        }
      }
    } else if (action === 'delTable') {
      table.remove();
    }
    savedRange = null;
    afterChange();
  }

  // ------------------------------------------------------------------
  // Imagens
  // ------------------------------------------------------------------

  function clearImageSelection() {
    if (selectedImage) selectedImage.classList.remove('sel');
    selectedImage = null;
  }

  function insertImageFile(file) {
    if (!file || !/^image\//.test(file.type)) return;
    var reader = new FileReader();
    reader.onload = function () { exec('insertImage', String(reader.result)); };
    reader.readAsDataURL(file);
  }

  $('pick-image').addEventListener('change', function () {
    insertImageFile(this.files && this.files[0]);
  });

  function imageAction(action) {
    var img = selectedImage;
    if (!img) return;
    if (action === 'remove') {
      clearImageSelection();
      img.remove();
    } else if (action === 'left' || action === 'center' || action === 'right') {
      img.style.display = 'block';
      img.style.margin = action === 'left' ? '0 auto 0 0' : action === 'right' ? '0 0 0 auto' : '0 auto';
    } else {
      img.style.width = action + '%';
      img.style.height = 'auto';
    }
    afterChange();
  }

  ed.addEventListener('click', function (event) {
    var target = event.target;
    clearImageSelection();
    if (target && target.tagName === 'IMG') {
      selectedImage = target;
      target.classList.add('sel');
    }
    refreshToolbar();
  });

  // ------------------------------------------------------------------
  // Links
  // ------------------------------------------------------------------

  function openLinkDialog() {
    var el = anchorElement();
    var link = el ? el.closest('a') : null;
    var dlg = $('dlg-link');
    $('l-url').value = link ? link.getAttribute('href') || '' : '';
    dlg.returnValue = '';
    dlg.addEventListener('close', function handler() {
      dlg.removeEventListener('close', handler);
      if (dlg.returnValue === 'remove') {
        exec('unlink');
        return;
      }
      if (dlg.returnValue !== 'ok') return;
      var url = $('l-url').value.trim();
      if (!url) return;
      if (!/^(https?:|mailto:)/i.test(url)) url = 'https://' + url;
      var collapsed = !savedRange || savedRange.collapsed;
      if (collapsed) {
        exec('insertHTML', '<a href="' + escapeHtml(url).replace(/"/g, '&quot;') + '">' + escapeHtml(url) + '</a>');
      } else {
        exec('createLink', url);
      }
    });
    dlg.showModal();
  }

  function openTableDialog() {
    var dlg = $('dlg-table');
    dlg.returnValue = '';
    dlg.addEventListener('close', function handler() {
      dlg.removeEventListener('close', handler);
      if (dlg.returnValue !== 'ok') return;
      var rows = Math.min(50, Math.max(1, parseInt($('t-rows').value, 10) || 1));
      var cols = Math.min(12, Math.max(1, parseInt($('t-cols').value, 10) || 1));
      insertTable(rows, cols);
    });
    dlg.showModal();
  }

  // ------------------------------------------------------------------
  // Barra de ferramentas
  // ------------------------------------------------------------------

  var topbar = $('topbar');

  // Clicar num botão não tira o cursor do texto.
  topbar.addEventListener('mousedown', function (event) {
    if (event.target.closest('button')) event.preventDefault();
  });

  topbar.addEventListener('click', function (event) {
    var button = event.target.closest('button');
    if (!button) return;
    var cmd = button.getAttribute('data-cmd');
    var act = button.getAttribute('data-act');
    var tb = button.getAttribute('data-tb');
    var im = button.getAttribute('data-im');
    if (cmd) exec(cmd);
    else if (tb) tableAction(tb);
    else if (im) imageAction(im);
    else if (act === 'new') newDocument();
    else if (act === 'open') openDocument();
    else if (act === 'save') save(false);
    else if (act === 'saveas') save(true);
    else if (act === 'table') openTableDialog();
    else if (act === 'link') openLinkDialog();
    else if (act === 'image') {
      $('pick-image').value = '';
      $('pick-image').click();
    }
  });

  // ------------------------------------------------------------------
  // Eventos do editor
  // ------------------------------------------------------------------

  document.addEventListener('selectionchange', function () {
    var sel = window.getSelection();
    if (sel.rangeCount && insideEditor(sel.anchorNode)) {
      savedRange = sel.getRangeAt(0).cloneRange();
      refreshToolbar();
    }
  });

  ed.addEventListener('input', function () {
    fixFontSizes();
    normalizeBlocks();
    if (!ed.firstChild) ed.innerHTML = EMPTY;
    setDirty(true);
    updateCount();
  });

  ed.addEventListener('paste', function (event) {
    var data = event.clipboardData;
    if (!data) return;
    var i;
    for (i = 0; i < data.files.length; i++) {
      if (/^image\//.test(data.files[i].type)) {
        event.preventDefault();
        insertImageFile(data.files[i]);
        return;
      }
    }
    var html = data.getData('text/html');
    if (html) {
      event.preventDefault();
      exec('insertHTML', sanitize(html));
    }
  });

  ed.addEventListener('keydown', function (event) {
    if (event.key !== 'Tab' || event.ctrlKey || event.altKey || event.metaKey) return;
    event.preventDefault();
    var el = anchorElement();
    if (el && el.closest('li')) {
      exec(event.shiftKey ? 'outdent' : 'indent');
    } else if (!event.shiftKey) {
      exec('insertHTML', '&emsp;');
    }
  });

  document.addEventListener('keydown', function (event) {
    if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
    var key = event.key.toLowerCase();
    if (key === 's') {
      event.preventDefault();
      save(event.shiftKey);
    } else if (key === 'o') {
      event.preventDefault();
      openDocument();
    } else if (key === 'n') {
      event.preventDefault();
      newDocument();
    } else if (key === 'k') {
      event.preventDefault();
      openLinkDialog();
    }
  });

  window.addEventListener('beforeunload', function (event) {
    if (!desktop && dirty) {
      event.preventDefault();
      event.returnValue = '';
    }
  });

  // ------------------------------------------------------------------
  // Início
  // ------------------------------------------------------------------

  function offerDraft() {
    var raw = null;
    try { raw = localStorage.getItem(DRAFT_KEY); } catch (e) { raw = null; }
    if (!raw) return;
    var draft = null;
    try { draft = JSON.parse(raw); } catch (e) { draft = null; }
    if (!draft || typeof draft.html !== 'string') {
      clearDraft();
      return;
    }
    ask('Há um texto que não foi salvo da última vez. Deseja recuperar?', {
      yes: 'Recuperar', no: 'Descartar', cancel: null
    }).then(function (answer) {
      if (answer === 'yes') {
        filePath = draft.path || null;
        fileName = draft.name || null;
        window.JFPPage.set(draft.page || null);
        setContent(sanitize(draft.html));
        setDirty(true);
      } else if (answer === 'no') {
        clearDraft();
      }
    });
  }

  window.JFPPage.onChange = function () { setDirty(true); };
  document.execCommand('defaultParagraphSeparator', false, 'p');
  document.execCommand('styleWithCSS', false, true);
  setContent(EMPTY);
  setDirty(false);
  setInterval(saveDraft, 4000);

  if (desktop) {
    desktop.onSaveAndClose(function () {
      save(false).then(function (ok) { if (ok) desktop.closeNow(); });
    });
    desktop.startupFile().then(function (file) {
      if (file) loadDocument(baseName(file.path), file.path, file.content);
      else offerDraft();
    });
  } else {
    offerDraft();
  }

  ed.focus();
})();
