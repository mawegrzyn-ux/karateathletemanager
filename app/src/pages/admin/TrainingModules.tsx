import { useEffect, useState, type FormEvent } from "react";
import { useApi } from "../../hooks/useApi";
import { Spinner, Drawer, AddButton, DeleteButton, Field } from "../../components/ui";

interface TrainingSet {
  id: number;
  position: number;
  reps: number;
}

interface TrainingModule {
  id: number;
  title: string;
  explanation: string | null;
  video_url: string | null;
  duration_seconds: number | null;
  sets: TrainingSet[];
}

const EMPTY_FORM = {
  title: "",
  explanation: "",
  video_url: "",
  duration_minutes: "",
};

function SetsEditor({
  sets,
  onChange,
}: {
  sets: number[];
  onChange: (sets: number[]) => void;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-lg bg-slate-50 p-2">
      <span className="text-xs font-medium text-slate-600">Sets (reps)</span>
      <div className="flex flex-col gap-2">
        {sets.map((reps, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="w-14 text-sm text-slate-500">Set {i + 1}</span>
            <input
              type="number"
              min={1}
              value={reps}
              onChange={(e) => {
                const next = [...sets];
                next[i] = Number(e.target.value) || 1;
                onChange(next);
              }}
              className="min-h-[44px] w-24 rounded-lg border border-slate-300 px-3"
            />
            <span className="text-sm text-slate-500">reps</span>
            <button
              type="button"
              onClick={() => onChange(sets.filter((_, idx) => idx !== i))}
              className="ml-auto min-h-[44px] px-2 text-red-700"
              aria-label={`Remove set ${i + 1}`}
            >
              ✕
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => onChange([...sets, 10])}
        className="min-h-[44px] rounded-lg border border-slate-300 font-medium text-slate-700"
      >
        + Add set
      </button>
    </div>
  );
}

export default function TrainingModules() {
  const api = useApi();
  const [modules, setModules] = useState<TrainingModule[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [drawer, setDrawer] = useState<"closed" | "create" | TrainingModule>(
    "closed"
  );
  const [form, setForm] = useState(EMPTY_FORM);
  const [formSets, setFormSets] = useState<number[]>([]);

  useEffect(() => {
    load();
  }, []);

  function load() {
    api
      .get<{ modules: TrainingModule[] }>("/training-modules")
      .then((res) => setModules(res.modules))
      .catch(() => setError("Failed to load training modules"));
  }

  function openCreate() {
    setForm(EMPTY_FORM);
    setFormSets([]);
    setDrawer("create");
  }

  async function createModule(e: FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) return;
    const { module: created } = await api.post<{ module: TrainingModule }>(
      "/training-modules",
      {
        title: form.title,
        explanation: form.explanation,
        video_url: form.video_url,
        duration_seconds: form.duration_minutes
          ? Number(form.duration_minutes) * 60
          : null,
        sets: formSets.map((reps) => ({ reps })),
      }
    );
    setModules((prev) => (prev ? [...prev, created] : [created]));
    setDrawer("closed");
  }

  async function updateModule(id: number, patch: Record<string, unknown>) {
    const { module: updated } = await api.patch<{ module: TrainingModule }>(
      `/training-modules/${id}`,
      patch
    );
    setModules((prev) =>
      prev ? prev.map((m) => (m.id === id ? updated : m)) : prev
    );
    setDrawer((prev) =>
      prev !== "closed" && prev !== "create" && prev.id === id ? updated : prev
    );
  }

  async function deleteModule(id: number) {
    await api.del(`/training-modules/${id}`);
    setModules((prev) => (prev ? prev.filter((m) => m.id !== id) : prev));
    setDrawer("closed");
  }

  if (error) return <div className="p-4 text-red-700">{error}</div>;
  if (!modules)
    return (
      <div className="flex justify-center p-8">
        <Spinner />
      </div>
    );

  const editing = drawer !== "closed" && drawer !== "create" ? drawer : null;
  const filtered = modules.filter((m) =>
    m.title.toLowerCase().includes(query.trim().toLowerCase())
  );

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Training modules</h1>
        <AddButton onClick={openCreate} />
      </div>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search training modules..."
        className="min-h-[44px] rounded-lg border border-slate-300 px-3"
      />

      <div className="flex flex-col gap-2">
        {filtered.map((m) => (
          <button
            key={m.id}
            onClick={() => setDrawer(m)}
            className="min-h-[44px] rounded-lg border border-slate-200 px-3 py-2 text-left font-medium"
          >
            {m.title}
          </button>
        ))}
        {filtered.length === 0 && (
          <p className="px-1 py-2 text-sm text-slate-500">
            No training modules yet.
          </p>
        )}
      </div>

      <Drawer
        open={drawer === "create"}
        onClose={() => setDrawer("closed")}
        title="New training module"
      >
        <form onSubmit={createModule} className="flex flex-col gap-4">
          <Field label="Title">
            <input
              required
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="min-h-[44px] rounded-lg border border-slate-300 px-3"
            />
          </Field>
          <Field label="Explanation">
            <textarea
              value={form.explanation}
              onChange={(e) => setForm({ ...form, explanation: e.target.value })}
              className="rounded-lg border border-slate-300 px-3 py-2"
            />
          </Field>
          <Field label="Video link">
            <input
              value={form.video_url}
              onChange={(e) => setForm({ ...form, video_url: e.target.value })}
              className="min-h-[44px] rounded-lg border border-slate-300 px-3"
            />
          </Field>
          <Field label="Duration (minutes)">
            <input
              type="number"
              min={0}
              value={form.duration_minutes}
              onChange={(e) =>
                setForm({ ...form, duration_minutes: e.target.value })
              }
              className="min-h-[44px] rounded-lg border border-slate-300 px-3"
            />
          </Field>
          <SetsEditor sets={formSets} onChange={setFormSets} />
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
        title={editing?.title ?? ""}
      >
        {editing && (
          <div className="flex flex-col gap-4">
            <Field label="Title">
              <input
                defaultValue={editing.title}
                onBlur={(e) => {
                  if (e.target.value !== editing.title) {
                    updateModule(editing.id, { title: e.target.value });
                  }
                }}
                className="min-h-[44px] rounded-lg border border-slate-300 px-3"
              />
            </Field>
            <Field label="Explanation">
              <textarea
                defaultValue={editing.explanation ?? ""}
                onBlur={(e) => {
                  if (e.target.value !== (editing.explanation ?? "")) {
                    updateModule(editing.id, { explanation: e.target.value });
                  }
                }}
                className="rounded-lg border border-slate-300 px-3 py-2"
              />
            </Field>
            <Field label="Video link">
              <input
                defaultValue={editing.video_url ?? ""}
                onBlur={(e) => {
                  if (e.target.value !== (editing.video_url ?? "")) {
                    updateModule(editing.id, { video_url: e.target.value });
                  }
                }}
                className="min-h-[44px] rounded-lg border border-slate-300 px-3"
              />
            </Field>
            <Field label="Duration (minutes)">
              <input
                type="number"
                min={0}
                defaultValue={
                  editing.duration_seconds
                    ? Math.round(editing.duration_seconds / 60)
                    : ""
                }
                onBlur={(e) =>
                  updateModule(editing.id, {
                    duration_seconds: e.target.value
                      ? Number(e.target.value) * 60
                      : null,
                  })
                }
                className="min-h-[44px] rounded-lg border border-slate-300 px-3"
              />
            </Field>
            <SetsEditor
              sets={editing.sets.map((s) => s.reps)}
              onChange={(reps) =>
                updateModule(editing.id, { sets: reps.map((r) => ({ reps: r })) })
              }
            />
            <DeleteButton
              onClick={() => deleteModule(editing.id)}
              itemLabel={editing.title}
            />
          </div>
        )}
      </Drawer>
    </div>
  );
}
