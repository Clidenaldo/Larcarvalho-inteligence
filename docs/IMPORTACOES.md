# Importações CSV/XLSX/XLS

## Tabelas comerciais

`TABELAS_COMERCIAIS` usa o importador existente e exige `tabelaCodigo`, `categoria`, `creditoReferencia`, `prazoMeses`, `modalidade`, `inicioVigencia` e um entre `administradoraId`/`administradoraCnpj`. Nome livre de administradora não é aceito. Modalidade comercial é validada como `NORMAL`, `MAIS_POR_MENOS` ou `OUTRA` e nunca é sugerida como status de cota. A chave da tabela é administradora+código+vigência; a do item é tabela+crédito+prazo+modalidade.

Crédito e prazo devem ser positivos, parcelas e valores não podem ser negativos e percentuais devem ficar entre zero e cem. A interface apresenta issues por linha logo após Validate, oferece o relatório detalhado e bloqueia Execute quando há zero linhas válidas. Erros técnicos de cabeçalho continuam rastreáveis internamente; `EMPTY_HEADER:2`, por exemplo, é exposto como “Cabeçalho vazio na coluna 2 (B).”. Consulte [TABELAS_COMERCIAIS.md](TABELAS_COMERCIAIS.md).

## Arquitetura e fluxo

O módulo implementa `upload -> detecção -> preview -> seleção de aba -> mapeamento revisado -> validação -> confirmação -> lotes -> relatório`. O tipo é obrigatório: administradoras, produtos, grupos, cotas, assembleias, lances ou contemplações. Não há importador genérico, fila, scraping, robô ou integração externa.

O Next.js encaminha multipart ao Fastify como stream. O backend aplica autenticação, origem confiável e capability antes da leitura. PostgreSQL guarda metadados, mapeamento, progresso e issues; o arquivo nunca é BLOB.

## Formatos, bibliotecas e limites

- CSV UTF-8: `csv-parse` 7.0.2, com BOM, aspas, vírgula/ponto e vírgula e limite por registro.
- XLSX/XLS: `@e965/xlsx` 0.20.3, um parser para ambos. Fórmulas são desabilitadas e nenhuma engine ou macro é executada; somente valores armazenados são lidos.
- multipart: `@fastify/multipart` 10.1.1.
- limites: 20 MiB, 1 arquivo, 1 tipo, 50.000 linhas, 200 colunas, até 100 abas listadas e preview de 20 linhas.
- extensão, MIME e assinatura são conferidos: XLSX exige ZIP (`PK`) e XLS exige OLE Compound File. Encoding inválido, arquivo vazio e cabeçalho vazio/repetido falham claramente.

As novas bibliotecas não adicionaram advisory à auditoria. XLSX continua sujeito a expansão ZIP: tamanho comprimido, linhas e colunas são limitados, mas a biblioteca não expõe teto independente de bytes descomprimidos. Isolamento do parser é recomendado antes de ampliar a exposição.

## Temporários e privacidade

Uploads usam o diretório privado do sistema `larcarvalho-importacoes`, nome UUID e modo `0600`. O caminho é interno. O arquivo é removido ao concluir ou falhar; um job para expirar uploads abandonados é dívida técnica. Conteúdo de arquivo não entra em logs/AuditLog. Issues guardam somente o valor problemático, limitado a 1.000 caracteres, e no máximo 1.000 issues detalhadas por importação.

## Abas, preview e mapeamento

CSV possui a aba lógica `CSV`; workbooks listam abas e importam apenas uma. O auto-mapeamento normaliza acentos, caixa e separadores apenas para comparação. Sugestões exatas/aliases aparecem na interface, mas `mapeamentoConfirmado` bloqueia validação até revisão explícita. Campos desconhecidos, coluna inexistente/reutilizada e obrigatório ausente falham.

