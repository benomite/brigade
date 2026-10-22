// Ajouter une station à un projet déjà cloné sur la machine (épique 1301,
// #1306) : on ne demande au chef que ce qui est à cette machine. Le dépôt
// GitHub se lit sur l'`origin` du clone, la branche d'intégration dans ce que
// le dépôt déclare (`reglages-projet/reglages.ts`) — ni l'un ni l'autre ne se
// retape.
//
// Deux opérations, que l'app appelle à côté d'elle (`app/src/main.ts`,
// `duRuntime`) :
//   - `defautsDeStation` : ce que le formulaire montre d'emblée, sans rien
//     demander — les cooks que les cœurs de la machine permettent (le calcul
//     même de la station, `plafondDesCoeurs`), le dossier où elle pose les
//     espaces de travail de ses cooks, et ce que la machine sait faire
//     (Chrome, le SDK Android…), chaque capacité dite détectée ou non. La
//     machine est regardée, rien ne s'y lance (`installation/besoins/fourni.ts`) ;
//   - `ajouterUneStation` : la ligne de la demande que l'app écrit dans le
//     gist de la station (`demande.ts`), faite de la saisie du chef — ses
//     cooks, ses capacités, si elle est la principale — et de ce que le clone
//     dit du projet. Un ancien appel qui nomme encore le dépôt et la branche
//     est pris tel quel.
//
// Rien ne s'écrit dans le clone : on n'y fait que lire son `origin` et ses
// fichiers. Ce qui est à la station — ses cooks, ses capacités — part dans sa
// demande, puis au journal du projet sur la station (`preparer.ts`,
// `decisionsDe`), jamais dans le dépôt.
//
// Les phrases sont en anglais : c'est l'app qui les montre.
import { availableParallelism } from "node:os";
import { EFFORTS, MODELES } from "../calibrage.ts";
import { BESOINS } from "../installation/besoins/catalogue.ts";
import { aLeBesoin, sondeDeLaMachine, type Sonde } from "../installation/besoins/fourni.ts";
import { plafondDesCoeurs } from "../projections/stations.ts";
import { lireReglagesProjet, type Source } from "../reglages-projet/reglages.ts";
import { NOM_DE_PROJET } from "../runtime.ts";
import { worktreesDeLaStation } from "../station/configuration.ts";
import { BRANCHE, capacitesLues, DEPOT, type Calibre, type ProjetDemande } from "./demande.ts";

// Ce que le clone dit du projet : lu, jamais demandé. `probleme` : ce qui
// n'a pas pu se lire, en une phrase, ou null.
export type ProjetDuClone = {
  nom: string | null;
  depot: string | null;
  base: string | null;
  // D'où vient la branche : le fichier des réglages, la ligne du `CLAUDE.md`, ou rien.
  source: Source;
  probleme: string | null;
};

// Une capacité que la machine peut fournir : son nom, tel qu'une station le
// déclare ; ce que l'app en dit ; et si la machine l'a.
export type CapaciteDeLaMachine = { capacite: string; nom: string; detectee: boolean };

export type DefautsDeStation = {
  projet: ProjetDuClone;
  coeurs: number;
  // Les cooks à la fois sur cette machine, et pourquoi ce nombre.
  cooks: number;
  cooksDit: string;
  // Le dossier où la station pose les espaces de travail de ses cooks.
  espaceDeTravail: string;
  capacites: CapaciteDeLaMachine[];
};

export type OptionsDesDefauts = {
  // Le clone du projet sur cette machine.
  dossier: string;
  // Le répertoire de la station de cette machine (`BRIGADE_STATION_DIR`).
  racine: string;
  env?: Record<string, string | undefined>;
  // Surchargés par les tests : les cœurs de la machine, et ce qu'elle a.
  coeurs?: number;
  sonde?: Sonde;
};

const message = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur));

