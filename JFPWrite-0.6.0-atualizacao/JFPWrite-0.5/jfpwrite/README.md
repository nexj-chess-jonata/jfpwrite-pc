# JFPWrite

Editor de texto em português para PC (Windows). Versão 0.1 — Fase 1 de 6.

## O que esta fase faz

- Escrever e formatar: estilos (texto normal, títulos 1 a 3, citação), fonte, tamanho, negrito, itálico,
  sublinhado, tachado, cor da letra, realce, alinhamento, listas e recuo.
- Tabelas (inserir, acrescentar e apagar linhas e colunas), imagens (tamanho e posição) e links.
- Novo, Abrir, Salvar e Salvar como, no formato `.jfpw`. Também abre `.txt` e `.html`.
- Contagem de palavras e caracteres, aviso de alterações não salvas e recuperação automática de rascunho.
- Funciona sem internet.

## Próximas fases

2. Página e modos (margens, cabeçalho, rodapé, Modo Foco, Máquina de Escrever, tema escuro).
3. Correção de português (ortografia e gramática com explicação).
4. Estilo culto (vícios de linguagem, sinônimos, modo Alta Cultura, nota de qualidade).
5. Exportação (DOCX, PDF, EPUB, Markdown) e versão para celular.
6. IA de escrita e acabamento.

## Gerar o instalador (GitHub Actions)

1. Envie todos os arquivos desta pasta para um repositório no GitHub (inclusive a pasta `.github`).
2. Na aba **Actions**, rode **Gerar instalador**.
3. Baixe **JFPWrite-Instalador** em *Artifacts* e execute o `.exe`.

## Fase 2 (0.2.0): página e modos
- Configurar página: papel (A4, Carta, A5), retrato/paisagem, margens (Normal, ABNT, Estreita, Ampla ou personalizadas), cabeçalho, rodapé e número de página.
- Espaço entre linhas (1,0 / 1,15 / 1,5 / 2,0).
- Modo Foco (Ctrl+Shift+F, Esc sai), Máquina de escrever e tema escuro.
- Imprimir / salvar em PDF (Ctrl+P) com margens, cabeçalho, rodapé e numeração.
- Os arquivos .jfpw guardam as configurações de página.

## Fase 3 (0.3.0): correção de português
- Painel Revisão (botão ou F7) e sublinhados coloridos no texto: vermelho = ortografia, azul = gramática, laranja = pontuação, roxo = estilo.
- Motor de regras próprio (app/rules.js): crase, concordância, verbos, uso de palavras, Acordo Ortográfico, pontuação, espaços, pleonasmos, gerundismo.
- Dicionário pt-BR aberto (pacote dictionary-pt-br + nspell, no processo principal do Electron). Se o dicionário não carregar, as regras continuam funcionando.
- Corrigir com um clique, Ignorar, Adicionar ao dicionário pessoal. Tudo local; o texto não sai do computador.

## Fase 4 (0.4.0): camada de estilo culto
- Nível de rigor escolhido pelo autor, no painel Revisão: Coloquial, Formal, Acadêmico e Alta Cultura. Nada é imposto.
- Formal: oralidade (pra, tá, né), abreviações de chat (vc, pq), clichês, cacofonia, frases com mais de 45 palavras.
- Acadêmico: acrescenta vocabulário vago, "a gente", repetição de palavras próximas e frases com o mesmo começo.
- Alta Cultura: acrescenta voz passiva repetida, excesso de "-mente" e de "que" na mesma frase.
- Legibilidade estimada (índice de Flesch adaptado ao português).
- Arquivo: app/style-rules.js.

## Fase 5a (0.5.0): exportação (PC)
- Botão Exportar: Word (.docx), PDF, livro digital (.epub) e Markdown (.md; vira .zip se houver imagens).
- DOCX: títulos, negrito/itálico/sublinhado/riscado, cores, marca-texto, tamanhos, listas (com subníveis e numeração reiniciada), tabelas, imagens, links, tamanho de página, margens, entrelinha, cabeçalho, rodapé e número de página.
- EPUB 3 com sumário; cada título 1 vira um capítulo.
- Tudo feito dentro do aplicativo, sem bibliotecas externas e sem internet. Arquivo: app/export.js.
- Ainda falta (Fase 5b): a versão para celular (APK).

## 0.6.0
- "Salvar como" agora oferece três tipos: Documento JFPWrite (.jfpw), Documento do Word (.docx) e PDF (.pdf).
- Word e PDF são cópias: o documento continua aberto e ainda precisa ser salvo como .jfpw para poder ser editado depois.
