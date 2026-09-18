# Fase 20 — Simulações, propostas e configuração comercial

## Visão geral

A Fase 20 adiciona um domínio comercial proprietário ao monorepo, sem alterar o simulador público existente. O backend é a única fonte de verdade dos cálculos: a interface apenas envia critérios e apresenta resultados persistidos. Valores financeiros são tratados em centavos, usando a regra de arredondamento ativa.

Não são criadas administradoras, produtos, grupos ou cotas duplicados. O módulo referencia as entidades operacionais existentes e o CRM (`Lead`).

## Modelo de dados

| Modelo                          | Responsabilidade                                                                                          |
| ------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `CommercialConfiguration`       | Configuração global ativa: organização, moeda BRL, arredondamento, validade, prefixo e aviso obrigatório. |
| `ProductCommercialRule`         | Regra financeira versionada por administradora, categoria e produto opcional. Exclusão lógica.            |
| `Simulation`                    | Critérios, seleções, proprietário, lead e estado da simulação. Exclusão lógica.                           |
| `SimulationScenario`            | Execução nomeada, ordenação e fixação para comparação.                                                    |
| `SimulationCalculationSnapshot` | Cópia imutável da entrada, configuração, regras e fontes usadas no cálculo.                               |
| `SimulationResult`              | Resultado por regra/produto, inclusive status, avisos, versão e data da fonte.                            |
| `SimulationFavorite`            | Favoritos pessoais de administradora, produto ou simulação.                                               |
| `Proposal`                      | Proposta vinculada a simulação, lead e vendedor, com snapshot e status. Exclusão lógica.                  |
| `ProposalItem`                  | Um a três resultados selecionados e sua cópia financeira imutável.                                        |
| `ProposalStatusHistory`         | Histórico de transições com autor, motivo e data.                                                         |

As migrations da fase são:

- `20260907113747_phase20_simulations_proposals`: enums, tabelas, relações e índices.
- `20260907121000_seed_phase20_configuration`: configuração comercial inicial, sem regras financeiras fictícias.

Há índices para usuário, lead/cliente, categoria, status, administradora, produto, grupo, cota e datas. Propostas antigas não dependem da regra corrente para exibir seus valores: elas usam `Proposal.snapshot` e `ProposalItem.financialSnapshot`.

## Motor de cálculo

Implementação isolada em `apps/backend/src/modules/simulations/services/simulation-calculator.service.ts`, versão `LC-SIM-1.0.0`.

Para cada regra vigente e compatível:

1. valida a existência de taxa de administração, reserva, seguro, adesão, limites de prazo e limite de lance embutido;
2. valida prazo, cotas em andamento e elegibilidade de operação estruturada;
3. em crédito contratado, usa o crédito informado como base;
4. em crédito líquido, calcula o crédito contratado necessário considerando o lance embutido solicitado;
5. calcula taxas configuradas em percentual ou valor e a parcela sobre o custo total;
6. calcula parcela reduzida somente quando a regra a define;
7. calcula lance próprio, embutido e total, e ordena os resultados pelo critério solicitado.

O índice de aderência não é fixo: é calculado a partir de três componentes observáveis, com pesos fixos e explicados nas premissas de cada resultado — contexto selecionado (40%: cota 1,00, grupo 0,75, apenas categoria 0,40), folga do lance embutido em relação ao limite da regra (35%) e proximidade do prazo desejado ao centro da faixa configurada (25%). Nenhum componente inventa condição financeira.

O arredondamento monetário segue `HALF_UP`, `UP` ou `DOWN`. Nenhuma taxa ausente é presumida como zero. Dados obrigatórios ausentes geram `INCOMPLETE_DATA` e campos monetários derivados nulos; incompatibilidades geram `INELIGIBLE`. Todo resultado informa `calculationStatus`, `calculationWarnings`, `ruleVersion`, `sourceDataUpdatedAt` e premissas.

## API

Todos os endpoints usam o prefixo `/api/v1`, sessão existente, origem confiável nas mutações, validação Zod, limite global de requisição, erros padronizados e logs sanitizados.

### Simulações

- `POST /simulations`
- `GET /simulations` — paginação e filtros por categoria, status, lead, autor e período.
- `GET /simulations/:id`
- `PATCH /simulations/:id`
- `DELETE /simulations/:id` — exclusão lógica.
- `POST /simulations/:id/calculate`
- `POST /simulations/:id/print` — registra auditoria antes da impressão.
- `GET /simulations/:id/scenarios/:scenarioId/csv` — exportação CSV da tabela comparativa de um cenário, com os mesmos controles de acesso e auditoria (`SIMULATION_CSV_EXPORTED`); campos ausentes aparecem como "Não informado".
- `POST /simulations/:id/favorite`
- `DELETE /simulations/:id/favorite`
- `POST /simulations/:id/proposals`

### Propostas

