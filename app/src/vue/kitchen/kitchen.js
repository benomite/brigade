// @ts-check
// La vue du projet dessine le plan de la cuisine (ticket 4238, docs/superpowers/specs/2026-11-24-simplified-process.md) :
// de gauche à droite, le backlog — le rail en tête, les tickets prêts à part —, le manager, les cooks, la pass, servi. Une
// carte est dans la colonne de son étape. Une carte parked reste dans la colonne où elle attend, dessinée parked : qui elle
// attend, jusqu'à quand. Il n'y a pas de colonne Waiting. Ce qui est parked pour le chef est aussi dans son TODO, à côté
// des colonnes, et rien d'autre (ticket 4261) : une ligne, « 2 wait for you », dont un clic montre chaque entrée, ce qui
// lui est demandé et ses boutons (ticket 4354). Au-dessus, la bande du haut : une carte du supervisor et une du closer sur
// une ligne, et au plus un message — jamais sans un geste que le chef peut faire.
// Le process principal range le rail en colonnes (facts.ts) : On the rail, Taken, Pass, Waiting, Served, et la liste de ce
// qui attend le chef, que todo.js pose déjà dans la colonne de son étape. Ce module en tire le plan, sans rien relire.
// Il ne touche pas `document` : il reçoit de quoi créer un élément, la vue lui donne le sien et les tests un faux.

import { recommandationDe } from "../briques.js";
import { vuDeLaCard } from "../card-todo.js";
import { estUneRevue, MERGER } from "../card-sensitive/card-sensitive.js";
import { button } from "../composants/button/button.js";
import { heureUtc } from "../activity-du-cook.js";
import { marque } from "../composants/pill/pill.js";
import { PAS_ENCORE } from "../lexique.js";
import { parkedTodo } from "../parked/parked-todo.js";
import { CHEF, chefRecords } from "../parked/records.js";
import { estRed } from "../todo/todo.js";
import { estUneValidation, VALIDER } from "../validation-design/validation-design.js";

/** @typedef {import("../../facts.ts").Card} Card */
/** @typedef {import("../../facts.ts").Colonne} Colonne */
/** @typedef {import("../../facts.ts").RoleDeKitchen} RoleDeKitchen */
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

// La colonne de facts.ts d'où vient chaque colonne du plan. Waiting n'en a pas : ses cartes vont dans la colonne de leur étape.
/** @type {Record<string, string>} */
const DE_FACTS = { "On the rail": BACKLOG, Taken: COOKS, Pass: PASS, Served: SERVED };
const WAITING = "Waiting";
// L'étape d'une carte d'après son mot d'état : un mot qui n'en dit aucune laisse la carte dans le backlog.
/** @type {Record<string, string>} */
const STEP_DU_WORD = { pris: COOKS, "en pass": PASS, "base rouge": PASS, servi: SERVED };
// Les mots d'un ticket prêt à cuire, sur le rail.
const PRETS = ["en attente", "tests écrits"];
/** @type {Record<string, string>} */
const TONS = { [BACKLOG]: "gris", [MANAGER]: "gris", [COOKS]: "bleu", [PASS]: "jaune", [SERVED]: "vert" };

// Une carte du manager : sa question avant de découper une épique, posée au chef ou répondue et qu'il doit lire.
/** @param {Card} card */
const auManager = (card) => card.question === true || card.repondue !== undefined;

// La colonne du plan d'une carte, d'après la colonne de facts.ts où elle est : celle de son étape.
/** @param {string} nameDeFacts @param {Card} card */
export const colonneDuPlan = (nameDeFacts, card) => (auManager(card) ? MANAGER : nameDeFacts === WAITING ? (STEP_DU_WORD[card.etat ?? ""] ?? BACKLOG) : (DE_FACTS[nameDeFacts] ?? BACKLOG));

/**
 * @typedef {{ nom: string, ton: string, compte: string, cartes: Card[], vide: string, defile?: boolean, pretes?: Card[], pasPretes?: Card[] }} ColonneDuPlan
 */

