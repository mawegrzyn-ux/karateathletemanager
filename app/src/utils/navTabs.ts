import type { Role } from "../context/AuthContext";

// The catalog of pages that can appear as a bottom-nav tab. "schedule"
// and "more" are mandatory - always present, never removable, since
// Schedule is the app's landing page and More is the only way back into
// this settings page - everything else is opt-in per user (or forced by
// a club onto its athlete members, see resolveNavTabs below).
export interface NavTabDef {
  key: string;
  to: string;
  icon: string;
  label: string;
  end?: boolean;
  available: (ctx: NavRoleContext) => boolean;
}

export interface NavRoleContext {
  role: Role | null;
  is_admin: boolean;
}

export const MANDATORY_NAV_KEYS = ["schedule", "more"];

export const NAV_TAB_REGISTRY: NavTabDef[] = [
  { key: "schedule", to: "/", icon: "📅", label: "Schedule", end: true, available: () => true },
  {
    key: "athletes",
    to: "/athletes",
    icon: "👥",
    label: "Athletes",
    available: (ctx) => ctx.role !== "athlete",
  },
  { key: "grades", to: "/grades", icon: "🥋", label: "Grades", available: () => true },
  { key: "osu", to: "/osu", icon: "🤖", label: "Osu", available: (ctx) => ctx.is_admin },
  {
    key: "clubs",
    to: "/admin/clubs",
    icon: "🏯",
    label: "Clubs",
    available: (ctx) => ctx.is_admin || ctx.role === "coach",
  },
  {
    key: "associations",
    to: "/admin/associations",
    icon: "🌐",
    label: "Associations",
    available: (ctx) => ctx.is_admin || ctx.role === "coach",
  },
  {
    key: "training-modules",
    to: "/admin/training-modules",
    icon: "💪",
    label: "Training",
    available: (ctx) => ctx.is_admin || ctx.role === "coach",
  },
  {
    key: "event-types",
    to: "/admin/event-types",
    icon: "🏷️",
    label: "Sched. types",
    available: (ctx) => ctx.is_admin || ctx.role === "coach",
  },
  { key: "more", to: "/more", icon: "⚙️", label: "More", available: () => true },
];

export function availableNavTabs(ctx: NavRoleContext): NavTabDef[] {
  return NAV_TAB_REGISTRY.filter((t) => t.available(ctx));
}

// Matches the app's previous fixed tab sets exactly, so a user/club with
// no customization yet sees the identical bottom nav as before this
// feature existed.
export function defaultNavTabKeys(ctx: NavRoleContext): string[] {
  const base = ctx.role === "athlete" ? ["schedule", "more"] : ["schedule", "athletes", "more"];
  if (ctx.is_admin) {
    base.splice(base.length - 1, 0, "osu");
  }
  return base;
}

// Resolves a stored key list (personal or club-forced) into renderable
// tab defs: drops keys the role no longer has access to or that don't
// exist, then makes sure the mandatory tabs are present (appending them
// if the stored list predates their introduction or dropped them).
export function resolveNavTabs(
  ctx: NavRoleContext,
  storedKeys: string[] | null | undefined
): NavTabDef[] {
  const available = availableNavTabs(ctx);
  const availableByKey = new Map(available.map((t) => [t.key, t]));
  const keys = storedKeys && storedKeys.length > 0 ? storedKeys : defaultNavTabKeys(ctx);
  const resolved = keys.filter((k) => availableByKey.has(k));
  for (const key of MANDATORY_NAV_KEYS) {
    if (!resolved.includes(key)) {
      if (key === "schedule") resolved.unshift(key);
      else resolved.push(key);
    }
  }
  return resolved.map((k) => availableByKey.get(k)!);
}

export function resolveNavTabKeys(
  ctx: NavRoleContext,
  storedKeys: string[] | null | undefined
): string[] {
  return resolveNavTabs(ctx, storedKeys).map((t) => t.key);
}
