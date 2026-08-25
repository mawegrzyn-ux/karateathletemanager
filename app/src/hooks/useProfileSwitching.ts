import { useEffect, useState } from "react";
import { useAuth, type Profile as ProfileRecord } from "../context/AuthContext";

export type SwitchableRole = "athlete" | "coach" | "parent" | "referee";

// Shared by Profile.tsx's own "Acting as" widget and the bottom nav's
// press-and-hold quick switcher (App.tsx) - single source of truth for
// "does this account actually have more than one profile to switch
// between" so the two surfaces can't drift on that logic. Fetches
// fetchMyProfiles() automatically whenever the account has any linked
// profile id, same as Profile.tsx always did on its own mount - now also
// happens once at the Shell level (which wraps every authenticated page)
// so the nav's long-press can know canSwitch without a per-press fetch.
export function useProfileSwitching() {
  const { user, switchRole, fetchMyProfiles } = useAuth();
  const [profiles, setProfiles] = useState<{
    athletes: ProfileRecord[];
    coaches: ProfileRecord[];
    referees: ProfileRecord[];
  }>({ athletes: [], coaches: [], referees: [] });
  const [picker, setPicker] = useState<SwitchableRole | null>(null);

  useEffect(() => {
    if (user?.athlete_id || user?.coach_id || user?.referee_id) {
      fetchMyProfiles().then(setProfiles);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.athlete_id, user?.coach_id, user?.referee_id]);

  const availableRoles = (
    [
      { role: "athlete" as const, label: "Athlete", has: !!user?.athlete_id },
      { role: "coach" as const, label: "Coach", has: !!user?.coach_id },
      { role: "referee" as const, label: "Referee", has: !!user?.referee_id },
      { role: "parent" as const, label: "Parent", has: !!user?.is_parent },
    ]
  ).filter((r) => r.has);

  const profilesByRole: Record<SwitchableRole, ProfileRecord[]> = {
    athlete: profiles.athletes,
    coach: profiles.coaches,
    referee: profiles.referees,
    parent: [],
  };

  const singleRoleMultiProfile =
    availableRoles.length === 1 &&
    profilesByRole[availableRoles[0].role].length > 1;

  const canSwitch = availableRoles.length >= 2 || singleRoleMultiProfile;

  // Returns which of the two things happened, since a caller that wants
  // to close its own UI afterward (the nav's quick-switch sheet) only
  // should when a switch actually completed - opening the same-role
  // picker still has a choice left to make.
  async function handleRoleClick(
    role: SwitchableRole
  ): Promise<"switched" | "picker-opened"> {
    if (profilesByRole[role].length > 1) {
      setPicker(role);
      return "picker-opened";
    }
    await switchRole(role);
    return "switched";
  }

  const pickerOptions = picker ? profilesByRole[picker] : [];
  const pickerSelectedId =
    picker === "athlete"
      ? user?.athlete_id ?? null
      : picker === "coach"
        ? user?.coach_id ?? null
        : picker === "referee"
          ? user?.referee_id ?? null
          : null;

  async function selectProfile(id: number) {
    if (picker) await switchRole(picker, id);
    setPicker(null);
  }

  return {
    availableRoles,
    singleRoleMultiProfile,
    canSwitch,
    handleRoleClick,
    picker,
    setPicker,
    pickerOptions,
    pickerSelectedId,
    selectProfile,
  };
}
