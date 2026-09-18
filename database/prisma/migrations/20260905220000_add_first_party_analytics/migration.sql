CREATE TABLE "analytics_sessions" (
  "id" UUID NOT NULL, "anonymous_id" UUID NOT NULL, "started_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "landing_path" VARCHAR(200),
  "referrer_host" VARCHAR(255), "utm_source" VARCHAR(100), "utm_medium" VARCHAR(100),
  "utm_campaign" VARCHAR(150), "utm_content" VARCHAR(150), "utm_term" VARCHAR(150),
  "device_class" VARCHAR(20), "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "analytics_sessions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "analytics_sessions_anonymous_id_key" ON "analytics_sessions"("anonymous_id");
CREATE INDEX "analytics_sessions_utm_campaign_created_at_idx" ON "analytics_sessions"("utm_campaign","created_at");
CREATE TABLE "analytics_events" (
  "id" UUID NOT NULL, "session_id" UUID NOT NULL, "type" VARCHAR(40) NOT NULL, "path" VARCHAR(200) NOT NULL,
  "category" VARCHAR(40), "metadata" JSONB, "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "analytics_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "analytics_events_type_occurred_at_idx" ON "analytics_events"("type","occurred_at");
CREATE INDEX "analytics_events_session_id_occurred_at_idx" ON "analytics_events"("session_id","occurred_at");
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "analytics_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "leads" ADD COLUMN "analytics_session_id" UUID, ADD COLUMN "utm_source" VARCHAR(100), ADD COLUMN "utm_medium" VARCHAR(100), ADD COLUMN "utm_campaign" VARCHAR(150), ADD COLUMN "utm_content" VARCHAR(150), ADD COLUMN "utm_term" VARCHAR(150), ADD COLUMN "referrer_host" VARCHAR(255);
CREATE INDEX "leads_analytics_session_id_idx" ON "leads"("analytics_session_id");
ALTER TABLE "leads" ADD CONSTRAINT "leads_analytics_session_id_fkey" FOREIGN KEY ("analytics_session_id") REFERENCES "analytics_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
