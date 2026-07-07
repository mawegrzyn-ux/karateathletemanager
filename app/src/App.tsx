import { NavLink, Outlet, Route, Routes } from "react-router-dom";
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
import RequireAuth from "./components/RequireAuth";
import RequireLogin from "./components/RequireLogin";

const tabs = [
  { to: "/", label: "Schedule", icon: "📅", end: true },
  { to: "/athletes", label: "Athletes", icon: "👥" },
  { to: "/grades", label: "Grades", icon: "🥋" },
  { to: "/more", label: "More", icon: "⚙️" },
];

function Shell() {
  return (
    <div className="flex h-full flex-col">
      <main className="flex-1 overflow-y-auto pb-20">
        <Outlet />
      </main>

      <nav className="fixed inset-x-0 bottom-0 flex border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)]">
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            className={({ isActive }) =>
              `flex min-h-[44px] flex-1 flex-col items-center justify-center gap-0.5 py-2 text-xs ${
                isActive ? "text-red-700" : "text-slate-500"
              }`
            }
          >
            <span className="text-lg leading-none">{tab.icon}</span>
            <span>{tab.label}</span>
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
            <RequireAuth roles={["admin"]}>
              <AdminUsers />
            </RequireAuth>
          }
        />
        <Route
          path="/admin/associations"
          element={
            <RequireAuth roles={["admin"]}>
              <AdminAssociations />
            </RequireAuth>
          }
        />
        <Route
          path="/admin/clubs"
          element={
            <RequireAuth roles={["admin"]}>
              <AdminClubs />
            </RequireAuth>
          }
        />
      </Route>
    </Routes>
  );
}
