import { useEffect, useState, type FormEvent } from "react";
import { useApi } from "../../hooks/useApi";
import { Spinner } from "../../components/ui";

interface Association {
  id: number;
  name: string;
}

interface Club {
  id: number;
  name: string;
  association_id: number | null;
  association_name: string | null;
  location: string | null;
  contact_email: string | null;
  contact_phone: string | null;
}

interface Membership {
  athleteIds: number[];
  coachIds: number[];
}

export default function Clubs() {
  const api = useApi();
  const [clubs, setClubs] = useState<Club[] | null>(null);
  const [associations, setAssociations] = useState<Association[]>([]);
  const [memberships, setMemberships] = useState<Record<number, Membership>>(
    {}
  );
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load() {
    try {
      const [clubsRes, associationsRes] = await Promise.all([
        api.get<{ clubs: Club[] }>("/admin/clubs"),
        api.get<{ associations: Association[] }>("/admin/associations"),
      ]);
      setClubs(clubsRes.clubs);
      setAssociations(associationsRes.associations);

      const entries = await Promise.all(
        clubsRes.clubs.map(async (c) => {
          const [athletes, coaches] = await Promise.all([
            api.get<{ athleteIds: number[] }>(`/admin/clubs/${c.id}/athletes`),
            api.get<{ coachIds: number[] }>(`/admin/clubs/${c.id}/coaches`),
          ]);
          return [
            c.id,
            { athleteIds: athletes.athleteIds, coachIds: coaches.coachIds },
          ] as const;
        })
      );
      setMemberships(Object.fromEntries(entries));
    } catch {
      setError("Failed to load clubs");
    }
  }

  async function createClub(e: FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    const { club } = await api.post<{ club: Club }>("/admin/clubs", {
      name: newName,
    });
    setClubs((prev) => (prev ? [...prev, club] : [club]));
    setMemberships((prev) => ({
      ...prev,
      [club.id]: { athleteIds: [], coachIds: [] },
    }));
    setNewName("");
  }

  async function updateClub(id: number, patch: Record<string, unknown>) {
    const { club } = await api.patch<{ club: Club }>(
      `/admin/clubs/${id}`,
      patch
    );
    setClubs((prev) => (prev ? prev.map((c) => (c.id === id ? club : c)) : prev));
  }

  async function deleteClub(id: number) {
    await api.del(`/admin/clubs/${id}`);
    setClubs((prev) => (prev ? prev.filter((c) => c.id !== id) : prev));
  }

  async function addMember(
    clubId: number,
    kind: "athlete" | "coach",
    idValue: string
  ) {
    const id = Number(idValue);
    if (!Number.isInteger(id) || id <= 0) return;
    const current = memberships[clubId] ?? { athleteIds: [], coachIds: [] };
    const key = kind === "athlete" ? "athleteIds" : "coachIds";
    if (current[key].includes(id)) return;
    const nextIds = [...current[key], id];
    const path =
      kind === "athlete"
        ? `/admin/clubs/${clubId}/athletes`
        : `/admin/clubs/${clubId}/coaches`;
    const body = kind === "athlete" ? { athleteIds: nextIds } : { coachIds: nextIds };
    await api.put(path, body);
    setMemberships((prev) => ({ ...prev, [clubId]: { ...current, [key]: nextIds } }));
  }

  async function removeMember(
    clubId: number,
    kind: "athlete" | "coach",
    id: number
  ) {
    const current = memberships[clubId] ?? { athleteIds: [], coachIds: [] };
    const key = kind === "athlete" ? "athleteIds" : "coachIds";
    const nextIds = current[key].filter((existing) => existing !== id);
    const path =
      kind === "athlete"
        ? `/admin/clubs/${clubId}/athletes`
        : `/admin/clubs/${clubId}/coaches`;
    const body = kind === "athlete" ? { athleteIds: nextIds } : { coachIds: nextIds };
    await api.put(path, body);
    setMemberships((prev) => ({ ...prev, [clubId]: { ...current, [key]: nextIds } }));
  }

  if (error) return <div className="p-4 text-red-700">{error}</div>;
  if (!clubs)
    return (
      <div className="flex justify-center p-8">
        <Spinner />
      </div>
    );

  return (
    <div className="flex flex-col gap-3 p-4">
      <h1 className="text-xl font-semibold">Clubs</h1>

      <form onSubmit={createClub} className="flex gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New club name"
          className="min-h-[44px] flex-1 rounded-lg border border-slate-300 px-3"
        />
        <button
          type="submit"
          className="min-h-[44px] rounded-lg bg-red-700 px-4 font-medium text-white"
        >
          Add
        </button>
      </form>

      {clubs.map((c) => {
        const membership = memberships[c.id] ?? { athleteIds: [], coachIds: [] };
        return (
          <div
            key={c.id}
            className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3"
          >
            <div className="flex items-center justify-between gap-2">
              <input
                defaultValue={c.name}
                onBlur={(e) => {
                  if (e.target.value !== c.name) {
                    updateClub(c.id, { name: e.target.value });
                  }
                }}
                className="min-h-[44px] flex-1 rounded-lg border border-slate-300 px-2 font-medium"
              />
              <button
                onClick={() => deleteClub(c.id)}
                className="min-h-[44px] rounded-lg border border-slate-300 px-3 text-sm text-red-700"
              >
                Delete
              </button>
            </div>

            <input
              defaultValue={c.location ?? ""}
              placeholder="Location"
              onBlur={(e) => {
                if (e.target.value !== (c.location ?? "")) {
                  updateClub(c.id, { location: e.target.value });
                }
              }}
              className="min-h-[44px] rounded-lg border border-slate-300 px-2"
            />

            <select
              value={c.association_id ?? ""}
              onChange={(e) =>
                updateClub(c.id, {
                  association_id: e.target.value ? Number(e.target.value) : null,
                })
              }
              className="min-h-[44px] rounded-lg border border-slate-300 px-2"
            >
              <option value="">No association</option>
              {associations.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>

            <MemberEditor
              label="Athletes"
              singularLabel="Athlete"
              ids={membership.athleteIds}
              onAdd={(value) => addMember(c.id, "athlete", value)}
              onRemove={(id) => removeMember(c.id, "athlete", id)}
            />
            <MemberEditor
              label="Coaches"
              singularLabel="Coach"
              ids={membership.coachIds}
              onAdd={(value) => addMember(c.id, "coach", value)}
              onRemove={(id) => removeMember(c.id, "coach", id)}
            />
          </div>
        );
      })}
    </div>
  );
}

function MemberEditor({
  label,
  singularLabel,
  ids,
  onAdd,
  onRemove,
}: {
  label: string;
  singularLabel: string;
  ids: number[];
  onAdd: (value: string) => void;
  onRemove: (id: number) => void;
}) {
  const [value, setValue] = useState("");

  return (
    <div className="flex flex-col gap-1 rounded-lg bg-slate-50 p-2">
      <span className="text-xs font-medium text-slate-600">
        {label} ({ids.length})
      </span>
      <div className="flex flex-wrap gap-1">
        {ids.map((id) => (
          <button
            key={id}
            onClick={() => onRemove(id)}
            className="rounded-full bg-slate-200 px-2 py-1 text-xs"
            title="Remove"
          >
            #{id} ✕
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={`${singularLabel} ID`}
          inputMode="numeric"
          className="min-h-[44px] flex-1 rounded-lg border border-slate-300 px-2"
        />
        <button
          onClick={() => {
            onAdd(value);
            setValue("");
          }}
          className="min-h-[44px] rounded-lg border border-slate-300 px-3 text-sm"
        >
          Add
        </button>
      </div>
    </div>
  );
}
