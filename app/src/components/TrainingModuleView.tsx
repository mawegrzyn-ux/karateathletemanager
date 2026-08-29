import { extractYouTubeId } from "./ui";

export type TrainingModuleItemType = "exercise" | "rest";

export interface TrainingModuleItem {
  id: number;
  position: number;
  item_type: TrainingModuleItemType;
  name: string | null;
  explanation: string | null;
  video_url: string | null;
  image_url: string | null;
  sets: number | null;
  reps: number | null;
  duration_seconds: number | null;
  distance_meters: number | null;
}

export interface TrainingModule {
  id: number;
  title: string;
  explanation: string | null;
  type_id: number | null;
  type_name: string | null;
  icon: string | null;
  type_icon: string | null;
  type_icon_url: string | null;
  type_bg_color: string | null;
  archived: boolean;
  items: TrainingModuleItem[];
}

// A module's effective icon: its own override if set, else its type's
// default icon (null if neither is set - callers fall back further, e.g.
// to the schedule event type's icon). A module has no image of its own
// (only its type does, via type_icon_url) - moduleIconUrl below is null
// whenever the plain override wins, same reasoning as eventTypeInfo's
// icon_url in Schedule.tsx.
export function moduleIcon(module: Pick<TrainingModule, "icon" | "type_icon">) {
  return module.icon ?? module.type_icon ?? null;
}

export function moduleIconUrl(
  module: Pick<TrainingModule, "icon" | "type_icon_url">
) {
  return module.icon ? null : module.type_icon_url ?? null;
}

// The measurement portion alone (no name) - "4 × 12", "30s", "50m" - or
// null for a plain exercise with no sets/reps/duration/distance set.
// Shared by itemSummary (which prefixes the name) and
// TrainingModuleItemDetail (which shows the name as its own big title
// instead, so it needs the measurement on its own).
export function itemMeasurement(it: TrainingModuleItem) {
  if (it.item_type === "rest") {
    return it.duration_seconds ? `${it.duration_seconds}s` : null;
  }
  if (it.distance_meters != null) return `${it.distance_meters}m`;
  if (it.duration_seconds != null && it.sets == null) {
    return `${it.duration_seconds}s`;
  }
  if (it.sets != null && it.reps != null) return `${it.sets} × ${it.reps}`;
  return null;
}

export function itemSummary(it: TrainingModuleItem) {
  if (it.item_type === "rest") {
    return itemMeasurement(it) ? `Rest ${itemMeasurement(it)}` : "Rest";
  }
  const name = it.name?.trim() || "Untitled exercise";
  const measurement = itemMeasurement(it);
  return measurement ? `${name} — ${measurement}` : name;
}

// A small fixed-size photo/video box for one exercise - compact rather
// than full-width since this renders inline per exercise in what's often
// a list of several, so it's a visual cue here, not the primary content.
// YouTube gets its own thumbnail image (light - no iframe per exercise)
// wrapped in a link out to actually watch it, rather than an inline
// embed; a direct video file stays a real (small) <video> so it's still
// playable inline without leaving the page.
export function ExerciseMediaBox({ item }: { item: TrainingModuleItem }) {
  const youTubeId = item.video_url ? extractYouTubeId(item.video_url) : null;
  if (youTubeId) {
    return (
      <a
        href={item.video_url ?? undefined}
        target="_blank"
        rel="noreferrer"
        className="relative block h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-stone-200"
      >
        <img
          src={`https://img.youtube.com/vi/${youTubeId}/mqdefault.jpg`}
          alt=""
          className="h-full w-full object-cover"
        />
        <span className="absolute inset-0 flex items-center justify-center text-2xl text-white drop-shadow">
          ▶
        </span>
      </a>
    );
  }
  if (item.video_url) {
    return (
      // eslint-disable-next-line jsx-a11y/media-has-caption
      <video
        src={item.video_url}
        controls
        className="h-20 w-20 shrink-0 rounded-lg object-cover"
      />
    );
  }
  if (item.image_url) {
    return (
      <img
        src={item.image_url}
        alt={item.name ?? "Exercise"}
        className="h-20 w-20 shrink-0 rounded-lg object-cover"
      />
    );
  }
  return null;
}

// One exercise's compact row within a module's list - name+measurement
// and description on the left, a small media box on the right.
export function ExerciseItemRow({ item }: { item: TrainingModuleItem }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-stone-200 bg-white p-3">
      <div className="flex flex-1 flex-col gap-1">
        <span className="font-medium">{itemSummary(item)}</span>
        {item.explanation && (
          <p className="text-sm text-stone-600">{item.explanation}</p>
        )}
      </div>
      <ExerciseMediaBox item={item} />
    </div>
  );
}

// Full detail for ONE exercise, linked directly to an itinerary item via
// training_module_item_id (as opposed to TrainingModuleView, which shows
// a whole module's exercise list via training_module_id) - a big title
// (the exercise's own name) above its measurement/description/media, in
// the same compact row shape as ExerciseItemRow but without repeating the
// name inside the row since the title above already carries it.
export function TrainingModuleItemDetail({
  item,
  showTitle,
}: {
  item: TrainingModuleItem;
  showTitle?: boolean;
}) {
  const measurement = itemMeasurement(item);
  return (
    <div className="flex flex-col gap-2 rounded-xl bg-stone-50 p-2">
      {showTitle && (
        <h3 className="px-1 text-lg font-bold tracking-tight text-stone-900">
          {item.name?.trim() || "Untitled exercise"}
        </h3>
      )}
      <div className="flex items-start gap-3 rounded-xl border border-stone-200 bg-white p-3">
        <div className="flex flex-1 flex-col gap-1">
          {measurement && (
            <span className="font-medium">{measurement}</span>
          )}
          {item.explanation && (
            <p className="text-sm text-stone-600">{item.explanation}</p>
          )}
        </div>
        <ExerciseMediaBox item={item} />
      </div>
    </div>
  );
}

// Read-only display of a training module's exercises/rest — with video
// and image previews — reused anywhere a linked module needs to be shown
// without its editing controls (the admin Training Modules page for
// non-editors, and inline on a Schedule training item/event).
//
// `showTitle` is opt-in (default off) since two of its three call sites
// already show the module's title via their own surrounding UI (the
// admin page's Drawer header, the event detail drawer's own prominent
// title) - rendering it again here would just duplicate it. Only
// Schedule's itinerary item view (ItemsSection) has nothing else showing
// the linked session's name prominently, so that's the one call site
// that turns this on.
export function TrainingModuleView({
  module,
  showTitle,
}: {
  module: TrainingModule;
  showTitle?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-xl bg-stone-50 p-2">
      {showTitle && (
        <h3 className="px-1 text-lg font-bold tracking-tight text-stone-900">
          {module.title}
        </h3>
      )}
      {module.type_name && (
        <span className="w-fit rounded-full bg-stone-200 px-2 py-0.5 text-xs font-medium text-stone-700">
          {module.type_name}
        </span>
      )}
      {module.explanation && (
        <p className="px-1 text-sm text-stone-600">{module.explanation}</p>
      )}
      <span className="text-xs font-medium text-stone-600">
        Exercises &amp; rest ({module.items.length})
      </span>
      <div className="flex flex-col gap-2">
        {module.items.map((item) => (
          <ExerciseItemRow key={item.id} item={item} />
        ))}
        {module.items.length === 0 && (
          <p className="px-1 py-2 text-sm text-stone-500">No exercises yet.</p>
        )}
      </div>
    </div>
  );
}
