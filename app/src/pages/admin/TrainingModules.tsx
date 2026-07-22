import { useEffect, useRef, useState } from "react";
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

// A quick, DraftItem-shaped summary line - same wording as itemSummary but
// working off the string-valued draft fields (not yet the numeric,
// server-shaped TrainingModuleItem) so it's usable before an item is saved.
function draftItemSummary(it: DraftItem): string {
  if (it.item_type === "rest") {
    return it.duration_seconds ? `Rest ${it.duration_seconds}s` : "Rest";
  }
  const name = it.name.trim() || "Untitled exercise";
  if (it.mode === "time") {
    return it.duration_seconds ? `${name} — ${it.duration_seconds}s` : name;
  }
  return it.sets && it.reps ? `${name} — ${it.sets} × ${it.reps}` : name;
}

// Building or reviewing one exercise/rest item is broken into a handful of
// small screens instead of one long form, so a coach on a phone only ever
// sees a couple of fields at once: pick the type first (it decides what
// the rest of the screens even are), then name/explanation, then how it's
// measured, then the sets-or-duration values that choice implies, and
// finally optional media - each its own screen. `rest` skips straight from
// type to its one duration field, since it has no name/measure/media.
const EXERCISE_STAGES = ["type", "name", "measure", "details", "media"] as const;
const REST_STAGES = ["type", "details"] as const;
type Stage = (typeof EXERCISE_STAGES)[number] | (typeof REST_STAGES)[number];

function stagesFor(item: DraftItem): readonly Stage[] {
  return item.item_type === "exercise" ? EXERCISE_STAGES : REST_STAGES;
}

function stageLabel(stage: Stage): string {
  switch (stage) {
    case "type":
      return "Exercise or rest?";
    case "name":
      return "Name & explanation";
    case "measure":
      return "Measured by";
    case "details":
      return "Details";
    case "media":
      return "Media";
  }
}

function stageValid(item: DraftItem, stage: Stage): boolean {
  if (stage === "name") return item.item_type !== "exercise" || item.name.trim() !== "";
  return true;
}

// The fields for a single stage of a single item - shared by the create
// wizard (one stage of one item on screen at a time) and the edit-flow's
// per-step editor (same stages, reached by expanding a step in the list).
function ItemStageContent({
  item,
  stage,
  onChange,
  onError,
}: {
  item: DraftItem;
  stage: Stage;
  onChange: (patch: Partial<DraftItem>) => void;
  onError: (message: string) => void;
}) {
  switch (stage) {
    case "type":
      return (
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
      );
    case "name":
      return (
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
        </>
      );
    case "measure":
      return (
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
      );
    case "details":
      if (item.item_type === "rest" || item.mode === "time") {
        return (
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
        );
      }
      return (
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
      );
    case "media":
      return (
        <>
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
        </>
      );
  }
}

// Icon-only nav buttons shared by the create wizard and the edit-flow's
// per-step editor - back/next/insert/remove/finish, matching the rest of
// the app's emoji-icon conventions (🗑 for delete, ✓ for a done state).
function IconBtn({
  icon,
  label,
  onClick,
  disabled,
  tone = "neutral",
}: {
  icon: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: "neutral" | "danger" | "primary";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={`flex min-h-[44px] flex-1 items-center justify-center text-lg disabled:opacity-40 ${
        tone === "primary"
          ? "rounded-full bg-red-600 text-white"
          : tone === "danger"
          ? "rounded-xl border border-stone-300 text-red-700"
          : "rounded-xl border border-stone-300 text-stone-700"
      }`}
    >
      {icon}
    </button>
  );
}

