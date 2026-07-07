const MAX_FAILURES = 5;
const LOCKOUT_MS = 5 * 60 * 1000;

const attempts = new Map();

function checkLocked(userId) {
  const entry = attempts.get(userId);
  if (!entry || !entry.lockedUntil) return false;
  if (entry.lockedUntil > Date.now()) return true;
  attempts.delete(userId);
  return false;
}

function recordFailure(userId) {
  const entry = attempts.get(userId) ?? { failures: 0, lockedUntil: null };
  entry.failures += 1;
  if (entry.failures >= MAX_FAILURES) {
    entry.lockedUntil = Date.now() + LOCKOUT_MS;
    entry.failures = 0;
  }
  attempts.set(userId, entry);
}

function reset(userId) {
  attempts.delete(userId);
}

module.exports = { checkLocked, recordFailure, reset };
