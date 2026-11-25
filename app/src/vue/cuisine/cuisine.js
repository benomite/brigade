// @ts-check
// La vue du projet dessine le plan de la cuisine (ticket 4238, docs/superpowers/specs/2026-11-24-simplified-process.md) :
// de gauche à droite, le backlog — le rail en tête, les tickets prêts à part —, le manager, les cooks, la pass, servi. Une
// carte est dans la colonne de son étape. Une carte parked reste dans la colonne où elle attend, dessinée parked : qui elle
// attend, jusqu'à quand. Il n'y a pas de colonne Waiting. Ce qui attend le chef est aussi dans son TODO, à côté des
// colonnes, et rien d'autre. Au-dessus, la bande du haut : la ligne du supervisor, celle du closer, et au plus un message
// — jamais sans un geste que le chef peut faire.
// Le process principal range le rail en colonnes (faits.ts) : On the rail, Taken, Pass, Waiting, Served, et la liste de ce
// qui attend le chef, que todo.js pose déjà dans la colonne de son étape. Ce module en tire le plan, sans rien relire.
// Il ne touche pas `document` : il reçoit de quoi créer un élément, la vue lui donne le sien et les tests un faux.

import { bouton } from "../composants/bouton/bouton.js";
import { PAS_ENCORE } from "../lexique.js";
import { estRouge } from "../todo/todo.js";

/** @typedef {import("../../faits.ts").Carte} Carte */
/** @typedef {import("../../faits.ts").Colonne} Colonne */
/** @typedef {import("../../faits.ts").RoleDeCuisine} RoleDeCuisine */
/** @typedef {{ createElement(balise: string): any }} Fabrique */

// Les cinq colonnes du plan, dans l'ordre du service (spec, « The plan of the kitchen »).
const BACKLOG = "Backlog";
const MANAGER = "Manager";
export const COOKS = "Cooks";
export const PASS = "Pass";
const SERVED = "Served";
// Le haut du backlog : le rail, ce qui est calibré et prêt (spec, règle 2) ; puis le reste du backlog.
export const DU_RAIL = "Rail — ready to cook";
export const PAS_PRETS = "Not ready yet";
export const RIEN_DE_PRET = "no ticket is ready on the rail";
const RIEN_AU_MANAGER = "no ticket with the manager";

// La colonne de faits.ts d'où vient chaque colonne du plan. Waiting n'en a pas : ses cartes vont dans la colonne de leur étape.
/** @type {Record<string, string>} */
const DE_FAITS = { "On the rail": BACKLOG, Taken: COOKS, Pass: PASS, Served: SERVED };
const WAITING = "Waiting";
// L'étape d'une carte d'après son mot d'état : un mot qui n'en dit aucune laisse la carte dans le backlog.
/** @type {Record<string, string>} */
const ETAPE_DU_MOT = { pris: COOKS, "en pass": PASS, "base rouge": PASS, servi: SERVED };
// Les mots d'un ticket prêt à cuire, sur le rail.
const PRETS = ["en attente", "tests écrits"];
/** @type {Record<string, string>} */
const TONS = { [BACKLOG]: "gris", [MANAGER]: "gris", [COOKS]: "bleu", [PASS]: "jaune", [SERVED]: "vert" };

// Une carte du manager : sa question avant de découper une épique, posée au chef ou répondue et qu'il doit lire.
/** @param {Carte} carte */
const auManager = (carte) => carte.question === true || carte.repondue !== undefined;

// La colonne du plan d'une carte, d'après la colonne de faits.ts où elle est : celle de son étape.
/** @param {string} nomDeFaits @param {Carte} carte */
export const colonneDuPlan = (nomDeFaits, carte) => (auManager(carte) ? MANAGER : nomDeFaits === WAITING ? (ETAPE_DU_MOT[carte.etat ?? ""] ?? BACKLOG) : (DE_FAITS[nomDeFaits] ?? BACKLOG));

/**
 * @typedef {{ nom: string, ton: string, compte: string, cartes: Carte[], vide: string, defile?: boolean, pretes?: Carte[], pasPretes?: Carte[] }} ColonneDuPlan
 */

/**
 * Le plan, des colonnes que todo.js a rangées : chaque carte dans la colonne de son étape, les rouges en tête. Le backlog
 * sépare le rail — ce qui est prêt à cuire — du reste.
 * @param {readonly Colonne[]} colonnes
 * @returns {ColonneDuPlan[]}
 */
