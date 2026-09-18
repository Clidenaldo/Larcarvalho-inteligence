# RBAC

## Tabelas comerciais

| Capacidade                  | SUPER_ADMIN | ADMIN | GESTOR | OPERADOR | VENDEDOR |
| --------------------------- | :---------: | :---: | :----: | :------: | :------: |
| `tabelas_comerciais.read`   |     sim     |  sim  |  sim   |   sim    |   sim    |
| `tabelas_comerciais.create` |     sim     |  sim  |  sim   |   não    |   não    |
| `tabelas_comerciais.update` |     sim     |  sim  |  sim   |   não    |   não    |
| `tabelas_comerciais.import` |     sim     |  sim  |  sim   |   sim    |   não    |

Importação comercial também respeita as permissões gerais do fluxo de importações; a capability específica impede que a inclusão do novo tipo amplie implicitamente o acesso de um papel.

## Índice de Aderência

| Capacidade              | SUPER_ADMIN | ADMIN | GESTOR | VENDEDOR | OPERADOR |
| ----------------------- | :---------: | :---: | :----: | :------: | :------: |
| `indice_aderencia.read` |      ✓      |   ✓   |   ✓    |    ✓     |    ✓     |

O cálculo é somente leitura e não possui capabilities de criação, atualização ou exclusão.

## Comparador de grupos

| Capacidade        | SUPER_ADMIN | ADMIN | GESTOR | VENDEDOR | OPERADOR |
| ----------------- | :---------: | :---: | :----: | :------: | :------: |
| `comparador.read` |      ✓      |   ✓   |   ✓    |    ✓     |    ✓     |

O comparador é estritamente de leitura. Busca e comparação exigem a mesma capability; não existem capabilities de criação, atualização ou exclusão.

## Histórico consolidado dos grupos

| Capacidade                | SUPER_ADMIN | ADMIN | GESTOR | VENDEDOR | OPERADOR |
| ------------------------- | :---------: | :---: | :----: | :------: | :------: |
| `historico_grupos.read`   |      ✓      |   ✓   |   ✓    |    ✓     |    ✓     |
| `historico_grupos.create` |      ✓      |   ✓   |   ✓    |    —     |    —     |

O backend aplica capabilities em todas as rotas. Não há permissão de update/delete porque snapshots são imutáveis.

## Qualidade dos dados

| Capacidade             | SUPER_ADMIN | ADMIN | GESTOR | VENDEDOR | OPERADOR |
| ---------------------- | :---------: | :---: | :----: | :------: | :------: |
| `data_quality.read`    |      ✓      |   ✓   |   ✓    |    ✓     |    ✓     |
| `data_quality.review`  |      ✓      |   ✓   |   ✓    |    —     |    ✓     |
| `data_quality.resolve` |      ✓      |   ✓   |   ✓    |    —     |    —     |
| `data_quality.scan`    |      ✓      |   ✓   |   ✓    |    —     |    —     |

Leitura permite investigar e consultar o histórico. Revisão permite colocar em análise e registrar ocorrência manual controlada. Resolução inclui resolver, ignorar com justificativa e reabrir. A varredura manual fica restrita aos papéis de gestão.

## Importações

| Capacidade            | SUPER_ADMIN | ADMIN | GESTOR | VENDEDOR | OPERADOR |
| --------------------- | :---------: | :---: | :----: | :------: | :------: |
| `importacoes.read`    |      ✓      |   ✓   |   ✓    |    ✓     |    ✓     |
| `importacoes.create`  |      ✓      |   ✓   |   ✓    |    —     |    ✓     |
| `importacoes.execute` |      ✓      |   ✓   |   ✓    |    —     |    ✓     |

O `OPERADOR` executa ingestão revisada; `VENDEDOR` consulta histórico e relatórios sem enviar ou confirmar arquivos.

## Modelo

RBAC é uma matriz tipada no backend, em `core/auth/rbac.ts`. Papéis não herdam permissões implicitamente: cada capacidade é concedida de forma explícita. O backend é a autoridade; esconder controles no frontend nunca substitui `requirePermission` e a checagem do serviço.

`/auth/login` e `/auth/me` devolvem as capabilities efetivas. O shell usa essa lista para exibir navegação e ações administrativas sem duplicar a matriz de autorização. Respostas `403` do backend continuam tratadas mesmo quando uma opção estava visível.

| Papel         | Responsabilidade conceitual                                      |
| ------------- | ---------------------------------------------------------------- |
| `SUPER_ADMIN` | Controle de identidade completo e operações críticas.            |
| `ADMIN`       | Administração operacional ampla, sem gerir papéis privilegiados. |
| `GESTOR`      | Leitura de usuários e administradoras.                           |
| `VENDEDOR`    | Leitura das administradoras comerciais.                          |
| `OPERADOR`    | Leitura das administradoras operacionais.                        |

