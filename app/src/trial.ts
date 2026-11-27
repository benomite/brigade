// Essayer une livraison depuis sa carte, d'un clic (#3215). Le projet dit comment il s'essaie dans `.brigade/try.json`
// (`command`, et `url` s'il y en a une) ; « try it » en tire la version livrée dans un worktree git sous le dossier de
// l'app — jamais dans la copie de travail du chef —, y lance la commande, et « stop » l'arrête avec tous ses enfants.
// Ce module ne touche ni Electron ni `document` : il reçoit de quoi ouvrir une adresse.
import { execFile, spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

export const FILE_OF_THE_TRIAL = ".brigade/try.json";
const LINES_OF_END = 10;
const BYTES_GUARDS = 16_384;
const DELAY_BEFORE_KILL_MS = 1_500;
const DELAY_OF_GIT_MS = 60_000;

// Les seules cartes qu'on essaie : celle que la pass relit, et celle qui est livrée.
const STATES_TRYABLE = ["en pass", "servi"];
export const sTries = (state: string | undefined): boolean => state !== undefined && STATES_TRYABLE.includes(state);

export type Declaration = { command: string; url?: string };
export type ReadDeclaration = { declaration: Declaration } | { absente: true } | { invalide: string };

// Le fichier d'un projet : absent, illisible ou mal formé, il le dit — rien n'est inventé à sa place.
export function readTheDeclaration(folder: string): ReadDeclaration {
  const path = join(folder, FILE_OF_THE_TRIAL);
  if (!existsSync(path)) return { absente: true };
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (error) {
    return { invalide: `${FILE_OF_THE_TRIAL} cannot be read: ${error instanceof Error ? error.message : String(error)}` };
  }
  return readTheText(raw);
}

export function readTheText(raw: string): ReadDeclaration {
  let readOne: unknown;
  try {
    readOne = JSON.parse(raw);
  } catch {
    return { invalide: `${FILE_OF_THE_TRIAL} is not valid JSON` };
  }
  if (typeof readOne !== "object" || readOne === null || Array.isArray(readOne)) return { invalide: `${FILE_OF_THE_TRIAL} must be a JSON object with a \`command\` key` };
  const { command, url } = readOne as Record<string, unknown>;
  if (typeof command !== "string" || command.trim() === "") return { invalide: `${FILE_OF_THE_TRIAL} needs a \`command\` key: a non-empty string` };
  if (url === undefined) return { declaration: { command } };
  if (typeof url !== "string" || !/^https?:\/\/\S+$/.test(url)) return { invalide: `${FILE_OF_THE_TRIAL}: \`url\` must be an http(s) address` };
  return { declaration: { command, url } };
}

// L'état d'un essai, tel que la carte le dit.
export type StateTrial = { enCours: true; url?: string } | { echec: { raison: string; fin: string } };

export type SeenOfTrials = { declaration: ReadDeclaration; essais: Record<number, StateTrial> };

type Settings = {
  // Le dossier de l'app où vivent les worktrees : un par projet et par ticket.
  dossierDonnees: string;
  git?: string;
  ouvrir: (url: string) => void;
  surChangement: (project: string) => void;
};

type Held = { enfant: ReturnType<typeof spawn>; arrete: boolean; fini: Promise<void> };

// Un `git` qui ne bloque pas le process principal : son code, sa sortie et son erreur.
const git = (bin: string, cwd: string, args: string[]) =>
  new Promise<{ status: number | null; stdout: string; stderr: string }>((finished) => {
    execFile(bin, args, { cwd, encoding: "utf8", timeout: DELAY_OF_GIT_MS }, (error, stdout, stderr) => {
      const code = (error as { code?: unknown } | null)?.code;
      finished({ status: error === null ? 0 : typeof code === "number" ? code : 1, stdout, stderr: stderr || (error?.message ?? "") });
    });
  });
// La fin de la sortie — pas son début —, sans ses lignes vides.
const end = (text: string) => text.split("\n").map((line) => line.trimEnd()).filter((line) => line !== "").slice(-LINES_OF_END).join("\n");

// La version livrée d'un ticket : la branche `cook/<n>-…` de l'origin — une livraison à la pass —, sinon le commit de
// fusion que le dépôt garde de cette branche — une livraison servie. Aucune des deux : rien à essayer, et on le dit.
async function versionOf(bin: string, folder: string, ticket: number): Promise<{ ref: string } | { raison: string }> {
  // Hors ligne, la version se cherche dans ce que la copie a déjà : un échec du fetch n'arrête rien.
  await git(bin, folder, ["fetch", "--quiet", "origin"]);
  const branches = await git(bin, folder, ["for-each-ref", "--format=%(refname)", `refs/remotes/origin/cook/${ticket}-*`, `refs/heads/cook/${ticket}-*`]);
  const branch = branches.stdout.split("\n").find((line) => line.trim() !== "");
  if (branch !== undefined) return { ref: branch.trim() };
  const merge = await git(bin, folder, ["log", "--all", "--merges", "-1", "--format=%H", "-E", `--grep=cook/${ticket}-`]);
  const sha = merge.stdout.trim();
  if (merge.status === 0 && sha) return { ref: sha };
  return { raison: `no branch cook/${ticket}-* and no merge commit of it was found in this working copy's repository` };
}

export function holdTheTrials({ dossierDonnees: folderData, git: bin = process.env.BRIGADE_GIT_BIN || "git", ouvrir: open, surChangement: onChange }: Settings) {
  const heldOnes = new Map<string, Held>();
  const states = new Map<string, StateTrial>();
  const preparations = new Set<string>();
  const key = (project: string, ticket: number) => `${project}#${ticket}`;
  const set = (project: string, ticket: number, state: StateTrial | undefined) => {
    if (state === undefined) states.delete(key(project, ticket));
    else states.set(key(project, ticket), state);
    onChange(project);
  };

  // Le worktree d'un ticket : sous le dossier de l'app, jamais dans la copie de travail. Déjà là, il est recréé net.
  const folderOfWorktree = (project: string, ticket: number) => join(folderData, "essais", project.replace(/[^\w.-]+/g, "_"), String(ticket));
  async function prepare(folder: string, project: string, ticket: number): Promise<{ cwd: string } | { raison: string }> {
    const cwd = folderOfWorktree(project, ticket);
    const inside = relative(resolve(folder), resolve(cwd));
    if (inside === "" || (!inside.startsWith("..") && !isAbsolute(inside))) return { raison: "the app's data folder is inside the working copy: no worktree is created there" };
    const version = await versionOf(bin, folder, ticket);
    if ("raison" in version) return version;
    if (existsSync(cwd)) {
      await git(bin, folder, ["worktree", "remove", "--force", cwd]);
      rmSync(cwd, { recursive: true, force: true });
    }
    await git(bin, folder, ["worktree", "prune"]);
    mkdirSync(dirname(cwd), { recursive: true });
    const adds = await git(bin, folder, ["worktree", "add", "--detach", cwd, version.ref]);
    if (adds.status !== 0) return { raison: `the checkout of ${version.ref} failed: ${end(adds.stderr || adds.stdout || "git gave no reason").split("\n").pop()}` };
    return { cwd };
  }

  // Tue le process et tous ses enfants : un groupe de process sur Unix, `taskkill /T` sur Windows.
  function kill(child: ReturnType<typeof spawn>, signal: "SIGTERM" | "SIGKILL") {
    if (child.pid === undefined) return;
    if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"]);
    else {
      try {
        process.kill(-child.pid, signal);
      } catch {
        // le groupe est déjà parti
      }
    }
  }

  async function attempt(folder: string, project: string, ticket: number): Promise<void> {
    const k = key(project, ticket);
    if (heldOnes.has(k) || preparations.has(k)) return;
    const failure = (reason: string, output = "") => set(project, ticket, { echec: { raison: reason, fin: end(output) } });
    const readEntry = readTheDeclaration(folder);
    if ("absente" in readEntry) return failure(`there is no ${FILE_OF_THE_TRIAL} in this project`);
    if ("invalide" in readEntry) return failure(readEntry.invalide);
    preparations.add(k);
    const ready = await prepare(folder, project, ticket).finally(() => preparations.delete(k));
    if ("raison" in ready) return failure(ready.raison);
    let output = "";
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(readEntry.declaration.command, { cwd: ready.cwd, shell: true, detached: process.platform !== "win32", stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    } catch (error) {
      return failure(`the command could not start: ${error instanceof Error ? error.message : String(error)}`);
    }
    const keep = (piece: Buffer) => {
      output = (output + piece.toString("utf8")).slice(-BYTES_GUARDS);
    };
    child.stdout?.on("data", keep);
    child.stderr?.on("data", keep);
    let finished!: () => void;
    const held: Held = { enfant: child, arrete: false, fini: new Promise<void>((resolved) => (finished = resolved)) };
    heldOnes.set(k, held);
    child.on("error", (error) => {
      heldOnes.delete(k);
      finished();
      failure(`the command could not start: ${error.message}`, output);
    });
    child.on("close", (code, signal) => {
      // Plus rien ne doit tourner : les enfants que la commande laisse derrière elle partent avec elle.
      kill(child, "SIGKILL");
      if (heldOnes.get(k) === held) heldOnes.delete(k);
      finished();
      if (held.arrete || code === 0) set(project, ticket, undefined);
      else failure(signal === null ? `the command exited with code ${code}` : `the command was ended by ${signal}`, output);
    });
    set(project, ticket, { enCours: true, ...(readEntry.declaration.url === undefined ? {} : { url: readEntry.declaration.url }) });
    if (readEntry.declaration.url !== undefined) open(readEntry.declaration.url);
  }

  // Un clic : la commande et tous ses enfants finissent ; rendu quand c'est fait.
  async function stop(project: string, ticket: number): Promise<void> {
    const held = heldOnes.get(key(project, ticket));
    if (held === undefined) return;
    held.arrete = true;
    kill(held.enfant, "SIGTERM");
    const delay = setTimeout(() => kill(held.enfant, "SIGKILL"), DELAY_BEFORE_KILL_MS);
    await held.fini;
    clearTimeout(delay);
  }

  return {
    essayer: attempt,
    arreter: stop,
    // Ce que la vue lit d'un projet : sa déclaration (le bouton et le message en dépendent), ses essais par ticket.
    vu(folder: string, project: string): SeenOfTrials {
      const trials: Record<number, StateTrial> = {};
      for (const [k, state] of states) if (k.startsWith(`${project}#`)) trials[Number(k.slice(project.length + 1))] = state;
      return { declaration: readTheDeclaration(folder), essais: trials };
    },
    // Quitter l'app : aucun essai ne reste.
    async toutArreter() {
      await Promise.all([...heldOnes.keys()].map((k) => stop(k.slice(0, k.lastIndexOf("#")), Number(k.slice(k.lastIndexOf("#") + 1)))));
    },
  };
}
export type Trials = ReturnType<typeof holdTheTrials>;
