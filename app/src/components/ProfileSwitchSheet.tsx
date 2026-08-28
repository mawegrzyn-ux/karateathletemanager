import { useProfileSwitching } from "../hooks/useProfileSwitching";
import { Modal } from "./ui";

// Press-and-hold/swipe-up on the bottom nav's Profile tab (App.tsx's
// Shell) opens this instead of navigating - a quick way to switch
// identities without leaving the current page first. Shares
// useProfileSwitching with Profile.tsx's own "Acting as" widget so the
// two can't drift on what counts as "this account actually has more
// than one profile" or how each one is labeled.
export function ProfileSwitchSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { switchTargets, chooseTarget } = useProfileSwitching();

  async function choose(target: (typeof switchTargets)[number]) {
    await chooseTarget(target);
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose}>
      <div className="flex flex-col gap-3 p-2">
        <p className="text-sm font-medium text-stone-700">Switch profile</p>
        <div className="flex flex-col gap-2">
          {switchTargets.map((target) => (
            <button
              key={target.key}
              type="button"
              onClick={() => choose(target)}
              className={`flex min-h-[44px] items-center justify-between rounded-xl border px-4 py-2 text-left font-medium ${
                target.active
                  ? "border-red-200 bg-red-50 text-red-700"
                  : "border-stone-200"
              }`}
            >
              <span className="flex flex-col">
                <span>{target.label}</span>
                {target.name && (
                  <span className="text-xs font-normal text-stone-500">
                    {target.name}
                  </span>
                )}
              </span>
              {target.active && <span className="text-sm">✓ Active</span>}
            </button>
          ))}
        </div>
      </div>
    </Modal>
  );
}
