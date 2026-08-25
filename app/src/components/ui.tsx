import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type PointerEvent as ReactPointerEvent,
  type PropsWithChildren,
  type ReactNode,
} from "react";
import { dateLabel } from "../utils/dates";
import { useApi } from "../hooks/useApi";
import { feedbackTick, feedbackConfirm } from "../utils/feedback";

export function Avatar({
  name,
  url,
  size = 40,
}: {
  name: string;
  url?: string | null;
  size?: number;
}) {
  const initials = name
    .trim()
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  if (url) {
    return (
      <img
        src={url}
        alt={name}
        style={{ width: size, height: size }}
        className="rounded-full object-cover"
      />
    );
  }

  return (
    <div
      style={{ width: size, height: size, fontSize: size * 0.4 }}
      className="flex items-center justify-center rounded-full bg-red-100 font-semibold leading-none text-red-700"
    >
      {initials || "?"}
    </div>
  );
}

// Every "type-with-icon-and-color library" (Schedule's event types,
// Training modules' own types - see admin/EventTypes.tsx,
// admin/TrainingModuleTypes.tsx) stores an emoji `icon` plus an optional
// admin-uploaded `iconUrl` that takes precedence when set - one shared
// renderer so both surfaces stay visually consistent and can't drift on
// how the two are picked between. `size` (px) gives the image and the
// emoji fallback the same visual footprint regardless of which is
// configured, since font-size and image width/height aren't otherwise
// comparable units. Not usable inside a native <select><option> (which
// can only ever render plain text) - those spots fall back to the plain
// `icon` string directly instead of this component.
export function TypeIcon({
  icon,
  iconUrl,
  size = 24,
  className = "",
}: {
  icon: string | null | undefined;
  iconUrl?: string | null;
  size?: number;
  className?: string;
}) {
  if (iconUrl) {
    return (
      <img
        src={iconUrl}
        alt=""
        style={{ width: size, height: size }}
        className={`inline-block shrink-0 rounded-sm object-contain ${className}`}
      />
    );
  }
  return (
    <span
      style={{ fontSize: size, lineHeight: 1 }}
      className={`inline-block shrink-0 ${className}`}
    >
      {icon}
    </span>
  );
}

export async function uploadFile(file: File): Promise<string> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch("/api/uploads", { method: "POST", body: formData });
  const body = await res.json().catch(() => undefined);
  if (!res.ok) {
    throw new Error(body?.error?.message ?? "Upload failed");
  }
  return body.url as string;
}

