import type { PropsWithChildren } from "react";
import { Navigate } from "react-router-dom";
import { useAuth, type Role } from "../context/AuthContext";
import { Spinner } from "./ui";
import PendingApproval from "../pages/PendingApproval";

export default function RequireAuth({
  roles,
  children,
}: PropsWithChildren<{ roles?: Role[] }>) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-full items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (user.status !== "active" || !user.role) {
    return <PendingApproval />;
  }

  if (roles && !roles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