// Le nom du projet, tiré de son dépôt : celui de son état et de son clone sur
// la station (le même calcul que l'app, `nomDuProjet`).
export function nomDuDepot(depot: string): string | null {
  const nom = (depot.split("/")[1] ?? "")
    .toLowerCase()
    .replace(/\.git$/, "")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return NOM_DE_PROJET.test(nom) ? nom : null;
}

// Ce que le clone dit du projet. Ne lève pas : un dossier qui n'est pas un
// clone de github.com n'a pas de dépôt, un fichier des réglages illisible pas
// de branche — et c'est dit.
export async function projetDuClone(dossier: string): Promise<ProjetDuClone> {
  try {
    const lu = await lireReglagesProjet(dossier);
    return { nom: lu.depot === null ? null : nomDuDepot(lu.depot), depot: lu.depot, base: lu.integrationBranch, source: lu.source, probleme: null };
  } catch (erreur) {
    return { nom: null, depot: null, base: null, source: "aucune", probleme: message(erreur) };
  }
}

// Les capacités que la station peut déclarer, une par besoin du catalogue
// (`installation/besoins/catalogue.ts`) : le nom sous lequel un ticket ou un
// besoin la reconnaît, et si la machine l'a — une commande, un dossier, un SDK
// nommé par une variable.
export function capacitesDeLaMachine(sonde: Sonde): CapaciteDeLaMachine[] {
  return BESOINS.flatMap((besoin) => {
    const [capacite] = besoin.fourni.capacites;
    return capacite === undefined ? [] : [{ capacite, nom: besoin.nom, detectee: aLeBesoin(besoin, sonde, []) }];
  });
}

export async function defautsDeStation(options: OptionsDesDefauts): Promise<DefautsDeStation> {
  const env = options.env ?? process.env;
  const coeurs = options.coeurs ?? availableParallelism();
  const cooks = plafondDesCoeurs(coeurs);
  return {
    projet: await projetDuClone(options.dossier),
    coeurs,
    cooks,
    cooksDit: `from this machine's ${coeurs} cores: two are kept for the kitchen itself, then about two per cook`,
    espaceDeTravail: worktreesDeLaStation(options.racine, env.HOME),
    capacites: capacitesDeLaMachine(options.sonde ?? sondeDeLaMachine(env)),
  };
}

// Les champs que l'ajout refuse, chacun avec sa raison.
export type ChampDeStation = "nom" | "depot" | "base" | "principale" | "cooks" | "capacites" | "manager" | "reviewer";
export type RefusDeStation = Partial<Record<ChampDeStation, string>>;

// `projet` : la ligne à écrire dans la demande de la station. `resolu` : le
// dépôt et la branche tels que le projet les aura, et d'où ils viennent — la
// saisie, ou le clone. La demande ne porte la branche que si l'appel l'a
// nommée : sinon, la station la relit dans le dépôt à chaque ouverture de sa
// cuisine, et une PR qui la change vaut sans rien retaper.
export type AjoutDeStation =
  | { projet: ProjetDemande; resolu: { depot: string; base: string; depuis: { depot: "saisie" | "clone"; base: "saisie" | Source } } }
  | { refus: RefusDeStation };

const absent = (valeur: unknown) => valeur === undefined || valeur === null || valeur === "";
const texte = (valeur: unknown): valeur is string => typeof valeur === "string";
const date = (valeur: unknown): string | null => (texte(valeur) && !Number.isNaN(Date.parse(valeur)) ? valeur : null);

function calibreLu(lu: unknown): Calibre | null | undefined {
  if (absent(lu)) return null;
  const { modele, effort } = lu as Record<string, unknown>;
  return texte(modele) && (MODELES as readonly string[]).includes(modele) && texte(effort) && (EFFORTS as readonly string[]).includes(effort) ? { modele, effort } : undefined;
}

