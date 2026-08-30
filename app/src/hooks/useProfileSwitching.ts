import { useEffect, useState } from "react";
import {
  useAuth,
  type AthleteProfile,
  type Profile as ProfileRecord,
} from "../context/AuthContext";

export type SwitchableRole = "athlete" | "coach" | "referee";

// One switchable identity - the flat list's actual unit. A role with two
// linked profiles (e.g. two athlete registrations under the same
// account, or an athlete profile of your own plus one you guard) produces
// two of these, one per profile, rather than one per role - switching is
// driven by which PROFILE to become, not just which role.
export interface SwitchTarget {
  key: string;
  role: SwitchableRole;
  id: number | null;
  label: string;
  name: string | null;
  active: boolean;
}

const ROLE_ORDER: SwitchableRole[] = ["athlete", "coach", "referee"];
const ROLE_LABELS: Record<SwitchableRole, string> = {
  athlete: "Athlete",
  coach: "Coach",
  referee: "Referee",
};

// Shared by Profile.tsx's own "Acting as" widget and the bottom nav's
// press-and-hold/swipe-up quick switcher (App.tsx) - single source of
// truth for "what can this account switch to" so the two surfaces can't
// drift on that logic. Fetches fetchMyProfiles() automatically whenever
// the account has any linked profile id, same as Profile.tsx always did
// on its own mount - now also happens once at the Shell level (which
// wraps every authenticated page) so the nav's long-press/swipe can know
// canSwitch without a per-gesture fetch.
export function useProfileSwitching() {
  const { user, switchRole, fetchMyProfiles } = useAuth();
  const [profiles, setProfiles] = useState<{
    athletes: AthleteProfile[];
    coaches: ProfileRecord[];
    referees: ProfileRecord[];
  }>({ athletes: [], coaches: [], referees: [] });

  useEffect(() => {
    if (user?.athlete_id || user?.coach_id || user?.referee_id) {
      fetchMyProfiles().then(setProfiles);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.athlete_id, user?.coach_id, user?.referee_id]);

  const profilesByRole: Record<SwitchableRole, ProfileRecord[]> = {
    athlete: profiles.athletes,
    coach: profiles.coaches,
    referee: profiles.referees,
  };

  const activeIdByRole: Record<SwitchableRole, number | null> = {
    athlete: user?.athlete_id ?? null,
    coach: user?.coach_id ?? null,
    referee: user?.referee_id ?? null,
  };

  const hasRole: Record<SwitchableRole, boolean> = {
    athlete: !!user?.athlete_id,
    coach: !!user?.coach_id,
    referee: !!user?.referee_id,
  };

  // Expands each held role into one target per actual linked profile
  // record - a role with a single profile (the common case) still just
  // produces one target, so this collapses to today's behavior whenever
  // there's nothing to flatten. Falls back to one nameless target if the
  // profile list hasn't loaded yet (or came back empty despite the role
  // being held), rather than showing nothing for a role the account
  // genuinely has. An athlete profile linked via guardianship (rather
  // than being the account's own) gets "(Guardian)" appended to its name
  // so the switcher visibly distinguishes the two.
  const switchTargets: SwitchTarget[] = ROLE_ORDER.filter(
    (role) => hasRole[role]
  ).flatMap((role): SwitchTarget[] => {
    const records = profilesByRole[role];
    if (records.length === 0) {
      return [
        {
          key: role,
          role,
          id: activeIdByRole[role],
          label: ROLE_LABELS[role],
          name: null,
          active: user?.role === role,
        },
      ];
    }
    return records.map((r) => ({
      key: `${role}-${r.id}`,
      role,
      id: r.id,
      label: ROLE_LABELS[role],
      name:
        role === "athlete" && (r as AthleteProfile).is_guardian_link
          ? `${r.first_name} ${r.last_name} (Guardian)`
          : `${r.first_name} ${r.last_name}`,
      active: user?.role === role && activeIdByRole[role] === r.id,
    }));
  });

  const canSwitch = switchTargets.length >= 2;

  async function chooseTarget(target: SwitchTarget) {
    await switchRole(target.role, target.id ?? undefined);
  }

  return { switchTargets, canSwitch, chooseTarget };
}
