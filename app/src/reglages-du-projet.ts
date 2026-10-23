// Les réglages d'un projet sur sa page (#1309, épique 1301) : sa branche d'intégration, les calibrages par défaut de
// son manager et de son reviewer, et son plafond de calibrage. Ils vivent dans son dépôt
// (`.claude/brigade/projet.json`) et changent par une PR, comme le code : rien ne s'en pose sur la box.
//
// Les deux passent par la commande du runtime `setting` (runtime/src/reglage-cli.ts), là où la cuisine du projet
// tourne, comme le bouton d'une station (cuisson.ts) :
//   - `setting` : les réglages tels que la cuisine les applique, et d'où vient chacun ;
//   - `setting ceiling|manager|reviewer <modèle> <effort>`, `setting branch <nom>` : le changement proposé. Le
//     runtime le passe au crible de l'écriture — une valeur qui est à la machine ou au chef n'ouvre rien —, puis
//     ouvre la PR, que la pass retient pour le chef. La réponse est l'adresse de la PR, ou pourquoi il n'y en a pas.
// L'app ne juge aucune valeur à la place du runtime : elle refuse seulement ce qui ne s'écrirait pas en mots d'une
// commande.
import type { Lu, Rendu } from "./box.ts";
import { EFFORTS, MODELES } from "./projets/projets.ts";

export const CLES = ["branche", "manager", "reviewer", "plafond"] as const;
export type Cle = (typeof CLES)[number];

// Ce que la page pose d'un réglage : son nom, sa valeur en vigueur — null si rien ne la dit —, d'où elle vient, et
// de quoi la changer : un nom de branche, ou un modèle et un effort.
export type ReglageVu =
  | { cle: "branche"; nom: string; dit: string | null; source: string; valeur: string }
  | { cle: "manager" | "reviewer" | "plafond"; nom: string; dit: string | null; source: string; modele: string; effort: string };
export type ReglagesVus = { fichier: string; reglages: ReglageVu[]; modeles: readonly string[]; efforts: readonly string[] };

// Ce que la lecture rend : les réglages, ou pourquoi ils ne se lisent pas — en une ligne, le détail au survol.
export type LectureDesReglages = { vus: ReglagesVus } | { sans: string; detail?: string };

// Le changement que le chef propose : la clé, et sa valeur.
export type ChoixDeReglage = { cle: "branche"; valeur: string } | { cle: "manager" | "reviewer" | "plafond"; modele: string; effort: string };
// Ce que la proposition a rendu : la PR ouverte, ou pourquoi il n'y en a pas.
export type RenduDuReglage = { propose: string; pr: string; numero: number } | { refus: string; detail?: string };

export const NOMS: Readonly<Record<Cle, string>> = {
  branche: "integration branch",
  manager: "manager's default calibration",
  reviewer: "reviewer's default calibration",
  plafond: "calibration ceiling",
};
const SOURCES: Readonly<Record<string, string>> = {
  repository: "from the repository",
  station: "set on the station",
  "CLAUDE.md": "from CLAUDE.md",
  default: "default",
};
// Ce qui est dit d'une proposition ouverte : la PR, et quand elle vaut.
export const PROPOSE = "proposed as a pull request — it applies once merged";

const estObjet = (valeur: unknown): valeur is Record<string, unknown> => typeof valeur === "object" && valeur !== null && !Array.isArray(valeur);
const texte = (valeur: unknown): valeur is string => typeof valeur === "string" && valeur !== "";
const sourceDite = (valeur: unknown) => (typeof valeur === "string" ? (SOURCES[valeur] ?? valeur) : "not given");

// La sortie de `setting`, lue : une ligne de JSON. Rien n'y est deviné — ce qui manque se dit « not given ».
export function reglagesVus(sortie: string): ReglagesVus | null {
  let lu: unknown;
  try {
    lu = JSON.parse(sortie.trim().split("\n").at(-1) ?? "");
  } catch {
    return null;
  }
  if (!estObjet(lu)) return null;
  const branche = estObjet(lu.integrationBranch) && texte(lu.integrationBranch.value) ? lu.integrationBranch : null;
  const calibrages = estObjet(lu.defaultCalibrations) ? lu.defaultCalibrations : {};
  const calibrage = (cle: "manager" | "reviewer" | "plafond", pose: unknown): ReglageVu => {
    const lue = estObjet(pose) && texte(pose.model) && texte(pose.effort) ? pose : null;
    return {
      cle,
      nom: NOMS[cle],
      dit: lue === null ? null : `${lue.model as string} / ${lue.effort as string}`,
      source: lue === null ? "not set" : sourceDite(lue.from),
      modele: lue === null ? "" : (lue.model as string),
      effort: lue === null ? "" : (lue.effort as string),
    };
  };
  return {
    fichier: texte(lu.file) ? lu.file : ".claude/brigade/projet.json",
    reglages: [
      { cle: "branche", nom: NOMS.branche, dit: branche === null ? null : (branche.value as string), source: branche === null ? "not given" : sourceDite(branche.from), valeur: branche === null ? "" : (branche.value as string) },
      calibrage("manager", calibrages.manager),
      calibrage("reviewer", calibrages.reviewer),
      calibrage("plafond", lu.calibrationCeiling),
    ],
    modeles: MODELES,
    efforts: EFFORTS,
  };
}

