import { useState } from "react";
import { createPortal } from "react-dom";
import { extractYouTubeId, RichText } from "./ui";

// One step in a playback run - always one exercise's worth of content,
// already flattened from whatever the underlying itinerary item actually
// links to (a single exercise via training_module_item_id, every exercise
// in a whole session via training_module_id, or - for a plain item with
// neither - a fallback built from the item's own title/notes). See
// buildPlaybackSteps in Schedule.tsx for how this list gets built.
export interface PlaybackStep {
  key: string;
  itemId: number;
  name: string;
  measurement: string | null;
  video_url: string | null;
  image_url: string | null;
  explanation: string | null;
}

// Full-screen "follow along" mode for a training schedule item's
// itinerary: one exercise per screen (title, measurement, a large
// video/image, then description) with a "mark complete" action that
// advances to the next exercise, plus separate back/forward navigation
// that doesn't touch completion. Unlike the small inline thumbnail used
// elsewhere (ExerciseMediaBox - compact since it's one of several rows in
// a list), this is the sole content on screen, so a YouTube link gets a
// real embedded player here instead of a thumbnail-and-link-out.
export function PlaybackPlayer({
  steps,
  initialIndex = 0,
  canComplete,
  onClose,
  onComplete,
}: {
  steps: PlaybackStep[];
  initialIndex?: number;
  canComplete: boolean;
  onClose: () => void;
  onComplete: (itemId: number) => void;
}) {
  const [index, setIndex] = useState(initialIndex);
  const step = steps[index];
  if (!step) return null;

  const isFirst = index === 0;
  const isLast = index === steps.length - 1;
  const youTubeId = step.video_url ? extractYouTubeId(step.video_url) : null;

  function goTo(next: number) {
    setIndex(Math.max(0, Math.min(steps.length - 1, next)));
  }

  function markComplete() {
    onComplete(step.itemId);
    if (!isLast) goTo(index + 1);
  }

  // Portaled straight to <body> rather than rendered in place: this opens
  // from deep inside the event detail Drawer, which applies its own
  // translate-x transform while open - any CSS transform on an ancestor
  // establishes a new containing block for `position: fixed` descendants,
  // so without the portal this "full screen" overlay would actually be
  // sized/positioned relative to the Drawer's box instead of the real
  // viewport.
  return createPortal(
    <div className="fixed inset-0 z-[60] flex flex-col bg-white">
      <div className="flex items-center justify-between border-b border-stone-200 p-4">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close playback"
          className="flex h-10 w-10 items-center justify-center text-2xl text-stone-500"
        >
          ✕
        </button>
        <span className="text-sm font-medium text-stone-500">
          {index + 1} / {steps.length}
        </span>
        <span className="w-10" />
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <h2 className="text-2xl font-bold tracking-tight text-stone-900">
          {step.name}
        </h2>
        {step.measurement && (
          <p className="mt-1 text-lg font-medium text-stone-600">
            {step.measurement}
          </p>
        )}

        {youTubeId ? (
          <div className="mt-4 aspect-video w-full overflow-hidden rounded-xl bg-black">
            <iframe
              key={youTubeId}
              src={`https://www.youtube.com/embed/${youTubeId}`}
              title={step.name}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className="h-full w-full"
            />
          </div>
        ) : step.video_url ? (
          // eslint-disable-next-line jsx-a11y/media-has-caption
          <video
            key={step.video_url}
            src={step.video_url}
            controls
            className="mt-4 aspect-video w-full rounded-xl bg-black object-contain"
          />
        ) : step.image_url ? (
          <img
            key={step.image_url}
            src={step.image_url}
            alt={step.name}
            className="mt-4 w-full rounded-xl object-cover"
          />
        ) : null}

        <RichText html={step.explanation} className="mt-4 text-base text-stone-700" />
      </div>

      <div className="flex items-center gap-2 border-t border-stone-200 p-4">
        <button
          type="button"
          disabled={isFirst}
          onClick={() => goTo(index - 1)}
          className="flex min-h-[48px] flex-1 items-center justify-center rounded-xl border border-stone-300 font-medium text-stone-700 disabled:opacity-40"
        >
          ‹ Back
        </button>
        {canComplete && (
          <button
            type="button"
            onClick={markComplete}
            className="flex min-h-[48px] flex-[2] items-center justify-center rounded-xl bg-red-600 font-medium text-white"
          >
            ✓ Complete{!isLast && " & next"}
          </button>
        )}
        <button
          type="button"
          disabled={isLast}
          onClick={() => goTo(index + 1)}
          className="flex min-h-[48px] flex-1 items-center justify-center rounded-xl border border-stone-300 font-medium text-stone-700 disabled:opacity-40"
        >
          Next ›
        </button>
      </div>
    </div>,
    document.body
  );
}
