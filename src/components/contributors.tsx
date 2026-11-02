"use client";
import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { api } from "@/lib/client-api";
type Person = { id: string; name: string };
export function useContributors(enabled: boolean) {
  const [people, setPeople] = useState<Person[]>([]);
  useEffect(() => {
    if (enabled)
      void api("contributors")
        .then((data) => setPeople(data.contributors))
        .catch(() => {});
  }, [enabled]);
  return people;
}
export type Contribution = {
  ownerId: string;
  name: string;
  percentage: string;
};
export function ContributorShares({
  value,
  onChange,
}: {
  value: Contribution[];
  onChange: (shares: Contribution[]) => void;
}) {
  const people = useContributors(true);
  return (
    <div>
      {value.map((share, index) => (
        <div className="contributor-row" key={index}>
          <label>
            Contributor
            <select
              required
              value={share.ownerId}
              onChange={(e) =>
                onChange(
                  value.map((s, i) =>
                    i === index
                      ? {
                          ...s,
                          ownerId: e.target.value,
                          name:
                            people.find((p) => p.id === e.target.value)?.name ||
                            "",
                        }
                      : s,
                  ),
                )
              }
            >
              <option value="">Choose an artist</option>
              {people.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Agreed share (%)
            <input
              required
              type="number"
              min="0.01"
              max="100"
              step="0.01"
              value={share.percentage}
              placeholder="Set a share"
              onChange={(e) =>
                onChange(
                  value.map((s, i) =>
                    i === index ? { ...s, percentage: e.target.value } : s,
                  ),
                )
              }
            />
          </label>
          <button
            type="button"
            className="icon-btn"
            disabled={value.length === 1}
            aria-label="Remove contributor"
            onClick={() => onChange(value.filter((_, i) => i !== index))}
          >
            <X size={16} />
          </button>
        </div>
      ))}
      <button
        className="text-btn"
        type="button"
        onClick={() =>
          onChange([...value, { ownerId: "", name: "", percentage: "" }])
        }
      >
        <Plus size={14} />
        Add a contributor
      </button>
      <p className="fine-print">
        Agreed shares:{" "}
        {value
          .reduce((sum, s) => sum + (Number(s.percentage) || 0), 0)
          .toFixed(2)}
        % of 100%. Ask the stage team to invite any missing contributors.
      </p>
    </div>
  );
}
