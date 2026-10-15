// Les gestes de la fiche d'un ticket : ceux qu'il est possible de faire sur lui à cet instant, et
// seulement ceux-là, chacun avec son prix (#639). La table est celle du chef, fermée :
//   - tous les états : ouvrir l'issue, ouvrir la PR (s'il y en a une), demander au second, changer
//     la priorité ;
//   - en attente ou BLOQUÉ : en plus, le retirer du rail, et le mettre en WAITING (#588) ;
//   - pris ou en pass : rien de plus — on ne touche pas à un ticket en cours ;
//   - servi : en plus, le voir dans le navigateur (#620), s'il y a un écran ;
//   - qui t'attend : en plus, le geste que la file nomme pour lui.
// Un geste n'apparaît que si son action est branchée (`ACTIONS`) : la table dit ce qui est
// permis, le branchement ce qui se fait. Une action qui n'est pas livrée n'a pas de branchement,
// et son geste n'est jamais proposé — ni grisé, ni promis. Celles qui manquent aujourd'hui :
//   - « mettre en WAITING » (#588) et « voir dans le navigateur » (#620) : leur épique n'est pas
//     livrée — elle se branche ici à sa livraison, d'une ligne, sans rien toucher d'autre ;
//   - « retirer du rail » et « changer la priorité » : le runtime sait les faire (#637,
//     runtime/src/geste-ticket.ts), mais aucune commande de box ne les expose encore, et l'app ne
//     lance que les commandes qui existent. Elles se branchent ici quand le runtime les expose :
//     `{ box: (ticket, valeur) => "<commande> …" }`, ce qui suit `brigade <nom>`.
// Ce module ne lance rien : il dit ce qui se propose, et compose ce qui part.
import type { Projet } from "./config.ts";
import { enPoste } from "./gestes.ts";
import { CONTROLE, type Terminal } from "./terminaux.ts";

export type IdDeFiche = "issue" | "pr" | "second" | "file" | "priorite" | "retirer" | "waiting" | "navigateur";

// Comment une action se joue, une fois branchée : `app`, l'app la joue elle-même (ouvrir une
// adresse, écrire dans le second) ; `box`, c'est une commande du runtime — `box` compose ce qui
// suit `brigade <nom>`, pour ce ticket et la valeur choisie. `si` : ce que l'action demande de
// plus à la carte pour se proposer — l'écran d'une livraison, pour le navigateur.
export type Branchement = ({ app: true } | { box: (ticket: number, valeur?: string) => string }) & { si?: (carte: CarteDeFiche) => boolean };
export type Actions = Readonly<Partial<Record<IdDeFiche, Branchement>>>;

// Ce qui est branché aujourd'hui. Ouvrir l'issue et la PR, demander au second et écrire le geste
// de la file : l'app les joue déjà. Les autres attendent leur action (en tête de ce fichier).
export const ACTIONS: Actions = {
  issue: { app: true },
  pr: { app: true },
  second: { app: true },
  file: { app: true },
};

// Ce que la fiche lit de la carte cliquée (faits.ts, `Carte`) : son mot d'état, si elle s'ouvre
// sur son issue, si elle t'attend et ce que la file en dit, sa PR.
export type CarteDeFiche = { ticket: number; etat?: string; ouvrable: boolean; attendu: boolean; attend: readonly string[]; pr?: boolean };

// Un geste proposé : son nom, ce que son bouton dit, son prix. `suite` : pour le geste de la file,
// la commande qu'elle nomme, après `brigade <nom>` — la vue l'affiche dans sa forme de poste ;
// `rang` : son rang parmi celles que la file nomme, ce que la vue rend pour le jouer. `valeurs` :
// celles entre lesquelles le chef choisit avant de le jouer.
export type Propose = { id: IdDeFiche; libelle: string; prix: string; suite?: string; rang?: number; valeurs?: readonly string[] };

// Les priorités qu'un ticket peut prendre (runtime/src/geste-ticket.ts) : 1 est servi d'abord ;
// `none` la retire, il passe après les autres.
export const PRIORITES: readonly string[] = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "none"];

