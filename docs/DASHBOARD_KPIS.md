# KPIs do dashboard

O dashboard executivo (`/dashboard`) apresenta fatos agregados pela API
`GET /api/v1/dashboard/overview`. A resposta é filtrada por capability no
backend; o frontend não amplia o escopo por query string.

## Regras comuns

- Timezone: `America/Fortaleza`, inclusive para “hoje”, contatos e períodos.
- Períodos disponíveis: hoje, 7, 30 ou 90 dias, e personalizado de até 365 dias.
- “Estado atual” consulta o estoque no momento da requisição.
- “No período” usa intervalo inclusivo no início e exclusivo no fim.
- A comparação usa uma janela anterior de duração equivalente. Quando a base
  anterior é zero, `changePercent` é `null` e a interface mostra “Sem base
  anterior”.
- Contagens e agregações são calculadas no PostgreSQL; listas recentes são
  limitadas a cinco itens.

## Base de consórcios

| Indicador                           | Fonte e definição                                                                                                                                                                       |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Administradoras ativas              | `Administradora.ativa = true`, estado atual.                                                                                                                                            |
| Produtos ativos                     | `Produto.ativo = true`, estado atual.                                                                                                                                                   |
| Grupos ativos                       | `Grupo.status = ATIVO`, estado atual.                                                                                                                                                   |
| Cotas ativas                        | `Cota.status = ATIVO`, estado atual.                                                                                                                                                    |
| Assembleias, lances e contemplações | Contagem total das respectivas entidades.                                                                                                                                               |
| Grupos por categoria                | Grupos ativos agrupados por categoria normalizada; categorias desconhecidas são `OUTROS`.                                                                                               |
| Grupos por administradora           | Grupos ativos agrupados por administradora; exibe as cinco maiores contagens e `Outras`. É distribuição, não ranking de qualidade.                                                      |
| Faixas de crédito                   | Grupos ativos agrupados por `valor_credito_minimo`: não informado, até 99.999, 100–249.999, 250–499.999 e 500.000 ou mais.                                                              |
| Snapshots desatualizados            | Último `GrupoHistorico` do grupo ativo anterior ao limite centralizado de 7 dias.                                                                                                       |
| Coverage de histórico               | Média dos snapshots mais recentes: assembleias com dados de lance ou contemplação divididas pelas assembleias realizadas. Nulo quando não há base. Coverage não é métrica de qualidade. |

## Qualidade, integrações e importações

- **Issues abertas:** estados `OPEN` e `IN_REVIEW` são mostrados separadamente,
  além de resolvidas no período, ignoradas, severidades abertas e cinco regras
  mais frequentes.
- **Issues críticas:** quantidade em `OPEN` ou `IN_REVIEW` com severidade
  `CRITICAL`; gera alerta objetivo.
- **Integrações:** status atual de cada `Integration`, última execução bem
  sucedida e cinco `IntegrationRun` mais recentes no período.
- **Taxa de sucesso:** runs `SUCESSO` divididas por todas as runs concluídas
  elegíveis (`SUCESSO`, `SUCESSO_PARCIAL` e `FALHA`). Sem runs elegíveis, nulo.
- **Duração média:** média, em milissegundos, de `finalizado_em -
iniciado_em` para runs concluídas elegíveis.
- **Registros processados:** soma de `registros_recebidos` das runs elegíveis.
- **Importações:** estados, registros processados, issues geradas e cinco
  importações recentes; falhas e estados são fatos operacionais, não previsão.

## CRM

- **Leads ativos:** todos os status não terminais definidos em
  `ACTIVE_LEAD_STATUSES`; `CONVERTIDO` e `PERDIDO` ficam fora.
- **Novos:** leads criados na janela atual; a comparação usa a janela anterior.
- **Convertidos:** leads com `convertido_em` na janela atual.
- **Perdidos:** estado atual dos leads em `PERDIDO` (`lostNow`).
- **Funil:** contagem por todos os enums reais de `LeadStatus`.
- **Origens:** leads criados no período agrupados por `LeadOrigin`.
- **Categorias:** interesses de leads criados no período agrupados por
  categoria; cada interesse é contado uma vez, portanto um lead com múltiplos
  interesses pode aparecer em mais de uma categoria.
- **Contatos hoje:** interações de CRM ocorridas no dia local atual.
- **Contatos atrasados:** leads ativos cujo próximo contato está antes de agora,
  reutilizando `isLeadOverdue`.
- **Próximos:** leads ativos com próximo contato futuro dentro da janela
  operacional definida pelo serviço.
- **Sem próximo contato:** leads ativos sem data de próximo contato.
- **Carteira/equipe:** atribuições, ativos, interações, convertidos, perdidos e
  atrasados por responsável, sem nota ou ranking de produtividade. Vendedores
  recebem somente o próprio escopo; demais dados dependem das capabilities.

## Alertas e atividade

“Requer atenção” é uma lista curta e determinística de issues críticas,
contatos atrasados, leads ativos sem responsável, integrações em erro,
execuções falhadas, importações falhadas e snapshots desatualizados quando
detectados. A severidade é operacional (`CRITICO`, `ALTO`, `MEDIO`,
`INFORMATIVO`), não uma avaliação de pessoas.

A atividade recente é limitada a eventos de lead, interação, integração,
importação e qualidade. Não expõe telefone, e-mail, notas integrais,
credenciais, tokens, payloads externos ou o `AuditLog` completo.

## Limitações

Os indicadores são descritivos e dependem da qualidade e completude dos dados
persistidos. O dashboard não calcula previsão, probabilidade, recomendação,
score comercial ou ranking global. Sem dados, as consultas retornam contagens
zero, valores nulos ou estados vazios com HTTP 200.