const YOUTUBE_ID_PATTERN =
  /(?:youtube\.com\/watch\?v=|youtube\.com\/embed\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/;

export function extractYouTubeId(url: string): string | null {
  return url.match(YOUTUBE_ID_PATTERN)?.[1] ?? null;
}

const VIDEO_EXT_PATTERN = /\.(mp4|mov|webm|m4v|avi)(\?|#|$)/i;

export function isVideoUrl(url: string): boolean {
  return VIDEO_EXT_PATTERN.test(url);
}

export function MediaField({
  label,
  kind,
  allowVideo,
  value,
  onChange,
  onError,
  onUploadingChange,
}: {
  label: string;
  kind: "video" | "image";
  // Image-kind only: also offers "Record video" alongside "Take photo" /
  // "Choose from library", for spots that want a single field covering
  // either media type (e.g. the Schedule swipe-to-post composer) rather
  // than a page-local second control - the preview auto-detects video vs.
  // image from the URL's extension.
  allowVideo?: boolean;
  value: string;
  onChange: (url: string) => void;
  onError: (message: string) => void;
  onUploadingChange?: (uploading: boolean) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const videoCaptureInputRef = useRef<HTMLInputElement>(null);

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    onUploadingChange?.(true);
    try {
      onChange(await uploadFile(file));
    } catch (err) {
      onError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      onUploadingChange?.(false);
    }
  }

  // Images skip the URL-paste field entirely - just the photo itself (or an
  // empty tap target) with small overlay icons, since every image on this
  // app comes from an upload/camera rather than a pasted link (unlike video,
  // where pasting a YouTube link is the common case). Both hidden file
  // inputs point at the same handler; the only difference is `capture`,
  // which is what actually steers a mobile browser to the camera app
  // instead of the photo library.
  if (kind === "image") {
    const isVideo = !!value && isVideoUrl(value);
    return (
      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium text-stone-700">{label}</span>
        <div className="relative">
          {value ? (
            isVideo ? (
              // eslint-disable-next-line jsx-a11y/media-has-caption
              <video
                src={value}
                controls
                className="max-h-40 w-full rounded-xl object-cover"
              />
            ) : (
              <img
                src={value}
                alt={`${label} preview`}
                className="max-h-40 w-full rounded-xl object-cover"
              />
            )
          ) : (
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="flex h-40 w-full flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-stone-300 text-stone-500"
            >
              <span className="text-2xl leading-none">📷</span>
              <span className="text-sm font-medium">
                {allowVideo ? "Add photo or video" : "Add photo"}
              </span>
            </button>
          )}
          {value && (
            <div className="absolute right-2 top-2 flex gap-2">
              <button
                type="button"
                onClick={() => onChange("")}
                aria-label={`Remove ${label.toLowerCase()}`}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-stone-900/60 text-white"
              >
                🗑
              </button>
              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                aria-label={`Edit ${label.toLowerCase()}`}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-stone-900/60 text-white"
              >
                ✏️
              </button>
            </div>
          )}
          {uploading && (
            <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-stone-900/50 text-sm font-medium text-white">
              Uploading…
            </div>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept={allowVideo ? "image/*,video/*" : "image/*"}
          onChange={handleFile}
          className="hidden"
        />
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFile}
          className="hidden"
        />
        {allowVideo && (
          <input
            ref={videoCaptureInputRef}
            type="file"
            accept="video/*"
            capture="environment"
            onChange={handleFile}
            className="hidden"
          />
        )}

        <Modal open={pickerOpen} onClose={() => setPickerOpen(false)}>
          <div className="flex flex-col gap-2 p-2">
            <button
              type="button"
              onClick={() => {
                setPickerOpen(false);
                cameraInputRef.current?.click();
              }}
              className="min-h-[44px] rounded-xl border border-stone-300 font-medium text-stone-700"
            >
              📷 Take photo
            </button>
            {allowVideo && (
              <button
                type="button"
                onClick={() => {
                  setPickerOpen(false);
                  videoCaptureInputRef.current?.click();
                }}
                className="min-h-[44px] rounded-xl border border-stone-300 font-medium text-stone-700"
              >
                🎥 Record video
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setPickerOpen(false);
                fileInputRef.current?.click();
              }}
              className="min-h-[44px] rounded-xl border border-stone-300 font-medium text-stone-700"
            >
              🖼 Choose from library
            </button>
          </div>
        </Modal>
      </div>
    );
  }

  const youTubeId = extractYouTubeId(value);

  return (
    <Field label={label}>
      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          <input
            key={value}
            defaultValue={value}
            onBlur={(e) => onChange(e.target.value)}
            placeholder="Paste a YouTube or video link"
            className="min-h-[44px] flex-1 rounded-xl border border-stone-300 px-3"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="min-h-[44px] rounded-xl border border-stone-300 px-3 text-sm font-medium text-stone-700 disabled:opacity-50"
          >
            {uploading ? "Uploading…" : "Upload"}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            onChange={handleFile}
            className="hidden"
          />
        </div>
        {youTubeId ? (
          <iframe
            className="aspect-video w-full rounded-xl"
            src={`https://www.youtube.com/embed/${youTubeId}`}
            title="Video preview"
            allowFullScreen
          />
        ) : (
          value && (
            // eslint-disable-next-line jsx-a11y/media-has-caption
            <video src={value} controls className="w-full rounded-xl" />
          )
        )}
      </div>
    </Field>
  );
}

// Address text input with free-as-you-type lookup suggestions, backed by
// GET /api/geocode (a thin server-side proxy over OpenStreetMap's Nominatim,
// which needs neither an API key nor per-admin configuration, unlike
// web_search's Brave key). Shaped as a drop-in replacement for a plain
// `<input>` bound to venue.address: the outer contract is `value`/`onChange`
// like MediaField, but internally the main text field still auto-saves on
// blur (matching every other onBlur-triggers-PATCH field in this app) -
// picking a suggestion is just a second, faster way to fill it in, not a
// replacement for typing an address by hand.
export function AddressField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (address: string) => void;
}) {
  const api = useApi();
  const [query, setQuery] = useState(value);
  const [suggestions, setSuggestions] = useState<{ display_name: string }[]>([]);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => setQuery(value), [value]);

  function handleInput(e: ChangeEvent<HTMLInputElement>) {
    const next = e.target.value;
    setQuery(next);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (next.trim().length < 3) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await api.get<{ results: { display_name: string }[] }>(
          `/geocode?q=${encodeURIComponent(next)}`
        );
        setSuggestions(res.results);
        setOpen(res.results.length > 0);
      } catch {
        setSuggestions([]);
      }
    }, 400);
  }

  function pick(displayName: string) {
    setQuery(displayName);
    setOpen(false);
    if (displayName !== value) onChange(displayName);
  }

  return (
    <Field label={label}>
      <div className="relative">
        <input
          value={query}
          onChange={handleInput}
          onFocus={() => setOpen(suggestions.length > 0)}
          onBlur={() => {
            // Delay closing so a click on a suggestion (which also blurs
            // the input) has a chance to register first.
            setTimeout(() => setOpen(false), 150);
            if (query !== value) onChange(query);
          }}
          className="min-h-[44px] w-full rounded-xl border border-stone-300 px-3"
        />
        {open && (
          <div className="absolute z-10 mt-1 max-h-60 w-full overflow-y-auto rounded-xl border border-stone-200 bg-white shadow-card">
            {suggestions.map((s, i) => (
              <button
                key={i}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(s.display_name)}
                className="block w-full px-3 py-2 text-left text-sm hover:bg-stone-50"
              >
                {s.display_name}
              </button>
            ))}
          </div>
        )}
      </div>
    </Field>
  );
}

export function Spinner() {
  return (
    <div
      className="h-5 w-5 animate-spin rounded-full border-2 border-stone-300 border-t-stone-600"
      role="status"
      aria-label="Loading"
    />
  );
}

export const BELT_COLOR_HEX: Record<string, string> = {
  white: "#f5f5f4",
  yellow: "#eab308",
  orange: "#f97316",
  green: "#22c55e",
  blue: "#3b82f6",
  purple: "#a855f7",
  brown: "#78350f",
  black: "#1c1917",
  red: "#dc2626",
};

// A handful of belt colors are a base color plus a contrasting stripe -
// an early beginner grade some federations insert between two main
// colors (white/red, white/yellow), a sub-rank between two main colors
// (purple/white), or a brown-belt sub-rank marked by stripe count (one/
// two stripes) - rendered as band(s) across the swatch instead of a flat
// fill.
export const BELT_STRIPES: Record<
  string,
  { base: string; stripe: string; count: number }
> = {
  "white-red-stripe": { base: "white", stripe: "red", count: 1 },
  "white-yellow-stripe": { base: "white", stripe: "yellow", count: 1 },
  "purple-white-stripe": { base: "purple", stripe: "white", count: 1 },
  "brown-one-stripe": { base: "brown", stripe: "white", count: 1 },
  "brown-two-stripes": { base: "brown", stripe: "white", count: 2 },
};

