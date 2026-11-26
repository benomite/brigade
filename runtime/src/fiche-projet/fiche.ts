// La fiche du projet (#4237, épique #4136) : ce que chaque projet déclare de
// sa cuisine, dans `.brigade/fiche-projet.json` de son dépôt — huit items, un
// par ligne de la table de la spec (`docs/superpowers/specs/2026-11-24-simplified-process.md`).
// Le cook, la pass, le servi et l'avis du chef lisent leurs faits ici, et nulle
// part ailleurs (`faitsDeLaFiche`) ; les valeurs d'un projet de code sont dans
// `defauts.ts`.
//
// Ce module charge, valide et écrit la fiche :
// - une fiche à laquelle il manque un item, qui en porte un inconnu, ou dont un
//   item n'a pas sa forme, est refusée par une erreur qui nomme l'item
//   (`FicheInvalide`) — jamais lue à moitié ni remplacée par les défauts ;
// - un dépôt sans fiche — un projet d'avant elle — a celle des défauts, sa
//   branche servie étant celle que la cuisine sert déjà (`faitsDuDossier`,
//   `faitsALaBase`).
//
// Ses messages sont en anglais : c'est l'app qui les montre.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import { lireALaBase } from "../depot.ts";
import { BRANCHE_PRINCIPALE_PAR_DEFAUT, CHEMIN_DE_LA_FICHE, ficheParDefaut } from "./defauts.ts";

// `kind` : la sorte de tickets à qui l'étape appartient (#4278) ; sans elle,
// l'étape est celle des autres tickets — une seule, comme avant.
export type Etape = { name: string; gates: string[]; kind?: string };
export type FicheProjet = {
  work: string;
  stages: Etape[];
  tools: string[];
  rules: string[];
  risks: string[];
  served: { branch: string };
  recurring: string[];
  humans: string[];
};

// Les huit items, dans l'ordre de la table de la spec, avec le nom qu'elle leur donne.
export const ITEMS: ReadonlyArray<readonly [keyof FicheProjet, string]> = [
  ["work", "The cook's work"],
  ["stages", "Stages"],
  ["tools", "Tools"],
  ["rules", "House rules"],
  ["risks", "Risks"],
  ["served", "Served"],
  ["recurring", "Recurring"],
  ["humans", "Humans in the kitchen"],
];

export class FicheInvalide extends Error {
  // L'item fautif : `humans`, `stages.0.gates`.
  readonly item: string;
  constructor(item: string, message: string) {
    super(`${CHEMIN_DE_LA_FICHE}: ${message}`);
    this.name = "FicheInvalide";
    this.item = item;
  }
}

const CLES_D_ETAPE = ["name", "gates", "kind"];
const BRANCHE = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;
const estObjet = (valeur: unknown): valeur is Record<string, unknown> => typeof valeur === "object" && valeur !== null && !Array.isArray(valeur);
const nomme = (item: string) => {
  const nom = ITEMS.find(([cle]) => cle === item.split(".")[0])?.[1];
  return `the item \`${item}\`${nom === undefined ? "" : ` (${nom})`}`;
};

function texte(item: string, valeur: unknown): string {
  if (typeof valeur !== "string" || valeur.trim() === "") throw new FicheInvalide(item, `${nomme(item)} must be a non-empty text`);
  return valeur;
}

function textes(item: string, valeur: unknown): string[] {
  if (!Array.isArray(valeur)) throw new FicheInvalide(item, `${nomme(item)} must be a list of texts`);
  return valeur.map((element, i) => texte(`${item}.${i}`, element));
}

