# Tabelas comerciais

## Escopo e separação de domínio

`TabelaComercial` representa uma versão identificável de uma tabela de preços e condições de uma administradora. `TabelaComercialItem` representa cada combinação comercial de crédito, prazo e modalidade. Nenhuma das duas entidades é `Grupo`, `Cota`, `Assembleia`, `Lance` ou `Contemplacao`.

O módulo admite cadastro manual e importação pelo fluxo compartilhado CSV/XLSX/XLS. Não existe exclusão física. Uma nova vigência deve gerar outra tabela, preservando as versões anteriores.

## Modelo

Uma tabela pertence obrigatoriamente a uma `Administradora`, pode pertencer a um `Produto` da mesma administradora, tem categoria obrigatória e contém itens. Os status são `ATIVA`, `INATIVA` e `ENCERRADA`; as origens são `MANUAL`, `IMPORTACAO` e `INTEGRACAO`. As modalidades dos itens são `NORMAL`, `MAIS_POR_MENOS` e `OUTRA`.

Valores monetários usam `Decimal(19,2)`, percentuais usam `Decimal(9,6)`, vigências usam `DATE` e timestamps técnicos usam `TIMESTAMPTZ(3)`. Condições recorrentes têm colunas próprias. `metadata` fica reservada a extensões controladas da fonte e não substitui os campos relacionais ou pesquisáveis.

A tabela é única por `(administradoraId, codigo, inicioVigencia)`: um código pode voltar a existir em outra vigência, mas não pode ter duas versões indistinguíveis na mesma administradora e data. O item é único por `(tabelaComercialId, creditoReferencia, prazoMeses, modalidade)`, combinação que determina a opção comercial dentro da versão. `codigoExterno` é opcional e não participa da chave porque nem toda fonte o fornece de maneira confiável.

Checks no PostgreSQL protegem vigência coerente, crédito e prazo positivos, valores monetários não negativos, percentuais entre zero e cem e participantes não negativos. Foreign keys usam `RESTRICT` para preservar histórico.

## API e interface

Todas as rotas exigem sessão e RBAC:

| Método  | Rota                                           | Capability                  |
| ------- | ---------------------------------------------- | --------------------------- |
| `GET`   | `/api/v1/tabelas-comerciais`                   | `tabelas_comerciais.read`   |
| `POST`  | `/api/v1/tabelas-comerciais`                   | `tabelas_comerciais.create` |
| `GET`   | `/api/v1/tabelas-comerciais/:id`               | `tabelas_comerciais.read`   |
| `PATCH` | `/api/v1/tabelas-comerciais/:id`               | `tabelas_comerciais.update` |
| `PATCH` | `/api/v1/tabelas-comerciais/:id/status`        | `tabelas_comerciais.update` |
| `GET`   | `/api/v1/tabelas-comerciais/:id/itens`         | `tabelas_comerciais.read`   |
| `POST`  | `/api/v1/tabelas-comerciais/:id/itens`         | `tabelas_comerciais.create` |
| `PATCH` | `/api/v1/tabelas-comerciais/:id/itens/:itemId` | `tabelas_comerciais.update` |

Listagens são paginadas no PostgreSQL. A tela `/dashboard/tabelas-comerciais` pesquisa e filtra por administradora, categoria, status e vigência. O detalhe exibe condições, origem, itens paginados e auditoria resumida. O BFF correspondente vive em `/api/tabelas-comerciais`.

## Importação

O tipo `TABELAS_COMERCIAIS` reutiliza Upload → Preview → Mapeamento → Validação → Revisão → Execução → Relatório. Campos obrigatórios por linha: `tabelaCodigo`, `categoria`, `creditoReferencia`, `prazoMeses`, `modalidade` e `inicioVigencia`, mais exatamente um identificador resolvível de administradora (`administradoraId` ou `administradoraCnpj`). `tabelaNome` é opcional e assume o código quando ausente.

Os demais campos de item aceitos são `produtoId`, `codigoExterno`, `seguro`, `taxaAntecipadaValor`, `taxaAntecipadaPercentual`, `primeiraParcela`, `demaisParcelas`, `parcelaPadrao`, `fundoReservaPercentual`, `taxaAdministracaoPercentual`, `taxaTotalPercentual`, `seguroVidaPercentual`, `participantesGrupo` e `codigoPlano`.

Administradora nunca é resolvida por nome livre. Produto, quando informado, precisa estar ativo e pertencer à administradora. Duplicidades no arquivo e no banco seguem as estratégias globais `IGNORAR` e `ATUALIZAR`. A execução é recusada se a validação não ocorreu ou resultou em zero linhas válidas. Issues ficam visíveis no wizard antes da execução. Um cabeçalho vazio mantém o erro técnico interno, mas é apresentado como, por exemplo, “Cabeçalho vazio na coluna 2 (B).”.

## Auditoria e evolução

São registrados `TABELA_COMERCIAL_CREATED`, `TABELA_COMERCIAL_UPDATED`, `TABELA_COMERCIAL_ACTIVATED`, `TABELA_COMERCIAL_DEACTIVATED`, `TABELA_COMERCIAL_CLOSED`, `ITEM_COMERCIAL_CREATED` e `ITEM_COMERCIAL_UPDATED`.

Simulador e Comparador não foram alterados nesta fase. Futuramente eles poderão consultar tabelas vigentes por administradora, produto/categoria, crédito, prazo e modalidade. Dados comerciais apenas complementam dados factuais de grupos: não representam chance, probabilidade ou garantia de contemplação.
