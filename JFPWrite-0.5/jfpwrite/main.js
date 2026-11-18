const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require('electron');
const fs = require('fs');
const path = require('path');

let win = null;
let dirty = false;
let forceClose = false;

const FILTERS = [
  { name: 'Documento JFPWrite', extensions: ['jfpw'] },
  { name: 'Texto ou página', extensions: ['txt', 'html', 'htm'] }
];

function fileFromArgs(argv) {
  const found = argv.slice(1).find((a) => /\.(jfpw|txt|html?)$/i.test(a) && fs.existsSync(a));
  return found || null;
}

function readDoc(filePath) {
  return { path: filePath, content: fs.readFileSync(filePath, 'utf8') };
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 760,
    minHeight: 520,
    title: 'JFPWrite',
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  Menu.setApplicationMenu(null);
  win.loadFile(path.join(__dirname, 'app', 'index.html'));

  // Links abrem no navegador, nunca dentro do editor.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    event.preventDefault();
    if (/^https?:/i.test(url)) shell.openExternal(url);
  });

  win.on('close', (event) => {
    if (!dirty || forceClose) return;
    event.preventDefault();
    const choice = dialog.showMessageBoxSync(win, {
      type: 'question',
      buttons: ['Salvar', 'Não salvar', 'Cancelar'],
      defaultId: 0,
      cancelId: 2,
      title: 'JFPWrite',
      message: 'O documento tem alterações que não foram salvas.',
      detail: 'Deseja salvar antes de fechar?'
    });
    if (choice === 0) {
      win.webContents.send('save-and-close');
    } else if (choice === 1) {
      forceClose = true;
      win.close();
    }
  });
}

ipcMain.handle('startup-file', () => {
  const filePath = fileFromArgs(process.argv);
  if (!filePath) return null;
  try {
    return readDoc(filePath);
  } catch (e) {
    return null;
  }
});

ipcMain.handle('open', async () => {
  const result = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: FILTERS });
  if (result.canceled || !result.filePaths.length) return null;
  try {
    return readDoc(result.filePaths[0]);
  } catch (e) {
    dialog.showErrorBox('JFPWrite', 'Não foi possível abrir o arquivo.');
    return null;
  }
});

ipcMain.handle('save', async (event, data) => {
  let filePath = data.path;
  if (!filePath) {
    const result = await dialog.showSaveDialog(win, {
      defaultPath: (data.suggestedName || 'Documento') + '.jfpw',
      filters: [FILTERS[0]]
    });
    if (result.canceled || !result.filePath) return null;
    filePath = result.filePath;
    if (!/\.jfpw$/i.test(filePath)) filePath += '.jfpw';
  }
  try {
    fs.writeFileSync(filePath, data.content, 'utf8');
    return filePath;
  } catch (e) {
    dialog.showErrorBox('JFPWrite', 'Não foi possível salvar o arquivo.');
    return null;
  }
});

ipcMain.handle('export-file', async (event, d) => {
  const ext = String(d.ext || 'bin').replace(/[^a-z0-9]/gi, '');
  const result = await dialog.showSaveDialog(win, {
    defaultPath: (d.suggestedName || 'Documento') + '.' + ext,
    filters: [{ name: d.filterName || ext, extensions: [ext] }]
  });
  if (result.canceled || !result.filePath) return null;
  let target = result.filePath;
  if (!new RegExp('\\.' + ext + '$', 'i').test(target)) target += '.' + ext;
  try {
    fs.writeFileSync(target, Buffer.from(d.data));
    return target;
  } catch (e) {
    dialog.showErrorBox('JFPWrite', 'Não foi possível salvar o arquivo.');
    return null;
  }
});

function esc(text) {
  return String(text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

ipcMain.handle('print-pdf', async (event, d) => {
  const result = await dialog.showSaveDialog(win, {
    defaultPath: (d.suggestedName || 'Documento') + '.pdf',
    filters: [{ name: 'PDF', extensions: ['pdf'] }]
  });
  if (result.canceled || !result.filePath) return false;
  const base = 'font-family:Georgia,serif;font-size:9px;color:#555;width:100%;box-sizing:border-box;';
  const sideL = Number(d.ml) || 2.5;
  const sideR = Number(d.mr) || 2.5;
  const pad = 'padding:0 ' + sideR + 'cm 0 ' + sideL + 'cm;';
  const number = '<span class="pageNumber"></span>';
  const options = {
    preferCSSPageSize: true,
    printBackground: false,
    displayHeaderFooter: !!(d.header || d.footer || d.numbering !== 'none'),
    headerTemplate: '<div style="' + base + pad + 'text-align:center;">' + esc(d.header) + '</div>',
    footerTemplate: '<div style="' + base + pad + 'display:flex;justify-content:space-between;">' +
      '<span style="flex:1;text-align:left;">' + esc(d.footer) + '</span>' +
      '<span style="flex:1;text-align:' + (d.numbering === 'center' ? 'center' : 'right') + ';">' +
      (d.numbering === 'none' ? '' : number) + '</span></div>'
  };
  if (d.numbering === 'center') {
    options.footerTemplate = '<div style="' + base + pad + 'display:flex;">' +
      '<span style="flex:1;text-align:left;">' + esc(d.footer) + '</span>' +
      '<span style="flex:0 0 auto;text-align:center;">' + number + '</span>' +
      '<span style="flex:1;"></span></div>';
  }
  try {
    const pdf = await win.webContents.printToPDF(options);
    fs.writeFileSync(result.filePath, pdf);
    return result.filePath;
  } catch (e) {
    dialog.showErrorBox('JFPWrite', 'Não foi possível gerar o PDF.');
    return false;
  }
});

ipcMain.on('dirty', (event, flag) => {
  dirty = !!flag;
});

ipcMain.on('title', (event, text) => {
  if (win) win.setTitle(text);
});

ipcMain.on('close-now', () => {
  forceClose = true;
  if (win) win.close();
});

// ---- Dicionário de português (roda num processo separado; a janela nunca trava; o texto nunca sai do computador) ----
const { Worker } = require('worker_threads');
let spellWorker = null;
let spellState = 'loading';
let spellSeq = 0;
const spellPending = new Map();

function failPending() {
  for (const resolve of spellPending.values()) resolve([]);
  spellPending.clear();
}

function loadSpeller() {
  try {
    spellWorker = new Worker(path.join(__dirname, 'app', 'spell-worker.js'));
    spellWorker.on('message', (msg) => {
      if (!msg) return;
      if (msg.type === 'ready') spellState = 'ready';
      else if (msg.type === 'failed') spellState = 'none';
      else if (msg.type === 'result') {
        const resolve = spellPending.get(msg.id);
        if (resolve) { spellPending.delete(msg.id); resolve(msg.wrong || []); }
      }
    });
    spellWorker.on('error', () => { spellState = 'none'; spellWorker = null; failPending(); });
    spellWorker.on('exit', () => { if (spellState !== 'ready') spellState = 'none'; spellWorker = null; failPending(); });
  } catch (e) {
    spellWorker = null;
    spellState = 'none';
  }
}

ipcMain.handle('spell-status', () => spellState);

ipcMain.handle('spell-check', (event, words) => {
  if (!spellWorker || spellState !== 'ready' || !Array.isArray(words)) return [];
  return new Promise((resolve) => {
    const id = ++spellSeq;
    spellPending.set(id, resolve);
    spellWorker.postMessage({ type: 'check', id, words: words.slice(0, 400).map(String) });
  });
});

app.whenReady().then(() => {
  createWindow();
  loadSpeller();
});
app.on('window-all-closed', () => app.quit());