- `GET /proposals` — pesquisa e filtros por cliente, vendedor, status, categoria, administradora e período.
- `GET /proposals/:id`
- `PATCH /proposals/:id/status`
- `POST /proposals/:id/pdf`
- `POST /proposals/:id/print` — registra auditoria antes da impressão.
- `DELETE /proposals/:id` — exclusão lógica adicional à lista mínima solicitada.

Estados e transições válidas:

- `DRAFT` → `GENERATED` ou `CANCELLED`;
- `GENERATED` → `SENT` ou `CANCELLED`;
- `SENT` → `VIEWED`, `ACCEPTED`, `REJECTED`, `EXPIRED` ou `CANCELLED`;
- `VIEWED` → `ACCEPTED`, `REJECTED`, `EXPIRED` ou `CANCELLED`;
- estados finais não transitam.

Gerar o PDF muda uma proposta `DRAFT` para `GENERATED`, registra histórico e auditoria. O documento é A4 e contém identificação, cliente, vendedor, emissão, validade, objetivo, até três condições, premissas, aviso obrigatório e rodapé versionado.

### Configuração e regras

- `GET /commercial-configurations`
- `PATCH /commercial-configurations`
- `POST /product-commercial-rules`
- `GET /product-commercial-rules`
- `GET /product-commercial-rules/:id`
- `PATCH /product-commercial-rules/:id` — cria nova versão e desativa a anterior.
- `DELETE /product-commercial-rules/:id` — exclusão lógica.

As validações impedem vigência invertida, prazo mínimo acima do máximo, percentual fora de 0–100, produto de outra administradora/categoria e definição simultânea de percentual e valor para a mesma cobrança.

## Permissões e isolamento

| Papel         | Simulações                           | Propostas                                     | Configuração e regras                                      |
| ------------- | ------------------------------------ | --------------------------------------------- | ---------------------------------------------------------- |
| `SUPER_ADMIN` | Total                                | Total                                         | Total                                                      |
| `ADMIN`       | Total                                | Total                                         | Gerencia                                                   |
| `GESTOR`      | Consulta/cria e acompanha equipe     | Consulta/cria e atualiza equipe               | Consulta regras e aprova/atualiza a configuração permitida |
| `VENDEDOR`    | Cria e gerencia as próprias/carteira | Cria, atualiza e exporta as próprias/carteira | Consulta                                                   |
| `OPERADOR`    | Consulta restrita                    | Consulta restrita                             | Somente consulta                                           |

Para papéis sem leitura global, a autorização exige que o usuário seja o criador ou responsável pelo lead. Filtros de vendedor informados por esses papéis não ampliam o acesso. O mesmo controle é refeito no detalhe, cálculo, proposta e PDF.

## Frontend

- `/simulacoes/nova`: critérios, categoria, modo de crédito, filtros operacionais, lead, ordenação, limpar e simular.
- `/simulacoes/[id]`: critérios, cards, avisos, comparação de até cinco resultados fixados (compatível com o limite anterior de três), exportação CSV por cenário, favoritar, duplicar, recalcular, imprimir e gerar proposta.
- `/propostas`: pesquisa e todos os filtros comerciais solicitados.
- `/propostas/[id]`: cliente, itens, condições, histórico, transições permitidas, impressão e PDF.
- `/configuracoes/comercial`: configuração geral, cadastro versionado, desativação, validações e histórico de regras.

Valores são exibidos em Real e datas em português do Brasil; o backend mantém datas ISO. Formulários têm labels, estados de carregamento e mensagens compreensíveis.

## Seed de demonstração

Execute `npm run seed:phase20:demo --workspace @larcarvalho/backend`. Por segurança, o comando exige `TEST_DATABASE_URL` apontando para `localhost/larcarvalho_test`; ele se recusa a gravar em outro banco. O seed cria apenas entidades identificadas como demonstração.

## Testes e validação

- Unitário: crédito contratado/líquido, lances, operação estruturada, cota em andamento, dados incompletos e arredondamento.
- Integração: RBAC, isolamento de carteira, cálculo persistido, snapshot, proposta, status, filtros, auditoria e PDF válido.
- Frontend: navegação comercial e proxy autenticado.
- E2E Chromium: criação de regra versionada e cálculo completo pela interface.
- Validação manual do PDF: metadados, A4, renderização em PNG e inspeção visual sem cortes ou sobreposição.

Os comandos de aceitação são `npm run prisma:validate`, `npm run lint`, `npm run typecheck`, `npm run test`, `npm run test:integration`, `npm run e2e -- --project=chromium` e `npm run build`.

## Auditoria

São auditados criação, alteração, exclusão lógica, cálculo, favoritos, criação de proposta, mudança de status, impressão pelo fluxo da interface, exportação PDF e exportação CSV da comparação. Metadados evitam dados secretos e incluem apenas identificadores e informações operacionais necessárias.
