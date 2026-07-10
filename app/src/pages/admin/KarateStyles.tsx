import { useEffect, useState, type FormEvent } from "react";
import { useApi } from "../../hooks/useApi";
import { Spinner, Drawer, AddButton, DeleteButton, Field } from "../../components/ui";

interface KarateStyle {
  id: number;
  name: string;
}

const EMPTY_FORM = { name: "" };

export default function KarateStyles() {
  const api = useApi();
  const [styles, setStyles] = useState<KarateStyle[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [drawer, setDrawer] = useState<"closed" | "create" | KarateStyle>(
    "closed"
  );
  const [form, setForm] = useState(EMPTY_FORM);

  useEffect(() => {
    load();
  }, []);

  function load() {
    api
      .get<{ styles: KarateStyle[] }>("/karate-styles")
      .then((res) => setStyles(res.styles))
      .catch(() => setError("Failed to load karate styles"));
  }

  function openCreate() {
    setForm(EMPTY_FORM);
    setDrawer("create");
  }

  async function createStyle(e: FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    const { style } = await api.post<{ style: KarateStyle }>(
      "/karate-styles",
      form
    );
    setStyles((prev) => (prev ? [...prev, style] : [style]));
    setDrawer("closed");
  }

  async function updateStyle(id: number, patch: Record<string, unknown>) {
    const { style } = await api.patch<{ style: KarateStyle }>(
      `/karate-styles/${id}`,
      patch
    );
    setStyles((prev) =>
      prev ? prev.map((s) => (s.id === id ? style : s)) : prev
    );
    setDrawer((prev) =>
      prev !== "closed" && prev !== "create" && prev.id === id ? style : prev
    );
  }

  async function deleteStyle(id: number) {
    await api.del(`/karate-styles/${id}`);
    setStyles((prev) => (prev ? prev.filter((s) => s.id !== id) : prev));
    setDrawer("closed");
  }

  if (error) return <div className="p-4 text-red-700">{error}</div>;
  if (!styles)
    return (
      <div className="flex justify-center p-8">
        <Spinner />
      </div>
    );

  const editing = drawer !== "closed" && drawer !== "create" ? drawer : null;
  const filtered = styles.filter((s) =>
    s.name.toLowerCase().includes(query.trim().toLowerCase())
  );

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Karate styles</h1>
        <AddButton onClick={openCreate} />
      </div>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search styles..."
        className="min-h-[44px] rounded-xl border border-stone-300 px-3"
      />

      <div className="flex flex-col gap-2">
        {filtered.map((s) => (
          <button
            key={s.id}
            onClick={() => setDrawer(s)}
            className="flex min-h-[44px] items-center rounded-2xl bg-white px-4 py-3 text-left font-medium shadow-card"
          >
            {s.name}
          </button>
        ))}
        {filtered.length === 0 && (
          <p className="px-1 py-2 text-sm text-stone-500">No styles yet.</p>
        )}
      </div>

      <Drawer
        open={drawer === "create"}
        onClose={() => setDrawer("closed")}
        title="New style"
      >
        <form onSubmit={createStyle} className="flex flex-col gap-4">
          <Field label="Name">
            <input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
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
                    updateStyle(editing.id, { name: e.target.value });
                  }
                }}
                className="min-h-[44px] rounded-xl border border-stone-300 px-3"
              />
            </Field>
            <DeleteButton
              onClick={() => deleteStyle(editing.id)}
              itemLabel={editing.name}
            />
          </div>
        )}
      </Drawer>
    </div>
  );
}