// Shared belt_color choices for every grade-editing `<select>` in the app
// (Grades.tsx, admin/Clubs.tsx's ClubGradesSection) - keeps the option
// list and its display labels in sync with BELT_COLOR_HEX/BELT_STRIPES
// in one place instead of duplicating it per page.
export const BELT_COLOR_OPTIONS: { value: string; label: string }[] = [
  { value: "white", label: "White" },
  { value: "white-red-stripe", label: "White / Red stripe" },
  { value: "white-yellow-stripe", label: "White / Yellow stripe" },
  { value: "yellow", label: "Yellow" },
  { value: "orange", label: "Orange" },
  { value: "green", label: "Green" },
  { value: "blue", label: "Blue" },
  { value: "purple", label: "Purple" },
  { value: "purple-white-stripe", label: "Purple / White stripe" },
  { value: "brown", label: "Brown" },
  { value: "brown-one-stripe", label: "Brown, 1 stripe" },
  { value: "brown-two-stripes", label: "Brown, 2 stripes" },
  { value: "black", label: "Black" },
];

export function BeltSwatch({ color }: { color: string }) {
  const stripe = BELT_STRIPES[color];
  if (stripe) {
    const base = BELT_COLOR_HEX[stripe.base] ?? "#d6d3d1";
    const stripeColor = BELT_COLOR_HEX[stripe.stripe] ?? "#d6d3d1";
    return (
      <span
        className="relative inline-block h-3.5 w-3.5 shrink-0 overflow-hidden rounded-full border border-stone-300"
        style={{ backgroundColor: base }}
        title={color.replace(/-/g, " ")}
      >
        <span className="absolute inset-x-0 top-1/2 flex -translate-y-1/2 flex-col gap-px">
          {Array.from({ length: stripe.count }).map((_, i) => (
            <span
              key={i}
              className="block h-[2px] w-full"
              style={{ backgroundColor: stripeColor }}
            />
          ))}
        </span>
      </span>
    );
  }
  return (
    <span
      className="inline-block h-3.5 w-3.5 shrink-0 rounded-full border border-stone-300"
      style={{ backgroundColor: BELT_COLOR_HEX[color] ?? "#d6d3d1" }}
      title={color}
    />
  );
}

export function Badge({ children }: PropsWithChildren) {
  return (
    <span className="inline-flex items-center rounded-full bg-stone-100 px-2 py-1 text-xs font-medium text-stone-700">
      {children}
    </span>
  );
}

export function Field({
  label,
  children,
}: PropsWithChildren<{ label: string }>) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm font-medium text-stone-700">{label}</span>
      {children}
    </label>
  );
}

export function Modal({
  open,
  onClose,
  children,
}: PropsWithChildren<{ open: boolean; onClose: () => void }>) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center">
      <div className="w-full max-w-md rounded-t-2xl bg-white p-4 sm:rounded-2xl">
        <button
          className="mb-2 min-h-[44px] min-w-[44px] text-stone-500"
          onClick={onClose}
          aria-label="Close"
        >
          ✕
        </button>
        {children}
      </div>
    </div>
  );
}

// Single combined date+time experience: one tappable field shows both
// values together, and opens a lightweight Modal (not a stacked Drawer -
// this sits inside forms that are often already inside a Drawer) with
// both the Date input and the Time input stacked and visible at once, so
// the user can set either or both without switching between screens.
export function DateTimeField({
  label,
  date,
  time,
  onDateChange,
  onTimeChange,
  min,
  max,
  required = false,
}: {
  label: string;
  date: string;
  time: string;
  onDateChange: (value: string) => void;
  onTimeChange: (value: string) => void;
  min?: string;
  max?: string;
  required?: boolean;
}) {
  const [open, setOpen] = useState(false);

  const display = date && time
    ? `${dateLabel(date)} · ${time}`
    : date
      ? dateLabel(date)
      : time || "Set date & time";

  return (
    // Not <Field> here: Modal's own buttons must not live inside the same
    // <label> as the trigger button, or clicking them also re-fires the
    // label's implicit click-forwarding onto the trigger (reopening it).
    <div className="flex flex-col gap-1">
      <span className="text-sm font-medium text-stone-700">{label}</span>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-h-[44px] items-center justify-between rounded-xl border border-stone-300 px-3 text-left"
      >
        <span className={date && time ? "" : "text-stone-400"}>{display}</span>
        <span aria-hidden>📅</span>
      </button>

      <Modal open={open} onClose={() => setOpen(false)}>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium text-stone-700">Date</span>
            <input
              type="date"
              autoFocus
              required={required}
              min={min}
              max={max}
              value={date}
              onChange={(e) => onDateChange(e.target.value)}
              className="min-h-[44px] rounded-xl border border-stone-300 px-3 text-lg"
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium text-stone-700">Time</span>
            <input
              type="time"
              step={900}
              required={required}
              value={time}
              onChange={(e) => onTimeChange(e.target.value)}
              className="min-h-[44px] rounded-xl border border-stone-300 px-3 text-lg"
            />
          </div>

          <button
            type="button"
            onClick={() => setOpen(false)}
            className="min-h-[44px] rounded-full bg-red-600 font-medium text-white"
          >
            Done
          </button>
        </div>
      </Modal>
    </div>
  );
}

