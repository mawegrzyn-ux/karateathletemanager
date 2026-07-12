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
};

export function BeltSwatch({ color }: { color: string }) {
  return (
    <span
      className="inline-block h-3.5 w-3.5 shrink-0 rounded-full border border-stone-300"
      style={{ backgroundColor: BELT_COLOR_HEX[color] ?? "#d6d3d1" }}
      title={`${color} belt`}
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
}: {
  onClick: () => void;
  itemLabel?: string;
  label?: string;
}) {
  const [confirming, setConfirming] = useState(false);

  return (
    <>
      <button
        onClick={() => setConfirming(true)}
        aria-label={label}
        className="flex min-h-[44px] items-center gap-2 rounded-xl border border-red-200 px-4 text-red-700"
      >
        🗑 {label}
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
