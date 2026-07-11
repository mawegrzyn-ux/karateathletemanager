import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useAuth, type Child, type Profile as ProfileRecord } from "../context/AuthContext";
import { ApiError, useApi } from "../hooks/useApi";
import { Field, Drawer } from "../components/ui";

export default function Profile() {
  const { user, updateProfile, switchRole, fetchMyProfiles } = useAuth();
  const [firstName, setFirstName] = useState(user?.first_name ?? "");
  const [lastName, setLastName] = useState(user?.last_name ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [profiles, setProfiles] = useState<{
    athletes: ProfileRecord[];
    coaches: ProfileRecord[];
  }>({ athletes: [], coaches: [] });
  const [picker, setPicker] = useState<"athlete" | "coach" | null>(null);

  const showActiveNav = user?.status === "active" && user.role;

  useEffect(() => {
    if (user?.athlete_id || user?.coach_id) {
      fetchMyProfiles().then(setProfiles);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.athlete_id, user?.coach_id]);

  const availableRoles = (
    [
      { role: "athlete" as const, label: "Athlete", has: !!user?.athlete_id },
      { role: "coach" as const, label: "Coach", has: !!user?.coach_id },
      { role: "parent" as const, label: "Parent", has: !!user?.is_parent },
    ]
  ).filter((r) => r.has);

  const singleRoleMultiProfile =
    availableRoles.length === 1 &&
    ((availableRoles[0].role === "athlete" && profiles.athletes.length > 1) ||
      (availableRoles[0].role === "coach" && profiles.coaches.length > 1));

  async function handleRoleClick(role: "athlete" | "coach" | "parent") {
    if (role === "athlete" && profiles.athletes.length > 1) {
      setPicker("athlete");
      return;
    }
    if (role === "coach" && profiles.coaches.length > 1) {
      setPicker("coach");
      return;
    }
    await switchRole(role);
  }

  const pickerOptions =
    picker === "athlete"
      ? profiles.athletes
      : picker === "coach"
        ? profiles.coaches
        : [];
  const pickerSelectedId =
    picker === "athlete" ? user?.athlete_id : user?.coach_id;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    setSubmitting(true);
    try {
      await updateProfile({
        first_name: firstName,
        last_name: lastName,
        phone,
      });
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-full flex-col justify-center gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">My profile</h1>
        <p className="text-sm text-stone-600">{user?.email}</p>
      </div>

      {(availableRoles.length >= 2 || singleRoleMultiProfile) && (
        <div className="flex flex-col gap-2 rounded-2xl bg-white p-3 shadow-card">
          <span className="text-sm font-medium text-stone-700">Acting as</span>
          {availableRoles.length >= 2 ? (
            <div className="flex gap-1 rounded-full bg-stone-100 p-1">
              {availableRoles.map(({ role, label }) => (
                <button
                  key={role}
                  onClick={() => handleRoleClick(role)}
                  className={`min-h-[40px] flex-1 rounded-full px-3 text-sm font-medium transition-colors ${
                    user?.role === role
                      ? "bg-red-600 text-white shadow-sm"
                      : "text-stone-600"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          ) : (
            <button
              type="button"
              onClick={() =>
                setPicker(availableRoles[0].role as "athlete" | "coach")
              }
              className="min-h-[44px] rounded-full border border-stone-300 px-4 text-sm font-medium text-stone-700"
            >
              Switch {availableRoles[0].label.toLowerCase()} profile
            </button>
          )}
        </div>
      )}

      <Drawer
        open={picker !== null}
        onClose={() => setPicker(null)}
        title={`Choose ${picker ?? ""} profile`}
      >
        <ProfilePicker
          options={pickerOptions}
          selectedId={pickerSelectedId ?? null}
          onSelect={async (id) => {
            if (picker) await switchRole(picker, id);
            setPicker(null);
          }}
        />
      </Drawer>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Field label="First name">
          <input
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            className="min-h-[44px] rounded-xl border border-stone-300 px-3"
          />
        </Field>
        <Field label="Last name">
          <input
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            className="min-h-[44px] rounded-xl border border-stone-300 px-3"
          />
        </Field>
        <Field label="Phone number">
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="min-h-[44px] rounded-xl border border-stone-300 px-3"
          />
        </Field>
        {error && <p className="text-sm text-red-700">{error}</p>}
        {saved && <p className="text-sm text-green-700">Saved.</p>}
        <button
          type="submit"
          disabled={submitting}
          className="min-h-[44px] rounded-full bg-red-600 font-medium text-white disabled:opacity-50"
        >
          Save
        </button>
      </form>

      <LinkChild />

      {showActiveNav && (
        <Link to="/" className="text-center text-sm font-medium text-red-700">
          Back to app
        </Link>
      )}
    </div>
  );
}

function ProfilePicker({
  options,
  selectedId,
  onSelect,
}: {
  options: ProfileRecord[];
  selectedId: number | null;
  onSelect: (id: number) => void;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const results = options.filter((o) =>
    `${o.first_name} ${o.last_name}`.toLowerCase().includes(q)
  );

  return (
    <div className="flex flex-col gap-2">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search profiles..."
        className="min-h-[44px] rounded-xl border border-stone-300 px-3"
      />
      <div className="flex flex-col gap-1 overflow-y-auto">
        {results.map((o) => {
          const selected = selectedId === o.id;
          return (
            <button
              key={o.id}
              onClick={() => onSelect(o.id)}
              className={`flex min-h-[44px] items-center justify-between rounded-xl border px-3 text-left ${
                selected
                  ? "border-green-200 bg-green-50 text-green-800"
                  : "border-stone-200"
              }`}
            >
              <span>
                {o.first_name} {o.last_name}
              </span>
              <span className="text-sm">
                {selected ? "✓ Selected" : "Select"}
              </span>
            </button>
          );
        })}
        {results.length === 0 && (
          <p className="px-1 py-2 text-sm text-stone-500">No matches.</p>
        )}
      </div>
    </div>
  );
}

function LinkChild() {
  const api = useApi();
  const { linkChild } = useAuth();
  const [children, setChildren] = useState<Child[] | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<Child | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api
      .get<{ children: Child[] }>("/auth/my-children")
      .then((res) => setChildren(res.children))
      .catch(() => setChildren([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setConfirmed(null);
    setSubmitting(true);
    try {
      const child = await linkChild(pin);
      setConfirmed(child);
      setChildren((prev) => (prev ? [...prev, child] : [child]));
      setPin("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-card">
      <h2 className="font-semibold">Link a child</h2>
      <p className="text-sm text-stone-600">
        Ask your child (or their coach) for the 6-digit code from their
        athlete profile, then enter it here.
      </p>

      {children && children.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium text-stone-700">
            Your children
          </span>
          {children.map((c) => (
            <span key={c.id} className="text-sm text-stone-600">
              {c.first_name} {c.last_name}
            </span>
          ))}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
          inputMode="numeric"
          maxLength={6}
          placeholder="123456"
          className="min-h-[44px] flex-1 rounded-xl border border-stone-300 px-3 tracking-widest"
        />
        <button
          type="submit"
          disabled={submitting || pin.length !== 6}
          className="min-h-[44px] rounded-full bg-red-600 px-4 font-medium text-white disabled:opacity-50"
        >
          Link
        </button>
      </form>
      {error && <p className="text-sm text-red-700">{error}</p>}
      {confirmed && (
        <p className="text-sm text-green-700">
          Linked to {confirmed.first_name} {confirmed.last_name}.
        </p>
      )}
    </div>
  );
}