export function planDeLaCuisine(colonnes) {
  /** @type {Map<string, { cartes: Carte[], vide?: string, defile?: boolean }>} */
  const plan = new Map([BACKLOG, MANAGER, COOKS, PASS, SERVED].map((nom) => [nom, { cartes: [] }]));
  // Une colonne de faits.ts pas connue — la box ne répond pas — laisse tout le plan inconnu : ses cartes iraient n'importe où.
  const inconnue = colonnes.find(({ compte }) => compte === "?");
  for (const colonne of colonnes) {
    const nom = DE_FAITS[colonne.nom];
    const place = plan.get(nom ?? "");
    if (place !== undefined) {
      place.vide = colonne.vide;
      if (colonne.defile === true) place.defile = true;
    }
    for (const carte of colonne.cartes) plan.get(colonneDuPlan(colonne.nom, carte))?.cartes.push(carte);
  }
  return [...plan].map(([nom, { cartes, vide, defile }]) => {
    const rangees = [...cartes.filter(estRouge), ...cartes.filter((carte) => !estRouge(carte))];
    const colonne = {
      nom,
      ton: TONS[nom] ?? "gris",
      compte: inconnue === undefined ? String(rangees.length) : "?",
      cartes: rangees,
      vide: inconnue !== undefined && nom === MANAGER ? inconnue.vide : nom === MANAGER ? RIEN_AU_MANAGER : (vide ?? "no ticket"),
      ...(defile === true ? { defile } : {}),
    };
    if (nom !== BACKLOG) return colonne;
    const pret = (/** @type {Carte} */ carte) => !estRouge(carte) && carte.parque === undefined && PRETS.includes(carte.etat ?? "");
    return { ...colonne, pretes: rangees.filter(pret), pasPretes: rangees.filter((carte) => !pret(carte)) };
  });
}

// Ce qui attend le chef, dans l'ordre du plan, une fois chacun : le TODO.
/** @param {readonly ColonneDuPlan[]} plan */
export const ceQuiTAttend = (plan) => {
  const vus = new Set();
  return plan.flatMap(({ cartes }) => cartes.filter(estRouge)).filter(({ ticket }) => (vus.has(ticket) ? false : (vus.add(ticket), true)));
};

const MOIS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const deux = (/** @type {number} */ n) => String(n).padStart(2, "0");
// Une date de la box, en UTC : « 28 Nov, 09:00 UTC ». Illisible, elle est dite telle quelle.
/** @param {string} iso */
const jourUtc = (iso) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : `${date.getUTCDate()} ${MOIS[date.getUTCMonth()]}, ${deux(date.getUTCHours())}:${deux(date.getUTCMinutes())} UTC`;
};

// La phrase d'une carte parked : qui elle attend, et jusqu'à quand.
/** @param {NonNullable<Carte["parque"]>} parque */
const ditParque = ({ qui, jusqua }) => `parked — waits for ${qui}, ${jusqua === null ? "no date set" : `until ${jourUtc(jusqua)}`}`;

// La ligne parked d'une carte, sous sa tête.
/** @param {Fabrique} doc @param {NonNullable<Carte["parque"]>} parque */
export function ligneParquee(doc, parque) {
  const ligne = doc.createElement("p");
  ligne.className = "parque";
  ligne.textContent = ditParque(parque);
  return ligne;
}

/**
 * Le TODO du chef : une entrée par ticket qui l'attend — son numéro et son titre ; un clic ouvre sa carte. `avis` : ce qui
 * attend le chef sans être un ticket (le dépôt pas préparé). Rien du tout quand rien ne l'attend.
 * @param {Fabrique} doc @param {{ cartes: readonly Carte[], avis: readonly any[], ouvrir: (carte: Carte) => void }} todo
 */
export function poserLeTodo(doc, { cartes, avis, ouvrir }) {
  if (cartes.length === 0 && avis.length === 0) return undefined;
  const cadre = doc.createElement("div");
  cadre.className = "todo-du-rail";
  cadre.ariaLabel = "What awaits you";
  const tete = doc.createElement("p");
  tete.className = "tete-du-todo";
  tete.textContent = `TODO (${cartes.length})`;
  cadre.append(tete);
  if (cartes.length > 0) {
    const liste = doc.createElement("ol");
    liste.className = "entrees-du-todo";
    liste.append(
      ...cartes.map((carte) => {
        const entree = doc.createElement("li");
        entree.className = "entree-du-todo";
        entree.dataset.ticket = String(carte.ticket);
        const ouvre = bouton(doc, `#${carte.ticket}${carte.titre === undefined ? "" : ` ${carte.titre}`}`, () => ouvrir(carte), { sorte: "discret" });
        ouvre.title = carte.parque === undefined ? `open #${carte.ticket}'s card` : `open #${carte.ticket}'s card — ${ditParque(carte.parque)}`;
        entree.append(ouvre);
        return entree;
      }),
    );
    cadre.append(liste);
  }
  cadre.append(...avis);
  return cadre;
}

// Ce que le supervisor surveille, faute que la cuisine le dise : la règle 14 de la spec.
const SURVEILLE = "each ticket's progress, loops, load, what is served, tickets parked too long";

/** @typedef {{ lastGesture: { line: string, at: string }, nextRun: { text: string }, counters: { handedToChef: number } }} AgentLu */

