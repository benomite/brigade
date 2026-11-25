// Les fiches de l'onglet Agents (ticket 4117) : un enregistrement par agent que la cuisine fait travailler sur le projet,
// composé de ce que les commandes du runtime qui existent ont rendu — `facts` (ses agents, ses rôles, sa cadence, le budget de
// ses gates, ses stations), `setting` (les réglages en vigueur et d'où ils viennent), `switch` (l'interrupteur du projet),
// `closing --json` (ce que le closer voit sur la base) et `log` (quand et par qui une décision a été posée). Rien n'est lu
// ailleurs, rien n'est deviné : ce qui ne se lit pas se dit « not read », avec sa raison, dans la fiche même.
//
// Le runtime ne publie pas encore de commande qui change le niveau d'autonomie d'un agent, ni de pause à lui (docs/runtime/
// autonomie.md, « No command sets a level yet ») : ces réglages se montrent, ne se changent pas d'ici, et disent où ils vivent.
// L'interrupteur du projet est la seule pause que le runtime connaisse : il tient le manager, les cooks et la pass.
import type { ReglagesVus, ReglageVu } from "../../reglages-du-projet.ts";
import { SOURCE_DU_DEPOT } from "../../reglages-du-projet.ts";
import { choixAvec, PLACES, REGLABLES, type Reglable } from "./reglables.ts";

export type Manque = { sans: string; detail?: string };
export type Interrupteur = { on: boolean; since: string; by: string };
// Ce qu'une décision du chef a changé en dernier : quand, et par qui le journal l'écrit.
export type Changement = { at: string; by: string };
export type Changements = Map<string, Changement>;
export type Lectures = {
  maintenant: Date;
  faits: Record<string, unknown>;
  reglages: ReglagesVus | Manque;
  interrupteur: Interrupteur | Manque;
  fermeture: unknown;
  changements: Changements | Manque;
};

export type Reglage = { key: string; label: string; value: string; options?: string[]; editable: boolean; livesIn?: string; from?: string | undefined; changedAt?: string; changedBy?: string };
export type Chiffre = { label: string; value: string; meaning: string };
export type Geste = { at: string; line: string; reason: string; outcome: string };
export type Fiche = { agent: string; role: string; state: string; nextRun: { text: string; at: string | null }; week: Chiffre[]; now?: Chiffre[]; settings: Reglage[]; gestures: Geste[] };

export const SEMAINE_MS = 7 * 24 * 3600 * 1000;
const NIVEAU_NON_REGLABLE = "the runtime's levels file on the box (autonomy-levels.json) — no command sets it yet, so the app cannot change it";
const PAUSE_DU_PROJET = "the project switch, at the head of the page: switching it on again asks you first";

const objet = (valeur: unknown): Record<string, unknown> | null => (typeof valeur === "object" && valeur !== null && !Array.isArray(valeur) ? (valeur as Record<string, unknown>) : null);
const texte = (valeur: unknown): valeur is string => typeof valeur === "string" && valeur !== "";
const estManque = (valeur: unknown): valeur is Manque => objet(valeur) !== null && typeof (valeur as Manque).sans === "string";
const nombre = (valeur: unknown): valeur is number => typeof valeur === "number" && Number.isFinite(valeur);
const pluriel = (combien: number, mot: string) => `${combien.toLocaleString("en-US")} ${mot}${combien === 1 ? "" : "s"}`;
const pasLu = (pourquoi: string) => `not read: ${pourquoi}`;

// Celui que le journal nomme : `chef` est le chef, quelque geste qui ait écrit.
export const quiEst = (auteur: string) => (auteur === "chef" ? "the chef" : auteur);

// --- Ce que la cuisine dit de ses agents ----------------------------------------------

type Equipier = { agent: string; state: string; lastGesture: { line: string; at: string } | null; nextRun: { text: string; at: string | null }; autonomy: string; exceptions: Record<string, string>; gestures: Geste[] };

