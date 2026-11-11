// The waiting list for cloud stations (#3271): one SQLite file (node:sqlite, no dependency) holding only the email and the signup timestamp.
import { DatabaseSync } from "node:sqlite";

// One "@", no space, a dot in the domain, 254 characters at most.
const EMAIL = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

// The email as it is stored (trimmed, lower case), or null when it is empty or malformed.
export function cleanEmail(raw) {
  if (typeof raw !== "string") return null;
  const email = raw.trim().toLowerCase();
  return email.length <= 254 && EMAIL.test(email) ? email : null;
}

export function openStore(file) {
  const db = new DatabaseSync(file);
  db.exec("CREATE TABLE IF NOT EXISTS signups (email TEXT PRIMARY KEY, signed_up_at TEXT NOT NULL) STRICT");
  return {
    // True when the email is valid (new or already there: a second signup changes nothing), false when it is not.
    add(raw, now = new Date()) {
      const email = cleanEmail(raw);
      if (!email) return false;
      db.prepare("INSERT OR IGNORE INTO signups (email, signed_up_at) VALUES (?, ?)").run(email, now.toISOString());
      return true;
    },
    // The chef's view: the total and every signup, oldest first.
    list() {
      const rows = db.prepare("SELECT email, signed_up_at AS signedUpAt FROM signups ORDER BY signed_up_at, email").all();
      return { count: rows.length, signups: rows.map((r) => ({ email: r.email, signedUpAt: r.signedUpAt })) };
    },
    close() { db.close(); },
  };
}