// Ce que chaque geste coûte, dans les mots de l'app — ceux du runtime pour ses deux actions
// (runtime/src/geste-ticket.ts, `price`).
export const PRIX = {
  issue: "none: opens the issue in your browser — nothing changes on the box",
  pr: "none: opens the merged PR in your browser — nothing changes on the box",
  second: "none: a request is written in the second, without Enter — nothing leaves until you press it, and the second acts only with your agreement",
  file: "the command is written in the second, without Enter — nothing runs until you press it; then it costs what the queue's line says it does",
  priorite: "none: only the order of service changes; no cook is launched or interrupted, and nothing is spent",
  retirer: "the ticket leaves the rail and is not cooked; its issue stays open and loses its `fire` label — put it back to bring the ticket back on the rail. Nothing is lost, nothing is spent",
  waiting: "none: the ticket leaves TODO for WAITING, and its issue says what it waits for, from whom, until when — no cook takes it until it comes back",
  navigateur: "none: opens the delivered screen in your browser — nothing changes on the box",
} as const satisfies Record<IdDeFiche, string>;

const LIBELLES: Record<Exclude<IdDeFiche, "file">, string> = {
  issue: "open the issue",
  pr: "open the merged PR",
  second: "ask the second",
  priorite: "change the priority",
  retirer: "remove from the rail",
  waiting: "waiting for…",
  navigateur: "view in the browser",
};

// La table du chef : ce que chaque mot d'état ajoute aux gestes de tous. Un mot qu'elle ne
// nomme pas — 86, WAITING, un mot inconnu — n'ajoute rien.
const EN_PLUS: Readonly<Record<string, readonly Exclude<IdDeFiche, "file">[]>> = {
  "en attente": ["retirer", "waiting"],
  BLOQUÉ: ["retirer", "waiting"],
  pris: [],
  "en pass": [],
  servi: ["navigateur"],
};

