import { useEffect, useState, type FormEvent } from "react";
import { ApiError, useApi } from "../../hooks/useApi";
import { useAuth } from "../../context/AuthContext";
import {
  Spinner,
  Drawer,
  AddButton,
  DeleteButton,
  Field,
  MediaField,
  Toast,
} from "../../components/ui";
import {
  TrainingModuleView,
  itemSummary,
  type TrainingModule,
  type TrainingModuleItem,
  type TrainingModuleItemType as ItemType,
} from "../../components/TrainingModuleView";

const MAX_SETS = 50;
const MAX_REPS = 1000;
const MAX_DURATION_SECONDS = 6 * 60 * 60; // 6 hours

interface DraftItem {
  item_type: ItemType;
  name: string;
  explanation: string;
  video_url: string;
  image_url: string;
  mode: "reps" | "time";
  sets: string;
  reps: string;
  duration_seconds: string;
}

const EMPTY_FORM = { title: "", explanation: "" };

const EMPTY_EXERCISE: DraftItem = {
  item_type: "exercise",
  name: "",
  explanation: "",
  video_url: "",
  image_url: "",
  mode: "reps",
  sets: "",
  reps: "",
  duration_seconds: "",
};

const EMPTY_REST: DraftItem = {
  item_type: "rest",
  name: "",
  explanation: "",
  video_url: "",
  image_url: "",
  mode: "time",
  sets: "",
  reps: "",
  duration_seconds: "",
};

function toDraftItem(item: TrainingModuleItem): DraftItem {
  return {
    item_type: item.item_type,
    name: item.name ?? "",
    explanation: item.explanation ?? "",
    video_url: item.video_url ?? "",
    image_url: item.image_url ?? "",
    mode: item.duration_seconds != null && item.sets == null ? "time" : "reps",
    sets: item.sets != null ? String(item.sets) : "",
    reps: item.reps != null ? String(item.reps) : "",
    duration_seconds:
      item.duration_seconds != null ? String(item.duration_seconds) : "",
  };
}

function toApiItem(it: DraftItem) {
  if (it.item_type === "rest") {
    return {
      item_type: "rest",
      duration_seconds: it.duration_seconds ? Number(it.duration_seconds) : null,
    };
  }
  if (it.mode === "time") {
    return {
      item_type: "exercise",
      name: it.name,
      explanation: it.explanation || null,
      video_url: it.video_url || null,
      image_url: it.image_url || null,
      duration_seconds: it.duration_seconds ? Number(it.duration_seconds) : null,
    };
  }
  return {
    item_type: "exercise",
    name: it.name,
    explanation: it.explanation || null,
    video_url: it.video_url || null,
    image_url: it.image_url || null,
    sets: it.sets ? Number(it.sets) : null,
    reps: it.reps ? Number(it.reps) : null,
  };
}

