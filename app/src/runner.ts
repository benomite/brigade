// Le runner : ce poste joue les stations que le projet lui confie. Une station
// qui tourne ici — `mac/claude`, avec ce que seul ce poste fournit — est déclarée
// `distante` sur la box, et la box n'a aucun chemin vers elle : c'est le runner
// qui vient, par le geste de la box (`ssh <hote> brigade <nom> pull <station> …`,
// docs/runtime/station-distante.md, « Une station distante tire son travail »), s'annoncer,
// réclamer un ticket, renouveler son bail et rendre sa livraison.
//
// Tout part d'ici, rien n'y arrive : ce module n'écoute aucun port, n'ouvre aucun
// serveur, et ne dit à la box ni où il est ni comment le joindre. Il ne lance que
// trois programmes — `ssh` vers la box, `git` dans le clone du projet, `claude`
// dans le worktree du cook. App fermée, plus rien ne part : la box dit la station
// absente, et ce n'est pas une panne.
//
// Le cook d'ici n'est pas un cook à part. Ses arguments sont ceux que la box
// remet, tels quels — les mêmes outils interdits ; son environnement est celui du
// poste, sans rien qui détourne `claude` de sa connexion ; il ne reçoit ni secret,
// ni jeton, ni grant. Les règles sont tenues par la box : c'est elle qui juge les
// plafonds sur ce que le runner rapporte, qui ne renouvelle le bail que sur une
// empreinte de worktree qui a changé, et qui fait passer la livraison en pass.
// Le runner arrête son cook dès qu'elle le dit — et de lui-même, si son bail
// n'a pas été renouvelé à temps : une box qu'il ne joint plus ne laisse pas un
// cook tourner sans garde.
import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { setTimeout as attendre } from "node:timers/promises";
import { cite, echecDe, type Servi } from "./box.ts";
import { MOTEUR, type Projet } from "./config.ts";

// --- Ce que la box répond. La forme est la sienne (`runtime/src/evenements/distante.ts`) :
// le runner n'en lit que ce qu'il lui faut.

export type Plafonds = { turns: number; durationMs: number; tokens: number; idleMs: number };

// Ce que la box remet avec un ticket : de quoi lancer le même cook qu'elle.
export type Mission = {
  ticket: number;
  title: string;
  run: string;
  // La branche du cook : neuve, à partir de `base`, ou celle de la livraison que
  // la pass a renvoyée (`resumes`).
  branch: string;
  base: string;
  repository: string;
  model: string;
  effort: string;
  prompt: string;
  // Les arguments de `claude` — ceux d'un cook de la box.
  args: string[];
  limits: Plafonds;
  leaseMs: number;
  leaseUntil: string;
  resumes: { returns: number; pr: string | null } | null;
};

export type Reponse =
  | { ok: true; verb: "announce"; provides: string[]; maxCooks: number; presenceMs: number; leaseMs: number; limits: Plafonds }
  | { ok: true; verb: "claim"; mission: Mission | null; held: string | null }
  | { ok: true; verb: "renew"; leaseUntil: string }
  | { ok: true; verb: "deliver"; ending: string; reason: string | null }
  // `stop` : le cook de ce run est arrêté côté box — au runner d'arrêter le sien.
  | { ok: false; verb: string; refusal: string; said: string; stop?: string | null; leaseUntil?: string | null };

// Une demande a sa réponse, ou rien n'est à supposer de ce que la box en a fait.
export type Rendue = { reponse: Reponse } | { muette: string };

// Ce qui règle le runner. `delaiMs` : passé ce délai, un `ssh` qui n'a pas fini est
// arrêté — plus que les trente secondes que le geste de la box laisse au runtime
// pour répondre. `gitMs` : de même pour un `git`, qui joint l'origine.
export type Reglages = { ssh: string; git: string; claude: string; delaiMs: number; connexionS: number; gitMs: number };

// --- Le flux d'un cook. Lu ligne à ligne, comme la box lit celui des siens :
// ce qu'il a consommé (`runtime/src/superviseur.ts`), et comment il a fini
// (`runtime/src/claude.ts`).

const nombre = (valeur: unknown) => (typeof valeur === "number" ? valeur : 0);

const texteDe = (contenu: unknown): string | null => {
  if (!Array.isArray(contenu)) return null;
  const textes = contenu.flatMap((bloc) => (bloc?.type === "text" && typeof bloc.text === "string" ? [bloc.text as string] : []));
  return textes.length === 0 ? null : textes.join("\n");
};

