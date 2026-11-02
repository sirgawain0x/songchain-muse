"use client";
import { useState } from "react";
import {
  ArrowUpRight,
  Plus,
  Check,
  LoaderCircle,
  ShieldCheck,
} from "lucide-react";
import type { Entry, Identity, Media, Ruleset, StageEvent } from "@/lib/domain";
import { eventLifecycleLabel } from "@/lib/domain";
import { api } from "@/lib/client-api";
import { Chip } from "./stage-ui";
import StorySetup from "./story-setup";
import { UploadField } from "./audio-upload";
import { useContributors } from "./contributors";
type Checks = {
  database: boolean;
  pinata: boolean;
  signer: boolean;
  meta: boolean;
  licensing: boolean;
  trace: boolean;
};
export default function Settings({
  checks,
  user,
  events,
  entries,
  onLogin,
  notify,
  refresh,
  action,
  busy,
}: {
  checks: Checks | null;
  user: Identity | null;
  events: StageEvent[];
  entries: Entry[];
  onLogin: () => void;
  notify: (s: string) => void;
  refresh: () => Promise<void>;
  action: (p: string, d?: unknown) => Promise<unknown>;
  busy: boolean;
}) {
  const [seed, setSeed] = useState<Media | null>(null);
  const [ruleset, setRuleset] = useState<Ruleset>("Pure Human");
  const [saving, setSaving] = useState(false);
  const contributors = useContributors(user?.role === "admin");
  const services = [
    [
      "database",
      "Neon Postgres",
      "Events, accounts, entries, and voting records",
    ],
    ["pinata", "Pinata", "Private audio storage and public IP metadata"],
    [
      "signer",
      "Content Credentials",
      "Signed upload attestations and ingredient chains",
    ],
    [
      "meta",
      "Meta Model API",
      "Audio listening previews and arrangement assistance",
    ],
    [
      "licensing",
      "Music licensing",
      "Aeneid registrations and free test licenses",
    ],
    ["trace", "Trace audit receipts", "Optional; requires provider access"],
  ] as const;
  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setSaving(true);
    try {
      await api("event", {
        name: f.get("name"),
        subtitle: f.get("subtitle"),
        ruleset,
        aiCap: ruleset === "Assisted" ? Number(f.get("aiCap")) : null,
        seedId: seed?.id,
        seedArtist: f.get("seedArtist"),
        seedOwnerId: f.get("seedOwnerId"),
        votingOpens: new Date(String(f.get("opens"))).toISOString(),
        votingCloses: new Date(String(f.get("closes"))).toISOString(),
        parentRevShare: Number(f.get("revShare")),
        royaltyPolicy: f.get("policy"),
      });
      notify(
        "Your event is accepting entries. Register its seed before song registration.",
      );
      await refresh();
    } catch (error) {
      notify(
        error instanceof Error ? error.message : "Event could not be created.",
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <>
      {user && <AccountProfile user={user} refresh={refresh} />}
      <section className="panel">
        <div className="section-title">
          <h3>Integration status</h3>
          <Chip kind={checks?.database ? "lime" : "muted"}>
            {checks?.database ? "Database connected" : "Setup required"}
          </Chip>
        </div>
        <p className="muted">
          Server configuration is shown below. A configured service still needs
          a successful live request before it is ready.
        </p>
        <div className="services">
          {services.map(([key, name, description]) => (
            <div className="service" key={key}>
              <span
                className={`service-indicator ${checks?.[key] ? "ready" : ""}`}
              >
                {checks?.[key] ? <Check size={14} /> : <Plus size={14} />}
              </span>
              <div>
                <strong>{name}</strong>
                <small>{description}</small>
              </div>
              <Chip kind={checks?.[key] ? "lime" : "muted"}>
                {checks?.[key]
                  ? "Configured"
                  : key === "trace"
                    ? "Optional / off"
                    : "Needs setup"}
              </Chip>
            </div>
          ))}
        </div>
      </section>
      {user?.role === "admin" ? (
        <>
          <form className="panel event-form" onSubmit={create}>
            <div className="section-title">
              <h3>Create a new division</h3>
              <Chip>Admin</Chip>
            </div>
            <p className="muted">
              Each event declares its own eligibility rules before artists
              submit.
            </p>
            <div className="form-grid">
              <label>
                Event name
                <input
                  name="name"
                  required
                  placeholder="SongChain · Chapter 001"
                  maxLength={80}
                />
              </label>
              <label>
                Seed artist
                <input
                  name="seedArtist"
                  required
                  placeholder="The voice that starts it all"
                  maxLength={80}
                />
              </label>
            </div>
            <label>
              Seed artist’s account
              <select name="seedOwnerId" required>
                <option value="">Choose the artist’s invited account</option>
                {contributors.map((person) => (
                  <option value={person.id} key={person.id}>
                    {person.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Event description
              <input
                name="subtitle"
                maxLength={200}
                placeholder="A little context for your artists"
              />
            </label>
            <div className="form-grid">
              <label>
                Ruleset
                <select
                  value={ruleset}
                  onChange={(e) => setRuleset(e.target.value as Ruleset)}
                >
                  <option>Pure Human</option>
                  <option>Assisted</option>
                  <option>Open</option>
                </select>
              </label>
              {ruleset === "Assisted" && (
                <label>
                  AI cap (% of stem count)
                  <input
                    name="aiCap"
                    type="number"
                    min={0}
                    max={100}
                    required
                    placeholder="Set explicitly"
                  />
                </label>
              )}
            </div>
            <div className="form-grid">
              <label>
                Voting opens (your local time)
                <input name="opens" type="datetime-local" required />
              </label>
              <label>
                Voting closes (your local time)
                <input name="closes" type="datetime-local" required />
              </label>
            </div>
            <div className="form-grid">
              <label>
                Seed artist’s inherited revenue share (%)
                <input
                  name="revShare"
                  type="number"
                  min={0}
                  max={100}
                  required
                  placeholder="Agree with the seed artist"
                />
              </label>
              <label>
                Royalty policy
                <select name="policy">
                  <option value="LAP">Absolute share (LAP)</option>
                  <option value="LRP">Cascading share (LRP)</option>
                </select>
              </label>
            </div>
            <h4>Seed acapella</h4>
            <UploadField
              title="Upload the seed"
              role="seed"
              onUpload={setSeed}
            />
            {seed && (
              <p className="form-note">
                <Check size={14} />
                {seed.name}
              </p>
            )}
            <button className="btn" disabled={saving || !seed} type="submit">
              {saving ? (
                <LoaderCircle size={16} className="spin" />
              ) : (
                <Plus size={16} />
              )}
              Publish event for entries
            </button>
          </form>
          <div className="section-heading">
            <h2>Your events</h2>
          </div>
          {events.map((e) => (
            <div className="panel event-control" key={e.id}>
              <div>
                <Chip kind="lime">{e.ruleset} division</Chip>
                <h3>{e.name}</h3>
                <p>
                  {eventLifecycleLabel(e)} · Seed by {e.seedArtist}
                </p>
              </div>
              <div className="button-row">
                <button
                  className="btn secondary"
                  disabled={busy || !!e.seedIpId}
                  onClick={() => void action(`register-seed/${e.id}`, {})}
                >
                  {e.seedIpId ? "Seed registered" : "Register seed"}
                </button>
                {e.status === "entries" && (
                  <button
                    className="btn"
                    disabled={busy}
                    onClick={() =>
                      void action(`event-state/${e.id}`, { status: "voting" })
                    }
                  >
                    {Date.now() < Date.parse(e.votingOpens)
                      ? "Close entries and schedule voting"
                      : "Open voting"}
                  </button>
                )}
                {e.status === "voting" && (
                  <button
                    className="btn secondary"
                    disabled={busy}
                    onClick={() =>
                      void action(`event-state/${e.id}`, { status: "closed" })
                    }
                  >
                    Close voting
                  </button>
                )}
              </div>
            </div>
          ))}
          <StorySetup />
          <OfferingForm
            entries={entries}
            events={events}
            notify={notify}
            refresh={refresh}
          />
        </>
      ) : (
        <div className="panel admin-gate">
          <ShieldCheck size={27} />
          <h3>The stage team handles event setup.</h3>
          <p>
            Administrators publish seeds, set division rules, and enable license
            offerings.
          </p>
          {!user && (
            <button className="btn secondary" onClick={onLogin}>
              Administrator sign-in <ArrowUpRight size={16} />
            </button>
          )}
        </div>
      )}
    </>
  );
}
function AccountProfile({
  user,
  refresh,
}: {
  user: Identity;
  refresh: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  return (
    <form
      className="panel event-form"
      onSubmit={async (event) => {
        event.preventDefault();
        const name = String(
          new FormData(event.currentTarget).get("name") || "",
        );
        setBusy(true);
        setMessage("");
        try {
          await api("profile", { name });
          await refresh();
          setMessage(
            "Display name saved. Your account and permissions stay the same.",
          );
        } catch (error) {
          setMessage(
            error instanceof Error
              ? error.message
              : "Could not save your display name.",
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <h3>Your profile</h3>
      <label>
        Display name
        <input
          key={`${user.id}:${user.name}`}
          name="name"
          defaultValue={user.name}
          required
          maxLength={80}
          autoComplete="nickname"
        />
      </label>
      <p className="fine-print">
        Choose the name other people see. This does not verify your identity or
        change your role.
      </p>
      <button className="btn" disabled={busy}>
        {busy ? "Saving…" : "Save display name"}
      </button>
      {message && <p role="status">{message}</p>}
    </form>
  );
}
function OfferingForm({
  entries,
  events,
  notify,
  refresh,
}: {
  entries: Entry[];
  events: StageEvent[];
  notify: (s: string) => void;
  refresh: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="panel event-form"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        setBusy(true);
        try {
          await api(`offering/${f.get("entryId")}`, {
            kind: "remix",
            priceUsd: 0,
            maxFee: "0",
            revenueShare:
              events.find(
                (event) =>
                  event.id ===
                  entries.find((entry) => entry.id === f.get("entryId"))
                    ?.eventId,
              )?.parentRevShare ?? 0,
          });
          notify("The inherited testnet license is on the shelf.");
          await refresh();
        } catch (error) {
          notify(
            error instanceof Error
              ? error.message
              : "Could not create offering.",
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <h3>Put a song on the licensing shelf</h3>
      <label>
        Registered song
        <select name="entryId" required>
          <option value="">Choose a registered song</option>
          {entries
            .filter((e) => e.ipId)
            .map((e) => (
              <option key={e.id} value={e.id}>
                {e.title}
              </option>
            ))}
        </select>
      </label>
      <p className="muted">Commercial remix · inherited seed terms</p>
      <p className="fine-print">
        This Aeneid pilot publishes the remix’s inherited license, with its
        original seed revenue share and no test minting fee. The app sponsors
        bounded test gas. No dollar payment is collected, and the receiver is an
        app-managed test account. New license flavors cannot be attached to an
        existing derivative.
      </p>
      <button className="btn" disabled={busy}>
        {busy ? (
          <LoaderCircle size={16} className="spin" />
        ) : (
          <Plus size={16} />
        )}
        Publish inherited test license
      </button>
    </form>
  );
}
