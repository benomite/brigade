// Les décisions du chef : ce qu'il décide pour son projet et qui n'est pas un
// fait de la machine — les stations, les seuils de coût, le calibrage du
// manager et du reviewer. Leur support est le journal du projet, dans le
// répertoire d'état : ni le dépôt, où un cook peut écrire — un plafond qu'un
// cook peut relever n'est pas un plafond —, ni le drop-in de l'unité, qui ne
// change que par un `sudo` et un redémarrage. La cloison masque le répertoire
// d'état à tout ce qu'elle lance, et le runtime refuse de démarrer si son
// journal est sous le clone.
//
// Le runtime les relit à chaque lecture : une décision posée vaut à la
// suivante, sans redémarrage, et n'arrête rien de ce qui tourne. Posée, elle
// l'emporte sur la variable d'environnement de même nom ; retirée ou jamais
// posée, la variable est lue comme avant. Aucune n'a de défaut : sans décision
// ni variable, rien n'est supposé.
import { existsSync } from "node:fs";
import { Base } from "./base.ts";
import { EFFORTS, MODELES, type Calibrage } from "./calibrage.ts";
import { sous } from "./cloison.ts";
import { lireSeuils } from "./derive.ts";
import type { Evenement } from "./evenements.ts";
import type { Seuils } from "./evenements/derive.ts";
import { cheminJournal, type Journal } from "./journal.ts";
import { configManager } from "./manager.ts";
import { configReviewer } from "./reviewer.ts";
import { ConfigInvalide } from "./runtime.ts";
import { lireStations, type StationDeclaree } from "./stations-declarees.ts";

// Les décisions, nommées par la variable qu'elles remplacent.
export const DECISIONS = [
  "BRIGADE_STATIONS",
  "BRIGADE_DRIFT_TICKET_TOKENS",
  "BRIGADE_DRIFT_LOST_TOKENS",
  "BRIGADE_MANAGER_MODEL",
  "BRIGADE_MANAGER_EFFORT",
  "BRIGADE_REVIEWER_MODEL",
  "BRIGADE_REVIEWER_EFFORT",
] as const;

export type Decision = (typeof DECISIONS)[number];

// Celles sans lesquelles ce runtime ne sert pas : sans calibrage il refuse de
// démarrer, sans station il démarre et aucun cook ne part. Les seuils n'en
// sont pas : non déclarés, ils ne signalent rien. La bascule ne lance pas le
// code qu'elle pose : elle les lit dans `deploy/decisions-obligatoires`, que
// cette liste tient — un test les garde d'accord.
export const OBLIGATOIRES: readonly Decision[] = ["BRIGADE_STATIONS", "BRIGADE_MANAGER_MODEL", "BRIGADE_MANAGER_EFFORT", "BRIGADE_REVIEWER_MODEL", "BRIGADE_REVIEWER_EFFORT"];
export type Posees = Partial<Record<Decision, string>>;

const POSEE = "decision.set";
const RETIREE = "decision.withdrawn";

const ou = (valeurs: readonly string[]) => `${valeurs.slice(0, -1).join(", ")} ou ${valeurs.at(-1)}`;
const parmi = (admis: readonly string[]) => (nom: Decision, valeur: string) => {
  if (!admis.includes(valeur)) throw new ConfigInvalide(`${nom} invalide : « ${valeur} » — attendu ${ou(admis)}`);
};

// Ce qu'une valeur doit être, lue seule : le lecteur même du runtime, pour
// qu'une décision ne puisse pas valoir ce que la variable ne vaudrait pas.
const VERIFIER: Record<Decision, (nom: Decision, valeur: string) => void> = {
  BRIGADE_STATIONS: (nom, valeur) => void lireStations({ [nom]: valeur }),
  BRIGADE_DRIFT_TICKET_TOKENS: (nom, valeur) => void lireSeuils({ [nom]: valeur }),
  BRIGADE_DRIFT_LOST_TOKENS: (nom, valeur) => void lireSeuils({ [nom]: valeur }),
  BRIGADE_MANAGER_MODEL: parmi(MODELES),
  BRIGADE_MANAGER_EFFORT: parmi(EFFORTS),
  BRIGADE_REVIEWER_MODEL: parmi(MODELES),
  BRIGADE_REVIEWER_EFFORT: parmi(EFFORTS),
};

export const estUneDecision = (nom: string): nom is Decision => (DECISIONS as readonly string[]).includes(nom);

function exigerDecision(nom: string): Decision {
  if (!estUneDecision(nom)) throw new ConfigInvalide(`« ${nom} » n'est pas une décision du chef — attendu ${ou(DECISIONS)}`);
  return nom;
}

// Refuse une valeur que le runtime ne lirait pas. Vide, ce n'est pas une
// valeur : une décision se retire, elle ne se pose pas à rien.
export function verifierDecision(nom: string, valeur: string): void {
  const decision = exigerDecision(nom);
  if (valeur.trim() === "") throw new ConfigInvalide(`${decision} : une valeur vide n'est pas une décision — la retirer pour revenir à l'environnement`);
  VERIFIER[decision](decision, valeur.trim());
}