// Paired start/end date+time: two trigger fields (each still showing its
// own value at a glance) but sharing one Modal, so setting the full range
// doesn't mean closing one picker and reopening another - both Start and
// End (date and time) are visible and editable together in the same
// screen.
export function DateTimeRangeField({
  startLabel = "Start",
  endLabel = "End",
  startDate,
  startTime,
  endDate,
  endTime,
  onStartDateChange,
  onStartTimeChange,
  onEndDateChange,
  onEndTimeChange,
  min,
  max,
  required = false,
}: {
  startLabel?: string;
  endLabel?: string;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  onStartDateChange: (value: string) => void;
  onStartTimeChange: (value: string) => void;
  onEndDateChange: (value: string) => void;
  onEndTimeChange: (value: string) => void;
  min?: string;
  max?: string;
  required?: boolean;
}) {
  const [open, setOpen] = useState(false);

  const display = (date: string, time: string) =>
    date && time
      ? `${dateLabel(date)} · ${time}`
      : date
        ? dateLabel(date)
        : time || "Set date & time";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium text-stone-700">{startLabel}</span>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex min-h-[44px] items-center justify-between rounded-xl border border-stone-300 px-3 text-left"
        >
          <span className={startDate && startTime ? "" : "text-stone-400"}>
            {display(startDate, startTime)}
          </span>
          <span aria-hidden>📅</span>
        </button>
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium text-stone-700">{endLabel}</span>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex min-h-[44px] items-center justify-between rounded-xl border border-stone-300 px-3 text-left"
        >
          <span className={endDate && endTime ? "" : "text-stone-400"}>
            {display(endDate, endTime)}
          </span>
          <span aria-hidden>📅</span>
        </button>
      </div>

      <Modal open={open} onClose={() => setOpen(false)}>
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <span className="text-sm font-semibold text-stone-900">{startLabel}</span>
              <div className="flex flex-col gap-1">
                <span className="text-sm font-medium text-stone-700">Date</span>
                <input
                  type="date"
                  autoFocus
                  required={required}
                  min={min}
                  max={max}
                  value={startDate}
                  onChange={(e) => onStartDateChange(e.target.value)}
                  className="min-h-[44px] w-full rounded-xl border border-stone-300 px-2 text-base"
                />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-sm font-medium text-stone-700">Time</span>
                <input
                  type="time"
                  step={900}
                  required={required}
                  value={startTime}
                  onChange={(e) => onStartTimeChange(e.target.value)}
                  className="min-h-[44px] w-full rounded-xl border border-stone-300 px-2 text-base"
                />
              </div>
            </div>

            <div className="flex flex-col gap-2 border-l border-stone-200 pl-4">
              <span className="text-sm font-semibold text-stone-900">{endLabel}</span>
              <div className="flex flex-col gap-1">
                <span className="text-sm font-medium text-stone-700">Date</span>
                <input
                  type="date"
                  required={required}
                  min={min}
                  max={max}
                  value={endDate}
                  onChange={(e) => onEndDateChange(e.target.value)}
                  className="min-h-[44px] w-full rounded-xl border border-stone-300 px-2 text-base"
                />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-sm font-medium text-stone-700">Time</span>
                <input
                  type="time"
                  step={900}
                  required={required}
                  value={endTime}
                  onChange={(e) => onEndTimeChange(e.target.value)}
                  className="min-h-[44px] w-full rounded-xl border border-stone-300 px-2 text-base"
                />
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setOpen(false)}
            className="min-h-[44px] rounded-full bg-red-600 font-medium text-white"
          >
            Done
          </button>
        </div>
      </Modal>
    </div>
  );
}

// How far a drag on the header has to travel (in the closing direction -
// right, since the drawer enters from the right) before releasing it
// dismisses the drawer rather than snapping back open.
const DRAWER_DISMISS_THRESHOLD = 96;