function etapes(valeur: unknown): Etape[] {
  if (!Array.isArray(valeur) || valeur.length === 0) throw new FicheInvalide("stages", `${nomme("stages")} must be a list of at least one stage \`{name, gates}\``);
  const liste = valeur.map((etape, i): Etape => {
    const item = `stages.${i}`;
    if (!estObjet(etape)) throw new FicheInvalide(item, `${nomme(item)} must be an object \`{name, gates}\``);
    const inconnue = Object.keys(etape).find((cle) => !CLES_D_ETAPE.includes(cle));
    if (inconnue !== undefined) throw new FicheInvalide(`${item}.${inconnue}`, `${nomme(item)}: \`${inconnue}\` is not part of a stage: expected \`name\` and \`gates\`, and \`kind\` for a stage of one kind of tickets`);
    const gates = textes(`${item}.gates`, etape.gates);
    if (gates.length === 0) throw new FicheInvalide(`${item}.gates`, `${nomme(`${item}.gates`)} must name at least one script: a stage nothing judges is never served`);
    const horsDuDepot = gates.findIndex((script) => isAbsolute(script) || script.split(/[\\/]/).includes(".."));
    if (horsDuDepot !== -1) throw new FicheInvalide(`${item}.gates.${horsDuDepot}`, `${nomme(`${item}.gates.${horsDuDepot}`)} must be a path inside the repository`);
    return { name: texte(`${item}.name`, etape.name), gates, ...("kind" in etape ? { kind: texte(`${item}.kind`, etape.kind) } : {}) };
  });
  if (liste.every((etape) => "kind" in etape)) throw new FicheInvalide("stages", `${nomme("stages")} must have at least one stage without \`kind\`: the one stage of the tickets of any other kind`);
  return liste;
}

function servi(valeur: unknown): { branch: string } {
  if (!estObjet(valeur)) throw new FicheInvalide("served", `${nomme("served")} must be an object \`{branch}\``);
  const inconnue = Object.keys(valeur).find((cle) => cle !== "branch");
  if (inconnue !== undefined) throw new FicheInvalide(`served.${inconnue}`, `${nomme("served")}: \`${inconnue}\` is not part of it: expected \`branch\``);
  const branche = texte("served.branch", valeur.branch);
  if (!BRANCHE.test(branche)) throw new FicheInvalide("served.branch", `${nomme("served.branch")}: ${JSON.stringify(branche)} is not a branch name`);
  return { branch: branche };
}

