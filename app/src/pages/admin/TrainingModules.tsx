import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
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
  moduleIcon,
  type TrainingModule,
  type TrainingModuleItem,
  type TrainingModuleItemType as ItemType,
} from "../../components/TrainingModuleView";

const MAX_SETS = 50;
const MAX_REPS = 1000;
const MAX_DURATION_SECONDS = 6 * 60 * 60; // 6 hours
const MAX_DISTANCE_METERS = 100000; // 100km

interface TrainingModuleType {
  id: number;
  name: string;
  icon: string | null;
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
            {t.icon ? `${t.icon} ` : ""}
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
  mode: "reps" | "time" | "distance";
  sets: string;
  reps: string;
  duration_seconds: string;
  distance_meters: string;
}

const EMPTY_FORM = {
  title: "",
  explanation: "",
  type_id: null as number | null,
  icon: "",
};

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
  distance_meters: "",
};

function toDraftItem(item: TrainingModuleItem): DraftItem {
  const mode =
    item.distance_meters != null
      ? "distance"
      : item.duration_seconds != null && item.sets == null
      ? "time"
      : "reps";
  return {
    item_type: item.item_type,
    name: item.name ?? "",
    explanation: item.explanation ?? "",
    video_url: item.video_url ?? "",
    image_url: item.image_url ?? "",
    mode,
    sets: item.sets != null ? String(item.sets) : "",
    reps: item.reps != null ? String(item.reps) : "",
    duration_seconds:
      item.duration_seconds != null ? String(item.duration_seconds) : "",
    distance_meters:
      item.distance_meters != null ? String(item.distance_meters) : "",
  };
}

function draftItemSummary(it: DraftItem) {
  if (it.item_type === "rest") {
    return it.duration_seconds ? `Rest ${it.duration_seconds}s` : "Rest";
  }
  const name = it.name.trim() || "Untitled exercise";
  if (it.mode === "distance") {
    return it.distance_meters ? `${name} — ${it.distance_meters}m` : name;
  }
  if (it.mode === "time") {
    return it.duration_seconds ? `${name} — ${it.duration_seconds}s` : name;
  }
  if (it.sets && it.reps) return `${name} — ${it.sets} × ${it.reps}`;
  return name;
}