// Un runtime d'avant la commande la refuse en la nommant (`geste.ts`, code 66) : il se met à jour.
const sansLaCommande = (rendu: Rendu) => rendu.erreur !== null && (rendu.erreur.code === 66 || /n'est pas une commande du runtime|is not a runtime command/.test(rendu.erreurs));
const detailDe = (rendu: Rendu) => `${rendu.lance}\n${rendu.erreurs}${rendu.sortie}`.trim();

// Lit les réglages du projet là où sa cuisine tourne.
export async function lireLesReglages(projet: string, lu: Lu | undefined, lancer: (lu: Lu, commande: string) => Promise<Rendu>): Promise<LectureDesReglages> {
  if (lu === undefined) return { sans: `${projet} has no station: its settings are read where its kitchen runs` };
  const rendu = await lancer(lu, "setting");
  if (sansLaCommande(rendu)) return { sans: "settings unavailable: this station's runtime does not give them yet — update it", detail: detailDe(rendu) };
  const vus = rendu.erreur === null ? reglagesVus(rendu.sortie) : null;
  return vus === null ? { sans: "settings unavailable", detail: detailDe(rendu) } : { vus };
}

// Les mots de la commande d'un changement, ou pourquoi il ne s'écrit pas : une branche est un nom, sans blanc ni
// apostrophe ; un calibrage, un modèle et un effort que le runtime connaît.
export function commandeDuReglage(choix: unknown): { commande: string } | { refus: string } {
  if (!estObjet(choix) || !(CLES as readonly unknown[]).includes(choix.cle)) return { refus: "nothing was sent: this is not a project setting" };
  if (choix.cle === "branche") {
    const valeur = typeof choix.valeur === "string" ? choix.valeur.trim() : "";
    if (!/^[A-Za-z0-9._/-]+$/.test(valeur)) return { refus: "nothing was sent: a branch name is made of letters, digits and . _ / -" };
    return { commande: `setting branch ${valeur}` };
  }
  const { modele, effort } = choix;
  if (!(MODELES as readonly unknown[]).includes(modele) || !(EFFORTS as readonly unknown[]).includes(effort)) {
    return { refus: `nothing was sent: a calibration takes a model (${MODELES.join(", ")}) and an effort (${EFFORTS.join(", ")}), both` };
  }
  const mot = choix.cle === "plafond" ? "ceiling" : (choix.cle as string);
  return { commande: `setting ${mot} ${modele as string} ${effort as string}` };
}

// La phrase du runtime, posée à côté du champ : le réglage qu'elle nomme par sa clé du fichier
// (`integrationBranch`) est celui du champ — « this value » —, et elle ne garde aucun accent grave.
export const phraseDuRuntime = (message: string) => message.replace(/^`[^`]+` /, "This value ").replaceAll("`", "");

// Propose le changement au runtime du projet. Une PR ouverte rend son adresse ; sinon, ce que le runtime a dit —
// le refus de l'écriture, rien qui change, un échec —, sa phrase telle qu'il l'écrit pour l'app.
export async function proposerLeReglage(projet: string, lu: Lu | undefined, choix: unknown, lancer: (lu: Lu, commande: string) => Promise<Rendu>): Promise<RenduDuReglage> {
  const ecrite = commandeDuReglage(choix);
  if ("refus" in ecrite) return ecrite;
  if (lu === undefined) return { refus: `nothing was sent: “${projet}” has no station — there is no runtime to propose it` };
  const rendu = await lancer(lu, ecrite.commande);
  if (sansLaCommande(rendu)) return { refus: "nothing was proposed: this station's runtime cannot propose a setting yet — update it", detail: detailDe(rendu) };
  let reponse: unknown;
  try {
    reponse = JSON.parse(rendu.sortie.trim().split("\n").at(-1) ?? "");
  } catch {
    reponse = null;
  }
  if (estObjet(reponse) && reponse.ok === true && typeof reponse.pr === "string" && URL.parse(reponse.pr)?.protocol === "https:" && typeof reponse.number === "number") {
    return { propose: PROPOSE, pr: reponse.pr, numero: reponse.number };
  }
  if (estObjet(reponse) && reponse.ok === false && texte(reponse.message)) return { refus: phraseDuRuntime(reponse.message), detail: detailDe(rendu) };
  return { refus: "nothing was proposed: the runtime's answer could not be read", detail: detailDe(rendu) };
}
