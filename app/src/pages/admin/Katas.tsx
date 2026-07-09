import { useEffect, useState, type FormEvent } from "react";
import { useApi } from "../../hooks/useApi";
import { Spinner, Drawer, AddButton, DeleteButton, Field } from "../../components/ui";

interface Kata {
  id: number;
  name: string;
  style: string | null;
}

const EMPTY_FORM = { name: "", style: "" };

export default function Katas() {
  const api = useApi();
  const [katas, setKatas] = useState<Kata[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [drawer, setDrawer] = useState<"closed" | "create" | Kata>("closed");
  const [form, setForm] = useState(EMPTY_FORM);

  useEffect(() => {
    load();
  }, []);

  function load() {
    api
      .get<{ katas: Kata[] }>("/katas")
      .then((res) => setKatas(res.katas))
      .catch(() => setError("Failed to load katas"));
  }

  function openCreate() {
    setForm(EMPTY_FORM);
    setDrawer("create");
  }

  async function createKata(e: FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    const { kata } = await api.post<{ kata: Kata }>("/katas", form);
    setKatas((prev) => (prev ? [...prev, kata] : [kata]));
    setDrawer("closed");
  }

  async function updateKata(id: number, patch: Record<string, unknown>) {
    const { kata } = await api.patch<{ kata: Kata }>(`/katas/${id}`, patch);
    setKatas((prev) => (prev ? prev.map((k) => (k.id === id ? kata : k)) : prev));
    setDrawer((prev) =>
      prev !== "closed" && prev !== "create" && prev.id === id ? kata : prev
    );
  }

  async function deleteKata(id: number) {
    await api.del(`/katas/${id}`);
    setKatas((prev) => (prev ? prev.filter((k) => k.id !== id) : prev));
    setDrawer("closed");
  }

  if (error) return <div className="p-4 text-red-700">{error}</div>;
  if (!katas)
    return (
      <div className="flex justify-center p-8">
        <Spinner />
      </div>
    );

  const editing = drawer !== "closed" && drawer !== "create" ? drawer : null;
  const filtered = katas.filter((k) =>
    k.name.toLowerCase().includes(query.trim().toLowerCase())
  );

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Katas</h1>
        <AddButton onClick={openCreate} />
      </div>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search katas..."
        className="min-h-[44px] rounded-lg border border-slate-300 px-3"
      />

      <div className="flex flex-col gap-2">
        {filtered.map((k) => (
          <button
            key={k.id}
            onClick={() => setDrawer(k)}
            className="min-h-[44px] rounded-lg border border-slate-200 px-3 py-2 text-left font-medium"
          >
            {k.name}
          </button>
        ))}
        {filtered.length === 0 && (
          <p className="px-1 py-2 text-sm text-slate-500">No katas yet.</p>
        )}
      </div>

      <Drawer
        open={drawer === "create"}
        onClose={() => setDrawer("closed")}
        title="New kata"
      >
        <form onSubmit={createKata} className="flex flex-col gap-4">
          <Field label="Name">
            <input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="min-h-[44px] rounded-lg border border-slate-300 px-3"
            />
          </Field>
          <Field label="Style">
            <input
              value={form.style}
              onChange={(e) => setForm({ ...form, style: e.target.value })}
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
        {editing && (
          <div className="flex flex-col gap-4">
            <Field label="Name">
              <input
                defaultValue={editing.name}
                onBlur={(e) => {
                  if (e.target.value !== editing.name) {
                    updateKata(editing.id, { name: e.target.value });
                  }
                }}
                className="min-h-[44px] rounded-lg border border-slate-300 px-3"
              />
            </Field>
            <Field label="Style">
              <input
                defaultValue={editing.style ?? ""}
                onBlur={(e) => {
                  if (e.target.value !== (editing.style ?? "")) {
                    updateKata(editing.id, { style: e.target.value });
                  }
                }}
                className="min-h-[44px] rounded-lg border border-slate-300 px-3"
              />
            </Field>
            <DeleteButton
              onClick={() => deleteKata(editing.id)}
              itemLabel={editing.name}
            />
          </div>
        )}
      </Drawer>
    </div>
  );
}
