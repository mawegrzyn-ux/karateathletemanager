import { useEffect, useState } from "react";
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
  Badge,
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

interface TrainingModuleType {
  id: number;
  name: string;
}

function TypeSelect({
  types,
  value,
  onChange,
}: {
  types: TrainingModuleType[];
  value: number | null;
  onChange: (id: number | null) => void;
}) {
  return (
    <Field label="Type">
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
        className="min-h-[44px] rounded-xl border border-stone-300 px-3"
      >
        <option value="">No type</option>
        {types.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
    </Field>
  );
}

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

const EMPTY_FORM = { title: "", explanation: "", type_id: null as number | null };

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

// The type-select + type-dependent fields for a single item - shared by
// ModuleItemsEditor (all items open at once, editing an existing module)
// and CreateModuleWizard (one item per step, building a new module).
function ItemFields({
  item,
  onChange,
  onError,
}: {
  item: DraftItem;
  onChange: (patch: Partial<DraftItem>) => void;
  onError: (message: string) => void;
}) {
  return (
    <>
      <Field label="Type">
        <select
          value={item.item_type}
          onChange={(e) => onChange({ item_type: e.target.value as ItemType })}
          className="min-h-[44px] rounded-xl border border-stone-300 px-3"
        >
          <option value="exercise">Exercise</option>
          <option value="rest">Rest</option>
        </select>
      </Field>

      {item.item_type === "exercise" ? (
        <>
          <Field label="Name">
            <input
              required
              defaultValue={item.name}
              onBlur={(e) => onChange({ name: e.target.value })}
              className="min-h-[44px] rounded-xl border border-stone-300 px-3"
            />
          </Field>
          <Field label="Explanation">
            <textarea
              defaultValue={item.explanation}
              onBlur={(e) => onChange({ explanation: e.target.value })}
              className="rounded-xl border border-stone-300 px-3 py-2"
            />
          </Field>
          <MediaField
            label="Video"
            kind="video"
            value={item.video_url}
            onChange={(url) => onChange({ video_url: url })}
            onError={onError}
          />
          <MediaField
            label="Image"
            kind="image"
            value={item.image_url}
            onChange={(url) => onChange({ image_url: url })}
            onError={onError}
          />
          <Field label="Measured by">
            <select
              value={item.mode}
              onChange={(e) => onChange({ mode: e.target.value as "reps" | "time" })}
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
                  onBlur={(e) => onChange({ sets: e.target.value })}
                  className="min-h-[44px] rounded-xl border border-stone-300 px-3"
                />
              </Field>
              <Field label="Reps">
                <input
                  type="number"
                  min={1}
                  max={MAX_REPS}
                  defaultValue={item.reps}
                  onBlur={(e) => onChange({ reps: e.target.value })}
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
                onBlur={(e) => onChange({ duration_seconds: e.target.value })}
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
            onBlur={(e) => onChange({ duration_seconds: e.target.value })}
            className="min-h-[44px] rounded-xl border border-stone-300 px-3"
          />
        </Field>
      )}
    </>
  );
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
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-stone-500">
                Step {i + 1}
              </span>
              <button
                type="button"
                onClick={() => removeItem(i)}
                aria-label="Remove item"
                className="flex min-h-[44px] min-w-[44px] items-center justify-center text-red-700"
              >
                ✕
              </button>
            </div>
            <ItemFields
              item={item}
              onChange={(patch) => updateItem(i, patch)}
              onError={onError}
            />
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

// Building a new module is a step-by-step wizard rather than one long
// scrolling form: step 0 is the module's own title/explanation, then one
// step per exercise/rest item, added one at a time via "Next step" until
// the coach taps "Finish" to submit everything gathered so far. Mounted
// only while the create drawer is open (see TrainingModules below), so
// each open gets fresh internal state for free.
function CreateModuleWizard({
  types,
  onCreated,
  onToast,
}: {
  types: TrainingModuleType[];
  onCreated: (m: TrainingModule) => void;
  onToast: (message: string) => void;
}) {
  const api = useApi();
  const [step, setStep] = useState(0); // 0 = general info, N = items[N - 1]
  const [form, setForm] = useState(EMPTY_FORM);
  const [items, setItems] = useState<DraftItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [stepError, setStepError] = useState<string | null>(null);

  const currentItem = step > 0 ? items[step - 1] : null;

  function updateCurrentItem(patch: Partial<DraftItem>) {
    setItems((prev) =>
      prev.map((it, i) => (i === step - 1 ? { ...it, ...patch } : it))
    );
  }

  function currentItemValid() {
    if (!currentItem) return true;
    return currentItem.item_type === "rest" || currentItem.name.trim() !== "";
  }

  function goNextFromGeneralInfo() {
    if (!form.title.trim()) {
      setStepError("Title is required");
      return;
    }
    setStepError(null);
    if (items.length === 0) {
      setItems([{ ...EMPTY_EXERCISE }]);
    }
    setStep(1);
  }

  function addStep() {
    if (!currentItemValid()) {
      setStepError("Name is required");
      return;
    }
    setStepError(null);
    setItems((prev) => [...prev, { ...EMPTY_EXERCISE }]);
    setStep((s) => s + 1);
  }

  function removeCurrentStep() {
    setItems((prev) => prev.filter((_, i) => i !== step - 1));
    setStep((s) => Math.max(0, s - 1));
    setStepError(null);
  }

  async function finish() {
    if (!currentItemValid()) {
      setStepError("Name is required");
      return;
    }
    setStepError(null);
    setSubmitting(true);
    try {
      const { module: created } = await api.post<{ module: TrainingModule }>(
        "/training-modules",
        {
          title: form.title,
          explanation: form.explanation,
          type_id: form.type_id,
          items: items.map(toApiItem),
        }
      );
      onCreated(created);
    } catch (err) {
      onToast(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  const totalItemSteps = Math.max(items.length, step);

  return (
    <div className="flex flex-col gap-4">
      <span className="text-xs font-medium text-stone-500">
        {step === 0
          ? `Step 1 of ${totalItemSteps + 1} · General info`
          : `Step ${step + 1} of ${totalItemSteps + 1} · Exercise/rest`}
      </span>

      {step === 0 ? (
        <>
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
          <TypeSelect
            types={types}
            value={form.type_id}
            onChange={(type_id) => setForm({ ...form, type_id })}
          />
        </>
      ) : (
        currentItem && (
          // Keyed on step so switching to a different (or freshly-added,
          // blank) item remounts the fields instead of reusing the same
          // DOM inputs - they're uncontrolled (defaultValue + onBlur, so
          // a mid-step edit doesn't fight the user's cursor), which means
          // React won't otherwise refresh their displayed value when the
          // underlying item changes out from under them.
          <ItemFields
            key={step}
            item={currentItem}
            onChange={updateCurrentItem}
            onError={onToast}
          />
        )
      )}

      {stepError && <p className="text-sm text-red-700">{stepError}</p>}

      <div className="flex gap-2">
        {step > 0 && (
          <button
            type="button"
            onClick={() => setStep((s) => s - 1)}
            className="min-h-[44px] flex-1 rounded-xl border border-stone-300 font-medium text-stone-700"
          >
            Back
          </button>
        )}
        {step === 0 ? (
          <button
            type="button"
            onClick={goNextFromGeneralInfo}
            className="min-h-[44px] flex-1 rounded-full bg-red-600 font-medium text-white"
          >
            Next
          </button>
        ) : (
          <button
            type="button"
            onClick={addStep}
            className="min-h-[44px] flex-1 rounded-xl border border-stone-300 font-medium text-stone-700"
          >
            + Next step
          </button>
        )}
      </div>

      {step > 0 && (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={removeCurrentStep}
            className="min-h-[44px] flex-1 rounded-xl border border-stone-300 font-medium text-red-700"
          >
            Remove this step
          </button>
          <button
            type="button"
            onClick={finish}
            disabled={submitting}
            className="min-h-[44px] flex-1 rounded-full bg-red-600 font-medium text-white disabled:opacity-50"
          >
            {submitting ? "Saving..." : "Finish"}
          </button>
        </div>
      )}
    </div>
  );
}

export default function TrainingModules() {
  const api = useApi();
  const { user } = useAuth();
  const canEdit = !!user?.is_admin || user?.role === "coach";
  const [modules, setModules] = useState<TrainingModule[] | null>(null);
  const [types, setTypes] = useState<TrainingModuleType[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [drawer, setDrawer] = useState<"closed" | "create" | TrainingModule>(
    "closed"
  );
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    load();
    api
      .get<{ types: TrainingModuleType[] }>("/training-module-types")
      .then((res) => setTypes(res.types))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    setDrawer("create");
  }

  function handleCreated(created: TrainingModule) {
    setModules((prev) => (prev ? [...prev, created] : [created]));
    setDrawer("closed");
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
            <span className="flex items-center gap-2">
              <span className="font-medium">{m.title}</span>
              {m.type_name && <Badge>{m.type_name}</Badge>}
            </span>
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
          {drawer === "create" && (
            <CreateModuleWizard
              types={types}
              onCreated={handleCreated}
              onToast={showToast}
            />
          )}
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
            <TypeSelect
              types={types}
              value={editing.type_id}
              onChange={(type_id) => updateModule(editing.id, { type_id })}
            />
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

