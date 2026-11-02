CREATE TABLE IF NOT EXISTS privy_accounts (
  privy_id text PRIMARY KEY,
  owner_id text NOT NULL UNIQUE REFERENCES users(id),
  linked_at timestamptz NOT NULL DEFAULT now()
);
