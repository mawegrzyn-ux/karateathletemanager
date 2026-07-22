import { useEffect, useState, type FormEvent } from "react";
import { useApi } from "../../hooks/useApi";
import { Spinner, Drawer, AddButton, DeleteButton, Field } from "../../components/ui";

interface TrainingModuleType {
  id: number;
  name: string;
}

const EMPTY_FORM = { name: "" };

export default function TrainingModuleTypes() {
  const api = useApi();
  const [types, setTypes] = useState<TrainingModuleType[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [drawer, setDrawer] = useState<"closed" | "create" | TrainingModuleType>(
    "closed"
  );
  const [form, setForm] = useState(EMPTY_FORM);

  useEffect(() => {
    load();
  }, []);

  function load() {
    api
      .get<{ types: TrainingModuleType[] }>("/training-module-types")
      .then((res) => setTypes(res.types))
      .catch(() => setError("Failed to load training types"));
  }

  function openCreate() {
    setForm(EMPTY_FORM);
    setDrawer("create");
  }

  async function createType(e: FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    const { type } = await api.post<{ type: TrainingModuleType }>(
      "/training-module-types",
      form
    );
    setTypes((prev) => (prev ? [...prev, type] : [type]));
    setDrawer("closed");
  }

  async function updateType(id: number, patch: Record<string, unknown>) {
    const { type } = await api.patch<{ type: TrainingModuleType }>(
      `/training-module-types/${id}`,
      patch
    );
    setTypes((prev) =>
      prev ? prev.map((t) => (t.id === id ? type : t)) : prev
    );
    setDrawer((prev) =>
      prev !== "closed" && prev !== "create" && prev.id === id ? type : prev
    );
  }

  async function deleteType(id: number) {
    await api.del(`/training-module-types/${id}`);
    setTypes((prev) => (prev ? prev.filter((t) => t.id !== id) : prev));
    setDrawer("closed");
  }

  if (error) return <div className="p-4 text-red-700">{error}</div>;
  if (!types)
    return (
      <div className="flex justify-center p-8">
        <Spinner />
      </div>
    );

  const editing = drawer !== "closed" && drawer !== "create" ? drawer : null;
  const filtered = types.filter((t) =>
    t.name.toLowerCase().includes(query.trim().toLowerCase())
  );

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Training types</h1>
        <AddButton onClick={openCreate} />
      </div>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search training types..."
        className="min-h-[44px] rounded-xl border border-stone-300 px-3"
      />

      <div className="flex flex-col gap-2">
        {filtered.map((t) => (
          <button
            key={t.id}
            onClick={() => setDrawer(t)}
            className="flex min-h-[44px] items-center rounded-2xl bg-white px-4 py-3 text-left font-medium shadow-card"
          >
            {t.name}
          </button>
        ))}
        {filtered.length === 0 && (
          <p className="px-1 py-2 text-sm text-stone-500">No training types yet.</p>
        )}
      </div>

      <Drawer
        open={drawer === "create"}
        onClose={() => setDrawer("closed")}
        title="New training type"
      >
        <form onSubmit={createType} className="flex flex-col gap-4">
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
                    updateType(editing.id, { name: e.target.value });
                  }
                }}
                className="min-h-[44px] rounded-xl border border-stone-300 px-3"
              />
            </Field>
            <DeleteButton
              onClick={() => deleteType(editing.id)}
              itemLabel={editing.name}
            />
          </div>
        )}
      </Drawer>
    </div>
  );
}
