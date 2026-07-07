import { useEffect, useState, type FormEvent } from "react";
import { useApi } from "../../hooks/useApi";
import {
  Spinner,
  Drawer,
  AddButton,
  DeleteButton,
  Field,
} from "../../components/ui";

interface Association {
  id: number;
  name: string;
}

interface Person {
  id: number;
  first_name: string;
  last_name: string;
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

const EMPTY_FORM = {
  name: "",
  location: "",
  contact_email: "",
  contact_phone: "",
  association_id: "",
};

export default function Clubs() {
  const api = useApi();
  const [clubs, setClubs] = useState<Club[] | null>(null);
  const [associations, setAssociations] = useState<Association[]>([]);
  const [allAthletes, setAllAthletes] = useState<Person[]>([]);
  const [allCoaches, setAllCoaches] = useState<Person[]>([]);
  const [memberships, setMemberships] = useState<Record<number, Membership>>(
    {}
  );
  const [error, setError] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<"closed" | "create" | Club>("closed");
  const [form, setForm] = useState(EMPTY_FORM);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load() {
    try {
      const [clubsRes, associationsRes, athletesRes, coachesRes] =
        await Promise.all([
          api.get<{ clubs: Club[] }>("/admin/clubs"),
          api.get<{ associations: Association[] }>("/admin/associations"),
          api.get<{ athletes: Person[] }>("/athletes"),
          api.get<{ coaches: Person[] }>("/admin/coaches"),
        ]);
      setClubs(clubsRes.clubs);
      setAssociations(associationsRes.associations);
      setAllAthletes(athletesRes.athletes);
      setAllCoaches(coachesRes.coaches);

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

  function openCreate() {
    setForm(EMPTY_FORM);
    setDrawer("create");
  }

  async function createClub(e: FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    const { club } = await api.post<{ club: Club }>("/admin/clubs", {
      ...form,
      association_id: form.association_id ? Number(form.association_id) : null,
    });
    setClubs((prev) => (prev ? [...prev, club] : [club]));
    setMemberships((prev) => ({
      ...prev,
      [club.id]: { athleteIds: [], coachIds: [] },
    }));
    setDrawer("closed");
  }

  async function updateClub(id: number, patch: Record<string, unknown>) {
    const { club } = await api.patch<{ club: Club }>(
      `/admin/clubs/${id}`,
      patch
    );
    setClubs((prev) => (prev ? prev.map((c) => (c.id === id ? club : c)) : prev));
    setDrawer((prev) =>
      prev !== "closed" && prev !== "create" && prev.id === id ? club : prev
    );
  }

  async function deleteClub(id: number) {
    await api.del(`/admin/clubs/${id}`);
    setClubs((prev) => (prev ? prev.filter((c) => c.id !== id) : prev));
    setDrawer("closed");
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

  const editing = drawer !== "closed" && drawer !== "create" ? drawer : null;
  const editingMembership = editing
    ? memberships[editing.id] ?? { athleteIds: [], coachIds: [] }
    : null;

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Clubs</h1>
        <AddButton onClick={openCreate} />
      </div>

      <div className="flex flex-col gap-2">
        {clubs.map((c) => (
          <button
            key={c.id}
            onClick={() => setDrawer(c)}
            className="min-h-[44px] rounded-lg border border-slate-200 px-3 py-2 text-left font-medium"
          >
            {c.name}
          </button>
        ))}
      </div>

      <Drawer
        open={drawer === "create"}
        onClose={() => setDrawer("closed")}
        title="New club"
      >
        <form onSubmit={createClub} className="flex flex-col gap-4">
          <Field label="Name">
            <input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="min-h-[44px] rounded-lg border border-slate-300 px-3"
            />
          </Field>
          <Field label="Location">
            <input
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
              className="min-h-[44px] rounded-lg border border-slate-300 px-3"
            />
          </Field>
          <Field label="Association">
            <select
              value={form.association_id}
              onChange={(e) =>
                setForm({ ...form, association_id: e.target.value })
              }
              className="min-h-[44px] rounded-lg border border-slate-300 px-3"
            >
              <option value="">No association</option>
              {associations.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Contact email">
            <input
              type="email"
              value={form.contact_email}
              onChange={(e) =>
                setForm({ ...form, contact_email: e.target.value })
              }
              className="min-h-[44px] rounded-lg border border-slate-300 px-3"
            />
          </Field>
          <Field label="Contact phone">
            <input
              value={form.contact_phone}
              onChange={(e) =>
                setForm({ ...form, contact_phone: e.target.value })
              }
              className="min-h-[44px] rounded-lg border border-slate-300 px-3"
            />
          </Field>
          <button
            type="submit"
            className="min-h-[44px] rounded-lg bg-red-700 font-medium text-white"
          >
            Create
          </button>
        </form>
      </Drawer>

      <Drawer
        open={editing !== null}
        onClose={() => setDrawer("closed")}
        title={editing?.name ?? ""}
      >
        {editing && editingMembership && (
          <div className="flex flex-col gap-4">
            <Field label="Name">
              <input
                defaultValue={editing.name}
                onBlur={(e) => {
                  if (e.target.value !== editing.name) {
                    updateClub(editing.id, { name: e.target.value });
                  }
                }}
                className="min-h-[44px] rounded-lg border border-slate-300 px-3"
              />
            </Field>
            <Field label="Location">
              <input
                defaultValue={editing.location ?? ""}
                onBlur={(e) => {
                  if (e.target.value !== (editing.location ?? "")) {
                    updateClub(editing.id, { location: e.target.value });
                  }
                }}
                className="min-h-[44px] rounded-lg border border-slate-300 px-3"
              />
            </Field>
            <Field label="Association">
              <select
                value={editing.association_id ?? ""}
                onChange={(e) =>
                  updateClub(editing.id, {
                    association_id: e.target.value
                      ? Number(e.target.value)
                      : null,
                  })
                }
                className="min-h-[44px] rounded-lg border border-slate-300 px-3"
              >
                <option value="">No association</option>
                {associations.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Contact email">
              <input
                defaultValue={editing.contact_email ?? ""}
                onBlur={(e) => {
                  if (e.target.value !== (editing.contact_email ?? "")) {
                    updateClub(editing.id, { contact_email: e.target.value });
                  }
                }}
                className="min-h-[44px] rounded-lg border border-slate-300 px-3"
              />
            </Field>
            <Field label="Contact phone">
              <input
                defaultValue={editing.contact_phone ?? ""}
                onBlur={(e) => {
                  if (e.target.value !== (editing.contact_phone ?? "")) {
                    updateClub(editing.id, { contact_phone: e.target.value });
                  }
                }}
                className="min-h-[44px] rounded-lg border border-slate-300 px-3"
              />
            </Field>

            <MemberEditor
              label="Athletes"
              ids={editingMembership.athleteIds}
              options={allAthletes}
              onAdd={(value) => addMember(editing.id, "athlete", value)}
              onRemove={(id) => removeMember(editing.id, "athlete", id)}
            />
            <MemberEditor
              label="Coaches"
              ids={editingMembership.coachIds}
              options={allCoaches}
              onAdd={(value) => addMember(editing.id, "coach", value)}
              onRemove={(id) => removeMember(editing.id, "coach", id)}
            />

            <DeleteButton
              onClick={() => deleteClub(editing.id)}
              itemLabel={editing.name}
            />
          </div>
        )}
      </Drawer>
    </div>
  );
}

function MemberEditor({
  label,
  ids,
  options,
  onAdd,
  onRemove,
}: {
  label: string;
  ids: number[];
  options: Person[];
  onAdd: (value: string) => void;
  onRemove: (id: number) => void;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const results = options.filter((o) =>
    `${o.first_name} ${o.last_name}`.toLowerCase().includes(q)
  );

  return (
    <div className="flex flex-col gap-2 rounded-lg bg-slate-50 p-2">
      <span className="text-xs font-medium text-slate-600">
        {label} ({ids.length})
      </span>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={`Search ${label.toLowerCase()}...`}
        className="min-h-[44px] rounded-lg border border-slate-300 px-3"
      />
      <div className="flex max-h-48 flex-col gap-1 overflow-y-auto">
        {results.map((o) => {
          const added = ids.includes(o.id);
          return (
            <button
              key={o.id}
              onClick={() =>
                added ? onRemove(o.id) : onAdd(String(o.id))
              }
              className={`flex min-h-[44px] items-center justify-between rounded-lg border px-3 text-left ${
                added
                  ? "border-green-200 bg-green-50 text-green-800"
                  : "border-slate-200"
              }`}
            >
              <span>
                {o.first_name} {o.last_name}
              </span>
              <span className="text-sm">{added ? "✓ Added" : "+ Add"}</span>
            </button>
          );
        })}
        {results.length === 0 && (
          <p className="px-1 py-2 text-sm text-slate-500">No matches.</p>
        )}
      </div>
    </div>
  );
}
