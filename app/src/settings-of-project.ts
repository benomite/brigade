// Les réglages d'un projet sur sa page (#1309, épique 1301) : sa branche d'intégration, les calibrages par défaut de
// son manager et de son reviewer, son plafond de calibrage, et les réglages de son closer (#1685) — son calibrage, sa
// condition de départ, ses plafonds de tokens et de lignes retirées. Ils vivent dans son dépôt
// (`.claude/brigade/projet.json`) et changent par une PR, comme le code : rien ne s'en pose sur la box.
//
// Les deux passent par la commande du runtime `setting`, là où la cuisine du projet
// tourne, comme le bouton d'une station (cooking.ts) :
//   - `setting` : les réglages tels que la cuisine les applique, et d'où vient chacun ;
//   - `setting ceiling|manager|reviewer|closer <modèle> <effort>`, `setting closer-cooks|closer-tokens|closer-lines <n>`,
//     `setting branch <nom>` : le changement proposé. Le runtime le passe au crible de l'écriture du fichier — une
//     valeur que `projet.json` refuserait n'ouvre rien, pas même une demande —, puis ouvre la PR, que la pass retient
//     pour le chef. La réponse est l'adresse de la PR, ou la phrase du refus.
// L'app ne juge aucune valeur à la place du runtime : elle refuse seulement ce qui ne s'écrirait pas en mots d'une
// commande — et tout ce qu'elle refuse, le fichier le refuserait aussi.
import type { Read, Rendered } from "./box.ts";
import { EFFORTS, MODELS } from "./projects/projects.ts";

export const KEYS = ["branche", "manager", "reviewer", "plafond", "closer", "closer-cooks", "closer-tokens", "closer-lines"] as const;
export type Key = (typeof KEYS)[number];
// Les réglages qui s'écrivent en un mot — un nom de branche, un nombre —, et ceux qui se calibrent.
type Written = "branche" | "closer-cooks" | "closer-tokens" | "closer-lines";
type Calibrated = Exclude<Key, Written>;

// Ce que la page pose d'un réglage : son nom, sa valeur en vigueur — null si rien ne la dit —, d'où elle vient, et
// de quoi la changer : un mot, ou un modèle et un effort.
export type SettingSeen =
  | { cle: Written; nom: string; dit: string | null; source: string; valeur: string }
  | { cle: Calibrated; nom: string; dit: string | null; source: string; modele: string; effort: string };
export type SettingsSeen = { fichier: string; reglages: SettingSeen[]; modeles: readonly string[]; efforts: readonly string[] };

// Ce que la lecture rend : les réglages, ou pourquoi ils ne se lisent pas — en une ligne, le détail au survol.
export type ReadOfSettings = { vus: SettingsSeen } | { sans: string; detail?: string };

// Le changement que le chef propose : la clé, et sa valeur.
export type ChoiceOfSetting = { cle: Written; valeur: string } | { cle: Calibrated; modele: string; effort: string };
// Ce que la proposition a rendu : la PR ouverte, ou pourquoi il n'y en a pas.
export type RenderedOfSetting = { propose: string; pr: string; numero: number } | { refus: string; detail?: string };

export const NAMES: Readonly<Record<Key, string>> = {
  branche: "Integration branch",
  manager: "Manager’s calibration",
  reviewer: "Reviewer’s calibration",
  plafond: "Calibration ceiling",
  closer: "Closer’s calibration",
  "closer-cooks": "Closer’s start threshold (cooks in flight)",
  "closer-tokens": "Closer’s tokens cap",
  "closer-lines": "Closer’s removed-lines cap",
};

