// Essayer une livraison depuis sa carte, d'un clic (#3215). Le projet dit comment il s'essaie dans `.brigade/try.json`
// (`command`, et `url` s'il y en a une) ; « try it » en tire la version livrée dans un worktree git sous le dossier de
// l'app — jamais dans la copie de travail du chef —, y lance la commande, et « stop » l'arrête avec tous ses enfants.
// Ce module ne touche ni Electron ni `document` : il reçoit de quoi ouvrir une adresse.
import { execFile, spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

export const FICHIER_DE_L_ESSAI = ".brigade/try.json";
const LIGNES_DE_FIN = 10;
const OCTETS_GARDES = 16_384;
const DELAI_AVANT_KILL_MS = 1_500;
const DELAI_DE_GIT_MS = 60_000;

// Les seules cartes qu'on essaie : celle que la pass relit, et celle qui est livrée.
const ETATS_ESSAYABLES = ["en pass", "servi"];
export const sEssaie = (etat: string | undefined): boolean => etat !== undefined && ETATS_ESSAYABLES.includes(etat);

export type Declaration = { command: string; url?: string };
export type LueDeclaration = { declaration: Declaration } | { absente: true } | { invalide: string };

// Le fichier d'un projet : absent, illisible ou mal formé, il le dit — rien n'est inventé à sa place.
export function lireLaDeclaration(dossier: string): LueDeclaration {
  const chemin = join(dossier, FICHIER_DE_L_ESSAI);
  if (!existsSync(chemin)) return { absente: true };
  let brut: string;
  try {
    brut = readFileSync(chemin, "utf8");
  } catch (erreur) {
    return { invalide: `${FICHIER_DE_L_ESSAI} cannot be read: ${erreur instanceof Error ? erreur.message : String(erreur)}` };
  }
  return lireLeTexte(brut);
}

export function lireLeTexte(brut: string): LueDeclaration {
  let lu: unknown;
  try {
    lu = JSON.parse(brut);
  } catch {
    return { invalide: `${FICHIER_DE_L_ESSAI} is not valid JSON` };
  }
  if (typeof lu !== "object" || lu === null || Array.isArray(lu)) return { invalide: `${FICHIER_DE_L_ESSAI} must be a JSON object with a \`command\` key` };
  const { command, url } = lu as Record<string, unknown>;
  if (typeof command !== "string" || command.trim() === "") return { invalide: `${FICHIER_DE_L_ESSAI} needs a \`command\` key: a non-empty string` };
  if (url === undefined) return { declaration: { command } };
  if (typeof url !== "string" || !/^https?:\/\/\S+$/.test(url)) return { invalide: `${FICHIER_DE_L_ESSAI}: \`url\` must be an http(s) address` };
  return { declaration: { command, url } };
}

// L'état d'un essai, tel que la carte le dit.
export type EtatEssai = { enCours: true; url?: string } | { echec: { raison: string; fin: string } };

export type VuDesEssais = { declaration: LueDeclaration; essais: Record<number, EtatEssai> };

type Reglages = {
  // Le dossier de l'app où vivent les worktrees : un par projet et par ticket.
  dossierDonnees: string;
  git?: string;
  ouvrir: (url: string) => void;
  surChangement: (projet: string) => void;
};

type Tenu = { enfant: ReturnType<typeof spawn>; arrete: boolean; fini: Promise<void> };

// Un `git` qui ne bloque pas le process principal : son code, sa sortie et son erreur.
const git = (bin: string, cwd: string, args: string[]) =>
  new Promise<{ status: number | null; stdout: string; stderr: string }>((fini) => {
    execFile(bin, args, { cwd, encoding: "utf8", timeout: DELAI_DE_GIT_MS }, (erreur, stdout, stderr) => {
      const code = (erreur as { code?: unknown } | null)?.code;
      fini({ status: erreur === null ? 0 : typeof code === "number" ? code : 1, stdout, stderr: stderr || (erreur?.message ?? "") });
    });
  });
// La fin de la sortie — pas son début —, sans ses lignes vides.
const fin = (texte: string) => texte.split("\n").map((ligne) => ligne.trimEnd()).filter((ligne) => ligne !== "").slice(-LIGNES_DE_FIN).join("\n");

// La version livrée d'un ticket : la branche `cook/<n>-…` de l'origin — une livraison à la pass —, sinon le commit de
// fusion que le dépôt garde de cette branche — une livraison servie. Aucune des deux : rien à essayer, et on le dit.
async function versionDe(bin: string, dossier: string, ticket: number): Promise<{ ref: string } | { raison: string }> {
  // Hors ligne, la version se cherche dans ce que la copie a déjà : un échec du fetch n'arrête rien.
  await git(bin, dossier, ["fetch", "--quiet", "origin"]);
  const branches = await git(bin, dossier, ["for-each-ref", "--format=%(refname)", `refs/remotes/origin/cook/${ticket}-*`, `refs/heads/cook/${ticket}-*`]);
  const branche = branches.stdout.split("\n").find((ligne) => ligne.trim() !== "");
  if (branche !== undefined) return { ref: branche.trim() };
  const fusion = await git(bin, dossier, ["log", "--all", "--merges", "-1", "--format=%H", "-E", `--grep=cook/${ticket}-`]);
  const sha = fusion.stdout.trim();
  if (fusion.status === 0 && sha) return { ref: sha };
  return { raison: `no branch cook/${ticket}-* and no merge commit of it was found in this working copy's repository` };
}

export function tenirLesEssais({ dossierDonnees, git: bin = process.env.BRIGADE_GIT_BIN || "git", ouvrir, surChangement }: Reglages) {
  const tenus = new Map<string, Tenu>();
  const etats = new Map<string, EtatEssai>();
  const preparations = new Set<string>();
  const cle = (projet: string, ticket: number) => `${projet}#${ticket}`;
  const poser = (projet: string, ticket: number, etat: EtatEssai | undefined) => {
    if (etat === undefined) etats.delete(cle(projet, ticket));
    else etats.set(cle(projet, ticket), etat);
    surChangement(projet);
  };

  // Le worktree d'un ticket : sous le dossier de l'app, jamais dans la copie de travail. Déjà là, il est recréé net.
  const dossierDuWorktree = (projet: string, ticket: number) => join(dossierDonnees, "essais", projet.replace(/[^\w.-]+/g, "_"), String(ticket));
  async function preparer(dossier: string, projet: string, ticket: number): Promise<{ cwd: string } | { raison: string }> {
    const cwd = dossierDuWorktree(projet, ticket);
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

  async function essayer(dossier: string, projet: string, ticket: number): Promise<void> {
    const k = cle(projet, ticket);
    if (tenus.has(k) || preparations.has(k)) return;
    const echec = (raison: string, sortie = "") => poser(projet, ticket, { echec: { raison, fin: fin(sortie) } });
    const lue = lireLaDeclaration(dossier);
    if ("absente" in lue) return echec(`there is no ${FICHIER_DE_L_ESSAI} in this project`);
    if ("invalide" in lue) return echec(lue.invalide);
    preparations.add(k);
    const pret = await preparer(dossier, projet, ticket).finally(() => preparations.delete(k));
    if ("raison" in pret) return echec(pret.raison);
    let sortie = "";
    let enfant: ReturnType<typeof spawn>;
    try {
      enfant = spawn(lue.declaration.command, { cwd: pret.cwd, shell: true, detached: process.platform !== "win32", stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    } catch (erreur) {
      return echec(`the command could not start: ${erreur instanceof Error ? erreur.message : String(erreur)}`);
    }
    const garder = (morceau: Buffer) => {
      sortie = (sortie + morceau.toString("utf8")).slice(-OCTETS_GARDES);
    };
    enfant.stdout?.on("data", garder);
    enfant.stderr?.on("data", garder);
    let fini!: () => void;
    const tenu: Tenu = { enfant, arrete: false, fini: new Promise<void>((resolu) => (fini = resolu)) };
    tenus.set(k, tenu);
    enfant.on("error", (erreur) => {
      tenus.delete(k);
      fini();
      echec(`the command could not start: ${erreur.message}`, sortie);
    });
    enfant.on("close", (code, signal) => {
      // Plus rien ne doit tourner : les enfants que la commande laisse derrière elle partent avec elle.
      tuer(enfant, "SIGKILL");
      if (tenus.get(k) === tenu) tenus.delete(k);
      fini();
      if (tenu.arrete || code === 0) poser(projet, ticket, undefined);
      else echec(signal === null ? `the command exited with code ${code}` : `the command was ended by ${signal}`, sortie);
    });
    poser(projet, ticket, { enCours: true, ...(lue.declaration.url === undefined ? {} : { url: lue.declaration.url }) });
    if (lue.declaration.url !== undefined) ouvrir(lue.declaration.url);
  }

  // Un clic : la commande et tous ses enfants finissent ; rendu quand c'est fait.
  async function arreter(projet: string, ticket: number): Promise<void> {
    const tenu = tenus.get(cle(projet, ticket));
    if (tenu === undefined) return;
    tenu.arrete = true;
    tuer(tenu.enfant, "SIGTERM");
    const delai = setTimeout(() => tuer(tenu.enfant, "SIGKILL"), DELAI_AVANT_KILL_MS);
    await tenu.fini;
    clearTimeout(delai);
  }

  return {
    essayer,
    arreter,
    // Ce que la vue lit d'un projet : sa déclaration (le bouton et le message en dépendent), ses essais par ticket.
    vu(dossier: string, projet: string): VuDesEssais {
      const essais: Record<number, EtatEssai> = {};
      for (const [k, etat] of etats) if (k.startsWith(`${projet}#`)) essais[Number(k.slice(projet.length + 1))] = etat;
      return { declaration: lireLaDeclaration(dossier), essais };
    },
    // Quitter l'app : aucun essai ne reste.
    async toutArreter() {
      await Promise.all([...tenus.keys()].map((k) => arreter(k.slice(0, k.lastIndexOf("#")), Number(k.slice(k.lastIndexOf("#") + 1)))));
    },
  };
}
export type Essais = ReturnType<typeof tenirLesEssais>;