/**
 * Le plan, des colonnes que todo.js a rangées : chaque carte dans la colonne de son étape, les rouges en tête. Le backlog
 * sépare le rail — ce qui est prêt à cuire — du reste. `rail` : les numéros du haut du backlog que la lecture porte
 * (vue/rail/, ticket 4223), dans leur ordre ; donné, le rail du backlog est celui-là — les mêmes tickets, dans le même
 * ordre —, et un ticket prêt qui n'y est pas passe dessous.
 * @param {readonly Colonne[]} colonnes @param {readonly number[]} [rail]
 * @returns {ColonneDuPlan[]}
 */
export function planDeLaKitchen(colonnes, rail) {
  /** @type {Map<string, { cartes: Card[], vide?: string, defile?: boolean }>} */
  const plan = new Map([BACKLOG, MANAGER, COOKS, PASS, SERVED].map((name) => [name, { cartes: [] }]));
  // Une colonne de facts.ts pas connue — la box ne répond pas — laisse tout le plan inconnu : ses cartes iraient n'importe où.
  const inconnue = colonnes.find(({ compte: account }) => account === "?");
  for (const colonne of colonnes) {
    const name = DE_FACTS[colonne.nom];
    const place = plan.get(name ?? "");
    if (place !== undefined) {
      place.vide = colonne.vide;
      if (colonne.defile === true) place.defile = true;
    }
    for (const card of colonne.cartes) plan.get(colonneDuPlan(colonne.nom, card))?.cartes.push(card);
  }
  return [...plan].map(([name, { cartes: cards, vide: empty, defile }]) => {
    const rangees = [...cards.filter(estRed), ...cards.filter((card) => !estRed(card))];
    const colonne = {
      nom: name,
      ton: TONS[name] ?? "gris",
      compte: inconnue === undefined ? String(rangees.length) : "?",
      cartes: rangees,
      vide: inconnue !== undefined && name === MANAGER ? inconnue.vide : name === MANAGER ? RIEN_AU_MANAGER : (empty ?? "no ticket"),
      ...(defile === true ? { defile } : {}),
    };
    if (name !== BACKLOG) return colonne;
    const pret = (/** @type {Card} */ card) => !estRed(card) && card.parque === undefined && PRETS.includes(card.etat ?? "");
    const pretes = rail === undefined ? rangees.filter(pret) : rail.flatMap((ticket) => rangees.filter((card) => card.ticket === ticket && pret(card)));
    return { ...colonne, pretes, pasPretes: rangees.filter((card) => !pretes.includes(card)) };
  });
}

// Ce qui attend le chef, dans l'ordre du plan, une fois chacun : le TODO.
/** @param {readonly ColonneDuPlan[]} plan */
export const ceQuiAwaitingYou = (plan) => {
  const vus = new Set();
  return plan.flatMap(({ cartes: cards }) => cards.filter(estRed)).filter(({ ticket }) => (vus.has(ticket) ? false : (vus.add(ticket), true)));
};

const MOIS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const deux = (/** @type {number} */ n) => String(n).padStart(2, "0");
// Une date de la box, en UTC : « 28 Nov, 09:00 UTC ». Illisible, elle est dite telle quelle.
/** @param {string} iso */
const dayUtc = (iso) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : `${date.getUTCDate()} ${MOIS[date.getUTCMonth()]}, ${deux(date.getUTCHours())}:${deux(date.getUTCMinutes())} UTC`;
};

// La phrase d'une carte parked : qui elle attend, et jusqu'à quand.
/** @param {NonNullable<Card["parque"]>} parque */
const ditParque = ({ qui, jusqua }) => `parked — waits for ${qui}, ${jusqua === null ? "no date set" : `until ${dayUtc(jusqua)}`}`;

// La ligne parked d'une carte, sous sa tête.
/** @param {Fabrique} doc @param {NonNullable<Card["parque"]>} parque */
export function lineParquee(doc, parque) {
  const line = doc.createElement("p");
  line.className = "parque";
  line.textContent = ditParque(parque);
  return line;
}

