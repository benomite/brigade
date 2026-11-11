// The chef's view of the waiting list (#3271): the total, then one line per signup (date and email), oldest first.
// Usage: node scripts/waitlist/report.mjs /path/waitlist.sqlite
import { pathToFileURL } from "node:url";
import { existsSync } from "node:fs";
import { openStore } from "./store.mjs";

export function report(file) {
  const store = openStore(file);
  try {
    const { count, signups } = store.list();
    return [`${count} signup${count === 1 ? "" : "s"}`, ...signups.map((s) => `${s.signedUpAt}  ${s.email}`)].join("\n");
  } finally { store.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const file = process.argv[2];
  // Without this check, opening a mistyped path would create an empty list and report "0 signups".
  if (!file || !existsSync(file)) { console.error("Usage: node scripts/waitlist/report.mjs <path of the SQLite file> (it must exist)"); process.exit(1); }
  console.log(report(file));
}
