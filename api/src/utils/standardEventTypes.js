// The standard schedule types every club starts with (is_standard = true,
// protected from deletion but still restylable) - kept in sync by hand
// with the one-time historical seed in scripts/migrate.js, which seeds
// every *existing* club; this list is what seeds a *newly created* club
// going forward (see clubs.js's POST /).
const STANDARD_EVENT_TYPES = [
  { key: "competition", label: "Competition", icon: "🏆", bg_color: "#b91c1c" },
  { key: "squad_session", label: "Squad session", icon: "👥", bg_color: "#2563eb" },
  { key: "training", label: "Training", icon: "💪", bg_color: "#ea580c" },
  { key: "travel", label: "Travel", icon: "✈️", bg_color: "#0891b2" },
  { key: "time_off", label: "Time off", icon: "🌴", bg_color: "#16a34a" },
  { key: "seminar", label: "Seminar", icon: "🎓", bg_color: "#7c3aed" },
  { key: "training_camp", label: "Training camp", icon: "⛺", bg_color: "#a16207" },
  { key: "grading", label: "Grading", icon: "🎖️", bg_color: "#b45309" },
  { key: "rest", label: "Rest", icon: "😴", bg_color: "#64748b" },
  { key: "other", label: "Other", icon: "📌", bg_color: "#78716c" },
  { key: "kata_performance", label: "Kata performance", icon: "🥋", bg_color: "#be185d" },
];

async function seedStandardEventTypes(pool, clubId) {
  for (const t of STANDARD_EVENT_TYPES) {
    await pool.query(
      `INSERT INTO nk_event_types (club_id, key, label, icon, bg_color, is_standard)
       VALUES ($1, $2, $3, $4, $5, true)
       ON CONFLICT (club_id, key) DO NOTHING`,
      [clubId, t.key, t.label, t.icon, t.bg_color]
    );
  }
}

module.exports = { STANDARD_EVENT_TYPES, seedStandardEventTypes };
