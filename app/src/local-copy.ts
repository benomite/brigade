// La copie locale d'un projet, quand le chef l'ouvre depuis « Add a project » (#1429) : l'app reprend une copie qui existe
// — le dossier qu'elle connaît déjà, puis celui qu'elle gère pour ce projet —, ou clone le dépôt dans ce dossier, par le
// `gh` de l'ordinateur, en HTTPS, à côté de sa place puis renommé : un clone interrompu ne laisse rien là où l'ouverture
// suivante chercherait une copie. Le dossier géré : `<racine>/<nom du projet>`, la racine étant `BRIGADE_PROJECTS_DIR`, à
// défaut `~/Brigade`. Chaque étape est dite (`progres`) ; un échec est un état, jamais une exception.
//
// Et ce que `claude auth status` dit de la session Claude Code de cet ordinateur (#4057), avant que la cuisine démarre.
import { execFile, spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, renameSync, rmdirSync, rmSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { signInToGitHub } from "./connection-github.ts";
import type { LocalCopy, Progress } from "./first-launch.ts";

type Failed = Extract<LocalCopy, { state: "failed" }>;
type CauseOfFailure = Failed["cause"];
// Ce que `claude auth status` dit de la session de cet ordinateur.
export type Session = "connectee" | "absente" | "introuvable" | "inconnue";

export type OptionsOfCopy = { repository: string; project?: string; folder?: string; progres?: (step: Progress) => void; gh: string; git: string; env: NodeJS.ProcessEnv; delaiMs?: number };

const REPOSITORY = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9_.-]{1,100}$/;
const NAME = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/;
const DELAY_MS = 30 * 60_000;
const DETAIL_MAX = 2000;
// Ce que `gh` et `git` disent d'un clone en échec, et sa cause.
const FAILURES: Array<[RegExp, CauseOfFailure]> = [
  [/unable to find git executable|git: (command )?not found|executable file not found.*git/i, "git-missing"],
  [/could not resolve host|failed to connect|couldn't connect|connection (timed out|refused|reset|closed)|operation timed out|network is unreachable|early eof|error connecting to|dial tcp|i\/o timeout|no such host|EAI_AGAIN|ENOTFOUND|ECONNREFUSED/i, "network"],
  [/returned error: 403|permission to .* denied|access denied|http 403|saml|single sign-on/i, "access-denied"],
  [/gh auth login|not logged in|authentication required|requires authentication|bad credentials|could not read (username|password)|terminal prompts disabled|authentication failed|returned error: 401|http 401/i, "sign-in-required"],
  [/repository not found|could not resolve to a repository|does not appear to be a git repository|returned error: 404|not found/i, "access-denied"],
];
// Ce que git écrit de sa progression n'est pas une raison.
const PROGRESS = /^(remote: )?(Counting|Compressing|Receiving|Resolving|Enumerating|Total|Updating files|Cloning into)/i;
const RECEIVED = /Receiving objects:\s+(\d{1,3})%/;

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

// Vrai si cette adresse d'origine désigne ce dépôt : HTTPS, ssh, ou un chemin qui finit par `<owner>/<repo>(.git)`.
const originOf = (repository: string, address: string) => {
  const [owner = "", name = ""] = repository.toLowerCase().split("/");
  const clean = address.trim().toLowerCase().replace(/\\/g, "/").replace(/\/+$/, "").replace(/\.git$/, "");
  return clean.endsWith(`/${owner}/${name}`) || clean.endsWith(`:${owner}/${name}`);
};

const originOfFolder = (git: string, folder: string, env: NodeJS.ProcessEnv) =>
  new Promise<string | null>((render) => void execFile(git, ["-C", folder, "remote", "get-url", "origin"], { env, timeout: 60_000, encoding: "utf8" }, (error, output) => render(error === null ? String(output).trim() : null)));

// Ce que tient ce dossier : rien, une copie du dépôt, ou autre chose — et quoi.
async function holds(git: string, folder: string, repository: string, env: NodeJS.ProcessEnv): Promise<"nothing" | "copy" | string> {
  if (!existsSync(folder)) return "nothing";
  if (!statSync(folder).isDirectory()) return "a file";
  if (readdirSync(folder).length === 0) return "nothing";
  if (!existsSync(join(folder, ".git"))) return "files that are not a git clone";
  const origin = await originOfFolder(git, folder, env);
  if (origin === null) return "a git clone with no origin";
  return originOf(repository, origin) ? "copy" : `a clone of ${origin}`;
}

function cloneBeside(gh: string, repository: string, beside: string, env: NodeJS.ProcessEnv, delayMs: number, received: (percent: number) => void): Promise<{ ok: true } | { ok: false; absent: boolean; expired: boolean; errors: string }> {
  return new Promise((render) => {
    let errors = "";
    let expired = false;
    const child = spawn(gh, ["repo", "clone", `https://github.com/${repository}.git`, beside, "--", "--progress"], { env, stdio: ["ignore", "ignore", "pipe"], windowsHide: true });
    const guard = setTimeout(() => {
      expired = true;
      child.kill();
    }, delayMs);
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (piece: string) => {
      if (errors.length < 64 * 1024) errors += piece;
      for (const line of piece.split(/[\r\n]/)) {
        const read = RECEIVED.exec(line);
        if (read !== null) received(Number(read[1]));
      }
    });
    child.on("error", (error: NodeJS.ErrnoException) => (clearTimeout(guard), render({ ok: false, absent: error.code === "ENOENT", expired: false, errors: error.message })));
    child.on("close", (code) => (clearTimeout(guard), render(code === 0 && !expired ? { ok: true } : { ok: false, absent: false, expired, errors })));
  });
}

