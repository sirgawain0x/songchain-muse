"use client";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/client-api";
import type { TranscriptView } from "@/lib/transcript-view";

export function TranscriptPanel({
  entryId,
  canGenerate,
}: {
  entryId: string;
  canGenerate: boolean;
}) {
  const [transcript, setTranscript] = useState<TranscriptView | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const textRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setTranscript(null);
    setMessage("");
    void api(`transcript/${entryId}`)
      .then((result) => {
        if (active) setTranscript(result.transcript);
      })
      .catch((error) => {
        if (active)
          setMessage(
            error instanceof Error
              ? error.message
              : "Could not load the saved transcript.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [entryId]);
  async function generate() {
    setBusy(true);
    setMessage("Transcribing the performance. This can take a few minutes…");
    try {
      await api(`transcribe/${entryId}`, {});
      const result = await api(`transcript/${entryId}`);
      setTranscript(result.transcript);
      setMessage(
        result.transcript
          ? "Transcript ready below. You can copy it or download a text file."
          : "No readable transcript was returned.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not transcribe this performance.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function copy() {
    if (!transcript) return;
    try {
      await navigator.clipboard.writeText(transcript.text);
      setMessage("Transcript copied. You can paste it into your agent’s chat.");
    } catch {
      textRef.current?.focus();
      textRef.current?.select();
      setMessage(
        "Copy access was unavailable. The transcript is selected; use your device’s Copy command or download the text file.",
      );
    }
  }
  function download() {
    if (!transcript) return;
    const url = URL.createObjectURL(
      new Blob([transcript.text], { type: "text/plain;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "agent-stage-transcript.txt";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <section
      className="panel transcript-panel"
      aria-label="Performance transcript"
    >
      <h3>Performance transcript</h3>
      <p className="muted">
        AI-generated from the recording. Check the words before using them. This
        private transcript is available to the artist and stage administrators.
      </p>
      {loading ? (
        <p role="status">Loading saved transcript…</p>
      ) : transcript ? (
        <>
          <p className="fine-print">
            {transcript.model}
            {transcript.durationSeconds !== null
              ? ` · ${transcript.durationSeconds.toFixed(1)} seconds of audio`
              : ""}
          </p>
          <label>
            Transcript text
            <textarea
              ref={textRef}
              readOnly
              value={transcript.text}
              rows={12}
            />
          </label>
          <div className="button-row">
            <button className="btn" onClick={() => void copy()}>
              Copy transcript
            </button>
            <button className="btn secondary" onClick={download}>
              Download .txt
            </button>
          </div>
        </>
      ) : (
        <>
          <p>No saved transcript is available yet.</p>
          {canGenerate && (
            <button
              className="btn secondary"
              disabled={busy}
              onClick={() => void generate()}
            >
              {busy ? "Transcribing…" : "Generate a transcript"}
            </button>
          )}
        </>
      )}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
