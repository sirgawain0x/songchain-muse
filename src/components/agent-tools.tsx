"use client";
import { useEffect, useState } from "react";
import { Sparkles, LoaderCircle, ArrowUpRight } from "lucide-react";
import { api } from "@/lib/client-api";
type Agent = { id: string; name: string; focus: string };
function useAgents() {
  const [agents, setAgents] = useState<Agent[]>([]);
  useEffect(() => {
    void api("agents")
      .then((data) => setAgents(data.agents))
      .catch(() => {});
  }, []);
  return agents;
}
export function AgentControls({
  entryId,
  notify,
  refresh,
  onPublished,
}: {
  entryId: string;
  notify: (text: string) => void;
  refresh: () => Promise<void>;
  onPublished: () => void;
}) {
  const agents = useAgents();
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{
    model: string;
    generatedAt: string;
    limitation: string;
    card: { criteria: { name: string; score: number; rationale: string }[] };
    audio: { role: string; durationSeconds: number; conversion: string }[];
  } | null>(null);
  const [previewState, setPreviewState] = useState("");
  useEffect(() => {
    let active = true;
    setPreview(null);
    void api(`listening-preview/${entryId}`)
      .then((result) => {
        if (!active) return;
        setPreview(result.preview);
        setPreviewState(
          result.state === "processing"
            ? "A listening preview is running. Reopen this performance to check its result."
            : result.error || "",
        );
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [entryId]);
  async function previewAudio() {
    setBusy(true);
    setPreviewState(
      "Preparing analysis audio and requesting Meta feedback. This can take a few minutes…",
    );
    try {
      const result = await api(`listening-preview/${entryId}`, {});
      setPreview(result.preview);
      setPreviewState(
        "Listening preview saved. No contest score or vote was added.",
      );
    } catch (e) {
      setPreviewState(
        e instanceof Error ? e.message : "The preview could not be completed.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function requestReview() {
    setBusy(true);
    try {
      await api(`judge/${entryId}`, { agentId: selected });
      notify("The agent’s scorecard is published.");
      await refresh();
    } catch (e) {
      notify(
        e instanceof Error ? e.message : "The review could not be completed.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="panel">
      <h3>AI listening preview</h3>
      <p className="muted">
        Listen with Meta before inviting an independent contest reviewer. This
        preview compares the actual seed and remix; it does not affect rankings
        or cast a vote.
      </p>
      {!preview && (
        <button
          className="btn secondary"
          disabled={
            busy || previewState.startsWith("A listening preview is running")
          }
          onClick={() => void previewAudio()}
        >
          {busy ? (
            <LoaderCircle size={16} className="spin" />
          ) : (
            <Sparkles size={16} />
          )}
          {busy
            ? "Listening to the seed and remix…"
            : "Generate listening preview"}
        </button>
      )}
      {previewState && <p role="status">{previewState}</p>}
      {preview && (
        <div className="scorecard">
          <button
            className="btn secondary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await api(`publish-listening-preview/${entryId}`, {});
                onPublished();
                notify(
                  "Meta feedback published as experimental and non-voting. Standings are unchanged.",
                );
              } catch (error) {
                notify(
                  error instanceof Error
                    ? error.message
                    : "Could not publish feedback.",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Publishing…" : "Publish saved Meta feedback"}
          </button>
          <p className="fine-print">
            Makes the ratings, rationales and model receipt public. The
            unverified transcript and private storage details stay private.
          </p>
          <h4>Non-voting preview · {preview.model}</h4>
          <p className="fine-print">{preview.limitation}</p>
          <div className="criteria-grid">
            {preview.card.criteria.map((c) => (
              <div key={c.name}>
                <div>
                  <strong>{c.name}</strong>
                  <b>{c.score}/100</b>
                </div>
                <p>{c.rationale}</p>
              </div>
            ))}
          </div>
          <p className="fine-print">
            Compared full seed and mix analysis copies (
            {preview.audio
              .map((a) => `${a.role}: ${Math.round(a.durationSeconds)}s`)
              .join("; ")}
            ). Originals unchanged. Saved{" "}
            {new Date(preview.generatedAt).toLocaleString()}.
          </p>
        </div>
      )}
      <h3>Invite an agent’s perspective</h3>
      <p className="muted">
        Audio reviews use the actual song and seed. A reviewer who helped create
        a song cannot judge its division. The reviewer must first receive a slot
        in Agent community; entrants cannot review their own song.
      </p>
      <label>
        Connected reviewer
        <select value={selected} onChange={(e) => setSelected(e.target.value)}>
          <option value="">Choose a team reviewer</option>
          {agents.map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agent.name} · {agent.focus}
            </option>
          ))}
        </select>
      </label>
      {!agents.length && (
        <p className="fine-print">
          The stage team needs to connect its reviewers first.
        </p>
      )}
      <div className="button-row">
        <button
          className="btn secondary"
          disabled={busy || !selected}
          onClick={() => void requestReview()}
        >
          {busy ? (
            <LoaderCircle size={16} className="spin" />
          ) : (
            <Sparkles size={16} />
          )}
          Request an audio review
        </button>
      </div>
      <p className="fine-print">
        Model-based reviews are experimental. Scores are published only after a
        valid response; missing services never produce sample scores.
      </p>
    </div>
  );
}
export function ArrangementAssistant({
  eventId,
  ruleset,
  notify,
}: {
  eventId: string;
  ruleset: string;
  notify: (text: string) => void;
}) {
  const agents = useAgents();
  const [agentId, setAgentId] = useState("");
  const [prompt, setPrompt] = useState("");
  const [result, setResult] = useState("");
  const [busy, setBusy] = useState(false);
  if (ruleset === "Pure Human") return null;
  return (
    <div className="assistant-box">
      <div className="section-title">
        <h3>
          <Sparkles size={17} />A fresh pair of ears for your ideas
        </h3>
      </div>
      <p className="fine-print">
        Ask for arrangement or songwriting suggestions. Using an assistant
        records a conflict for its owner across this division. Suggestions use
        your text; they do not establish a recording’s origin.
      </p>
      <label>
        Connected assistant
        <select value={agentId} onChange={(e) => setAgentId(e.target.value)}>
          <option value="">Choose an assistant</option>
          {agents.map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agent.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        What are you working on?
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          maxLength={4000}
          placeholder="Describe your arrangement and what you want to explore…"
          rows={3}
        />
      </label>
      <button
        className="btn secondary"
        type="button"
        disabled={busy || !agentId || prompt.trim().length < 10}
        onClick={async () => {
          setBusy(true);
          try {
            const response = await api(`assistant/${eventId}`, {
              agentId,
              prompt,
            });
            setResult(response.text);
          } catch (e) {
            notify(
              e instanceof Error
                ? e.message
                : "The assistant could not respond.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? (
          <LoaderCircle size={16} className="spin" />
        ) : (
          <ArrowUpRight size={16} />
        )}
        Explore an idea
      </button>
      {result && <div className="assistant-response">{result}</div>}
    </div>
  );
}
