-- v3.0 POS Extended Module — Cashier shifts, voids, offline sync, fraud alerts

-- ========== CASHIER SHIFT MANAGEMENT ==========
CREATE TABLE IF NOT EXISTS pos_cashier_shifts (
  id BIGSERIAL PRIMARY KEY,
  cashier_id BIGINT REFERENCES users(id) NOT NULL,
  register_id INT NOT NULL,
  shift_date DATE DEFAULT CURRENT_DATE,
  login_time TIMESTAMPTZ NOT NULL DEFAULT now(),
  logout_time TIMESTAMPTZ,
  opening_cash DECIMAL(15,2) DEFAULT 0,
  closing_cash DECIMAL(15,2),
  expected_closing DECIMAL(15,2),
  variance DECIMAL(15,2),
  variance_pct DECIMAL(5,2),
  status VARCHAR(20) DEFAULT 'OPEN' CHECK (status IN ('OPEN','CLOSED','RECONCILING','APPROVED')),
  notes TEXT,
  approved_by BIGINT REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(cashier_id, register_id, shift_date)
);

-- ========== TRANSACTION VOIDS & REFUNDS ==========
CREATE TABLE IF NOT EXISTS pos_transaction_voids (
  id BIGSERIAL PRIMARY KEY,
  transaction_id BIGINT REFERENCES pos_transactions(id) NOT NULL,
  cashier_id BIGINT REFERENCES users(id),
  reason VARCHAR(50) NOT NULL CHECK (reason IN ('WRONG_AMOUNT','DUPLICATE','CUSTOMER_REQUEST','DAMAGED_ITEM','OTHER')),
  void_amount DECIMAL(15,2) NOT NULL,
  requested_at TIMESTAMPTZ DEFAULT now(),
  approved_by BIGINT REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  status VARCHAR(20) DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED','CANCELLED')),
  notes TEXT
);

CREATE TABLE IF NOT EXISTS pos_refunds (
  id BIGSERIAL PRIMARY KEY,
  transaction_id BIGINT REFERENCES pos_transactions(id) NOT NULL,
  transaction_item_id BIGINT REFERENCES pos_transaction_items(id),
  cashier_id BIGINT REFERENCES users(id),
  refund_amount DECIMAL(15,2) NOT NULL,
  refund_time TIMESTAMPTZ DEFAULT now() CONSTRAINT refund_max_5min CHECK (refund_time > now() - INTERVAL '5 minutes'),
  reason VARCHAR(100),
  status VARCHAR(20) DEFAULT 'COMPLETED' CHECK (status IN ('COMPLETED','PENDING_APPROVAL','REJECTED')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ========== OFFLINE SYNC QUEUE ==========
CREATE TABLE IF NOT EXISTS pos_sync_queue (
  id BIGSERIAL PRIMARY KEY,
  sync_batch_id VARCHAR(50),
  sync_type VARCHAR(30) NOT NULL CHECK (sync_type IN ('TRANSACTION','REFUND','VOID','RECONCILIATION')),
  local_record_id BIGINT,
  payload JSONB NOT NULL,
  device_id VARCHAR(50),
  synced_at TIMESTAMPTZ,
  sync_status VARCHAR(20) DEFAULT 'PENDING' CHECK (sync_status IN ('PENDING','SUCCESS','FAILED','RETRY')),
  retry_count INT DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ========== FRAUD ALERTS & MONITORING ==========
CREATE TABLE IF NOT EXISTS pos_fraud_alerts (
  id BIGSERIAL PRIMARY KEY,
  alert_type VARCHAR(50) NOT NULL CHECK (alert_type IN ('MULTIPLE_VOIDS','UNUSUAL_DISCOUNT','LARGE_REFUND','OVERRIDE_ABUSE','STOCK_MISMATCH')),
  cashier_id BIGINT REFERENCES users(id),
  register_id INT,
  alert_time TIMESTAMPTZ DEFAULT now(),
  count INT,
  threshold INT,
  time_window INTERVAL,
  details JSONB,
  status VARCHAR(20) DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','REVIEWED','RESOLVED','FALSE_ALARM')),
  reviewed_by BIGINT REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ========== DAILY CLOSE REPORT ==========
CREATE TABLE IF NOT EXISTS pos_daily_reports (
  id BIGSERIAL PRIMARY KEY,
  report_date DATE NOT NULL,
  register_id INT,
  total_transactions INT DEFAULT 0,
  total_sales DECIMAL(15,2) DEFAULT 0,
  total_cash_payments DECIMAL(15,2) DEFAULT 0,
  total_card_payments DECIMAL(15,2) DEFAULT 0,
  total_voids DECIMAL(15,2) DEFAULT 0,
  total_refunds DECIMAL(15,2) DEFAULT 0,
  total_discounts DECIMAL(15,2) DEFAULT 0,
  total_variance DECIMAL(15,2) DEFAULT 0,
  num_alerts INT DEFAULT 0,
  generated_at TIMESTAMPTZ DEFAULT now(),
  sent_to_manager BOOLEAN DEFAULT false,
  sent_at TIMESTAMPTZ
);

-- ========== ROLE PERMISSIONS FOR POS (already seeded in 002_seed.sql) ==========
-- Roles POS_CASHIER, POS_SUPERVISOR, POS_MANAGER already created in seed

-- ========== INDEXES ==========
CREATE INDEX IF NOT EXISTS idx_cashier_shift_open ON pos_cashier_shifts(cashier_id, status) WHERE status = 'OPEN';
CREATE INDEX IF NOT EXISTS idx_cashier_shift_date ON pos_cashier_shifts(shift_date, register_id);
CREATE INDEX IF NOT EXISTS idx_void_pending ON pos_transaction_voids(status, requested_at) WHERE status = 'PENDING';
CREATE INDEX IF NOT EXISTS idx_refund_recent ON pos_refunds(cashier_id, refund_time);
CREATE INDEX IF NOT EXISTS idx_sync_pending ON pos_sync_queue(sync_status, created_at) WHERE sync_status IN ('PENDING', 'RETRY');
CREATE INDEX IF NOT EXISTS idx_fraud_alert_active ON pos_fraud_alerts(alert_type, cashier_id) WHERE status = 'ACTIVE';
CREATE INDEX IF NOT EXISTS idx_daily_report_date ON pos_daily_reports(report_date, register_id);