// Building a new module is a step-by-step wizard rather than one long
// scrolling form. General info (title/explanation/type) isn't counted as
// a step - it's a screen of its own before step 1 - then each exercise/
// rest item is its own step, itself broken into the stage screens above.
// "Next" walks forward one stage at a time (crossing into the next item
// once the current one's stages run out); "Insert" always appends a new
// blank item and jumps straight to it, regardless of which stage of
// which item you're currently on; "Remove" deletes the current item
// outright; "Finish" submits everything gathered so far from any point.
// Mounted only while the create drawer is open, so each open gets fresh
// internal state for free.
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
  const [onGeneralInfo, setOnGeneralInfo] = useState(true);
  const [form, setForm] = useState(EMPTY_FORM);
  const [items, setItems] = useState<DraftItem[]>([]);
  const [itemIndex, setItemIndex] = useState(0);
  const [stageIndex, setStageIndex] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [stepError, setStepError] = useState<string | null>(null);

  const currentItem = !onGeneralInfo ? items[itemIndex] ?? null : null;
  const stages = currentItem ? stagesFor(currentItem) : [];
  const stage = stages[stageIndex];

  function updateCurrentItem(patch: Partial<DraftItem>) {
    setItems((prev) =>
      prev.map((it, i) => (i === itemIndex ? { ...it, ...patch } : it))
    );
  }

  function currentItemMinimallyValid() {
    if (!currentItem) return true;
    return currentItem.item_type === "rest" || currentItem.name.trim() !== "";
  }

  function goNext() {
    setStepError(null);
    if (onGeneralInfo) {
      if (!form.title.trim()) {
        setStepError("Title is required");
        return;
      }
      if (items.length === 0) setItems([{ ...EMPTY_EXERCISE }]);
      setOnGeneralInfo(false);
      setItemIndex(0);
      setStageIndex(0);
      return;
    }
    if (!currentItem) return;
    if (!stageValid(currentItem, stage)) {
      setStepError("Name is required");
      return;
    }
    if (stageIndex < stages.length - 1) {
      setStageIndex((s) => s + 1);
    } else if (itemIndex < items.length - 1) {
      setItemIndex((i) => i + 1);
      setStageIndex(0);
    }
  }

  function goBack() {
    setStepError(null);
    if (onGeneralInfo) return;
    if (stageIndex > 0) {
      setStageIndex((s) => s - 1);
    } else if (itemIndex > 0) {
      setStageIndex(stagesFor(items[itemIndex - 1]).length - 1);
      setItemIndex((i) => i - 1);
    } else {
      setOnGeneralInfo(true);
    }
  }

  function insertStep() {
    if (!onGeneralInfo && !currentItemMinimallyValid()) {
      setStepError("Name is required");
      return;
    }
    setStepError(null);
    setItemIndex(items.length);
    setItems((prev) => [...prev, { ...EMPTY_EXERCISE }]);
    setStageIndex(0);
    setOnGeneralInfo(false);
  }

  function removeStep() {
    if (onGeneralInfo || !currentItem) return;
    const next = items.filter((_, i) => i !== itemIndex);
    setItems(next);
    setStageIndex(0);
    setStepError(null);
    if (next.length === 0) {
      setOnGeneralInfo(true);
      setItemIndex(0);
    } else {
      setItemIndex((i) => Math.min(i, next.length - 1));
    }
  }

  async function finish() {
    if (!onGeneralInfo && !currentItemMinimallyValid()) {
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

  const canGoNext =
    onGeneralInfo || stageIndex < stages.length - 1 || itemIndex < items.length - 1;

  return (
    <div className="flex flex-col gap-4">
      <span className="text-xs font-medium text-stone-500">
        {onGeneralInfo
          ? "General info"
          : `Step ${itemIndex + 1} of ${items.length} · ${stageLabel(stage)}`}
      </span>

      {onGeneralInfo ? (
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
          <ItemStageContent
            key={`${itemIndex}-${stage}`}
            item={currentItem}
            stage={stage}
            onChange={updateCurrentItem}
            onError={onToast}
          />
        )
      )}

      {stepError && <p className="text-sm text-red-700">{stepError}</p>}

      <div className="flex gap-2">
        <IconBtn icon="←" label="Back" onClick={goBack} disabled={onGeneralInfo} />
        <IconBtn icon="→" label="Next" onClick={goNext} disabled={!canGoNext} />
        {!onGeneralInfo && (
          <>
            <IconBtn icon="➕" label="Insert step" onClick={insertStep} />
            <IconBtn icon="🗑" label="Remove step" onClick={removeStep} tone="danger" />
          </>
        )}
        <IconBtn
          icon="✓"
          label={submitting ? "Saving" : "Finish"}
          onClick={finish}
          disabled={submitting}
          tone="primary"
        />
      </div>
    </div>
  );
}

