import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type PropsWithChildren,
} from "react";
import { useApi } from "../hooks/useApi";

export type Role = "admin" | "coach" | "athlete" | "parent" | "referee";
export type Status = "pending" | "active" | "disabled";

export interface User {
  id: number;
  email: string;
  role: Role | null;
  status: Status;
  is_admin: boolean;
  is_parent: boolean;
  athlete_id: number | null;
  coach_id: number | null;
  referee_id: number | null;
  athlete_name: string | null;
  coach_name: string | null;
  referee_name: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  photo_url: string | null;
}

export interface ProfileUpdate {
  first_name?: string;
  last_name?: string;
  phone?: string;
  photo_url?: string;
}

export interface RegisterOptions {
  wants_athlete?: boolean;
  wants_coach?: boolean;
  wants_referee?: boolean;
  requested_club_id?: number | null;
}

export interface Child {
  id: number;
  first_name: string;
  last_name: string;
}

export interface Profile {
  id: number;
  first_name: string;
  last_name: string;
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
    role: "athlete" | "coach" | "parent" | "referee",
    profileId?: number
  ) => Promise<void>;
  linkChild: (pin: string) => Promise<Child>;
  fetchMyProfiles: () => Promise<{
    athletes: Profile[];
    coaches: Profile[];
    referees: Profile[];
  }>;
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
    async (
      role: "athlete" | "coach" | "parent" | "referee",
      profileId?: number
    ) => {
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
      athletes: Profile[];
      coaches: Profile[];
      referees: Profile[];
    }>("/auth/my-profiles");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const linkChild = useCallback(async (pin: string) => {
    const { user, child } = await api.post<{ user: User; child: Child }>(
      "/auth/link-child",
      { pin }
    );
    setUser(user);
    return child;
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
        linkChild,
        fetchMyProfiles,
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
