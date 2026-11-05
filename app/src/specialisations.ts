// Les spécialisations des cooks d'un projet, sur Kitchen > Cooks (#2492, épique #2484) : chacune est un cook taillé pour
// une sorte de tickets — son modèle, son effort, les capacités qu'une station doit avoir pour le lancer. Chacune est un
// fichier du dépôt du projet, `agents/cook-<nom>.md`, là où vit déjà le cook design (`PROFIL_COOK_DESIGN`,
// runtime/src/calibrage.ts) : un agent au format de Claude Code, son frontmatter portant `name`, `description` et, s'ils
// sont posés, `model`, `effort` et `capabilities`. Sans `model` ni `effort`, c'est le calibrage du ticket qui décide.
//
// L'app les lit et en ajoute une sur la branche d'intégration du dépôt, sur GitHub, par l'API REST et le jeton du `gh`
// de ce poste — comme les plafonds de durée (plafonds-duree.ts). Ni box, ni PR. Elle n'en remplace ni n'en retire
// aucune : une spécialisation se corrige dans son fichier. Ce module compose les demandes ; ce qui les porte est donné.
import type { ClientDeLaPriorite } from "./priorite.ts";
import { EFFORTS, MODELES } from "./projets/projets.ts";
import { refusDe } from "./tableau/client.ts";

export const DOSSIER = "agents";
export const PREFIXE = "cook-";
// Le cook ordinaire : il n'a pas de fichier, et son nom n'est pas à prendre.
export const GENERAL = "general";
// Un nom : des minuscules, des chiffres et des tirets, une lettre en tête — il nomme le fichier.
export const FORME_DU_NOM = /^[a-z][a-z0-9-]{0,39}$/;
// Une capacité, telle qu'une station la déclare (`code`, `navigateur-headless`).
export const FORME_DE_CAPACITE = /^[a-z0-9][a-z0-9-]*$/;

export const fichierDe = (nom: string) => `${DOSSIER}/${PREFIXE}${nom}.md`;
const NOM_DE_FICHIER = /^cook-([a-z][a-z0-9-]*)\.md$/;

export type SpecialisationLue = { nom: string; fichier: string; description: string; modele: string | null; effort: string | null; capacites: string[] };
export type LectureDesSpecialisations = { specialisations: SpecialisationLue[]; branche: string | null } | { sans: string; detail?: string };
// Ce que le chef remplit : `modele` et `effort` vides, c'est le calibrage du ticket ; `capacites`, des mots séparés par
// des virgules ou des espaces.
export type DemandeDeSpecialisation = { nom: string; description: string; modele: string; effort: string; capacites: string };
export type RenduDeLaSpecialisation = { fait: string; specialisation: SpecialisationLue } | { refus: string; detail?: string };

const estObjet = (valeur: unknown): valeur is Record<string, unknown> => typeof valeur === "object" && valeur !== null && !Array.isArray(valeur);
const message = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur));
const texteDe = (valeur: unknown) => (typeof valeur === "string" ? valeur.trim() : "");

