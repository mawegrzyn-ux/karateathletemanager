import { NavLink, Outlet, Route, Routes } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import { Avatar } from "./components/ui";
import Schedule from "./pages/Schedule";
import Athletes from "./pages/Athletes";
import Grades from "./pages/Grades";
import More from "./pages/More";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Profile from "./pages/Profile";
import AdminUsers from "./pages/admin/Users";
import AdminAssociations from "./pages/admin/Associations";
import AdminClubs from "./pages/admin/Clubs";
import AdminCoaches from "./pages/admin/Coaches";
import AdminTrainingModules from "./pages/admin/TrainingModules";
import AdminKatas from "./pages/admin/Katas";
import AdminKarateStyles from "./pages/admin/KarateStyles";
import AdminCoachRoles from "./pages/admin/CoachRoles";
import RequireAuth from "./components/RequireAuth";
import RequireLogin from "./components/RequireLogin";

const ATHLETE_TABS = [
  { to: "/", label: "Schedule", icon: "📅", end: true },
  { to: "/admin/training-modules", label: "Training", icon: "💪" },
  { to: "/more", label: "More", icon: "⚙️" },
];

const DEFAULT_TABS = [
  { to: "/", label: "Schedule", icon: "📅", end: true },
  { to: "/athletes", label: "Athletes", icon: "👥" },
  { to: "/more", label: "More", icon: "⚙️" },
];

const tabClassName = ({ isActive }: { isActive: boolean }) =>
  `my-2 flex min-h-[44px] flex-1 flex-col items-center justify-center gap-0.5 rounded-2xl py-2 text-xs font-medium transition-colors ${
    isActive ? "bg-red-50 text-red-600" : "text-stone-500"
  }`;

function Shell() {
  const { user } = useAuth();
  const tabs = user?.role === "athlete" ? ATHLETE_TABS : DEFAULT_TABS;
  const activeProfileName =
    user?.role === "athlete"
      ? user.athlete_name
      : user?.role === "coach"
        ? user.coach_name
        : null;
  const profileName =
    activeProfileName ||
    [user?.first_name, user?.last_name].filter(Boolean).join(" ") ||
    user?.email ||
    "";

  return (
    <div className="flex h-full flex-col bg-stone-100">
      {activeProfileName && (
        <div className="bg-red-600 px-4 py-1.5 text-center text-xs font-medium uppercase tracking-wide text-white">
          Viewing as {activeProfileName} (
          {user?.role === "athlete" ? "Athlete" : "Coach"})
        </div>
      )}
      <main className="flex-1 overflow-y-auto pb-24">
        <Outlet />
      </main>

      <nav className="fixed inset-x-0 bottom-0 flex justify-around bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-1px_2px_rgba(28,25,23,0.04),0_-8px_20px_-6px_rgba(28,25,23,0.10)] backdrop-blur">
        <NavLink to="/profile" className={tabClassName}>
          <Avatar name={profileName} size={22} />
          <span className="font-display uppercase tracking-wide">Profile</span>
        </NavLink>
        {tabs.map((tab) => (
          <NavLink key={tab.to} to={tab.to} end={tab.end} className={tabClassName}>
            <span className="text-lg leading-none">{tab.icon}</span>
            <span className="font-display uppercase tracking-wide">{tab.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route
        path="/profile"
        element={
          <RequireLogin>
            <Profile />
          </RequireLogin>
        }
      />

      <Route
        element={
          <RequireAuth>
            <Shell />
          </RequireAuth>
        }
      >
        <Route path="/" element={<Schedule />} />
        <Route path="/athletes" element={<Athletes />} />
        <Route path="/grades" element={<Grades />} />
        <Route path="/more" element={<More />} />
        <Route
          path="/admin/users"
          element={
            <RequireAuth adminOnly>
              <AdminUsers />
            </RequireAuth>
          }
        />
        <Route
          path="/admin/associations"
          element={
            <RequireAuth roles={["coach"]}>
              <AdminAssociations />
            </RequireAuth>
          }
        />
        <Route
          path="/admin/clubs"
          element={
            <RequireAuth roles={["coach"]}>
              <AdminClubs />
            </RequireAuth>
          }
        />
        <Route
          path="/admin/coaches"
          element={
            <RequireAuth adminOnly>
              <AdminCoaches />
            </RequireAuth>
          }
        />
        <Route
          path="/admin/training-modules"
          element={
            <RequireAuth roles={["coach", "athlete"]}>
              <AdminTrainingModules />
            </RequireAuth>
          }
        />
        <Route
          path="/admin/katas"
          element={
            <RequireAuth adminOnly>
              <AdminKatas />
            </RequireAuth>
          }
        />
        <Route
          path="/admin/karate-styles"
          element={
            <RequireAuth adminOnly>
              <AdminKarateStyles />
            </RequireAuth>
          }
        />
        <Route
          path="/admin/coach-roles"
          element={
            <RequireAuth adminOnly>
              <AdminCoachRoles />
            </RequireAuth>
          }
        />
      </Route>
    </Routes>
  );
}