// Les gestes qui tranchent une carte du TODO d'un clic, chacun par son nom (vue.js les joue) : répondre d'un choix, valider
// un écran, merger une revue, reprendre une carte de WAITING ou dire arrivé ce qu'elle attendait.
/** @typedef {"repondre" | "valider" | "merger" | "attente-reprendre" | "attente-arrivee"} SorteDeAction */
/** @typedef {{ texte: string, recommande: boolean, sorte: SorteDeAction, reponse?: import("../../card-todo.ts").Answer }} ActionDuTodo */
/**
 * Ce que le TODO sait de la vue pour trancher ses cartes : où en est la réponse d'une carte (`etat`), les gestes de WAITING
 * et leurs libellés (`attente`), et de quoi jouer un geste (`jouer`).
 * @typedef {{ etat: (ticket: number, todo: import("../../card-todo.ts").CardDeTodo) => import("../card-todo.js").State, attente: readonly { id: string, libelle: string }[], jouer: (ticket: number, sorte: SorteDeAction, answer?: import("../../card-todo.ts").Answer) => void }} ActionsDuTodo
 */

// Les gestes de WAITING qui la tranchent : la reprendre, ou dire arrivé ce qu'elle attendait — « waiting for… » remet la
// question à plus tard, il n'y répond pas (docs/todo-cards.md).
const TRANCHENT = ["attente-reprendre", "attente-arrivee"];
// Pourquoi une entrée du TODO se lit sans bouton.
const READ_ONLY = "read-only: nothing is decided from here";

/**
 * Les boutons d'une carte du TODO, ceux de sa carte (ticket 4261) : « Validate » d'un écran à valider, « Merge » d'une revue,
 * un par choix d'une question — le recommandé plein d'accent —, tant que sa réponse n'est pas partie d'ici ; ou les gestes de
 * WAITING qu'elle a. Aucun sur une carte qui ne se tranche qu'en mots : un clic sur son entrée ouvre sa carte et son champ.
 * @param {Card} card @param {ActionsDuTodo} actions @returns {ActionDuTodo[]}
 */
export function actionsDuTodo(card, actions) {
  const { todo } = card;
  if (todo === undefined) return actions.attente.filter(({ id }) => TRANCHENT.includes(id) && card.gestes?.includes(/** @type {never} */ (id))).map(({ id, libelle }) => ({ texte: libelle, recommande: false, sorte: /** @type {SorteDeAction} */ (id) }));
  // Un écran à valider, une revue : leur bouton, quand leur carte dit la PR qu'ils tranchent — sinon aucun, comme sur leur carte.
  if (estUneValidation(todo)) return "pr" in (todo.validation ?? {}) ? [{ texte: VALIDER, recommande: true, sorte: "valider" }] : [];
  if (estUneRevue(todo)) return "pr" in (todo.revue ?? {}) ? [{ texte: MERGER, recommande: true, sorte: "merger" }] : [];
  if (!["repos", "refus"].includes(vuDeLaCard(todo, actions.etat(card.ticket, todo)).vu)) return [];
  const recommandee = recommandationDe(todo)?.rang;
  return todo.choix.map(({ texte }, rang) => ({ texte, recommande: rang + 1 === recommandee, sorte: "repondre", reponse: { question: todo.question, choix: rang + 1 } }));
}

/**
 * Le TODO du chef, en une ligne au-dessus des colonnes (ticket 4354) : « 2 wait for you ». Un clic montre, sous elle, une
 * entrée par ticket parked pour lui (ticket 4261) — son numéro et son titre, dont un clic ouvre sa carte ; ce qui lui est
 * demandé ; qui, jusqu'à quand ; ses boutons, qui y répondent. Les entrées sont celles du TODO parked (parked/, ticket
 * 4281), qui ajoute à chacune son contrôle de park (`control`, `opened`). `deplie` garde, d'un rendu à l'autre, que le chef
 * l'a ouvert. Sans `gestes` — un projet en lecture seule —, ses cartes se lisent sans bouton. Rien du tout quand rien ne
 * l'attend.
 * @param {Fabrique} doc @param {{ cartes: readonly Card[], ouvrir: (card: Card) => void, gestes?: ActionsDuTodo, control?: (record: import("../parked/records.js").ParkedRecord) => any, opened?: Set<number>, deplie: { ouvert: boolean } }} todo
 */
