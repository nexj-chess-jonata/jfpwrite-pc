/* JFPWrite - motor de regras de português (ortografia, gramática, pontuação, estilo).
   Funciona sem internet. Cada regra só dispara em casos de baixo risco de falso alarme. */
(function (root) {
  'use strict';

  var B = '(?<![\\p{L}\\p{N}_])';
  var E = '(?![\\p{L}\\p{N}_])';
  var TYPES = { ortho: 'Ortografia', gram: 'Gramática', punct: 'Pontuação', style: 'Estilo' };
  var rules = [];

  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function like(orig, rep) { return /^\p{Lu}/u.test(orig) ? cap(rep) : rep; }

  var CASE_SENSITIVE = { 'maiuscula-frase': 1, 'ponto-sem-espaco': 1, 'conj-virgula': 1 };

  function add(id, type, pattern, msg, fix, filter) {
    var flags = CASE_SENSITIVE[id] ? 'gu' : 'giu';
    rules.push({ id: id, type: type, re: new RegExp(pattern, flags), msg: msg, fix: fix, filter: filter || null });
  }

  /** Expressão fixa: o texto errado vira uma ou mais sugestões. */
  function phrase(id, type, wrong, rights, msg) {
    add(id, type, B + wrong + E, msg, function (m) {
      return rights.map(function (r) { return like(m[0], r); });
    });
  }

  // ------------------------------------------------------------------
  // Crase e preposições
  // ------------------------------------------------------------------

  add('crase-repetida', 'gram', B + '(\\p{L}{2,}) à \\1' + E,
    'Expressões com a mesma palavra repetida não levam crase (ex.: "dia a dia", "passo a passo").',
    function (m) { return [m[0].replace(/ à /i, ' a ')]; });

  add('crase-fixas', 'gram', B + 'à (partir|respeito|princípio|seguir|favor|bordo|pé|olho nu|fim de|cavalo)' + E,
    'Antes de palavra masculina ou de verbo não há crase: "a partir", "a respeito", "a princípio", "a seguir", "a favor"...',
    function (m) { return [like(m[0], 'a ' + m[1])]; });

  add('crase-prazo', 'gram', B + 'à (longo|curto|médio) prazo' + E,
    'Antes de palavra masculina não há crase: "a longo prazo".',
    function (m) { return [like(m[0], 'a ' + m[1] + ' prazo')]; });

  add('crase-masc', 'gram', B + 'à (um|uns|este|esse|ele|eles|todos?|cada|quem|isto|isso|vocês?)' + E,
    'Não se usa crase antes de palavra masculina, de pronome ou de "cada".',
    function (m) { return [like(m[0], 'a ' + m[1])]; });

  add('crase-aquele', 'gram', B + 'à (aquele|aquela|aqueles|aquelas|aquilo)' + E,
    'A preposição "a" + "aquele(s)/aquela(s)/aquilo" forma "àquele(s)", "àquela(s)", "àquilo".',
    function (m) { return [like(m[0], 'à' + m[1].slice(1))]; });

  add('apesar-de', 'gram', B + 'à pesar de' + E, 'A forma correta é "apesar de".', function () { return ['apesar de']; });

  add('a-medida-que', 'gram', B + 'a medida que' + E,
    'Locução com crase: "à medida que".', function () { return ['à medida que']; });

  add('a-medida-em-que', 'gram', B + '(?:a|à) medida em que' + E,
    '"À medida que" (proporção) e "na medida em que" (porque) têm sentidos diferentes; escolha a que combina com o seu texto.',
    function () { return ['à medida que', 'na medida em que']; });

  add('as-vezes', 'gram', '(?<=^|[.!?]\\s+|,\\s+)(?:as|ás) vezes' + E,
    'Locução adverbial com crase: "às vezes".', function (m) { return [like(m[0], 'às vezes')]; });

  add('as-horas', 'gram', B + 'ás (?=vezes|\\d)', '"Ás" é carta de baralho; a contração é "às".', function () { return ['às ']; });

  add('a-nivel-de', 'gram', B + '(?:a|à) nível de' + E,
    '"A nível de" é expressão criticada pela norma culta; prefira "em nível de" ou "no âmbito de".',
    function (m) { return [like(m[0], 'em nível de'), like(m[0], 'no âmbito de')]; });

  add('afim-de', 'gram', B + 'afim de' + E,
    '"Afim" é adjetivo (palavras afins). A locução de finalidade é "a fim de".', function (m) { return [like(m[0], 'a fim de')]; });

  add('ha-tempo', 'gram', '(?<!daqui )' + B + 'a (muito tempo|pouco tempo|algum tempo|décadas|séculos)' + E,
    'Para tempo já passado use "há" (verbo haver): "há muito tempo".',
    function (m) { return [like(m[0], 'há ' + m[1])]; });

  add('ha-atras', 'style',
    B + 'há (?:\\d+|um|uma|dois|duas|três|quatro|cinco|seis|sete|oito|nove|dez|muitos|vários|alguns|poucos|(?:muito|pouco|algum) tempo)(?: (?:anos?|mes(?:es)?|dias?|semanas?|horas?|minutos?|décadas?|séculos?))? atrás' + E,
    'Pleonasmo: "há" e "atrás" indicam tempo passado ao mesmo tempo. Use só um dos dois.',
    function (m) { return [m[0].replace(/ atrás$/i, ''), m[0].replace(/^há /i, '')]; });

  // ------------------------------------------------------------------
  // Verbos e concordância
  // ------------------------------------------------------------------

  add('houveram', 'gram', B + 'houveram' + E,
    'No sentido de "existir" ou "ocorrer", o verbo haver é impessoal e fica no singular: "houve".',
    function (m) { return [like(m[0], 'houve')]; });

  add('haviam-quant', 'gram', B + 'haviam (?=muit|vári|pouc|algun|alguma|diversos|diversas|centenas|milhares|tantos|tantas)',
    'No sentido de "existir", o verbo haver é impessoal e fica no singular: "havia".',
    function (m) { return [like(m[0], 'havia ')]; });

  add('devem-haver', 'gram', B + '(devem|podem|vão|irão|poderiam|deveriam|costumam) haver' + E,
    'O verbo "haver" no sentido de "existir" é impessoal; o verbo auxiliar também fica no singular: "deve haver", "pode haver".',
    function (m) {
      var map = { devem: 'deve', podem: 'pode', 'vão': 'vai', 'irão': 'irá', poderiam: 'poderia', deveriam: 'deveria', costumam: 'costuma' };
      return [like(m[0], map[m[1].toLowerCase()] + ' haver')];
    });

  add('fazem-tempo', 'gram',
    B + 'fazem(?= (?:\\d+|um|dois|três|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|vinte|trinta|muitos|vários|alguns|poucos) (?:anos?|mes(?:es)?|dias?|semanas?|horas?|minutos?) que' + E + ')',
    'O verbo "fazer" indicando tempo decorrido é impessoal: "faz dois anos que...".',
    function (m) { return [like(m[0], 'faz')]; });

  add('haja-visto', 'gram', B + 'haja visto' + E, 'A expressão correta é "haja vista".', function (m) { return [like(m[0], 'haja vista')]; });

  var ACC = { tem: 'têm', vem: 'vêm', mantem: 'mantêm', contem: 'contêm', obtem: 'obtêm', retem: 'retêm', detem: 'detêm', provem: 'provêm', convem: 'convêm', intervem: 'intervêm' };
  add('plural-tem', 'gram',
    B + '(eles|elas|vocês)((?: não| já| também| sempre| nunca| ainda)?) (tem|vem|mantem|contem|obtem|retem|detem|provem|convem|intervem)' + E,
    'Na terceira pessoa do plural, estes verbos levam acento circunflexo: "têm", "vêm", "mantêm"...',
    function (m) { return [m[1] + m[2] + ' ' + ACC[m[3].toLowerCase()]]; });

  add('para-mim-verbo', 'gram', B + '(para|pra) mim (\\p{L}+(?:ar|er|ir)|ir)' + E,
    '"Mim" não pratica a ação do verbo. Use "eu": "para eu fazer".',
    function (m) { return [m[1] + ' eu ' + m[2]]; },
    function (m) { return !/^(mulher|colher|prazer|lazer|lugar|mar|par|bar|lar|ar)$/i.test(m[2]); });

  add('entre-eu', 'gram', B + 'entre eu e' + E, 'Depois de preposição usa-se "mim": "entre mim e você".', function (m) { return [like(m[0], 'entre mim e')]; });

  var AGENTE = { vamos: 'vai', fomos: 'foi', somos: 'é', temos: 'tem', estamos: 'está', queremos: 'quer', podemos: 'pode', devemos: 'deve', precisamos: 'precisa', fazemos: 'faz', temos2: 'tem' };
  add('a-gente-plural', 'gram', B + 'a gente (vamos|fomos|somos|temos|estamos|queremos|podemos|devemos|precisamos|fazemos)' + E,
    '"A gente" pede o verbo na terceira pessoa do singular: "a gente vai".',
    function (m) { return [m[0].slice(0, 8) + AGENTE[m[1].toLowerCase()]]; });

  var SUBJ = { ver: 'vir', ter: 'tiver', querer: 'quiser', fazer: 'fizer', poder: 'puder', estar: 'estiver', dizer: 'disser', trazer: 'trouxer', haver: 'houver', saber: 'souber', dar: 'der' };
  add('futuro-subj', 'gram',
    B + '(se|quando|caso|assim que|logo que|enquanto|sempre que) (eu|ele|ela|você|a gente|eles|elas|vocês) (ver|ter|querer|fazer|poder|estar|dizer|trazer|haver|saber|dar)' + E,
    'Depois de "se", "quando", "caso"... o verbo vai no futuro do subjuntivo (ex.: "se eu vir", "quando ele fizer", "se eles puderem").',
    function (m) {
      var plural = /^(eles|elas|vocês)$/i.test(m[2]);
      var form = SUBJ[m[3].toLowerCase()] + (plural ? 'em' : '');
      return [m[1] + ' ' + m[2] + ' ' + form];
    });

  add('vende-se', 'gram', B + '(vende|aluga|compra|conserta|precisa|procura|oferece|admite|contrata|faz)-se (\\p{L}+)' + E,
    'Com a partícula "se" (voz passiva), o verbo concorda com o que vem depois: "Vendem-se casas", "Alugam-se salas".',
    function (m) { return [m[1] + 'm-se ' + m[2]]; },
    function (m) {
      return /(?:[aeo]s|ões|ães|ais|eis|ns|res)$/i.test(m[2]) &&
        !/^(mais|menos|pois|antes|jamais|demais|atrás|às|os|as|des|res|ns|eis|ais|dois|três|meses)$/i.test(m[2]);
    });

  add('gerundismo', 'style', B + '(vou|vai|vamos|vão|irei|irá|iremos|irão) estar (\\p{L}+?)(ando|endo|indo)' + E,
    'Possível gerundismo ("vou estar enviando"). Em textos formais prefira o verbo simples: "vou enviar" ou "enviarei".',
    function (m) {
      var end = { ando: 'ar', endo: 'er', indo: 'ir' }[m[3].toLowerCase()];
      return [m[1] + ' ' + m[2] + end];
    },
    function (m) { return !/^(chov|garo|nev|vent|trovej|relampej|amanhec|anoitec)$/i.test(m[2]); });

  // ------------------------------------------------------------------
  // Uso de palavras
  // ------------------------------------------------------------------

  add('porque-substantivo', 'gram', B + '(o|um|este|esse|seu|meu|nosso|do|no|pelo) porque' + E,
    'Quando é substantivo (o motivo), usa-se "porquê", junto e com acento.',
    function (m) { return [m[1] + ' porquê']; });

  add('por-que-final', 'gram', B + 'por que(?=[.?!…](?:\\s|$))',
    'No fim da frase, "por quê" leva acento circunflexo.', function (m) { return [like(m[0], 'por quê')]; });

  add('porque-final', 'gram', B + 'porque(?=[.?!…](?:\\s|$))',
    'No fim da frase, use "por quê" (separado e com acento).', function (m) { return [like(m[0], 'por quê'), like(m[0], 'porquê')]; });

  add('mau-mal', 'gram',
    B + '(um|o|seu|este|esse|nosso|meu) mal (aluno|professor|exemplo|hábito|humor|comportamento|sinal|momento|resultado|funcionamento|negócio|caráter|gosto|cheiro|jeito|motorista|pagador|presságio|agouro|profissional|atendimento)' + E,
    '"Mau" (oposto de bom) acompanha substantivos; "mal" (oposto de bem) acompanha verbos e adjetivos.',
    function (m) { return [m[0].replace(/ mal /i, ' mau ')]; });

  add('meia-meio', 'gram', B + 'meia (?=(?:cansad|nervos|tristes?|confus|distraíd|tont|brav|louc|doente|chat|assustad|envergonhad|atrasad|preocupad)\\p{L}*' + E + ')',
    '"Meio", no sentido de "um pouco", é advérbio e não varia: "meio cansada".', function () { return ['meio ']; });

  add('mas-virgula', 'punct', '(?<=\\p{L}) mas (?=\\p{L})',
    'Use vírgula antes de "mas" (conjunção adversativa).', function () { return [', mas ']; });

  add('conj-virgula', 'punct',
    '(?<=(?:^|[.!?]\\s+))' + '(Portanto|Entretanto|Contudo|Todavia|Ademais|Além disso|Ou seja|Por exemplo|Em suma|Por outro lado|Em contrapartida|No entanto)(?=\\s+\\p{L})',
    'Expressões de ligação no início da frase pedem vírgula depois delas.',
    function (m) { return [m[1] + ',']; });

  phrase('conserteza', 'ortho', 'conserteza', ['com certeza'], 'O correto é "com certeza" (separado).');
  phrase('porisso', 'ortho', 'porisso', ['por isso'], 'O correto é "por isso" (separado).');
  phrase('derrepente', 'ortho', 'derrepente', ['de repente'], 'O correto é "de repente" (separado).');
  phrase('email', 'ortho', 'email(s?)', ['e-mail'], 'A grafia registrada é "e-mail", com hífen.');
  rules[rules.length - 1].fix = function (m) { return ['e-mail' + (m[1] || '')]; };

  // ------------------------------------------------------------------
  // Pleonasmos
  // ------------------------------------------------------------------

  var PLEO = [
    ['(sobe|subir|subiu|sobem|subimos|subindo|subi) para cima', 1, 'subir para cima'],
    ['(desce|descer|desceu|descem|descemos|descendo|desci) para baixo', 1, 'descer para baixo'],
    ['(entra|entrar|entrou|entram|entramos|entrando|entrei) para dentro', 1, 'entrar para dentro'],
    ['(sai|sair|saiu|saem|saímos|saindo|saí) para fora', 1, 'sair para fora'],
    ['(repete|repetir|repetiu|repetem|repetimos|repetindo|repeti) de novo', 1, 'repetir de novo'],
    ['(elos?) de ligação', 1, 'elo de ligação'],
    ['(surpresas?) inesperadas?', 1, 'surpresa inesperada'],
    ['(encara|encarar|encarou|encaram|encarando) de frente', 1, 'encarar de frente'],
    ['(conviv\\p{L}+) juntos', 1, 'conviver juntos'],
    ['(breve) resumo', 0, 'breve resumo']
  ];
  PLEO.forEach(function (p, i) {
    add('pleonasmo-' + i, 'style', B + p[0] + E, 'Pleonasmo (repetição desnecessária de ideia: "' + p[2] + '"). Basta dizer uma vez.',
      function (m) { return [p[1] ? m[1] : 'resumo']; });
  });

  add('reais', 'style', 'R\\$\\s?\\d[\\d.]*(?:,\\d+)? reais' + E, 'Pleonasmo: o símbolo R$ já indica reais.',
    function (m) { return [m[0].replace(/ reais$/i, '')]; });

  // ------------------------------------------------------------------
  // Acordo Ortográfico e grafias frequentes
  // ------------------------------------------------------------------

  var AO = {
    'auto-estima': 'autoestima', 'auto-escola': 'autoescola', 'auto-medicação': 'automedicação', 'auto-avaliação': 'autoavaliação',
    'auto-clave': 'autoclave', 'co-piloto': 'copiloto', 'co-autor': 'coautor', 'co-autora': 'coautora', 'co-fundador': 'cofundador',
    'co-morbidade': 'comorbidade', 'co-ordenação': 'coordenação', 'extra-oficial': 'extraoficial', 'extra-conjugal': 'extraconjugal',
    'infra-estrutura': 'infraestrutura', 'semi-final': 'semifinal', 'semi-crítico': 'semicrítico', 'super-mercado': 'supermercado',
    'mini-saia': 'minissaia', 'mini-mercado': 'minimercado', 'microondas': 'micro-ondas', 'contra-indicação': 'contraindicação',
    'contra-indicações': 'contraindicações', 'contra-senso': 'contrassenso', 'ante-projeto': 'anteprojeto', 'ante-braço': 'antebraço',
    'anti-social': 'antissocial', 'anti-semita': 'antissemita', 'anti-bacteriano': 'antibacteriano', 'anti-biótico': 'antibiótico',
    'anti-séptico': 'antisséptico', 'bi-anual': 'bianual', 'macro-economia': 'macroeconomia', 'micro-empresa': 'microempresa',
    'multi-cultural': 'multicultural', 'ultra-som': 'ultrassom', 'ultra-sonografia': 'ultrassonografia', 'infra-vermelho': 'infravermelho',
    'intra-venosa': 'intravenosa', 'intra-muscular': 'intramuscular', 'sub-cutânea': 'subcutânea', 'sub-cutâneo': 'subcutâneo',
    'hiper-tensão': 'hipertensão', 'hipo-glicemia': 'hipoglicemia', 'supra-púbico': 'suprapúbico', 'tele-atendimento': 'teleatendimento',
    're-educar': 'reeducar', 're-eleição': 'reeleição', 'neo-liberal': 'neoliberal',
    'idéia': 'ideia', 'idéias': 'ideias', 'assembléia': 'assembleia', 'geléia': 'geleia', 'platéia': 'plateia', 'européia': 'europeia',
    'jóia': 'joia', 'jóias': 'joias', 'bóia': 'boia', 'heróico': 'heroico', 'paranóico': 'paranoico',
    'estóico': 'estoico', 'asteróide': 'asteroide', 'alcalóide': 'alcaloide', 'tramóia': 'tramoia',
    'pára': 'para', 'pólo': 'polo', 'pólos': 'polos', 'pêlo': 'pelo', 'pêlos': 'pelos', 'pêra': 'pera',
    'bilíngüe': 'bilíngue', 'freqüente': 'frequente', 'freqüência': 'frequência', 'seqüência': 'sequência', 'conseqüência': 'consequência',
    'tranqüilo': 'tranquilo', 'lingüiça': 'linguiça', 'lingüística': 'linguística', 'pingüim': 'pinguim', 'cinqüenta': 'cinquenta',
    'eqüidade': 'equidade', 'argüir': 'arguir', 'delinqüente': 'delinquente'
  };
  var MISSPELL = {
    'excessão': 'exceção', 'excessões': 'exceções', 'pretencioso': 'pretensioso', 'pretenciosa': 'pretensiosa', 'paralizar': 'paralisar',
    'paralização': 'paralisação', 'analizar': 'analisar', 'atrazar': 'atrasar', 'atrazo': 'atraso', 'reinvindicar': 'reivindicar',
    'reinvindicação': 'reivindicação', 'espectativa': 'expectativa', 'expontâneo': 'espontâneo', 'expontânea': 'espontânea',
    'impecilho': 'empecilho', 'mortandela': 'mortadela', 'beringela': 'berinjela', 'bandeija': 'bandeja', 'cabeleleiro': 'cabeleireiro',
    'cincoenta': 'cinquenta', 'adevogado': 'advogado', 'advinhar': 'adivinhar', 'seje': 'seja', 'obrigatóriamente': 'obrigatoriamente',
    'previlégio': 'privilégio', 'beneficiente': 'beneficente', 'pesquiza': 'pesquisa', 'desinteria': 'disenteria', 'asterístico': 'asterisco', 'iorgute': 'iogurte'
  };
  var TABLE = {};
  Object.keys(AO).forEach(function (k) { if (k !== AO[k]) TABLE[k] = { to: AO[k], msg: 'Grafia segundo o Acordo Ortográfico em vigor.' }; });
  Object.keys(MISSPELL).forEach(function (k) { if (k !== MISSPELL[k]) TABLE[k] = { to: MISSPELL[k], msg: 'Grafia incorreta.' }; });
  var keys = Object.keys(TABLE).sort(function (a, b) { return b.length - a.length; })
    .map(function (k) { return k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); });
  add('grafia', 'ortho', B + '(' + keys.join('|') + ')' + E, 'Grafia incorreta.',
    function (m) {
      var entry = TABLE[m[1].toLowerCase()];
      return entry ? [like(m[1], entry.to)] : [];
    });

  // Regras gerais do Acordo (valem para qualquer palavra)
  add('ao-eem', 'ortho', B + '\\p{L}*êem' + E, 'Pelo Acordo Ortográfico, "êem" perdeu o acento: "veem", "leem", "creem".',
    function (m) { return [m[0].replace(/êem/i, 'eem')]; });
  add('ao-oo', 'ortho', B + '\\p{L}*ôo' + E, 'Pelo Acordo Ortográfico, "ôo" perdeu o acento: "voo", "enjoo", "perdoo".',
    function (m) { return [m[0].replace(/ôo/i, 'oo')]; });
  add('ao-trema', 'ortho', B + '\\p{L}*[gq]ü[eiéíêè]\\p{L}*' + E, 'O trema foi abolido no português: "frequente", "tranquilo", "linguiça".',
    function (m) { return [m[0].replace(/ü/i, 'u')]; });
  add('ao-ei-oi', 'ortho', B + '\\p{L}*(?:éi(?:as?)|ói(?:as?|c[oa]s?|des?))' + E,
    'Pelo Acordo Ortográfico, ditongos abertos "ei" e "oi" perdem o acento em palavras paroxítonas: "ideia", "joia", "heroico".',
    function (m) { return [m[0].replace(/éi/i, 'ei').replace(/ói/i, 'oi')]; });
  add('adv-mente', 'ortho', B + '\\p{L}*[áàâéêíóôú]\\p{L}*mente' + E,
    'Advérbios terminados em "-mente" não mantêm o acento do adjetivo: "rapidamente", "obrigatoriamente".',
    function (m) {
      var plain = { á: 'a', à: 'a', â: 'a', é: 'e', ê: 'e', í: 'i', ó: 'o', ô: 'o', ú: 'u', Á: 'A', É: 'E', Í: 'I', Ó: 'O', Ú: 'U' };
      return [m[0].replace(/[áàâéêíóôúÁÉÍÓÚ]/g, function (c) { return plain[c]; })];
    },
    function (m) { return !/^(?:mente|demente|clemente|inclemente)$/i.test(m[0]); });

  // ------------------------------------------------------------------
  // Pontuação e espaços
  // ------------------------------------------------------------------

  add('palavra-repetida', 'gram',
    B + '(de|da|do|das|dos|em|no|na|nos|nas|que|para|com|por|se|um|uma|uns|umas|o|os|as|e|mas|ao|aos|à|às|pelo|pela|não) \\1' + E,
    'Palavra repetida sem querer.', function (m) { return [m[1]]; });

  add('espaco-duplo', 'punct', '(?<=\\S) {2,}(?=\\S)', 'Espaço duplicado.', function () { return [' ']; });

  add('espaco-antes', 'punct', '(?<=[\\p{L}\\p{N}]) +([,.;:!?])(?![.,;:!?\\d])', 'Não se deixa espaço antes deste sinal de pontuação.',
    function (m) { return [m[1]]; });

  add('espaco-depois', 'punct', '\\p{L}[,;:!?]\\p{L}', 'Falta espaço depois do sinal de pontuação.',
    function (m) { return [m[0].charAt(0) + m[0].charAt(1) + ' ' + m[0].charAt(2)]; });

  add('ponto-sem-espaco', 'punct', '\\p{Ll}\\.\\p{Lu}\\p{Ll}', 'Falta espaço depois do ponto.',
    function (m) { return [m[0].charAt(0) + '. ' + m[0].slice(2)]; });

  add('pontos-dois', 'punct', '(?<![.])\\.\\.(?![.])', 'Dois pontos seguidos: use um ponto final ou reticências (três pontos).',
    function () { return ['.', '...']; });

  add('pontuacao-dupla', 'punct', '([,;:])\\1+', 'Sinal de pontuação repetido.', function (m) { return [m[1]]; });

  var ABBR = /^(prof|profa|sra|sras|srs|dra|dras|págs?|exs?|figs?|obs|vols?|caps?|arts?|inc|ltda|aprox|dept|depto|eds?|tel|núm|séc|apud|cf|etc|ibid|op|cit|av|rua|est|org|orgs|trad|comp|coord|min|máx|seg|ter|qua|qui|sex|dom)$/i;
  add('maiuscula-frase', 'gram', '(?<=[.!?][\"”\')\\]]*\\s+)\\p{Ll}[\\p{L}]*(?![\\p{L}\\p{N}@./:_-])',
    'Início de frase com letra maiúscula.',
    function (m) { return [cap(m[0])]; },
    function (m, text) {
      if (/\p{Lu}/u.test(m[0].slice(1))) return false;
      var before = text.slice(0, m.index);
      if (/(\.\.|…)["”')\]]*\s+$/.test(before)) return false;
      var dot = before.match(/(\p{L}+)\.["”')\]]*\s+$/u);
      if (dot) return dot[1].length >= 4 && !ABBR.test(dot[1]);
      return /[!?]["”')\]]*\s+$/.test(before);
    });

  // ------------------------------------------------------------------
  // Análise
  // ------------------------------------------------------------------

  var URL_RE = /(?:https?:\/\/|www\.)\S+|[\w.+-]+@[\w-]+\.[\w.-]+/gi;

  /** Devolve a lista de problemas do texto, em ordem, sem sobreposição. */
  function analyze(text, opts) {
    opts = opts || {};
    var found = [];
    var masked = [];
    var um;
    URL_RE.lastIndex = 0;
    while ((um = URL_RE.exec(text))) masked.push([um.index, um.index + um[0].length]);

    function inMask(start, end) {
      for (var i = 0; i < masked.length; i++) if (start < masked[i][1] && end > masked[i][0]) return true;
      return false;
    }

    rules.forEach(function (rule) {
      rule.re.lastIndex = 0;
      var m;
      while ((m = rule.re.exec(text))) {
        if (m[0].length === 0) { rule.re.lastIndex++; continue; }
        var start = m.index;
        var end = start + m[0].length;
        if (inMask(start, end)) continue;
        if (rule.filter && !rule.filter(m, text)) continue;
        var fixes = rule.fix ? rule.fix(m) : [];
        fixes = fixes.filter(function (f, i) { return f !== m[0] && fixes.indexOf(f) === i; });
        found.push({ rule: rule.id, type: rule.type, msg: rule.msg, start: start, end: end, text: m[0], fixes: fixes });
      }
    });

    if (opts.paragraph) {
      var first = text.match(/^(\s*)(\p{Ll}[\p{L}]*)(?![\p{L}\p{N}@./:_-])/u);
      if (first && !/\p{Lu}/u.test(first[2].slice(1))) {
        found.push({
          rule: 'maiuscula-inicio', type: 'gram', msg: 'O parágrafo começa com letra maiúscula.',
          start: first[1].length, end: first[1].length + first[2].length, text: first[2], fixes: [cap(first[2])]
        });
      }
    }

    found.sort(function (a, b) { return a.start - b.start || (b.end - b.start) - (a.end - a.start); });
    var kept = [];
    var lastEnd = -1;
    found.forEach(function (f) {
      if (f.start >= lastEnd) { kept.push(f); lastEnd = f.end; }
    });
    return kept;
  }

  var api = { analyze: analyze, TYPES: TYPES, ruleCount: function () { return rules.length; } };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.JFPRules = api;
})(typeof window !== 'undefined' ? window : globalThis);
