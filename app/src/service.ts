// L'installation d'un projet, guidée : l'écran que l'espace du projet pose en tête de
// son panneau, de « Ajouter le projet » à « installation terminée ».
//
// Les étapes ne sont pas à l'app : elles sont au runtime du projet, sur sa box
// (`installation etapes`, runtime/src/etapes.ts) — une liste fixe, connue avant la
// première, chacune avec sa phrase « à quoi elle sert », sa phrase « si tu la sautes »
// et le geste que l'app ne peut pas faire seule. Leur état est au journal du projet :
// fermer l'app et la rouvrir retrouve les mêmes étapes faites, et la courante. L'app
// les lit, les montre toutes avant la première action, et fait chacune par la commande
// du runtime qui la fait, lancée à la place du chef par le geste de la box — comme la
// veille lance `status` :
//
//   ajout         notée faite dès que la box répond pour le projet : c'est elle qui l'a fait exister
//   init          `/brigade:init` s'ouvre dans le second ; « mergé » est la parole du chef (`etapes init faite`)
//   verification  `installation`, en entier — ce qui manque à la box est annoncé, avec son geste
//   stations      `installation stations` : les stations que la box fournit, déclarées au plafond choisi
//   protection    `installation protection poser`
//   decisions     `installation decisions courante` : une décision à la fois, sa question, ses options
//   demarrage     `etapes demarrage faite` : la box revérifie tout, et ne termine que si c'est vert
//
// Ce que l'app ne peut pas faire à la place du chef est dit d'emblée, avant le premier
// bouton : la session `/brigade:init` et son merge, ce que « Vérifier » dit manquer à
// la box — chaque manque avec sa commande, mot pour mot —, et le démarrage du service,
// un geste `root` qu'aucun geste de la box ne donne sans mot de passe. Celui-là, l'app
// l'écrit dans un shell de l'espace, sans l'envoyer. C'est pour l'annoncer que
// « Vérifier » part de lui-même quand l'écran s'ouvre sur une installation pas finie :
// il ne lance ni cook ni setup, et se rejoue sans dégât.
//
// L'app ne décide d'aucune étape : elle lit ce que le runtime en dit, et lui fait
// noter ce que le chef a fait. Rien n'est gardé ici qui ne se relise sur la box.
//
// L'installation terminée, l'écran ne revient plus (`termine`). Le projet est alors contrôlé :
// ses stations (`installation stations --json`) et ce que la vérification dit manquer, relus
// sans rien noter au journal — une étape remise à faire rouvrirait l'écran. Ce qu'il a perdu
// se dit dans la bande d'alertes, avec son geste (alerts.ts, « Ce qu'un projet installé a perdu »).
import { failureOf, type Kitchen, type Failure, type Read as ProjectRead, type Rendered as RenderedOfBox } from "./box.ts";
import type { Project } from "./config.ts";
import { titleOfFailure } from "./facts.ts";
import { SHAPE_EXPECTED, refusalOfShape } from "./name.ts";
import type { Terminal } from "./terminals.ts";

// La session qui amorce le dépôt (docs/installer.md, « Amorcer le dépôt »).
export const INIT = "/brigade:init";
// La commande du runtime qui dit si le projet est prêt, et tout ce qui manque d'un coup.
export const VERIFICATION = "installation";
// La même, qui rend son verdict structuré (runtime/src/verdict.ts) : c'est elle que « Vérifier »
// lance. Le contrôle d'un projet installé lit, lui, la sortie texte.
export const JUDGMENT = `${VERIFICATION} --json`;
// Les commandes du runtime que l'écran lance, chacune sous `installation` (runtime/src/installation-cli.ts).
export const COMMANDS = {
  etapes: "installation etapes --json",
  stations: "installation stations --json",
  protection: "installation protection --json",
  decisions: "installation decisions courante --json",
} as const;
const DOC = "docs/installer.md";

// --- Ce que le runtime rend, lu sans rien croire sur parole. Chaque forme est un
// contrat que le runtime fige dans ses tests ; le test de l'app la tire de ses fonctions.

export type StateOfStep = "todo" | "done" | "waiting";
// Les mots du runtime (`ETATS_LUS`, runtime/src/etapes-cli.ts).
const STATES: Readonly<Record<string, StateOfStep>> = { "à faire": "todo", faite: "done", "en attente": "waiting" };

export type StepRead = { id: string; titre: string; etat: StateOfStep; sert: string; sauter: string; geste: string | null };
// `courante` : la première étape qui n'est pas faite — null, l'installation est terminée.
export type StepsRead = { courante: string | null; etapes: StepRead[] };

export type StationProposed = { nom: string; moteur: string; fournit: string[] };
export type StationDeclared = { nom: string; moteur: string; fournit: string[]; cooks: number; distante: boolean };
// `absent` : pourquoi la box ne fournit aucune station — null, si elle en fournit.
export type StationsRead = { proposees: StationProposed[]; absent: string | null; declarees: StationDeclared[] };

export type Right = { droit: string; action: string; pourquoi: string };
export type ProtectionRead = { depot: string; branche: string; protection: "posée" | "autre" | "absente" | "illisible"; manque: string[]; droits: Right[]; raison: string | null };

export type Option = { valeur: string; effet: string };
// `avec` : la décision qui se répond en même temps qu'elle (le modèle du closer et son effort).
export type DecisionRead = {
  nom: string;
  question: string;
  options: Option[];
  recommandee: { valeur: string; pourquoi: string } | null;
  sauter: string;
  reclamee: boolean;
  avec: { nom: string; question: string; options: Option[] } | null;
};
// `courante` : la seule décision à poser maintenant — null, aucune n'attend. `enAttente` la compte.
export type CurrentRead = { enAttente: number; courante: DecisionRead | null; suivantes: string[] };

type Read = Record<string, unknown>;
const string = (readOne: unknown): readOne is string => typeof readOne === "string";
const strings = (readOne: unknown): readOne is string[] => Array.isArray(readOne) && readOne.every(string);

// Le dernier objet JSON de la sortie que `est` reconnaît : une commande du runtime le rend
// sur une ligne, et rien d'autre ne s'en déduit.
function objectOf(output: string, is: (readOne: Read) => boolean): Read | undefined {
  for (const line of output.split("\n").reverse()) {
    try {
      const readOne: unknown = JSON.parse(line);
      if (readOne !== null && typeof readOne === "object" && !Array.isArray(readOne) && is(readOne as Read)) return readOne as Read;
    } catch {
      // Pas un objet : une autre ligne de la sortie.
    }
  }
  return undefined;
}

export function readSteps(output: string): StepsRead | undefined {
  const readOne = objectOf(output, (object) => Array.isArray(object.etapes) && "courante" in object);
  if (readOne === undefined) return undefined;
  const steps: StepRead[] = [];
  for (const receivedOne of readOne.etapes as unknown[]) {
    const { id, titre: title, etat: state, sert: serves, sauter, geste: gesture } = (receivedOne ?? {}) as Read;
    const readEntry = string(state) ? STATES[state] : undefined;
    if (!string(id) || !string(title) || readEntry === undefined || !string(serves) || !string(sauter) || !(gesture === null || string(gesture))) return undefined;
    steps.push({ id, titre: title, etat: readEntry, sert: serves, sauter, geste: gesture });
  }
  const { courante: current } = readOne;
  if (!(current === null || (string(current) && steps.some(({ id }) => id === current)))) return undefined;
  return { courante: current, etapes: steps };
}

export function readStations(output: string): StationsRead | undefined {
  const readOne = objectOf(output, (object) => Array.isArray(object.proposees) && Array.isArray(object.declarees));
  if (readOne === undefined || !(readOne.absent === null || string(readOne.absent))) return undefined;
  const proposed: StationProposed[] = [];
  for (const receivedOne of readOne.proposees as unknown[]) {
    const { nom: name, moteur: engine, fournit: provides } = (receivedOne ?? {}) as Read;
    if (!string(name) || !string(engine) || !strings(provides)) return undefined;
    proposed.push({ nom: name, moteur: engine, fournit: provides });
  }
  const declaredEntries: StationDeclared[] = [];
  for (const receivedOne of readOne.declarees as unknown[]) {
    const { nom: name, moteur: engine, fournit: provides, cooks, distante: remote } = (receivedOne ?? {}) as Read;
    if (!string(name) || !string(engine) || !strings(provides) || typeof cooks !== "number") return undefined;
    declaredEntries.push({ nom: name, moteur: engine, fournit: provides, cooks, distante: remote === true });
  }
  return { proposees: proposed, absent: readOne.absent, declarees: declaredEntries };
}

