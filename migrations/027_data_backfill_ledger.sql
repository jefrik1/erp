-- 027: Buku pelacakan backfill data (dipakai F16 backfill pendapatan POS historis).
-- Idempoten; aman dijalankan berulang.
CREATE TABLE IF NOT EXISTS data_backfill_batches (
  id            SERIAL PRIMARY KEY,
  code          TEXT NOT NULL UNIQUE,          -- mis. F16-POS-REVENUE
  version       TEXT NOT NULL DEFAULT '1',
  scope         TEXT,
  status        TEXT NOT NULL DEFAULT 'DRAFT', -- DRAFT|DRY_RUN|EXECUTING|DONE|FAILED
  invoice_count INTEGER NOT NULL DEFAULT 0,
  total_revenue NUMERIC(18,2) NOT NULL DEFAULT 0,
  total_vat     NUMERIC(18,2) NOT NULL DEFAULT 0,
  total_settle  NUMERIC(18,2) NOT NULL DEFAULT 0,
  approved_by   TEXT,
  executed_by   TEXT,
  started_at    TIMESTAMPTZ,
  finished_at   TIMESTAMPTZ,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS data_backfill_items (
  id             SERIAL PRIMARY KEY,
  batch_id       INTEGER NOT NULL REFERENCES data_backfill_batches(id) ON DELETE CASCADE,
  entity_type    TEXT NOT NULL DEFAULT 'INVOICE',
  entity_id      INTEGER NOT NULL,
  entity_number  TEXT,
  classification TEXT,                          -- A|B|C|D|E|F
  source_total   NUMERIC(18,2) DEFAULT 0,
  source_net     NUMERIC(18,2) DEFAULT 0,
  source_vat     NUMERIC(18,2) DEFAULT 0,
  posted_net     NUMERIC(18,2) DEFAULT 0,
  posted_vat     NUMERIC(18,2) DEFAULT 0,
  posted_settle  NUMERIC(18,2) DEFAULT 0,
  journal_id     INTEGER,
  status         TEXT NOT NULL DEFAULT 'PENDING', -- PENDING|POSTED|SKIPPED|FAILED
  error          TEXT,
  payload        JSONB,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_backfill_item ON data_backfill_items(batch_id, entity_type, entity_id);
CREATE INDEX IF NOT EXISTS ix_backfill_item_status ON data_backfill_items(batch_id, status);

-- Idempotensi di level jurnal: satu jurnal POS_SALE per invoice.
CREATE UNIQUE INDEX IF NOT EXISTS ux_journal_pos_sale_invoice
  ON journal_entries(reference_id) WHERE reference_type = 'POS_SALE';