export function poserLeTodo(doc, { cartes: cards, ouvrir, gestes: actions, control, opened, deplie }) {
  if (cards.length === 0) return undefined;
  const parTicket = new Map(cards.map((card) => [card.ticket, { carte: card, siens: actions === undefined ? [] : actionsDuTodo(card, actions) }]));
  /** @param {number} ticket */
  const de = (ticket) => /** @type {{ carte: Card, siens: ActionDuTodo[] }} */ (parTicket.get(ticket));
  const entrees = () =>
    parkedTodo(doc, {
      records: chefRecords(cards),
      chef: CHEF,
      choices: ({ ticket }) => de(ticket).siens,
      answer: (ticket, texte) => {
        const action = de(ticket).siens.find((siens) => siens.texte === texte);
        if (action !== undefined) actions?.jouer(ticket, action.sorte, action.reponse);
      },
      ...(actions === undefined ? { readOnly: READ_ONLY } : { control, opened }),
      open: (ticket) => ouvrir(de(ticket).carte),
      openTitle: (ticket) => {
        const { parque } = de(ticket).carte;
        return parque === undefined ? `open #${ticket}'s card` : `open #${ticket}'s card — ${ditParque(parque)}`;
      },
    });
  const opinion = doc.createElement("div");
  opinion.className = "avis-du-todo";
  /** @type {any} */
  let liste = deplie.ouvert ? entrees() : undefined;
  const line = button(
    doc,
    `${cards.length} ${cards.length === 1 ? "waits" : "wait"} for you`,
    () => {
      deplie.ouvert = liste === undefined;
      liste?.remove();
      liste = deplie.ouvert ? entrees() : undefined;
      if (liste !== undefined) opinion.append(liste);
      line.ariaExpanded = String(deplie.ouvert);
    },
    { sorte: "discret" },
  );
  line.className += " ligne-du-todo";
  line.ariaExpanded = String(deplie.ouvert);
  line.title = "open your TODO: each ticket, its question and its buttons";
  opinion.append(line, ...(liste === undefined ? [] : [liste]));
  return opinion;
}

// Il y a combien de temps, en un seul ordre de grandeur : « 2 h ago ».
/** @param {number} ms */
const ilYA = (ms) => {
  const minutes = Math.floor(Math.max(0, ms) / 60_000);
  return minutes < 1 ? "just now" : minutes < 60 ? `${minutes} min ago` : minutes < 1440 ? `${Math.floor(minutes / 60)} h ago` : `${Math.floor(minutes / 1440)} d ago`;
};

/**
 * La bande du haut (ticket 4354) : une carte pour le supervisor, une pour le closer, sur une ligne — son nom, un point d'état
 * (au travail, au repos, en alerte) et deux ou trois mots. Un clic sur une carte déplie son détail dessous : ce qu'il fait,
 * sa dernière action et son heure ; `deplies` garde ce qui est déplié d'un rendu à l'autre. Un agent que l'équipe lue montre
 * déjà (autonomy/team.js, `montre`) n'a pas de carte ici : son badge est la sienne. `alerte` : l'issue que la cuisine a
 * ouverte sur elle-même, que le supervisor dit. `delai` : la ligne du délai de prise de `status` (ticket 4299), au bout de la
 * ligne, coupée à sa largeur et entière au survol. Le message du haut, s'il y en a un, se pose juste dessous (vue.js).
 * @param {Fabrique} doc
 * @param {{ roles: readonly RoleDeKitchen[] | undefined, montre: (name: string) => boolean, alerte: number | undefined, maintenant: number, deplies: Set<string>, delai?: string }} bande
 */
