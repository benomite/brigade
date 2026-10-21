// La définition d'un profil de cook, dans le dépôt du projet : un fichier par
// profil sous `.claude/brigade/profils/`, versionné avec lui, lisible et
// corrigeable à la main. Ce module en fixe le nom, le format, et l'écrit — il
// ne décide de rien : c'est le « oui » du chef qui l'écrit (`decision.ts`).
//
// Le format :
//
//   # Profil de cook app-src-vue
//
//   - domaine: app/src/vue
//   - périmètre: app/src/vue
//   - skills: aucune
//   - accepté: 2026-10-19
//   - tickets: #1, #2, #3, #4, #5
//
//   # Carnet des leçons
//
//   ## L-001
//   - état: promoted
//   …
//
// Le carnet du profil suit, au format du carnet du projet (`carnet/carnet.ts`) :
// il part des leçons promues du domaine, et se lit comme lui.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parseCarnet, writeCarnet, type Carnet } from "../carnet/carnet.ts";

// Là où vivent les définitions, dans le dépôt du projet.
export const PROFILS_DIR = ".claude/brigade/profils";

export type DefinitionDeProfil = {
  name: string;
  zone: string;
  perimeter: string[];
  skills: string[];
  // La date du « oui », AAAA-MM-JJ.
  accepted: string;
  // Les tickets qui l'ont justifié.
  tickets: number[];
  notebook: Carnet;
  // Le fichier qui définit le profil, relatif au dépôt, quand ce n'est pas
  // `fichierDuProfil(name)` : un profil bâti d'un fichier du dépôt (le cook
  // design, `design.ts`) plutôt que lu d'un fichier de profil.
  fichier?: string;
};

// L'erreur d'une définition illisible, qui dit pourquoi.
export class DefinitionIllisible extends Error {
  constructor(message: string) {
    super(`profil : ${message}`);
    this.name = "DefinitionIllisible";
  }
}

const TITRE = "# Profil de cook ";
const CARNET = "# Carnet des leçons";
const AUCUNE = "aucune";
const CLES = ["domaine", "périmètre", "skills", "accepté", "tickets"] as const;
type Cle = (typeof CLES)[number];

// Le nom d'un profil, tiré de sa zone : `app/src/vue` donne `app-src-vue`.
// Il nomme son fichier : rien qu'un nom de fichier sûr.
export function nomDuProfil(zone: string): string {
  const nom = zone
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^[-.]+|-+$/g, "");
  return nom === "" ? "profil" : nom;
}

// Le fichier d'un profil, relatif au dépôt du projet.
export const fichierDuProfil = (nom: string) => `${PROFILS_DIR}/${nom}.md`;

const liste = (valeurs: readonly string[]) => (valeurs.length === 0 ? AUCUNE : valeurs.join(", "));

export function writeDefinition(definition: DefinitionDeProfil): string {
  const { name, zone, perimeter, skills, accepted, tickets, notebook } = definition;
  return [
    `${TITRE}${name}`,
    "",
    `- domaine: ${zone}`,
    `- périmètre: ${liste(perimeter)}`,
    `- skills: ${liste(skills)}`,
    `- accepté: ${accepted}`,
    `- tickets: ${liste(tickets.map((ticket) => `#${ticket}`))}`,
    "",
    writeCarnet(notebook),
  ].join("\n");
}

export function parseDefinition(text: string): DefinitionDeProfil {
  const lignes = text.split(/\r?\n/);
  const titre = lignes[0] ?? "";
  if (!titre.startsWith(TITRE) || titre.length === TITRE.length) throw new DefinitionIllisible(`le fichier commence par « ${TITRE}<nom> »`);
  const debutDuCarnet = lignes.indexOf(CARNET);
  if (debutDuCarnet === -1) throw new DefinitionIllisible(`aucun « ${CARNET} »`);

  const valeurs: Partial<Record<Cle, string>> = {};
  for (const ligne of lignes.slice(1, debutDuCarnet)) {
    if (ligne.trim() === "") continue;
    const champ = /^- ([^:]+): (.*)$/.exec(ligne);
    const cle = champ?.[1] as Cle | undefined;
    if (champ === null || cle === undefined || !CLES.includes(cle)) throw new DefinitionIllisible(`ligne incomprise : « ${ligne} »`);
    if (valeurs[cle] !== undefined) throw new DefinitionIllisible(`champ « ${cle} » en double`);
    valeurs[cle] = (champ[2] ?? "").trim();
  }
  const dit = (cle: Cle) => {
    const valeur = valeurs[cle];
    if (valeur === undefined || valeur === "") throw new DefinitionIllisible(`champ « ${cle} » manquant`);
    return valeur;
  };
  const lireListe = (cle: Cle) => (dit(cle) === AUCUNE ? [] : dit(cle).split(",").map((valeur) => valeur.trim()));
  const tickets = lireListe("tickets").map((mot) => {
    const numero = Number(/^#([1-9]\d*)$/.exec(mot)?.[1]);
    if (!Number.isSafeInteger(numero)) throw new DefinitionIllisible(`tickets : « ${mot} » n'est pas un numéro de ticket`);
    return numero;
  });
  return {
    name: titre.slice(TITRE.length),
    zone: dit("domaine"),
    perimeter: lireListe("périmètre"),
    skills: lireListe("skills"),
    accepted: dit("accepté"),
    tickets,
    notebook: parseCarnet(lignes.slice(debutDuCarnet).join("\n")),
  };
}

export const definitionExiste = (repoDir: string, nom: string) => existsSync(join(repoDir, fichierDuProfil(nom)));

// Écrit la définition dans le dépôt `repoDir`, sans jamais en remplacer une :
// un profil qui existe déjà fait lever (`EEXIST`). Rend son chemin, relatif au
// dépôt.
export function saveDefinition(repoDir: string, definition: DefinitionDeProfil): string {
  const chemin = fichierDuProfil(definition.name);
  const fichier = join(repoDir, chemin);
  mkdirSync(dirname(fichier), { recursive: true });
  writeFileSync(fichier, writeDefinition(definition), { flag: "wx" });
  return chemin;
}