// Les capacités d'une saisie ou d'un frontmatter : `code, navigateur-headless`, `[code]` ou `code navigateur-headless`.
export const capacitesDe = (texte: string) => [...new Set(texte.replace(/^\[|\]$/g, "").split(/[\s,]+/).map((mot) => mot.replace(/^["']|["']$/g, "")).filter((mot) => mot !== ""))];

// Une valeur entre guillemets : doubles, comme `JSON.stringify` les écrit ; simples, comme YAML.
function sansGuillemets(valeur: string): string {
  if (/^".*"$/.test(valeur)) {
    try {
      return String(JSON.parse(valeur));
    } catch {
      return valeur.slice(1, -1);
    }
  }
  return /^'.*'$/.test(valeur) ? valeur.slice(1, -1).replace(/''/g, "'") : valeur;
}
// Une description que YAML lirait de travers (`: `, ` #`, un signe en tête) s'écrit entre guillemets.
const enYaml = (texte: string) => (/: | #|^[\s"'`[\]{}>|*&!%@,?:-]/.test(texte) ? JSON.stringify(texte) : texte);

// Le frontmatter d'un fichier d'agent, clé par clé : rien qu'un `clé: valeur` par ligne, entre deux `---`.
function frontmatter(texte: string): Record<string, string> {
  const lignes = texte.split(/\r?\n/);
  if (lignes[0]?.trim() !== "---") return {};
  const valeurs: Record<string, string> = {};
  for (const ligne of lignes.slice(1)) {
    if (ligne.trim() === "---") break;
    const champ = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(ligne);
    if (champ !== null) valeurs[champ[1] as string] = sansGuillemets((champ[2] ?? "").trim());
  }
  return valeurs;
}

// Une spécialisation, lue de son fichier. Un modèle ou un effort hors de la liste n'en est pas un : le ticket décide.
export function lireLaSpecialisation(nom: string, texte: string): SpecialisationLue {
  const valeurs = frontmatter(texte);
  const modele = valeurs.model ?? "";
  const effort = valeurs.effort ?? "";
  return {
    nom,
    fichier: fichierDe(nom),
    description: valeurs.description ?? "",
    modele: (MODELES as readonly string[]).includes(modele) ? modele : null,
    effort: (EFFORTS as readonly string[]).includes(effort) ? effort : null,
    capacites: capacitesDe(valeurs.capabilities ?? ""),
  };
}

// Le fichier d'une spécialisation neuve : son frontmatter, puis la phrase qui dit au cook ce qu'il est.
export function ecrireLaSpecialisation({ nom, description, modele, effort, capacites }: Omit<SpecialisationLue, "fichier">): string {
  return [
    "---",
    `name: ${PREFIXE}${nom}`,
    `description: ${enYaml(description)}`,
    ...(modele === null ? [] : [`model: ${modele}`]),
    ...(effort === null ? [] : [`effort: ${effort}`]),
    ...(capacites.length === 0 ? [] : [`capabilities: ${capacites.join(", ")}`]),
    "---",
    "",
    `You are the **${nom} cook**: ${description}`,
    "",
  ].join("\n");
}

// Ce que la demande dit, ou pourquoi elle n'est pas une spécialisation — avant tout appel à GitHub.
export function specialisationDemandee(demande: unknown): { specialisation: Omit<SpecialisationLue, "fichier"> } | { refus: string } {
  const lue = estObjet(demande) ? demande : {};
  const nom = texteDe(lue.nom).toLowerCase();
  if (nom === "") return { refus: "give it a name" };
  if (!FORME_DU_NOM.test(nom)) return { refus: "its name is lowercase letters, digits and hyphens, starting with a letter (40 at most)" };
  if (nom === GENERAL) return { refus: "general is the ordinary cook: give another name" };
  const description = texteDe(lue.description).replace(/\s+/g, " ");
  if (description === "") return { refus: "say what it cooks, in one line" };
  const modele = texteDe(lue.modele);
  if (modele !== "" && !(MODELES as readonly string[]).includes(modele)) return { refus: `its model is one of ${MODELES.join(", ")}` };
  const effort = texteDe(lue.effort);
  if (effort !== "" && !(EFFORTS as readonly string[]).includes(effort)) return { refus: `its effort is one of ${EFFORTS.join(", ")}` };
  const capacites = capacitesDe(texteDe(lue.capacites));
  const fausse = capacites.find((capacite) => !FORME_DE_CAPACITE.test(capacite));
  if (fausse !== undefined) return { refus: `“${fausse}” is not a capability: letters, digits and hyphens (code, navigateur-headless)` };
  return { specialisation: { nom, description, modele: modele === "" ? null : modele, effort: effort === "" ? null : effort, capacites } };
}

const surLaBranche = (branche: string | null) => (branche === null ? "" : `?ref=${encodeURIComponent(branche)}`);

// Les noms des spécialisations du dépôt : les `cook-<nom>.md` de `agents/`. Sans dossier, aucune.
async function lesNoms(client: ClientDeLaPriorite, depot: string, branche: string | null): Promise<string[]> {
  const lu = await client.lire(`/repos/${depot}/contents/${DOSSIER}${surLaBranche(branche)}`);
  if (lu.status === 404) return [];
  if (lu.status !== 200) throw refusDe(`the reading of ${DOSSIER}/`, lu);
  if (!Array.isArray(lu.data)) throw new Error(`GitHub gave ${DOSSIER}/ without its files`);
  return lu.data
    .filter(estObjet)
    .filter(({ type }) => type === "file")
    .map(({ name }) => NOM_DE_FICHIER.exec(texteDe(name))?.[1])
    .filter((nom): nom is string => nom !== undefined)
    .sort();
}

async function leFichier(client: ClientDeLaPriorite, depot: string, branche: string | null, chemin: string): Promise<string> {
  const lu = await client.lire(`/repos/${depot}/contents/${chemin}${surLaBranche(branche)}`);
  if (lu.status !== 200) throw refusDe(`the reading of ${chemin}`, lu);
  const content = estObjet(lu.data) ? lu.data.content : undefined;
  if (typeof content !== "string") throw new Error(`GitHub gave ${chemin} without its content`);
  return Buffer.from(content, "base64").toString("utf8");
}

// Les spécialisations que le dépôt déclare, sur sa branche d'intégration (`branche` ; null : celle par défaut de GitHub),
// dans l'ordre de leur nom.
export async function lireLesSpecialisations({ depot, branche, client }: { depot: string; branche: string | null; client: ClientDeLaPriorite }): Promise<LectureDesSpecialisations> {
  try {
    const noms = await lesNoms(client, depot, branche);
    const specialisations = await Promise.all(noms.map(async (nom) => lireLaSpecialisation(nom, await leFichier(client, depot, branche, fichierDe(nom)))));
    return { specialisations, branche };
  } catch (erreur) {
    return { sans: "specializations unavailable", detail: message(erreur) };
  }
}

// Ajoute une spécialisation au dépôt : son fichier est créé sur la branche d'intégration — jamais remplacé : un nom
// déjà pris est refusé, et GitHub refuserait d'écrire par-dessus un fichier sans son `sha`.
export async function ajouterUneSpecialisation({ depot, branche, demande, client }: { depot: string; branche: string | null; demande: unknown; client: ClientDeLaPriorite }): Promise<RenduDeLaSpecialisation> {
  const demandee = specialisationDemandee(demande);
  if ("refus" in demandee) return { refus: `nothing was added: ${demandee.refus}` };
  const { specialisation } = demandee;
  const fichier = fichierDe(specialisation.nom);
  let noms: string[];
  try {
    noms = await lesNoms(client, depot, branche);
  } catch (erreur) {
    return { refus: `nothing was added: ${DOSSIER}/ was not read on GitHub`, detail: message(erreur) };
  }
  if (noms.includes(specialisation.nom)) return { refus: `nothing was added: ${specialisation.nom} is already a specialization`, detail: `${fichier} is in the repository` };
  try {
    const ecrit = await client.ecrire("PUT", `/repos/${depot}/contents/${fichier}`, {
      message: `brigade: add the ${specialisation.nom} specialization (from the app, Kitchen > Cooks)`,
      content: Buffer.from(ecrireLaSpecialisation(specialisation), "utf8").toString("base64"),
      ...(branche === null ? {} : { branch: branche }),
    });
    if (ecrit.status !== 200 && ecrit.status !== 201) throw refusDe(`the creation of ${fichier}`, ecrit);
  } catch (erreur) {
    return { refus: `nothing was added: GitHub did not write ${fichier}`, detail: message(erreur) };
  }
  return { fait: `${specialisation.nom} added in the repository`, specialisation: { ...specialisation, fichier } };
}
