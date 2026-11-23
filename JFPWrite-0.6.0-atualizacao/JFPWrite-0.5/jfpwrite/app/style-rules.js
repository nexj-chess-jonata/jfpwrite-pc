/* JFPWrite - camada de estilo culto.
   O autor escolhe o nível de rigor; nada é imposto. Níveis: 0 coloquial, 1 formal, 2 acadêmico, 3 alta cultura. */
(function (root) {
  'use strict';

  var B = '(?<![\\p{L}\\p{N}_])';
  var E = '(?![\\p{L}\\p{N}_])';
  var LEVELS = [
    { id: 'coloquial', name: 'Coloquial', hint: 'Só avisos objetivos (erros), sem sugestões de estilo. Escreva como quiser.' },
    { id: 'formal', name: 'Formal', hint: 'Avisa sobre oralidade, abreviações de chat, clichês e frases muito longas.' },
    { id: 'academico', name: 'Acadêmico', hint: 'Formal, mais vocabulário vago, repetição de palavras e frases com o mesmo começo.' },
    { id: 'alta', name: 'Alta Cultura', hint: 'Acadêmico, mais voz passiva repetida, excesso de "-mente" e de "que".' }
  ];

  var items = [];
  function like(orig, rep) { return /^\p{Lu}/u.test(orig) ? rep.charAt(0).toUpperCase() + rep.slice(1) : rep; }

  function add(id, min, pattern, msg, fix) {
    items.push({ id: id, min: min, re: new RegExp(B + pattern + E, 'giu'), msg: msg, fix: fix || null });
  }

  // ---- Oralidade e abreviações de chat (formal em diante) ----
  var ORAL = { pra: 'para', pro: 'para o', pros: 'para os', pras: 'para as', 'tá': 'está', 'tô': 'estou', tava: 'estava', tavam: 'estavam' };
  add('oral', 1, '(pra|pro|pros|pras|tá|tô|tava|tavam)', 'Forma da fala. Em texto formal use a forma completa.',
    function (m) { return [like(m[1], ORAL[m[1].toLowerCase()])]; });
  add('oral-ne', 1, 'né', 'Marca de oralidade ("não é?"). Em texto formal, retire ou reescreva.');
  add('oral-tipo', 1, 'tipo assim', 'Marca de oralidade. Reescreva de forma direta.');
  var CHAT = { vc: 'você', vcs: 'vocês', pq: 'porque', tb: 'também', tbm: 'também', qdo: 'quando', msm: 'mesmo', hj: 'hoje', obg: 'obrigado', blz: 'certo' };
  add('chat', 1, '(vc|vcs|pq|tb|tbm|qdo|msm|hj|obg|blz)', 'Abreviação de conversa por mensagem. Escreva a palavra por extenso.',
    function (m) {
      var k = m[1].toLowerCase();
      return k === 'pq' ? [like(m[1], 'porque'), like(m[1], 'por que')] : [like(m[1], CHAT[k])];
    });
  add('super', 1, 'super (\\p{L}+)', 'Intensificador da fala. Prefira "muito" ou uma palavra mais precisa.',
    function (m) { return [like(m[0], 'muito ' + m[1])]; });

  // ---- Clichês e fórmulas desgastadas ----
  add('cliche-hoje', 1, 'nos dias (?:de hoje|atuais)', 'Clichê. Muitas vezes basta "hoje" ou "atualmente".',
    function (m) { return [like(m[0], 'hoje'), like(m[0], 'atualmente')]; });
  add('cliche-sombra', 1, 'sem sombra de dúvidas?', 'Clichê. Prefira "sem dúvida" ou "certamente".',
    function (m) { return [like(m[0], 'sem dúvida'), like(m[0], 'certamente')]; });
  add('cliche-fato', 1, '(?:devido ao|em virtude do) fato de que', 'Construção longa. "Porque" ou "pois" dizem o mesmo.',
    function (m) { return [like(m[0], 'porque'), like(m[0], 'pois')]; });
  add('cliche-apesar-fato', 1, 'apesar do fato de que', 'Construção longa. "Embora" diz o mesmo.',
    function (m) { return [like(m[0], 'embora')]; });
  add('cliche-ressaltar', 2, '(?:vale|cabe|convém|é importante|é válido) (?:ressaltar|destacar|salientar|frisar|lembrar|notar) que',
    'Fórmula desgastada. Muitas vezes é melhor apresentar a informação diretamente.');
  add('cliche-sabem', 1, 'como (?:todos|todo mundo) (?:sabem|sabemos|sabe)', 'Clichê. Se é óbvio, pode sair; se não é, explique.');
  add('cliche-seculo', 1, 'em pleno século (?:XX|XXI)', 'Clichê jornalístico.');
  add('cliche-passagem', 1, 'diga-se de passagem', 'Fórmula desgastada. Diga o que importa sem o aviso.');
  add('cliche-opiniao', 1, 'na minha opinião,? eu (?:acho|penso|creio|acredito)', 'Redundância: "na minha opinião" e "eu acho" dizem a mesma coisa.');
  add('cliche-relacao', 2, 'com relação a', 'Expressão criticada. Prefira "quanto a", "sobre" ou "em relação a".',
    function (m) { return [like(m[0], 'quanto a'), like(m[0], 'sobre'), like(m[0], 'em relação a')]; });
  add('cliche-respeito', 2, 'no que diz respeito a', 'Construção longa. "Quanto a" ou "sobre" bastam.',
    function (m) { return [like(m[0], 'quanto a'), like(m[0], 'sobre')]; });

  // ---- Vocabulário vago e oralidade em texto acadêmico ----
  add('vago', 2, 'coisas?', 'Palavra vaga. Prefira o termo específico.');
  add('a-gente', 2, 'a gente', 'Em textos acadêmicos prefira "nós" ou uma construção impessoal.');

  // ---- Cacofonia ----
  add('cacofonia', 1, '(?:por cada|boca dela|vez passada|marca dela|nunca já|mão dela)',
    'Possível cacofonia: as palavras juntas formam um som indesejado. Considere reescrever.');

  // ---- Estruturas ----
  var STOP = /^(também|porque|ainda|sempre|muito|muitos|muitas|sobre|entre|assim|quando|então|todos|todas|outros|outras|mesmo|mesma|nosso|nossa|depois|antes|apenas|além|durante|segundo|através|contra|desde|dentro|embora|porém|portanto|contudo|enquanto|qualquer|alguns|algumas|cada|onde|aqui|desta|deste|nesta|neste|dessa|desse|nessa|nesse|esta|este|essa|esse|aquela|aquele|seria|poderia|deveria|estão|estava|estavam|foram|serão|haver|fazer|sendo|ficar|pode|podem|devem|deve|forma|parte|vezes|ainda|mais|menos|pouco|poucos|tanto|tanta|tantos|nenhum|nenhuma|número|casos|caso)$/i;

  function sentences(text) {
    var out = [];
    var re = /[^.!?\n]+[.!?]*/g;
    var m;
    while ((m = re.exec(text))) {
      var raw = m[0];
      var lead = raw.length - raw.replace(/^\s+/, '').length;
      var body = raw.replace(/^\s+/, '').replace(/\s+$/, '');
      if (!body) continue;
      out.push({ start: m.index + lead, end: m.index + lead + body.length, text: body });
    }
    return out;
  }

  function wordsOf(s) { return s.match(/\p{L}[\p{L}'’-]*/gu) || []; }

  function analyze(text, opts) {
    opts = opts || {};
    var level = typeof opts.level === 'number' ? opts.level : 1;
    var found = [];
    if (level < 1) return found;

    items.forEach(function (it) {
      if (level < it.min) return;
      it.re.lastIndex = 0;
      var m;
      while ((m = it.re.exec(text))) {
        if (!m[0].length) { it.re.lastIndex++; continue; }
        var fixes = it.fix ? it.fix(m) : [];
        fixes = fixes.filter(function (f, i) { return f !== m[0] && fixes.indexOf(f) === i; });
        found.push({ rule: it.id, type: 'style', msg: it.msg, start: m.index, end: m.index + m[0].length, text: m[0], fixes: fixes });
      }
    });

    var sents = sentences(text);

    // Frase muito longa
    sents.forEach(function (s) {
      var n = wordsOf(s.text).length;
      if (n > 45) {
        found.push({
          rule: 'frase-longa', type: 'style', start: s.start, end: s.end, text: s.text, fixes: [],
          msg: 'Frase com ' + n + ' palavras. Dividir em duas ou mais costuma deixar o texto mais claro.'
        });
      }
    });

    if (level >= 2) {
      // Três frases seguidas com o mesmo começo
      for (var i = 2; i < sents.length; i++) {
        var a = wordsOf(sents[i - 2].text)[0], b = wordsOf(sents[i - 1].text)[0], c = wordsOf(sents[i].text)[0];
        if (a && b && c && a.length > 2 && a.toLowerCase() === b.toLowerCase() && b.toLowerCase() === c.toLowerCase()) {
          var wm = /\p{L}[\p{L}'’-]*/u.exec(sents[i].text);
          found.push({
            rule: 'inicio-repetido', type: 'style', start: sents[i].start + wm.index, end: sents[i].start + wm.index + wm[0].length,
            text: wm[0], fixes: [], msg: 'Três frases seguidas começam com a mesma palavra. Varie o início.'
          });
        }
      }

      // Repetição de palavra de perto
      var toks = [];
      var re = /\p{L}[\p{L}'’-]*/gu;
      var t;
      while ((t = re.exec(text))) toks.push({ w: t[0], lower: t[0].toLowerCase(), start: t.index, end: t.index + t[0].length });
      var last = {};
      toks.forEach(function (tk, idx) {
        if (tk.lower.length < 6 || STOP.test(tk.lower)) return;
        if (last[tk.lower] !== undefined && idx - last[tk.lower] <= 15) {
          found.push({
            rule: 'repeticao', type: 'style', start: tk.start, end: tk.end, text: tk.w, fixes: [],
            msg: 'A palavra "' + tk.lower + '" já apareceu há poucas palavras. Considere um sinônimo ou reescreva.'
          });
        }
        last[tk.lower] = idx;
      });
    }

    if (level >= 3) {
      // Voz passiva repetida no parágrafo
      var pas = [];
      var pr = new RegExp(B + '(?:foi|foram|é|são|era|eram|será|serão|seria|seriam) (?:\\p{L}+mente )?(?:\\p{L}+(?:ado|ada|ados|adas|ido|ida|idos|idas)|feit[oa]s?|escrit[oa]s?|abert[oa]s?|dit[oa]s?|vist[oa]s?|post[oa]s?|pag[oa]s?|aceit[oa]s?|entregues?) (?=(?:por|pelo|pela|pelos|pelas)' + E + ')', 'giu');
      var pm;
      while ((pm = pr.exec(text))) pas.push(pm);
      if (pas.length >= 3) {
        pas.forEach(function (x) {
          found.push({
            rule: 'passiva', type: 'style', start: x.index, end: x.index + x[0].trimEnd().length, text: x[0].trimEnd(), fixes: [],
            msg: 'Voz passiva repetida neste parágrafo (' + pas.length + 'x). A voz ativa costuma dar mais força ao texto.'
          });
        });
      }

      // Excesso de advérbios em -mente
      var adv = [];
      var ar = new RegExp(B + '\\p{L}{3,}mente' + E, 'giu');
      var am;
      while ((am = ar.exec(text))) adv.push(am);
      if (adv.length >= 3) {
        adv.slice(2).forEach(function (x) {
          found.push({
            rule: 'adverbios', type: 'style', start: x.index, end: x.index + x[0].length, text: x[0], fixes: [],
            msg: 'Muitos advérbios em "-mente" neste parágrafo. Eles pesam o ritmo; corte ou troque por um verbo mais preciso.'
          });
        });
      }

      // Excesso de "que" na mesma frase
      sents.forEach(function (s) {
        var qs = [];
        var qr = new RegExp(B + 'que' + E, 'giu');
        var qm;
        while ((qm = qr.exec(s.text))) qs.push(qm);
        if (qs.length >= 4) {
          var x = qs[3];
          found.push({
            rule: 'queismo', type: 'style', start: s.start + x.index, end: s.start + x.index + 3, text: x[0], fixes: [],
            msg: 'Esta frase tem ' + qs.length + ' "que". Reescrever pode deixá-la mais elegante.'
          });
        }
      });
    }

    found.sort(function (x, y) { return x.start - y.start || (y.end - y.start) - (x.end - x.start); });
    var kept = [];
    var lastEnd = -1;
    found.forEach(function (f) {
      if (f.start >= lastEnd) { kept.push(f); lastEnd = f.end; }
    });
    return kept;
  }

  // ---- Legibilidade (índice de Flesch adaptado ao português, Martins et al., 1996) ----
  function syllables(word) {
    var w = word.toLowerCase().replace(/(q|g)u(?=[eéêií])/g, '$1');
    var runs = w.match(/[aeiouáéíóúâêôãõàü]+/g) || [];
    var n = 0;
    runs.forEach(function (run) {
      var c = 1;
      if (run.length >= 3) c = 2;
      var hiatus = run.match(/[aeoáéóâêô](?=[íú])/g);
      if (hiatus) c = Math.max(c, 1) + hiatus.length;
      if (/(aa|ee|oo)/.test(run)) c = Math.max(c, 2);
      n += c;
    });
    return Math.max(1, n);
  }

  function metrics(text) {
    var words = wordsOf(text);
    var sents = text.split(/[.!?]+(?:\s|$)|\n+/).filter(function (s) { return /\p{L}/u.test(s); });
    if (words.length < 30 || !sents.length) return null;
    var syl = 0;
    words.forEach(function (w) { syl += syllables(w); });
    var wps = words.length / sents.length;
    var spw = syl / words.length;
    var score = Math.round(248.835 - 1.015 * wps - 84.6 * spw);
    var label = score >= 75 ? 'muito fácil' : score >= 50 ? 'fácil' : score >= 25 ? 'difícil' : 'muito difícil';
    return { words: words.length, sentences: sents.length, wps: Math.round(wps * 10) / 10, score: score, label: label };
  }

  var api = { analyze: analyze, metrics: metrics, LEVELS: LEVELS, syllables: syllables };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.JFPStyle = api;
})(typeof window !== 'undefined' ? window : globalThis);