const geste = (valeur: unknown): Geste | null => {
  const un = objet(valeur);
  return un !== null && texte(un.at) && typeof un.line === "string" && typeof un.reason === "string" && typeof un.outcome === "string" ? { at: un.at, line: un.line, reason: un.reason, outcome: un.outcome } : null;
};
// Un enregistrement de `equipe`, ou null s'il ne se lit pas.
function equipier(valeur: unknown): Equipier | null {
  const un = objet(valeur);
  const suivante = objet(un?.nextRun);
  const dernier = objet(un?.lastGesture);
  if (un === null || !texte(un.agent) || !texte(un.state) || suivante === null || !texte(suivante.text) || !texte(un.autonomy) || !Array.isArray(un.gestures)) return null;
  const gestes = un.gestures.map(geste);
  if (gestes.includes(null)) return null;
  const exceptions = objet(un.exceptions) ?? {};
  return {
    agent: un.agent,
    state: un.state,
    lastGesture: dernier !== null && texte(dernier.line) && texte(dernier.at) ? { line: dernier.line, at: dernier.at } : null,
    nextRun: { text: suivante.text, at: texte(suivante.at) ? suivante.at : null },
    autonomy: un.autonomy,
    exceptions: Object.fromEntries(Object.entries(exceptions).filter((entree): entree is [string, string] => typeof entree[1] === "string")),
    gestures: gestes as Geste[],
  };
}

// --- Ses chiffres ---------------------------------------------------------------------

// Ce que l'agent a fait, ou laissé au chef, ou seulement dit, dans les sept derniers jours — d'après son journal de gestes.
function chiffresDesGestes(gestes: readonly Geste[], maintenant: Date): Chiffre[] {
  const recents = gestes.filter(({ at }) => Date.parse(at) >= maintenant.getTime() - SEMAINE_MS);
  const compte = (issue: string) => recents.filter(({ outcome }) => outcome === issue).length;
  const seuls = compte("fixed by itself");
  const auChef = compte("handed to the chef");
  const dits = compte("not done");
  return [
    { label: "Done by itself", value: String(seuls), meaning: "gestures it made alone in the last 7 days, without waiting for you" },
    { label: "Left to you", value: String(auChef), meaning: "gestures it handed to you in the last 7 days, because it should not decide them alone" },
    ...(dits === 0 ? [] : [{ label: "Only reported", value: String(dits), meaning: "gestures it described in the last 7 days but did not make, because its level is observe" }]),
  ];
}

const dureeDite = (secondes: number) => (secondes >= 3600 ? `${(secondes / 3600).toLocaleString("en-US", { maximumFractionDigits: 1 })} h` : secondes >= 60 ? `${Math.round(secondes / 60)} min` : `${Math.round(secondes)} s`);
// Le temps ordinaire d'un ticket à une étape, sur les sept derniers jours : nul sous trois séjours, et le chiffre le dit.
function medianeDe(faits: Record<string, unknown>, etape: "taken" | "pass", label: string, ou: string): Chiffre[] {
  const mediane = objet(objet(faits.cadence)?.medianSeconds)?.[etape];
  if (nombre(mediane)) return [{ label, value: dureeDite(mediane), meaning: `the usual time a ticket stays ${ou}, over the stays of the last 7 days` }];
  return [{ label, value: "not enough yet", meaning: `the usual time a ticket stays ${ou} is told once three tickets have been through it in 7 days` }];
}

// Ce que le closer voit sur la base à cet instant, en mots simples — ce que `closing --json` écrit, chiffre pour chiffre.
function ceQueLeCloserVoit(fermeture: unknown): Chiffre[] {
  const lu = objet(fermeture);
  if (lu === null) return [{ label: "What it sees on main", value: "not read", meaning: "the closer's reading could not be read, so no figure is told" }];
  if (lu.configured !== true) return [{ label: "What it sees on main", value: "no closer set", meaning: "no model and effort is set for the closer on this project, so no pass is written" }];
  const observation = objet(lu.observation);
  const merges = observation?.mergesSinceCleanup;
  if (observation === null || !nombre(merges)) return [{ label: "What it sees on main", value: "not read", meaning: "the closer's reading has no observation" }];
  const attente = { label: "Merges since its last pass", value: merges.toLocaleString("en-US"), meaning: "changes merged into main since the closer last cleaned up; it opens a new pass after 20 of them, at most once a day" };
  if (observation.readable !== true) return [attente, { label: "What it finds on main", value: "not read", meaning: `main could not be read: ${typeof observation.error === "string" ? observation.error : "no reason given"}` }];
  const fenetres = Array.isArray(observation.ratio) ? observation.ratio : [];
  const derniere = objet(fenetres.at(-1));
  const doublons = observation.duplicates;
  const morts = observation.deadExports;
  return [
    attente,
    derniere !== null && nombre(derniere.merges) && derniere.merges > 0 && texte(derniere.reads)
      ? { label: "Lines added for each line removed", value: derniere.reads.replace(":1", " to 1"), meaning: `over the last ${pluriel(derniere.merges, "merge")}: the lower it is, the leaner the code grows` }
      : { label: "Lines added for each line removed", value: "none yet", meaning: "no merge has been counted yet" },
    { label: "Duplicated passages", value: nombre(doublons) ? String(doublons) : "not read", meaning: "stretches of identical lines found on main, that the closer can merge into one" },
    { label: "Unused exports", value: nombre(morts) ? String(morts) : "not read", meaning: "functions or values a file exports that nothing uses, or only tests use: dead code the closer can remove" },
  ];
}