// Ajoute une station au projet cloné en `dossier` (null : aucun clone ici —
// l'appel doit alors nommer le dépôt et la branche, comme avant). `saisie` :
// ce que la vue envoie, rien n'y est cru sur parole — `cooks` (un entier, 1
// ou plus), `principale` (vrai si elle fait tourner son manager et sa pass),
// `capacites` (les noms cochés) ; et, d'un ancien appel, `nom`, `depot`,
// `base`, `manager`, `reviewer`, `ouvertLe`, `demandeLe`.
export async function ajouterUneStation(dossier: string | null, saisie: unknown): Promise<AjoutDeStation> {
  const lu = (saisie ?? {}) as Record<string, unknown>;
  const refus: RefusDeStation = {};
  const clone = dossier === null ? null : await projetDuClone(dossier);
  const pourquoiPasDuClone = clone === null ? "no clone of the project on this machine" : (clone.probleme ?? "");

  let depot: string | null = null;
  if (!absent(lu.depot)) {
    if (texte(lu.depot) && DEPOT.test(lu.depot.trim()) && !lu.depot.trim().endsWith(".git")) depot = lu.depot.trim();
    else refus.depot = `“${String(lu.depot).slice(0, 60)}” is not a GitHub repository: expected \`<owner>/<name>\`.`;
  } else if (clone?.depot != null) depot = clone.depot;
  else refus.depot = `The project's repository could not be read from its clone (${pourquoiPasDuClone || "its origin is not a github.com repository"}).`;

  let base: string | null = null;
  if (!absent(lu.base)) {
    if (texte(lu.base) && BRANCHE.test(lu.base.trim())) base = lu.base.trim();
    else refus.base = `“${String(lu.base).slice(0, 60)}” is not a branch name.`;
  } else if (clone?.base == null) refus.base = `The project's integration branch could not be read from its clone (${pourquoiPasDuClone || "neither .claude/brigade/projet.json nor the “Branche d'intégration” line of its CLAUDE.md declares it"}).`;

  let nom: string | null = null;
  if (!absent(lu.nom)) {
    if (texte(lu.nom) && NOM_DE_PROJET.test(lu.nom)) nom = lu.nom;
    else refus.nom = `“${String(lu.nom).slice(0, 60)}” cannot be a project's name on a station: lowercase letters, digits and dashes.`;
  } else if (depot !== null) {
    nom = nomDuDepot(depot);
    if (nom === null) refus.nom = "This repository's name gives no project name: letters, digits and dashes.";
  }

  if (typeof lu.principale !== "boolean") refus.principale = "Say whether this station is the project's main one: the one that runs its manager and its pass.";
  if (typeof lu.cooks !== "number" || !Number.isSafeInteger(lu.cooks) || lu.cooks < 1) refus.cooks = "The number of cooks at once on this machine is a whole number, 1 or more.";
  const { capacites, illisibles } = capacitesLues(lu.capacites);
  if (illisibles > 0) refus.capacites = "A capability is letters, digits and dashes (navigateur-headless, android).";
  const [manager, reviewer] = [calibreLu(lu.manager), calibreLu(lu.reviewer)];
  for (const [role, calibre] of [["manager", manager], ["reviewer", reviewer]] as const) {
    if (calibre === undefined) refus[role] = `The ${role}'s calibration is a model (${MODELES.join(", ")}) and an effort (${EFFORTS.join(", ")}).`;
  }

  if (Object.keys(refus).length > 0 || depot === null || nom === null) return { refus };
  const resolue = base ?? (clone?.base as string);
  return {
    projet: {
      nom,
      depot,
      base,
      principale: lu.principale as boolean,
      cooks: lu.cooks as number,
      manager: manager ?? null,
      reviewer: reviewer ?? null,
      ouvertLe: date(lu.ouvertLe),
      demandeLe: date(lu.demandeLe),
      ...(capacites.length === 0 ? {} : { fournit: capacites }),
    },
    resolu: { depot, base: resolue, depuis: { depot: absent(lu.depot) ? "clone" : "saisie", base: base === null ? (clone as ProjetDuClone).source : "saisie" } },
  };
}
