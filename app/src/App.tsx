import { NavLink, Outlet, Route, Routes } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import { Avatar } from "./components/ui";
import Schedule from "./pages/Schedule";
import Athletes from "./pages/Athletes";
import Grades from "./pages/Grades";
import More from "./pages/More";
import MenuSettings from "./pages/MenuSettings";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Profile from "./pages/Profile";
import AthleteProfile from "./pages/AthleteProfile";
import AdminUsers from "./pages/admin/Users";
import AdminAssociations from "./pages/admin/Associations";
import AdminClubs from "./pages/admin/Clubs";
import AdminCoaches from "./pages/admin/Coaches";
import AdminReferees from "./pages/admin/Referees";
import AdminTrainingModules from "./pages/admin/TrainingModules";
import AdminKatas from "./pages/admin/Katas";
import AdminKarateStyles from "./pages/admin/KarateStyles";
import AdminTrainingModuleTypes from "./pages/admin/TrainingModuleTypes";
import AdminEventTypes from "./pages/admin/EventTypes";
import AdminVenues from "./pages/admin/Venues";
import AdminCoachRoles from "./pages/admin/CoachRoles";
import AdminAppIcon from "./pages/admin/AppIcon";
import AdminOsuApiKey from "./pages/admin/OsuApiKey";
import AdminBraveApiKey from "./pages/admin/BraveApiKey";
import Osu from "./pages/Osu";
import RequireAuth from "./components/RequireAuth";
import RequireLogin from "./components/RequireLogin";
import { resolveNavTabs } from "./utils/navTabs";

const tabClassName = ({ isActive }: { isActive: boolean }) =>
  `my-2 flex min-h-[44px] w-20 shrink-0 flex-col items-center justify-center gap-0.5 rounded-2xl py-2 text-xs font-medium transition-colors ${
    isActive ? "bg-red-50 text-red-600" : "text-stone-500"
  }`;

const PROFILE_LABELS: Record<string, string> = {
  athlete: "Athlete",
  coach: "Coach",
  parent: "Parent",
  referee: "Referee",
};

