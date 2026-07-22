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
}

export interface TrainingModule {
  id: number;
  title: string;
  explanation: string | null;
  type_id: number | null;
  type_name: string | null;
  items: TrainingModuleItem[];
}

export function itemSummary(it: TrainingModuleItem) {
  if (it.item_type === "rest") {
    return it.duration_seconds ? `Rest ${it.duration_seconds}s` : "Rest";
  }
  const name = it.name?.trim() || "Untitled exercise";
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
export function TrainingModuleView({ module }: { module: TrainingModule }) {
  return (
    <div className="flex flex-col gap-2 rounded-xl bg-stone-50 p-2">
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
          return (
            <div
              key={item.id}
              className="flex flex-col gap-2 rounded-xl border border-stone-200 bg-white p-3"
            >
              <span className="font-medium">{itemSummary(item)}</span>
              {item.explanation && (
                <p className="text-sm text-stone-600">{item.explanation}</p>
              )}
              {youTubeId ? (
                <iframe
                  className="aspect-video w-full rounded-xl"
                  src={`https://www.youtube.com/embed/${youTubeId}`}
                  title="Video preview"
                  allowFullScreen
                />
              ) : (
                item.video_url && (
                  // eslint-disable-next-line jsx-a11y/media-has-caption
                  <video src={item.video_url} controls className="w-full rounded-xl" />
                )
              )}
              {item.image_url && (
                <img
                  src={item.image_url}
                  alt={item.name ?? "Exercise"}
                  className="max-h-40 w-full rounded-xl object-cover"
                />
              )}
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
