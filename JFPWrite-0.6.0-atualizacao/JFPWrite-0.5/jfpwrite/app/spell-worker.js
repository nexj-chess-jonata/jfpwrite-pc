// JFPWrite - dicionário de português em segundo plano.
// Roda separado do programa principal para a janela nunca travar enquanto o dicionário carrega.
const { parentPort } = require('worker_threads');
const fs = require('fs');
const path = require('path');

let speller = null;

try {
  const nspell = require('nspell');
  const dir = path.join(__dirname, '..', 'node_modules', 'dictionary-pt-br');
  const aff = fs.readFileSync(path.join(dir, 'index.aff'));
  const dic = fs.readFileSync(path.join(dir, 'index.dic'));
  speller = nspell(aff, dic);
  parentPort.postMessage({ type: 'ready' });
} catch (e) {
  parentPort.postMessage({ type: 'failed' });
}

function wordOk(word) {
  if (speller.correct(word)) return true;
  if (word.indexOf('-') > 0) {
    return word.split('-').every((part) => part.length < 2 || speller.correct(part));
  }
  return false;
}

parentPort.on('message', (msg) => {
  if (!msg || msg.type !== 'check') return;
  const wrong = [];
  if (speller && Array.isArray(msg.words)) {
    for (const raw of msg.words) {
      const word = String(raw);
      if (wordOk(word)) continue;
      let suggestions = [];
      try { suggestions = speller.suggest(word).slice(0, 5); } catch (e) { suggestions = []; }
      wrong.push({ w: word, s: suggestions });
    }
  }
  parentPort.postMessage({ type: 'result', id: msg.id, wrong });
});
