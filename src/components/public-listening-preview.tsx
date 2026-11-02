"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/client-api";
import type { PublicPreview } from "@/lib/public-preview";

export function PublicListeningPreview({ entryId }: { entryId: string }) {
  const [preview, setPreview] = useState<PublicPreview | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    setPreview(null);
    setFailed(false);
    void api(`public-listening-preview/${entryId}`)
      .then((result) => {
        if (active) setPreview(result.preview);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [entryId]);
  if (failed)
    return (
      <p role="status">
        Published Meta feedback could not be loaded. Reopen this performance to
        retry.
      </p>
    );
  if (!preview) return null;
  return (
    <section
      className="panel scorecard"
      aria-label="Experimental Meta feedback"
    >
      <div className="section-title">
        <h3>Experimental Meta feedback</h3>
        <span>Non-voting</span>
      </div>
      <p className="muted">
        {preview.limitation} These ratings do not affect standings.
      </p>
      <p>
        <strong>{preview.model}</strong> ·{" "}
        {new Date(preview.generatedAt).toLocaleString()}
      </p>
      <div className="criteria-grid">
        {preview.card.criteria.map((item) => (
          <div key={item.name}>
            <div>
              <strong>{item.name}</strong>
              <b>{item.score}/100</b>
            </div>
            <p>{item.rationale}</p>
          </div>
        ))}
      </div>
      <p className="fine-print">
        Compared full analysis audio:{" "}
        {preview.audio
          .map(
            (item) =>
              `${item.role}: ${item.durationSeconds.toFixed(1)} seconds`,
          )
          .join("; ")}
        . Original audio unchanged.
      </p>
      <details>
        <summary>Meta response receipt</summary>
        <p style={{ overflowWrap: "anywhere" }}>{preview.responseId}</p>
        <p className="fine-print">
          Saved provider response identifier; viewing this feedback does not
          request another model run.
        </p>
      </details>
    </section>
  );
}