function toApiItem(it: DraftItem) {
  if (it.item_type === "rest") {
    return {
      item_type: "rest",
      duration_seconds: it.duration_seconds ? Number(it.duration_seconds) : null,
    };
  }
  if (it.mode === "distance") {
    return {
      item_type: "exercise",
      name: it.name,
      explanation: it.explanation || null,
      video_url: it.video_url || null,
      image_url: it.image_url || null,
      distance_meters: it.distance_meters ? Number(it.distance_meters) : null,
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
            onChange={(e) =>
              onChange({ mode: e.target.value as "reps" | "time" | "distance" })
            }
            className="min-h-[44px] rounded-xl border border-stone-300 px-3"
          >
            <option value="reps">Sets &amp; reps</option>
            <option value="time">Time</option>
            <option value="distance">Distance</option>
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
      if (item.mode === "distance") {
        return (
          <Field label="Distance (meters)">
            <input
              type="number"
              min={1}
              max={MAX_DISTANCE_METERS}
              defaultValue={item.distance_meters}
              onBlur={(e) => onChange({ distance_meters: e.target.value })}
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

// Jumping into an *existing* activity from the list below skips straight
// past the "type" stage to the name/description (or, for rest, the
// duration) stage - the type was already chosen when the activity was
// created, so re-asking it first is just an extra tap. A brand-new
// activity (via "Add activity") still starts at stage 0, since its type
// genuinely isn't decided yet.
const EXISTING_ACTIVITY_STAGE_INDEX = 1;

const LONG_PRESS_MS = 350;
const MOVE_CANCEL_PX = 10;

// The activities list shown on the general-info screen of both wizards -
// lets you see every exercise/rest activity at a glance, jump straight
// into one to edit it, drag ⠿ to reorder, and remove one without entering
// it. Restores the at-a-glance overview that jumping straight into the
// per-activity wizard on open doesn't otherwise provide.
//
// Dragging arms after a long press on the ⠿ handle specifically (not the
// whole row - the row itself stays a plain tap target for "open this
// activity"), matching the same long-press-then-pointer-drag pattern
// already used for rescheduling a timed event in the Day view: a short
// press-and-swipe (e.g. scrolling the drawer past this list) never starts
// a drag, since the row doesn't listen to pointermove until the timer
// fires, and moving too far before it fires cancels the pending arm.
// Reordering happens locally (`displayItems`) as the drag crosses each
// row-height boundary, purely for live visual feedback - the parent's
// `onReorder` (which persists via PATCH in the edit wizard) only fires
// once, on release, rather than once per boundary crossed.
function ActivitiesList({
  items,
  onReorder,
  onSelect,
  onRemove,
}: {
  items: DraftItem[];
  onReorder: (next: DraftItem[]) => void;
  onSelect: (index: number) => void;
  onRemove: (index: number) => void;
}) {
  const [displayItems, setDisplayItems] = useState(items);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [dragOffset, setDragOffset] = useState(0);
  const startYRef = useRef(0);
  const rowHeightRef = useRef(60);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressStartRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (draggingIndex === null) setDisplayItems(items);
  }, [items, draggingIndex]);

  if (items.length === 0) return null;

  function clearLongPressTimer() {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }

  function handlePointerDown(
    e: ReactPointerEvent,
    index: number,
    rowEl: HTMLElement | null
  ) {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    pressStartRef.current = { x: e.clientX, y: e.clientY };
    if (rowEl) rowHeightRef.current = rowEl.offsetHeight + 8;
    const startY = e.clientY;
    clearLongPressTimer();
    longPressTimerRef.current = setTimeout(() => {
      startYRef.current = startY;
      setDraggingIndex(index);
      setDragOffset(0);
    }, LONG_PRESS_MS);
  }

  function handlePointerMove(e: ReactPointerEvent) {
    if (draggingIndex === null) {
      if (pressStartRef.current) {
        const dx = e.clientX - pressStartRef.current.x;
        const dy = e.clientY - pressStartRef.current.y;
        if (Math.hypot(dx, dy) > MOVE_CANCEL_PX) {
          clearLongPressTimer();
          pressStartRef.current = null;
        }
      }
      return;
    }
    const delta = e.clientY - startYRef.current;
    const steps = Math.round(delta / rowHeightRef.current);
    if (steps === 0) {
      setDragOffset(delta);
      return;
    }
    const targetIndex = Math.max(
      0,
      Math.min(displayItems.length - 1, draggingIndex + steps)
    );
    if (targetIndex !== draggingIndex) {
      const next = [...displayItems];
      const [moved] = next.splice(draggingIndex, 1);
      next.splice(targetIndex, 0, moved);
      setDisplayItems(next);
      setDraggingIndex(targetIndex);
    }
    startYRef.current = e.clientY;
    setDragOffset(0);
  }

  function handlePointerUp() {
    clearLongPressTimer();
    pressStartRef.current = null;
    if (draggingIndex !== null) onReorder(displayItems);
    setDraggingIndex(null);
    setDragOffset(0);
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl bg-stone-50 p-2">
      <span className="text-xs font-medium text-stone-600">Activities</span>
      <div className="flex flex-col gap-2">
        {displayItems.map((item, i) => (
          <div
            key={i}
            className={`flex items-center gap-2 rounded-xl border bg-white px-3 py-2 ${
              draggingIndex === i
                ? "z-10 border-red-300 shadow-lg"
                : "border-stone-200"
            }`}
            style={
              draggingIndex === i
                ? { transform: `translateY(${dragOffset}px)` }
                : undefined
            }
          >
            <button
              type="button"
              onClick={() => onSelect(i)}
              className="min-h-[44px] flex-1 text-left font-medium"
            >
              {draftItemSummary(item)}
            </button>
            <span
              onPointerDown={(e) =>
                handlePointerDown(e, i, e.currentTarget.closest("div"))
              }
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              aria-label={`Drag to reorder ${draftItemSummary(item)}`}
              role="button"
              style={{ touchAction: "none" }}
              className="flex h-9 w-9 shrink-0 cursor-grab items-center justify-center text-lg text-stone-400 active:cursor-grabbing"
            >
              ⠿
            </span>
            <button
              type="button"
              onClick={() => onRemove(i)}
              aria-label={`Remove ${draftItemSummary(item)}`}
              className="flex h-9 w-9 shrink-0 items-center justify-center text-red-700"
            >
              🗑
            </button>
          </div>
        ))}
      </div>
    </div>
  );
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
  const [activityError, setActivityError] = useState<string | null>(null);

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
    setActivityError(null);
    if (onGeneralInfo) {
      if (!form.title.trim()) {
        setActivityError("Title is required");
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
      setActivityError("Name is required");
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
    setActivityError(null);
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

  function insertActivity() {
    if (!onGeneralInfo && !currentItemMinimallyValid()) {
      setActivityError("Name is required");
      return;
    }
    setActivityError(null);
    setItemIndex(items.length);
    setItems((prev) => [...prev, { ...EMPTY_EXERCISE }]);
    setStageIndex(0);
    setOnGeneralInfo(false);
  }

  function removeActivity() {
    if (onGeneralInfo || !currentItem) return;
    const next = items.filter((_, i) => i !== itemIndex);
    setItems(next);
    setStageIndex(0);
    setActivityError(null);
    if (next.length === 0) {
      setOnGeneralInfo(true);
      setItemIndex(0);
    } else {
      setItemIndex((i) => Math.min(i, next.length - 1));
    }
  }

  async function finish() {
    if (!onGeneralInfo && !currentItemMinimallyValid()) {
      setActivityError("Name is required");
      return;
    }
    setActivityError(null);
    setSubmitting(true);
    try {
      const { module: created } = await api.post<{ module: TrainingModule }>(
        "/training-modules",
        {
          title: form.title,
          explanation: form.explanation,
          type_id: form.type_id,
          icon: form.icon,
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

  function selectActivity(index: number) {
    setActivityError(null);
    setItemIndex(index);
    setStageIndex(EXISTING_ACTIVITY_STAGE_INDEX);
    setOnGeneralInfo(false);
  }

  function removeActivityAt(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  return (
    <div className="flex flex-col gap-4">
      {!onGeneralInfo && currentItem && (
        <h2 className="text-lg font-bold tracking-tight">
          {currentItem.item_type === "rest"
            ? "Rest"
            : currentItem.name.trim() || "New exercise"}
        </h2>
      )}
      <span className="text-xs font-medium text-stone-500">
        {onGeneralInfo
          ? "General info"
          : `Activity ${itemIndex + 1} of ${items.length} · ${stageLabel(stage)}`}
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
          <Field label="Icon (optional)">
            <input
              value={form.icon}
              onChange={(e) => setForm({ ...form, icon: e.target.value })}
              placeholder={types.find((t) => t.id === form.type_id)?.icon ?? undefined}
              className="min-h-[44px] rounded-xl border border-stone-300 px-3"
            />
          </Field>
          <ActivitiesList
            items={items}
            onReorder={setItems}
            onSelect={selectActivity}
            onRemove={removeActivityAt}
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

      {activityError && <p className="text-sm text-red-700">{activityError}</p>}

      <div className="sticky bottom-0 -mx-4 mt-2 flex flex-col gap-2 border-t border-stone-200 bg-white px-4 pb-4 pt-3">
        <div className="flex gap-2">
          <IconBtn icon="←" label="Back" onClick={goBack} disabled={onGeneralInfo} />
          <IconBtn icon="→" label="Next" onClick={goNext} disabled={!canGoNext} />
          <IconBtn
            icon="✓"
            label={submitting ? "Saving" : "Finish"}
            onClick={finish}
            disabled={submitting}
            tone="primary"
          />
        </div>
        {!onGeneralInfo && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={insertActivity}
              className="min-h-[44px] flex-1 rounded-xl border border-stone-300 font-medium text-stone-700"
            >
              + Add activity
            </button>
            <button
              type="button"
              onClick={removeActivity}
              className="min-h-[44px] flex-1 rounded-xl border border-red-200 font-medium text-red-700"
            >
              🗑 Remove activity
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// Editing an existing module always jumps into the same stage-by-stage
// wizard the create flow uses, rather than a page where every item is
// open at once (or sortable) alongside general info - mixing "edit a
// field" with "reorder everything" on one screen was confusing. Each
// field auto-saves via PATCH as soon as it's touched (no Finish/submit
// step - "Finish" here just closes back to the module, since there's
// nothing left to commit), matching the auto-save convention used
// everywhere else editing an existing record.
function EditModuleWizard({
  module,
  types,
  onSave,
  onDelete,
  onClose,
  onError,
}: {
  module: TrainingModule;
  types: TrainingModuleType[];
  onSave: (patch: Record<string, unknown>) => void;
  onDelete: () => void;
  onClose: () => void;
  onError: (message: string) => void;
}) {
  const [onGeneralInfo, setOnGeneralInfo] = useState(true);
  const [items, setItems] = useState<DraftItem[]>(module.items.map(toDraftItem));
  const [itemIndex, setItemIndex] = useState(0);
  const [stageIndex, setStageIndex] = useState(0);

  const currentItem = !onGeneralInfo ? items[itemIndex] ?? null : null;
  const stages = currentItem ? stagesFor(currentItem) : [];
  const stage = stages[stageIndex];

  function saveItems(next: DraftItem[]) {
    setItems(next);
    onSave({ items: next.map(toApiItem) });
  }

  function updateCurrentItem(patch: Partial<DraftItem>) {
    saveItems(items.map((it, i) => (i === itemIndex ? { ...it, ...patch } : it)));
  }

  function goNext() {
    if (onGeneralInfo) {
      setOnGeneralInfo(false);
      setItemIndex(0);
      setStageIndex(0);
      return;
    }
    if (!currentItem) return;
    if (stageIndex < stages.length - 1) {
      setStageIndex((s) => s + 1);
    } else if (itemIndex < items.length - 1) {
      setItemIndex((i) => i + 1);
      setStageIndex(0);
    }
  }

  function goBack() {
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

  function insertActivity() {
    const next = [...items, { ...EMPTY_EXERCISE }];
    setItemIndex(next.length - 1);
    setStageIndex(0);
    setOnGeneralInfo(false);
    saveItems(next);
  }

  function removeActivity() {
    if (!currentItem) return;
    const next = items.filter((_, i) => i !== itemIndex);
    setStageIndex(0);
    if (next.length === 0) {
      setOnGeneralInfo(true);
      setItemIndex(0);
    } else {
      setItemIndex((i) => Math.min(i, next.length - 1));
    }
    saveItems(next);
  }

  const canGoNext =
    onGeneralInfo || stageIndex < stages.length - 1 || itemIndex < items.length - 1;

  function selectActivity(index: number) {
    setItemIndex(index);
    setStageIndex(EXISTING_ACTIVITY_STAGE_INDEX);
    setOnGeneralInfo(false);
  }

  function removeActivityAt(index: number) {
    saveItems(items.filter((_, i) => i !== index));
  }

  return (
    <div className="flex flex-col gap-4">
      {!onGeneralInfo && currentItem && (
        <h2 className="text-lg font-bold tracking-tight">
          {currentItem.item_type === "rest"
            ? "Rest"
            : currentItem.name.trim() || "New exercise"}
        </h2>
      )}
      <span className="text-xs font-medium text-stone-500">
        {onGeneralInfo
          ? "General info"
          : `Activity ${itemIndex + 1} of ${items.length} · ${stageLabel(stage)}`}
      </span>

      {onGeneralInfo ? (
        <>
          <Field label="Title">
            <input
              required
              defaultValue={module.title}
              onBlur={(e) => {
                if (e.target.value !== module.title) {
                  onSave({ title: e.target.value });
                }
              }}
              className="min-h-[44px] rounded-xl border border-stone-300 px-3"
            />
          </Field>
          <Field label="Explanation">
            <textarea
              defaultValue={module.explanation ?? ""}
              onBlur={(e) => {
                if (e.target.value !== (module.explanation ?? "")) {
                  onSave({ explanation: e.target.value });
                }
              }}
              className="rounded-xl border border-stone-300 px-3 py-2"
            />
          </Field>
          <TypeSelect
            types={types}
            value={module.type_id}
            onChange={(type_id) => onSave({ type_id })}
          />
          <Field label="Icon (optional)">
            <input
              key={module.icon ?? ""}
              defaultValue={module.icon ?? ""}
              onBlur={(e) => {
                if (e.target.value !== (module.icon ?? "")) {
                  onSave({ icon: e.target.value });
                }
              }}
              placeholder={
                types.find((t) => t.id === module.type_id)?.icon ?? undefined
              }
              className="min-h-[44px] rounded-xl border border-stone-300 px-3"
            />
          </Field>
          <ActivitiesList
            items={items}
            onReorder={saveItems}
            onSelect={selectActivity}
            onRemove={removeActivityAt}
          />
        </>
      ) : (
        currentItem && (
          <ItemStageContent
            key={`${itemIndex}-${stage}`}
            item={currentItem}
            stage={stage}
            onChange={updateCurrentItem}
            onError={onError}
          />
        )
      )}

      <div className="sticky bottom-0 -mx-4 mt-2 flex flex-col gap-2 border-t border-stone-200 bg-white px-4 pb-4 pt-3">
        <div className="flex gap-2">
          <IconBtn icon="←" label="Back" onClick={goBack} disabled={onGeneralInfo} />
          <IconBtn icon="→" label="Next" onClick={goNext} disabled={!canGoNext} />
          <IconBtn icon="✓" label="Done" onClick={onClose} tone="primary" />
        </div>
        {!onGeneralInfo && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={insertActivity}
              className="min-h-[44px] flex-1 rounded-xl border border-stone-300 font-medium text-stone-700"
            >
              + Add activity
            </button>
            <button
              type="button"
              onClick={removeActivity}
              className="min-h-[44px] flex-1 rounded-xl border border-red-200 font-medium text-red-700"
            >
              🗑 Remove activity
            </button>
          </div>
        )}

        {onGeneralInfo && (
          <DeleteButton onClick={onDelete} itemLabel={module.title} />
        )}
      </div>
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
              {moduleIcon(m) && <span aria-hidden>{moduleIcon(m)}</span>}
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
          <EditModuleWizard
            key={editing.id}
            module={editing}
            types={types}
            onSave={(patch) => updateModule(editing.id, patch)}
            onDelete={() => deleteModule(editing.id)}
            onClose={() => setDrawer("closed")}
            onError={showToast}
          />
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