// Les nombres du closer : le mot de la commande, et le nom que `setting` leur donne.
const NUMBERS = { "closer-cooks": "cooksBelow", "closer-tokens": "maxTokens", "closer-lines": "maxRemovedLines" } as const;
const SOURCES: Readonly<Record<string, string>> = {
  repository: "from the repository",
  station: "set on the station",
  "CLAUDE.md": "from CLAUDE.md",
  default: "default",
};
// Ce qui est dit d'une proposition ouverte : la PR, et quand elle vaut.
export const PROPOSES = "proposed as a pull request — it applies once merged";

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === "string" && value !== "";
const sourceSaid = (value: unknown) => (typeof value === "string" ? (SOURCES[value] ?? value) : "not given");

// La sortie de `setting`, lue : une ligne de JSON. Rien n'y est deviné — ce qui manque se dit « not given ».
export function settingsSeen(output: string): SettingsSeen | null {
  let readOne: unknown;
  try {
    readOne = JSON.parse(output.trim().split("\n").at(-1) ?? "");
  } catch {
    return null;
  }
  if (!isObject(readOne)) return null;
  const branch = isObject(readOne.integrationBranch) && text(readOne.integrationBranch.value) ? readOne.integrationBranch : null;
  const calibrations = isObject(readOne.defaultCalibrations) ? readOne.defaultCalibrations : {};
  const calibration = (key: Calibrated, pose: unknown): SettingSeen => {
    const readEntry = isObject(pose) && text(pose.model) && text(pose.effort) ? pose : null;
    return {
      cle: key,
      nom: NAMES[key],
      dit: readEntry === null ? null : `${readEntry.model as string} / ${readEntry.effort as string}`,
      source: readEntry === null ? "not set" : sourceSaid(readEntry.from),
      modele: readEntry === null ? "" : (readEntry.model as string),
      effort: readEntry === null ? "" : (readEntry.effort as string),
    };
  };
  const count = (key: keyof typeof NUMBERS, pose: unknown): SettingSeen => {
    const readEntry = isObject(pose) && Number.isSafeInteger(pose.value) ? pose : null;
    const said = readEntry === null ? null : String(readEntry.value);
    return { cle: key, nom: NAMES[key], dit: said, source: readEntry === null ? "not given" : sourceSaid(readEntry.from), valeur: said ?? "" };
  };
  // Un runtime d'avant #1685 ne dit pas le closer : ses rangées ne se posent pas, plutôt que de se dire vides.
  const closer = isObject(readOne.closer) ? readOne.closer : null;
  return {
    fichier: text(readOne.file) ? readOne.file : ".claude/brigade/projet.json",
    reglages: [
      { cle: "branche", nom: NAMES.branche, dit: branch === null ? null : (branch.value as string), source: branch === null ? "not given" : sourceSaid(branch.from), valeur: branch === null ? "" : (branch.value as string) },
      calibration("manager", calibrations.manager),
      calibration("reviewer", calibrations.reviewer),
      calibration("plafond", readOne.calibrationCeiling),
      ...(closer === null ? [] : [calibration("closer", closer.calibration), ...(Object.keys(NUMBERS) as Array<keyof typeof NUMBERS>).map((key) => count(key, closer[NUMBERS[key]]))]),
    ],
    modeles: MODELS,
    efforts: EFFORTS,
  };
}