// Les décisions que le journal porte, relues à chaque appel. Une décision que
// ce runtime ne connaît pas — écrite par une version plus récente — est
// ignorée.
export function decisionsPosees(base: Base): Posees {
  const posees: Posees = {};
  const lignes = base.lire<{ type: string; payload: string }>("SELECT type, payload FROM events WHERE type IN (?, ?) ORDER BY seq", POSEE, RETIREE);
  for (const { type, payload } of lignes) {
    const { name, value } = JSON.parse(payload) as { name?: unknown; value?: unknown };
    if (typeof name !== "string" || !estUneDecision(name)) continue;
    if (type === RETIREE) delete posees[name];
    else if (typeof value === "string") posees[name] = value;
  }
  return posees;
}

// L'environnement tel que le runtime le lit : celui de son process, où chaque
// décision posée remplace la variable de même nom.
export function environnementDecide(env: Record<string, string | undefined>, posees: Posees): Record<string, string | undefined> {
  return { ...env, ...posees };
}

// Le support des décisions : le journal du répertoire d'état. Sous le clone,
// un cook pourrait l'atteindre — c'est un refus de démarrer.
export function supportDesDecisions(lieux: { repertoireEtat: string; clone: string }): string {
  const support = cheminJournal(lieux.repertoireEtat);
  if (sous(lieux.clone, support)) {
    throw new ConfigInvalide(
      `BRIGADE_STATE_DIR (${lieux.repertoireEtat}) est sous BRIGADE_REPO_DIR (${lieux.clone}) : les décisions du chef y seraient à portée d'un cook — un plafond qu'un cook peut relever n'est pas un plafond. Poser le répertoire d'état hors du clone`,
    );
  }
  return support;
}

// Les décisions que le runtime lit avant de démarrer, avant d'avoir ouvert son
// journal pour y écrire : aucun journal, aucune décision. Une décision
// illisible est un refus de démarrer, comme la variable le serait.
export function decisionsAuDemarrage(repertoireEtat: string): Posees {
  const chemin = cheminJournal(repertoireEtat);
  if (!existsSync(chemin)) return {};
  const base = new Base(chemin, { lectureSeule: true, attenteMs: 5000 });
  try {
    const posees = decisionsPosees(base);
    for (const [nom, valeur] of Object.entries(posees)) {
      try {
        verifierDecision(nom, valeur);
      } catch (erreur) {
        throw new ConfigInvalide(`décision du chef illisible au journal — ${erreur instanceof Error ? erreur.message : String(erreur)}`);
      }
    }
    return posees;
  } finally {
    base.fermer();
  }
}

// Pose une décision au journal, au nom de `auteur`. Rend le fait écrit, ou
// null si elle valait déjà cela. Une valeur que le runtime ne lirait pas est
// refusée, et rien n'est écrit. N'écrit que le journal : ni le dépôt, ni le
// drop-in, et rien n'est arrêté ni relancé.
export function poserDecision(journal: Journal, pose: { projet: string; nom: string; valeur: string; auteur: string }): Evenement | null {
  verifierDecision(pose.nom, pose.valeur);
  const nom = pose.nom as Decision;
  const value = pose.valeur.trim();
  return journal.base.transaction(() => {
    const previous = decisionsPosees(journal.base)[nom] ?? null;
    if (previous === value) return null;
    return journal.ajouter({ project: pose.projet, ticket: null, author: pose.auteur, type: POSEE, payload: { name: nom, value, previous } });
  });
}

// Retire une décision : l'environnement est relu comme avant. Rend le fait
// écrit, ou null si le journal n'en portait pas.
export function retirerDecision(journal: Journal, retrait: { projet: string; nom: string; auteur: string }): Evenement | null {
  const nom = exigerDecision(retrait.nom);
  return journal.base.transaction(() => {
    const previous = decisionsPosees(journal.base)[nom];
    if (previous === undefined) return null;
    return journal.ajouter({ project: retrait.projet, ticket: null, author: retrait.auteur, type: RETIREE, payload: { name: nom, previous } });
  });
}

// Ce que le runtime lit des décisions, à chaque appel.
export type Decisions = {
  stations(): StationDeclaree[];
  seuils(): Seuils;
  manager(): Calibrage;
  reviewer(): Calibrage;
};

// Suit les décisions du chef sur le journal de `base`, par-dessus `env`.
// Chaque lecture relit le journal. Ce qui ne se lit plus — une décision
// retirée sans variable derrière, un journal momentanément illisible — ne
// tombe pas sur un défaut : le runtime s'en tient à ce qu'il lisait, et le dit
// une fois. La première lecture, elle, n'a rien à quoi se tenir : illisible,
// c'est un refus de démarrer.
export function suivreDecisions(base: Base, env: Record<string, string | undefined>, avertir: (message: string) => void = (message) => console.error(message)): Decisions {
  const decide = () => environnementDecide(env, decisionsPosees(base));
  const suivre = <T>(quoi: string, lire: (env: Record<string, string | undefined>) => T): (() => T) => {
    let retenue = lire(decide());
    let dit: string | null = null;
    return () => {
      try {
        retenue = lire(decide());
        dit = null;
      } catch (erreur) {
        const motif = erreur instanceof Error ? erreur.message : String(erreur);
        if (motif !== dit) avertir(`brigade : ${quoi} non relu — ${motif} ; le runtime s'en tient à ce qu'il lisait`);
        dit = motif;
      }
      return retenue;
    };
  };
  return {
    stations: suivre("les stations", lireStations),
    seuils: suivre("les seuils de la dérive", lireSeuils),
    manager: suivre("le calibrage du manager", (lu) => configManager(lu).calibrage),
    reviewer: suivre("le calibrage du reviewer", (lu) => configReviewer(lu).calibrage),
  };
}
