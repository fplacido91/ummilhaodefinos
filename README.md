# Um Milhão de Finos

Um registo auditável para o jogo do contador de finos do WhatsApp: uma **fotografia IMG deduplicada equivale a um fino**, atribuído ao remetente.

## Executar

Não existe passo de compilação. A forma recomendada é servir esta pasta localmente:

```powershell
python -m http.server 4173
```

Depois abra <http://localhost:4173>. Ao iniciar, a aplicação carrega automaticamente os ficheiros canónicos do repositório:

- `WhatsApp Chat with Um Milhão de Finos.txt`
- `contacts.csv`
- `Media/` com os ficheiros de imagem originais

Para atualizar o registo de produção, substitua os ficheiros canónicos por uma nova exportação completa e recarregue a página. As ferramentas de preparação do arquivo não fazem parte da navegação pública. O chat, contactos e decisões são fontes de trabalho do administrador; não publique estes ficheiros sem confirmar que a exposição é aceitável.

## Regras de importação

A implementação em `app.js` trata os casos da exportação do WhatsApp que alteram a contagem:

- Os cabeçalhos `DD/MM/YYYY, HH:MM - ...` são lidos e as linhas sem cabeçalho são anexadas à mensagem anterior, como acontece com legendas multilinha.
- Só contam linhas `IMG-[\\w-]+.(jpg|jpeg|png) (file attached)`, sem distinção entre maiúsculas e minúsculas. Stickers (`STK-`, `.webp`), áudio (`.opus`), vídeo (`VID-*`) e outros anexos são ignorados.
- Uma legenda de fotografia — incluindo um número de contagem — pode aparecer numa linha sem data logo abaixo do anexo. A fotografia é identificada pela própria linha do anexo, para que a legenda não a esconda.
- Mensagens do sistema não têm remetente e não contam. A deduplicação compara fotografias consecutivas, permitindo mensagens do sistema, legendas e números pelo meio.
- Fotografias consecutivas do mesmo remetente, na mesma data e no mesmo minuto, contam como um único fino. Uma fotografia de outro remetente quebra a sequência; outro minuto também.
- O painel mostra ficheiros de imagem antes da deduplicação, total contado e registos duplicados removidos. Candidatos a duplicado continuam disponíveis na auditoria visual com os dois lados do par; uma decisão manual pode restaurá-los ou confirmá-los.
- Números isolados servem apenas para mostrar o último ponto de controlo manual coerente. Um valor isolado fora da sequência não é usado como máximo; nunca alteram a atribuição nem a classificação.
- Um dia decorre das 08:00 às 08:00 do dia seguinte. Fotografias antes das 08:00 pertencem ao período anterior.
- Telefones são normalizados removendo todos os caracteres que não sejam dígitos. Nomes guardados no chat não são associados automaticamente a nomes do CSV; aparecem como **Apenas nome · pendente** até serem resolvidos manualmente.
- As associações nome → telefone ficam guardadas no armazenamento local e são reutilizadas em futuras importações.
- Uma nova exportação substitui os registos atuais e recalcula todas as classificações; nunca é acrescentada à anterior.

## Vistas

- **Visão geral** — total acumulado, progresso até 1 000 000, verificação pós-importação, top 10 total e top 10 do último período diário.
- **Janela diária** — classificação selecionável por períodos das 08:00 às 08:00.
- **Participantes** — lista pesquisável e ordenável com o estado da identidade.
- **Detalhe do participante** — registo paginado com data, hora, nome original do ficheiro, período e totais por dia.

Para verificações rápidas na consola do navegador, a página expõe `window.UmMilhaoDeFinos.parseWhatsAppChat`, `parseContactsCsv`, `normalizePhone` e `dailyBucketKey`.
