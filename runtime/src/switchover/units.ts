// What the switchover reads of the old installation's systemd units: a unit
// and its drop-ins, as systemd reads them, reduced to what carries over — the
// service's environment, and the names of the other settings, so they can be
// reported. Nothing in them is evaluated by a shell.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type Directive = { section: string; key: string; value: string };

// The directives of a unit file, in order. A line ending in `\` continues on
// the next; `#` and `;` open a line comment.
export function readDirectives(text: string): Directive[] {
  const directives: Directive[] = [];
  let section = "";
  let continuation = "";
  for (const raw of text.split("\n")) {
    const line = continuation + raw.trim();
    continuation = "";
    if (line.endsWith("\\")) {
      continuation = `${line.slice(0, -1)} `;
      continue;
    }
    if (line === "" || line.startsWith("#") || line.startsWith(";")) continue;
    const header = /^\[(.+)\]$/.exec(line);
    if (header) {
      section = header[1] ?? "";
      continue;
    }
    const equals = line.indexOf("=");
    if (equals <= 0) continue;
    directives.push({ section, key: line.slice(0, equals).trim(), value: line.slice(equals + 1).trim() });
  }
  return directives;
}

// The assignments of an `Environment=` value: separated by blanks, quoted
// (single or double) when they contain any, `\` before what is escaped.
export function assignments(value: string): string[] {
  const words: string[] = [];
  let word = "";
  let open = false;
  let quote: string | null = null;
  const ESCAPED: Record<string, string> = { n: "\n", t: "\t", "\\": "\\", '"': '"', "'": "'", " ": " " };
  for (let i = 0; i < value.length; i++) {
    const c = value[i] ?? "";
    if (c === "\\" && i + 1 < value.length) {
      const next = value[++i] ?? "";
      word += ESCAPED[next] ?? next;
      open = true;
    } else if (quote !== null) {
      if (c === quote) quote = null;
      else word += c;
    } else if (c === '"' || c === "'") {
      quote = c;
      open = true;
    } else if (/\s/.test(c)) {
      if (open) words.push(word);
      word = "";
      open = false;
    } else {
      word += c;
      open = true;
    }
  }
  if (open) words.push(word);
  return words;
}

// The environment that directives declare, in their order: an assignment
// replaces the previous one, an empty `Environment=` clears everything.
export function environmentOf(directives: Directive[]): Map<string, string> {
  const env = new Map<string, string>();
  for (const { section, key, value } of directives) {
    if (section !== "Service" || key !== "Environment") continue;
    if (value === "") {
      env.clear();
      continue;
    }
    for (const assignment of assignments(value)) {
      const equals = assignment.indexOf("=");
      if (equals > 0) env.set(assignment.slice(0, equals), assignment.slice(equals + 1));
    }
  }
  return env;
}

// The files of a template instance, in the order systemd reads them: the
// template, then the drop-ins of the template and of the instance sorted by
// name — the instance's masks the template's that has the same name.
export function instanceFiles(units: string, template: string, instance: string): { template: string; dropIns: string[] } {
  const byName = new Map<string, string>();
  for (const directory of [join(units, `${template}.d`), join(units, `${instance}.d`)]) {
    if (!existsSync(directory)) continue;
    for (const name of readdirSync(directory)) if (name.endsWith(".conf")) byName.set(name, join(directory, name));
  }
  return { template: join(units, template), dropIns: [...byName.keys()].sort().map((name) => byName.get(name) ?? "") };
}

// The directives of a file, its specifiers replaced for the instance
// `name`: `%i` and `%I` (the name), `%%`. Any other specifier is returned
// as is, and named in `unknown`.
export function readWithInstance(file: string, name: string, unknown: Set<string>): Directive[] {
  return readDirectives(readFileSync(file, "utf8")).map((directive) => ({
    ...directive,
    value: directive.value.replace(/%(.)/g, (whole, letter: string) => {
      if (letter === "i" || letter === "I") return name;
      if (letter === "%") return "%";
      unknown.add(whole);
      return whole;
    }),
  }));
}
