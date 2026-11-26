// Le post-mortem automatique d'une panne (#4023, spec 2026-11-23-autonomy-trust-control, section T4) : une panne de plus
// de 30 minutes laisse cinq champs — la cause, la durée, qui l'a vue en premier (le système ou le chef), ce qui l'a
// corrigée, le ticket du correctif —, rangés par projet et par panne dans le répertoire d'état. La panne vient des
// événements de panne que le code a déjà (début et fin enregistrés) : rien ici ne détecte une panne de plus.
// « Qui l'a vu en premier » se lit de deux horodatages, jamais d'une saisie : le plus tôt gagne, à égalité le système.
//
// #4382 : le signalement du chef est la date d'un de ses commentaires sur GitHub qui nomme l'état en échec ; ce qui a
// corrigé la panne est le dernier correctif de la base que le tour a vu pendant elle (superviseur/tour.ts) ; une panne
// ouverte est tenue dans le répertoire d'état d'un process à l'autre, et part du début que portent les checks rouges.
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Commentaire } from "../github.ts";
import { duBot } from "../reponse-par-commentaire/reponse-par-commentaire.ts";

// Strictement au-delà : une panne de 30 minutes pile n'en laisse aucun.
export const POST_MORTEM_APRES_MS = 30 * 60_000;

type Panne = {
  id: string;
  debut: string;
  fin: string;
  cause: string;
  // Le premier signe que le système a écrit de la panne, et le premier signe qui en est venu au chef ; nuls quand il n'y en a pas.
  detecteeParLeSysteme: string | null;
  signaleeParLeChef: string | null;
  // Ce qui l'a corrigée et le ticket du correctif ; nuls quand rien ne l'a dit.
  corrigePar: string | null;
  ticketDuCorrectif: string | null;
  // La fin n'a pas été vue : le runtime ne tournait pas quand `main` est redevenue verte ; `fin` est le premier tour qui l'a vue verte.
  finNonObservee?: true;
};

// Ce que l'écran dit de ce qui a corrigé une panne dont la fin n'a pas été vue : il n'y a pas de source.
export const FIN_NON_OBSERVEE = "not recorded — the end of the outage was not observed: the runtime was not running when main turned green";
// Et de ce qui a corrigé une panne finie sous ses yeux sans qu'aucun correctif de la base n'ait été vu.
export const AUCUN_CORRECTIF_VU = "not recorded — no merge and no supervisor repair was seen while main was red";

// Les cinq champs, et eux seuls.
export type PostMortem = { cause: string; duree: string; vuEnPremier: "system" | "chef"; corrige: string | null; ticket: string | null };
// Rangé : le post-mortem à ses cinq champs, et à côté la fin de sa panne et la date du signalement du chef, nulle sans lui (#4382).
type Rangee = { id: string; fin: string; signaleeParLeChef?: string | null; postMortem: PostMortem };

const chemin = (dossier: string, projet: string) => join(dossier, "post-mortems", `${encodeURIComponent(projet)}.json`);

const instant = (iso: string | null, quoi: string): number | null => {
  if (iso === null) return null;
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) throw new Error(`${quoi} is not a date: ${iso}`);
  return ms;
};

