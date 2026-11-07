-- 029_audit_triggers.sql
-- Trigger capture old_value dan new_value secara otomatis pada audit_logs untuk integritas enterprise.

CREATE OR REPLACE FUNCTION fn_audit_trigger_capture()
RETURNS TRIGGER AS $$
DECLARE
  v_old jsonb := NULL;
  v_new jsonb := NULL;
  v_user_id int := NULL;
BEGIN
  BEGIN
    v_user_id := NULLIF(current_setting('app.current_user_id', true), '')::int;
  EXCEPTION WHEN OTHERS THEN
    v_user_id := NULL;
  END;

  IF (TG_OP = 'UPDATE') THEN
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
    -- Redact sensitive fields if any
    IF v_old ? 'password_hash' THEN v_old := v_old - 'password_hash'; END IF;
    IF v_new ? 'password_hash' THEN v_new := v_new - 'password_hash'; END IF;
    IF v_old ? 'mfa_secret' THEN v_old := v_old - 'mfa_secret'; END IF;
    IF v_new ? 'mfa_secret' THEN v_new := v_new - 'mfa_secret'; END IF;
    IF v_old ? 'mfa_backup_codes' THEN v_old := v_old - 'mfa_backup_codes'; END IF;
    IF v_new ? 'mfa_backup_codes' THEN v_new := v_new - 'mfa_backup_codes'; END IF;

    INSERT INTO audit_logs (user_id, action, entity_type, entity_id, old_value, new_value, created_at)
    VALUES (v_user_id, 'UPDATE', TG_TABLE_NAME, OLD.id, v_old, v_new, NOW());
    RETURN NEW;
  ELSIF (TG_OP = 'DELETE') THEN
    v_old := to_jsonb(OLD);
    IF v_old ? 'password_hash' THEN v_old := v_old - 'password_hash'; END IF;
    IF v_old ? 'mfa_secret' THEN v_old := v_old - 'mfa_secret'; END IF;
    IF v_old ? 'mfa_backup_codes' THEN v_old := v_old - 'mfa_backup_codes'; END IF;

    INSERT INTO audit_logs (user_id, action, entity_type, entity_id, old_value, new_value, created_at)
    VALUES (v_user_id, 'DELETE', TG_TABLE_NAME, OLD.id, v_old, NULL, NOW());
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Pasang trigger pada tabel-tabel data master & transaksi utama
DO $$
BEGIN
  -- Products
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_audit_products') THEN
    CREATE TRIGGER trg_audit_products
    AFTER UPDATE OR DELETE ON products
    FOR EACH ROW EXECUTE FUNCTION fn_audit_trigger_capture();
  END IF;

  -- Customers
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_audit_customers') THEN
    CREATE TRIGGER trg_audit_customers
    AFTER UPDATE OR DELETE ON customers
    FOR EACH ROW EXECUTE FUNCTION fn_audit_trigger_capture();
  END IF;

  -- Suppliers
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_audit_suppliers') THEN
    CREATE TRIGGER trg_audit_suppliers
    AFTER UPDATE OR DELETE ON suppliers
    FOR EACH ROW EXECUTE FUNCTION fn_audit_trigger_capture();
  END IF;

  -- Sales Orders
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_audit_sales_orders') THEN
    CREATE TRIGGER trg_audit_sales_orders
    AFTER UPDATE OR DELETE ON sales_orders
    FOR EACH ROW EXECUTE FUNCTION fn_audit_trigger_capture();
  END IF;

  -- Purchase Orders
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_audit_purchase_orders') THEN
    CREATE TRIGGER trg_audit_purchase_orders
    AFTER UPDATE OR DELETE ON purchase_orders
    FOR EACH ROW EXECUTE FUNCTION fn_audit_trigger_capture();
  END IF;

  -- Invoices
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_audit_invoices') THEN
    CREATE TRIGGER trg_audit_invoices
    AFTER UPDATE OR DELETE ON invoices
    FOR EACH ROW EXECUTE FUNCTION fn_audit_trigger_capture();
  END IF;

  -- Bank Accounts
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_audit_bank_accounts') THEN
    CREATE TRIGGER trg_audit_bank_accounts
    AFTER UPDATE OR DELETE ON bank_accounts
    FOR EACH ROW EXECUTE FUNCTION fn_audit_trigger_capture();
  END IF;
END;
$$;
