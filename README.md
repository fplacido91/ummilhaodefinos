# Um Milhão de Finos

Um registo auditável para o jogo do contador de finos do WhatsApp: uma **imagem ou vídeo deduplicado equivale a um fino**, atribuído ao remetente.

## Executar

Não existe passo de compilação. A forma recomendada é servir esta pasta localmente:

```powershell
python -m http.server 4173
```

Depois abra <http://localhost:4173>. Ao iniciar, a aplicação carrega automaticamente os ficheiros canónicos do repositório:

- `WhatsApp Chat with Um Milhão de Finos.txt`
- `contacts.csv`
- `review-decisions.json`

As imagens são carregadas diretamente do DigitalOcean Spaces através do valor de `meta[name="media-base-url"]` em `index.html`. O resultado do parsing do chat é guardado no IndexedDB do navegador e invalidado automaticamente quando o conteúdo ou a versão do parser muda.

Para atualizar o registo de produção, preserve o histórico do chat e faça merge da nova exportação incremental antes de recarregar a página:

```powershell
python tools/merge_chat_log.py "WhatsApp Chat with Um Milhão de Finos.txt" nova-exportacao.txt
```

A ferramenta encontra a última mensagem partilhada, acrescenta apenas o que vem depois e ignora blocos de mensagem duplicados. As ferramentas de preparação do arquivo não fazem parte da navegação pública. O chat, contactos e decisões são fontes de trabalho do administrador; não publique estes ficheiros sem confirmar que a exposição é aceitável.

Para cruzar a lista atual de membros com a contagem, o último fino e os eventos de entrada no grupo, gere o relatório de membros com a exportação CSV mais recente:

```powershell
python tools/generate_member_report.py wa_list_1786731817120.csv -o people-to-delete.csv
```

Por defeito, o relatório inclui membros atuais com até 3 finos (incluindo zero), para revisão antes de remover alguém. As colunas `data_primeira_entrada` e `data_ultima_entrada` são extraídas dos eventos `joined`/`added` do chat. Entradas de hoje ou de ontem ficam marcadas como **SIM — não remover automaticamente**; quando não existe um evento inequívoco, a linha fica marcada para revisão manual. O relatório conta apenas media aceite pelas mesmas regras de deduplicação e revisão usadas pelo site.

## Regras de importação

A implementação em `app.js` trata os casos da exportação do WhatsApp que alteram a contagem:

- Os cabeçalhos `DD/MM/YYYY, HH:MM - ...` são lidos e as linhas sem cabeçalho são anexadas à mensagem anterior, como acontece com legendas multilinha.
- Só contam linhas `IMG-*` (JPG, JPEG, PNG e GIF) e `VID-*` (MP4, 3GP e MOV), sem distinção entre maiúsculas e minúsculas. PTT, stickers (`STK-`, `.webp`) e outros anexos são ignorados.
- Uma legenda — incluindo um número de contagem — pode aparecer numa linha sem data logo abaixo do anexo. O media é identificado pela própria linha do anexo, para que a legenda não o esconda.
- Mensagens do sistema não têm remetente e não contam. A deduplicação acompanha o último media de cada remetente, permitindo mensagens do sistema, legendas, números e outros remetentes pelo meio.
- Media do mesmo remetente dentro de dois minutos, mesmo que outro remetente publique pelo meio, ou com o mesmo nome de ficheiro repetido, é candidato a duplicado. O candidato fica disponível para revisão e, sem decisão, é removido da contagem por defeito.
- O painel mostra ficheiros de media antes da deduplicação, total contado e registos duplicados removidos. Candidatos a duplicado continuam disponíveis na auditoria visual com os dois lados do par; uma decisão manual pode restaurá-los ou confirmá-los. Registos marcados como `duplicate` ou `non-beer` ficam arquivados fora da fila de auditoria, mas as decisões são mantidas no JSON para preservar a contagem.
- Números e legendas não alteram a atribuição nem a classificação. Só os anexos IMG/VID e as decisões da revisão contam.
- Um dia decorre das 08:00 às 08:00 do dia seguinte. Fotografias antes das 08:00 pertencem ao período anterior.
- Uma vitória diária corresponde ao primeiro lugar num período; em caso de empate, todos os participantes empatados recebem a vitória.
- Uma semana decorre de segunda-feira às 08:00 até à segunda-feira seguinte às 08:00. Os vencedores semanais usam exatamente essa janela.
- Telefones são normalizados removendo todos os caracteres que não sejam dígitos. As vistas públicas omitem o prefixo internacional; nomes públicos configurados podem substituir o telefone. Nomes do chat são associados automaticamente apenas quando correspondem exatamente a um contacto com um único número.
- Nomes sem uma correspondência telefónica única aparecem como **Telefone em falta** nas vistas públicas, salvo quando existe um alias público configurado. As associações manuais nome → telefone ficam guardadas no armazenamento local e são reutilizadas em futuras importações.
- O log canónico do repositório é cumulativo: uma nova exportação incremental deve ser fundida com `tools/merge_chat_log.py`, preservando o histórico e evitando mensagens duplicadas. Depois, a aplicação recalcula todas as classificações.

## Vistas

- **Visão geral** — total acumulado, progresso até 1 000 000, ritmo diário e semanal (a série semanal começa na primeira semana completa), verificação pós-importação, top 10 total, recordes de um período, top 10 de vitórias diárias e vencedores da semana atual.
- **Estatísticas** — mapa de calor dia do período × hora, distribuição por hora do dia, totais semanais, calendário, participação, recordes globais e projeção da data do milhão com base na média dos últimos períodos.
- **Janela diária** — classificação selecionável por períodos das 08:00 às 08:00.
- **Janela semanal** — classificação selecionável por semanas de segunda-feira às 08:00 até à segunda-feira seguinte às 08:00; abre por defeito na semana anterior à mais recente quando existe.
- **Participantes** — lista pesquisável e ordenável por telefone, com o estado da identidade.
- **Detalhe do participante** — registo paginado com media, data, hora, nome original do ficheiro, período e totais por dia.

## Revisão privada

A página pública não mostra a fila de auditoria. Para rever uma nova exportação sem a publicar:

1. Sirva a pasta com `python -m http.server 4173`.
2. Abra `http://localhost:4173/local-admin.html`.
3. Use o filtro **Pares candidatos a duplicado**.
4. Exporte as decisões e substitua `review-decisions.json` antes de publicar.

`local-admin.html` fica ignorado pelo Git por defeito. Em produção, `meta[name="media-base-url"]` deve apontar para o bucket/CDN público do DigitalOcean Spaces; os ficheiros de media não devem ser colocados no Git.

Para verificações rápidas na consola do navegador, a página expõe `window.UmMilhaoDeFinos.parseWhatsAppChat`, `parseContactsCsv`, `normalizePhone`, `dailyBucketKey`, `weekStartKey`, `getDailyWinners`, `getDailyWinnerRankings` e `getWeeklyWinners`.