// Absent, le fichier n'a pas de rangée ; illisible, il est refusé — jamais lu vide puis écrasé.
function lireRangees(dossier: string, projet: string): Rangee[] {
  let brut: string;
  try {
    brut = readFileSync(chemin(dossier, projet), "utf8");
  } catch (erreur) {
    if ((erreur as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw erreur;
  }
  const lu: unknown = JSON.parse(brut);
  if (!Array.isArray(lu)) throw new Error(`the post-mortems of ${projet} are not a list`);
  return lu as Rangee[];
}

export function vuEnPremier(detecteeParLeSysteme: string | null, signaleeParLeChef: string | null): "system" | "chef" {
  const systeme = instant(detecteeParLeSysteme, "the system's first detection");
  const chef = instant(signaleeParLeChef, "the chef's first report");
  if (systeme === null && chef === null) throw new Error("an outage nobody saw has no one who saw it first");
  if (chef === null) return "system";
  if (systeme === null) return "chef";
  return chef < systeme ? "chef" : "system";
}

// La panne qui vient de finir : son post-mortem si elle a duré plus de 30 minutes, nul sinon. La rejouer ne double rien :
// elle rend celui qui est déjà rangé.
export function terminerLaPanne(dossier: string, projet: string, panne: Panne): PostMortem | null {
  const debut = instant(panne.debut, "the start of the outage") as number;
  const fin = instant(panne.fin, "the end of the outage") as number;
  if (fin - debut <= POST_MORTEM_APRES_MS) return null;
  const rangees = lireRangees(dossier, projet);
  const deja = rangees.findIndex(({ id }) => id === panne.id);
  if (deja !== -1) return lirePostMortems(dossier, projet)[deja] as PostMortem;
  const minutes = `${Math.round((fin - debut) / 60_000)} min`;
  const postMortem: PostMortem = {
    cause: panne.cause,
    duree: panne.finNonObservee ? `at most ${minutes}` : minutes,
    vuEnPremier: vuEnPremier(panne.detecteeParLeSysteme, panne.signaleeParLeChef),
    corrige: panne.corrigePar ?? (panne.finNonObservee ? FIN_NON_OBSERVEE : null),
    ticket: panne.ticketDuCorrectif,
  };
  mkdirSync(join(dossier, "post-mortems"), { recursive: true });
  const fichier = chemin(dossier, projet);
  writeFileSync(`${fichier}.tmp`, JSON.stringify([...rangees, { id: panne.id, fin: panne.fin, signaleeParLeChef: panne.signaleeParLeChef, postMortem }]));
  renameSync(`${fichier}.tmp`, fichier);
  return postMortem;
}

// Les post-mortems du projet, dans l'ordre où ils ont été rangés.
export function lirePostMortems(dossier: string, projet: string): PostMortem[] {
  return lireRangees(dossier, projet).map(({ postMortem }) => postMortem);
}

// La fin de la panne de chaque post-mortem, dans le même ordre que `lirePostMortems` : `facts` les publie ensemble, la vue
// du projet trie et compte sur 7 jours d'après elle.
export function lireLesFinsDesPannes(dossier: string, projet: string): string[] {
  return lireRangees(dossier, projet).map(({ fin }) => fin);
}

// Ce qui nomme l'état en échec : `main`, la CI, un check ou les tests, dits rouges, en échec ou cassés.
const SUJET = /\b(main|ci|build|checks?|tests?|pipeline|workflows?)\b/i;
const ECHEC = /\b(red|fail(s|ed|ing|ure)?|broken|breaks?|down)\b/i;
const nommeLEchec = (texte: string) => SUJET.test(texte) && ECHEC.test(texte);

// Le signalement du chef : le plus tôt de ses commentaires écrits pendant la panne dont les mots, ou le titre de l'issue
// commentée, nomment l'état en échec — à sa date à lui. Un commentaire d'un autre, ou que la cuisine a écrit, n'en est jamais un.
export function signalementDuChef(commentaires: readonly (Commentaire & { issue?: number })[], { chef, debut, fin, titre }: { chef: string; debut: string; fin: string; titre: (issue: number) => string | undefined }): string | null {
  const [depuis, jusqua] = [Date.parse(debut), Date.parse(fin)];
  const dates = commentaires
    .filter((commentaire) => commentaire.author.toLowerCase() === chef.toLowerCase() && !duBot(commentaire))
    .filter(({ createdAt }) => Date.parse(createdAt) >= depuis && Date.parse(createdAt) <= jusqua)
    .filter(({ body, issue }) => nommeLEchec(body) || nommeLEchec((issue === undefined ? undefined : titre(issue)) ?? ""))
    .map(({ createdAt }) => createdAt)
    .sort((a, b) => Date.parse(a) - Date.parse(b));
  return dates[0] ?? null;
}

// La panne ouverte, tenue d'un process à l'autre (#4382) : son début et le premier tour qui l'a vue.
export type PanneOuverte = { debut: string; detecteeParLeSysteme: string };
export type GardeDeLaPanne = { lire(): PanneOuverte | null; ecrire(ouverte: PanneOuverte | null): void };

const cheminOuverte = (dossier: string, projet: string) => join(dossier, "post-mortems", "open", `${encodeURIComponent(projet)}.json`);

// La garde dans le répertoire d'état. Un fichier illisible est dit, et laissé tel quel : la panne se suit alors en mémoire
// seulement, jamais d'un fichier lu vide puis écrasé.
export function gardeDeLaPanne(dossier: string, projet: string, dire: (ligne: string) => void): GardeDeLaPanne {
  const fichier = cheminOuverte(dossier, projet);
  let tenue = true;
  return {
    lire: () => {
      let brut: string;
      try {
        brut = readFileSync(fichier, "utf8");
      } catch (erreur) {
        if ((erreur as NodeJS.ErrnoException).code === "ENOENT") return null;
        tenue = false;
        dire(`the open outage of ${projet} was not read, it is followed in memory only — ${erreur instanceof Error ? erreur.message : String(erreur)}`);
        return null;
      }
      try {
        const lue = JSON.parse(brut) as Partial<PanneOuverte> | null;
        if (typeof lue?.debut === "string" && !Number.isNaN(Date.parse(lue.debut)) && typeof lue.detecteeParLeSysteme === "string" && !Number.isNaN(Date.parse(lue.detecteeParLeSysteme))) return { debut: lue.debut, detecteeParLeSysteme: lue.detecteeParLeSysteme };
      } catch {}
      tenue = false;
      dire(`the open outage of ${projet} is not an outage (${fichier}), it is left as it is and followed in memory only`);
      return null;
    },
    ecrire: (ouverte) => {
      if (!tenue) return;
      if (ouverte === null) return rmSync(fichier, { force: true });
      mkdirSync(join(dossier, "post-mortems", "open"), { recursive: true });
      writeFileSync(`${fichier}.tmp`, JSON.stringify(ouverte));
      renameSync(`${fichier}.tmp`, fichier);
    },
  };
}

const plusTot = (...instants: (string | null | undefined)[]): string =>
  (instants.filter((instant): instant is string => typeof instant === "string" && !Number.isNaN(Date.parse(instant))).sort((a, b) => Date.parse(a) - Date.parse(b))[0]) as string;

// `main` rouge, la panne que le superviseur observe déjà (`mainRougeDepuis`, tour.ts) : son début est le plus tôt de celui
// qu'il a noté et de celui que portent les checks rouges (`debutDuCheck`), sa fin le tour qui la voit verte. Le système
// l'a vue au premier tour rouge. Avec une garde, la panne ouverte survit au redémarrage : après lui, une base déjà verte
// à la première lecture des checks (`checksLus`) la termine sans en avoir vu la fin.
export function suivreLaBaseRouge(enregistrer: (panne: Panne) => void, garde?: GardeDeLaPanne): (mainRougeDepuis: string | null, maintenant: Date, debutDuCheck?: string | null, checksLus?: boolean) => void {
  let enCours: PanneOuverte | null = null;
  let aReprendre = garde !== undefined;
  // La panne en cours a été vue rouge par ce process.
  let vueRouge = false;
  return (mainRougeDepuis, maintenant, debutDuCheck = null, checksLus = true) => {
    if (aReprendre) {
      aReprendre = false;
      enCours = garde?.lire() ?? null;
    }
    if (mainRougeDepuis !== null) {
      const suivante = { debut: plusTot(enCours?.debut, mainRougeDepuis, debutDuCheck), detecteeParLeSysteme: enCours?.detecteeParLeSysteme ?? mainRougeDepuis };
      if (suivante.debut !== enCours?.debut || suivante.detecteeParLeSysteme !== enCours.detecteeParLeSysteme) garde?.ecrire(suivante);
      enCours = suivante;
      vueRouge = true;
      return;
    }
    if (enCours === null) return;
    // Reprise d'avant le redémarrage, la panne attend la lecture des checks de `main`.
    if (!vueRouge && !checksLus) return;
    const { debut, detecteeParLeSysteme } = enCours;
    const finNonObservee = !vueRouge;
    enCours = null;
    vueRouge = false;
    enregistrer({ id: `main-red@${debut}`, debut, fin: maintenant.toISOString(), cause: "main was red", detecteeParLeSysteme, signaleeParLeChef: null, corrigePar: null, ticketDuCorrectif: null, ...(finNonObservee ? { finNonObservee: true as const } : {}) });
    garde?.ecrire(null);
  };
}