// Un runtime d'avant la commande la refuse en la nommant (`geste.ts`, code 66) : il se met à jour.
export const withoutTheCommand = (rendered: Rendered) => rendered.erreur !== null && (rendered.erreur.code === 66 || /n'est pas une commande du runtime|is not a runtime command/.test(rendered.erreurs));
export const detailOf = (rendered: Rendered) => `${rendered.lance}\n${rendered.erreurs}${rendered.sortie}`.trim();

// Lit les réglages du projet là où sa cuisine tourne.
export async function readTheSettings(project: string, readOne: Read | undefined, launch: (readOne: Read, command: string) => Promise<Rendered>): Promise<ReadOfSettings> {
  if (readOne === undefined) return { sans: `${project} has no station: its settings are read where its kitchen runs` };
  const rendered = await launch(readOne, "setting");
  if (withoutTheCommand(rendered)) return { sans: "settings unavailable: this station's runtime does not give them yet — update it", detail: detailOf(rendered) };
  const seenOnes = rendered.erreur === null ? settingsSeen(rendered.sortie) : null;
  return seenOnes === null ? { sans: "settings unavailable", detail: detailOf(rendered) } : { vus: seenOnes };
}

// Les mots de la commande d'un changement, ou pourquoi il ne s'écrit pas : une branche est un nom, sans blanc ni
// apostrophe ; un nombre du closer, des chiffres ; un calibrage, un modèle et un effort que le runtime connaît. Le
// reste — une branche que git refuserait, un nombre nul — est jugé par le runtime, avec la phrase du fichier.
export function commandOfSetting(choice: unknown): { commande: string } | { refus: string } {
  if (!isObject(choice) || !(KEYS as readonly unknown[]).includes(choice.cle)) return { refus: "nothing was sent: this is not a project setting" };
  if (choice.cle === "branche") {
    const value = typeof choice.valeur === "string" ? choice.valeur.trim() : "";
    if (!/^[A-Za-z0-9._/-]+$/.test(value)) return { refus: "nothing was sent: a branch name is made of letters, digits and . _ / -" };
    return { commande: `setting branch ${value}` };
  }
  if (Object.hasOwn(NUMBERS, choice.cle as string)) {
    const value = typeof choice.valeur === "string" ? choice.valeur.trim() : "";
    if (!/^[0-9]+$/.test(value)) return { refus: "nothing was sent: this value is a whole number, written in digits" };
    return { commande: `setting ${choice.cle as string} ${value}` };
  }
  const { modele: model, effort } = choice;
  if (!(MODELS as readonly unknown[]).includes(model) || !(EFFORTS as readonly unknown[]).includes(effort)) {
    return { refus: `nothing was sent: a calibration takes a model (${MODELS.join(", ")}) and an effort (${EFFORTS.join(", ")}), both` };
  }
  const word = choice.cle === "plafond" ? "ceiling" : (choice.cle as string);
  return { commande: `setting ${word} ${model as string} ${effort as string}` };
}

// La phrase du runtime, posée à côté du champ : le réglage qu'elle nomme par sa clé du fichier
// (`integrationBranch`) est celui du champ — « this value » —, et elle ne garde aucun accent grave.
export const sentenceOfRuntime = (message: string) => message.replace(/^`[^`]+` /, "This value ").replaceAll("`", "");

// Propose le changement au runtime du projet. Une PR ouverte rend son adresse ; sinon, ce que le runtime a dit —
// le refus de l'écriture, rien qui change, un échec —, sa phrase telle qu'il l'écrit pour l'app.
export async function proposeTheSetting(project: string, readOne: Read | undefined, choice: unknown, launch: (readOne: Read, command: string) => Promise<Rendered>): Promise<RenderedOfSetting> {
  const writtenOne = commandOfSetting(choice);
  if ("refus" in writtenOne) return writtenOne;
  if (readOne === undefined) return { refus: `nothing was sent: “${project}” has no station — there is no runtime to propose it` };
  const rendered = await launch(readOne, writtenOne.commande);
  if (withoutTheCommand(rendered)) return { refus: "nothing was proposed: this station's runtime cannot propose a setting yet — update it", detail: detailOf(rendered) };
  let answer: unknown;
  try {
    answer = JSON.parse(rendered.sortie.trim().split("\n").at(-1) ?? "");
  } catch {
    answer = null;
  }
  if (isObject(answer) && answer.ok === true && typeof answer.pr === "string" && URL.parse(answer.pr)?.protocol === "https:" && typeof answer.number === "number") {
    return { propose: PROPOSES, pr: answer.pr, numero: answer.number };
  }
  if (isObject(answer) && answer.ok === false && text(answer.message)) return { refus: sentenceOfRuntime(answer.message), detail: detailOf(rendered) };
  return { refus: "nothing was proposed: the runtime's answer could not be read", detail: detailOf(rendered) };
}