// Ouvre la copie locale du projet : la reprend, ou la clone.
export async function openTheLocalCopy(options: OptionsOfCopy): Promise<LocalCopy> {
  const { repository, gh, git } = options;
  const project = options.project ?? repository.split("/")[1] ?? repository;
  const env = { ...options.env, GH_PROMPT_DISABLED: "1", GIT_TERMINAL_PROMPT: "0", NO_COLOR: "1" };
  const say = options.progres ?? (() => {});
  const fail = (failure: { cause: CauseOfFailure; reason: string; link?: string; detail?: string }): Failed => ({ state: "failed", project, repository, ...failure });
  if (!REPOSITORY.test(repository) || [".", ".."].includes(repository.split("/")[1] ?? "") || repository.endsWith(".git")) return fail({ cause: "invalid", reason: `“${repository}” is not a GitHub repository written as <owner>/<name>, so there is nothing to clone.` });
  if (!NAME.test(project) || project === "." || project === "..") return fail({ cause: "invalid", reason: `“${project}” cannot name a folder, so ${repository} has nowhere to be cloned.` });
  const root = resolve(options.env.BRIGADE_PROJECTS_DIR || join(homedir(), "Brigade"));
  const folder = join(root, project);

  say({ stage: "looking", sentence: `Looking for a local copy of ${repository}.` });
  const known = options.folder !== undefined && isAbsolute(options.folder) ? resolve(options.folder) : null;
  for (const candidate of known === null || known === folder ? [folder] : [known, folder]) {
    const held = await holds(git, candidate, repository, env).catch((error: unknown) => `something it cannot read (${message(error)})`);
    if (held === "copy") {
      say({ stage: "reusing", sentence: `Opening the local copy of ${repository} in ${candidate}.`, folder: candidate });
      return { state: "open", project, repository, folder: candidate, cloned: false };
    }
    if (candidate === folder && held !== "nothing") return fail({ cause: "folder-taken", reason: `${folder} already holds ${held}, so ${repository} is not cloned over it: move that folder away, then open the project again.` });
  }

  const beside = `${folder}.clonage`;
  try {
    rmSync(beside, { recursive: true, force: true });
    mkdirSync(dirname(folder), { recursive: true });
  } catch (error) {
    return fail({ cause: "folder-taken", reason: `${repository} cannot be cloned because brigade cannot write in ${root}: ${message(error)}.`, detail: message(error) });
  }
  say({ stage: "cloning", sentence: `Cloning ${repository} into ${folder}.`, folder });
  const delayMs = options.delaiMs ?? DELAY_MS;
  const clone = await cloneBeside(gh, repository, beside, env, delayMs, (percent) => say({ stage: "cloning", sentence: `Cloning ${repository} into ${folder} — ${percent}%.`, folder, percent }));
  if (!clone.ok) {
    rmSync(beside, { recursive: true, force: true });
    if (clone.absent) return fail({ cause: "gh-missing", reason: `The GitHub CLI (\`${gh}\`) is not installed on this computer, and brigade clones ${repository} through it: install it, then open the project again.`, link: "https://cli.github.com", detail: clone.errors });
    const errors = clone.errors.split(/[\r\n]/).filter((line) => !PROGRESS.test(line.trim())).join("\n").trim();
    const detail = errors.slice(0, DETAIL_MAX);
    if (clone.expired) return fail({ cause: "timeout", reason: `The clone of ${repository} did not finish within ${Math.round(delayMs / 60_000)} min, so it was stopped: open the project again once the network is faster.`, detail });
    const cause = FAILURES.find(([said]) => said.test(errors))?.[1] ?? "unknown";
    const reasons: Record<CauseOfFailure, string> = {
      "git-missing": `Git is not installed on this computer, so ${repository} cannot be cloned: install it, then open the project again.`,
      network: `GitHub cannot be reached from this computer, so ${repository} could not be cloned: check its network connection, then open the project again.`,
      "access-denied": `GitHub denies this computer's GitHub account access to ${repository}, so it cannot be cloned: either it is not one of its collaborators, or it no longer exists under this name.`,
      "sign-in-required": `This computer is not signed in to GitHub, so ${repository} cannot be cloned.`,
      "repository-missing": `${repository} cannot be cloned because it does not exist.`,
      "gh-missing": "",
      timeout: "",
      "folder-taken": "",
      invalid: "",
      unknown: `Git could not clone ${repository}: ${(errors.split("\n").at(-1) ?? "").replace(/[.\s]+$/, "")}.`,
    };
    const failed = fail({ cause, reason: reasons[cause], detail, ...(cause === "git-missing" ? { link: "https://git-scm.com/downloads" } : cause === "access-denied" ? { link: `https://github.com/${repository}` } : {}) });
    return cause === "sign-in-required" ? { ...failed, action: { id: "github-sign-in", label: "Sign in to GitHub", command: signInToGitHub(gh) } } : failed;
  }
  try {
    if (existsSync(folder)) rmdirSync(folder);
    renameSync(beside, folder);
  } catch (error) {
    rmSync(beside, { recursive: true, force: true });
    return fail({ cause: "folder-taken", reason: `${repository} was cloned but could not be put in ${folder}: ${message(error)}.`, detail: message(error) });
  }
  return { state: "open", project, repository, folder, cloned: true };
}

// Ce que `claude auth status` dit de cet ordinateur, sans appel au modèle ni ouverture de ses identifiants : son
// `loggedIn`, ou introuvable sans `claude`, inconnue quand il ne dit rien de net.
export function sessionOfClaude(claude: string, env: NodeJS.ProcessEnv): Promise<Session> {
  return new Promise((render) => {
    execFile(claude, ["auth", "status"], { env, timeout: 30_000, windowsHide: true }, (error, output) => {
      if ((error as NodeJS.ErrnoException | null)?.code === "ENOENT") return render("introuvable");
      let loggedIn: unknown;
      try {
        loggedIn = (JSON.parse(String(output)) as { loggedIn?: unknown }).loggedIn;
      } catch {}
      render(loggedIn === true ? "connectee" : loggedIn === false ? "absente" : "inconnue");
    });
  });
}