export function ouvrirLecture() {
  // Un tour = un message de l'assistant. `claude` livre un même message en
  // plusieurs lignes qui répètent son usage : seul son dernier usage compte.
  let turns = 0;
  let tokens = 0;
  const usages = new Map<string, number>();
  let message: string | null = null;
  let resultat: { erreur: boolean } | null = null;
  let deconnecte = false;
  let refus = false;
  let rejete = false;
  let quotaDitParErreur = false;

  return {
    // Une ligne illisible est ignorée : le flux d'un process tué s'arrête n'importe où.
    recevoir(ligne: string): void {
      let evenement;
      try {
        evenement = JSON.parse(ligne);
      } catch {
        return;
      }
      if (evenement === null || typeof evenement !== "object") return;
      if (evenement.type === "rate_limit_event") {
        if (evenement.rate_limit_info?.status === "rejected") rejete = true;
      } else if (evenement.type === "assistant") {
        const dit = evenement.message ?? {};
        const id = typeof dit.id === "string" ? dit.id : `sans-id-${usages.size}`;
        // Les lectures de cache ne comptent pas, comme sur la box.
        const usage = nombre(dit.usage?.input_tokens) + nombre(dit.usage?.output_tokens) + nombre(dit.usage?.cache_creation_input_tokens);
        if (!usages.has(id)) turns += 1;
        tokens += usage - (usages.get(id) ?? 0);
        usages.set(id, usage);
        // Seul le fil principal parle au nom du cook, pas ses sous-agents.
        if (evenement.parent_tool_use_id == null) message = texteDe(dit.content) ?? message;
        if (evenement.error === "rate_limit") quotaDitParErreur = true;
        if (evenement.error === "authentication_failed") deconnecte = true;
      } else if (evenement.type === "result") {
        resultat = { erreur: evenement.is_error !== false };
        refus = evenement.stop_reason === "refusal";
        if (typeof evenement.result === "string" && evenement.result !== "") message = evenement.result;
      }
    },
    mesure: () => ({ turns, tokens }),
    // Le dernier message du cook : son compte-rendu, ou l'erreur qui l'a arrêté.
    message: () => message,
    // Pourquoi le cook n'a rien livré, pour ce code de sortie — ou null : il a conclu.
    echec(code: number | null, signal: string | null = null): string | null {
      if (deconnecte) return "disconnected";
      if (refus) return "refused";
      if (code === 0 && resultat !== null && !resultat.erreur) return null;
      if (rejete || quotaDitParErreur) return "quota";
      if (code === null) return signal === null ? "no exit code" : `killed by ${signal}`;
      if (code !== 0) return `exit code ${code}`;
      return resultat === null ? "finished without concluding" : "finished on an error";
    },
  };
}

// Les variables par lesquelles `claude` s'authentifierait autrement que par la
// connexion du poste : aucune ne passe à un cook, ici comme sur la box.
const VARIABLES_DE_JETON = ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "CLAUDE_CODE_OAUTH_TOKEN"];