// --- Ses réglages ---------------------------------------------------------------------

type Valeur = { value: string; from?: string; depot: boolean } | Manque;
const calibres: Record<string, { cle: string; moitie: "modele" | "effort" }> = {
  "manager-modele": { cle: "manager", moitie: "modele" },
  "manager-effort": { cle: "manager", moitie: "effort" },
  "ceiling-modele": { cle: "plafond", moitie: "modele" },
  "ceiling-effort": { cle: "plafond", moitie: "effort" },
  "reviewer-modele": { cle: "reviewer", moitie: "modele" },
  "reviewer-effort": { cle: "reviewer", moitie: "effort" },
  "closer-modele": { cle: "closer", moitie: "modele" },
  "closer-effort": { cle: "closer", moitie: "effort" },
};
const nombres: Record<string, string> = { "closer-cooks": "closer-cooks", "closer-tokens": "closer-tokens", "closer-retraits": "closer-lines" };

// La valeur en vigueur d'un réglage, d'où elle vient, et si c'est le dépôt qui la pose.
export function valeurDe(reglable: Reglable, { reglages, faits }: Pick<Lectures, "reglages" | "faits">): Valeur {
  if (reglable.geste === "budget-gates" || reglable.geste === "budget-gates-cpu") {
    const budget = objet(objet(faits.coutDesGates)?.budget);
    const cle = reglable.geste === "budget-gates" ? "durationSeconds" : "cpuSeconds";
    const valeur = budget?.[cle];
    if (!nombre(valeur)) return { sans: "the runtime does not give the gates budget" };
    return { value: String(valeur), from: objet(budget?.parLeChef)?.[cle] === true ? "set on the station" : "default", depot: false };
  }
  if (estManque(reglages)) return reglages;
  const cle = calibres[reglable.geste]?.cle ?? nombres[reglable.geste];
  const vu: ReglageVu | undefined = reglages.reglages.find((un) => un.cle === cle);
  if (vu === undefined) return { sans: "this station's runtime does not give it yet — update it" };
  const valeur = "valeur" in vu ? vu.valeur : calibres[reglable.geste]?.moitie === "modele" ? vu.modele : vu.effort;
  return { value: valeur === "" ? "not set" : valeur, from: vu.source, depot: vu.source === SOURCE_DU_DEPOT };
}

// Quand et par qui la décision d'un réglage a été posée en dernier, d'après le journal du projet.
function changeDe(cle: string, { changements }: Lectures): { changedAt?: string; changedBy?: string } {
  if (estManque(changements)) return {};
  const un = changements.get(cle);
  return un === undefined ? {} : { changedAt: un.at, changedBy: quiEst(un.by) };
}

// La rangée d'un réglage que l'app change : ses choix, ou — quand le dépôt le pose, ou que sa valeur ne se lit pas — là où il vit.
function ligneReglable(reglable: Reglable, lectures: Lectures): Reglage {
  const base = { key: reglable.cle, label: reglable.label };
  const valeur = reglable.agent === "cooks" ? places(lectures.faits) : valeurDe(reglable, lectures);
  if (estManque(valeur)) return { ...base, value: pasLu(valeur.sans), editable: false, livesIn: "the station's runtime, which does not give it here" };
  const decision = reglable.agent === "cooks" ? "cooks" : reglable.decision;
  if (valeur.depot) return { ...base, value: valeur.value, editable: false, livesIn: "the project's repository (.claude/brigade/projet.json): a change there is a pull request, from Settings", from: valeur.from };
  return { ...base, value: valeur.value, options: choixAvec(reglable, valeur.value), editable: true, from: valeur.from, ...changeDe(decision, lectures) };
}

