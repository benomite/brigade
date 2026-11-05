// Le ticket de réparation d'une base rouge sur le chemin GitHub seul (#2339) :
// la base encore rouge après la relance de ses jobs en échec (#2323) ne fait pas
// qu'attendre, elle ouvre sur le rail un ticket `prio:0` qu'un cook prend tout
// de suite. Son titre nomme la base et le commit ; son corps, chaque check en
// échec avec la fin de sa sortie d'erreur, et la marque cachée du commit rouge.
//
// Un seul ticket par commit rouge, quels que soient les tours ou les stations
// qui le voient : avant d'ouvrir, la station cherche sur GitHub une issue de
// confiance qui porte la marque de ce commit, et n'ouvre rien si elle en trouve
// une. Rien n'est tenu hors de GitHub qu'un cache par station. Rien n'est réglé
// par projet : la base et le client GitHub du projet suffisent.
//
// L'appel vient du tour (`brigade-github.ts`), sur les checks que la relance
// rend : un rouge dont la relance est due ou tourne y est en cours, et n'ouvre
// rien.
import { DE_CONFIANCE } from "../alimenter.ts";
import { etatDeLaBase } from "../github-etat/etats.ts";
import type { Check } from "../events/pass.ts";
import type { IssueOuverte } from "../github.ts";
import { LimiteGitHubAtteinte } from "../limite-github.ts";
import { LABELS_REPARATION, PRIO_REPARATION, shaDeReparation } from "../reparation.ts";

export type CheckDeLaBase = Pick<Check, "outcome"> & Partial<Pick<Check, "name" | "url">>;

// Ce que l'ouverture lit et écrit de GitHub.
export type GitHubDeLaReparation = {
  // Le dernier commit de la branche d'intégration.
  teteDeLaBase(): Promise<string>;
  // Les issues modifiées depuis `instant`, ouvertes ou fermées, avec leur corps.
  issuesDepuis(instant: string): Promise<Pick<IssueOuverte, "number" | "body" | "association">[]>;
  // Crée une issue ; rend son numéro.
  creerIssue(issue: { titre: string; corps: string; labels: string[] }): Promise<number>;
  fermerIssue(numero: number): Promise<void>;
  // Le journal du job d'un check de GitHub Actions, ou null. Sans lui, le
  // ticket nomme ses checks sans leur sortie.
  journalDuCheck?(check: Check): Promise<string | null>;
};

// La marque cachée du ticket, avec le sha complet du commit rouge.
const MARQUE = /^\s*<!--\s*brigade:base-rouge sha=([0-9A-Za-z._-]+)\s*-->\s*$/m;
export const marqueDeBaseRouge = (sha: string) => `<!-- brigade:base-rouge sha=${sha} -->`;
// Le commit qu'une issue répare : sa marque, ou celle que l'ancien chemin et
// #2214 posaient (`reparation.ts`) — une réparation déjà ouverte ainsi compte.
export const shaDeBaseRouge = (corps: string): string | null => MARQUE.exec(corps)?.[1] ?? shaDeReparation(corps);

// Un ticket est une réparation de base s'il porte la priorité des réparations et
// la marque d'un commit dans son corps : la seule livraison qu'une base rouge
// ne retient pas.
export const estUneReparation = (corps: string, labels: string[]): boolean => labels.includes(PRIO_REPARATION) && shaDeBaseRouge(corps) !== null;

// Jusqu'où on cherche, sur GitHub, la réparation d'un rouge dont cette station
// n'a pas ouvert le ticket (une autre, ou elle-même avant un redémarrage).
const FENETRE_MS = 7 * 24 * 3600 * 1000;

// La sortie d'un check gardée dans le ticket : ses dernières lignes, jusqu'à la
// dernière erreur que GitHub Actions y annonce. Le corps d'une issue tient en
// 65 536 caractères : les checks se partagent `SORTIES_MAX`, chacun
// `SORTIE_MAX` au plus.
export const LIGNES_MAX = 80;
export const SORTIE_MAX = 6_000;
const SORTIES_MAX = 45_000;
const SORTIE_MIN = 1_000;