// L'environnement d'un cook : celui du poste, sans ce qui règle brigade ni rien
// qui détourne `claude` de sa connexion, et sans la mémoire automatique — le même
// tri que celui de la box (`environnementCook`, `runtime/src/claude.ts`). Rien n'y
// est ajouté d'autre : aucun jeton, aucun secret, aucun grant.
export function environnementCook(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const garde = Object.entries(env).filter(([nom]) => !nom.startsWith("BRIGADE_") && !VARIABLES_DE_JETON.includes(nom));
  return { ...Object.fromEntries(garde), CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1" };
}

// --- Le geste de la box.

// Un mot tel que le shell de la box le rendra au geste : entier, sans rien en exécuter.
const mot = (texte: string) => (/^[A-Za-z0-9@._:/=+-]+$/.test(texte) ? texte : `'${texte.replaceAll("'", `'\\''`)}'`);

// La ligne que le runner lance sur la box pour une demande : `pull <station> …`,
// et rien d'autre — aucune adresse, aucun port, rien qui dise où est ce poste.
export const commandeTirer = (station: string, suite: readonly string[]) => ["pull", station, ...suite].map(mot).join(" ");

const objet = (valeur: unknown): valeur is Record<string, unknown> => valeur !== null && typeof valeur === "object" && !Array.isArray(valeur);

// Une demande, lancée une fois : la réponse de la box est un objet JSON, sur la
// dernière ligne de sa sortie, que le geste l'ait servie (code 0) ou refusée
// (code 1). Tout le reste — `ssh` en échec, box muette, runtime à l'arrêt, geste
// d'avant `tirer` — ne dit rien de ce que la box en a fait. `entree` : ce que le
// geste lit sur son entrée standard. Jamais d'exception.
export function tirer(reglages: Reglages, { nom, box }: Servi, station: string, suite: readonly string[], entree: string | null = null, signal?: AbortSignal): Promise<Rendue> {
  const args = ["-o", "BatchMode=yes", "-o", `ConnectTimeout=${reglages.connexionS}`, "--", box.hote, `brigade ${cite(nom)} ${commandeTirer(station, suite)}`];
  const lance = `$ ${reglages.ssh} ${args.join(" ")}`;
  return new Promise((resoudre) => {
    if (signal?.aborted) return resoudre({ muette: "request abandoned before it left" });
    const enfant = execFile(reglages.ssh, args, { signal, timeout: reglages.delaiMs, maxBuffer: 16 * 1024 * 1024 }, (erreur, sortie, erreurs) => {
      const code = erreur === null ? 0 : erreur.code;
      if ((code === 0 || code === 1) && erreur?.killed !== true) {
        try {
          const lue: unknown = JSON.parse(sortie.trim().split("\n").at(-1) ?? "");
          if (objet(lue) && typeof lue.ok === "boolean" && typeof lue.verb === "string") return resoudre({ reponse: lue as Reponse });
        } catch {
          // Pas une réponse : dit plus bas, avec ce qui a été rendu.
        }
      }
      resoudre({ muette: erreur === null ? `${lance}\n${erreurs}${sortie}\n→ unreadable answer: not the JSON object of the \`pull\` action` : echecDe({ lance, erreur, sortie, erreurs }, reglages.delaiMs).erreur });
    });
    // Un `ssh` mort avant d'avoir lu son entrée ne fait pas tomber l'app.
    enfant.stdin?.on("error", () => {});
    enfant.stdin?.end(entree ?? "");
  });
}

// La mission telle que le runner l'accepte : entière, et dont rien ne sort du
// worktree ni de la branche d'un cook une fois passé à `git`. Sinon, rien.
const NOM_DE_RUN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const NOM_DE_BRANCHE = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;
export function missionLue(valeur: unknown): Mission | null {
  if (!objet(valeur)) return null;
  const { ticket, run, branch, base, args, limits, leaseMs, resumes } = valeur;
  const branche = (nom: unknown) => typeof nom === "string" && NOM_DE_BRANCHE.test(nom) && !nom.includes("..") && !nom.endsWith("/") && !nom.endsWith(".lock");
  const positif = (n: unknown) => typeof n === "number" && Number.isFinite(n) && n > 0;
  if (typeof ticket !== "number" || typeof run !== "string" || !NOM_DE_RUN.test(run) || !branche(branch) || !branche(base)) return null;
  if (!Array.isArray(args) || args.length === 0 || args.some((arg) => typeof arg !== "string")) return null;
  if (!objet(limits) || !positif(limits.idleMs) || !positif(leaseMs)) return null;
  if (resumes !== null && !objet(resumes)) return null;
  return valeur as Mission;
}

// --- `git`, dans le clone du projet. Le runner n'y touche que ce qui est à lui :
// le worktree et la branche de chaque cook, et des références à part
// (`refs/brigade/origine/…`) pour ce qu'il rapatrie — ni la branche du chef, ni ses
// branches de suivi ne bougent. L'origine est jointe par son adresse, pas par son
// nom : `git` ne déplace alors aucune branche de suivi au passage.

const connue = (branche: string) => `refs/brigade/origine/${branche}`;
// Les commits que le runner pose lui-même : ce qu'un cook a laissé non commité.
const IDENTITE = ["-c", "user.name=brigade", "-c", "user.email=brigade@localhost", "-c", "commit.gpgsign=false"];
const SUJET_DE_RECOLTE = "brigade : récolte — ce que le cook avait laissé non commité dans son worktree";

const trace = (chemin: string): string => {
  try {
    const { size, mtimeMs } = lstatSync(chemin);
    return `${size}@${mtimeMs}`;
  } catch {
    return "absent";
  }
};

const dit = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur));

// --- Ce que le runner dit de lui.

// `dit` : où en est la station, en une phrase. `cooks` : ceux qui tournent ici.
export type EtatDeStation = { projet: string; station: string; dit: string; cooks: Array<{ ticket: number; run: string }> };

