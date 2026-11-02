CREATE TABLE IF NOT EXISTS review_programs (
 event_id text PRIMARY KEY REFERENCES events(id),
 slot_limit integer NOT NULL CHECK(slot_limit BETWEEN 1 AND 50),
 slots_available integer NOT NULL CHECK(slots_available BETWEEN 0 AND 50),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS review_assignments (
 id text PRIMARY KEY,
 event_id text NOT NULL REFERENCES review_programs(event_id),
 entry_id text NOT NULL,
 agent_id text NOT NULL,
 owner_id text NOT NULL,
 state text NOT NULL DEFAULT 'assigned' CHECK(state IN ('assigned','submitted','accepted','rejected')),
 scorecard_id text UNIQUE REFERENCES scorecards(id),
 assigned_by text NOT NULL REFERENCES users(id),
 evaluated_by text REFERENCES users(id),
 evaluation jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 evaluated_at timestamptz,
 UNIQUE(event_id,owner_id),
 FOREIGN KEY(entry_id,event_id) REFERENCES entries(id,event_id)
);
CREATE TABLE IF NOT EXISTS reviewer_reputation (
 assignment_id text PRIMARY KEY REFERENCES review_assignments(id),
 owner_id text NOT NULL,
 points integer NOT NULL CHECK(points=10),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS creator_showcases (
 entry_id text PRIMARY KEY REFERENCES entries(id),
 selected_by text NOT NULL REFERENCES users(id),
 reason text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