const ANSI = /\x1b\[[0-9;]*[A-Za-z]/g;
const HORODATAGE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z ?/;

// La fin utile d'un journal de job : sans couleurs ni horodatage, coupée après
// sa dernière ligne `##[error]` (ce qui suit est le ménage du job), ses
// `LIGNES_MAX` dernières lignes, `plafond` caractères au plus — la fin gardée.
export function sortieDErreur(journal: string, plafond = SORTIE_MAX): string {
  const lignes = journal
    .split(/\r?\n/)
    .map((ligne) => ligne.replace(ANSI, "").replace(HORODATAGE, "").trimEnd())
    .filter((ligne) => !/^##\[(?:group|endgroup)\]/.test(ligne));
  const derniere = lignes.findLastIndex((ligne) => ligne.startsWith("##[error]"));
  const utiles = (derniere === -1 ? lignes : lignes.slice(0, derniere + 1)).slice(-LIGNES_MAX);
  while (utiles.length > 0 && utiles[0]?.trim() === "") utiles.shift();
  while (utiles.length > 0 && utiles.at(-1)?.trim() === "") utiles.pop();
  const texte = utiles.join("\n");
  if (texte.length <= plafond) return texte;
  const fin = texte.slice(texte.length - plafond);
  // Coupée à une ligne entière quand il y en a une.
  const saut = fin.indexOf("\n");
  return `…\n${saut === -1 || saut === fin.length - 1 ? fin : fin.slice(saut + 1)}`;
}

// Une clôture de bloc plus longue que toute suite d'accents graves du texte.
const cloture = (texte: string) => "`".repeat(Math.max(3, ...[...texte.matchAll(/`+/g)].map(([suite]) => suite.length + 1)));

const court = (sha: string) => sha.slice(0, 7);
const nomDe = (check: CheckDeLaBase) => check.name ?? "unnamed check";

export type EchecDeLaBase = { nom: string; url: string | null; sortie: string | null };

export function titreDeLaReparation(base: string, sha: string, echecs: EchecDeLaBase[]): string {
  const [premier, ...autres] = echecs;
  return `Repair \`${base}\`, red on ${court(sha)}: ${premier?.nom ?? "checks"}${autres.length === 0 ? "" : ` (and ${autres.length} more)`}`;
}

export function corpsDeLaReparation(base: string, sha: string, echecs: EchecDeLaBase[]): string {
  const sorties = echecs.flatMap(({ nom, url, sortie }) => {
    const titre = `### \`${nom}\``;
    if (sortie === null || sortie === "") return [titre, "", url === null ? "_GitHub gives no output for this check._" : `_GitHub gives no output for this check: ${url}_`, ""];
    const bloc = cloture(sortie);
    return [titre, "", ...(url === null ? [] : [url, ""]), bloc, sortie, bloc, ""];
  });
  return [
    marqueDeBaseRouge(sha),
    "",
    "## Context",
    "",
    `The integration branch \`${base}\` is red on \`${sha}\`, and still red after its failed jobs were re-run once. While it is red, the kitchen merges nothing — this ticket is the only delivery that is merged on a red base.`,
    "",
    "## What fails",
    "",
    ...(echecs.length === 0 ? ["- (GitHub names no failing check)"] : echecs.map(({ nom }) => `- \`${nom}\``)),
    "",
    ...(sorties.length === 0 ? [] : ["## Error output", "", ...sorties]),
    "## Acceptance criteria",
    "",
    `- The CI of \`${base}\` is green once this delivery is merged.`,
    "- What failed is fixed at its cause: no test is removed, skipped or weakened to turn green.",
    "",
    "---",
    "",
    `_Opened by a station, with no gesture from the chef: \`${PRIO_REPARATION}\`, it goes before the whole rail._`,
  ].join("\n");
}

export type OuvertureDeLaReparation = {
  // Le commit rouge et le ticket qui le répare ; nuls quand la base n'est pas rouge.
  sha: string | null;
  reparation: number | null;
  // Pourquoi le ticket n'a pas pu être ouvert ou retrouvé : le tour suivant
  // réessaie, la base rouge n'en retient pas moins les merges.
  erreur?: string;
};

export type OptionsDeLOuverture = {
  github: GitHubDeLaReparation;
  base: string;
  maintenant?: () => Date;
};

export function ouvreReparation({ github, base, maintenant = () => new Date() }: OptionsDeLOuverture) {
  // Cache, pas état : les rouges dont on sait déjà le ticket.
  const connus = new Map<string, number>();
  // Deux appels sur le même rouge : GitHub n'est lu qu'une fois.
  const enCours = new Map<string, Promise<number>>();

  // Ce qui a échoué, avec la sortie de chaque check. Un journal illisible
  // n'empêche pas le ticket, sauf GitHub qui limite ses appels : le tour
  // suivant réessaie, journaux compris.
  const echecsDe = async (rouges: CheckDeLaBase[]): Promise<EchecDeLaBase[]> => {
    const plafond = Math.max(SORTIE_MIN, Math.min(SORTIE_MAX, Math.floor(SORTIES_MAX / Math.max(1, rouges.length))));
    const echecs: EchecDeLaBase[] = [];
    for (const check of rouges) {
      const url = check.url ?? null;
      let journal: string | null = null;
      try {
        journal = (await github.journalDuCheck?.({ name: nomDe(check), outcome: "red", conclusion: "failure", url })) ?? null;
      } catch (erreur) {
        if (erreur instanceof LimiteGitHubAtteinte) throw erreur;
      }
      echecs.push({ nom: nomDe(check), url, sortie: journal === null ? null : sortieDErreur(journal, plafond) });
    }
    return echecs;
  };

  const reparationDe = (sha: string, rouges: CheckDeLaBase[]): Promise<number> => {
    const connu = connus.get(sha);
    if (connu !== undefined) return Promise.resolve(connu);
    const deja = enCours.get(sha);
    if (deja !== undefined) return deja;
    const ouverture = (async () => {
      const depuis = new Date(maintenant().getTime() - FENETRE_MS).toISOString();
      // Les réparations de ce rouge, de la plus ancienne à la plus récente. Une
      // marque posée par un inconnu ne fait taire aucun rouge.
      const dece = async () =>
        (await github.issuesDepuis(depuis))
          .filter((issue) => DE_CONFIANCE.includes(issue.association) && shaDeBaseRouge(issue.body) === sha)
          .map((issue) => issue.number)
          .sort((x, y) => x - y);
      let [numero] = await dece();
      if (numero === undefined) {
        const echecs = await echecsDe(rouges);
        const creee = await github.creerIssue({ titre: titreDeLaReparation(base, sha, echecs), corps: corpsDeLaReparation(base, sha, echecs), labels: LABELS_REPARATION });
        // Deux stations qui ont vu le rouge ensemble en ont chacune ouvert une :
        // la plus ancienne reste, l'autre se ferme.
        const [premiere = creee] = await dece();
        if (premiere < creee) await github.fermerIssue(creee);
        numero = Math.min(premiere, creee);
      }
      connus.set(sha, numero);
      return numero;
    })().finally(() => enCours.delete(sha));
    enCours.set(sha, ouverture);
    return ouverture;
  };

  // Les checks de la base, tels que la relance les rend. Rouges, son commit
  // rouge a son ticket de réparation ; si GitHub refuse de le créer, l'erreur
  // est rendue et le tour suivant la retente.
  return async (checks: CheckDeLaBase[]): Promise<OuvertureDeLaReparation> => {
    if (etatDeLaBase(checks) !== "red") return { sha: null, reparation: null };
    const rouges = checks.filter((check) => check.outcome === "red");
    const sha = await github.teteDeLaBase();
    try {
      return { sha, reparation: await reparationDe(sha, rouges) };
    } catch (erreur) {
      return { sha, reparation: null, erreur: erreur instanceof Error ? erreur.message : String(erreur) };
    }
  };
}