export type OptionsDuRunner = Reglages & {
  // Où se posent les worktrees des cooks : `<worktrees>/<projet>/<run>`.
  worktrees: string;
  // L'environnement du poste : celui de `git`, et celui dont un cook hérite.
  env: NodeJS.ProcessEnv;
  // Entre deux demandes d'une station, et entre deux renouvellements d'un cook.
  // Absent : trente secondes, moins si le délai de présence ou le bail l'exigent.
  pasMs?: number;
  // Ce qu'un cook arrêté reçoit entre SIGTERM et SIGKILL.
  graceMs?: number;
  // Le passage de chaque projet, partagé avec les veilles : un projet n'ouvre
  // qu'une connexion à la fois. Absent, le runner a le sien.
  passage?: Map<string, Promise<unknown>>;
  surEtat?: (etat: EtatDeStation) => void;
};

const PAS_MS = 30_000;
const GRACE_MS = 5_000;
// Ce que la box garde du dernier message d'un cook, et du motif d'un échec.
const MESSAGE_MAX = 20_000;
const RAISON_MAX = 200;

type Annonce = Extract<Reponse, { verb: "announce"; ok: true }>;
type Cook = {
  mission: Mission;
  worktree: string;
  lecture: ReturnType<typeof ouvrirLecture>;
  // Ce qui a arrêté ce cook : la box, ou son bail. Null : il tourne, ou a fini seul.
  arret: string | null;
  arreter(motif: string): void;
  tuer(): void;
};
type Station = {
  projet: Projet & { box: NonNullable<Projet["box"]> };
  nom: string;
  arret: AbortController;
  annonce: Annonce | null;
  cooks: Map<string, Cook>;
  dit: string;
};

export type Runner = ReturnType<typeof ouvrirRunner>;

