// « Which station also cooks <project>? → this computer » (#4568): the project joins this computer's new kitchen, as
// docs/runtime/mac-new-kitchen.md says — one line `<name> <owner/repo> <base> [CLONE=<path>]` in
// `<station dir>/kitchen/projects`, which the station rereads on its own. The clone is the one the app already holds when
// it is a copy of the repository, else one made at `<station dir>/<name>/depot`. A refusal is one sentence naming its cause.
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { LocalCopy } from "./first-launch.ts";

export type ProjectToServe = { nom: string; dossier: string; base?: string };
export type ReadOfServed = { depots: string[] } | { refus: string; detail?: string };
// What the new kitchen's sandbox detection says of this machine (runtime/src/bac-a-sable/detection.ts), without its words.
type Probes = { platform: string; seatbelt: boolean; claude: string | null; minimum: string; atLeast(version: string, minimum: string): boolean };
// The runtime's own detection, loaded from the runtime folder the app runs with (the kitchen's launch uses the same module).
export async function probesOfTheRuntime(runtimeDir: string, claude: string): Promise<() => Probes> {
  const detection = (await import(pathToFileURL(join(runtimeDir, "src", "bac-a-sable", "detection.ts")).href)) as typeof import("../../runtime/src/bac-a-sable/detection.ts");
  return () => {
    const probes = detection.sondesDeLaMachine(claude);
    return { platform: probes.plateforme, seatbelt: probes.existe(detection.SEATBELT), claude: probes.versionDeClaude(), minimum: detection.VERSION_MINIMALE, atLeast: detection.auMoins };
  };
}
type Options = {
  stationDir: string;
  repository: string;
  project: ProjectToServe | undefined;
  probes(): Probes;
  // The app's own copy of the repository, or the one at the station's default place, else a new clone there.
  openCopy(options: { repository: string; project: string; folder?: string; root: string }): Promise<LocalCopy>;
  readBase(folder: string): Promise<string | undefined>;
};

const REPOSITORY = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9_.-]{1,100}$/;
const WORD = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/;
const VERSION = /(\d+\.\d+\.\d+)/;
const file = (stationDir: string) => join(stationDir, "kitchen", "projects");
const refuse = (refus: string, detail?: string): ReadOfServed => ({ refus, ...(detail === undefined ? {} : { detail }) });

function linesOf(stationDir: string): string[][] {
  let text = "";
  try { text = readFileSync(file(stationDir), "utf8"); } catch {}
  return text.split("\n").map((line) => line.trim()).filter((line) => line !== "" && !line.startsWith("#")).map((line) => line.split(/\s+/));
}

// Why this computer cannot cook a project in its new kitchen, in a sentence; undefined when it can.
export function whyNoSandbox(probes: Probes): string | undefined {
  if (probes.platform !== "darwin") return "this computer is not a Mac, and only a Mac's sandbox keeps a cook away from the chef's keys: serve it from the box instead";
  if (!probes.seatbelt) return "this Mac has no sandbox for its cooks (macOS's sandbox-exec is missing), and a cook never runs without one";
  if (probes.claude === null) return "Claude Code did not answer on this Mac, so it cannot be told whether it knows the sandbox: install or open Claude Code, then try again";
  const version = VERSION.exec(probes.claude)?.[1];
  if (version === undefined) return "Claude Code's version cannot be read on this Mac, so it cannot be told whether it knows the sandbox: update Claude Code, then try again";
  if (!probes.atLeast(version, probes.minimum)) return `Claude Code ${version} on this Mac is too old for its sandbox (${probes.minimum} or newer is needed): run \`claude update\`, then try again`;
  return undefined;
}

export async function serveHere(options: Options): Promise<ReadOfServed> {
  const { stationDir, repository } = options;
  const served = () => linesOf(stationDir).flatMap(([, repo]) => (repo === undefined ? [] : [repo]));
  if (!REPOSITORY.test(repository)) return refuse(`“${repository}” is not a GitHub repository written as <owner>/<name>`);
  if (served().some((repo) => repo.toLowerCase() === repository.toLowerCase())) return { depots: served() };

  const name = options.project?.nom ?? repository.split("/")[1] ?? repository;
  if (!WORD.test(name)) return refuse(`“${name}” cannot name a folder in this computer's kitchen`);
  const taken = linesOf(stationDir).find(([other]) => other === name);
  if (taken !== undefined) return refuse(`this computer's kitchen already serves another project called ${name} (${taken[1] ?? "?"})`);
  const cannot = whyNoSandbox(options.probes());
  if (cannot !== undefined) return refuse(`this computer cannot cook ${repository}: ${cannot}`);

  const beside = join(stationDir, name);
  const copy = await options.openCopy({ repository, project: "depot", ...(options.project === undefined ? {} : { folder: options.project.dossier }), root: beside });
  if (copy.state !== "open") return refuse(`${repository} has no clone on this computer and none could be made: ${copy.reason}`, "detail" in copy ? copy.detail : undefined);
  const base = options.project?.base ?? (await options.readBase(copy.folder).catch(() => undefined)) ?? "main";
  if (!WORD.test(base)) return refuse(`the base branch “${base}” of ${repository} cannot be written in this computer's kitchen`);
  const defaultClone = join(beside, "depot");
  if (copy.folder !== defaultClone && /\s/.test(copy.folder)) return refuse(`the clone of ${repository} is in a folder whose name has a space, which this computer's kitchen cannot take: move the project's folder under a name without one, then try again`);

  const line = `${name} ${repository} ${base}${copy.folder === defaultClone ? "" : ` CLONE=${copy.folder}`}`;
  try {
    mkdirSync(join(stationDir, "kitchen"), { recursive: true });
    let text = "";
    try { text = readFileSync(file(stationDir), "utf8"); } catch {}
    appendFileSync(file(stationDir), `${text === "" || text.endsWith("\n") ? "" : "\n"}${line}\n`);
  } catch (error) {
    return refuse(`this computer's kitchen could not be written to (${error instanceof Error ? error.message : String(error)})`);
  }
  return { depots: served() };
}
