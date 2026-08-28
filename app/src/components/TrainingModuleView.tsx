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

export function itemSummary(it: TrainingModuleItem) {
  if (it.item_type === "rest") {
    return it.duration_seconds ? `Rest ${it.duration_seconds}s` : "Rest";
  }
  const name = it.name?.trim() || "Untitled exercise";
  if (it.distance_meters != null) {
    return `${name} — ${it.distance_meters}m`;
  }
  if (it.duration_seconds != null && it.sets == null) {
    return `${name} — ${it.duration_seconds}s`;
  }
  if (it.sets != null && it.reps != null) {
    return `${name} — ${it.sets} × ${it.reps}`;
  }
  return name;
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
        {module.items.map((item) => {
          const youTubeId = item.video_url
            ? extractYouTubeId(item.video_url)
            : null;
          // A small fixed-size box rather than a full-width player/image -
          // this renders inline per exercise in what's often a list of
          // several, so a photo/video is a compact visual cue here, not
          // the primary content. YouTube gets its own thumbnail image
          // (light - no iframe per exercise) wrapped in a link out to
          // actually watch it, rather than an inline embed; a direct
          // video file stays a real (small) <video> so it's still
          // playable inline without leaving the page.
          const mediaBox = youTubeId ? (
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
          ) : item.video_url ? (
            // eslint-disable-next-line jsx-a11y/media-has-caption
            <video
              src={item.video_url}
              controls
              className="h-20 w-20 shrink-0 rounded-lg object-cover"
            />
          ) : item.image_url ? (
            <img
              src={item.image_url}
              alt={item.name ?? "Exercise"}
              className="h-20 w-20 shrink-0 rounded-lg object-cover"
            />
          ) : null;

          return (
            <div
              key={item.id}
              className="flex items-start gap-3 rounded-xl border border-stone-200 bg-white p-3"
            >
              <div className="flex flex-1 flex-col gap-1">
                <span className="font-medium">{itemSummary(item)}</span>
                {item.explanation && (
                  <p className="text-sm text-stone-600">{item.explanation}</p>
                )}
              </div>
              {mediaBox}
            </div>
          );
        })}
        {module.items.length === 0 && (
          <p className="px-1 py-2 text-sm text-stone-500">No exercises yet.</p>
        )}
      </div>
    </div>
  );
}
