import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function PendingApproval() {
  const { user, logout } = useAuth();

  const message =
    user?.status === "disabled"
      ? "Your account has been disabled. Contact a coach or admin for help."
      : "Your account is waiting for admin approval. You'll get full access once a coach or admin assigns your role.";

  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-bold tracking-tight">Almost there</h1>
      <p className="text-stone-600">{message}</p>
      <p className="text-sm text-stone-500">
        While you wait, add your name and phone number so a coach knows who's
        asking for access.
      </p>
      <Link
        to="/profile"
        className="min-h-[44px] rounded-full border border-stone-300 px-4 py-2 font-medium text-stone-700"
      >
        Complete your profile
      </Link>
      <button
        onClick={() => logout()}
        className="min-h-[44px] rounded-full border border-stone-300 px-4 font-medium text-stone-700"
      >
        Log out
      </button>
    </div>
  );
}