export function poserLaBandeDuHaut(doc, { roles, montre, alerte: alert, maintenant, deplies, delai: delay }) {
  const cadre = doc.createElement("div");
  cadre.className = "bande-du-haut";
  const line = doc.createElement("div");
  line.className = "cartes-des-agents";
  cadre.append(line);
  const role = (/** @type {string} */ name) => roles?.find((un) => un.role === name);
  /** @param {string} name @param {string} ton @param {string} mots */
  const card = (name, ton, mots) => {
    const lui = role(name);
    const latest = lui?.latest ?? null;
    const detail = doc.createElement("p");
    detail.className = "detail-de-l-agent";
    detail.dataset.agent = name;
    detail.textContent = [lui?.does, latest === null ? PAS_ENCORE("action") : `last: ${latest.what} · ${heureUtc(latest.at)}`].filter(Boolean).join(" · ");
    const posee = button(
      doc,
      "",
      () => {
        if (deplies.delete(name)) detail.remove();
        else {
          deplies.add(name);
          cadre.append(detail);
        }
        posee.ariaExpanded = String(deplies.has(name));
      },
      { sorte: "discret" },
    );
    posee.className += " carte-d-agent";
    posee.dataset.agent = name;
    posee.ariaExpanded = String(deplies.has(name));
    posee.replaceChildren(marque(doc, ton), Object.assign(doc.createElement("strong"), { textContent: name }), Object.assign(doc.createElement("span"), { textContent: mots }));
    line.append(posee);
    if (deplies.has(name)) cadre.append(detail);
  };
  if (!montre("supervisor")) card("supervisor", alert === undefined ? "gris" : "rouge", alert === undefined ? "ok" : `alert: #${alert}`);
  const cleanup = role("closer")?.latest ?? null;
  if (!montre("closer")) card("closer", "gris", cleanup === null ? PAS_ENCORE("tidy") : `tidied ${ilYA(maintenant - Date.parse(cleanup.at))}`);
  if (delay !== undefined) line.append(Object.assign(doc.createElement("span"), { className: "ligne-du-delai", textContent: delay, title: delay }));
  return cadre;
}

// Un message porte un geste : un bouton, à lui ou à ce qui le suit.
/** @param {readonly any[]} message */
export const aUnAction = (message) => message.some((element) => element.querySelectorAll("button").length > 0);

/**
 * La ligne d'une alerte du rail, avec un geste ou rien (critère « no banner without an action ») : une alerte que la cuisine
 * prend en charge seule (`geste` nul) ne demande rien au chef, elle n'est pas montrée. Une autre a son bouton, quand le
 * runtime en donne un que l'app sait jouer ; sinon ouvrir son ticket, ou la page des checks du dépôt pour une alerte qui
 * nomme un check. Une alerte sans aucun de ces gestes n'est pas montrée ; la suivante l'est.
 * @param {Fabrique} doc
 * @param {readonly import("../../wait-du-rail/alerts.ts").AlertDuRail[]} alerts
 * @param {(alert: import("../../wait-du-rail/alerts.ts").AlertDuRail) => any[]} lineDe la ligne que la vue en pose
 * @param {{ ouvrirTicket: (ticket: number) => void, ouvrirLesChecks: (() => void) | undefined }} ouvrir
 * @returns {any[]}
 */
export function messageDesAlerts(doc, alerts, lineDe, { ouvrirTicket, ouvrirLesChecks }) {
  for (const alert of alerts) {
    if (alert.geste === null) continue;
    const lines = lineDe(alert);
    const [posee] = lines;
    if (posee === undefined) continue;
    if (aUnAction(lines)) return lines;
    const { ticket, check } = alert.fait;
    if (ticket !== undefined) posee.append(button(doc, `open #${ticket}`, () => ouvrirTicket(ticket), { sorte: "recommande" }));
    else if (check !== undefined && ouvrirLesChecks !== undefined) posee.append(button(doc, "open the checks", () => ouvrirLesChecks(), { sorte: "recommande" }));
    else continue;
    return lines;
  }
  return [];
}