// Le plafond de cooks simultanés : celui de chaque station que le runtime déclare — le même partout, ou dit station par station.
function places(faits: Record<string, unknown>): Valeur {
  const stations = Array.isArray(faits.stations) ? faits.stations.map(objet) : [];
  if (stations.length === 0 || stations.includes(null)) return { sans: "no station is declared" };
  const plafonds = [...new Set(stations.map((station) => (nombre(station?.plafond) ? String(station.plafond) : "no limit")))];
  return plafonds.length === 1 ? { value: plafonds[0] as string, from: "set per station", depot: false } : { value: "different", from: `its stations differ: ${plafonds.join(", ")}`, depot: false };
}

// La rangée d'un niveau d'autonomie : montré, jamais changé d'ici.
const niveau = (label: string, valeur: string, livesIn = NIVEAU_NON_REGLABLE): Reglage => ({ key: "autonomy", label, value: valeur, editable: false, livesIn });

// La rangée de pause : l'interrupteur du projet pour ceux qu'il tient ; pour les autres, ce qu'ils n'ont pas encore.
function pause(tenu: boolean, { interrupteur }: Lectures): Reglage {
  if (!tenu) return { key: "paused", label: "Pause", value: "no switch of its own", editable: false, livesIn: "the project switch, which stops only the manager, the cooks and the pass — it has no switch of its own yet" };
  if (estManque(interrupteur)) return { key: "paused", label: "Pause", value: pasLu(interrupteur.sans), editable: false, livesIn: PAUSE_DU_PROJET };
  const quand = { changedAt: interrupteur.since, changedBy: quiEst(interrupteur.by) };
  // Rallumer demande confirmation, comme au-dessus de la page : le bouton n'y passe pas par-dessus.
  if (!interrupteur.on) return { key: "paused", label: "Pause", value: "paused", editable: false, livesIn: PAUSE_DU_PROJET, ...quand };
  return { key: "paused", label: "Pause", value: "running", options: ["running", "paused"], editable: true, from: "the project switch pauses the manager, the cooks and the pass together", ...quand };
}

// --- Les agents -----------------------------------------------------------------------

const ROLES: Record<string, string> = {
  second: "Your product assistant, in the terminal on the right: it helps you write the tickets.",
  manager: "Judges the project's issues, puts the ready ones on the rail, splits epics, and decides what follows a red ticket.",
  cooks: "Each cook builds one ticket on its own branch and hands it to the pass; the design work is done by the same cooks, with the project's tools.",
  pass: "Judges each delivery — its gates, its review — and merges the green ones.",
  reviewer: "Reads each delivery's diff and writes the review the pass judges with.",
  "second judge": "Checks that a green delivery touching its own judges (gates, setup, workflows) does not weaken them.",
  triage: "Takes up a card before it reaches TODO, and settles it alone when it can: relaunch, split, wait or remove.",
  closer: "Cleans the project's code — dead code, duplicates — in a pass it opens by itself, at most once a day, once enough merges are in.",
  supervisor: "Watches the rail and wakes when nothing has been merged for 30 minutes while a ticket waits; it reruns or puts back what is stuck.",
};
const PROCHAINES: Record<string, string> = {
  second: "second: none, it answers when you talk to it",
  reviewer: "reviewer: reads each delivery as the pass takes it",
  "second judge": "second judge: runs on a green delivery that touches its own judges",
  triage: "triage: takes a card before it reaches TODO",
  cooks: "cooks: a cook starts when a ticket is taken",
};
// Les agents que l'onglet nomme, dans l'ordre où il les montre ; ceux que le runtime nomme en plus viennent après.
const ORDRE = ["second", "manager", "cooks", "pass", "reviewer", "second judge", "triage", "closer", "supervisor"];

// Ce que l'agent sert à faire, en une phrase : la nôtre, celle que le runtime donne de son rôle, ou à défaut le dire.
const SANS_PHRASE = "An agent the kitchen runs: the app has no description of it yet.";
const laPhrase = (nom: string, roles: readonly Role[]): string => (Object.hasOwn(ROLES, nom) ? (ROLES[nom] as string) : roles.find(({ role }) => role === nom)?.does || SANS_PHRASE);