const PROTECTIONS = ["posée", "autre", "absente", "illisible"] as const;

export function readProtection(output: string): ProtectionRead | undefined {
  const readOne = objectOf(output, (object) => string(object.protection) && string(object.branche));
  if (readOne === undefined) return undefined;
  const { depot: repository, branche: branch, protection, manque: lack, droits, raison: reason } = readOne;
  const known = PROTECTIONS.find((word) => word === protection);
  if (!string(repository) || !string(branch) || known === undefined || !strings(lack) || !Array.isArray(droits) || !(reason === null || string(reason))) return undefined;
  const readOnes: Right[] = [];
  for (const received of droits as unknown[]) {
    const { droit: right, action, pourquoi: why } = (received ?? {}) as Read;
    if (!string(right) || !string(action) || !string(why)) return undefined;
    readOnes.push({ droit: right, action, pourquoi: why });
  }
  return { depot: repository, branche: branch, protection: known, manque: lack, droits: readOnes, raison: reason };
}

function options(readOne: unknown): Option[] | undefined {
  if (!Array.isArray(readOne)) return undefined;
  const readEntries: Option[] = [];
  for (const receivedOne of readOne as unknown[]) {
    const { valeur: value, effet } = (receivedOne ?? {}) as Read;
    if (!string(value) || !string(effet)) return undefined;
    readEntries.push({ valeur: value, effet });
  }
  return readEntries;
}

export function readCurrent(output: string): CurrentRead | undefined {
  const readOne = objectOf(output, (object) => typeof object.enAttente === "number" && "courante" in object);
  if (readOne === undefined || !strings(readOne.suivantes)) return undefined;
  const { enAttente: queued, suivantes } = readOne as { enAttente: number; suivantes: string[] };
  if (readOne.courante === null) return { enAttente: queued, courante: null, suivantes };
  const { nom: name, question, options: received, recommandee: recommended, sauter, reclamee, avec: withIt } = (readOne.courante ?? {}) as Read;
  const readEntries = options(received);
  const advice = recommended as Read | null;
  if (!string(name) || !string(question) || readEntries === undefined || !string(sauter) || typeof reclamee !== "boolean") return undefined;
  if (!(advice === null || (typeof advice === "object" && string(advice.valeur) && string(advice.pourquoi)))) return undefined;
  let compagne: DecisionRead["avec"] = null;
  if (withIt !== null) {
    const { nom: other, question: request, options: itsOwn } = (withIt ?? {}) as Read;
    const readEntries = options(itsOwn);
    if (!string(other) || !string(request) || readEntries === undefined) return undefined;
    compagne = { nom: other, question: request, options: readEntries };
  }
  return {
    enAttente: queued,
    courante: { nom: name, question, options: readEntries, recommandee: advice === null ? null : { valeur: advice.valeur as string, pourquoi: advice.pourquoi as string }, sauter, reclamee, avec: compagne },
    suivantes,
  };
}

// Un point que « Vérifier » dit manquer : son texte, la flèche qui dit le geste qui le
// règle, et l'étape à reprendre qu'il nomme — lus dans la sortie d'`installation`, telle
// que runtime/src/installation-cli.ts l'écrit. Rien n'y est reformulé. Une box d'avant #933 l'écrit
// en français (`MANQUE`, `étape à reprendre`) : les deux se lisent.
export type Missing = { texte: string; geste: string | null; etape: string | null };

export function gapsOf(output: string): Missing[] {
  const gaps: Missing[] = [];
  let last: Missing | undefined;
  for (const line of output.split("\n")) {
    const lack = /^ {2}(?:MISSING {3}|MANQUE {4})(.+)$/.exec(line);
    if (lack !== null) {
      last = { texte: lack[1] ?? "", geste: null, etape: null };
      gaps.push(last);
      continue;
    }
    const arrow = /^ {12}→ (.+)$/.exec(line)?.[1];
    if (arrow !== undefined && last !== undefined) {
      const step = /^(?:step to resume:|étape à reprendre :) \d+\. .+ \(([a-z-]+)\)$/.exec(arrow)?.[1];
      if (step !== undefined) last.etape = step;
      else if (last.geste === null) last.geste = arrow;
      continue;
    }
    // Une flèche sous une ligne `à savoir` ne retient rien : elle n'est pas lue.
    last = undefined;
  }
  return gaps;
}

// --- Le verdict de « Vérifier », structuré : ce qu'`installation --json` rend (runtime/src/verdict.ts).

// Les étapes que l'app fait d'un bouton (runtime/src/installation.ts, `ACTIONS_DE_L_APP`).
export const ACTIONS = ["init", "stations", "protection", "decisions"] as const;
export type Action = (typeof ACTIONS)[number];

// Un manque, dit au chef : `texte` en mots simples, et qui le lève. Pour le chef, l'étape que
// l'app fait d'un bouton, ou la commande exacte — ni l'une ni l'autre quand la box ne les dit pas.
// `constat`, `geste`, `etape` : la ligne, la flèche et l'étape que la sortie texte en écrit.
export type MissingJudge = { texte: string; constat: string; geste: string | null; etape: string | null } & ({ acteur: "chef"; action: Action | null; commande: string | null } | { acteur: "brigade" });
// Une ligne « à savoir » : elle ne retient rien, et ne compte pas parmi les manques.
export type AKnowledge = { texte: string; geste: string | null };
// `phrase` : le verdict en une phrase, tel que le runtime le dit. `brut` : la sortie texte de la
// vérification — ou sa ligne d'erreur, plantée —, au caractère près. `panne` : ce qui a arrêté la
// vérification ; `connue`, l'issue qui la suit.
export type Judgment =
  | { verdict: "pret"; phrase: string; aSavoir: AKnowledge[]; brut: string }
  | { verdict: "pas-pret"; phrase: string; manques: MissingJudge[]; aSavoir: AKnowledge[]; brut: string }
  | { verdict: "plantee"; phrase: string; panne: { erreur: string; connue: { issue: number; texte: string } | null }; brut: string };

const optional = (readOne: unknown): string | null | undefined => (readOne === undefined ? null : string(readOne) ? readOne : undefined);

function readAKnowledge(readOne: unknown): AKnowledge[] | undefined {
  if (!Array.isArray(readOne)) return undefined;
  const readEntries: AKnowledge[] = [];
  for (const receivedOne of readOne as unknown[]) {
    const { texte: text, geste: gesture } = (receivedOne ?? {}) as Read;
    const arrow = optional(gesture);
    if (!string(text) || arrow === undefined) return undefined;
    readEntries.push({ texte: text, geste: arrow });
  }
  return readEntries;
}

function readGaps(readOne: unknown): MissingJudge[] | undefined {
  if (!Array.isArray(readOne)) return undefined;
  const readOnes: MissingJudge[] = [];
  for (const received of readOne as unknown[]) {
    const { texte: text, constat: finding, geste: gesture, etape: step, acteur, action, commande: command } = (received ?? {}) as Read;
    const [arrow, named, exacte] = [optional(gesture), optional(step), optional(command)];
    if (!string(text) || !string(finding) || arrow === undefined || named === undefined || exacte === undefined) return undefined;
    const common = { texte: text, constat: finding, geste: arrow, etape: named };
    if (acteur === "brigade") readOnes.push({ ...common, acteur });
    // Une action qu'elle ne connaît pas, l'app n'en fait pas de bouton : la flèche dit le geste.
    else if (acteur === "chef") readOnes.push({ ...common, acteur, action: ACTIONS.find((known) => known === action) ?? null, commande: exacte });
    else return undefined;
  }
  return readOnes;
}

