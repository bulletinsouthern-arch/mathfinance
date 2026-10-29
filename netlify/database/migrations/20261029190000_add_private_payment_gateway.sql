CREATE TABLE payment_gateway_settings (
  provider text PRIMARY KEY CHECK (provider = 'paymongo'),
  secret_key text NOT NULL DEFAULT '',
  webhook_secret text NOT NULL DEFAULT '',
  enabled boolean NOT NULL DEFAULT false
);
REVOKE ALL ON payment_gateway_settings FROM PUBLIC;
