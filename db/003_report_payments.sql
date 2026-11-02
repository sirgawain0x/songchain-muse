CREATE TABLE IF NOT EXISTS report_payments (
 payment_hash text PRIMARY KEY,
 event_id text NOT NULL REFERENCES events(id),
 network text NOT NULL CHECK(network='eip155:84532'),
 pay_to text NOT NULL,
 amount_atomic bigint NOT NULL CHECK(amount_atomic=10000),
 state text NOT NULL CHECK(state IN ('pending','settled','needs-review')),
 transaction_hash text UNIQUE,
 receipt jsonb,
 report jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 settled_at timestamptz
);
