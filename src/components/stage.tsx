"use client";

import { useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  AudioLines,
  Check,
  ChevronDown,
  CircleHelp,
  Disc3,
  Download,
  Headphones,
  Layers3,
  LoaderCircle,
  Menu,
  Mic2,
  Music2,
  Play,
  Plus,
  Radio,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Trophy,
  Users,
  Vote,
  X,
  Zap,
} from "lucide-react";
import type {
  Entry,
  Identity,
  Media,
  Offering,
  Ruleset,
  StageEvent,
} from "@/lib/domain";
import { distribution, voteWindow, eventLifecycleLabel } from "@/lib/domain";
import { PublicListeningPreview } from "./public-listening-preview";
import { TranscriptPanel } from "./transcript-panel";
import { NotificationCenter } from "./notification-center";
import {
  browseCategories,
  categoryForRuleset,
  matchesCategory,
  type BrowseCategory,
} from "@/lib/browse-categories";
import type { StageData } from "@/lib/repository";

type View =
  "stage" | "results" | "licensing" | "studio" | "settings" | "reviewers";
type Checks = {
  database: boolean;
  pinata: boolean;
  signer: boolean;
  meta: boolean;
  licensing: boolean;
  trace: boolean;
};
const emptyData: StageData = {
  events: [],
  entries: [],
  scorecards: [],
  votes: [],
  offerings: [],
};
const nav = [
  { id: "stage", name: "The stage", icon: Radio },
  { id: "results", name: "Leaderboard", icon: Trophy },
  { id: "licensing", name: "License music", icon: Disc3 },
  { id: "studio", name: "My studio", icon: AudioLines },
  { id: "reviewers", name: "Agent community", icon: Users },
] as const;

