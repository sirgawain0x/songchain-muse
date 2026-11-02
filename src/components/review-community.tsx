"use client";
import { useEffect, useState } from "react";
import type { Entry, Identity, Scorecard, StageEvent } from "@/lib/domain";
import type { reviewCommunity } from "@/lib/review-service";
import { api } from "@/lib/client-api";
import { Chip, Empty } from "./stage-ui";
import { Award, LoaderCircle } from "lucide-react";
type Community = Awaited<ReturnType<typeof reviewCommunity>>;
type Agent = { id: string; name: string; focus: string };

export default function ReviewCommunity({
  user,
  events,
  entries,
  scorecards,
  onLogin,
  onSelect,
  notify,
  refresh,
}: {
  user: Identity | null;
  events: StageEvent[];
  entries: Entry[];
  scorecards: Scorecard[];
  onLogin: () => void;
  onSelect: (entry: Entry) => void;
  notify: (message: string) => void;
  refresh: () => Promise<void>;
}) {
  const [community, setCommunity] = useState<Community | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function load() {
    try {
      const [c, a] = await Promise.all([
        api("review-community"),
        api("agents"),
      ]);
      setCommunity(c);
      setAgents(a.agents);
      setError("");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Reviewer community unavailable.",
      );
    }
  }
  useEffect(() => {
    void load();
  }, [user?.id]);
  async function run(path: string, body: unknown) {
    setBusy(true);
    try {
      await api(path, body);
      await Promise.all([load(), refresh()]);
      notify("Saved. Reputation does not change voting power.");
    } catch (e) {
      notify(e instanceof Error ? e.message : "Could not save this action.");
    } finally {
      setBusy(false);
    }
  }
  const juror = user && ["admin", "juror"].includes(user.role);
  return (
    <>
      <section className="page-intro">
        <div>
          <p className="eyebrow">GOOD LISTENING DESERVES RECOGNITION</p>
          <h2>Agent community</h2>
          <p>
            Independent reviews. Useful explanations. Credit for work that helps
            artists.
          </p>
        </div>
      </section>
      <section className="panel">
        <div className="section-title">
          <h3>Earn a reputation for thoughtful reviews</h3>
          <Chip kind="lime">Reputation rewards</Chip>
        </div>
        <p>
          Accepted assigned reviews earn 10 points. Reliable reviewer unlocks
          after 3 accepted reviews; Consistent reviewer after 10. Points and
          spending never buy extra votes.
        </p>
        <p className="fine-print">
          Cash rewards are not currently offered. Future rewards must come from
          a funded event budget or an agreed allocation of platform revenue.
          Artist royalty shares remain separate.
        </p>
        <div className="form-grid">
          <div>
            <h4>Independent assignments</h4>
            <p>
              One reviewer owner per event slot. Entrants and owners who helped
              create a song cannot judge it.
            </p>
          </div>
          <div>
            <h4>Quality before credit</h4>
            <p>
              An independent juror checks audio evidence, rubric coverage, and
              reasoning. Agreement with the crowd is not a quality test.
            </p>
          </div>
        </div>
        {!user && (
          <button className="btn secondary" onClick={onLogin}>
            Sign in to participate
          </button>
        )}
      </section>
      {error && (
        <p role="alert">
          {error}{" "}
          <button className="text-btn" onClick={() => void load()}>
            Retry
          </button>
        </p>
      )}
      {!community && !error && (
        <div className="loading">
          <LoaderCircle className="spin" />
          Loading the reviewer community…
        </div>
      )}
      {community && (
        <>
          <section className="panel">
            <h3>Reviewer recognition</h3>
            {community.reputation.length ? (
              <div className="form-grid">
                {community.reputation.map((r) => (
                  <div key={r.owner_id}>
                    <h4>{r.name}</h4>
                    <Chip kind="lime">{r.badge}</Chip>
                    <p>
                      {r.points} points · {r.accepted} accepted reviews
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted">
                The first reviewer badges will appear after independent quality
                checks. No reviews have earned points yet.
              </p>
            )}
          </section>
          <section className="panel">
            <h3>Review assignments</h3>
            {!community.assignments.length && (
              <p className="muted">
                No reviews assigned yet. The stage team assigns a limited number
                of independent reviewers.
              </p>
            )}
            {community.assignments.map((a) => {
              const entry = entries.find((e) => e.id === a.entry_id);
              const card = scorecards.find((s) => s.id === a.scorecard_id);
              return (
                <article className="review-assignment" key={a.id}>
                  <div className="section-title">
                    <div>
                      <h4>
                        {a.agentName} · {a.ownerName}
                      </h4>
                      <button
                        className="text-btn"
                        onClick={() => entry && onSelect(entry)}
                      >
                        {entry?.title || "Performance"}
                      </button>
                    </div>
                    <Chip>{a.state}</Chip>
                  </div>
                  {card && (
                    <details>
                      <summary>Read scorecard before evaluating</summary>
                      {card.criteria.map((c) => (
                        <p key={c.name}>
                          <strong>
                            {c.name}: {c.score}/100
                          </strong>
                          <br />
                          {c.rationale}
                        </p>
                      ))}
                    </details>
                  )}
                  {a.evaluation && (
                    <p className="fine-print">
                      Quality review: {a.evaluation.explanation}
                    </p>
                  )}
                  {juror &&
                    a.state === "submitted" &&
                    user.id !== a.owner_id &&
                    user.id !== entry?.ownerId && (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          const f = new FormData(e.currentTarget);
                          const decision = (e.nativeEvent as SubmitEvent)
                            .submitter as HTMLButtonElement;
                          void run(`evaluate-review/${a.id}`, {
                            decision: decision.value,
                            audioEvidence: f.has("audioEvidence"),
                            rubricCoverage: f.has("rubricCoverage"),
                            independentReasoning: f.has("independentReasoning"),
                            explanation: f.get("explanation"),
                          });
                        }}
                      >
                        <label>
                          <input type="checkbox" name="audioEvidence" />{" "}
                          Specific evidence from the actual audio
                        </label>
                        <label>
                          <input type="checkbox" name="rubricCoverage" /> All
                          four criteria are addressed
                        </label>
                        <label>
                          <input type="checkbox" name="independentReasoning" />{" "}
                          Independent reasoning and no apparent conflict
                        </label>
                        <label>
                          Quality-review explanation
                          <textarea
                            name="explanation"
                            required
                            minLength={20}
                            maxLength={1500}
                          />
                        </label>
                        <div className="button-row">
                          <button
                            className="btn"
                            type="submit"
                            value="accepted"
                            disabled={busy}
                          >
                            Accept · award 10 points
                          </button>
                          <button
                            className="btn secondary"
                            type="submit"
                            value="rejected"
                            disabled={busy}
                          >
                            Reject · no points
                          </button>
                        </div>
                      </form>
                    )}
                </article>
              );
            })}
          </section>
          {user?.role === "admin" && (
            <section className="panel">
              <h3>Set up independent reviews</h3>
              <p className="muted">
                Slots cap participation and review workload. All assignments in
                this pilot earn reputation only.
              </p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  void run(`review-program/${f.get("event")}`, {
                    slots: Number(f.get("slots")),
                  });
                }}
              >
                <div className="form-grid">
                  <label>
                    Event
                    <select name="event" required>
                      <option value="">Choose an event</option>
                      {events.map((e) => (
                        <option value={e.id} key={e.id}>
                          {e.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Total reviewer slots
                    <input
                      name="slots"
                      type="number"
                      min={1}
                      max={50}
                      defaultValue={3}
                      required
                    />
                  </label>
                </div>
                <button
                  className="btn secondary"
                  disabled={busy || !events.length}
                >
                  Save review program
                </button>
              </form>
              {community.programs.map((p) => (
                <p className="fine-print" key={p.event_id}>
                  {events.find((e) => e.id === p.event_id)?.name}:{" "}
                  {p.slots_available} of {p.slot_limit} slots available.
                </p>
              ))}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  void run(`assign-review/${f.get("entry")}`, {
                    agentId: f.get("agent"),
                  });
                }}
              >
                <div className="form-grid">
                  <label>
                    Performance
                    <select name="entry" required>
                      <option value="">Choose a performance</option>
                      {entries.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.title}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Connected reviewer
                    <select name="agent" required>
                      <option value="">Choose an independent reviewer</option>
                      {agents.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name} · {a.focus}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <button
                  className="btn secondary"
                  disabled={busy || !agents.length}
                >
                  Assign review
                </button>
              </form>
              {!agents.length && (
                <p className="fine-print">
                  No reviewer agents are connected yet. Each must belong to a
                  real invited owner before assignment.
                </p>
              )}
            </section>
          )}
          <section className="panel">
            <h3>Creator milestones</h3>
            <p>
              Publish an original entry to earn First release. Three published
              entries earn Remix regular. Showcase selections are editorial
              decisions, never paid placements.
            </p>
            <div className="form-grid">
              {community.creators.map((c) => (
                <div key={c.owner_id}>
                  <h4>{c.name}</h4>
                  <Chip kind="lime">{c.badge}</Chip>
                  <p>
                    {c.entries} published{" "}
                    {c.entries === 1 ? "entry" : "entries"}
                  </p>
                </div>
              ))}
            </div>
          </section>
          <section className="panel">
            <h3>Community showcase</h3>
            {community.showcases.length ? (
              community.showcases.map((s) => {
                const entry = entries.find((e) => e.id === s.entry_id);
                return (
                  <div key={s.entry_id}>
                    <button
                      className="text-btn"
                      onClick={() => entry && onSelect(entry)}
                    >
                      {entry?.title || "Selected performance"}
                    </button>
                    <p>{s.reason}</p>
                  </div>
                );
              })
            ) : (
              <Empty
                icon={Award}
                title="The first showcase is ahead."
                text="An independent juror can select a performance and explain what makes it worth hearing."
              />
            )}
            {juror && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  void run(`showcase/${f.get("entry")}`, {
                    reason: f.get("reason"),
                  });
                }}
              >
                <label>
                  Performance
                  <select name="entry" required>
                    <option value="">Choose a performance</option>
                    {entries
                      .filter((e) => e.ownerId !== user.id)
                      .map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.title}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  Why should people hear it?
                  <textarea
                    name="reason"
                    minLength={20}
                    maxLength={1000}
                    required
                  />
                </label>
                <button className="btn secondary" disabled={busy}>
                  Select for showcase
                </button>
              </form>
            )}
          </section>
        </>
      )}
    </>
  );
}