type Role = { role: string; does: string; latest: { what: string; at: string } | null };
function rolesLus(faits: Record<string, unknown>): Role[] {
  if (!Array.isArray(faits.rolesCuisine)) return [];
  return faits.rolesCuisine.flatMap((valeur) => {
    const un = objet(valeur);
    if (un === null || !texte(un.role)) return [];
    const dernier = objet(un.latest);
    return [{ role: un.role, does: typeof un.does === "string" ? un.does : "", latest: dernier !== null && texte(dernier.what) && texte(dernier.at) ? { what: dernier.what, at: dernier.at } : null }];
  });
}

export function fichesDesAgents(lectures: Lectures): Fiche[] {
  const { faits, maintenant } = lectures;
  const brut = faits.equipe;
  const equipeIllisible = objet(brut)?.illisible;
  const equipiers = Array.isArray(brut) ? brut.map((un) => ({ un: equipier(un), nom: texte(objet(un)?.agent) ? (objet(un)?.agent as string) : null })) : [];
  const pourquoiPasDEquipe = typeof equipeIllisible === "string" ? `broken: ${equipeIllisible}` : brut === undefined ? "not read: this runtime does not publish its agents yet" : null;
  const parNom = (nom: string) => equipiers.find(({ nom: son }) => son === nom);
  const roles = rolesLus(faits);
  const enCours = (Array.isArray(faits.agents) ? faits.agents : []).flatMap((valeur) => {
    const un = objet(valeur);
    return un !== null && texte(un.role) ? [{ role: un.role, ticket: nombre(un.ticket) ? un.ticket : null }] : [];
  });
  const sansEtat = (nom: string): { state: string; nextRun: { text: string; at: string | null } } => ({
    state: pourquoiPasDEquipe ?? `not read: the record of ${nom} cannot be read`,
    nextRun: { text: `${nom}: next run not read`, at: null },
  });

  // Un agent de l'équipe du runtime : son enregistrement, sa phrase, ses chiffres, ses gestes ; ses réglages s'y posent.
  const deLEquipe = (nom: string, reglages: Reglage[], plus: Partial<Fiche> = {}): Fiche => {
    const trouve = parNom(nom);
    const lu = trouve?.un ?? null;
    const dernier = lu?.lastGesture ?? null;
    const gestes = lu === null ? [] : dernier === null || lu.gestures.some(({ at, line }) => at === dernier.at && line === dernier.line) ? lu.gestures : [...lu.gestures, { at: dernier.at, line: dernier.line, reason: "", outcome: "" }];
    return {
      agent: nom,
      role: laPhrase(nom, roles),
      ...(lu === null ? sansEtat(nom) : { state: lu.state, nextRun: lu.nextRun }),
      week: lu === null ? [] : chiffresDesGestes(lu.gestures, maintenant),
      settings: reglages,
      gestures: gestes,
      ...plus,
    };
  };
  const reglablesDe = (nom: string) => REGLABLES.filter(({ agent }) => agent === nom).map((reglable) => ligneReglable(reglable, lectures));
  const niveauDe = (nom: string, label = "Autonomy"): Reglage => {
    const lu = parNom(nom)?.un;
    return niveau(label, lu?.autonomy ?? pasLu(pourquoiPasDEquipe ?? `the record of ${nom} cannot be read`));
  };
  // Un rôle que le runtime nomme sans l'enregistrer comme agent de l'équipe : sa dernière action, son travail en cours.
  const duRole = (nom: string, reglages: Reglage[], etat: string): Fiche => {
    const role = roles.find((un) => un.role === nom);
    return {
      agent: nom,
      role: laPhrase(nom, roles),
      state: etat,
      nextRun: { text: Object.hasOwn(PROCHAINES, nom) ? (PROCHAINES[nom] as string) : `${nom}: next run not known`, at: null },
      week: [],
      settings: reglages,
      gestures: role?.latest == null ? [] : [{ at: role.latest.at, line: role.latest.what, reason: "", outcome: "" }],
    };
  };

  const fiches: Fiche[] = [];
  fiches.push({
    agent: "second",
    role: ROLES.second as string,
    state: "on call: it works when you talk to it",
    nextRun: { text: PROCHAINES.second as string, at: null },
    week: [],
    settings: [
      { key: "model", label: "Model and effort", value: "Claude Code's own", editable: false, livesIn: "Claude Code on this computer: type /model in the second's terminal" },
    ],
    gestures: [],
  });
  fiches.push(deLEquipe("manager", [...reglablesDe("manager"), niveauDe("manager"), ...(parNom("manager")?.un?.exceptions["split-epic"] === undefined ? [] : [niveau("Autonomy for splitting an epic", parNom("manager")?.un?.exceptions["split-epic"] as string)]), pause(true, lectures)]));

  // Les cooks, un seul agent : ceux qui tournent, leurs gestes, et les réglages qu'ils partagent.
  const cooks = equipiers.flatMap(({ un }) => (un !== null && un.agent.startsWith("cook #") ? [un] : []));
  const cookIllisibles = equipiers.filter(({ un, nom }) => un === null && nom?.startsWith("cook #") === true);
  fiches.push({
    agent: "cooks",
    role: ROLES.cooks as string,
    state: pourquoiPasDEquipe ?? (cookIllisibles.length > 0 ? `not read: ${pluriel(cookIllisibles.length, "cook record")} cannot be read` : cooks.length === 0 ? "idle" : `working on ${cooks.map(({ state }) => state.replace(/^working on /, "")).join(", ")}`),
    nextRun: cooks[0]?.nextRun ?? { text: PROCHAINES.cooks as string, at: null },
    week: medianeDe(faits, "taken", "Usual time with a cook", "with a cook"),
    settings: [ligneReglable(PLACES, lectures), niveau("Autonomy", cooks[0]?.autonomy ?? pasLu("no cook runs now, so none says its level")), pause(true, lectures)],
    gestures: cooks.flatMap(({ gestures }) => gestures),
  });
  const laPass = deLEquipe("pass", [...reglablesDe("pass"), { key: "gates-timeout", label: "Gates time-out", value: "30 min unless set", editable: false, livesIn: "the BRIGADE_GATES_TIMEOUT_SECONDS variable on the box, or the repository's thresholds (Settings > Duration caps)" }, niveauDe("pass"), pause(true, lectures)]);
  fiches.push({ ...laPass, week: [...laPass.week, ...medianeDe(faits, "pass", "Usual time in the pass", "in the pass")] });
  const etatDeLaPass = parNom("pass")?.un?.state ?? pourquoiPasDEquipe ?? "not read";
  fiches.push(duRole("reviewer", [...reglablesDe("reviewer"), niveauDe("pass", "Autonomy"), pause(false, lectures)], etatDeLaPass));
  fiches.push(duRole("second judge", [{ key: "settings", label: "Settings", value: "none read", editable: false, livesIn: "its runtime code (docs/runtime/pass.md): the app reads no setting of it" }, niveauDe("pass", "Autonomy"), pause(false, lectures)], etatDeLaPass));
  const triage = enCours.find(({ role }) => role === "triage");
  fiches.push(duRole("triage", [{ key: "settings", label: "Settings", value: "none read", editable: false, livesIn: "its runtime code: the app reads no setting of it" }, pause(false, lectures)], triage === undefined ? "idle" : `working${triage.ticket === null ? "" : ` on #${triage.ticket}`}`));
  fiches.push(deLEquipe("closer", [...reglablesDe("closer"), niveauDe("closer"), pause(false, lectures)], { now: ceQueLeCloserVoit(lectures.fermeture) }));
  fiches.push(deLEquipe("supervisor", [niveauDe("supervisor"), pause(false, lectures)]));

  // Tout autre agent que le runtime nomme : un enregistrement de l'équipe, un rôle de la cuisine, un agent qui tourne.
  const autres = new Set<string>();
  for (const { nom } of equipiers) if (nom !== null && !nom.startsWith("cook #") && !ORDRE.includes(nom)) autres.add(nom);
  for (const { role } of roles) if (!ORDRE.includes(role)) autres.add(role);
  for (const { role } of enCours) if (!ORDRE.includes(role)) autres.add(role);
  for (const nom of [...autres].sort()) {
    const lu = parNom(nom);
    fiches.push(lu === undefined ? duRole(nom, [{ key: "settings", label: "Settings", value: "none read", editable: false, livesIn: "its runtime code: the app reads no setting of it" }], "not read: the runtime names it without a record") : deLEquipe(nom, [niveauDe(nom), pause(false, lectures)]));
  }
  return fiches.sort((a, b) => (ORDRE.includes(a.agent) ? ORDRE.indexOf(a.agent) : ORDRE.length) - (ORDRE.includes(b.agent) ? ORDRE.indexOf(b.agent) : ORDRE.length));
}