function Shell() {
  const { user } = useAuth();
  const tabs = resolveNavTabs(
    { role: user?.role ?? null, is_admin: !!user?.is_admin },
    user?.club_forced_nav_tabs ?? user?.nav_tabs ?? null
  );
  const activeProfileName =
    user?.role === "athlete"
      ? user.athlete_name
      : user?.role === "coach"
        ? user.coach_name
        : user?.role === "referee"
          ? user.referee_name
          : null;
  const profileName =
    activeProfileName ||
    [user?.first_name, user?.last_name].filter(Boolean).join(" ") ||
    user?.email ||
    "";
  const activeProfilePhoto =
    user?.role === "athlete"
      ? user.athlete_photo_url
      : user?.role === "coach"
        ? user.coach_photo_url
        : user?.role === "referee"
          ? user.referee_photo_url
          : null;
  const profilePhoto = activeProfilePhoto || user?.photo_url;
  const profileLabel = (user?.role && PROFILE_LABELS[user.role]) || "Profile";

  return (
    <div className="flex h-full flex-col bg-stone-100">
      <main className="flex-1 overflow-y-auto pb-24">
        <Outlet />
      </main>

      <nav className="fixed inset-x-0 bottom-0 flex shadow-[0_-1px_2px_rgba(28,25,23,0.04),0_-8px_20px_-6px_rgba(28,25,23,0.10)]">
        <NavLink
          to="/profile"
          className={({ isActive }) =>
            `relative flex min-h-[44px] w-24 flex-col items-center justify-center gap-0.5 pb-[env(safe-area-inset-bottom)] pl-2 pr-5 text-xs font-medium transition-colors ${
              profilePhoto
                ? "text-white"
                : isActive
                ? "text-red-600"
                : "text-stone-700"
            }`
          }
        >
          {({ isActive }) => (
            <>
              {/* This `<a>` doesn't establish its own stacking context (no
                  z-index, just position:relative), so its -z children don't
                  stack against *its* background - they escape to the nearest
                  ancestor that does (`<nav>`, which is `fixed` and so always
                  one). Giving a fallback fill to the `<a>` itself would sit
                  in that ancestor's z-index:auto layer, which paints *after*
                  (on top of, i.e. hiding) these escaped negative-z children -
                  so the fallback has to be another escaping negative-z
                  sibling instead, ordered behind the clipped one below by
                  using a more-negative z-index. Matches the tab strip's own
                  `bg-white/95 backdrop-blur` exactly (not the page's plain
                  `bg-stone-100`) so the wedge outside the diagonal cut reads
                  as a continuation of that same bar rather than a
                  differently-shaded patch next to it. */}
              <span className="absolute inset-y-0 left-0 right-0 -z-20 bg-white/95 backdrop-blur" />
              <span
                className="absolute inset-y-0 left-0 right-0 -z-10 bg-red-200 bg-cover bg-center"
                style={{
                  clipPath: "polygon(0 0, 100% 0, 70% 100%, 0 100%)",
                  backgroundImage: profilePhoto ? `url(${profilePhoto})` : undefined,
                }}
              />
              {/* A photo needs a scrim under it so the label stays legible
                  against whatever colors are in the photo - a plain solid
                  fill (like the red-200 fallback) would work for text on
                  its own but photos vary too much to guarantee contrast. */}
              {profilePhoto && (
                <span
                  className="absolute inset-y-0 left-0 right-0 -z-10 bg-gradient-to-t from-stone-900/70 via-stone-900/20 to-transparent"
                  style={{ clipPath: "polygon(0 0, 100% 0, 70% 100%, 0 100%)" }}
                />
              )}
              {!profilePhoto && <Avatar name={profileName} size={22} />}
              <span
                className="font-display uppercase tracking-wide"
                style={profilePhoto ? { textShadow: "0 1px 3px rgba(0,0,0,0.8)" } : undefined}
              >
                {profileLabel}
              </span>
              {profilePhoto && isActive && (
                <span aria-hidden className="h-1 w-6 rounded-full bg-white" />
              )}
            </>
          )}
        </NavLink>
        <div className="flex flex-1 gap-1 overflow-x-auto bg-white/95 px-1 pb-[env(safe-area-inset-bottom)] backdrop-blur">
          {tabs.map((tab) => (
            <NavLink
              key={tab.key}
              to={tab.to}
              end={tab.end}
              className={tabClassName}
            >
              <span className="text-lg leading-none">{tab.icon}</span>
              <span className="font-display uppercase tracking-wide">
                {tab.label}
              </span>
            </NavLink>
          ))}
        </div>
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
        <Route path="/athletes/:id/profile" element={<AthleteProfile />} />
        <Route path="/grades" element={<Grades />} />
        <Route path="/more" element={<More />} />
        <Route path="/menu-settings" element={<MenuSettings />} />
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
          path="/admin/referees"
          element={
            <RequireAuth adminOnly>
              <AdminReferees />
            </RequireAuth>
          }
        />
        <Route
          path="/admin/training-modules"
          element={
            <RequireAuth roles={["coach"]}>
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
          path="/admin/training-module-types"
          element={
            <RequireAuth adminOnly>
              <AdminTrainingModuleTypes />
            </RequireAuth>
          }
        />
        <Route
          path="/admin/event-types"
          element={
            <RequireAuth roles={["coach"]}>
              <AdminEventTypes />
            </RequireAuth>
          }
        />
        <Route
          path="/admin/venues"
          element={
            <RequireAuth adminOnly>
              <AdminVenues />
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
        <Route
          path="/admin/app-icon"
          element={
            <RequireAuth adminOnly>
              <AdminAppIcon />
            </RequireAuth>
          }
        />
        <Route
          path="/osu"
          element={
            <RequireAuth adminOnly>
              <Osu />
            </RequireAuth>
          }
        />
        <Route
          path="/admin/osu-api-key"
          element={
            <RequireAuth adminOnly>
              <AdminOsuApiKey />
            </RequireAuth>
          }
        />
        <Route
          path="/admin/brave-api-key"
          element={
            <RequireAuth adminOnly>
              <AdminBraveApiKey />
            </RequireAuth>
          }
        />
      </Route>
    </Routes>
  );
}
