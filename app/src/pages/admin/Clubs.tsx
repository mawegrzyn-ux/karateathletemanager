import { useEffect, useState, type FormEvent } from "react";
import { useApi } from "../../hooks/useApi";
import { useAuth } from "../../context/AuthContext";
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
  coachAdminIds: number[];
}

interface PendingMember {
  id: number;
  email: string;
  first_name: string | null;
  last_name: string | null;
  wants_athlete: boolean;
  wants_coach: boolean;
}

interface KarateStyle {
  id: number;
  name: string;
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
  const { user } = useAuth();
  const isAdmin = !!user?.is_admin;
  const [clubs, setClubs] = useState<Club[] | null>(null);
  const [associations, setAssociations] = useState<Association[]>([]);
  const [allAthletes, setAllAthletes] = useState<Person[]>([]);
  const [allCoaches, setAllCoaches] = useState<Person[]>([]);
  const [styles, setStyles] = useState<KarateStyle[]>([]);
  const [clubStyleIds, setClubStyleIds] = useState<Record<number, number[]>>(
    {}
  );
  const [memberships, setMemberships] = useState<Record<number, Membership>>(
    {}
  );
  const [error, setError] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<"closed" | "create" | Club>("closed");
  const [form, setForm] = useState(EMPTY_FORM);
  const [query, setQuery] = useState("");

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load() {
    try {
      const [clubsRes, associationsRes, athletesRes, coachesRes, stylesRes] =
        await Promise.all([
          api.get<{ clubs: Club[] }>("/admin/clubs"),
          api.get<{ associations: Association[] }>("/admin/associations"),
          api.get<{ athletes: Person[] }>("/athletes"),
          api.get<{ coaches: Person[] }>("/admin/coaches"),
          api.get<{ styles: KarateStyle[] }>("/karate-styles"),
        ]);
      setClubs(clubsRes.clubs);
      setAssociations(associationsRes.associations);
      setAllAthletes(athletesRes.athletes);
      setAllCoaches(coachesRes.coaches);
      setStyles(stylesRes.styles);

      const entries = await Promise.all(
        clubsRes.clubs.map(async (c) => {
          const [athletes, coaches] = await Promise.all([
            api.get<{ athleteIds: number[] }>(`/admin/clubs/${c.id}/athletes`),
            api.get<{ coaches: { id: number; is_admin: boolean }[] }>(
              `/admin/clubs/${c.id}/coaches`
            ),
          ]);
          return [
            c.id,
            {
              athleteIds: athletes.athleteIds,
              coachIds: coaches.coaches.map((co) => co.id),
              coachAdminIds: coaches.coaches
                .filter((co) => co.is_admin)
                .map((co) => co.id),
            },
          ] as const;
        })
      );
      setMemberships(Object.fromEntries(entries));

      const styleEntries = await Promise.all(
        clubsRes.clubs.map(async (c) => {
          const res = await api.get<{ styleIds: number[] }>(
            `/admin/clubs/${c.id}/styles`
          );
          return [c.id, res.styleIds] as const;
        })
      );
      setClubStyleIds(Object.fromEntries(styleEntries));
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
      [club.id]: { athleteIds: [], coachIds: [], coachAdminIds: [] },
    }));
    setClubStyleIds((prev) => ({ ...prev, [club.id]: [] }));
    setDrawer("closed");
  }

  async function addClubStyle(clubId: number, styleId: number) {
    const current = clubStyleIds[clubId] ?? [];
    if (current.includes(styleId)) return;
    const next = [...current, styleId];
    await api.put(`/admin/clubs/${clubId}/styles`, { styleIds: next });
    setClubStyleIds((prev) => ({ ...prev, [clubId]: next }));
  }

  async function removeClubStyle(clubId: number, styleId: number) {
    const current = clubStyleIds[clubId] ?? [];
    const next = current.filter((id) => id !== styleId);
    await api.put(`/admin/clubs/${clubId}/styles`, { styleIds: next });
    setClubStyleIds((prev) => ({ ...prev, [clubId]: next }));
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
    const current = memberships[clubId] ?? { athleteIds: [], coachIds: [], coachAdminIds: [] };
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
    const current = memberships[clubId] ?? { athleteIds: [], coachIds: [], coachAdminIds: [] };
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

  async function toggleCoachAdmin(
    clubId: number,
    coachId: number,
    nextIsAdmin: boolean
  ) {
    await api.patch(`/admin/clubs/${clubId}/coaches/${coachId}`, {
      is_admin: nextIsAdmin,
    });
    setMemberships((prev) => {
      const current = prev[clubId] ?? {
        athleteIds: [],
        coachIds: [],
        coachAdminIds: [],
      };
      const coachAdminIds = nextIsAdmin
        ? [...current.coachAdminIds, coachId]
        : current.coachAdminIds.filter((id) => id !== coachId);
      return { ...prev, [clubId]: { ...current, coachAdminIds } };
    });
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
    ? memberships[editing.id] ?? { athleteIds: [], coachIds: [], coachAdminIds: [] }
    : null;
  const canSeePending =
    editingMembership !== null &&
    (isAdmin ||
      (user?.coach_id != null &&
        editingMembership.coachAdminIds.includes(user.coach_id)));

  const filteredClubs = clubs.filter((c) =>
    c.name.toLowerCase().includes(query.trim().toLowerCase())
  );

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Clubs</h1>
        {isAdmin && <AddButton onClick={openCreate} />}
      </div>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search clubs..."
        className="min-h-[44px] rounded-xl border border-stone-300 px-3"
      />

      <div className="flex flex-col gap-2">
        {filteredClubs.map((c) => (
          <button
            key={c.id}
            onClick={() => setDrawer(c)}
            className="flex min-h-[44px] items-center rounded-2xl bg-white px-4 py-3 text-left font-medium shadow-card"
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
              className="min-h-[44px] rounded-xl border border-stone-300 px-3"
            />
          </Field>
          <Field label="Location">
            <input
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
              className="min-h-[44px] rounded-xl border border-stone-300 px-3"
            />
          </Field>
          <AssociationPicker
            selectedId={form.association_id ? Number(form.association_id) : null}
            options={associations}
            onSelect={(id) =>
              setForm({ ...form, association_id: id ? String(id) : "" })
            }
          />
          <Field label="Contact email">
            <input
              type="email"
              value={form.contact_email}
              onChange={(e) =>
                setForm({ ...form, contact_email: e.target.value })
              }
              className="min-h-[44px] rounded-xl border border-stone-300 px-3"
            />
          </Field>
          <Field label="Contact phone">
            <input
              value={form.contact_phone}
              onChange={(e) =>
                setForm({ ...form, contact_phone: e.target.value })
              }
              className="min-h-[44px] rounded-xl border border-stone-300 px-3"
            />
          </Field>
          <button
            type="submit"
            className="min-h-[44px] rounded-full bg-red-600 font-medium text-white"
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
                className="min-h-[44px] rounded-xl border border-stone-300 px-3"
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
                className="min-h-[44px] rounded-xl border border-stone-300 px-3"
              />
            </Field>
            <AssociationPicker
              selectedId={editing.association_id}
              options={associations}
              onSelect={(id) =>
                updateClub(editing.id, { association_id: id })
              }
            />
            <Field label="Contact email">
              <input
                defaultValue={editing.contact_email ?? ""}
                onBlur={(e) => {
                  if (e.target.value !== (editing.contact_email ?? "")) {
                    updateClub(editing.id, { contact_email: e.target.value });
                  }
                }}
                className="min-h-[44px] rounded-xl border border-stone-300 px-3"
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
                className="min-h-[44px] rounded-xl border border-stone-300 px-3"
              />
            </Field>

            <StylePicker
              ids={clubStyleIds[editing.id] ?? []}
              options={styles}
              onAdd={(id) => addClubStyle(editing.id, id)}
              onRemove={(id) => removeClubStyle(editing.id, id)}
            />

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
              adminIds={editingMembership.coachAdminIds}
              onToggleAdmin={
                isAdmin
                  ? (id, nextIsAdmin) =>
                      toggleCoachAdmin(editing.id, id, nextIsAdmin)
                  : undefined
              }
            />

            {canSeePending && <PendingMembers clubId={editing.id} />}

            {isAdmin && (
              <DeleteButton
                onClick={() => deleteClub(editing.id)}
                itemLabel={editing.name}
              />
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
}

function PendingMembers({ clubId }: { clubId: number }) {
  const api = useApi();
  const [pending, setPending] = useState<PendingMember[] | null>(null);

  useEffect(() => {
    setPending(null);
    api
      .get<{ pendingMembers: PendingMember[] }>(
        `/admin/clubs/${clubId}/pending-members`
      )
      .then((res) => setPending(res.pendingMembers))
      .catch(() => setPending([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clubId]);

  async function approve(userId: number) {
    await api.post(
      `/admin/clubs/${clubId}/pending-members/${userId}/approve`,
      {}
    );
    setPending((prev) => (prev ? prev.filter((p) => p.id !== userId) : prev));
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl bg-stone-50 p-2">
      <span className="text-xs font-medium text-stone-600">
        Pending members{pending ? ` (${pending.length})` : ""}
      </span>
      {pending === null ? (
        <Spinner />
      ) : (
        <div className="flex flex-col gap-1">
          {pending.map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between gap-2 rounded-xl border border-stone-200 px-3 py-2"
            >
              <div className="flex flex-col">
                <span className="font-medium">
                  {p.first_name || p.last_name
                    ? `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim()
                    : p.email}
                </span>
                <span className="text-xs text-stone-500">
                  {[p.wants_athlete && "athlete", p.wants_coach && "coach"]
                    .filter(Boolean)
                    .join(", ")}
                </span>
              </div>
              <button
                type="button"
                onClick={() => approve(p.id)}
                className="min-h-[44px] rounded-full bg-red-600 px-3 text-sm font-medium text-white"
              >
                Approve
              </button>
            </div>
          ))}
          {pending.length === 0 && (
            <p className="px-1 py-2 text-sm text-stone-500">
              No pending requests.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function AssociationPicker({
  selectedId,
  options,
  onSelect,
}: {
  selectedId: number | null;
  options: Association[];
  onSelect: (id: number | null) => void;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const results = options.filter((o) => o.name.toLowerCase().includes(q));

  return (
    <div className="flex flex-col gap-2 rounded-xl bg-stone-50 p-2">
      <span className="text-xs font-medium text-stone-600">Association</span>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search associations..."
        className="min-h-[44px] rounded-xl border border-stone-300 px-3"
      />
      <div className="flex max-h-48 flex-col gap-1 overflow-y-auto">
        {results.map((o) => {
          const selected = selectedId === o.id;
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => onSelect(selected ? null : o.id)}
              className={`flex min-h-[44px] items-center justify-between rounded-xl border px-3 text-left ${
                selected
                  ? "border-green-200 bg-green-50 text-green-800"
                  : "border-stone-200"
              }`}
            >
              <span>{o.name}</span>
              <span className="text-sm">
                {selected ? "✓ Selected" : "Select"}
              </span>
            </button>
          );
        })}
        {results.length === 0 && (
          <p className="px-1 py-2 text-sm text-stone-500">No matches.</p>
        )}
      </div>
    </div>
  );
}

function MemberEditor({
  label,
  ids,
  options,
  onAdd,
  onRemove,
  adminIds,
  onToggleAdmin,
}: {
  label: string;
  ids: number[];
  options: Person[];
  onAdd: (value: string) => void;
  onRemove: (id: number) => void;
  adminIds?: number[];
  onToggleAdmin?: (id: number, nextIsAdmin: boolean) => void;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const results = options.filter((o) =>
    `${o.first_name} ${o.last_name}`.toLowerCase().includes(q)
  );

  return (
    <div className="flex flex-col gap-2 rounded-xl bg-stone-50 p-2">
      <span className="text-xs font-medium text-stone-600">
        {label} ({ids.length})
      </span>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={`Search ${label.toLowerCase()}...`}
        className="min-h-[44px] rounded-xl border border-stone-300 px-3"
      />
      <div className="flex max-h-48 flex-col gap-1 overflow-y-auto">
        {results.map((o) => {
          const added = ids.includes(o.id);
          const isRowAdmin = adminIds?.includes(o.id) ?? false;
          return (
            <div
              key={o.id}
              className={`flex items-center gap-1 rounded-xl border px-3 ${
                added
                  ? "border-green-200 bg-green-50 text-green-800"
                  : "border-stone-200"
              }`}
            >
              <button
                type="button"
                onClick={() => (added ? onRemove(o.id) : onAdd(String(o.id)))}
                className="flex min-h-[44px] flex-1 items-center justify-between text-left"
              >
                <span>
                  {o.first_name} {o.last_name}
                </span>
                <span className="text-sm">{added ? "✓ Added" : "+ Add"}</span>
              </button>
              {added && onToggleAdmin && (
                <button
                  type="button"
                  onClick={() => onToggleAdmin(o.id, !isRowAdmin)}
                  title={isRowAdmin ? "Remove admin" : "Make admin"}
                  className={`flex min-h-[44px] min-w-[44px] items-center justify-center text-lg ${
                    isRowAdmin ? "text-amber-500" : "text-stone-300"
                  }`}
                >
                  {isRowAdmin ? "★" : "☆"}
                </button>
              )}
            </div>
          );
        })}
        {results.length === 0 && (
          <p className="px-1 py-2 text-sm text-stone-500">No matches.</p>
        )}
      </div>
    </div>
  );
}

function StylePicker({
  ids,
  options,
  onAdd,
  onRemove,
}: {
  ids: number[];
  options: KarateStyle[];
  onAdd: (id: number) => void;
  onRemove: (id: number) => void;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const results = options.filter((o) => o.name.toLowerCase().includes(q));

  return (
    <div className="flex flex-col gap-2 rounded-xl bg-stone-50 p-2">
      <span className="text-xs font-medium text-stone-600">
        Styles ({ids.length})
      </span>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search styles..."
        className="min-h-[44px] rounded-xl border border-stone-300 px-3"
      />
      <div className="flex max-h-48 flex-col gap-1 overflow-y-auto">
        {results.map((o) => {
          const added = ids.includes(o.id);
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => (added ? onRemove(o.id) : onAdd(o.id))}
              className={`flex min-h-[44px] items-center justify-between rounded-xl border px-3 text-left ${
                added
                  ? "border-green-200 bg-green-50 text-green-800"
                  : "border-stone-200"
              }`}
            >
              <span>{o.name}</span>
              <span className="text-sm">{added ? "✓ Added" : "+ Add"}</span>
            </button>
          );
        })}
        {results.length === 0 && (
          <p className="px-1 py-2 text-sm text-stone-500">No matches.</p>
        )}
      </div>
    </div>
  );
}
