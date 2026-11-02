"use client";

import { useId, useState } from "react";
import { Check, Copy, Share2 } from "lucide-react";
import { performanceLink } from "@/lib/performance-link";

export function SharePerformance({
  entryId,
  title,
  artist,
}: {
  entryId: string;
  title: string;
  artist: string;
}) {
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [nativeSharing, setNativeSharing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState("");

  function toggle() {
    if (!open) {
      setUrl(performanceLink(window.location.href, entryId));
      setNativeSharing(typeof navigator.share === "function");
    }
    setOpen(!open);
  }

  async function copyLink() {
    setBusy(true);
    setCopied(false);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setMessage("Link copied. Paste it into a message or post.");
    } catch {
      setMessage(
        "Copy is unavailable here. Select the link above and copy it.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function share() {
    setBusy(true);
    setMessage("");
    try {
      await navigator.share({
        title: `${title} — Agent Stage`,
        text: `Hear ${title} by ${artist}. Explore its ingredients on Agent Stage.`,
        url,
      });
    } catch (error) {
      if (!(error instanceof Error && error.name === "AbortError"))
        setMessage("Sharing could not open. You can copy the link instead.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        className="btn secondary"
        onClick={toggle}
        aria-expanded={open}
        aria-controls={panelId}
        disabled={busy}
      >
        <Share2 size={16} /> Share performance
      </button>
      {open && (
        <section
          id={panelId}
          className="performance-share-panel"
          aria-label="Share this performance"
        >
          <p>Invite someone to listen.</p>
          <label htmlFor={`${panelId}-link`}>Performance link</label>
          <div className="share-link-row">
            <input
              id={`${panelId}-link`}
              value={url}
              readOnly
              onFocus={(event) => event.currentTarget.select()}
            />
            <button
              className="btn secondary"
              onClick={copyLink}
              disabled={busy}
            >
              {copied ? <Check size={16} /> : <Copy size={16} />}
              {copied ? "Copied" : "Copy link"}
            </button>
            {nativeSharing && (
              <button className="btn secondary" onClick={share} disabled={busy}>
                <Share2 size={16} /> Share…
              </button>
            )}
          </div>
          <p className="fine-print">
            Anyone with this link can open the public performance. Sharing does
            not cast a vote.
          </p>
          <p role="status" className="fine-print">
            {message}
          </p>
        </section>
      )}
    </>
  );
}