// Editing an existing module's items: a draggable, collapsed list of
// steps (tap to expand into the same stage-by-stage editor the create
// wizard uses, drag the ⠿ handle to reorder) rather than every item's
// full field set open at once - keeps a module with several steps
// scannable, and reordering doesn't need its own separate mode.
function EditModuleItems({
  items,
  onChange,
  onError,
}: {
  items: DraftItem[];
  onChange: (items: DraftItem[]) => void;
  onError: (message: string) => void;
}) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [stageIndex, setStageIndex] = useState(0);
  const dragIndexRef = useRef<number | null>(null);

  function updateItem(index: number, patch: Partial<DraftItem>) {
    onChange(items.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  }

  function removeItem(index: number) {
    onChange(items.filter((_, i) => i !== index));
    setExpandedIndex(null);
  }

  function insertItem() {
    setExpandedIndex(items.length);
    setStageIndex(0);
    onChange([...items, { ...EMPTY_EXERCISE }]);
  }

  function toggleExpand(index: number) {
    setStageIndex(0);
    setExpandedIndex((prev) => (prev === index ? null : index));
  }

  function handleDrop(targetIndex: number) {
    const from = dragIndexRef.current;
    dragIndexRef.current = null;
    if (from == null || from === targetIndex) return;
    const next = [...items];
    const [moved] = next.splice(from, 1);
    next.splice(targetIndex, 0, moved);
    onChange(next);
    setExpandedIndex(null);
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl bg-stone-50 p-2">
      <span className="text-xs font-medium text-stone-600">
        Exercises &amp; rest ({items.length}) — drag ⠿ to reorder
      </span>

      <div className="flex flex-col gap-2">
        {items.map((item, i) => {
          const expanded = expandedIndex === i;
          const stages = stagesFor(item);
          const stage = stages[Math.min(stageIndex, stages.length - 1)];
          return (
            <div
              key={i}
              draggable
              onDragStart={() => {
                dragIndexRef.current = i;
              }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleDrop(i)}
              className="flex flex-col gap-3 rounded-xl border border-stone-200 bg-white p-3"
            >
              <button
                type="button"
                onClick={() => toggleExpand(i)}
                className="flex min-h-[44px] w-full items-center justify-between gap-2 text-left"
              >
                <span className="flex items-center gap-2">
                  <span aria-hidden className="cursor-grab text-stone-400">
                    ⠿
                  </span>
                  <span className="font-medium">{draftItemSummary(item)}</span>
                </span>
                <span aria-hidden className="text-stone-400">
                  {expanded ? "▲" : "▼"}
                </span>
              </button>

              {expanded && (
                <>
                  <span className="text-xs font-medium text-stone-500">
                    {stageLabel(stage)}
                  </span>
                  <ItemStageContent
                    key={`${i}-${stage}`}
                    item={item}
                    stage={stage}
                    onChange={(patch) => updateItem(i, patch)}
                    onError={onError}
                  />
                  <div className="flex gap-2">
                    <IconBtn
                      icon="←"
                      label="Back"
                      onClick={() => setStageIndex((s) => Math.max(0, s - 1))}
                      disabled={stageIndex === 0}
                    />
                    <IconBtn
                      icon="→"
                      label="Next"
                      onClick={() =>
                        setStageIndex((s) => Math.min(stages.length - 1, s + 1))
                      }
                      disabled={stageIndex >= stages.length - 1}
                    />
                    <IconBtn
                      icon="🗑"
                      label="Remove step"
                      onClick={() => removeItem(i)}
                      tone="danger"
                    />
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>

      <IconBtn icon="➕" label="Insert step" onClick={insertItem} />
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
            <EditModuleItems
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