## Matriz inicial

Para `assembleias`, `lances` e `contemplacoes`, `SUPER_ADMIN`, `ADMIN` e `GESTOR` recebem `read/create/update`; `VENDEDOR` e `OPERADOR` recebem somente `read`. As rotas dependem exclusivamente dessas capabilities.

| Capacidade                   | SUPER_ADMIN | ADMIN | GESTOR | VENDEDOR | OPERADOR |
| ---------------------------- | :---------: | :---: | :----: | :------: | :------: |
| `users.read`                 |      ✓      |   ✓   |   ✓    |    —     |    —     |
| `users.create`               |      ✓      |   ✓   |   —    |    —     |    —     |
| `users.update`               |      ✓      |   ✓   |   —    |    —     |    —     |
| `users.changeRole`           |      ✓      |   ✓   |   —    |    —     |    —     |
| `users.deactivate`           |      ✓      |   ✓   |   —    |    —     |    —     |
| `administradoras.read`       |      ✓      |   ✓   |   ✓    |    ✓     |    ✓     |
| `administradoras.create`     |      ✓      |   ✓   |   —    |    —     |    —     |
| `administradoras.update`     |      ✓      |   ✓   |   —    |    —     |    —     |
| `administradoras.deactivate` |      ✓      |   ✓   |   —    |    —     |    —     |

`users.update` está reservado para evolução controlada; não existe endpoint genérico de edição nesta fase.

## Limites administrativos

- `SUPER_ADMIN` pode criar e gerir todos os papéis.
- `ADMIN` pode criar/gerir apenas `GESTOR`, `VENDEDOR` e `OPERADOR`.
- ninguém altera o próprio papel nem desativa a própria conta.
- mudança de papel revoga todas as sessões do usuário afetado.
- desativação revoga todas as sessões e impede novos logins.
- advisory lock e contagem transacional impedem remover/desativar o último `SUPER_ADMIN` ativo.

Permissões persistidas, escopo por equipe/tenant e ABAC devem ser adicionados somente quando requisitos reais exigirem; a matriz atual permite essa evolução sem comparações de papel espalhadas por controllers.

## Base de conhecimento

| Capacidade            | SUPER_ADMIN | ADMIN | GESTOR | VENDEDOR | OPERADOR |
| ---------------------- | :---------: | :---: | :----: | :------: | :------: |
| `knowledge.read`     |      ✓      |   ✓   |   ✓    |    ✓     |    ✓     |
| `knowledge.search`   |      ✓      |   ✓   |   ✓    |    ✓     |    ✓     |
| `knowledge.create`   |      ✓      |   ✓   |   ✓    |    —     |    —     |
| `knowledge.update`   |      ✓      |   ✓   |   ✓    |    —     |    —     |
| `knowledge.process`  |      ✓      |   ✓   |   ✓    |    —     |    —     |
| `knowledge.archive`  |      ✓      |   ✓   |   ✓    |    —     |    —     |
| `knowledge.manage`   |      ✓      |    —  |    —   |    —     |    —     |

Leitura e busca são globais (inclui arquivados somente com `knowledge.manage`). Criação/edição/processamento/arquivamento ficam restritos a papéis de gestão; `knowledge.manage` (reativar, reprocessar, limpar tags, ver arquivados) é SUPER_ADMIN. Visibilidade `TEAM` exige equipe do ator. `knowledge.process` é permissão reservada sem endpoint consumidor nesta fase (ver certificação 28.1 §10).

## Capabilities comerciais

Foram adicionadas `leads.read_own`, `leads.read_team`, `leads.read_all`, `leads.create`, `leads.update_own`, `leads.update_team`, `leads.update_all`, `leads.assign`, `leads.change_status` e `leads.add_interaction`. Vendedor tem somente carteira própria; Gestor lê e altera a carteira da própria equipe (escopo TEAM); Admin e Super Admin têm visão geral (escopo ALL) e atribuição; Operador não possui acesso ao CRM.

## Analytics

`analytics.read` protege agregações do dashboard `/dashboard/analytics`.
SUPER_ADMIN, ADMIN e GESTOR possuem acesso; VENDEDOR e OPERADOR não possuem
acesso global por padrão.

## Inteligência Artificial (Fase 29)

`ai.use` abre o copiloto; cada prompt/tool exige a permissão do recurso.
`ai.settings` (SUPER_ADMIN/ADMIN) protege configuração, precificação e
teste de conexão. `ai.usage` (SUPER_ADMIN/ADMIN; já constava na matriz e
passou a guardar `GET /api/v1/ai/usage*` na Fase 29) separa telemetria e
custo de IA do financeiro comercial. Nenhuma permissão nova foi criada.
