import { useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { useProfileSwitching } from "../hooks/useProfileSwitching";
import { Modal } from "./ui";
import { ProfilePicker } from "../pages/Profile";

// Press-and-hold on the bottom nav's Profile tab (App.tsx's Shell) opens
// this instead of navigating - a quick way to switch identities without
// leaving the current page first. Shares useProfileSwitching with
// Profile.tsx's own "Acting as" widget so the two can't drift on what
// counts as "this account actually has more than one profile."
export function ProfileSwitchSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const {
    availableRoles,
    singleRoleMultiProfile,
    handleRoleClick,
    picker,
    setPicker,
    pickerOptions,
    pickerSelectedId,
    selectProfile,
  } = useProfileSwitching();

  // A single role with several profiles under it (e.g. a parent with two
  // linked children) has nothing worth choosing at the role level - jump
  // straight to that role's picker, same as Profile.tsx's own "Switch X
  // profile" button does.
  useEffect(() => {
    if (open && singleRoleMultiProfile && !picker) {
      setPicker(availableRoles[0].role);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, singleRoleMultiProfile]);

  async function chooseRole(role: (typeof availableRoles)[number]["role"]) {
    const result = await handleRoleClick(role);
    if (result === "switched") onClose();
  }

  async function choosePickerProfile(id: number) {
    await selectProfile(id);
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose}>
      <div className="flex flex-col gap-3 p-2">
        {picker ? (
          <>
            <p className="text-sm font-medium text-stone-700">
              Choose {picker} profile
            </p>
            <ProfilePicker
              options={pickerOptions}
              selectedId={pickerSelectedId}
              onSelect={choosePickerProfile}
            />
          </>
        ) : (
          <>
            <p className="text-sm font-medium text-stone-700">Switch profile</p>
            <div className="flex flex-col gap-2">
              {availableRoles.map(({ role, label, name }) => (
                <button
                  key={role}
                  type="button"
                  onClick={() => chooseRole(role)}
                  className={`flex min-h-[44px] items-center justify-between rounded-xl border px-4 py-2 text-left font-medium ${
                    user?.role === role
                      ? "border-red-200 bg-red-50 text-red-700"
                      : "border-stone-200"
                  }`}
                >
                  <span className="flex flex-col">
                    <span>{label}</span>
                    {name && (
                      <span className="text-xs font-normal text-stone-500">{name}</span>
                    )}
                  </span>
                  {user?.role === role && <span className="text-sm">✓ Active</span>}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
