"use client";
import { useRef, useState } from "react";
import { Plus, LoaderCircle } from "lucide-react";
import type { Media } from "@/lib/domain";
import { api } from "@/lib/client-api";
async function upload(
  file: File,
  role: Media["role"],
  declaredSource: Media["declaredSource"],
  declaredTool: string,
) {
  const mime =
    file.type ||
    (/\.wav$/i.test(file.name)
      ? "audio/wav"
      : /\.flac$/i.test(file.name)
        ? "audio/flac"
        : /\.m4a$/i.test(file.name)
          ? "audio/mp4"
          : "audio/mpeg");
  const ticket = await api("upload-ticket", {
    name: file.name,
    mime,
    size: file.size,
    sha256: Array.from(
      new Uint8Array(
        await crypto.subtle.digest("SHA-256", await file.arrayBuffer()),
      ),
      (byte) => byte.toString(16).padStart(2, "0"),
    ).join(""),
    role,
    declaredSource,
    declaredTool,
  });
  const form = new FormData();
  form.append("file", file);
  const response = await fetch(ticket.url, { method: "POST", body: form });
  if (!response.ok)
    throw new Error(
      "Pinata upload failed. Check the file format and try again.",
    );
  const result = await response.json();
  return (
    await api("upload-complete", {
      uploadId: ticket.uploadId,
      fileId: result.data.id,
    })
  ).media as Media;
}
export function UploadField({
  role,
  onUpload,
  title,
}: {
  role: Media["role"];
  onUpload: (media: Media) => void;
  title: string;
}) {
  const [source, setSource] = useState<Media["declaredSource"]>("unknown");
  const [tool, setTool] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="upload-field">
      <div className="form-grid">
        <label>
          Declared source
          <select
            value={source}
            onChange={(e) =>
              setSource(e.target.value as Media["declaredSource"])
            }
          >
            <option value="unknown">Not established</option>
            <option value="human">Human-created (declaration)</option>
            <option value="ai">AI-generated (declaration)</option>
            <option value="ai-touched">AI-assisted (declaration)</option>
          </select>
        </label>
        <label>
          Tool or recording setup
          <input
            value={tool}
            onChange={(e) => setTool(e.target.value)}
            placeholder="e.g. Ableton Live / microphone"
            maxLength={100}
          />
        </label>
      </div>
      <button
        className="upload-drop"
        disabled={busy}
        onClick={() => ref.current?.click()}
        type="button"
      >
        {busy ? (
          <LoaderCircle className="spin" size={22} />
        ) : (
          <Plus size={24} />
        )}
        <strong>{busy ? "Uploading & checking credentials…" : title}</strong>
        <span>MP3, WAV, M4A, FLAC · up to 40 MB · private upload</span>
      </button>
      <input
        className="visually-hidden"
        type="file"
        ref={ref}
        accept=".mp3,.wav,.m4a,.flac"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          setBusy(true);
          setMessage("");
          try {
            const media = await upload(file, role, source, tool);
            onUpload(media);
            setMessage(
              `${media.name} · ${media.evidence.level} · source ${media.evidence.source}`,
            );
          } catch (error) {
            setMessage(
              error instanceof Error ? error.message : "Upload failed.",
            );
          } finally {
            setBusy(false);
            e.target.value = "";
          }
        }}
      />
      {message && (
        <p className="upload-message" role="status">
          {message}
        </p>
      )}
    </div>
  );
}