export function readJudgment(output: string): Judgment | undefined {
  const readOne = objectOf(output, (object) => string(object.verdict) && string(object.phrase) && string(object.brut));
  if (readOne === undefined) return undefined;
  const { verdict, phrase: sentence, brut: raw } = readOne as { verdict: string; phrase: string; brut: string };
  if (verdict === "plantee") {
    const { erreur: error, connue: known } = (readOne.panne ?? {}) as Read;
    if (!string(error)) return undefined;
    if (known === null) return { verdict, phrase: sentence, panne: { erreur: error, connue: null }, brut: raw };
    const { issue, texte: text } = (known ?? {}) as Read;
    if (typeof issue !== "number" || !Number.isInteger(issue) || !string(text)) return undefined;
    return { verdict, phrase: sentence, panne: { erreur: error, connue: { issue, texte: text } }, brut: raw };
  }
  const gaps = readGaps(readOne.manques);
  const aKnowledge = readAKnowledge(readOne.aSavoir);
  if (gaps === undefined || aKnowledge === undefined) return undefined;
  if (verdict === "pret" && gaps.length === 0) return { verdict, phrase: sentence, aSavoir: aKnowledge, brut: raw };
  if (verdict === "pas-pret" && gaps.length > 0) return { verdict, phrase: sentence, manques: gaps, aSavoir: aKnowledge, brut: raw };
  return undefined;
}

// Les manques d'un verdict, comme les étapes et les annonces les lisent : la ligne de la sortie texte.
const gapsOfJudgment = (judgment: Judgment): Missing[] => (judgment.verdict === "pas-pret" ? judgment.manques.map(({ constat: finding, geste: gesture, etape: step }) => ({ texte: finding, geste: gesture, etape: step })) : []);

// Le renouvellement de la session Max en échec, tel que la ligne `à savoir` de la vérification le
// dit (runtime/src/installation.ts, `jugerRenouvellement`) : combien de passages de suite ont
// échoué — la ligne ne le compte qu'à partir de deux, un seul échec est donc 1 — et pourquoi.
// Rien quand la ligne dit un passage réussi, un minuteur inactif, ou n'y est pas : ce n'est pas
// un échec du renouvellement.
export type RenewalInFailure = { echecs: number; raison: string };

export function renewalOf(output: string): RenewalInFailure | undefined {
  for (const line of output.split("\n")) {
    // Deux écritures : la ligne `note` d'aujourd'hui, la ligne `à savoir` d'une box d'avant #933.
    const readOne =
      /^ {2}(?:note {6}|à savoir {2})renewal: (?:failed|`claude` not found)(?:, (\d+) failures in a row)?(?: \(last successful run at [^)]*\))? — (.+)$/.exec(line) ??
      /^ {2}(?:note {6}|à savoir {2})renouvellement : (?:échec|`claude` introuvable)(?:, (\d+) échecs de suite)?(?: \(dernier passage réussi à [^)]*\))? — (.+)$/.exec(line);
    if (readOne !== null) return { echecs: readOne[1] === undefined ? 1 : Number(readOne[1]), raison: readOne[2] ?? "" };
  }
  return undefined;
}

// Les étapes dont un manque est un geste sur la box elle-même : l'app ne le fait pas.
const ON_THE_BOX = ["ajout", "verification"];

// --- Vérifier : `installation`, lancée une fois — en texte, pour le contrôle d'un projet
// installé ; structurée (`installation --json`), pour l'écran.

// Ce qu'`installation` a rendu, lancée une fois. `a` : l'instant où elle a fini.
//   `pret`         sortie en 0, avec sa ligne de verdict : rien ne manque
//   `incomplete`   elle a été lancée, et le projet n'est pas prêt (1), ou elle a refusé son environnement (2)
//   `illisible`    un 0 sans sa ligne de verdict : ce n'est pas elle qui a répondu
//   `sans-verdict` elle n'a rien rendu d'elle-même — la station pas jointe, le geste qui refuse, la commande arrêtée
// `obtenu` : la ligne lancée, ce que la box a écrit, le code de sortie — tel quel. `sortie` :
// ce qu'elle a écrit sur sa sortie standard, seul : c'est là que ses manques se lisent.
export type Verified = { a: string } & ({ etat: "pret" | "incomplete" | "illisible"; obtenu: string; sortie: string } | ({ etat: "sans-verdict" } & Failure));

// Les lignes par lesquelles `installation` dit un projet prêt (runtime/src/installation-cli.ts) :
// la sienne, et celle d'une box d'avant #933.
const verdicts = (name: string) => [`brigade : project “${name}” : ready`, `brigade : projet « ${name} » : prêt`];

// Ce que prouve ce que la box a rendu d'`installation`. Les codes sont ceux de
// docs/installer.md, « Vérifier que le projet est prêt » : 0, 1 ou 2, la commande a été
// lancée ; tout autre vient du geste.
export function verdictOf(rendered: RenderedOfBox, name: string, delayMs: number): Verified {
  const a = new Date().toISOString();
  const { erreur: error } = rendered;
  const obtained = (code: number) => `${rendered.lance}\n${rendered.erreurs}${rendered.sortie}\n→ exit code ${code}`;
  if (error === null) {
    // Un compte enfermé dans une commande forcée rend 0, lui aussi, et autre chose que le verdict.
    const said = rendered.sortie.split("\n").some((line) => verdicts(name).some((ready) => line.startsWith(ready)));
    return { a, etat: said ? "pret" : "illisible", obtenu: obtained(0), sortie: rendered.sortie };
  }
  if (error.killed !== true && (error.code === 1 || error.code === 2)) return { a, etat: "incomplete", obtenu: obtained(error.code), sortie: rendered.sortie };
  return { a, etat: "sans-verdict", ...failureOf({ ...rendered, erreur: error }, delayMs) };
}

// Ce qu'`installation --json` a rendu, lancée une fois : c'est ce que « Vérifier » lance.
//   `jugee`        son verdict, lu — prêt, pas prêt, ou vérification plantée
//   `illisible`    elle a répondu de son code (0, 1 ou 2) sans verdict que l'app sache lire, ou avec
//                  un verdict que son code dément : un runtime d'avant lui, une commande forcée
//   `sans-verdict` rien n'est venu d'elle — la station pas jointe, le geste qui refuse, la commande arrêtée
// `obtenu` : la ligne lancée, ce que la box a écrit sur sa sortie d'erreur, la sortie brute de la
// vérification à la place de son objet, et le code de sortie.
export type Judged = { a: string } & ({ etat: "jugee"; jugement: Judgment; obtenu: string } | { etat: "illisible"; obtenu: string } | ({ etat: "sans-verdict" } & Failure));

// `cuisine` : là où elle a été lancée — sur cet ordinateur.
export function judgmentOf(rendered: RenderedOfBox, delayMs: number, kitchen?: Kitchen): Judged {
  const a = new Date().toISOString();
  const { erreur: error } = rendered;
  const code = error === null ? 0 : error.killed !== true && (error.code === 1 || error.code === 2) ? error.code : undefined;
  if (error !== null && code === undefined) return { a, etat: "sans-verdict", ...failureOf({ ...rendered, erreur: error }, delayMs) };
  const judgment = readJudgment(rendered.sortie);
  // Son code est celui du verdict : 0 prêt, 1 sinon (runtime/src/installation-cli.ts, `juger`).
  if (judgment === undefined || code !== (judgment.verdict === "pret" ? 0 : 1)) return { a, etat: "illisible", obtenu: `${rendered.lance}\n${rendered.erreurs}${rendered.sortie}\n→ exit code ${code}` };
  return { a, etat: "jugee", jugement: judgment, obtenu: `${rendered.lance}\n${rendered.erreurs}${judgment.brut}\n→ exit code ${code}` };
}

const withoutBox = (name: string) => `“${name}” does not say where its station is: there is nothing to install there.`;

// Ce que « Démarrer » écrit pour ce projet : rien. La station de cet ordinateur tourne en fond (#3630), aucun
// service n'y est à démarrer.
export function commandOfStartup(_project: Project): { refus: string } {
  return { refus: "nothing is written: this computer's station runs in the background, started at login or by the app — there is no service to start" };
}