export function ouvrirRunner(options: OptionsDuRunner) {
  const passage = options.passage ?? new Map<string, Promise<unknown>>();
  const stations = new Map<string, Station>();
  // Le ménage d'un projet, fait une fois avant que ses stations ne prennent.
  const menages = new Map<string, Promise<void>>();
  // Tout ce qui tourne : la boucle de chaque station, et chacun de ses cooks.
  const taches = new Set<Promise<void>>();
  const envGit = { ...options.env, GIT_TERMINAL_PROMPT: "0" };

  const git = (dossier: string, ...args: string[]): Promise<string> =>
    new Promise((resoudre, rejeter) => {
      execFile(options.git, ["-C", dossier, ...args], { env: envGit, timeout: options.gitMs, maxBuffer: 64 * 1024 * 1024 }, (erreur, sortie, erreurs) => {
        if (erreur === null) return resoudre(sortie);
        // Le geste, nommé par sa sous-commande : le premier mot qui n'est ni une option ni un réglage.
        rejeter(new Error(`git ${args.find((arg) => !arg.startsWith("-") && !arg.includes("=")) ?? ""} : ${String(erreurs).trim() || erreur.message}`));
      });
    });

  // Chaque demande attend que la précédente du même projet ait fini, veilles comprises.
  const demander = (station: Station, suite: readonly string[], entree: string | null = null, signal: AbortSignal = station.arret.signal): Promise<Rendue> => {
    const servi = { nom: station.projet.nom, box: station.projet.box };
    const rendue = (passage.get(servi.nom) ?? Promise.resolve()).then(() => tirer(options, servi, station.nom, suite, entree, signal));
    passage.set(servi.nom, rendue);
    return rendue;
  };

  const vu = (station: Station): EtatDeStation => ({ projet: station.projet.nom, station: station.nom, dit: station.dit, cooks: [...station.cooks.values()].map(({ mission }) => ({ ticket: mission.ticket, run: mission.run })) });
  const dire = (station: Station, phrase: string) => {
    if (station.dit === phrase) return;
    station.dit = phrase;
    options.surEtat?.(vu(station));
  };
  const pas = (station: Station) => options.pasMs ?? Math.min(PAS_MS, (station.annonce?.presenceMs ?? Infinity) / 3);
  const pause = (ms: number, signal: AbortSignal) => attendre(ms, undefined, { signal }).catch(() => {});

  // Ce que le worktree porte à cet instant, réduit à une chaîne : la tête de sa
  // branche et l'état de ses fichiers — ce que la box lit elle-même dans les siens.
  async function empreinte(worktree: string): Promise<string> {
    const statut = await git(worktree, "--no-optional-locks", "status", "--porcelain", "-z", "--ignore-submodules=all", "--untracked-files=all");
    const condense = createHash("sha256").update((await git(worktree, "rev-parse", "HEAD")).trim()).update(statut);
    const lignes = statut.split("\0");
    for (let i = 0; i < lignes.length; i++) {
      const ligne = lignes[i] ?? "";
      if (ligne === "") continue;
      condense.update(trace(join(worktree, ligne.slice(3))));
      // Un renommage tient sur deux entrées : la seconde est l'ancien chemin.
      if ("RC".includes(ligne.charAt(0))) i++;
    }
    return condense.digest("hex");
  }

  // Le worktree du cook, sur sa branche : neuve, partie de la base telle que
  // l'origine la porte ; ou celle de la livraison renvoyée, telle que l'origine
  // la porte. Rend le commit que l'origine porte de cette branche — rien, neuve.
  async function preparer(dossier: string, mission: Mission, worktree: string): Promise<string> {
    const origine = (await git(dossier, "remote", "get-url", "origin")).trim();
    await git(dossier, "fetch", "--quiet", "--no-tags", origine, `+refs/heads/${mission.base}:${connue(mission.base)}`);
    let depart = connue(mission.base);
    let surLOrigine = "";
    if (mission.resumes !== null) {
      await git(dossier, "fetch", "--quiet", "--no-tags", origine, `+refs/heads/${mission.branch}:${connue(mission.branch)}`);
      depart = connue(mission.branch);
      surLOrigine = (await git(dossier, "rev-parse", "--verify", depart)).trim();
    }
    mkdirSync(dirname(worktree), { recursive: true });
    await git(dossier, "worktree", "add", "--quiet", "--no-track", "-B", mission.branch, worktree, depart);
    return surLOrigine;
  }

  const commits = async (dossier: string, mission: Mission) => Number((await git(dossier, "rev-list", "--count", `${connue(mission.base)}..refs/heads/${mission.branch}`)).trim());

  const surSaBranche = async (worktree: string, mission: Mission) => (await git(worktree, "symbolic-ref", "--quiet", "--short", "HEAD").catch(() => "")).trim() === mission.branch;
  const traine = async (worktree: string) => (await git(worktree, "--no-optional-locks", "status", "--porcelain", "--ignore-submodules=all")) !== "";
  // Commite sur sa branche ce qu'un cook a laissé non commité dans son worktree.
  async function recolter(worktree: string): Promise<void> {
    await git(worktree, "add", "--all");
    await git(worktree, ...IDENTITE, "commit", "--quiet", "--no-verify", "-m", SUJET_DE_RECOLTE);
  }

  // Ce qu'un cook qui a conclu livre, jugé dans son worktree comme la box juge
  // celui des siens. Des commits : ce qui traîne est commité à sa place, et sa
  // branche est poussée sur l'origine — c'est de là, jamais d'ici, que la box la
  // rapatrie ; un tiers qui y aurait écrit depuis n'est pas écrasé. Aucun commit,
  // un worktree intact : rien n'est poussé, son dernier message est son livrable,
  // et c'est la box qui le lit. Des fichiers écrits et jamais commités, ou une
  // branche quittée : il n'a rien livré. Rend si la branche est poussée, et
  // pourquoi rien n'est livré — ou null.
  async function livrer(dossier: string, cook: Cook, surLOrigine: string): Promise<{ pousse: boolean; raison: string | null }> {
    const { mission, worktree } = cook;
    try {
      if (!(await surSaBranche(worktree, mission))) return { pousse: false, raison: "off-branch" };
      if ((await commits(dossier, mission)) === 0) return { pousse: false, raison: (await traine(worktree)) ? "no-commit" : null };
      if (await traine(worktree)) await recolter(worktree);
      await pousser(dossier, mission, surLOrigine);
      return { pousse: true, raison: null };
    } catch (erreur) {
      return { pousse: false, raison: `push-failed: ${dit(erreur)}` };
    }
  }

  async function pousser(dossier: string, mission: Mission, surLOrigine: string): Promise<void> {
    const origine = (await git(dossier, "remote", "get-url", "--push", "origin")).trim();
    await git(dossier, "push", "--quiet", `--force-with-lease=refs/heads/${mission.branch}:${surLOrigine}`, origine, `refs/heads/${mission.branch}:refs/heads/${mission.branch}`);
  }

  // Range le worktree d'un cook. Ce qui y traîne encore — il n'a rien livré — est
  // commité sur sa branche, qui reste alors dans le clone, jamais poussée : rien
  // n'est perdu, et rien ne part en pass qu'il n'ait livré. La branche part
  // quand tout ce qu'elle porte est sur l'origine.
  async function ranger(station: Station, cook: Cook, pousse: boolean): Promise<void> {
    const { dossier } = station.projet;
    const { mission, worktree } = cook;
    try {
      let garde = !pousse && (await commits(dossier, mission)) > 0;
      if ((await surSaBranche(worktree, mission)) && (await traine(worktree))) {
        await recolter(worktree);
        garde = true;
      }
      await git(dossier, "worktree", "remove", "--force", worktree);
      await git(dossier, "update-ref", "-d", connue(mission.branch)).catch(() => {});
      if (garde) dire(station, `branch \`${mission.branch}\` of ticket #${mission.ticket} stays in ${dossier}: it carries what is not on the origin`);
      else await git(dossier, "branch", "--quiet", "-D", mission.branch);
    } catch (erreur) {
      dire(station, `worktree of ticket #${mission.ticket} not cleaned up (${worktree}) — ${dit(erreur)}`);
    }
  }

  // Les worktrees qu'un lancement précédent a laissés — l'app a été fermée, ou
  // tuée, pendant qu'un cook tournait : plus personne n'en rendra rien. Leurs
  // branches restent.
  async function menage(projet: Projet): Promise<void> {
    const racine = join(options.worktrees, projet.nom);
    if (!existsSync(racine)) return;
    for (const reste of readdirSync(racine)) {
      await git(projet.dossier, "worktree", "remove", "--force", join(racine, reste)).catch(() => {});
      rmSync(join(racine, reste), { recursive: true, force: true });
    }
    await git(projet.dossier, "worktree", "prune").catch(() => {});
  }

  // Rend le ticket : livré — sa branche est sur l'origine —, ou non. Une box
  // muette n'a rien dit de ce qu'elle en a fait : la demande est refaite, tant
  // que le bail du cook court encore.
  async function rendre(station: Station, cook: Cook, raison: string | null, jusqua: number): Promise<void> {
    const { mission } = cook;
    const { turns, tokens } = cook.lecture.mesure();
    const suite = ["return", mission.run, "--end", raison === null ? "livre" : "echec", ...(raison === null ? [] : ["--reason", raison.slice(0, RAISON_MAX)]), "--turns", String(turns), "--tokens", String(tokens)];
    for (;;) {
      const rendue = await demander(station, suite, cook.lecture.message()?.slice(0, MESSAGE_MAX) ?? null);
      if (station.arret.signal.aborted) return;
      if ("reponse" in rendue) {
        const { reponse } = rendue;
        if (reponse.ok && reponse.verb === "deliver") dire(station, `ticket #${mission.ticket} returned: ${reponse.ending}${reponse.reason === null ? "" : ` (${reponse.reason})`}`);
        else if (!reponse.ok) dire(station, `ticket #${mission.ticket}: delivery refused by the box — ${reponse.said}`);
        return;
      }
      if (performance.now() >= jusqua) return dire(station, `ticket #${mission.ticket}: the box did not answer about its delivery before the end of its lease — ${rendue.muette.split("\n").at(-1) ?? ""}`);
      await pause(pas(station), station.arret.signal);
    }
  }

  // Un cook, de la mission à la livraison.
  async function cuisiner(station: Station, mission: Mission): Promise<void> {
    const { dossier } = station.projet;
    const worktree = join(options.worktrees, station.projet.nom, mission.run);
    const lecture = ouvrirLecture();
    // Le bail court depuis la prise, sur l'horloge d'ici : passé sa durée sans
    // renouvellement accepté, le cook est arrêté, que la box réponde ou non.
    let echeance = performance.now() + mission.leaseMs;
    const fini = new AbortController();
    const cook: Cook = { mission, worktree, lecture, arret: null, arreter: () => {}, tuer: () => {} };
    station.cooks.set(mission.run, cook);
    dire(station, `cooking ticket #${mission.ticket} (${mission.run})`);
    try {
      let surLOrigine: string;
      let depart: string;
      try {
        surLOrigine = await preparer(dossier, mission, worktree);
        depart = await empreinte(worktree);
      } catch (erreur) {
        if (station.arret.signal.aborted) return;
        await rendre(station, cook, `worktree-failed: ${dit(erreur)}`, echeance);
        if (existsSync(worktree)) await ranger(station, cook, false);
        return;
      }
      if (station.arret.signal.aborted) return;

      // `detached` : le cook est chef de son groupe, et un signal envoyé au
      // groupe atteint aussi ce qu'il a lancé.
      const enfant = spawn(options.claude, mission.args, { cwd: worktree, env: environnementCook(options.env), detached: true, stdio: ["ignore", "pipe", "pipe"] });
      let mort = false;
      const signaler = (signal: NodeJS.Signals) => {
        if (mort || enfant.pid === undefined) return;
        try {
          process.kill(-enfant.pid, signal);
        } catch {
          // Le groupe n'existe plus : il n'y a plus personne à arrêter.
        }
      };
      let grace: NodeJS.Timeout | undefined;
      cook.arreter = (motif) => {
        if (cook.arret !== null || mort) return;
        cook.arret = motif;
        signaler("SIGTERM");
        grace = setTimeout(() => signaler("SIGKILL"), options.graceMs ?? GRACE_MS);
      };
      cook.tuer = () => signaler("SIGKILL");
      // L'app ferme, ou la station n'est plus à jouer : le cook ne lui survit pas.
      station.arret.signal.addEventListener("abort", cook.tuer, { once: true });
      enfant.stderr.resume();
      const lignes = createInterface({ input: enfant.stdout });
      lignes.on("line", (ligne) => lecture.recevoir(ligne));
      const lu = new Promise<void>((resoudre) => lignes.once("close", resoudre));
      const sortie = new Promise<{ code: number | null; signal: string | null; erreur: string | null }>((resoudre) => {
        enfant.once("error", (erreur) => resoudre({ code: null, signal: null, erreur: erreur.message }));
        enfant.once("exit", (code, signal) => resoudre({ code, signal, erreur: null }));
      });

      // Le bail : à chaque pas, ce que le cook a consommé, et l'empreinte de son
      // worktree si elle a bougé depuis qu'il y est entré — un worktree intact
      // n'est la preuve d'aucun travail. La box juge ; son refus `stopped` arrête
      // le cook d'ici.
      const veille = (async () => {
        const rythme = options.pasMs ?? Math.min(PAS_MS, mission.leaseMs / 4, mission.limits.idleMs / 3);
        for (;;) {
          await pause(rythme, fini.signal);
          if (fini.signal.aborted) return;
          if (performance.now() >= echeance) return cook.arreter("lease");
          const preuve = await empreinte(worktree).catch(() => null);
          const { turns, tokens } = lecture.mesure();
          const rendue = await demander(station, ["renew", mission.run, ...(preuve === null || preuve === depart ? [] : ["--proof", preuve]), "--turns", String(turns), "--tokens", String(tokens)], null, fini.signal);
          if (fini.signal.aborted) return;
          if ("muette" in rendue) continue;
          const { reponse } = rendue;
          if (reponse.ok) echeance = performance.now() + mission.leaseMs;
          else if (reponse.stop != null || reponse.refusal === "stopped" || reponse.refusal === "unknown-run") return cook.arreter(reponse.stop ?? reponse.refusal);
        }
      })();

      const { code, signal, erreur } = await sortie;
      mort = true;
      clearTimeout(grace);
      // Rien ne survit à son cook : ce qui reste de son groupe est tué maintenant.
      try {
        if (enfant.pid !== undefined) process.kill(-enfant.pid, "SIGKILL");
      } catch {
        // Plus personne.
      }
      // Un process échappé du groupe peut tenir le tube ouvert : il n'est pas attendu sans fin.
      await Promise.race([lu, attendre(options.graceMs ?? GRACE_MS, undefined, { ref: false })]);
      lignes.close();
      fini.abort();
      await veille;
      station.arret.signal.removeEventListener("abort", cook.tuer);
      // L'app ferme : rien n'est rendu, rien n'est rangé — le bail tombera de
      // lui-même, et le ménage du lancement suivant retire le worktree.
      if (station.arret.signal.aborted) return;

      if (cook.arret !== null) {
        // Arrêté côté box, rien de ce qu'il livrerait n'est reçu : rien n'est poussé.
        dire(station, `cook of ticket #${mission.ticket} stopped (${cook.arret})`);
        return await ranger(station, cook, false);
      }
      let raison = erreur !== null ? `claude introuvable ou non lancé : ${erreur}` : lecture.echec(code, signal);
      let pousse = false;
      if (raison === null) ({ pousse, raison } = await livrer(dossier, cook, surLOrigine));
      await rendre(station, cook, raison, echeance);
      if (!station.arret.signal.aborted) await ranger(station, cook, pousse);
    } finally {
      fini.abort();
      station.cooks.delete(mission.run);
    }
  }

  // La boucle d'une station : une demande par pas. Tant qu'elle a de la place,
  // elle réclame ; pleine — ou pas encore annoncée —, elle s'annonce : toute
  // demande la dit présente, et l'annonce relit son plafond.
  async function jouer(station: Station): Promise<void> {
    const { signal } = station.arret;
    await menages.get(station.projet.nom);
    while (!signal.aborted) {
      const place = station.annonce !== null && station.cooks.size < station.annonce.maxCooks;
      const rendue = await demander(station, [place ? "claim" : "announce"]);
      if (signal.aborted) return;
      let attente = pas(station);
      if ("muette" in rendue) {
        dire(station, `the box did not answer — ${rendue.muette.split("\n").at(-1) ?? ""}`);
      } else if (!rendue.reponse.ok) {
        // Pas déclarée `distante` sur la box, ou plus : elle redemande, sans insister.
        station.annonce = null;
        attente *= 10;
        dire(station, `refused by the box — ${rendue.reponse.said}`);
      } else if (rendue.reponse.verb === "announce") {
        const premiere = station.annonce === null;
        station.annonce = rendue.reponse;
        if (station.cooks.size === 0) dire(station, `present — provides ${rendue.reponse.provides.join(", ")}`);
        // Annoncée : elle réclame dans la foulée.
        if (premiere) continue;
      } else if (rendue.reponse.verb === "claim") {
        const mission = rendue.reponse.mission === null ? null : missionLue(rendue.reponse.mission);
        if (mission !== null) {
          suivre(station, cuisiner(station, mission));
          // Tant qu'il lui reste de la place, elle réclame sans attendre.
          continue;
        }
        if (rendue.reponse.mission !== null) dire(station, "unreadable mission: nothing is launched — the ticket's lease will lapse on its own");
        else if (station.cooks.size === 0) dire(station, rendue.reponse.held === null ? "present — nothing to take" : `present — withheld by the box (${rendue.reponse.held})`);
      }
      await pause(attente, signal);
    }
  }

  // Ce qui bute dans une tâche ne fait pas tomber l'app : c'est dit, et la tâche finit.
  function suivre(station: Station, tache: Promise<void>): void {
    const suivie = tache.catch((erreur) => dire(station, `the runner stumbled — ${dit(erreur)}`)).finally(() => taches.delete(suivie));
    taches.add(suivie);
  }

  function quitter(station: Station): void {
    station.arret.abort();
    for (const cook of station.cooks.values()) cook.tuer();
  }

  const cle = (projet: Projet, nom: string) => JSON.stringify([projet.nom, projet.dossier, projet.box?.hote, nom]);

  return {
    // Les projets tels que l'app les montre : chacun joue les stations qu'il
    // déclare, s'il a une box et un dossier qui s'ouvre. Une station qui n'est
    // plus déclarée — ou dont le projet a changé de box ou de dossier — est
    // quittée, et ses cooks arrêtés.
    servir(projets: readonly Projet[]): void {
      const voulues = new Map<string, { projet: Station["projet"]; nom: string }>();
      for (const projet of projets) {
        const { box } = projet;
        if (box === undefined || projet.refus !== undefined || projet.desinstalle !== undefined) continue;
        for (const nom of projet.stations ?? []) if (nom.endsWith(`/${MOTEUR}`)) voulues.set(cle(projet, nom), { projet: { ...projet, box }, nom });
      }
      for (const [connue, station] of stations) {
        if (voulues.has(connue)) continue;
        quitter(station);
        stations.delete(connue);
      }
      for (const [neuve, { projet, nom }] of voulues) {
        if (stations.has(neuve)) continue;
        const station: Station = { projet, nom, arret: new AbortController(), annonce: null, cooks: new Map(), dit: "" };
        stations.set(neuve, station);
        if (!menages.has(projet.nom)) menages.set(projet.nom, menage(projet).catch(() => {}));
        suivre(station, jouer(station));
      }
    },

    etats: (): EtatDeStation[] => [...stations.values()].map(vu),

    // Plus rien ne part, et les cooks d'ici sont tués. Rend la main quand tout a fini.
    async fermer(): Promise<void> {
      for (const station of stations.values()) quitter(station);
      stations.clear();
      await Promise.all([...taches]);
    },
  };
}
