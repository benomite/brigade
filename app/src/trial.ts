// Essayer une livraison depuis sa carte, d'un clic (#3215). Le projet dit comment il s'essaie dans `.brigade/try.json`
// (`command`, et `url` s'il y en a une) ; « try it » en tire la version livrée dans un worktree git sous le dossier de
// l'app — jamais dans la copie de travail du chef —, y lance la commande, et « stop » l'arrête avec tous ses enfants.
// Ce module ne touche ni Electron ni `document` : il reçoit de quoi ouvrir une adresse.
import { execFile, spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

export const FICHIER_DE_L_TRIAL = ".brigade/try.json";
const LINES_DE_FIN = 10;
const OCTETS_GARDES = 16_384;
const DELAY_AVANT_KILL_MS = 1_500;
const DELAY_DE_GIT_MS = 60_000;

// Les seules cartes qu'on essaie : celle que la pass relit, et celle qui est livrée.
const STATES_ESSAYABLES = ["en pass", "servi"];
export const sEssaie = (state: string | undefined): boolean => state !== undefined && STATES_ESSAYABLES.includes(state);

export type Declaration = { command: string; url?: string };
export type LueDeclaration = { declaration: Declaration } | { absente: true } | { invalide: string };

// Le fichier d'un projet : absent, illisible ou mal formé, il le dit — rien n'est inventé à sa place.
export function lireLaDeclaration(dossier: string): LueDeclaration {
  const chemin = join(dossier, FICHIER_DE_L_TRIAL);
  if (!existsSync(chemin)) return { absente: true };
  let brut: string;
  try {
    brut = readFileSync(chemin, "utf8");
  } catch (error) {
    return { invalide: `${FICHIER_DE_L_TRIAL} cannot be read: ${error instanceof Error ? error.message : String(error)}` };
  }
  return lireLeTexte(brut);
}

export function lireLeTexte(brut: string): LueDeclaration {
  let lu: unknown;
  try {
    lu = JSON.parse(brut);
  } catch {
    return { invalide: `${FICHIER_DE_L_TRIAL} is not valid JSON` };
  }
  if (typeof lu !== "object" || lu === null || Array.isArray(lu)) return { invalide: `${FICHIER_DE_L_TRIAL} must be a JSON object with a \`command\` key` };
  const { command, url } = lu as Record<string, unknown>;
  if (typeof command !== "string" || command.trim() === "") return { invalide: `${FICHIER_DE_L_TRIAL} needs a \`command\` key: a non-empty string` };
  if (url === undefined) return { declaration: { command } };
  if (typeof url !== "string" || !/^https?:\/\/\S+$/.test(url)) return { invalide: `${FICHIER_DE_L_TRIAL}: \`url\` must be an http(s) address` };
  return { declaration: { command, url } };
}

// L'état d'un essai, tel que la carte le dit.
export type StateTrial = { enCours: true; url?: string } | { echec: { raison: string; fin: string } };

export type VuDesEssais = { declaration: LueDeclaration; essais: Record<number, StateTrial> };

type Settings = {
  // Le dossier de l'app où vivent les worktrees : un par projet et par ticket.
  dossierDonnees: string;
  git?: string;
  ouvrir: (url: string) => void;
  surChangement: (project: string) => void;
};

type Tenu = { enfant: ReturnType<typeof spawn>; arrete: boolean; fini: Promise<void> };

// Un `git` qui ne bloque pas le process principal : son code, sa sortie et son erreur.
const git = (bin: string, cwd: string, args: string[]) =>
  new Promise<{ status: number | null; stdout: string; stderr: string }>((fini) => {
    execFile(bin, args, { cwd, encoding: "utf8", timeout: DELAY_DE_GIT_MS }, (error, stdout, stderr) => {
      const code = (error as { code?: unknown } | null)?.code;
      fini({ status: error === null ? 0 : typeof code === "number" ? code : 1, stdout, stderr: stderr || (error?.message ?? "") });
    });
  });
// La fin de la sortie — pas son début —, sans ses lignes vides.
const fin = (texte: string) => texte.split("\n").map((line) => line.trimEnd()).filter((line) => line !== "").slice(-LINES_DE_FIN).join("\n");

// La version livrée d'un ticket : la branche `cook/<n>-…` de l'origin — une livraison à la pass —, sinon le commit de
// fusion que le dépôt garde de cette branche — une livraison servie. Aucune des deux : rien à essayer, et on le dit.
async function versionDe(bin: string, dossier: string, ticket: number): Promise<{ ref: string } | { raison: string }> {
  // Hors ligne, la version se cherche dans ce que la copie a déjà : un échec du fetch n'arrête rien.
  await git(bin, dossier, ["fetch", "--quiet", "origin"]);
  const branches = await git(bin, dossier, ["for-each-ref", "--format=%(refname)", `refs/remotes/origin/cook/${ticket}-*`, `refs/heads/cook/${ticket}-*`]);
  const branch = branches.stdout.split("\n").find((line) => line.trim() !== "");
  if (branch !== undefined) return { ref: branch.trim() };
  const fusion = await git(bin, dossier, ["log", "--all", "--merges", "-1", "--format=%H", "-E", `--grep=cook/${ticket}-`]);
  const sha = fusion.stdout.trim();
  if (fusion.status === 0 && sha) return { ref: sha };
  return { raison: `no branch cook/${ticket}-* and no merge commit of it was found in this working copy's repository` };
}

export function holdLesEssais({ dossierDonnees, git: bin = process.env.BRIGADE_GIT_BIN || "git", ouvrir, surChangement }: Settings) {
  const tenus = new Map<string, Tenu>();
  const states = new Map<string, StateTrial>();
  const preparations = new Set<string>();
  const cle = (project: string, ticket: number) => `${project}#${ticket}`;
  const poser = (project: string, ticket: number, state: StateTrial | undefined) => {
    if (state === undefined) states.delete(cle(project, ticket));
    else states.set(cle(project, ticket), state);
    surChangement(project);
  };

  // Le worktree d'un ticket : sous le dossier de l'app, jamais dans la copie de travail. Déjà là, il est recréé net.
  const dossierDuWorktree = (project: string, ticket: number) => join(dossierDonnees, "essais", project.replace(/[^\w.-]+/g, "_"), String(ticket));
  async function preparer(dossier: string, project: string, ticket: number): Promise<{ cwd: string } | { raison: string }> {
    const cwd = dossierDuWorktree(project, ticket);
    const dedans = relative(resolve(dossier), resolve(cwd));
    if (dedans === "" || (!dedans.startsWith("..") && !isAbsolute(dedans))) return { raison: "the app's data folder is inside the working copy: no worktree is created there" };
    const version = await versionDe(bin, dossier, ticket);
    if ("raison" in version) return version;
    if (existsSync(cwd)) {
      await git(bin, dossier, ["worktree", "remove", "--force", cwd]);
      rmSync(cwd, { recursive: true, force: true });
    }
    await git(bin, dossier, ["worktree", "prune"]);
    mkdirSync(dirname(cwd), { recursive: true });
    const ajoute = await git(bin, dossier, ["worktree", "add", "--detach", cwd, version.ref]);
    if (ajoute.status !== 0) return { raison: `the checkout of ${version.ref} failed: ${fin(ajoute.stderr || ajoute.stdout || "git gave no reason").split("\n").pop()}` };
    return { cwd };
  }

  // Tue le process et tous ses enfants : un groupe de process sur Unix, `taskkill /T` sur Windows.
  function tuer(enfant: ReturnType<typeof spawn>, signal: "SIGTERM" | "SIGKILL") {
    if (enfant.pid === undefined) return;
    if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(enfant.pid), "/T", "/F"]);
    else {
      try {
        process.kill(-enfant.pid, signal);
      } catch {
        // le groupe est déjà parti
      }
    }
  }

  async function essayer(dossier: string, project: string, ticket: number): Promise<void> {
    const k = cle(project, ticket);
    if (tenus.has(k) || preparations.has(k)) return;
    const failure = (raison: string, sortie = "") => poser(project, ticket, { echec: { raison, fin: fin(sortie) } });
    const lue = lireLaDeclaration(dossier);
    if ("absente" in lue) return failure(`there is no ${FICHIER_DE_L_TRIAL} in this project`);
    if ("invalide" in lue) return failure(lue.invalide);
    preparations.add(k);
    const pret = await preparer(dossier, project, ticket).finally(() => preparations.delete(k));
    if ("raison" in pret) return failure(pret.raison);
    let sortie = "";
    let enfant: ReturnType<typeof spawn>;
    try {
      enfant = spawn(lue.declaration.command, { cwd: pret.cwd, shell: true, detached: process.platform !== "win32", stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    } catch (error) {
      return failure(`the command could not start: ${error instanceof Error ? error.message : String(error)}`);
    }
    const garder = (morceau: Buffer) => {
      sortie = (sortie + morceau.toString("utf8")).slice(-OCTETS_GARDES);
    };
    enfant.stdout?.on("data", garder);
    enfant.stderr?.on("data", garder);
    let fini!: () => void;
    const tenu: Tenu = { enfant, arrete: false, fini: new Promise<void>((resolu) => (fini = resolu)) };
    tenus.set(k, tenu);
    enfant.on("error", (error) => {
      tenus.delete(k);
      fini();
      failure(`the command could not start: ${error.message}`, sortie);
    });
    enfant.on("close", (code, signal) => {
      // Plus rien ne doit tourner : les enfants que la commande laisse derrière elle partent avec elle.
      tuer(enfant, "SIGKILL");
      if (tenus.get(k) === tenu) tenus.delete(k);
      fini();
      if (tenu.arrete || code === 0) poser(project, ticket, undefined);
      else failure(signal === null ? `the command exited with code ${code}` : `the command was ended by ${signal}`, sortie);
    });
    poser(project, ticket, { enCours: true, ...(lue.declaration.url === undefined ? {} : { url: lue.declaration.url }) });
    if (lue.declaration.url !== undefined) ouvrir(lue.declaration.url);
  }

  // Un clic : la commande et tous ses enfants finissent ; rendu quand c'est fait.
  async function arreter(project: string, ticket: number): Promise<void> {
    const tenu = tenus.get(cle(project, ticket));
    if (tenu === undefined) return;
    tenu.arrete = true;
    tuer(tenu.enfant, "SIGTERM");
    const delay = setTimeout(() => tuer(tenu.enfant, "SIGKILL"), DELAY_AVANT_KILL_MS);
    await tenu.fini;
    clearTimeout(delay);
  }

  return {
    essayer,
    arreter,
    // Ce que la vue lit d'un projet : sa déclaration (le bouton et le message en dépendent), ses essais par ticket.
    vu(dossier: string, project: string): VuDesEssais {
      const essais: Record<number, StateTrial> = {};
      for (const [k, state] of states) if (k.startsWith(`${project}#`)) essais[Number(k.slice(project.length + 1))] = state;
      return { declaration: lireLaDeclaration(dossier), essais };
    },
    // Quitter l'app : aucun essai ne reste.
    async toutArreter() {
      await Promise.all([...tenus.keys()].map((k) => arreter(k.slice(0, k.lastIndexOf("#")), Number(k.slice(k.lastIndexOf("#") + 1)))));
    },
  };
}
export type Essais = ReturnType<typeof holdLesEssais>;