// Slides in from the right (full-screen push on mobile, a side panel at
// the sm: breakpoint) rather than just popping in - stays mounted for one
// extra transition tick after `open` goes false so the closing slide has
// somewhere to animate to, instead of vanishing instantly. Dragging the
// header rightward (the same direction the drawer slides out) past
// DRAWER_DISMISS_THRESHOLD and releasing dismisses it early, same as
// tapping the ✕ - restricted to the header rather than the whole panel so
// it doesn't fight the body's own scrolling/tappable content. The header
// needs `select-none`: without it, a second drag starting on/near the
// title text the first drag happened to leave selected gets hijacked by
// the browser's own "drag the selected text" gesture instead of reaching
// our pointer handlers - it fires pointercancel after only a step or two
// of pointermove, which onHeaderPointerCancel resets without treating as
// a dismiss (unlike onHeaderPointerUp, since a cancel isn't a deliberate
// release).
export function Drawer({
  open,
  onClose,
  title,
  children,
}: PropsWithChildren<{ open: boolean; onClose: () => void; title: string }>) {
  const [mounted, setMounted] = useState(open);
  const [visible, setVisible] = useState(false);
  const [dragX, setDragX] = useState(0);
  const startXRef = useRef<number | null>(null);
  const pastThresholdRef = useRef(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      // A single requestAnimationFrame isn't reliably enough to guarantee
      // the browser has painted the off-screen starting frame before the
      // transform flips - depending on what else is rendering that tick,
      // both can land in the same paint and the transition has nothing to
      // interpolate from, so it just pops in. Nesting two rAFs forces a
      // full paint to land in between.
      let raf2 = 0;
      const raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => setVisible(true));
      });
      return () => {
        cancelAnimationFrame(raf1);
        cancelAnimationFrame(raf2);
      };
    }
    setVisible(false);
    const timeout = setTimeout(() => setMounted(false), 300);
    return () => clearTimeout(timeout);
  }, [open]);

  function onHeaderPointerDown(e: ReactPointerEvent) {
    startXRef.current = e.clientX;
    pastThresholdRef.current = false;
    (e.target as Element).setPointerCapture(e.pointerId);
  }

  function onHeaderPointerMove(e: ReactPointerEvent) {
    if (startXRef.current == null) return;
    const delta = Math.max(0, e.clientX - startXRef.current);
    setDragX(delta);
    const isPast = delta >= DRAWER_DISMISS_THRESHOLD;
    if (isPast !== pastThresholdRef.current) {
      pastThresholdRef.current = isPast;
      if (isPast) feedbackTick(600);
    }
  }

  function onHeaderPointerUp() {
    if (startXRef.current == null) return;
    if (dragX >= DRAWER_DISMISS_THRESHOLD) {
      feedbackConfirm(500);
      onClose();
    }
    setDragX(0);
    pastThresholdRef.current = false;
    startXRef.current = null;
  }

  // A cancel means the browser interrupted the gesture (e.g. it briefly
  // took over for its own native text-selection drag before `select-none`
  // below stopped that) rather than the user deliberately releasing - so
  // just reset, never commit a dismiss here the way onHeaderPointerUp does.
  function onHeaderPointerCancel() {
    setDragX(0);
    pastThresholdRef.current = false;
    startXRef.current = null;
  }

  if (!mounted) return null;
  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col bg-white sm:inset-y-0 sm:left-auto sm:right-0 sm:w-[420px] sm:border-l sm:border-stone-200 sm:shadow-xl ${
        dragX === 0 ? "transition-transform duration-300 ease-out" : ""
      } ${visible ? "translate-x-0" : "translate-x-full"}`}
      style={dragX > 0 ? { transform: `translateX(${dragX}px)` } : undefined}
    >
      <div
        onPointerDown={onHeaderPointerDown}
        onPointerMove={onHeaderPointerMove}
        onPointerUp={onHeaderPointerUp}
        onPointerCancel={onHeaderPointerCancel}
        style={{ touchAction: dragX > 0 ? "none" : "pan-y" }}
        className="flex select-none items-center justify-between border-b border-stone-200 p-4"
      >
        <h2 className="text-lg font-semibold">{title}</h2>
        <button
          onClick={onClose}
          aria-label="Close"
          className="flex min-h-[44px] min-w-[44px] items-center justify-center text-stone-500"
        >
          ✕
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4">{children}</div>
    </div>
  );
}

export function AddButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label="Add"
      className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-red-600 text-xl leading-none text-white"
    >
      +
    </button>
  );
}

export function DeleteButton({
  onClick,
  itemLabel,
  label = "Delete",
  iconOnly = false,
}: {
  onClick: () => void;
  itemLabel?: string;
  label?: string;
  iconOnly?: boolean;
}) {
  const [confirming, setConfirming] = useState(false);

  return (
    <>
      <button
        onClick={() => setConfirming(true)}
        aria-label={label}
        className={
          iconOnly
            ? "flex h-8 w-8 items-center justify-center rounded-full text-red-600"
            : "flex min-h-[44px] items-center gap-2 rounded-xl border border-red-200 px-4 text-red-700"
        }
      >
        {iconOnly ? "🗑" : `🗑 ${label}`}
      </button>
      <Modal open={confirming} onClose={() => setConfirming(false)}>
        <div className="flex flex-col gap-4 p-2">
          <p className="text-stone-700">
            Delete {itemLabel ?? "this"}? This can't be undone.
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setConfirming(false)}
              className="min-h-[44px] flex-1 rounded-xl border border-stone-300 font-medium"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                setConfirming(false);
                onClick();
              }}
              className="min-h-[44px] flex-1 rounded-full bg-red-600 font-medium text-white"
            >
              Delete
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}

export function Toast({ message }: { message: string }) {
  return (
    <div className="fixed bottom-20 left-1/2 z-50 -translate-x-1/2 rounded-full bg-red-600 px-4 py-2 text-sm text-white shadow-lg">
      {message}
    </div>
  );
}

// A drag-around-the-ring duration picker (think a parking-meter app's "how
// long" dial) - purely the ring/thumb, no label of its own, so callers
// render whatever "27min" / "Ends 14:53" text fits their own context above
// it. One lap of the ring is `max` minutes, snapped to `step` as the
// pointer moves; dragging past a full lap just clamps at `max` rather than
// wrapping into a second lap, so this is meant for the "typical session"
// range (a couple of hours) with an exact-date/time field as the fallback
// for anything longer, not a general-purpose clock.
export function DurationDial({
  minutes,
  onChange,
  max = 180,
  step = 15,
  size = 220,
}: {
  minutes: number;
  onChange: (minutes: number) => void;
  max?: number;
  step?: number;
  size?: number;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);

  function minutesFromPoint(clientX: number, clientY: number) {
    const el = svgRef.current;
    if (!el) return minutes;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const angle = (Math.atan2(clientY - cy, clientX - cx) * 180) / Math.PI;
    // atan2 is 0° at 3 o'clock; rotate so 0° is 12 o'clock and increases
    // clockwise, matching how the arc itself is drawn below.
    const fromTop = (angle + 90 + 360) % 360;
    const raw = (fromTop / 360) * max;
    const snapped = Math.round(raw / step) * step;
    return Math.min(max, Math.max(0, snapped));
  }

  function handleDrag(e: ReactPointerEvent<SVGSVGElement>) {
    const next = minutesFromPoint(e.clientX, e.clientY);
    if (next !== minutes) {
      feedbackTick(400);
      onChange(next);
    }
  }

  function handlePointerDown(e: ReactPointerEvent<SVGSVGElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    handleDrag(e);
  }

  function handlePointerMove(e: ReactPointerEvent<SVGSVGElement>) {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    handleDrag(e);
  }

  const tickCount = Math.round(max / step);
  const ticks = Array.from({ length: tickCount }, (_, i) => {
    const deg = (i / tickCount) * 360;
    const major = i % 4 === 0;
    return (
      <line
        key={i}
        x1={100}
        y1={major ? 12 : 17}
        x2={100}
        y2={25}
        stroke="#a8a29e"
        strokeWidth={major ? 2.5 : 1.5}
        strokeLinecap="round"
        transform={`rotate(${deg} 100 100)`}
      />
    );
  });

  const radius = 78;
  const circumference = 2 * Math.PI * radius;
  const fraction = Math.min(1, minutes / max);

  return (
    <svg
      ref={svgRef}
      viewBox="0 0 200 200"
      width={size}
      height={size}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      className="touch-none select-none"
    >
      <circle cx={100} cy={100} r={radius} fill="none" stroke="#e7e5e4" strokeWidth={14} />
      {fraction > 0 && (
        <circle
          cx={100}
          cy={100}
          r={radius}
          fill="none"
          stroke="#dc2626"
          strokeWidth={14}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - fraction)}
          transform="rotate(-90 100 100)"
        />
      )}
      {ticks}
      <circle cx={100} cy={100} r={60} fill="white" />
    </svg>
  );
}

export const SWIPE_THRESHOLD = 64;
export const DEEP_SWIPE_THRESHOLD = 108;
const CYCLE_HINT_WIDTH = 150;
const DEEP_HINT_WIDTH = 205;
const DISABLED_SWIPE_MAX = 220;
const OPTION_CYCLE_DISTANCE = 36;

// Wraps a row with horizontal swipe-to-flag. Pointer events (not HTML5
// drag-and-drop) so it works on touch, same approach as Schedule's Day view
// drag-to-move. When `disabled` (coaches/admins can't swipe someone else's
// status), dragging still tracks and reveals `disabledMessage` behind the
// row instead of the option hints, growing with drag distance so the
// message can be read - but releasing never fires anything.
//
// Each side has an independent shallow/deep pair: swiping past
// SWIPE_THRESHOLD fires `leftOptions`/`rightAction` (defaulting to a
// single "✓ Completed"/"✗ Failed" built from `onSwipeComplete`/
// `onSwipeFailed` when omitted - Schedule's ItemsSection rows use only this
// shallow tier); swiping
// further past DEEP_SWIPE_THRESHOLD switches to `deepLeftOptions`/
// `deepRightAction` instead, when the caller provides them (Schedule's List
// view's ✓ Completed / ✗ Failed picker deepens into 🏆 Record result /
// 📝 Add post on the left, and its 📷 capture action deepens into a 🖼
// Gallery view on the right) - a snap to a fixed, wider width
// (DEEP_HINT_WIDTH) rather than a gradual stretch, so the hint reads
// cleanly at both sizes. Any option array with more than one entry is
// cyclable: holding in that zone and dragging vertically cycles which
// entry is selected (every OPTION_CYCLE_DISTANCE px of vertical drag
// moves one step, clamped to the array's ends rather than wrapping) -
// chunky ▲/▼ indicators flank the label (dimmed at whichever end is
// already selected), matching the weight of the List view's own ◀/▶
// "keep swiping" chevrons (rendered by the caller, tracking live dragX -
// see Schedule.tsx's List view) rather than the small, thin indicators an
// earlier pass used. Only the left side ever cycles multiple options at a
// given tier; the right side's shallow/deep actions are always single.
// Vertical drag only starts counting once a zone is entered (tracked from
// the Y position at that moment, and reset whenever the active zone
// changes - shallow<->deep or leaving the swipe range entirely - so
// incidental vertical motion never pre-offsets a fresh zone's selection),
// and touchAction only switches to "none" (blocking the browser's own
// vertical pan) while actively cycling, so the row scrolls normally at
// every other drag stage.
//
// A right side can also be deep-only (`deepRightAction` with no
// `rightAction` - Training's session rows use this for a swipe-right-deep
// archive with no shallow tier at all): the hint previews the deep
// action's own label/color the whole time instead of a generic "✗", but
// releasing before DEEP_SWIPE_THRESHOLD still fires nothing, same as any
// other release that doesn't clear its zone's threshold.
//
// The label packs against the tile's true outer edge (`justify-end` on
// the left hint, `justify-start` on the right) rather than centering in
// the box, so it reads consistently at the boundary regardless of how
// wide the box currently is. Deliberately no directional (◀/▶) or cycle
// (▲/▼) icons live in this static hint box itself - a box that only ever
// snaps between a couple of fixed widths can't track the live drag
// position, so anything pinned to it either shows up too early (before
// the card has actually receded that far) or not at all. A caller that
// wants a live-tracking cue (see Schedule.tsx's List view) renders it as
// part of its own sliding segments instead, which already translate by
// the live `dragX`.
//
// Every option label is "EMOJI text" (e.g. "🏆 Record result",
// "✓ Completed") - splitLabel pulls the emoji out; the hint box itself
// only ever renders the text half, in `font-display` (the same
// Oswald/uppercase treatment as Schedule's own date-grouping headings) -
// no icon glyph alongside it, so a mid-drag glance reads as a plain label
// rather than an icon+text pairing. Every option used anywhere in the app
// carries a text half for exactly this reason; a bare, spaceless label
// would fall back to rendering the (icon-sized) icon glyph instead, since
// there'd be nothing else to show, but nothing currently exercises that
// path.
function splitLabel(label: string): { icon: string; text: string } {
  const spaceIndex = label.indexOf(" ");
  return spaceIndex === -1
    ? { icon: label, text: "" }
    : { icon: label.slice(0, spaceIndex), text: label.slice(spaceIndex + 1) };
}

export function SwipeableRow({
  children,
  onSwipeComplete,
  onSwipeFailed,
  leftOptions,
  deepLeftOptions,
  rightAction,
  deepRightAction,
  disabled,
  disabledMessage = "Only athletes can swipe",
  className,
}: {
  // A plain ReactNode slides as one rigid block (translateX(dragX)) - the
  // original behavior, still used by Schedule's ItemsSection rows. Passing
  // a function instead hands the caller the live dragX so it can give
  // individual segments their own transform - see Schedule's List view
  // tile, where the icon segment stays put during a left swipe and the
  // result segment stays put during a right swipe, rather than the whole
  // tile translating as a unit.
  children: ReactNode | ((dragX: number) => ReactNode);
  onSwipeComplete?: () => void;
  onSwipeFailed?: () => void;
  leftOptions?: { label: string; onTrigger: () => void }[];
  deepLeftOptions?: { label: string; onTrigger: () => void }[];
  rightAction?: { label: string; onTrigger: () => void };
  deepRightAction?: { label: string; onTrigger: () => void };
  disabled?: boolean;
  disabledMessage?: string;
  className?: string;
}) {
  const [dragX, setDragX] = useState(0);
  const [cycleIndex, setCycleIndex] = useState(0);
  const startXRef = useRef<number | null>(null);
  const cycleEntryYRef = useRef<number | null>(null);
  const leftZoneRef = useRef<"shallow" | "deep" | null>(null);
  const draggedRef = useRef(false);
  const pastSwipeRef = useRef(false);
  const pastDeepRef = useRef(false);
  const cycleIndexRef = useRef(0);

  const shallowOptions =
    leftOptions ?? (onSwipeComplete ? [{ label: "✓ Completed", onTrigger: onSwipeComplete }] : []);
  const shallowRight =
    rightAction ?? (onSwipeFailed ? { label: "✗ Failed", onTrigger: onSwipeFailed } : null);
  const hasDeepLeft = !!deepLeftOptions && deepLeftOptions.length > 0;
  const hasDeepRight = !!deepRightAction;
  const customRight = !!rightAction;
  // A deep-right action with no shallow counterpart (e.g. Training's
  // archive-only swipe) still gets previewed - by the deep action's own
  // label/color - throughout the shallow zone, rather than falling back to
  // the generic "✗ Failed" styling that's meaningless without a real
  // shallow action behind it. It never fires early, though: onPointerUp
  // below only ever triggers it once dragX actually clears
  // DEEP_SWIPE_THRESHOLD.
  const rightPreviewsDeep = !shallowRight && hasDeepRight;

  function onPointerDown(e: ReactPointerEvent) {
    startXRef.current = e.clientX;
    cycleEntryYRef.current = null;
    leftZoneRef.current = null;
    draggedRef.current = false;
    pastSwipeRef.current = false;
    pastDeepRef.current = false;
    cycleIndexRef.current = 0;
    setCycleIndex(0);
    (e.target as Element).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: ReactPointerEvent) {
    if (startXRef.current == null) return;
    const delta = e.clientX - startXRef.current;
    if (Math.abs(delta) > 8) draggedRef.current = true;
    const goingLeft = delta < 0;
    const max = disabled
      ? DISABLED_SWIPE_MAX
      : goingLeft
      ? hasDeepLeft
        ? DEEP_HINT_WIDTH
        : shallowOptions.length > 1
        ? CYCLE_HINT_WIDTH
        : Infinity
      : hasDeepRight
      ? DEEP_HINT_WIDTH
      : Infinity;
    const clampedX = Math.max(-max, Math.min(max, delta));
    setDragX(clampedX);

    if (!disabled) {
      const isPastSwipe = Math.abs(clampedX) >= SWIPE_THRESHOLD;
      if (isPastSwipe !== pastSwipeRef.current) {
        pastSwipeRef.current = isPastSwipe;
        if (isPastSwipe) feedbackTick(600);
      }
      const isPastDeep =
        (hasDeepLeft && clampedX <= -DEEP_SWIPE_THRESHOLD) ||
        (hasDeepRight && clampedX >= DEEP_SWIPE_THRESHOLD);
      if (isPastDeep !== pastDeepRef.current) {
        pastDeepRef.current = isPastDeep;
        if (isPastDeep) feedbackTick(350);
      }
    }

    const inDeepLeft = hasDeepLeft && clampedX <= -DEEP_SWIPE_THRESHOLD;
    const activeLeftOptions = inDeepLeft ? deepLeftOptions! : shallowOptions;
    const currentZone: "shallow" | "deep" | null =
      !disabled && clampedX <= -SWIPE_THRESHOLD ? (inDeepLeft ? "deep" : "shallow") : null;

    if (currentZone !== leftZoneRef.current) {
      leftZoneRef.current = currentZone;
      cycleEntryYRef.current = null;
      cycleIndexRef.current = 0;
      setCycleIndex(0);
    }
    if (currentZone && activeLeftOptions.length > 1) {
      if (cycleEntryYRef.current == null) cycleEntryYRef.current = e.clientY;
      const deltaY = e.clientY - cycleEntryYRef.current;
      const step = Math.round(-deltaY / OPTION_CYCLE_DISTANCE);
      const clampedStep = Math.max(0, Math.min(activeLeftOptions.length - 1, step));
      if (clampedStep !== cycleIndexRef.current) {
        cycleIndexRef.current = clampedStep;
        feedbackTick(700 + clampedStep * 60);
      }
      setCycleIndex(clampedStep);
    }
  }

  function onPointerUp() {
    if (startXRef.current == null) return;
    if (!disabled) {
      if (dragX <= -SWIPE_THRESHOLD) {
        const inDeep = hasDeepLeft && dragX <= -DEEP_SWIPE_THRESHOLD;
        const opts = inDeep ? deepLeftOptions! : shallowOptions;
        if (opts[cycleIndex]) {
          feedbackConfirm(opts.length > 1 ? 450 : inDeep ? 450 : 500);
          opts[cycleIndex].onTrigger();
        }
      } else if (dragX >= SWIPE_THRESHOLD) {
        const inDeep = hasDeepRight && dragX >= DEEP_SWIPE_THRESHOLD;
        const action = inDeep ? deepRightAction! : shallowRight;
        if (action) {
          feedbackConfirm(inDeep ? 450 : 400);
          action.onTrigger();
        }
      }
    }
    setDragX(0);
    setCycleIndex(0);
    cycleEntryYRef.current = null;
    leftZoneRef.current = null;
    pastSwipeRef.current = false;
    pastDeepRef.current = false;
    cycleIndexRef.current = 0;
    startXRef.current = null;
  }

  const leftInDeep = hasDeepLeft && dragX <= -DEEP_SWIPE_THRESHOLD;
  const leftActiveOptions = leftInDeep ? deepLeftOptions! : shallowOptions;
  const leftCyclableNow = leftActiveOptions.length > 1;
  const leftHintWidth = disabled
    ? Math.abs(dragX)
    : leftInDeep
    ? DEEP_HINT_WIDTH
    : shallowOptions.length > 1
    ? CYCLE_HINT_WIDTH
    : SWIPE_THRESHOLD;

  const rightInDeep = hasDeepRight && dragX >= DEEP_SWIPE_THRESHOLD;
  const rightActive = rightInDeep ? deepRightAction! : shallowRight ?? (rightPreviewsDeep ? deepRightAction! : null);
  const rightHintWidth = disabled
    ? Math.abs(dragX)
    : rightInDeep
    ? DEEP_HINT_WIDTH
    : customRight || rightPreviewsDeep
    ? CYCLE_HINT_WIDTH
    : SWIPE_THRESHOLD;

  const hintOpacity = disabled
    ? Math.min(1, Math.abs(dragX) / 40)
    : Math.min(1, Math.abs(dragX) / SWIPE_THRESHOLD);

  const { icon: leftIcon, text: leftText } = splitLabel(
    leftActiveOptions[cycleIndex]?.label ?? "✓"
  );
  const { icon: rightIcon, text: rightText } = splitLabel(rightActive?.label ?? "✗");

  return (
    <div className={`relative overflow-hidden rounded-md ${className ?? ""}`}>
      {/* Positioned on the side the slide actually exposes: dragging left
          (dragX<0) slides content left, uncovering the row's right edge, so
          the left-option hint - which fires for dragX<0 - lives at
          right-0 (and vice versa for the right action at left-0). Content
          packs against that same true edge (`justify-end`/`items-end` here,
          mirrored to `justify-start`/`items-start` on the other side)
          rather than centering in the box, so it reads consistently right
          at the tile's boundary regardless of how wide the box is. The
          directional ◀/▶ "keep swiping" cue lives on the caller's own
          sliding segments instead of here (see Schedule.tsx's List view) -
          since those actually track the live drag position, whereas this
          box's width only ever snaps between fixed sizes. The vertical
          ▲/▼ cycle cue has no such problem (it isn't tied to drag
          distance, just which option is selected), so it renders right
          here, flanking the label. */}
      <div
        className={`pointer-events-none absolute inset-y-0 right-0 flex items-center justify-end overflow-hidden whitespace-nowrap px-2.5 text-right text-xs font-medium transition-[width] duration-150 ease-out ${
          disabled
            ? "bg-stone-200 text-stone-600"
            : leftInDeep
            ? "bg-orange-100 text-orange-800"
            : shallowOptions.length > 1
            ? "bg-amber-100 text-amber-800"
            : "bg-green-100 text-green-700"
        }`}
        style={{ opacity: dragX < 0 ? hintOpacity : 0, width: leftHintWidth }}
      >
        {disabled ? (
          disabledMessage
        ) : leftText ? (
          <div className="flex flex-col items-end gap-0.5">
            {leftCyclableNow && (
              <span
                className={`text-2xl font-black leading-none ${
                  cycleIndex > 0 ? "opacity-90" : "opacity-25"
                }`}
              >
                ▲
              </span>
            )}
            <span className="whitespace-nowrap font-display text-sm font-semibold uppercase leading-tight tracking-[0.02em]">
              {leftText}
            </span>
            {leftCyclableNow && (
              <span
                className={`text-2xl font-black leading-none ${
                  cycleIndex < leftActiveOptions.length - 1 ? "opacity-90" : "opacity-25"
                }`}
              >
                ▼
              </span>
            )}
          </div>
        ) : (
          <span className="text-2xl leading-none">{leftIcon}</span>
        )}
      </div>
      <div
        className={`pointer-events-none absolute inset-y-0 left-0 flex items-center justify-start overflow-hidden whitespace-nowrap px-2.5 text-left text-xs font-medium ${
          disabled
            ? "bg-stone-200 text-stone-600"
            : rightInDeep
            ? "bg-indigo-100 text-indigo-800"
            : customRight || rightPreviewsDeep
            ? "bg-blue-100 text-blue-700"
            : "bg-red-100 text-red-700"
        }`}
        style={{ opacity: dragX > 0 ? hintOpacity : 0, width: rightHintWidth }}
      >
        {disabled ? (
          disabledMessage
        ) : rightText ? (
          <span className="whitespace-nowrap font-display text-sm font-semibold uppercase leading-tight tracking-[0.02em]">
            {rightText}
          </span>
        ) : (
          <span className="text-2xl leading-none">{rightIcon}</span>
        )}
      </div>
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClickCapture={(e) => {
          if (draggedRef.current) {
            e.stopPropagation();
            e.preventDefault();
            draggedRef.current = false;
          }
        }}
        style={{
          transform: typeof children === "function" ? undefined : `translateX(${dragX}px)`,
          touchAction: leftCyclableNow && dragX <= -SWIPE_THRESHOLD ? "none" : "pan-y",
          transition: dragX === 0 ? "transform 150ms ease-out" : "none",
        }}
      >
        {typeof children === "function" ? children(dragX) : children}
      </div>
    </div>
  );
}
