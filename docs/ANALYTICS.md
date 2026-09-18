# Analytics first-party (Fase 20)

O produto registra somente eventos de negócio em PostgreSQL, sem Google Analytics,
pixels ou fingerprinting. O identificador é um UUID opaco mantido em
`sessionStorage`; não contém PII. UTMs e o hostname do referrer são limitados e a
primeira origem da sessão não é sobrescrita.

O dispositivo é classificado apenas como `MOBILE`, `TABLET`, `DESKTOP` ou
`UNKNOWN`, sem fingerprint. UTMs são aparadas e limitadas por tamanho; o
referrer é reduzido ao hostname em minúsculas, descartando URL, query string e
valores inválidos. Categorias e faixas de crédito são canônicas, sem registrar
valores financeiros exatos.

Eventos aceitos: `LANDING_VIEWED`, `LANDING_CTA_CLICKED`, `SIMULATION_STARTED`,
`SIMULATION_COMPLETED`, `RESULTS_VIEWED`, `LEAD_FORM_OPENED`,
`LEAD_FORM_SUBMITTED`, `LEAD_CREATED`, `LEAD_CREATION_FAILED`,
`WHATSAPP_CLICKED` e `PRIVACY_VIEWED`.

O endpoint público é `POST /api/v1/public/analytics/events`, com body limit de
4 KiB e rate limit de 120/minuto. O dashboard autenticado usa
`/api/v1/analytics/overview` e a capability `analytics.read`; não expõe sessões.
A observabilidade registra `analytics_event_processing_duration` como histograma
em segundos, sem labels de alta cardinalidade.
Eventos brutos têm retenção operacional recomendada de 180 dias (sem job
destrutivo nesta fase). Como o identificador é necessário apenas para correlação
e não é cookie de autenticação, não foi criado banner automático. GPC/DNT não
alteram o comportamento sem uma política explícita; a página de privacidade deve
informar a finalidade e a ausência de venda dos dados.

Nesta fase a decisão documentada para GPC/DNT é não inferir consentimento nem
simular opt-out: esses sinais não alteram o processamento enquanto a política
jurídica específica não for definida. A coleta continua limitada à finalidade
de medir o funil próprio, com acesso protegido por `analytics.read`.
