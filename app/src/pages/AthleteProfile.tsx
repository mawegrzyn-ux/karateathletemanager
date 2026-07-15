import { Link, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { AthleteSocialProfile } from "../components/AthleteSocialProfile";

// Read-only entry point for viewing another athlete's social profile -
// reached by tapping an athlete's name on a shared schedule item, or (for
// coach/admin) the "View social profile" link in Athletes.tsx's edit
// drawer. AthleteSocialProfile itself enforces visibility (self, coach,
// admin, or the athlete's own is_public_profile opt-in) and shows a
// "private" message rather than any data if the viewer isn't allowed.
export default function AthleteProfile() {
  const { id } = useParams();
  const { user } = useAuth();
  const athleteId = Number(id);
  const isSelf = user?.role === "athlete" && user.athlete_id === athleteId;

  return (
    <div className="flex min-h-full flex-col gap-4 p-6">
      <div className="rounded-2xl bg-white p-4 shadow-card">
        <AthleteSocialProfile athleteId={athleteId} isSelf={isSelf} />
      </div>
      <Link to="/" className="text-center text-sm font-medium text-red-700">
        Back to app
      </Link>
    </div>
  );
}
