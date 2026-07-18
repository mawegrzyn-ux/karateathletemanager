import {
  useRef,
  useState,
  type ChangeEvent,
  type PropsWithChildren,
} from "react";

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

async function uploadFile(file: File): Promise<string> {
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

export function MediaField({
  label,
  kind,
  value,
  onChange,
  onError,
}: {
  label: string;
  kind: "video" | "image";
  value: string;
  onChange: (url: string) => void;
  onError: (message: string) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      onChange(await uploadFile(file));
    } catch (err) {
      onError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  const youTubeId = kind === "video" ? extractYouTubeId(value) : null;

  return (
    <Field label={label}>
      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          <input
            key={value}
            defaultValue={value}
            onBlur={(e) => onChange(e.target.value)}
            placeholder={
              kind === "video"
                ? "Paste a YouTube or video link"
                : "Paste an image link"
            }
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
            accept={kind === "video" ? "video/*" : "image/*"}
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
        ) : kind === "video" && value ? (
          // eslint-disable-next-line jsx-a11y/media-has-caption
          <video src={value} controls className="w-full rounded-xl" />
        ) : kind === "image" && value ? (
          <img
            src={value}
            alt={`${label} preview`}
            className="max-h-40 w-full rounded-xl object-cover"
          />
        ) : null}
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

export function Drawer({
  open,
  onClose,
  title,
  children,
}: PropsWithChildren<{ open: boolean; onClose: () => void; title: string }>) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white sm:inset-y-0 sm:left-auto sm:right-0 sm:w-[420px] sm:border-l sm:border-stone-200 sm:shadow-xl">
      <div className="flex items-center justify-between border-b border-stone-200 p-4">
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