// Ce que le contrôle d'un projet installé a lu sur sa box. `a` : l'instant où il a fini.
// `stations` : ce que la machine fournit et ce que le projet déclare ; `manques` : ce que la
// vérification dit manquer — chacun absent quand la box ne l'a jamais rendu sous sa forme.
// `verification` : le verdict tel que l'écran Verify le pose (phrase, manques, « à savoir », sortie
// brute) — la bande d'alertes le reprend, sans le redire autrement.
export type Control = { a: string; stations?: StationsRead; manques?: Missing[]; renouvellement?: RenewalInFailure; verification?: Shown };

// Ce que le chef enregistre d'une station déclarée, depuis l'onglet Stations (#1510) : son plafond de cooks, ses capacités
// — ou son retrait. Chaque geste ne change qu'elle (runtime/src/une-station.ts).
export type StationWanted = { cooks: number; fournit: string[] } | { retiree: true };
// Ce qu'il en advient, en une ligne : `detail`, ce que la box a rendu d'un refus — pour le survol.
export type StationChanged = { fait: string } | { refus: string; detail?: string };

// Un nom de capacité, tel que le runtime le lit (runtime/src/capacites.ts, `CAPACITE`) : rien qu'un shell lirait autrement.
const CAPACITY = /^[\p{L}\p{N}][\p{L}\p{N}_-]*$/u;
// Un nom de station (runtime/src/stations-declarees.ts, `NOM_DE_STATION`).
const NAME_OF_STATION = /^[\p{Ll}\p{N}][\p{Ll}\p{N}-]*\/[\p{Ll}\p{N}][\p{Ll}\p{N}-]*$/u;

// --- Ce que la vue pose.

// Un manque, tel que l'écran le pose : en mots simples, qui agit, et — si c'est le chef — le
// bouton qui fait le geste, ou la commande exacte, à copier. `dit` : la flèche de la vérification,
// telle quelle, quand la box ne donne ni l'un ni l'autre.
export type LineOfMissing = {
  texte: string;
  acteur: "chef" | "brigade";
  qui: string;
  geste: { action: Action; libelle: string } | { commande: string } | { dit: string } | null;
};

// Ce que la vue pose d'une vérification. Jugée : `titre`, le verdict en une phrase ; dessous, une
// ligne par manque, puis la panne (vérification plantée) et les lignes « à savoir », à part ;
// `detail`, ce que l'app a obtenu — la sortie brute, intacte —, replié. Sans verdict lisible, ce
// que la box a rendu, et ce qui l'explique. Sans verdict du tout, c'est l'échec de la veille,
// que la vue sait déjà rendre.
export type Shown =
  | { etat: "en-cours"; titre: string }
  | { etat: "pret" | "pas-pret" | "plantee"; a: string; titre: string; manques: LineOfMissing[]; panne: string | null; aSavoir: AKnowledge[]; detail: string }
  | { etat: "illisible"; a: string; titre: string; suite: string[]; detail: string }
  | { etat: "sans-verdict"; a: string; titre: string; echec: Failure };

// Ce qu'une lecture de la box a donné, quand ce n'est pas ce qui était demandé.
//   `echec`     la commande n'a pas rendu sa réponse — la veille sait dire le cas
//   `illisible` elle a répondu, et ce n'est pas la forme que l'app connaît : un runtime plus ancien, sans elle
export type Rate = { etat: "echec"; a: string; titre: string; echec: Failure } | { etat: "illisible"; a: string; titre: string; obtenu: string; lignes: string[] };

// Ce qui est demandé à la box pour l'étape courante, et ce qu'elle en a rendu.
export type Detail =
  | { etat: "en-cours"; titre: string }
  | Rate
  | { etat: "lu"; id: "stations"; lu: StationsRead }
  | { etat: "lu"; id: "protection"; lu: ProtectionRead }
  | { etat: "lu"; id: "decisions"; lu: CurrentRead; passable: boolean };

// Une étape telle que l'écran la montre. `manques` : ce que la dernière vérification dit
// qu'il faut reprendre ici. `lignes` : ce que l'app dit de son geste, pour l'étape courante.
// `detail` : ce que la box dit de l'étape courante, quand elle a un geste à choisir — ou des
// décisions qui restent, que le démarrage ne réclame pas, tant que l'installation n'est pas finie.
export type StepVue = StepRead & { rang: number; courante: boolean; manques: Missing[]; lignes: string[]; detail?: Detail };

// Ce que l'app ne fera pas à la place du chef : dit d'emblée. `geste` : la commande, mot pour
// mot, quand il y en a une ; `texte` : ce qui manque, ou pourquoi c'est à lui.
export type Announcement = { titre: string; texte: string; geste: string | null };

// Ce qu'a donné la dernière action de l'écran : ce que la box en a dit, tel quel.
export type Done = { a: string; titre: string; ok: boolean; obtenu: string };

// L'installation d'un projet, prête à poser : la vue n'y décide rien.
// `deplie` : le chef l'a entamée, ou elle est en cours — elle s'ouvre d'elle-même.
// `annonces` : `en-cours` tant que la vérification d'ouverture n'a pas répondu.
// `action` : l'action en route — aucune autre ne part, et la vue grise ses boutons.
// `demarrage` : ce que « Démarrer » écrira dans un shell, ou pourquoi il n'écrira rien.
export type Guide = {
  projet: string;
  deplie: boolean;
  titre: string;
  lecture: { etat: "en-cours"; titre: string } | { etat: "lue"; a: string } | Rate;
  etapes: StepVue[];
  courante: string | null;
  annonces: { etat: "en-cours" | "lues" | "pas-lues"; liste: Announcement[] };
  verification?: Shown;
  action?: string;
  fait?: Done;
  demarrage: { commande: string } | { refus: string };
  // L'installation n'est plus à montrer : la box l'a dite terminée (et l'app s'en souvient, même
  // si une lecture échoue ensuite), ou rien n'a jamais dit qu'elle ne l'était pas. L'espace du
  // projet est alors le rail, et rien de l'écran d'installation.
  termine: boolean;
  // Installée, ce que son dernier contrôle a lu : la bande d'alertes en tire ce qui est perdu.
  controle?: Control;
};

// Ce qu'un appel à la box a donné : la commande a répondu de son code (0, 1 ou 2 — les
// siens), ou rien n'est venu d'elle.
type Plays = { a: string; code: number; sortie: string; obtenu: string } | { a: string; echec: Failure };

type Held = {
  // Là où l'installation a été lue : cet ordinateur (`ICI`).
  lieu: string;
  suivi: boolean;
  lecture: Guide["lecture"];
  etapes?: StepsRead;
  detail?: Detail;
  verification?: Judged;
  // La vérification en route : une seule à la fois, qu'on attend plutôt que de la doubler.
  verifiant?: Promise<void>;
  // La vérification d'ouverture est partie, une fois : on ne la relance pas à chaque regard.
  annoncee: boolean;
  // Ce que la box a dit un jour de l'installation : terminée (aucune étape courante) ou pas.
  // Une lecture qui échoue ensuite n'en défait rien.
  fini?: boolean;
  action?: string;
  fait?: Done;
  // Le dernier contrôle de l'installation terminée, et celui qui est en route : un seul à la fois.
  controle?: Control;
  controlant?: Promise<void>;
};

export type Services = ReturnType<typeof holdServices>;

// Le lieu d'une installation lue sur cet ordinateur : aucun hôte ne s'écrit avec un blanc.
const HERE = "this computer";
// Un projet, avec là où sa cuisine tourne : c'est là que ses commandes partent.
type With = Project & { cuisine: Kitchen };

const BUSY = "Another installation action is running: it answers by itself, then this one can go.";

// Le libellé du bouton qui lève un manque du chef depuis l'app. Les stations et les décisions se
// choisissent : le bouton mène à leur étape, où le choix se fait.
function wordingOfAction(action: Action, steps: StepVue[]): string {
  if (action === "init") return `Run ${INIT} in the second`;
  if (action === "protection") return "Protect the integration branch";
  const step = steps.find(({ id }) => id === action);
  return step === undefined ? `Go to the ${action} step` : `Go to step ${step.rang}. ${step.titre}`;
}