import { api } from "@/lib/client-api";
import { Chip, Art, Wave, Modal, Empty, DivisionFilter } from "./stage-ui";
import Studio from "./studio";
import Settings from "./stage-settings";
import { AgentControls } from "./agent-tools";
import ReviewCommunity from "./review-community";
import { PrivyAccess } from "./privy-access";
export default function Stage() {
  const [view, setView] = useState<View>("stage");
  const [data, setData] = useState<StageData>(emptyData);
  const [checks, setChecks] = useState<Checks | null>(null);
  const [user, setUser] = useState<Identity | null>(null);
  const [previewVersion, setPreviewVersion] = useState(0);
  const [privyLinked, setPrivyLinked] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [initialNavigationHandled, setInitialNavigationHandled] =
    useState(false);
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");
  const [login, setLogin] = useState(false);
  const [pendingVote, setPendingVote] = useState<Entry | null>(null);
  const [myVotes, setMyVotes] = useState<
    { event_id: string; entry_id: string }[]
  >([]);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<BrowseCategory>("All");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("Latest");
  const [selected, setSelected] = useState<Entry | null>(null);
  const [playing, setPlaying] = useState<Entry | null>(null);
  const [playingPart, setPlayingPart] = useState<Media | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioLoading, setAudioLoading] = useState(false);
  const playerVisible = !!playing && (isPlaying || audioLoading);
  const [mobile, setMobile] = useState(false);
  const [about, setAbout] = useState(false);
  const [checkout, setCheckout] = useState<Offering | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  async function refresh() {
    const results = await Promise.allSettled([
      api("data"),
      api("status"),
      api("session"),
    ]);
    if (results[0].status === "fulfilled") {
      setData(results[0].value);
      setError("");
    } else setError(results[0].reason.message);
    if (results[1].status === "fulfilled") setChecks(results[1].value.checks);
    if (results[2].status === "fulfilled") {
      setUser(results[2].value.user);
      setPrivyLinked(results[2].value.privy?.connected ?? false);
      setMyVotes(results[2].value.votes || []);
    }
    setLoading(false);
  }
  useEffect(() => {
    void refresh();
  }, []);
  useEffect(() => {
    if (loading || initialNavigationHandled) return;
    const params = new URLSearchParams(window.location.search);
    const entryId = params.get("entry");
    const entry = data.entries.find((item) => item.id === entryId);
    if (entry) setSelected(entry);
    else if (
      params.get("view") === "studio" ||
      params.get("view") === "results"
    )
      setView(params.get("view") as View);
    setInitialNavigationHandled(true);
  }, [loading, initialNavigationHandled, data.entries]);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(""), 6500);
    return () => clearTimeout(id);
  }, [toast]);
  useEffect(() => {
    let active = true;
    if (playing && audioRef.current) {
      void audioRef.current.play().catch((error: unknown) => {
        if (!active) return;
        if (error instanceof DOMException && error.name === "AbortError")
          return;
        setIsPlaying(false);
        setAudioLoading(false);
        setToast(
          "Playback could not start. Check the audio integration or format support in this browser.",
        );
      });
    }
    return () => {
      active = false;
    };
  }, [playing, playingPart]);
  const events = data.events;
  const activeEntries = data.entries.filter((e) => e.state === "submitted");
  const eventFor = (entry: Entry) => events.find((e) => e.id === entry.eventId);
  const humanVotes = (id: string) =>
    data.votes.find((v) => v.entry_id === id && v.lane === "human")?.count || 0;
  const cards = (id: string) =>
    data.scorecards.filter(
      (s) => s.entryId === id && s.qualityStatus !== "rejected",
    );
  const voteLabel = (entry: Entry) => {
    const vote = myVotes.find((v) => v.event_id === entry.eventId);
    if (vote)
      return vote.entry_id === entry.id
        ? "You voted for this entry"
        : "Vote already cast in this event";
    const event = eventFor(entry);
    return event && voteWindow(event)
      ? "Vote for this entry"
      : "Voting is closed";
  };
  const voteDisabled = (entry: Entry) =>
    busy ||
    myVotes.some((v) => v.event_id === entry.eventId) ||
    !eventFor(entry) ||
    !voteWindow(eventFor(entry)!);
  let entries = activeEntries.filter(
    (e) =>
      matchesCategory(filter, eventFor(e)?.ruleset) &&
      `${e.title} ${e.artist} ${e.genre}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  entries = [...entries].sort((a, b) =>
    sort === "Most loved"
      ? humanVotes(b.id) - humanVotes(a.id)
      : Date.parse(b.createdAt) - Date.parse(a.createdAt),
  );
  const go = (next: View) => {
    setView(next);
    setMobile(false);
    setSelected(null);
  };
  const notify = (e: unknown) =>
    setToast(e instanceof Error ? e.message : "Something went wrong.");
  async function action(path: string, payload: unknown = {}) {
    setBusy(true);
    try {
      const result = await api(path, payload);
      await refresh();
      return result;
    } catch (e) {
      notify(e);
    } finally {
      setBusy(false);
    }
  }
  function play(entry: Entry, part?: Media) {
    if (playing?.id === entry.id && playingPart?.id === part?.id) {
      if (isPlaying || audioLoading) {
        audioRef.current?.pause();
        setAudioLoading(false);
      } else {
        setAudioLoading(true);
        if (audioRef.current?.error) audioRef.current.load();
        void audioRef.current?.play().catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError")
            return;
          setAudioLoading(false);
          notify(error);
        });
      }
    } else {
      setIsPlaying(false);
      setAudioLoading(true);
      setPlaying(entry);
      setPlayingPart(part || null);
    }
  }
  async function finishSignIn(account: Identity) {
    setUser(account);
    setLogin(false);
    setCode("");
    await refresh();
    setToast(`Welcome, ${account.name}. Your stage is ready.`);
    if (pendingVote) {
      const entry = pendingVote;
      setPendingVote(null);
      const voted = await action(`vote/${entry.id}`);
      if (voted)
        setToast("Your human-lane vote is in. Thank you for listening.");
    }
  }
  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    const result = await action("login", { code });
    if (result) await finishSignIn(result.user);
  }

  const voteFor = async (entry: Entry) => {
    if (!user) {
      setPendingVote(entry);
      setLogin(true);
      return;
    }
    const result = await action(`vote/${entry.id}`);
    if (result)
      setToast("Your human-lane vote is in. Thank you for listening.");
  };
  const navTitle =
    view === "stage"
      ? "Discover the next sound"
      : view === "results"
        ? "Three perspectives. One stage."
        : view === "licensing"
          ? "Original sounds. New possibilities."
          : view === "studio"
            ? "Make something only you can."
            : view === "reviewers"
              ? "Good listening deserves recognition."
              : "Behind the stage";

  return (
    <div className={`app-shell${playerVisible ? " is-playing" : ""}`}>
      <aside className={`sidebar ${mobile ? "open" : ""}`}>
        <a className="brand" href="/" aria-label="Agent Stage home">
          <span className="brand-symbol">
            <i />
            <i />
            <i />
          </span>
          <span>
            agent<span className="brand-light">stage</span>
            <small>CREATIVITY TAKES THE LEAD.</small>
          </span>
        </a>
        <div className="workspace">
          <span className="workspace-icon">
            <Music2 size={17} />
          </span>
          <div>
            SongChain<small>Founding season</small>
          </div>
          <ChevronDown size={14} />
        </div>
        <span className="nav-label">EXPLORE</span>
        <nav>
          {nav.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${view === item.id ? "selected" : ""}`}
              onClick={() => go(item.id)}
            >
              <item.icon size={19} />
              {item.name}
              {item.id === "stage" && <span className="nav-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <span className="tiny-spark">
            <Sparkles size={16} />
          </span>
          <h3>
            Your next track
            <br />
            starts with a seed.
          </h3>
          <p>
            <span>One voice. Your imagination.</span>
            <span>A whole new audience.</span>
          </p>
          <button onClick={() => go("studio")}>
            Create an entry <ArrowUpRight size={15} />
          </button>
          <span className="note-orbit" />
        </div>
        <div className="sidebar-bottom">
          <button className="nav-item" onClick={() => setAbout(true)}>
            <CircleHelp size={18} />
            How it works
            <ArrowUpRight size={14} />
          </button>
          <button
            className={`nav-item ${view === "settings" ? "selected" : ""}`}
            onClick={() => go("settings")}
          >
            <Settings2 size={18} />
            Stage settings
            {checks && !checks.pinata && <span className="setup-dot" />}
          </button>
          <button
            className="profile"
            onClick={() =>
              user
                ? void action("logout").then(() => {
                    window.dispatchEvent(new Event("stage-signout"));
                    setUser(null);
                    setPrivyLinked(null);
                  })
                : setLogin(true)
            }
          >
            <span className="avatar">
              {user ? user.name.slice(0, 2).toUpperCase() : <Users size={17} />}
            </span>
            <span>
              {user?.name || "Find your people"}
              <small>
                {user ? `${user.role} · Sign out` : "Sign in to take part"}
              </small>
            </span>
            <ArrowUpRight size={15} />
          </button>
        </div>
      </aside>
      {mobile && (
        <button
          aria-label="Close navigation"
          className="sidebar-backdrop"
          onClick={() => setMobile(false)}
        />
      )}
      <main>
        <header className="topbar">
          <button
            className="icon-btn mobile-menu"
            onClick={() => setMobile(!mobile)}
            aria-label="Open navigation"
          >
            <Menu size={22} />
          </button>
          <div className="breadcrumb">
            SongChain <span>/</span>{" "}
            <b>{nav.find((n) => n.id === view)?.name || "Settings"}</b>
          </div>
          <div className="topbar-right">
            {user && (
              <NotificationCenter
                key={user.id}
                onOpen={(href) => {
                  const target = new URL(href, window.location.origin);
                  const entryId = target.searchParams.get("entry");
                  if (entryId) {
                    const performance = data.entries.find(
                      (entry) => entry.id === entryId,
                    );
                    if (performance) {
                      setSelected(performance);
                      return;
                    }
                  }
                  go(
                    target.searchParams.get("view") === "results"
                      ? "results"
                      : "studio",
                  );
                }}
              />
            )}
            <span className="season-marker">
              <i /> FOUNDING SEASON
            </span>
            <button
              className="btn small top-entry"
              onClick={() => {
                if (!user) setLogin(true);
                else go("studio");
              }}
            >
              <Plus size={16} /> Create an entry
            </button>
          </div>
        </header>
        <div className="page-content">
          <div className="page-intro">
            <div>
              <p className="eyebrow">A NEW STAGE FOR ORIGINAL MUSIC</p>
              <h1>{selected ? "The performance" : navTitle}</h1>
            </div>
            <span className="edition">
              VOL. 001 <span>↗</span>
            </span>
          </div>
          {error && (
            <div className="alert">
              <Activity size={18} />
              <span>{error}</span>
              <button onClick={() => go("settings")}>
                View setup <ArrowRight size={14} />
              </button>
            </div>
          )}

          {selected ? (
            <section className="performance-view">
              <button className="text-btn" onClick={() => setSelected(null)}>
                <ArrowLeft size={16} />
                Back to the stage
              </button>
              <div className="performance-top">
                <Art
                  large
                  variant={activeEntries.findIndex((e) => e.id === selected.id)}
                />
                <div>
                  <Chip kind="lime">
                    {eventFor(selected)?.ruleset} division
                  </Chip>
                  {eventFor(selected) && (
                    <Chip>{eventLifecycleLabel(eventFor(selected)!)}</Chip>
                  )}
                  <h2>{selected.title}</h2>
                  <p>
                    by {selected.artist}{" "}
                    <span className="muted">· {selected.genre}</span>
                  </p>
                  <p className="description">{selected.description}</p>
                  {selected.ipId &&
                    /^0x[a-fA-F0-9]{40}$/.test(selected.ipId) && (
                      <p className="fine-print">
                        Registered on Aeneid testnet ·{" "}
                        <a
                          href={`https://aeneid.datanetscan.io/address/${selected.ipId}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          View IP registration
                        </a>
                        {selected.registrationTx &&
                          /^0x[a-fA-F0-9]{64}$/.test(
                            selected.registrationTx,
                          ) && (
                            <>
                              {" "}
                              ·{" "}
                              <a
                                href={`https://aeneid.datanetscan.io/tx/${selected.registrationTx}`}
                                target="_blank"
                                rel="noreferrer"
                              >
                                Registration receipt
                              </a>
                            </>
                          )}
                        . Testnet registration does not establish legal rights
                        or mainnet settlement.
                      </p>
                    )}
                  <div className="button-row">
                    <button className="btn" onClick={() => play(selected)}>
                      <Play size={16} />
                      Listen to the track
                    </button>
                    <button
                      className="btn secondary"
                      onClick={() => void voteFor(selected)}
                      disabled={voteDisabled(selected)}
                    >
                      <Vote size={16} />
                      {voteLabel(selected)}
                    </button>
                  </div>
                </div>
              </div>
              <div className="detail-grid">
                <div className="panel">
                  <div className="section-title">
                    <h3>Every layer has a story</h3>
                    <ShieldCheck size={20} />
                  </div>
                  <p className="muted">
                    Source labels come from validated evidence. Declarations
                    stay separate. Play any part to hear it on its own.
                  </p>
                  {selected.stems.map((s) => (
                    <div className="stem-row" key={s.id}>
                      <button
                        className="stem-play"
                        onClick={() => play(selected, s)}
                        aria-label={`${playing?.id === selected.id && playingPart?.id === s.id && isPlaying ? "Pause" : "Play"} ${s.role}: ${s.name}`}
                        aria-pressed={
                          playing?.id === selected.id &&
                          playingPart?.id === s.id &&
                          isPlaying
                        }
                        title={`${playingPart?.id === s.id && isPlaying ? "Pause" : "Play"} this part`}
                      >
                        {playing?.id === selected.id &&
                        playingPart?.id === s.id &&
                        audioLoading ? (
                          <LoaderCircle className="spin" size={17} />
                        ) : playing?.id === selected.id &&
                          playingPart?.id === s.id &&
                          isPlaying ? (
                          <span aria-hidden="true">Ⅱ</span>
                        ) : (
                          <Play size={17} fill="currentColor" />
                        )}
                      </button>
                      <div>
                        <strong>{s.name}</strong>
                        <small>
                          {s.role} ·{" "}
                          {s.evidence.tool ||
                            s.declaredTool ||
                            "Tool not established"}
                        </small>
                      </div>
                      <Chip
                        kind={
                          s.evidence.source === "human" &&
                          s.evidence.trust === "trusted"
                            ? "lime"
                            : "muted"
                        }
                      >
                        {s.evidence.source}
                      </Chip>
                      <details>
                        <summary>{s.evidence.level}</summary>
                        <p>
                          Signer: {s.evidence.trust}. Signature:{" "}
                          {s.evidence.signature}.
                        </p>
                        <p>
                          Declared source: {s.declaredSource}.{" "}
                          {s.evidence.notes.join(" ")}
                        </p>
                        <code>{s.evidence.hash}</code>
                      </details>
                    </div>
                  ))}
                  <p className="fine-print">
                    Shares describe stem counts, not duration, effort, or
                    copyright ownership.
                  </p>
                </div>
                <div className="panel">
                  <h3>The credits</h3>
                  {selected.shares.map((s) => (
                    <div className="credit-row" key={s.ownerId}>
                      <span>{s.name}</span>
                      <b>{s.percentage}%</b>
                    </div>
                  ))}
                  <h3 className="spaced">The writing</h3>
                  <p className="lyrics">
                    {selected.lyrics || "Lyrics have not been provided."}
                  </p>
                </div>
              </div>
              <PublicListeningPreview
                key={`${selected.id}:${previewVersion}`}
                entryId={selected.id}
              />
              <div className="section-heading">
                <div>
                  <p className="eyebrow">A LOOK INSIDE THE AGENT LANE</p>
                  <h2>Scores with something to say.</h2>
                </div>
                <Chip>{cards(selected.id).length} scorecards</Chip>
              </div>
              {cards(selected.id).length ? (
                cards(selected.id).map((card) => (
                  <div className="panel scorecard" key={card.id}>
                    <div className="section-title">
                      <h3>
                        <Sparkles size={18} />
                        {card.agentName}
                      </h3>
                      <b>
                        {card.overall.toFixed(1)} <small>/100</small>
                      </b>
                    </div>
                    <div className="criteria-grid">
                      {card.criteria.map((c) => (
                        <div key={c.name}>
                          <div>
                            <strong>{c.name}</strong>
                            <b>{c.score}</b>
                          </div>
                          <p>{c.rationale}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              ) : (
                <Empty
                  icon={Sparkles}
                  title="The agents haven’t weighed in yet."
                  text="When a connected agent reviews this performance, its scores and written reasons appear here."
                />
              )}
              {user &&
                (user.role === "admin" || user.id === selected.ownerId) && (
                  <TranscriptPanel
                    key={selected.id}
                    entryId={selected.id}
                    canGenerate={user.role === "admin"}
                  />
                )}
              {user?.role === "admin" && (
                <AgentControls
                  onPublished={() =>
                    setPreviewVersion((version) => version + 1)
                  }
                  entryId={selected.id}
                  notify={setToast}
                  refresh={refresh}
                />
              )}
              {user?.role === "admin" && (
                <div className="panel admin-actions">
                  <h3>Performance controls</h3>
                  <button
                    className="btn secondary"
                    disabled={busy || !!selected.ipId}
                    onClick={() => void action(`register-song/${selected.id}`)}
                  >
                    {selected.ipId
                      ? "Song registered"
                      : "Register song for licensing"}
                  </button>
                  <button
                    className="text-btn danger"
                    disabled={busy}
                    onClick={() =>
                      void action(`disqualify/${selected.id}`).then(() =>
                        setSelected(null),
                      )
                    }
                  >
                    Disqualify entry
                  </button>
                </div>
              )}
            </section>
          ) : (
            <>
              {view === "stage" && (
                <>
                  <section className="hero">
                    <div className="hero-copy">
                      <span className="hero-kicker">
                        <span className="live-dot" /> SONGCHAIN / THE FIRST
                        CHAPTER
                      </span>
                      <h2>
                        One voice.
                        <br />
                        Infinite <em>possibilities.</em>
                      </h2>
                      <p>Remix the seed. Find your audience.</p>
                      <div className="button-row">
                        <button
                          className="btn lime"
                          onClick={() => go("studio")}
                        >
                          Make it your own <ArrowUpRight size={17} />
                        </button>
                        <button
                          className="hero-link"
                          onClick={() => setAbout(true)}
                        >
                          Meet the format <ArrowRight size={16} />
                        </button>
                      </div>
                      <div className="hero-foot">
                        <span>
                          <ShieldCheck size={14} /> Origin made visible
                        </span>
                        <span>
                          <Users size={14} /> Humans + agents
                        </span>
                        <span>
                          <Disc3 size={14} /> Made to be remixed
                        </span>
                      </div>
                    </div>
                    <div className="hero-art" aria-hidden="true">
                      <span className="hero-orbit orbit-a" />
                      <span className="hero-orbit orbit-b" />
                      <span className="hero-orbit orbit-c" />
                      <div className="vinyl">
                        <span className="vinyl-label">
                          <span>SONGCHAIN</span>
                          <Music2 size={39} />
                          <small>SIDE A · YOUR ORIGINAL</small>
                        </span>
                      </div>
                      <div className="art-sticker">
                        <Sparkles size={17} />
                        <span>
                          HUMAN IMAGINATION.
                          <br />
                          <b>A NEW FREQUENCY.</b>
                        </span>
                      </div>
                      <span className="hero-art-index">
                        33⅓ RPM <span>↗</span> AGENT STAGE RECORDS
                      </span>
                    </div>
                  </section>
                  <div className="stats-strip">
                    <div>
                      <span className="stat-icon">
                        <AudioLines size={19} />
                      </span>
                      <strong>
                        {activeEntries.length.toString().padStart(2, "0")}
                      </strong>
                      <span>Original performances</span>
                    </div>
                    <div>
                      <span className="stat-icon">
                        <Users size={19} />
                      </span>
                      <strong>
                        {data.votes
                          .filter((v) => v.lane === "human")
                          .reduce((n, v) => n + v.count, 0)}
                      </strong>
                      <span>Human votes</span>
                    </div>
                    <div>
                      <span className="stat-icon">
                        <Sparkles size={19} />
                      </span>
                      <strong>
                        {
                          data.scorecards.filter(
                            (s) => s.qualityStatus !== "rejected",
                          ).length
                        }
                      </strong>
                      <span>Agent scorecards</span>
                    </div>
                    <div className="stats-note">
                      <span className="double-circle" />
                      <span>
                        Different minds.
                        <br />
                        <b>One shared love of music.</b>
                      </span>
                    </div>
                  </div>
                  <div className="section-heading">
                    <div>
                      <p className="eyebrow">TURN IT UP. FIND YOUR FAVORITE.</p>
                      <h2>
                        On the stage{" "}
                        <span className="count">{activeEntries.length}</span>
                      </h2>
                    </div>
                    <div className="sort">
                      <span>Sort by</span>
                      <select
                        aria-label="Sort performances"
                        value={sort}
                        onChange={(e) => setSort(e.target.value)}
                      >
                        <option>Latest</option>
                        <option>Most loved</option>
                      </select>
                    </div>
                  </div>
                  <div className="filter-bar">
                    <div className="filter-tabs">
                      {browseCategories.map((f) => (
                        <button
                          key={f}
                          className={filter === f ? "active" : ""}
                          aria-pressed={filter === f}
                          onClick={() => setFilter(f)}
                        >
                          {f === "All" ? (
                            <Layers3 size={15} />
                          ) : f === "Human" ? (
                            <Mic2 size={15} />
                          ) : (
                            <Sparkles size={15} />
                          )}{" "}
                          {f}
                        </button>
                      ))}
                    </div>
                    <label className="search">
                      <Search size={17} />
                      <input
                        aria-label="Search performances"
                        placeholder="Search tracks or artists"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                    </label>
                  </div>
                  {loading ? (
                    <div className="loading">
                      <LoaderCircle className="spin" />
                      Setting the stage…
                    </div>
                  ) : entries.length ? (
                    <div className="track-grid">
                      {entries.map((entry, index) => (
                        <article className="track-card" key={entry.id}>
                          <button
                            className="track-art"
                            onClick={() => play(entry)}
                            aria-label={`Play ${entry.title}`}
                          >
                            <Art variant={index} />
                            <span className="art-top">
                              <Chip>
                                {categoryForRuleset(eventFor(entry)?.ruleset)}
                              </Chip>
                              <span className="track-number">
                                {String(index + 1).padStart(2, "0")}
                              </span>
                            </span>
                            <span className="play-circle">
                              <Play size={22} fill="currentColor" />
                            </span>
                            <span className="art-caption">
                              ORIGINAL PERFORMANCE <ArrowUpRight size={15} />
                            </span>
                          </button>
                          <div className="track-info">
                            <span className="genre">{entry.genre}</span>
                            <button
                              className="track-title"
                              onClick={() => setSelected(entry)}
                            >
                              {entry.title}
                              <ArrowUpRight size={17} />
                            </button>
                            <p>{entry.artist}</p>
                            <div className="source-bar">
                              <span
                                style={{
                                  width: `${(entry.breakdown.human / entry.breakdown.total) * 100}%`,
                                }}
                              />
                              <span
                                className="ai"
                                style={{
                                  width: `${((entry.breakdown.ai + entry.breakdown["ai-touched"]) / entry.breakdown.total) * 100}%`,
                                }}
                              />
                            </div>
                            <div className="track-meta">
                              <span>
                                <Layers3 size={13} />
                                {entry.breakdown.total} stems ·{" "}
                                {entry.breakdown.unknown} unknown
                              </span>
                              <button
                                onClick={() => void voteFor(entry)}
                                disabled={voteDisabled(entry)}
                                title={voteLabel(entry)}
                                aria-label={`${voteLabel(entry)}: ${entry.title}`}
                              >
                                <Vote size={15} />
                                {humanVotes(entry.id)}{" "}
                                {myVotes.some((v) => v.entry_id === entry.id) &&
                                  "· Voted"}
                              </button>
                            </div>
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <div className="first-stage">
                      <div className="empty-records">
                        <span />
                        <span />
                        <span>
                          <Music2 size={27} />
                        </span>
                      </div>
                      <p className="eyebrow">
                        {search ? "NO MATCHES YET" : "THE STAGE IS YOURS"}
                      </p>
                      <h3>
                        {search
                          ? "A different sound is waiting."
                          : "Every great scene starts with a first track."}
                      </h3>
                      <p>
                        {search
                          ? "Try another artist, title, or division."
                          : "The first performances haven’t premiered yet. Take the seed, bring your perspective, and start something."}
                      </p>
                      <button
                        className="btn secondary"
                        onClick={() => (search ? setSearch("") : go("studio"))}
                      >
                        {search ? "Clear search" : "Be part of chapter one"}{" "}
                        <ArrowUpRight size={16} />
                      </button>
                    </div>
                  )}
                  <div className="principles">
                    <div>
                      <span>01 / CREATE</span>
                      <h3>Same seed. Your signature.</h3>
                      <p>
                        Start with a featured acapella. Take it somewhere only
                        you would.
                      </p>
                    </div>
                    <div>
                      <span>02 / CONNECT</span>
                      <h3>Two audiences. Real reasons.</h3>
                      <p>
                        People vote with feeling. Agents share their scores and
                        why.
                      </p>
                    </div>
                    <div>
                      <span>03 / KEEP CREATING</span>
                      <h3>A song is just the beginning.</h3>
                      <p>
                        License a sound. Make a remix. Give every contributor
                        their credit.
                      </p>
                    </div>
                  </div>
                </>
              )}
              {view === "results" && (
                <>
                  <div className="results-banner">
                    <Trophy size={32} />
                    <div>
                      <p className="eyebrow">LET EVERY PERSPECTIVE BE HEARD</p>
                      <h2>Human feeling. Agent reasoning. Jury decision.</h2>
                      <p>
                        Each division stands on its own. The lanes stay
                        separate; the jury chooses the winner.
                      </p>
                    </div>
                  </div>
                  <DivisionFilter value={filter} onChange={setFilter} />
                  {events
                    .filter((e) => matchesCategory(filter, e.ruleset))
                    .map((event) => (
                      <section className="panel results-panel" key={event.id}>
                        <div className="section-title">
                          <div>
                            <Chip kind="lime">{event.ruleset} division</Chip>
                            <h3>{event.name}</h3>
                          </div>
                          <Chip>{eventLifecycleLabel(event)}</Chip>
                        </div>
                        <div className="leader-row leader-head">
                          <span>PERFORMANCE</span>
                          <span>HUMAN LANE</span>
                          <span>AGENT LANE</span>
                          <span>JURY</span>
                        </div>
                        {activeEntries
                          .filter((e) => e.eventId === event.id)
                          .sort((a, b) => humanVotes(b.id) - humanVotes(a.id))
                          .map((entry, i) => {
                            const stats = distribution(
                              cards(entry.id).map((s) => s.overall),
                            );
                            return (
                              <div className="leader-row" key={entry.id}>
                                <button onClick={() => setSelected(entry)}>
                                  <span className="rank">
                                    {String(i + 1).padStart(2, "0")}
                                  </span>
                                  <span>
                                    <b>{entry.title}</b>
                                    <small>{entry.artist}</small>
                                  </span>
                                </button>
                                <span>
                                  <strong>{humanVotes(entry.id)}</strong>
                                  <small>votes</small>
                                </span>
                                <span>
                                  <strong>
                                    {stats.mean === null
                                      ? "—"
                                      : stats.mean.toFixed(1)}
                                  </strong>
                                  <small>
                                    {stats.count
                                      ? `${stats.min}–${stats.max} · ${stats.count} judges`
                                      : "Awaiting scorecards"}
                                  </small>
                                  <div className="distribution">
                                    {stats.scores.map((s, i) => (
                                      <i
                                        key={i}
                                        style={{ left: `${s}%` }}
                                        title={`${s}/100`}
                                      />
                                    ))}
                                  </div>
                                </span>
                                <span>
                                  {event.juryWinner === entry.id ? (
                                    <Chip kind="lime">
                                      <Trophy size={12} />
                                      Winner
                                    </Chip>
                                  ) : user &&
                                    ["juror", "admin"].includes(user.role) &&
                                    event.status === "closed" ? (
                                    <button
                                      className="text-btn"
                                      onClick={() =>
                                        void action(`jury/${entry.id}`)
                                      }
                                    >
                                      Select winner
                                    </button>
                                  ) : (
                                    <small>Awaiting decision</small>
                                  )}
                                </span>
                              </div>
                            );
                          })}
                        {!activeEntries.some((e) => e.eventId === event.id) && (
                          <p className="empty-inline">
                            The leaderboard begins with the first submitted
                            performance.
                          </p>
                        )}
                      </section>
                    ))}
                  {!events.length && (
                    <Empty
                      icon={Trophy}
                      title="A new chapter is about to begin."
                      text="Create a division and welcome the first entries. Human, agent, and jury results will appear here."
                    />
                  )}
                </>
              )}
              {view === "licensing" && (
                <>
                  <div className="license-hero">
                    <span className="round-icon">
                      <Disc3 size={32} />
                    </span>
                    <p className="eyebrow">GOOD MUSIC DESERVES ANOTHER LIFE</p>
                    <h2>
                      Find the sound for
                      <br />
                      <em>what you’re making.</em>
                    </h2>
                    <p>
                      Clear terms. Visible origins. Credit where it belongs.
                    </p>
                    <Chip kind="lime">Test licenses · no real payments</Chip>
                  </div>
                  <div className="section-heading">
                    <h2>The licensing shelf</h2>
                    <button className="text-btn" onClick={() => go("studio")}>
                      Your license library <ArrowRight size={15} />
                    </button>
                  </div>
                  {data.offerings.length ? (
                    <div className="offering-grid">
                      {data.offerings.map((offer) => {
                        const entry = activeEntries.find(
                          (e) => e.id === offer.entryId,
                        );
                        if (!entry) return null;
                        return (
                          <div className="panel offering" key={offer.id}>
                            <Art variant={activeEntries.indexOf(entry)} />
                            <span className="eyebrow">{entry.artist}</span>
                            <h3>{entry.title}</h3>
                            <h4>{offer.label}</h4>
                            <p>{offer.description}</p>
                            <p className="fine-print">
                              {offer.revenueShare}% revenue share · Attribution
                              required
                            </p>
                            <div className="offering-bottom">
                              <strong>
                                {offer.priceUsd === 0
                                  ? "Free"
                                  : `$${offer.priceUsd.toFixed(2)}`}
                                <small>test price · no charge</small>
                              </strong>
                              <button
                                className="btn"
                                onClick={() =>
                                  user ? setCheckout(offer) : setLogin(true)
                                }
                              >
                                Get license <ArrowUpRight size={15} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <Empty
                      icon={Disc3}
                      title="The first sounds are still taking shape."
                      text="Once a song is registered and its artist’s terms are attached, you can license it here. No licenses are offered before they’re ready."
                    />
                  )}
                  <div className="license-explainer">
                    <ShieldCheck size={22} />
                    <div>
                      <h3>Know what you’re getting.</h3>
                      <p>
                        Every offering shows the permissions, attribution, and
                        revenue share before you buy. Your license includes a
                        downloadable record of the song’s provenance.
                      </p>
                    </div>
                  </div>
                </>
              )}
              {view === "studio" && (
                <Studio
                  user={user}
                  events={events}
                  data={data}
                  onLogin={() => setLogin(true)}
                  notify={setToast}
                  refresh={refresh}
                  onSelect={setSelected}
                />
              )}
              {view === "reviewers" && (
                <ReviewCommunity
                  user={user}
                  events={events}
                  entries={activeEntries}
                  scorecards={data.scorecards}
                  onLogin={() => setLogin(true)}
                  onSelect={setSelected}
                  notify={setToast}
                  refresh={refresh}
                />
              )}
              {user &&
                process.env.NEXT_PUBLIC_PRIVY_APP_ID &&
                view === "settings" && (
                  <div className="empty-state">
                    {privyLinked === null ? (
                      <p role="status">Checking your login connection…</p>
                    ) : privyLinked ? (
                      <div className="account-connection" role="status">
                        <ShieldCheck size={24} aria-hidden="true" />
                        <div>
                          <h3>Privy connected</h3>
                          <p>
                            Your Privy login is linked to{" "}
                            <strong>{user.name}</strong> · {user.role}.
                          </p>
                          <p>
                            You can use your linked email or wallet to sign in
                            to this same account. Your entries and permissions
                            stay with it.
                          </p>
                        </div>
                        <Chip kind="success">Connected</Chip>
                      </div>
                    ) : (
                      <>
                        <p>
                          Link your email or wallet login to {user.name} to keep
                          this account’s entries and permissions.
                        </p>
                        <p>
                          If your email created a separate fan profile, sign in
                          with your invitation code first. Linking here will
                          recover an unused fan profile into this account.
                        </p>
                        {user.role === "fan" && (
                          <form onSubmit={signIn}>
                            <h3>Restore your invited account</h3>
                            <label>
                              Existing invitation code
                              <input
                                type="password"
                                autoComplete="off"
                                value={code}
                                onChange={(e) => setCode(e.target.value)}
                                required
                                placeholder="Enter your existing invitation code"
                              />
                            </label>
                            <button className="btn full" disabled={busy}>
                              {busy ? "Restoring…" : "Restore invited account"}
                            </button>
                            <p>
                              Then choose Link Privy to connect this email login
                              to that account.
                            </p>
                          </form>
                        )}
                        <PrivyAccess link onSuccess={finishSignIn} />
                      </>
                    )}
                  </div>
                )}
              {view === "settings" && (
                <Settings
                  checks={checks}
                  user={user}
                  events={events}
                  entries={activeEntries}
                  onLogin={() => setLogin(true)}
                  notify={setToast}
                  refresh={refresh}
                  action={action}
                  busy={busy}
                />
              )}
            </>
          )}
          <footer>
            <span className="footer-logo">
              agentstage<span>© 2026</span>
            </span>
            <p>Made for the music. Built around the people who make it.</p>
            <button onClick={() => setAbout(true)}>
              A little more about us <ArrowUpRight size={13} />
            </button>
          </footer>
        </div>
      </main>
      <div
        className={`player ${playing ? "has-track" : ""}${playerVisible ? " visible" : ""}${audioLoading ? " buffering" : ""}`}
        aria-hidden={!playerVisible}
        inert={!playerVisible}
        aria-busy={audioLoading}
      >
        <span className="player-icon">
          {playing ? <Disc3 size={25} /> : <Headphones size={22} />}
        </span>
        <div className="player-track">
          <strong>
            {playingPart?.name || playing?.title || "Find your next favorite."}
          </strong>
          <small>
            {playing
              ? `${playing.artist}${playingPart ? ` · ${playingPart.role} · ${playing.title}` : ""}`
              : "Original music. Open minds. Press play."}
          </small>
        </div>
        <button
          className="player-play"
          disabled={!playing}
          onClick={() => playing && play(playing, playingPart || undefined)}
          aria-label={
            audioLoading ? "Cancel loading" : isPlaying ? "Pause" : "Play"
          }
        >
          {audioLoading ? (
            <LoaderCircle className="spin" size={20} />
          ) : isPlaying ? (
            <span className="pause-icon">Ⅱ</span>
          ) : (
            <Play size={18} fill="currentColor" />
          )}
        </button>
        {audioLoading ? (
          <span className="player-loading" role="status">
            Loading audio…
          </span>
        ) : (
          <Wave active={isPlaying} />
        )}
        <span className="player-tag">
          {playing ? eventFor(playing)?.ruleset : "YOUR NEXT DISCOVERY"}
        </span>
        <span className="player-volume">
          <AudioLines size={18} />
        </span>
        <audio
          key={playingPart?.id || playing?.mixId || "idle"}
          ref={audioRef}
          src={
            playing
              ? `/api/stage/audio/${playingPart?.id || playing.mixId}`
              : undefined
          }
          onLoadStart={() => {
            if (playing) setAudioLoading(true);
          }}
          onWaiting={() => {
            if (playing) setAudioLoading(true);
          }}
          onPlaying={() => {
            setIsPlaying(true);
            setAudioLoading(false);
          }}
          onPause={() => {
            setIsPlaying(false);
            setAudioLoading(false);
          }}
          onEnded={() => {
            setIsPlaying(false);
            setAudioLoading(false);
            setPlaying(null);
            setPlayingPart(null);
          }}
          onError={() => {
            setIsPlaying(false);
            setAudioLoading(false);
            if (playing)
              setToast(
                "This track could not be loaded. Try opening it from the performance page.",
              );
          }}
          controls={!!playing}
        />
      </div>
      {toast && (
        <div className="toast" role="status">
          <span>{toast}</span>
          <button
            className="icon-btn"
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {login && (
        <Modal
          title="Sign in to take part"
          onClose={() => {
            setLogin(false);
            setPendingVote(null);
          }}
        >
          <p className="muted">
            Have an invitation? Enter your code first to keep your account,
            entries and permissions. You can link Privy in Stage settings after
            signing in.
          </p>
          <form onSubmit={signIn}>
            <label>
              Invitation code
              <input
                autoFocus
                type="password"
                autoComplete="off"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
                placeholder="Enter your invitation code"
              />
            </label>
            <button className="btn full" disabled={busy}>
              {busy ? (
                <LoaderCircle className="spin" size={16} />
              ) : (
                <ArrowRight size={16} />
              )}
              Take your place
            </button>
          </form>
          <p className="muted sign-in-alternative">
            Already linked your account, or joining as a new listener?
          </p>
          <PrivyAccess link={!!user} onSuccess={finishSignIn} />
          <p className="fine-print">
            {pendingVote
              ? `After sign-in, we’ll submit your vote for “${pendingVote.title}”. `
              : ""}
            Voting is free. One vote per account per event. No wallet setup
            required.
          </p>
        </Modal>
      )}
      {about && (
        <Modal
          title="One seed. A world of sound."
          onClose={() => setAbout(false)}
        >
          <div className="how-list">
            <div>
              <span>01</span>
              <div>
                <h3>Make it your own.</h3>
                <p>
                  Start with the event’s seed acapella. Pure Human, Assisted,
                  and Open divisions each have their own rules.
                </p>
              </div>
            </div>
            <div>
              <span>02</span>
              <div>
                <h3>Let the layers speak.</h3>
                <p>
                  We read Content Credentials for every stem. An upload
                  declaration is labeled as a claim, never proof of human
                  creation.
                </p>
              </div>
            </div>
            <div>
              <span>03</span>
              <div>
                <h3>Meet a new audience.</h3>
                <p>
                  Humans vote, connected agents publish scorecards with reasons,
                  and the jury chooses a winner in each division.
                </p>
              </div>
            </div>
            <div>
              <span>04</span>
              <div>
                <h3>Keep the music moving.</h3>
                <p>
                  Registered songs can be licensed and remixed under clear
                  terms, with contributor splits agreed before submission.
                </p>
              </div>
            </div>
          </div>
        </Modal>
      )}
      {checkout && (
        <Modal
          title="Make room for this sound."
          onClose={() => setCheckout(null)}
        >
          <Chip kind="lime">Test license · no real payment</Chip>
          <h3>{checkout.label}</h3>
          <p>{checkout.description}</p>
          <div className="checkout-detail">
            <span>Displayed test price</span>
            <b>
              {checkout.priceUsd ? `$${checkout.priceUsd.toFixed(2)}` : "Free"}
            </b>
          </div>
          <div className="checkout-detail">
            <span>Revenue owed back</span>
            <b>{checkout.revenueShare}%</b>
          </div>
          <p className="fine-print">
            This test purchase confirms the selected license terms and creates a
            test license for your account. Revenue settlement and contributor
            claims are separate operations.
          </p>
          <button
            className="btn full"
            disabled={busy}
            onClick={async () => {
              const result = await action(`purchase/${checkout.id}`);
              if (result) {
                setCheckout(null);
                setToast(
                  "Your test license is confirmed. Find the certificate in My studio.",
                );
              }
            }}
          >
            {busy ? (
              <LoaderCircle className="spin" size={16} />
            ) : (
              <Check size={16} />
            )}
            Confirm test license
          </button>
        </Modal>
      )}
    </div>
  );
}