Referências seguem ordem determinística: UUID interno, código externo/CNPJ e chave contextual. Não há busca fuzzy nem vínculo por nome ambíguo. Grupo usa administradora+código; cota usa grupo+número; assembleia numerada usa grupo+número. Lance não possui update confiável. Contemplação só atualiza com assembleia+código externo.

## Normalização e validação

- CNPJ: dígitos e verificadores reais.
- BRL/decimal: `1.234,56`, `1234,56`, `1234.56`.
- datas: `DD/MM/YYYY` e `YYYY-MM-DD`; timestamp ISO exige `Z` ou offset. Horário brasileiro sem timezone é rejeitado.
- booleanos: `sim/não`, `true/false`, `1/0`, `ativo/inativo`.
- enums: valores reais de categoria, assembleia, lance e contemplação, com acento/caixa normalizados e saída canônica.
- códigos permanecem texto e preservam zeros à esquerda.

Cada linha vira `CREATE`, `UPDATE`, `IGNORE` ou `ERROR`. Issues possuem linha, campo, valor, código, severidade e mensagem e são consultadas com paginação.

## Duplicidade, lote e consistência

Duplicidades internas e no banco usam as mesmas chaves contextuais. `IGNORAR` preserva existentes. `ATUALIZAR` só altera por chave confiável; sem chave, registra aviso e não faz update. Não existe “substituir tudo”.

`updateMany where status=PRONTA` reivindica a execução e impede clique duplo/concor­rência. Escritas usam lotes de 200, cada um transacional. Linhas inválidas não são gravadas e contadores persistem a cada lote. Estados: `PENDENTE`, `VALIDANDO`, `PRONTA`, `PROCESSANDO`, `CONCLUIDA`, `CONCLUIDA_COM_ERROS`, `FALHOU`.

`FonteDados` identifica upload manual CSV ou Excel, sem administradora fictícia. Auditoria registra criação, mapeamento, validação, confirmação, início, conclusão e falha com metadata resumida.

## RBAC, API e frontend

`SUPER_ADMIN`, `ADMIN`, `GESTOR` e `OPERADOR` recebem `importacoes.read/create/execute`; `VENDEDOR`, somente `read`.

| Método | Rota                                   | Capability            |
| ------ | -------------------------------------- | --------------------- |
| `GET`  | `/api/v1/importacoes`                  | `importacoes.read`    |
| `POST` | `/api/v1/importacoes/upload`           | `importacoes.create`  |
| `GET`  | `/api/v1/importacoes/:id`              | `importacoes.read`    |
| `GET`  | `/api/v1/importacoes/:id/preview?aba=` | `importacoes.read`    |
| `POST` | `/api/v1/importacoes/:id/mapping`      | `importacoes.create`  |
| `POST` | `/api/v1/importacoes/:id/validate`     | `importacoes.create`  |
| `POST` | `/api/v1/importacoes/:id/execute`      | `importacoes.execute` |
| `GET`  | `/api/v1/importacoes/:id/issues`       | `importacoes.read`    |

`/dashboard/importacoes` contém wizard de sete etapas e histórico. `/dashboard/importacoes/[id]` mostra metadata, mapeamento, contadores e problemas. Exportar erros ficou futuro; qualquer CSV deverá neutralizar valores iniciados por `=`, `+`, `-` ou `@` contra formula injection.

## Testes e evolução

Fixtures cobrem CSV por vírgula/ponto e vírgula, aspas e BOM; XLSX com uma/múltiplas abas é gerado sinteticamente. Unitários cobrem parser, assinatura, normalização, mapping e RBAC. Integração em `larcarvalho_test` percorre os sete tipos, relações, update, duplicidade, auditoria, contadores, status e idempotência, com limpeza.

O processamento síncrono atende ao limite atual. Antes de elevar limites ou usar múltiplas instâncias, adicionar worker/fila, armazenamento temporário compartilhado, expiração, antivírus e parser isolado. Este módulo não inicia `GrupoHistorico`, comparação, índice de aderência ou IA.
