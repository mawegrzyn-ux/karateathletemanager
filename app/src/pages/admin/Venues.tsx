import { useEffect, useState, type FormEvent } from "react";
import { useApi } from "../../hooks/useApi";
import { Spinner, Drawer, AddButton, DeleteButton, Field } from "../../components/ui";

interface Venue {
  id: number;
  club_id: number | null;
  name: string;
  address: string | null;
  notes: string | null;
}

const EMPTY_FORM = { name: "", address: "", notes: "" };

export default function Venues() {
  const api = useApi();
  const [venues, setVenues] = useState<Venue[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [drawer, setDrawer] = useState<"closed" | "create" | Venue>("closed");
  const [form, setForm] = useState(EMPTY_FORM);

  useEffect(() => {
    load();
  }, []);

  function load() {
    api
      .get<{ venues: Venue[] }>("/admin/venues")
      .then((res) => setVenues(res.venues))
      .catch(() => setError("Failed to load venues"));
  }

  function openCreate() {
    setForm(EMPTY_FORM);
    setDrawer("create");
  }

  async function createVenue(e: FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    const { venue } = await api.post<{ venue: Venue }>("/admin/venues", form);
    setVenues((prev) => (prev ? [...prev, venue] : [venue]));
    setDrawer("closed");
  }

  async function updateVenue(id: number, patch: Record<string, unknown>) {
    const { venue } = await api.patch<{ venue: Venue }>(
      `/admin/venues/${id}`,
      patch
    );
    setVenues((prev) => (prev ? prev.map((v) => (v.id === id ? venue : v)) : prev));
    setDrawer((prev) =>
      prev !== "closed" && prev !== "create" && prev.id === id ? venue : prev
    );
  }

  async function deleteVenue(id: number) {
    await api.del(`/admin/venues/${id}`);
    setVenues((prev) => (prev ? prev.filter((v) => v.id !== id) : prev));
    setDrawer("closed");
  }

  if (error) return <div className="p-4 text-red-700">{error}</div>;
  if (!venues)
    return (
      <div className="flex justify-center p-8">
        <Spinner />
      </div>
    );

  const editing = drawer !== "closed" && drawer !== "create" ? drawer : null;
  const filtered = venues.filter((v) =>
    v.name.toLowerCase().includes(query.trim().toLowerCase())
  );

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Venues</h1>
        <AddButton onClick={openCreate} />
      </div>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search venues..."
        className="min-h-[44px] rounded-xl border border-stone-300 px-3"
      />

      <div className="flex flex-col gap-2">
        {filtered.map((v) => (
          <button
            key={v.id}
            onClick={() => setDrawer(v)}
            className="flex min-h-[44px] items-center rounded-2xl bg-white px-4 py-3 text-left font-medium shadow-card"
          >
            {v.name}
          </button>
        ))}
        {filtered.length === 0 && (
          <p className="px-1 py-2 text-sm text-stone-500">No venues yet.</p>
        )}
      </div>

      <Drawer
        open={drawer === "create"}
        onClose={() => setDrawer("closed")}
        title="New venue"
      >
        <form onSubmit={createVenue} className="flex flex-col gap-4">
          <Field label="Name">
            <input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="min-h-[44px] rounded-xl border border-stone-300 px-3"
            />
          </Field>
          <Field label="Address">
            <input
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              className="min-h-[44px] rounded-xl border border-stone-300 px-3"
            />
          </Field>
          <Field label="Notes">
            <input
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
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
        {editing && (
          <div className="flex flex-col gap-4">
            <Field label="Name">
              <input
                defaultValue={editing.name}
                onBlur={(e) => {
                  if (e.target.value !== editing.name) {
                    updateVenue(editing.id, { name: e.target.value });
                  }
                }}
                className="min-h-[44px] rounded-xl border border-stone-300 px-3"
              />
            </Field>
            <Field label="Address">
              <input
                defaultValue={editing.address ?? ""}
                onBlur={(e) => {
                  if (e.target.value !== (editing.address ?? "")) {
                    updateVenue(editing.id, { address: e.target.value });
                  }
                }}
                className="min-h-[44px] rounded-xl border border-stone-300 px-3"
              />
            </Field>
            <Field label="Notes">
              <input
                defaultValue={editing.notes ?? ""}
                onBlur={(e) => {
                  if (e.target.value !== (editing.notes ?? "")) {
                    updateVenue(editing.id, { notes: e.target.value });
                  }
                }}
                className="min-h-[44px] rounded-xl border border-stone-300 px-3"
              />
            </Field>
            <DeleteButton
              onClick={() => deleteVenue(editing.id)}
              itemLabel={editing.name}
            />
          </div>
        )}
      </Drawer>
    </div>
  );
}
