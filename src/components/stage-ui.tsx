"use client";
import { useAuthOverlay } from "./auth-overlay";
import { useEffect, useRef } from "react";
import { Music2, X } from "lucide-react";
import { browseCategories, type BrowseCategory } from "@/lib/browse-categories";
export function Chip({
  children,
  kind = "muted",
}: {
  children: React.ReactNode;
  kind?: string;
}) {
  return <span className={`chip ${kind}`}>{children}</span>;
}
export function Art({
  variant = 0,
  large = false,
}: {
  variant?: number;
  large?: boolean;
}) {
  return (
    <div className={`cover-art art-${variant % 4} ${large ? "large" : ""}`}>
      <div className="art-orbit one" />
      <div className="art-orbit two" />
      <div className="art-orbit three" />
      <span className="art-grain" />
      <span className="art-mark">
        AS
        <span>
          ORIGINAL
          <br />
          SOUND
        </span>
      </span>
    </div>
  );
}
export function Wave({ active = false }: { active?: boolean }) {
  return (
    <div className={`wave ${active ? "active" : ""}`} aria-hidden="true">
      {Array.from({ length: 58 }, (_, i) => (
        <i
          key={i}
          style={{
            height: `${(12 + Math.abs(Math.sin(i * 1.83) * Math.cos(i * 0.39)) * 34).toFixed(2)}px`,
            animationDelay: `${(i * 0.025).toFixed(3)}s`,
          }}
        />
      ))}
    </div>
  );
}
export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const authOverlay = useAuthOverlay();
  useEffect(() => {
    const d = ref.current;
    // Native modal dialogs occupy the browser top layer, above Privy's portal.
    // Close without unmounting so login callbacks and form state survive.
    if (authOverlay) d?.close();
    else if (d && !d.open) d.showModal();
    return () => d?.close();
  }, [authOverlay]);
  return (
    <dialog
      ref={ref}
      className="modal"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-head">
        <h2>{title}</h2>
        <button
          className="icon-btn"
          onClick={onClose}
          aria-label="Close dialog"
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}

export function Empty({
  icon: Icon,
  title,
  text,
}: {
  icon: typeof Music2;
  title: string;
  text: string;
}) {
  return (
    <div className="empty">
      <span className="round-icon">
        <Icon size={29} />
      </span>
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}
export function DivisionFilter({
  value,
  onChange,
}: {
  value: BrowseCategory;
  onChange: (v: BrowseCategory) => void;
}) {
  return (
    <div className="filter-tabs standalone">
      {browseCategories.map((f) => (
        <button
          key={f}
          className={value === f ? "active" : ""}
          aria-pressed={value === f}
          onClick={() => onChange(f)}
        >
          {f}
        </button>
      ))}
    </div>
  );
}
