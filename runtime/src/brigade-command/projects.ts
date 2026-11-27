// `brigade project add|remove`: the edits of `<station>/kitchen/projects`, one line `<name> <owner/repo> <base> [PLACES=<n>]`
// each. Pure: they take the file's text (null when absent) and give the new text, so add then remove gives back the text.
type Change = { text: string; said: string } | { error: string };

const NAME = /^[a-z0-9][a-z0-9._-]*$/i;
const REPO = /^[\w.-]+\/[\w.-]+$/;

const nameOf = (line: string): string | undefined => {
  const trimmed = line.trim();
  return trimmed === "" || trimmed.startsWith("#") ? undefined : trimmed.split(/\s+/)[0];
};

export function addProject(text: string | null, args: string[]): Change {
  const rest: string[] = [];
  let places: string | undefined;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--places") places = args[++i] ?? "";
    else if (args[i]?.startsWith("--places=")) places = args[i]!.slice("--places=".length);
    else rest.push(args[i]!);
  }
  const [name, repo, extra] = rest;
  if (name === undefined || repo === undefined || extra !== undefined) return { error: "usage: brigade project add <name> <owner/repo> [--places N]" };
  if (!NAME.test(name)) return { error: `"${name}" is not a project name (letters, digits, . _ -)` };
  if (!REPO.test(repo)) return { error: `"${repo}" is not an owner/repo` };
  if (places !== undefined && !/^[1-9]\d*$/.test(places)) return { error: `--places wants a positive whole number, not "${places}"` };
  const current = text ?? "";
  if (current.split("\n").some((line) => nameOf(line) === name)) return { error: `project "${name}" is already served` };
  const line = `${name} ${repo} main${places === undefined ? "" : ` PLACES=${places}`}`;
  const lead = current === "" || current.endsWith("\n") ? current : `${current}\n`;
  return { text: `${lead}${line}\n`, said: `Project ${name} (${repo}) added${places === undefined ? "" : `, ${places} places`}.` };
}

export function removeProject(text: string | null, args: string[]): Change {
  const [name, extra] = args;
  if (name === undefined || extra !== undefined) return { error: "usage: brigade project remove <name>" };
  const lines = (text ?? "").split("\n");
  if (!lines.some((line) => nameOf(line) === name)) return { error: `project "${name}" is not served` };
  const kept = lines.filter((line) => nameOf(line) !== name).join("\n");
  return { text: kept.trim() === "" ? "" : kept, said: `Project ${name} removed.` };
}
