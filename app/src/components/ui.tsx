import { useState, type PropsWithChildren } from "react";

export function Spinner() {
  return (
    <div
      className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600"
      role="status"
      aria-label="Loading"
    />
  );
}

export function Badge({ children }: PropsWithChildren) {
  return (
    <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">
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
      <span className="text-sm font-medium text-slate-700">{label}</span>
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
          className="mb-2 min-h-[44px] min-w-[44px] text-slate-500"
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
    <div className="fixed inset-0 z-50 flex flex-col bg-white sm:inset-y-0 sm:left-auto sm:right-0 sm:w-[420px] sm:border-l sm:border-slate-200 sm:shadow-xl">
      <div className="flex items-center justify-between border-b border-slate-200 p-4">
        <h2 className="text-lg font-semibold">{title}</h2>
        <button
          onClick={onClose}
          aria-label="Close"
          className="flex min-h-[44px] min-w-[44px] items-center justify-center text-slate-500"
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
      className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg bg-red-700 text-xl leading-none text-white"
    >
      +
    </button>
  );
}

export function DeleteButton({
  onClick,
  itemLabel,
}: {
  onClick: () => void;
  itemLabel?: string;
}) {
  const [confirming, setConfirming] = useState(false);

  return (
    <>
      <button
        onClick={() => setConfirming(true)}
        aria-label="Delete"
        className="flex min-h-[44px] items-center gap-2 rounded-lg border border-red-200 px-4 text-red-700"
      >
        🗑 Delete
      </button>
      <Modal open={confirming} onClose={() => setConfirming(false)}>
        <div className="flex flex-col gap-4 p-2">
          <p className="text-slate-700">
            Delete {itemLabel ?? "this"}? This can't be undone.
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setConfirming(false)}
              className="min-h-[44px] flex-1 rounded-lg border border-slate-300 font-medium"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                setConfirming(false);
                onClick();
              }}
              className="min-h-[44px] flex-1 rounded-lg bg-red-700 font-medium text-white"
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
    <div className="fixed bottom-20 left-1/2 z-50 -translate-x-1/2 rounded-full bg-slate-900 px-4 py-2 text-sm text-white shadow-lg">
      {message}
    </div>
  );
}