// Les commandes que la file nomme dans ce qu'elle dit d'un ticket : chacune entre backticks, sous
// sa forme de box (`brigade <projet> <commande> …`, runtime/src/geste.ts), dans l'ordre où elle
// les écrit, une seule fois chacune. Rend ce qui suit `brigade <projet>`. Une commande qui attend
// des mots que seul le chef peut écrire (`--what <ce qu'il attend>`), ou qui porte autre chose
// que des mots simples, n'est pas reprise : elle se lit dans la ligne, et la demande au second reste.
const NOMMEE = /`brigade [^\s`]+ ([^`\n]+)`/g;
const MOT_SIMPLE = /^[A-Za-z0-9@._:=-]+$/;
export function commandesDeLaFile(lignes: readonly string[]): string[] {
  const suites = lignes.flatMap((ligne) => [...ligne.matchAll(NOMMEE)].map(([, suite = ""]) => suite.trim()));
  return [...new Set(suites.filter((suite) => suite !== "" && suite.split(/ +/).every((mot) => MOT_SIMPLE.test(mot))))];
}

// Les gestes de la fiche de cette carte, dans l'ordre où elle les pose : ceux que la table du
// chef permet pour son état, et dont l'action est branchée.
export function gestesDeLaFiche(carte: CarteDeFiche, actions: Actions = ACTIONS): Propose[] {
  const branche = (id: IdDeFiche) => {
    const action = actions[id];
    return action !== undefined && (action.si === undefined || action.si(carte));
  };
  const simple = (id: Exclude<IdDeFiche, "file">): Propose[] => (branche(id) ? [{ id, libelle: LIBELLES[id], prix: PRIX[id], ...(id === "priorite" ? { valeurs: PRIORITES } : {}) }] : []);
  const enPlus = carte.etat === undefined ? [] : (EN_PLUS[carte.etat] ?? []);
  return [
    ...(carte.ouvrable ? simple("issue") : []),
    ...(carte.pr === true ? simple("pr") : []),
    ...simple("second"),
    ...(carte.attendu && branche("file") ? commandesDeLaFile(carte.attend).map((suite, rang): Propose => ({ id: "file", libelle: suite, prix: PRIX.file, suite, rang })) : []),
    // Un ticket sans mot d'état n'est pas sur le rail : il n'a pas de priorité à changer.
    ...(carte.etat === undefined ? [] : simple("priorite")),
    ...enPlus.flatMap(simple),
  ];
}

const texte = (valeur: unknown): valeur is string => typeof valeur === "string";

// La même, d'une carte venue de la vue : ce qui n'a pas la forme d'une carte n'a pas de geste.
export function gestesDeCarte(carte: unknown, actions: Actions = ACTIONS): Propose[] {
  if (typeof carte !== "object" || carte === null) return [];
  const { ticket, etat, ouvrable, attendu, attend, pr } = carte as Record<string, unknown>;
  if (typeof ticket !== "number" || !Number.isSafeInteger(ticket) || !Array.isArray(attend)) return [];
  return gestesDeLaFiche({ ticket, ...(texte(etat) ? { etat } : {}), ouvrable: ouvrable === true, attendu: attendu === true, attend: attend.filter(texte), ...(typeof pr === "boolean" ? { pr } : {}) }, actions);
}

// Ce que joue un geste de la fiche que l'app ne joue pas dans la vue — une commande de la box,
// ou celle que la file nomme —, ou pourquoi rien ne part. `attend` : ce que le dernier bloc
// `attend` dit de ce ticket (faits.ts, `attendu`) — rien, il ne le nomme pas. La commande de la
// file s'écrit sans Entrée : c'est le chef qui la lance ; celle d'une action de box part au clic,
// comme un geste direct du socle (gestes.ts), et sa sortie se lit dans le second.
type Registre = {
  envoyer(projet: Projet, commande: string): Promise<Terminal | { refus: string }>;
  inscrire(projet: Projet, commande: string): Terminal;
};
export function jouerGesteDeFiche(
  terminaux: Registre,
  projet: Projet,
  id: unknown,
  ticket: unknown,
  valeur: unknown,
  attend: readonly string[] | undefined,
  actions: Actions = ACTIONS,
): { refus: string } | Terminal | Promise<Terminal | { refus: string }> {
  if (typeof ticket !== "number" || !Number.isSafeInteger(ticket) || ticket < 1) return { refus: "nothing is sent: the action names no ticket" };
  if (projet.box === undefined) return { refus: `nothing is sent: “${projet.nom}” has no box — there is no command to run` };
  if (projet.refus !== undefined) return { refus: `nothing is sent: “${projet.nom}” does not open — ${projet.refus}` };
  if (id === "file") {
    if (actions.file === undefined) return { refus: "nothing is written: the queue's actions are not available in this app" };
    if (attend === undefined) return { refus: `nothing is written: the \`attend\` block no longer names #${ticket}` };
    const suite = typeof valeur === "number" ? commandesDeLaFile(attend)[valeur] : undefined;
    if (suite === undefined) return { refus: `nothing is written: the \`attend\` block no longer names this command for #${ticket}` };
    const ecrit = enPoste(projet.box, projet.nom, suite);
    return "refus" in ecrit ? ecrit : terminaux.inscrire(projet, `!${ecrit.commande}`);
  }
  const action = typeof id === "string" ? actions[id as IdDeFiche] : undefined;
  if (action === undefined || !("box" in action)) return { refus: `nothing is sent: “${String(id)}” is not an action of the box that this app can run` };
  if (id === "priorite" && !(texte(valeur) && PRIORITES.includes(valeur))) return { refus: `nothing is sent: the priority ${JSON.stringify(valeur) ?? String(valeur)} is not one of ${PRIORITES.join(", ")}` };
  const suite = action.box(ticket, texte(valeur) ? valeur : undefined);
  if (CONTROLE.test(suite)) return { refus: "nothing is sent: the command carries a control character" };
  const ecrit = enPoste(projet.box, projet.nom, suite);
  return "refus" in ecrit ? ecrit : terminaux.envoyer(projet, `!${ecrit.commande}`);
}