function ModuleItemsEditor({
  items,
  onChange,
  onError,
}: {
  items: DraftItem[];
  onChange: (items: DraftItem[]) => void;
  onError: (message: string) => void;
}) {
  function updateItem(index: number, patch: Partial<DraftItem>) {
    onChange(items.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  }

  function removeItem(index: number) {
    onChange(items.filter((_, i) => i !== index));
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl bg-stone-50 p-2">
      <span className="text-xs font-medium text-stone-600">
        Exercises &amp; rest ({items.length})
      </span>

      <div className="flex flex-col gap-2">
        {items.map((item, i) => (
          <div
            key={i}
            className="flex flex-col gap-3 rounded-xl border border-stone-200 bg-white p-3"
          >
            <div className="flex items-center gap-2">
              <select
                value={item.item_type}
                onChange={(e) =>
                  updateItem(i, { item_type: e.target.value as ItemType })
                }
                className="min-h-[44px] flex-1 rounded-xl border border-stone-300 px-3"
              >
                <option value="exercise">Exercise</option>
                <option value="rest">Rest</option>
              </select>
              <button
                type="button"
                onClick={() => removeItem(i)}
                aria-label="Remove item"
                className="flex min-h-[44px] min-w-[44px] items-center justify-center text-red-700"
              >
                ✕
              </button>
            </div>

            {item.item_type === "exercise" ? (
              <>
                <Field label="Name">
                  <input
                    required
                    defaultValue={item.name}
                    onBlur={(e) => updateItem(i, { name: e.target.value })}
                    className="min-h-[44px] rounded-xl border border-stone-300 px-3"
                  />
                </Field>
                <Field label="Explanation">
                  <textarea
                    defaultValue={item.explanation}
                    onBlur={(e) =>
                      updateItem(i, { explanation: e.target.value })
                    }
                    className="rounded-xl border border-stone-300 px-3 py-2"
                  />
                </Field>
                <MediaField
                  label="Video"
                  kind="video"
                  value={item.video_url}
                  onChange={(url) => updateItem(i, { video_url: url })}
                  onError={onError}
                />
                <MediaField
                  label="Image"
                  kind="image"
                  value={item.image_url}
                  onChange={(url) => updateItem(i, { image_url: url })}
                  onError={onError}
                />
                <Field label="Measured by">
                  <select
                    value={item.mode}
                    onChange={(e) =>
                      updateItem(i, { mode: e.target.value as "reps" | "time" })
                    }
                    className="min-h-[44px] rounded-xl border border-stone-300 px-3"
                  >
                    <option value="reps">Sets &amp; reps</option>
                    <option value="time">Time</option>
                  </select>
                </Field>
                {item.mode === "reps" ? (
                  <div className="flex gap-2">
                    <Field label="Sets">
                      <input
                        type="number"
                        min={1}
                        max={MAX_SETS}
                        defaultValue={item.sets}
                        onBlur={(e) => updateItem(i, { sets: e.target.value })}
                        className="min-h-[44px] rounded-xl border border-stone-300 px-3"
                      />
                    </Field>
                    <Field label="Reps">
                      <input
                        type="number"
                        min={1}
                        max={MAX_REPS}
                        defaultValue={item.reps}
                        onBlur={(e) => updateItem(i, { reps: e.target.value })}
                        className="min-h-[44px] rounded-xl border border-stone-300 px-3"
                      />
                    </Field>
                  </div>
                ) : (
                  <Field label="Duration (seconds)">
                    <input
                      type="number"
                      min={1}
                      max={MAX_DURATION_SECONDS}
                      defaultValue={item.duration_seconds}
                      onBlur={(e) =>
                        updateItem(i, { duration_seconds: e.target.value })
                      }
                      className="min-h-[44px] rounded-xl border border-stone-300 px-3"
                    />
                  </Field>
                )}
              </>
            ) : (
              <Field label="Duration (seconds)">
                <input
                  type="number"
                  min={1}
                  max={MAX_DURATION_SECONDS}
                  defaultValue={item.duration_seconds}
                  onBlur={(e) =>
                    updateItem(i, { duration_seconds: e.target.value })
                  }
                  className="min-h-[44px] rounded-xl border border-stone-300 px-3"
                />
              </Field>
            )}
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onChange([...items, { ...EMPTY_EXERCISE }])}
          className="min-h-[44px] flex-1 rounded-xl border border-stone-300 font-medium text-stone-700"
        >
          + Add exercise
        </button>
        <button
          type="button"
          onClick={() => onChange([...items, { ...EMPTY_REST }])}
          className="min-h-[44px] flex-1 rounded-xl border border-stone-300 font-medium text-stone-700"
        >
          + Add rest
        </button>
      </div>
    </div>
  );
}

export default function TrainingModules() {
  const api = useApi();
  const { user } = useAuth();
  const canEdit = !!user?.is_admin || user?.role === "coach";
  const [modules, setModules] = useState<TrainingModule[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [drawer, setDrawer] = useState<"closed" | "create" | TrainingModule>(
    "closed"
  );
  const [form, setForm] = useState(EMPTY_FORM);
  const [formItems, setFormItems] = useState<DraftItem[]>([]);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, []);

  function showToast(message: string) {
    setToast(message);
    setTimeout(() => setToast(null), 4000);
  }

  function showError(err: unknown) {
    showToast(err instanceof ApiError ? err.message : "Something went wrong");
  }

  function load() {
    api
      .get<{ modules: TrainingModule[] }>("/training-modules")
      .then((res) => setModules(res.modules))
      .catch(() => setError("Failed to load training modules"));
  }

  function openCreate() {
    setForm(EMPTY_FORM);
    setFormItems([]);
    setDrawer("create");
  }

  async function createModule(e: FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) return;
    try {
      const { module: created } = await api.post<{ module: TrainingModule }>(
        "/training-modules",
        {
          title: form.title,
          explanation: form.explanation,
          items: formItems.map(toApiItem),
        }
      );
      setModules((prev) => (prev ? [...prev, created] : [created]));
      setDrawer("closed");
    } catch (err) {
      showError(err);
    }
  }

  async function updateModule(id: number, patch: Record<string, unknown>) {
    try {
      const { module: updated } = await api.patch<{ module: TrainingModule }>(
        `/training-modules/${id}`,
        patch
      );
      setModules((prev) =>
        prev ? prev.map((m) => (m.id === id ? updated : m)) : prev
      );
      setDrawer((prev) =>
        prev !== "closed" && prev !== "create" && prev.id === id
          ? updated
          : prev
      );
    } catch (err) {
      showError(err);
    }
  }

  async function deleteModule(id: number) {
    try {
      await api.del(`/training-modules/${id}`);
      setModules((prev) => (prev ? prev.filter((m) => m.id !== id) : prev));
      setDrawer("closed");
    } catch (err) {
      showError(err);
    }
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
        <h1 className="text-2xl font-bold tracking-tight">Training modules</h1>
        {canEdit && <AddButton onClick={openCreate} />}
      </div>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search training modules..."
        className="min-h-[44px] rounded-xl border border-stone-300 px-3"
      />

      <div className="flex flex-col gap-2">
        {filtered.map((m) => (
          <button
            key={m.id}
            onClick={() => setDrawer(m)}
            className="flex min-h-[44px] flex-col items-start gap-1 rounded-2xl bg-white px-4 py-3 text-left shadow-card"
          >
            <span className="font-medium">{m.title}</span>
            {m.items.length > 0 && (
              <span className="text-xs text-stone-500">
                {m.items.map(itemSummary).join(", ")}
              </span>
            )}
          </button>
        ))}
        {filtered.length === 0 && (
          <p className="px-1 py-2 text-sm text-stone-500">
            No training modules yet.
          </p>
        )}
      </div>

      {canEdit && (
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
                className="min-h-[44px] rounded-xl border border-stone-300 px-3"
              />
            </Field>
            <Field label="Explanation">
              <textarea
                value={form.explanation}
                onChange={(e) => setForm({ ...form, explanation: e.target.value })}
                className="rounded-xl border border-stone-300 px-3 py-2"
              />
            </Field>
            <ModuleItemsEditor
              items={formItems}
              onChange={setFormItems}
              onError={showToast}
            />
            <button
              type="submit"
              className="min-h-[44px] rounded-full bg-red-600 font-medium text-white"
            >
              Create
            </button>
          </form>
        </Drawer>
      )}

      <Drawer
        open={editing !== null}
        onClose={() => setDrawer("closed")}
        title={editing?.title ?? ""}
      >
        {editing && canEdit && (
          <div className="flex flex-col gap-4">
            <Field label="Title">
              <input
                defaultValue={editing.title}
                onBlur={(e) => {
                  if (e.target.value !== editing.title) {
                    updateModule(editing.id, { title: e.target.value });
                  }
                }}
                className="min-h-[44px] rounded-xl border border-stone-300 px-3"
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
                className="rounded-xl border border-stone-300 px-3 py-2"
              />
            </Field>
            <ModuleItemsEditor
              items={editing.items.map(toDraftItem)}
              onChange={(next) =>
                updateModule(editing.id, { items: next.map(toApiItem) })
              }
              onError={showToast}
            />
            <DeleteButton
              onClick={() => deleteModule(editing.id)}
              itemLabel={editing.title}
            />
          </div>
        )}
        {editing && !canEdit && (
          <div className="flex flex-col gap-4">
            <TrainingModuleView module={editing} />
          </div>
        )}
      </Drawer>

      {toast && <Toast message={toast} />}
    </div>
  );
}