// La fiche que porte une valeur lue, ou un refus qui nomme l'item fautif.
export function validerFiche(valeur: unknown): FicheProjet {
  if (!estObjet(valeur)) throw new FicheInvalide("", "the sheet must be an object with the eight items");
  const inconnu = Object.keys(valeur).find((cle) => !ITEMS.some(([item]) => item === cle));
  if (inconnu !== undefined) throw new FicheInvalide(inconnu, `\`${inconnu}\` is not an item of the sheet: expected ${ITEMS.map(([item]) => `\`${item}\``).join(", ")}`);
  const manquant = ITEMS.find(([item]) => !(item in valeur));
  if (manquant !== undefined) throw new FicheInvalide(manquant[0], `${nomme(manquant[0])} is missing`);
  return {
    work: texte("work", valeur.work),
    stages: etapes(valeur.stages),
    tools: textes("tools", valeur.tools),
    rules: textes("rules", valeur.rules),
    risks: textes("risks", valeur.risks),
    served: servi(valeur.served),
    recurring: textes("recurring", valeur.recurring),
    humans: textes("humans", valeur.humans),
  };
}

export function ficheDuTexte(contenu: string): FicheProjet {
  let valeur: unknown;
  try {
    valeur = JSON.parse(contenu);
  } catch (erreur) {
    throw new FicheInvalide("", `not JSON — ${erreur instanceof Error ? erreur.message : String(erreur)}`);
  }
  return validerFiche(valeur);
}

// La fiche du dépôt dans `dossier`. Absente, illisible ou invalide : une erreur
// qui le dit — l'item fautif nommé.
export function chargerFiche(dossier: string): FicheProjet {
  const chemin = join(dossier, CHEMIN_DE_LA_FICHE);
  if (!existsSync(chemin)) throw new FicheInvalide("", `there is no sheet in ${dossier}`);
  return ficheDuTexte(readFileSync(chemin, "utf8"));
}

// Écrit la fiche, validée d'abord : une fiche refusée laisse le fichier tel quel.
export function ecrireFiche(dossier: string, fiche: unknown): FicheProjet {
  const valide = validerFiche(fiche);
  const chemin = join(dossier, CHEMIN_DE_LA_FICHE);
  mkdirSync(dirname(chemin), { recursive: true });
  writeFileSync(chemin, `${JSON.stringify(valide, null, 2)}\n`);
  return valide;
}

// La fiche d'un nouveau projet, écrite des défauts. Un dépôt qui a déjà la
// sienne la garde : rend false, et rien n'est écrit.
export function creerFiche(dossier: string, { branchePrincipale }: { branchePrincipale: string }): boolean {
  if (existsSync(join(dossier, CHEMIN_DE_LA_FICHE))) return false;
  ecrireFiche(dossier, ficheParDefaut(branchePrincipale));
  return true;
}

// Ce que chaque étape de la cuisine lit de la fiche.
export type FaitsDeLaCuisine = {
  // Le cook : son travail, les étapes et les outils du projet.
  cook: { work: string; stages: string[]; tools: string[] };
  // La pass : les règles de la maison, et les gates qu'elle joue, étape après étape.
  passe: { rules: string[]; gates: string[] };
  // Le servi : la branche où une livraison arrive.
  servi: { branch: string };
  // L'avis du chef : les risques qui le demandent, et les humains de la cuisine.
  avisDuChef: { risks: string[]; humans: string[] };
};

export function faitsDeLaFiche(fiche: FicheProjet): FaitsDeLaCuisine {
  return {
    cook: { work: fiche.work, stages: fiche.stages.flatMap(({ name, kind }) => (kind === undefined ? [name] : [])), tools: fiche.tools },
    passe: { rules: fiche.rules, gates: fiche.stages.flatMap(({ gates }) => gates) },
    servi: { branch: fiche.served.branch },
    avisDuChef: { risks: fiche.risks, humans: fiche.humans },
  };
}

// Les faits de la cuisine, lus de la fiche du dépôt dans `dossier`.
export function faitsDeLaCuisine(dossier: string): FaitsDeLaCuisine {
  return faitsDeLaFiche(chargerFiche(dossier));
}

// De même dans un worktree ou un clone de la cuisine : sans fiche, ceux des
// défauts, servis sur `branche` — la branche que la cuisine sert déjà. Une
// fiche invalide lève, comme `chargerFiche`.
export function faitsDuDossier(dossier: string, branche: string): FaitsDeLaCuisine {
  return existsSync(join(dossier, CHEMIN_DE_LA_FICHE)) ? faitsDeLaCuisine(dossier) : faitsDeLaFiche(validerFiche(ficheParDefaut(branche)));
}

// Les gates que la pass joue dans un worktree, étape après étape, telles que
// sa fiche les dit ; sans fiche, celles des défauts. Une fiche invalide lève.
export function gatesDuDossier(dossier: string): string[] {
  return faitsDuDossier(dossier, BRANCHE_PRINCIPALE_PAR_DEFAUT).passe.gates;
}

// De même sur la branche d'intégration telle que le dernier rapatriement l'a
// vue : la fiche que le chef a mergée, pas celle qu'un cook change dans son
// worktree. Une branche que `git` ne lit pas lève.
export function faitsALaBase(lieu: { clone: string; base: string }, env?: NodeJS.ProcessEnv): FaitsDeLaCuisine {
  const contenu = lireALaBase(lieu, CHEMIN_DE_LA_FICHE, env);
  return faitsDeLaFiche(contenu === null ? validerFiche(ficheParDefaut(lieu.base)) : ficheDuTexte(contenu));
}

// L'avis du chef que la fiche à la base demande, pour la carte d'un ticket
// sensible : null sans clone où la lire — la carte n'en dit rien. Une fiche
// refusée, ou une branche que `git` ne lit pas, lève.
export function avisDuChefALaBase(clone: string | undefined, base: string): FaitsDeLaCuisine["avisDuChef"] | null {
  return clone === undefined ? null : faitsALaBase({ clone, base }).avisDuChef;
}
