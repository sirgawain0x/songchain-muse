"use client";
import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  Check,
  Music2,
  Disc3,
  Download,
  LoaderCircle,
  AudioLines,
  ShieldCheck,
  X,
} from "lucide-react";
import type { Entry, Identity, Media, StageEvent } from "@/lib/domain";
import { acceptsEntries, eventLifecycleLabel, voteWindow } from "@/lib/domain";
import type { StageData } from "@/lib/repository";
import { api } from "@/lib/client-api";
import { Chip } from "./stage-ui";
import { UploadField } from "./audio-upload";
import { ArrangementAssistant } from "./agent-tools";
import { ContributorShares, type Contribution } from "./contributors";
export default function Studio({
  user,
  events,
  data,
  onLogin,
  notify,
  refresh,
  onSelect,
}: {
  user: Identity | null;
  events: StageEvent[];
  data: StageData;
  onLogin: () => void;
  notify: (s: string) => void;
  refresh: () => Promise<void>;
  onSelect: (e: Entry) => void;
}) {
  const [eventId, setEventId] = useState("");
  const [stems, setStems] = useState<Media[]>([]);
  const [mix, setMix] = useState<Media | null>(null);
  const [busy, setBusy] = useState(false);
  const [contributions, setContributions] = useState<Contribution[]>([
    { ownerId: "", name: "", percentage: "" },
  ]);
  const [library, setLibrary] = useState<
    {
      id: string;
      state: string;
      document: { performance?: { title: string } };
    }[]
  >([]);
  useEffect(() => {
    if (user)
      void api("library")
        .then(setLibrary)
        .catch(() => {});
  }, [user]);
  const event = events.find((e) => e.id === eventId);
  const canEnter = !!user && ["artist", "admin"].includes(user.role);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    try {
      const shares = contributions.map((share) => ({
        ...share,
        percentage: Number(share.percentage),
      }));
      await api("entry", {
        eventId,
        title: form.get("title"),
        description: form.get("description"),
        genre: form.get("genre"),
        lyrics: form.get("lyrics"),
        mixId: mix?.id,
        stemIds: stems.map((s) => s.id),
        shares,
        consent: form.get("consent") === "on",
      });
      notify(
        "Your performance is submitted. The stem breakdown and contributor shares are now frozen.",
      );
      setStems([]);
      setMix(null);
      await refresh();
    } catch (error) {
      notify(error instanceof Error ? error.message : "Submission failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="studio-banner">
        <span className="round-icon">
          <AudioLines size={29} />
        </span>
        <div>
          <p className="eyebrow">START WITH A SPARK. MAKE IT YOURS.</p>
          <h2>Your sound belongs here.</h2>
          <p>
            Bring your stems. Give every layer its credit. Find your audience.
          </p>
        </div>
      </div>
      {events.length > 0 && (
        <section className="panel session-guide">
          <h3>Which session should I use?</h3>
          <p>
            Each event has its own entries and voting. An Open division allows
            the displayed source types; it does not mean submissions are still
            open.
          </p>
          {events.map((session) => (
            <div key={session.id}>
              <strong>{session.name}</strong>
              <p>
                {eventLifecycleLabel(session)}.{" "}
                {acceptsEntries(session)
                  ? "Choose this event below to submit a new performance."
                  : voteWindow(session)
                    ? "Submissions are closed. Listen and vote on its existing performances on the stage."
                    : session.status === "voting" &&
                        Date.now() < Date.parse(session.votingOpens)
                      ? `Submissions are closed. Voting starts ${new Date(session.votingOpens).toLocaleString()}.`
                      : "This event is not accepting new submissions."}
              </p>
            </div>
          ))}
        </section>
      )}
      {!user ? (
        <div className="panel signin-panel">
          <h3>Take your place in the founding season.</h3>
          <p>
            Sign in to submit an entry, keep track of your music, and find your
            licenses.
          </p>
          <button className="btn" onClick={onLogin}>
            Sign in with an invitation <ArrowUpRight size={16} />
          </button>
        </div>
      ) : canEnter ? (
        <form onSubmit={submit} className="entry-form panel">
          <div className="section-title">
            <h3>
              <span className="step">01</span>Find your division
            </h3>
            <Chip>One entry per division</Chip>
          </div>
          <label>
            Choose an event
            <select
              value={eventId}
              onChange={(e) => {
                setEventId(e.target.value);
                setStems([]);
                setMix(null);
              }}
              required
            >
              <option value="">Choose a division accepting entries</option>
              {events
                .filter((e) => acceptsEntries(e))
                .map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name} — {e.ruleset}
                  </option>
                ))}
            </select>
          </label>
          {!events.some((e) => acceptsEntries(e)) && (
            <p className="form-note">
              No events are accepting entries right now. “Open division”
              describes eligibility, not whether submissions are open. Events
              already in voting cannot accept another entry; you can still
              listen and vote on the stage.
            </p>
          )}
          {event && (
            <div className="rules-box">
              <ShieldCheck size={20} />
              <div>
                <strong>{event.ruleset} rules</strong>
                <p>
                  {event.ruleset === "Pure Human"
                    ? "No AI audio or agent build assistance. Trusted human-source credentials are required for every stem."
                    : event.ruleset === "Assisted"
                      ? `AI audio is allowed up to ${event.aiCap}% of stem count. The seed and lead need trusted human-source credentials. Unknown stems count toward the cap.`
                      : "AI audio and agent build assistance are allowed. Unestablished origins remain visibly labeled unknown."}
                </p>
                <p>
                  Mislabeling AI audio as human may result in disqualification.
                </p>
                {event.seedId && (
                  <a
                    href={`/api/stage/audio/${event.seedId}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Listen to the seed by {event.seedArtist}{" "}
                    <ArrowUpRight size={13} />
                  </a>
                )}
              </div>
            </div>
          )}
          <>
            {event && (
              <ArrangementAssistant
                eventId={event.id}
                ruleset={event.ruleset}
                notify={notify}
              />
            )}
          </>
          <div className="section-title spaced">
            <h3>
              <span className="step">02</span>Introduce your sound
            </h3>
          </div>
          <div className="form-grid">
            <label>
              Track title
              <input
                name="title"
                required
                minLength={2}
                maxLength={100}
                placeholder="Give your track a name"
              />
            </label>
            <label>
              Genre
              <input
                name="genre"
                required
                maxLength={50}
                placeholder="e.g. Alternative R&B"
              />
            </label>
          </div>
          <label>
            The story behind it
            <textarea
              name="description"
              maxLength={1200}
              placeholder="Where did you take the seed?"
              rows={3}
            />
          </label>
          <label>
            Lyrics / transcript
            <textarea
              name="lyrics"
              maxLength={15000}
              placeholder="Add your lyrics for listeners and connected agents"
              rows={4}
            />
          </label>
          <div className="section-title spaced">
            <h3>
              <span className="step">03</span>Build the ingredient chain
            </h3>
          </div>
          <p className="muted">
            The event’s seed is included automatically. Upload the lead and each
            additional stem separately.
          </p>
          <UploadField
            title="Add a lead element"
            role="lead"
            onUpload={(m) => setStems((prev) => [...prev, m])}
          />
          <UploadField
            title="Add a supporting stem"
            role="stem"
            onUpload={(m) => setStems((prev) => [...prev, m])}
          />
          {stems.map((s) => (
            <div className="uploaded-item" key={s.id}>
              <AudioLines size={16} />
              <span>
                {s.name}
                <small>
                  {s.role} · {s.evidence.source} · {s.evidence.level}
                </small>
              </span>
              <button
                type="button"
                className="icon-btn"
                aria-label={`Remove ${s.name}`}
                onClick={() => setStems(stems.filter((m) => m.id !== s.id))}
              >
                <X size={16} />
              </button>
            </div>
          ))}
          <h4 className="spaced">The finished mix</h4>
          <UploadField
            title="Upload your finished track"
            role="mix"
            onUpload={setMix}
          />
          {mix && (
            <p className="form-note">
              <Check size={14} />
              {mix.name} ready
            </p>
          )}
          <div className="section-title spaced">
            <h3>
              <span className="step">04</span>Agree on the credits
            </h3>
          </div>
          <ContributorShares
            value={contributions}
            onChange={setContributions}
          />
          <p className="fine-print">
            Percentages must total 100. These splits cover the song’s own
            contributors; the seed artist’s inherited share is set by the event.
            There is no automatic weighting formula.
          </p>
          <label className="checkbox-label">
            <input name="consent" type="checkbox" required />
            <span>
              I have permission to submit these recordings. I agree to the
              displayed rules, public playback and credits, and the contributor
              shares above. I understand that false source claims may lead to
              disqualification.
            </span>
          </label>
          <button
            className="btn"
            type="submit"
            disabled={busy || !eventId || !mix || !stems.length}
          >
            {busy ? (
              <LoaderCircle className="spin" size={16} />
            ) : (
              <ArrowUpRight size={16} />
            )}
            Submit your performance
          </button>
          <p className="fine-print">
            Submission freezes your ingredients and shares. Unverified uploads
            cannot qualify as proven human recordings.
          </p>
        </form>
      ) : (
        <div className="panel">
          <p>
            Your {user.role} account can listen and take part in its voting
            lane. Ask the team for an artist invitation to submit music.
          </p>
        </div>
      )}
      {user && (
        <>
          <div className="section-heading">
            <h2>Your performances</h2>
          </div>
          {data.entries
            .filter((e) => e.ownerId === user.id)
            .map((e) => (
              <button
                className="my-entry panel"
                onClick={() => onSelect(e)}
                key={e.id}
              >
                <Music2 size={20} />
                <span>
                  <b>{e.title}</b>
                  <small>
                    {e.state} · {e.ipId ? "Registered" : "Registration pending"}
                  </small>
                </span>
                <ArrowUpRight size={17} />
              </button>
            ))}
          {!data.entries.some((e) => e.ownerId === user.id) && (
            <p className="muted">Your submitted performances will live here.</p>
          )}
          <div className="section-heading">
            <h2>Your license library</h2>
          </div>
          {library.length ? (
            library.map((p) => (
              <div className="panel library-item" key={p.id}>
                <Disc3 size={20} />
                <span>
                  {p.document.performance?.title || "License purchase"}
                  <small>{p.state}</small>
                </span>
                {p.state === "confirmed" && (
                  <a
                    className="text-btn"
                    href={`/api/stage/certificate/${p.id}?format=html`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Download size={16} />
                    View certificate
                  </a>
                )}
              </div>
            ))
          ) : (
            <p className="muted">
              The sounds you license and their certificates will appear here.
            </p>
          )}
        </>
      )}
    </>
  );
}