// Un manque du verdict, tel que l'écran le pose : qui agit, et ce qui lui est donné pour le faire.
function lineOfMissing(lack: MissingJudge, steps: StepVue[]): LineOfMissing {
  if (lack.acteur === "brigade") return { texte: lack.texte, acteur: "brigade", qui: "brigade, on its own — nothing for you to do", geste: null };
  const gesture =
    lack.action !== null
      ? { action: lack.action, libelle: wordingOfAction(lack.action, steps) }
      : lack.commande !== null
        ? { commande: lack.commande }
        : lack.geste !== null
          ? { dit: lack.geste }
          : null;
  return { texte: lack.texte, acteur: "chef", qui: "you", geste: gesture };
}
const LINES: Readonly<Record<string, (project: Project, here: boolean) => string[]>> = {
  ajout: () => ["The app marks this step done as soon as the station answers for the project: the add is what made it exist there."],
  init: () => [
    `\`${INIT}\` is a Claude Code session, not a command: the app opens it in this space's second, in the project's folder — the conversation is yours.`,
    "Then merge its PR on the integration branch, and say so here: the station only sees of the repository what its origin carries, and the app does not know whether it is merged.",
  ],
  verification: () => [
    `“Verify” runs \`${VERIFICATION}\` on the project's station, for you: everything missing, at once, each with what sets it up. It launches no cook and no setup, and can be replayed as often as you like.`,
    "What it says is missing on the station itself is announced at the top of this screen: the app cannot do it for you.",
  ],
  stations: () => ["Choose, among the stations its main station provides, those where tickets are served, and how many cooks each runs at once: the cap has no default, it is your quota."],
  protection: () => ["“Protect” sets on GitHub the protection the runtime expects — pull request required, zero approvals, administrators included — and turns on push protection if GitHub accepts it."],
  decisions: () => ["One decision at a time: its question, its options and what each does. The station records your answer in the project's journal — no `sudo`, no drop-in."],
  demarrage: () => ["“Start” has the station verify everything one last time and, only if it is green, records the installation as finished: no step is left to do after it."],
};

