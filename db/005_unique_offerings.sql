CREATE UNIQUE INDEX IF NOT EXISTS offerings_entry_kind_unique ON offerings(entry_id,(document->>'kind'));
