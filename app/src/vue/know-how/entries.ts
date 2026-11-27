// The project know-how file (tickets 4234, 4239, epic 4135): one file per project, `.brigade/know-how.md`, that every cook
// reads first and adds to (agents/cook.md). Markdown with three sections, `## Conventions`, `## Pitfalls`, `## Tools`;
// each entry is one line, `- text (#ticket)`. This module reads its entries and rewrites one of them — the text of an
// entry, or the entry removed —, leaving every other line of the file byte for byte. It writes nothing anywhere: the
// caller delivers the new text (the app proposes it by a pull request, know-how-github.ts).

export const KNOW_HOW_FILE = ".brigade/know-how.md";

// An entry: its section (the `## ` heading above it, "" before any heading), its text without the ticket, its source
// ticket (null when the line names none), and `line`, its 0-based index in the file split on "\n".
export type KnowHowEntry = { section: string; text: string; ticket: number | null; line: number };

const HEADING = /^##\s+(.+?)\s*$/;
const ENTRY = /^-\s+(.*?)\s*$/;
const TICKET = /^(.*?)\s*\(#(\d+)\)$/;

const lineOf = (raw: string) => raw.replace(/\r$/, "");

function entryAt(raw: string): { text: string; ticket: number | null } | null {
  const entry = ENTRY.exec(lineOf(raw));
  if (entry === null || entry[1] === undefined || entry[1] === "") return null;
  const ticket = TICKET.exec(entry[1]);
  if (ticket === null || ticket[1] === "") return { text: entry[1], ticket: null };
  return { text: ticket[1] ?? "", ticket: Number(ticket[2]) };
}

export function parseKnowHow(text: string): KnowHowEntry[] {
  let section = "";
  return text.split("\n").flatMap((raw, line) => {
    const heading = HEADING.exec(lineOf(raw));
    if (heading !== null) {
      section = heading[1] ?? "";
      return [];
    }
    const entry = entryAt(raw);
    return entry === null ? [] : [{ section, text: entry.text, ticket: entry.ticket, line }];
  });
}

// The lines of the file, and the entry at `line` — or why there is none: a stale line number never rewrites another line.
function lineToChange(text: string, line: number) {
  const lines = text.split("\n");
  const raw = lines[line];
  const entry = raw === undefined ? null : entryAt(raw);
  if (raw === undefined || entry === null) throw new Error(`line ${line + 1} of ${KNOW_HOW_FILE} is not an entry`);
  return { lines, raw, entry };
}

// The new text of an entry: one line, not empty — an entry holds in one line —, and no ` (#ticket)` of its own at its
// end: the entry keeps its source ticket, and a second one would be read in its place.
export function entryText(saisie: unknown): string {
  const text = typeof saisie === "string" ? saisie.trim() : "";
  if (text === "") throw new Error("an entry needs a text");
  if (/[\r\n]/.test(text)) throw new Error("an entry holds in one line");
  if (entryAt(`- ${text}`)?.ticket != null) throw new Error("an entry's text names no ticket: its source ticket is kept");
  return text;
}

// The file with the entry at `line` rewritten to `newText`: its ` (#ticket)` kept, its line ending kept, every other line
// unchanged. The file's entries stay sorted (.claude/brigade/know-how-ordre.py, #4549): when the new text no longer sits
// between neighbours it sat between, the entry moves to its place in its run of entries, so the gates do not refuse the edit.
export function editEntry(text: string, line: number, newText: string): string {
  const { lines, raw, entry } = lineToChange(text, line);
  const ending = raw.endsWith("\r") ? "\r" : "";
  const written = `- ${entryText(newText)}${entry.ticket === null ? "" : ` (#${entry.ticket})`}${ending}`;
  const was = raw.toLowerCase();
  lines[line] = written;
  const isEntry = (at: number) => lines[at] !== undefined && lines[at]!.startsWith("- ");
  const key = (at: number) => lines[at]!.toLowerCase();
  const before = isEntry(line - 1) && key(line - 1) <= was && key(line - 1) > written.toLowerCase();
  const after = isEntry(line + 1) && key(line + 1) >= was && key(line + 1) < written.toLowerCase();
  if (!before && !after) return lines.join("\n");
  lines.splice(line, 1);
  let first = line;
  while (isEntry(first - 1)) first--;
  let last = line;
  while (isEntry(last)) last++;
  let at = first;
  while (at < last && key(at) <= written.toLowerCase()) at++;
  lines.splice(at, 0, written);
  return lines.join("\n");
}

// The file without the entry at `line`: that one line removed, nothing else.
export function removeEntry(text: string, line: number): string {
  const { lines } = lineToChange(text, line);
  lines.splice(line, 1);
  return lines.join("\n");
}