// La dernière action d'un rôle, ou celle de son fil quand la cuisine n'en donne pas : « parked #31 for the chef · 08:30 UTC ».
/** @param {RoleDeCuisine | undefined} role @param {AgentLu | undefined} agent @param {string} chose ce qu'il n'a pas encore fait */
const derniere = (role, agent, chose) => {
  const latest = role?.latest ?? (agent === undefined ? null : { what: agent.lastGesture.line, at: agent.lastGesture.at });
  if (latest === null) return PAS_ENCORE(chose);
  const date = new Date(latest.at);
  return Number.isNaN(date.getTime()) ? latest.what : `${latest.what} · ${deux(date.getUTCHours())}:${deux(date.getUTCMinutes())} UTC`;
};

/**
 * La bande du haut : la ligne du supervisor — ce qu'il surveille, sa dernière action, ce qu'il a parked pour le chef — et celle
 * du closer — son dernier rangement, le prochain. Chaque ligne ouvre le fil de son agent quand l'équipe est lue (`ouvrirLeFil`).
 * Le message du haut, s'il y en a un, se pose juste dessous (vue.js).
 * @param {Fabrique} doc
 * @param {{ roles: readonly RoleDeCuisine[] | undefined, agent: (nom: string) => AgentLu | undefined, ouvrirLeFil: ((nom: string) => void) | undefined }} bande
 */
export function poserLaBandeDuHaut(doc, { roles, agent, ouvrirLeFil }) {
  const cadre = doc.createElement("div");
  cadre.className = "bande-du-haut";
  /** @param {string} nom @param {string} qui @param {string[]} morceaux */
  const ligne = (nom, qui, morceaux) => {
    const posee = doc.createElement("p");
    posee.className = `ligne-du-${nom}`;
    const etiquette = doc.createElement("strong");
    etiquette.textContent = qui;
    posee.append(etiquette, ...morceaux.map((morceau) => Object.assign(doc.createElement("span"), { textContent: morceau })));
    if (ouvrirLeFil !== undefined && agent(nom) !== undefined) posee.append(bouton(doc, "its thread", () => ouvrirLeFil(nom), { sorte: "discret" }));
    return posee;
  };
  const role = (/** @type {string} */ nom) => roles?.find((un) => un.role === nom);
  const superviseur = agent("supervisor");
  const closer = agent("closer");
  cadre.append(
    ligne("supervisor", "Supervisor", [
      role("supervisor")?.does ?? `watching: ${SURVEILLE}`,
      `last: ${derniere(role("supervisor"), superviseur, "action")}`,
      `parked for you: ${superviseur === undefined ? "not known" : `${superviseur.counters.handedToChef} so far`}`,
    ]),
    ligne("closer", "Closer", [`last tidy: ${derniere(role("closer"), closer, "tidy")}`, `next tidy: ${closer === undefined ? "not known" : closer.nextRun.text.replace(/^closer: /, "")}`]),
  );
  return cadre;
}

// Un message porte un geste : un bouton, à lui ou à ce qui le suit.
/** @param {readonly any[]} message */
export const aUnGeste = (message) => message.some((element) => element.querySelectorAll("button").length > 0);

/**
 * La ligne d'une alerte du rail, avec un geste ou rien (critère « no banner without an action ») : une alerte que la cuisine
 * prend en charge seule (`geste` nul) ne demande rien au chef, elle n'est pas montrée. Une autre a son bouton, quand le
 * runtime en donne un que l'app sait jouer ; sinon ouvrir son ticket, ou la page des checks du dépôt pour une alerte qui
 * nomme un check. Une alerte sans aucun de ces gestes n'est pas montrée ; la suivante l'est.
 * @param {Fabrique} doc
 * @param {readonly import("../../attente-du-rail/alertes.ts").AlerteDuRail[]} alertes
 * @param {(alerte: import("../../attente-du-rail/alertes.ts").AlerteDuRail) => any[]} ligneDe la ligne que la vue en pose
 * @param {{ ouvrirTicket: (ticket: number) => void, ouvrirLesChecks: (() => void) | undefined }} ouvrir
 * @returns {any[]}
 */
export function messageDesAlertes(doc, alertes, ligneDe, { ouvrirTicket, ouvrirLesChecks }) {
  for (const alerte of alertes) {
    if (alerte.geste === null) continue;
    const lignes = ligneDe(alerte);
    const [posee] = lignes;
    if (posee === undefined) continue;
    if (aUnGeste(lignes)) return lignes;
    const { ticket, check } = alerte.fait;
    if (ticket !== undefined) posee.append(bouton(doc, `open #${ticket}`, () => ouvrirTicket(ticket), { sorte: "recommande" }));
    else if (check !== undefined && ouvrirLesChecks !== undefined) posee.append(bouton(doc, "open the checks", () => ouvrirLesChecks(), { sorte: "recommande" }));
    else continue;
    return lignes;
  }
  return [];
}
