import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type PropsWithChildren,
} from "react";
import { useApi } from "../hooks/useApi";

export type Role = "admin" | "coach" | "athlete" | "referee";
export type Status = "pending" | "active" | "disabled";

export interface User {
  id: number;
  email: string;
  role: Role | null;
  status: Status;
  is_admin: boolean;
  athlete_id: number | null;
  coach_id: number | null;
  referee_id: number | null;
  athlete_name: string | null;
  coach_name: string | null;
  referee_name: string | null;
  athlete_photo_url: string | null;
  coach_photo_url: string | null;
  referee_photo_url: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  photo_url: string | null;
  date_of_birth: string | null;
  wants_athlete: boolean;
  nav_tabs: string[] | null;
  club_forced_nav_tabs: string[] | null;
}

export interface ProfileUpdate {
  first_name?: string;
  last_name?: string;
  phone?: string;
  photo_url?: string;
  date_of_birth?: string;
}

export interface RegisterOptions {
  wants_athlete?: boolean;
  wants_coach?: boolean;
  wants_referee?: boolean;
  requested_club_id?: number | null;
  invite_token?: string;
  guardian_invite_token?: string;
}

export interface GuardianAthlete {
  id: number;
  first_name: string;
  last_name: string;
}

export interface Profile {
  id: number;
  first_name: string;
  last_name: string;
}

export interface AthleteProfile extends Profile {
  is_guardian_link: boolean;
}

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (
    email: string,
    password: string,
    options?: RegisterOptions
  ) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (update: ProfileUpdate) => Promise<void>;
  switchRole: (
    role: "athlete" | "coach" | "referee",
    profileId?: number
  ) => Promise<void>;
  linkGuardian: (token: string) => Promise<GuardianAthlete>;
  fetchMyProfiles: () => Promise<{
    athletes: AthleteProfile[];
    coaches: Profile[];
    referees: Profile[];
  }>;
  updateNavTabs: (navTabs: string[] | null) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: PropsWithChildren) {
  const api = useApi();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const { user } = await api.get<{ user: User | null }>("/auth/me");
      setUser(user);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const login = useCallback(async (email: string, password: string) => {
    const { user } = await api.post<{ user: User }>("/auth/login", {
      email,
      password,
    });
    setUser(user);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const register = useCallback(
    async (email: string, password: string, options?: RegisterOptions) => {
      const { user } = await api.post<{ user: User }>("/auth/register", {
        email,
        password,
        ...options,
      });
      setUser(user);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const logout = useCallback(async () => {
    await api.post("/auth/logout", {});
    setUser(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateProfile = useCallback(async (update: ProfileUpdate) => {
    const { user } = await api.patch<{ user: User }>("/auth/me", update);
    setUser(user);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const switchRole = useCallback(
    async (role: "athlete" | "coach" | "referee", profileId?: number) => {
      const { user } = await api.post<{ user: User }>("/auth/switch-role", {
        role,
        profile_id: profileId,
      });
      setUser(user);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const fetchMyProfiles = useCallback(async () => {
    return api.get<{
      athletes: AthleteProfile[];
      coaches: Profile[];
      referees: Profile[];
    }>("/auth/my-profiles");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const linkGuardian = useCallback(async (token: string) => {
    const { athlete } = await api.post<{ athlete: GuardianAthlete }>(
      "/auth/link-guardian",
      { token }
    );
    return athlete;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateNavTabs = useCallback(async (navTabs: string[] | null) => {
    const { user } = await api.patch<{ user: User }>("/auth/me/nav-tabs", {
      nav_tabs: navTabs,
    });
    setUser(user);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        register,
        logout,
        updateProfile,
        switchRole,
        linkGuardian,
        fetchMyProfiles,
        updateNavTabs,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
