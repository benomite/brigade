// The project know-how file (#4234, #4239, epic #4135): one file per project, `.brigade/know-how.md`, that every cook
// reads first and adds to (agents/cook.md). Markdown with three sections, `## Conventions`, `## Pitfalls`, `## Tools`;
// each entry is one line, `- text (#ticket)`. This module reads its entries and rewrites one of them — the text of an
// entry, or the entry removed —, leaving every other line of the file byte for byte. It writes nothing anywhere: the
// caller delivers the new text (the app proposes it by a pull request, app/src/vue/know-how/know-how-github.ts).

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

// The new text of an entry: one line, not empty — an entry holds in one line.
export function entryText(saisie: unknown): string {
  const text = typeof saisie === "string" ? saisie.trim() : "";
  if (text === "") throw new Error("an entry needs a text");
  if (/[\r\n]/.test(text)) throw new Error("an entry holds in one line");
  return text;
}

// The file with the entry at `line` rewritten to `newText`: its ` (#ticket)` kept, its line ending kept, every other line
// unchanged.
export function editEntry(text: string, line: number, newText: string): string {
  const { lines, raw, entry } = lineToChange(text, line);
  const ending = raw.endsWith("\r") ? "\r" : "";
  lines[line] = `- ${entryText(newText)}${entry.ticket === null ? "" : ` (#${entry.ticket})`}${ending}`;
  return lines.join("\n");
}

// The file without the entry at `line`: that one line removed, nothing else.
export function removeEntry(text: string, line: number): string {
  const { lines } = lineToChange(text, line);
  lines.splice(line, 1);
  return lines.join("\n");
}