// Les installations, tenues tant que l'app est ouverte : ce qui est lu, ce qui est en route.
// Rien n'y fait foi — la box redit tout à la lecture suivante. Ce par quoi elles passent
// leur est donné : la box, par le passage du projet, et les deux terminaux — le second, où
// s'ouvre la session d'init, et un shell, où s'écrit le démarrage. `surGuide` reçoit chaque
// installation qui change. `cuisine` : là où celle d'un projet tourne, demandé à chaque geste —
// sa box, ou cet ordinateur, où ses commandes partent (workstation/kitchen-here.ts). Absent,
// c'est sa box.
export function holdServices(options: {
  delaiMs: number;
  lancer(readOne: ProjectRead, command: string): Promise<RenderedOfBox>;
  cuisine: (project: Project) => Kitchen | undefined;
  session(project: Project, command: string): Terminal;
  shell(project: Project, written: string): Terminal;
  surGuide(guide: Guide): void;
  // L'écart minimal entre deux contrôles d'un projet installé, sauf s'il est demandé exprès :
  // la vérification joint l'origine et GitHub, et tient le passage du projet le temps de le faire.
  controleMs?: number;
}) {
  const heldOnes = new Map<string, Held>();
  const kitchenOf = options.cuisine;
  // Le projet, avec là où sa cuisine tourne à cet instant — rien, si elle n'est nulle part.
  const withItsKitchen = (project: Project): With | undefined => {
    const kitchen = kitchenOf(project);
    return kitchen === undefined ? undefined : { ...project, cuisine: kitchen };
  };

  // L'installation d'un projet là où sa cuisine tourne aujourd'hui : ce qui a été lu ailleurs ne vaut rien ici.
  function hold({ nom: name, cuisine: kitchen }: With): Held {
    const place = HERE;
    const held = heldOnes.get(name);
    if (held !== undefined && held.lieu === place) return held;
    const fresh: Held = { lieu: place, suivi: false, lecture: { etat: "en-cours", titre: "reading the installation steps on the station…" }, annoncee: false };
    heldOnes.set(name, fresh);
    return fresh;
  }

  const orRead = ({ nom: name, cuisine: kitchen }: With): ProjectRead => ({ nom: name, cuisine: kitchen });

  async function play(project: With, command: string): Promise<Plays> {
    const rendered = await options.lancer(orRead(project), command);
    const a = new Date().toISOString();
    const { erreur: error } = rendered;
    const code = error === null ? 0 : error.killed !== true && (error.code === 1 || error.code === 2) ? error.code : undefined;
    if (code === undefined) return { a, echec: failureOf({ ...rendered, erreur: error as NonNullable<typeof error> }, options.delaiMs) };
    return { a, code, sortie: rendered.sortie, obtenu: `${rendered.lance}\n${rendered.erreurs}${rendered.sortie}\n→ exit code ${code}` };
  }

  // Ce qu'une lecture rend quand ce n'est pas la forme attendue.
  function rate(plays: Plays, command: string): Rate {
    if ("echec" in plays) return { etat: "echec", a: plays.a, titre: titleOfFailure(plays.echec, `REACHED, BUT \`${command}\` DID NOT ANSWER`), echec: plays.echec };
    return {
      etat: "illisible",
      a: plays.a,
      titre: `THE STATION DID NOT RETURN WHAT \`${command}\` RETURNS`,
      obtenu: plays.obtenu,
      lignes: [
        `What it returned is above, as is. The expected case: the runtime serving this project on the station predates this step — update it (${DOC}, « Mettre brigade à jour »).`,
      ],
    };
  }

  const alive = (name: string, held: Held) => heldOnes.get(name) === held;
  function push(project: Project, held: Held): void {
    if (alive(project.nom, held)) options.surGuide(vue(project, held));
  }

  // Les étapes, relues ; puis ce que l'étape courante demande, et — l'écran ouvert sur une
  // installation pas finie — la vérification d'ouverture, une fois.
  async function reread(project: With, held: Held, additionNote = false): Promise<void> {
    const plays = await play(project, COMMANDS.etapes);
    const readEntries = "echec" in plays || plays.code !== 0 ? undefined : readSteps(plays.sortie);
    if (readEntries === undefined) {
      held.lecture = rate(plays, COMMANDS.etapes);
      held.etapes = undefined;
      held.detail = undefined;
      return push(project, held);
    }
    held.lecture = { etat: "lue", a: plays.a };
    held.etapes = readEntries;
    held.fini = readEntries.courante === null;
    push(project, held);
    // Installée : le contrôle part à côté, sans retenir ce qui a relu les étapes.
    if (readEntries.courante === null) void check(project, held);
    if (!unfolded(held)) return;
    // La box vient de répondre pour ce projet, par son nom : il existe sur elle.
    if (!additionNote && readEntries.etapes.some(({ id, etat: state }) => id === "ajout" && state !== "done")) {
      const noted = await play(project, "installation etapes ajout faite");
      if (!("echec" in noted) && noted.code === 0) return reread(project, held, true);
    }
    await readDetail(project, held);
    if (!held.annoncee && readEntries.courante !== null) {
      held.annoncee = true;
      await checkFor(project, held);
    }
  }

  // L'étape dont la box dit de quoi choisir : la courante, quand elle a un geste à choisir —
  // et, la courante étant le démarrage, les décisions : celles que le démarrage ne réclame
  // pas restent présentées, une à une, jusqu'à la fin de l'installation.
  function target(held: Held): "stations" | "protection" | "decisions" | undefined {
    const current = held.etapes?.courante;
    if (current === "stations" || current === "protection" || current === "decisions") return current;
    return current === "demarrage" ? "decisions" : undefined;
  }

  // Ce que la box dit de l'étape qui a un geste à choisir.
  async function readDetail(project: With, held: Held): Promise<void> {
    const id = target(held);
    if (id === undefined) {
      held.detail = undefined;
      return;
    }
    const command = COMMANDS[id];
    held.detail = { etat: "en-cours", titre: `reading \`${command}\` on the station…` };
    push(project, held);
    const plays = await play(project, command);
    const output = "echec" in plays || plays.code !== 0 ? undefined : plays.sortie;
    if (id === "stations") {
      const readOne = output === undefined ? undefined : readStations(output);
      held.detail = readOne === undefined ? rate(plays, command) : { etat: "lu", id, lu: readOne };
    } else if (id === "protection") {
      const readOne = output === undefined ? undefined : readProtection(output);
      held.detail = readOne === undefined ? rate(plays, command) : { etat: "lu", id, lu: readOne };
    } else {
      const readOne = output === undefined ? undefined : readCurrent(output);
      // L'étape se passe quand le démarrage ne réclame plus rien — la décision courante n'est pas
      // réclamée : celles qui restent se posent, ou se passent.
      const doneOne = held.etapes?.etapes.find((step) => step.id === id)?.etat === "done";
      held.detail = readOne === undefined ? rate(plays, command) : { etat: "lu", id, lu: readOne, passable: !doneOne && (readOne.courante === null || !readOne.courante.reclamee) };
    }
    push(project, held);
  }

  // `installation --json`, lancée ; l'étape « verification » notée d'après ce qu'elle dit de la
  // box : faite si rien n'y manque, en attente du chef sinon. Plantée, elle n'a rien constaté :
  // rien n'est noté.
  function checkFor(project: With, held: Held): Promise<void> {
    if (held.verifiant !== undefined) return held.verifiant;
    held.verification = undefined;
    held.verifiant = (async () => {
      const judged = judgmentOf(await options.lancer(orRead(project), JUDGMENT), options.delaiMs, project.cuisine);
      held.verification = judged;
      held.verifiant = undefined;
      push(project, held);
      if (judged.etat !== "jugee" || judged.jugement.verdict === "plantee") return;
      const onTheBox = gapsOfJudgment(judged.jugement).some(({ etape: step }) => step !== null && ON_THE_BOX.includes(step));
      const wanted = onTheBox ? "waiting" : "done";
      if (held.etapes?.etapes.find(({ id }) => id === "verification")?.etat === wanted) return;
      const noted = await play(project, `installation etapes verification ${wanted === "done" ? "faite" : "en-attente"}`);
      if (!("echec" in noted) && noted.code === 0) await reread(project, held);
    })();
    push(project, held);
    return held.verifiant;
  }

  // Le contrôle d'un projet installé : ses stations, puis la vérification entière — rien n'est
  // noté au journal. Une lecture qui ne rend pas sa forme laisse ce que la précédente avait dit.
  function check(project: With, held: Held, expres = false): Promise<void> {
    if (held.controlant !== undefined) return held.controlant;
    const last = held.controle === undefined ? undefined : Date.parse(held.controle.a);
    if (!expres && last !== undefined && Date.now() - last < (options.controleMs ?? 0)) return Promise.resolve();
    held.controlant = (async () => {
      try {
        const plays = await play(project, COMMANDS.stations);
        const stations = "echec" in plays || plays.code !== 0 ? undefined : readStations(plays.sortie);
        const judged = judgmentOf(await options.lancer(orRead(project), JUDGMENT), options.delaiMs, project.cuisine);
        const readOne = judged.etat === "jugee" && judged.jugement.verdict !== "plantee" ? judged.jugement : undefined;
        const gaps = readOne === undefined ? undefined : gapsOfJudgment(readOne);
        const before = held.controle;
        const readEntries = stations ?? before?.stations;
        const saidOnes = gaps ?? before?.manques;
        // Une vérification lue qui ne dit plus d'échec lève l'alerte ; une lecture ratée laisse l'ancienne.
        const renewal = readOne === undefined ? before?.renouvellement : renewalOf(readOne.aSavoir.map(({ texte: text }) => `  note      ${text}`).join("\n"));
        // Ce que l'écran Verify poserait : la bande d'alertes dit le même verdict, les mêmes manques.
        const steps = (held.etapes?.etapes ?? []).map((step, rank) => ({ ...step, rang: rank + 1 })) as StepVue[];
        const verification = judged.etat === "sans-verdict" ? before?.verification : show(judged, steps);
        held.controle = {
          a: new Date().toISOString(),
          ...(readEntries === undefined ? {} : { stations: readEntries }),
          ...(saidOnes === undefined ? {} : { manques: saidOnes }),
          ...(renewal === undefined ? {} : { renouvellement: renewal }),
          ...(verification === undefined ? {} : { verification }),
        };
      } finally {
        held.controlant = undefined;
      }
      push(project, held);
    })();
    return held.controlant;
  }

  // Les stations du projet, relues seules après qu'une a changé : la vue les montre sans attendre le contrôle
  // suivant, ni la vérification entière qu'il joue. Un contrôle en route finit d'abord — il les a lues avant.
  async function rereadTheStations(project: With, held: Held): Promise<void> {
    await held.controlant;
    const plays = await play(project, COMMANDS.stations);
    const readEntries = "echec" in plays || plays.code !== 0 ? undefined : readStations(plays.sortie);
    if (readEntries !== undefined && held.controle !== undefined) held.controle = { ...held.controle, stations: readEntries };
    push(project, held);
  }

  const unfolded = (held: Held) => held.suivi || (held.etapes !== undefined && held.etapes.courante !== null && held.etapes.etapes.some(({ etat: state }) => state !== "todo"));

  function vue(project: Project, held: Held): Guide {
    const readEntries = held.etapes;
    const judged = held.verification;
    const gaps = judged?.etat === "jugee" ? gapsOfJudgment(judged.jugement) : [];
    const steps: StepVue[] = (readEntries?.etapes ?? []).map((step, rank) => {
      const current = step.id === readEntries?.courante;
      return {
        ...step,
        rang: rank + 1,
        courante: current,
        manques: gaps.filter((lack) => lack.etape === step.id),
        lignes: current ? (LINES[step.id]?.(project, held.lieu === HERE) ?? []) : [],
        ...(step.id === target(held) && held.detail !== undefined ? { detail: held.detail } : {}),
      };
    });
    const done = steps.filter(({ etat: state }) => state === "done").length;
    const current = steps.find((step) => step.courante);
    const startup = commandOfStartup(project);
    const title =
      held.lecture.etat === "en-cours"
        ? `Installation — ${held.lecture.titre}`
        : held.lecture.etat !== "lue"
          ? "Installation — the station did not return its steps"
          : current === undefined
            ? `Installation — finished: the ${steps.length} steps are done`
            : `Installation — ${done} of ${steps.length} steps done · now: ${current.rang}. ${current.titre}`;
    // Sans parole de la box (lecture en échec) sur un projet dont on n'a jamais vu l'installation
    // inachevée ni entamé les gestes, rien ne dit qu'elle l'est : l'écran ne s'affiche pas.
    const finished = held.fini === true || (held.fini === undefined && !held.suivi && held.lecture.etat !== "en-cours" && held.lecture.etat !== "lue");
    return {
      projet: project.nom,
      termine: finished,
      deplie: unfolded(held),
      titre: title,
      lecture: held.lecture,
      etapes: steps,
      courante: readEntries?.courante ?? null,
      annonces: announcements(project, held, steps, gaps),
      ...(held.verifiant !== undefined
        ? { verification: { etat: "en-cours", titre: `verification running… \`${VERIFICATION}\` reaches the repository's origin and GitHub: a few seconds, two minutes at most` } }
        : judged === undefined
          ? {}
          : { verification: show(judged, steps) }),
      ...(held.action === undefined ? {} : { action: held.action }),
      ...(held.fait === undefined ? {} : { fait: held.fait }),
      demarrage: startup,
      ...(held.fini === true && held.controle !== undefined ? { controle: held.controle } : {}),
    };
  }

  // Ce que le chef aura à faire lui-même, dit avant qu'il le rencontre : le geste de chaque
  // étape qui en a un, ce que la vérification dit manquer à la box, et le démarrage du service.
  function announcements(_project: Project, held: Held, steps: StepVue[], gaps: Missing[]): Guide["annonces"] {
    if (held.etapes === undefined || held.etapes.courante === null) return { etat: "lues", liste: [] };
    const list: Announcement[] = [];
    for (const step of steps) if (step.geste !== null && step.etat !== "done") list.push({ titre: `${step.rang}. ${step.titre}`, texte: step.geste, geste: null });
    for (const lack of gaps) {
      if (lack.etape !== null && ON_THE_BOX.includes(lack.etape)) list.push({ titre: "On the station, by someone with `sudo` there", texte: lack.texte, geste: lack.geste });
    }
    const judged = held.verification;
    const state = held.verifiant !== undefined || !held.annoncee ? "en-cours" : judged?.etat === "jugee" && judged.jugement.verdict !== "plantee" ? "lues" : "pas-lues";
    return { etat: state, liste: list };
  }

  // Ce que l'écran pose d'une vérification : le verdict en une phrase, une ligne par manque avec
  // qui agit, les lignes « à savoir » à part, et la sortie brute, repliée. Pas de mode d'emploi :
  // ce que la box a rendu est dit en mots simples, ou n'est pas dit.
  function show(judged: Judged, steps: StepVue[]): Shown {
    const { a } = judged;
    if (judged.etat === "sans-verdict") {
      const { erreur: error, atteinte: reached, cas: theCase } = judged;
      return { etat: "sans-verdict", a, titre: titleOfFailure({ erreur: error, atteinte: reached, cas: theCase }, `REACHED, BUT \`${JUDGMENT}\` DID NOT RETURN ITS VERDICT`), echec: { erreur: error, atteinte: reached, cas: theCase } };
    }
    if (judged.etat === "illisible") {
      return {
        etat: "illisible",
        a,
        titre: `The station did not return the verdict of \`${JUDGMENT}\`: the app cannot say whether the project is ready.`,
        detail: judged.obtenu,
        suite: [
          `The expected case: the runtime serving this project on the station predates this verdict — update it (${DOC}, « Mettre brigade à jour »).`,
          `Or your account on the station is locked into a forced command, which replaces the one the app sends — ${DOC}, « Ajouter un humain ».`,
        ],
      };
    }
    const { jugement: judgment, obtenu: obtained } = judged;
    const common = { a, titre: judgment.phrase, detail: obtained };
    if (judgment.verdict === "plantee") {
      const { connue: known } = judgment.panne;
      return { etat: "plantee", ...common, manques: [], panne: known === null ? null : `#${known.issue} — ${known.texte}`, aSavoir: [] };
    }
    const gaps = judgment.verdict === "pas-pret" ? judgment.manques.map((lack) => lineOfMissing(lack, steps)) : [];
    return { etat: judgment.verdict, ...common, manques: gaps, panne: null, aSavoir: judgment.aSavoir };
  }

  // Ce qui réclame un terminal : la raison, pour un projet qui n'en a pas.
  const withoutTerminal = (project: Project) => (kitchenOf(project) === undefined ? withoutBox(project.nom) : project.refus === undefined ? undefined : `“${project.nom}” does not open: ${project.refus}`);

  // Une action de l'écran sur la box : une à la fois par projet. Ce que la box en dit est
  // gardé tel quel, puis tout est relu — c'est elle qui dit où en est l'installation.
  async function act(project: Project, what: string, doIt: (project: With, held: Held) => Promise<Done | { refus: string }>): Promise<{ refus: string } | undefined> {
    const withIt = withItsKitchen(project);
    if (withIt === undefined) return { refus: withoutBox(project.nom) };
    const held = hold(withIt);
    if (held.action !== undefined || held.verifiant !== undefined) return { refus: BUSY };
    held.suivi = true;
    held.action = what;
    push(project, held);
    try {
      const done = await doIt(withIt, held);
      if ("refus" in done) return done;
      held.fait = done;
      await reread(withIt, held);
      return undefined;
    } finally {
      held.action = undefined;
      push(project, held);
    }
  }

  // Une commande du runtime qui écrit, et ce qu'elle en a dit.
  async function write(project: With, command: string, titles: { ok: string; non: string }): Promise<Done> {
    const plays = await play(project, command);
    if ("echec" in plays) return { a: plays.a, ok: false, titre: `${titles.non} — ${titleOfFailure(plays.echec, `REACHED, BUT \`${command}\` DID NOT ANSWER`)}`, obtenu: plays.echec.erreur };
    return { a: plays.a, ok: plays.code === 0, titre: plays.code === 0 ? titles.ok : titles.non, obtenu: plays.obtenu };
  }

  // Le détail lu de cette étape — rien, si ce n'est pas elle qui a un geste à choisir, ou si la box ne l'a pas rendu.
  function detail<I extends "stations" | "protection" | "decisions">(held: Held, id: I): Extract<Detail, { id: I }> | undefined {
    const readOne = held.detail;
    return target(held) === id && readOne?.etat === "lu" && readOne.id === id ? (readOne as Extract<Detail, { id: I }>) : undefined;
  }

  // Une valeur que l'app porte à la box : de quoi n'être qu'un mot pour son shell.
  const VALUE = /^[A-Za-z0-9._-]{1,64}$/;

  // L'installation d'un projet, relue sur sa box — rien, pour un projet sans box. Ouverte,
  // ou en cours, ce que son étape courante demande est lu aussi, et la vérification
  // d'ouverture part une fois : ce qui sera au chef est annoncé sans qu'il ait rien pressé.
  async function guide(project: Project): Promise<Guide | undefined> {
    const withIt = withItsKitchen(project);
    if (withIt === undefined) return undefined;
    const held = hold(withIt);
    push(project, held);
    await reread(withIt, held);
    return vue(project, held);
  }

  return {
    guide,

    // Le contrôle d'un projet installé — l'app le relance à son rythme, quel que soit l'écran, et
    // pas plus souvent que `controleMs` : si la box dit l'installation terminée, ce qu'il a perdu.
    // Une installation pas finie n'en est pas touchée : rien n'y est lu de plus, rien noté.
    // `expres` : demandé par le chef, l'écart minimal ne le retient pas.
    // Rend le contrôle tel qu'il en sort — rien, pour un projet sans box ou pas installé.
    async controler(project: Project, expres = false): Promise<Control | undefined> {
      const withIt = withItsKitchen(project);
      if (withIt === undefined) return undefined;
      const held = hold(withIt);
      if (held.fini !== true) {
        // Terminée depuis la dernière lecture — ailleurs que dans l'app : l'écran l'apprend aussi.
        const plays = await play(withIt, COMMANDS.etapes);
        const readEntries = "echec" in plays || plays.code !== 0 ? undefined : readSteps(plays.sortie);
        if (readEntries?.courante !== null || !alive(project.nom, held)) return undefined;
        held.lecture = { etat: "lue", a: plays.a };
        held.etapes = readEntries;
        held.fini = true;
        held.detail = undefined;
        push(project, held);
      }
      if (!alive(project.nom, held)) return undefined;
      await check(withIt, held, expres);
      return held.controle;
    },

    // Le chef ouvre l'écran replié, ou le projet vient d'être ajouté par l'écran d'ajout.
    deplier(project: Project): Promise<Guide | undefined> {
      const withIt = withItsKitchen(project);
      if (withIt !== undefined) hold(withIt).suivi = true;
      return guide(project);
    },

    // Le projet vient d'être ajouté par l'écran : son installation s'ouvre d'elle-même dans son espace.
    suivre(project: Project): void {
      const withIt = withItsKitchen(project);
      if (withIt !== undefined) hold(withIt).suivi = true;
    },

    // La session `/brigade:init`, dans le second du projet. Rien n'en est déduit : qu'elle ait
    // abouti, et que son résultat soit mergé, c'est le chef qui le dit.
    amorcer(project: Project): Terminal | { refus: string } {
      const refusal = withoutTerminal(project);
      const withIt = withItsKitchen(project);
      if (refusal !== undefined || withIt === undefined) return { refus: refusal ?? withoutBox(project.nom) };
      hold(withIt).suivi = true;
      return options.session(project, INIT);
    },

    // Le chef dit le résultat de l'init mergé — ou s'en dédit : la box le note, ou le remet à faire.
    direMerge(project: Project, merge: boolean) {
      return act(project, merge ? "recording the merge of the init…" : "putting the init back to do…", (withIt) =>
        write(withIt, `installation etapes init ${merge ? "faite" : "a-faire"}`, merge ? { ok: `The merge of \`${INIT}\` is recorded on the station`, non: "The station did not record the merge" } : { ok: "The init is back to do", non: "The station did not put the init back to do" }),
      );
    },

    // Lance `installation`, et rend l'installation telle qu'elle en sort : son verdict, et
    // l'étape « verification » notée d'après lui. Une vérification en route ne se double pas.
    async verifier(project: Project): Promise<{ refus: string } | undefined> {
      const withIt = withItsKitchen(project);
      if (withIt === undefined) return { refus: withoutBox(project.nom) };
      const held = hold(withIt);
      if (held.action !== undefined) return { refus: BUSY };
      held.suivi = true;
      held.annoncee = true;
      await checkFor(withIt, held);
      return undefined;
    },

    // Déclare les stations choisies parmi celles que la box fournit, chacune à son plafond de
    // cooks. `choix` : ce que la vue a recueilli — rien n'y est cru sur parole.
    declarerStations(project: Project, choice: unknown) {
      return act(project, "declaring the stations…", async (withIt, held) => {
        const readOne = detail(held, "stations")?.lu;
        if (readOne === undefined) return { refus: "Nothing was declared: its main station has not said which stations it provides — read the steps again." };
        const wanted = Array.isArray(choice) ? (choice as unknown[]) : [];
        const entries: string[] = [];
        for (const wantedOne of wanted) {
          const { nom: name, cooks } = (wantedOne ?? {}) as Read;
          const proposed = readOne.proposees.find((station) => station.nom === name);
          if (proposed === undefined) return { refus: `Nothing was declared: “${String(name)}” is not a station its main station provides.` };
          if (typeof cooks !== "number" || !Number.isInteger(cooks) || cooks < 1 || cooks > 99) return { refus: `Nothing was declared: how many cooks “${proposed.nom}” runs at once has no default — a whole number, 1 or more.` };
          entries.push(`${proposed.nom}:${cooks}:${proposed.fournit.join("+")}`);
        }
        if (entries.length === 0) return { refus: "Nothing was declared: choose at least one station — without one, no cook leaves." };
        const declaration = entries.join(",");
        if (!/^[A-Za-z0-9/:+,._-]+$/.test(declaration)) return { refus: "Nothing was declared: its main station provides a station whose name the app does not carry safely." };
        return write(withIt, `installation stations ${declaration}`, { ok: "Stations declared", non: "Its main station refused the stations" });
      });
    },

    // Une station déclarée, changée seule depuis l'onglet Stations (#1510) : son plafond et ses capacités,
    // ou son retrait — par les commandes du runtime qui ne touchent qu'elle (`installation stations set`, `remove`) ;
    // les autres restent telles que la station les a écrites. `voulu` : ce que la vue a recueilli — rien n'y
    // est cru sur parole. Puis les stations sont relues, et la vue les reçoit par `surGuide`.
    async changerUneStation(project: Project, name: unknown, wanted: unknown): Promise<StationChanged> {
      const withIt = withItsKitchen(project);
      if (withIt === undefined) return { refus: withoutBox(project.nom) };
      const held = hold(withIt);
      const station = typeof name === "string" && NAME_OF_STATION.test(name) ? held.controle?.stations?.declarees.find((readEntry) => readEntry.nom === name) : undefined;
      if (station === undefined) return { refus: `Nothing was changed: “${String(name)}” is not a station the project declares.` };
      if (held.action !== undefined || held.verifiant !== undefined) return { refus: BUSY };
      const readOne = (wanted ?? {}) as Read;
      const writtenEntries: { commande: string; titre: string }[] = [];
      if (readOne.retiree === true) {
        writtenEntries.push({ commande: `installation stations remove ${station.nom}`, titre: `Its main station did not remove ${station.nom}` });
      } else {
        const { cooks, fournit: provides } = readOne;
        if (typeof cooks !== "number" || !Number.isInteger(cooks) || cooks < 1 || cooks > 99) return { refus: `Nothing was saved: how many cooks ${station.nom} runs at once is a whole number, from 1 to 99.` };
        const readEntries = Array.isArray(provides) ? (provides as unknown[]).map((capacity) => (typeof capacity === "string" ? capacity.trim().normalize("NFC") : "")) : [];
        if (readEntries.length === 0) return { refus: `Nothing was saved: ${station.nom} provides at least one capability — tick one.` };
        const unreadable = readEntries.find((capacity) => !CAPACITY.test(capacity));
        if (unreadable !== undefined) return { refus: `Nothing was saved: “${unreadable}” is not a capability — letters, digits and dashes.` };
        const capacities = [...new Set(readEntries)];
        if (cooks !== station.cooks || capacities.join("+") !== station.fournit.join("+")) {
          const writtenOne = capacities.join("+");
          writtenEntries.push({ commande: `installation stations set ${station.nom} ${cooks} ${/^[A-Za-z0-9+_-]+$/.test(writtenOne) ? writtenOne : `'${writtenOne}'`}`, titre: `Its main station refused the change to ${station.nom}` });
        }
      }
      if (writtenEntries.length === 0) return { fait: `${station.nom}: nothing changed` };
      held.action = `changing ${station.nom}…`;
      push(project, held);
      try {
        for (const { commande: command, titre: title } of writtenEntries) {
          const done = await write(withIt, command, { ok: "", non: title });
          if (!done.ok) return { refus: done.titre, detail: done.obtenu };
        }
      } finally {
        held.action = undefined;
        push(project, held);
      }
      await rereadTheStations(withIt, held);
      if (readOne.retiree === true) return { fait: `${station.nom} removed — the other stations are unchanged` };
      return { fait: `${station.nom} saved; the other stations are unchanged` };
    },

    // Protège la branche d'intégration sur GitHub, par le compte de `gh` de la box.
    proteger(project: Project) {
      return act(project, "protecting the integration branch…", (withIt) => write(withIt, "installation protection poser", { ok: "Integration branch protected", non: "The integration branch is not protected" }));
    },

    // Répond à la décision courante — deux valeurs quand elle se répond avec une autre.
    repondre(project: Project, values: unknown) {
      return act(project, "recording your answer…", async (withIt, held) => {
        const current = detail(held, "decisions")?.lu.courante;
        if (current === undefined || current === null) return { refus: "Nothing was answered: the station has no decision waiting — read the steps again." };
        const expected = current.avec === null ? 1 : 2;
        const readEntries = Array.isArray(values) ? (values as unknown[]).map((value) => (typeof value === "string" ? value.trim() : "")) : [];
        if (readEntries.length !== expected || readEntries.some((value) => value === "")) return { refus: `Nothing was answered: ${current.nom} takes ${expected === 1 ? "one value" : `two values — its own, and ${current.avec?.nom}'s`}.` };
        const refused = readEntries.find((value) => !VALUE.test(value));
        if (refused !== undefined) return { refus: `Nothing was answered: “${refused}” is not a value the station reads — letters, digits, dots and hyphens.` };
        return write(withIt, `installation decisions courante ${readEntries.join(" ")}`, { ok: `${current.nom} recorded`, non: `The station refused the answer to ${current.nom}` });
      });
    },

    // Les décisions qui restent, le démarrage ne les réclamant pas : l'étape est notée faite, elles restent à poser plus tard.
    passerDecisions(project: Project) {
      return act(project, "moving past the optional decisions…", async (withIt, held) => {
        const readOne = detail(held, "decisions");
        if (readOne === undefined || held.etapes?.courante !== "decisions") return { refus: "Nothing to skip: the decisions step is not the current one." };
        if (!readOne.passable) return { refus: "Not skipped: the start still requires a decision — answer it first." };
        return write(withIt, "installation etapes decisions faite", { ok: "Decisions step done — the remaining ones are optional", non: "The station did not mark the decisions step done" });
      });
    },

    // « Démarrer » : la station de cet ordinateur tourne en fond (#3630), aucun service n'y est à démarrer.
    demarrer(project: Project): Promise<Terminal | { refus: string }> {
      return Promise.resolve(commandOfStartup(project));
    },

    // Le dernier contrôle lu d'un projet installé, sans rien relancer : « + shell » y prend les
    // stations que la box déclare. Rien, tant qu'aucun n'a été lu.
    controleDe(name: string): Control | undefined {
      const held = heldOnes.get(name);
      return held?.fini === true ? held.controle : undefined;
    },

    // Le projet a quitté la liste : rien n'est gardé de son installation.
    oublier(name: string): void {
      heldOnes.delete(name);
    },
  };
}
