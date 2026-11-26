// @ts-check
// Le récapitulatif de l'accueil (ticket 3581, épique 3579) : à l'ouverture de l'app, pour chaque projet, ce que la cuisine a
// fait depuis que le chef a regardé — les tickets servis, chacun avec le lien de sa PR, où se voient ses gates, sa CI et sa
// relecture ; ceux que la pass a renvoyés ou refusés, avec leur raison en une ligne ; une ligne par arrêt d'un garde-fou ;
// puis ce qui attend le chef dans TODO, la liste même que TODO montre à cet instant. Rien depuis : une phrase le dit, le
// récapitulatif n'est ni caché ni vide.
//
// Le récapitulatif vient du runtime du projet (`recap`, runtime/src/recap/), par le process principal (recap-box.ts) ; ce
// qui attend dans TODO, de la vue — les cartes rouges du rail rangé (todo/todo.js), que l'entrée « TODO (N) » compte.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (briques.js).

import { button } from "../composants/button/button.js";
import { lineError } from "../composants/line-error/line-error.js";
import { lineEmpty } from "../composants/line-empty/line-empty.js";
import { READ_DE, NON_ATTEINT } from "../lexique.js";
import { estRed, rangerLeRail } from "../todo/todo.js";
import { tellLaPrParSonTicket, PR_DU_TICKET } from "../pr-du-ticket.js";

/** @typedef {import("../briques.js").Fabrique} Fabrique */
/** @typedef {import("./recap-box.ts").ReadDuRecap} Read */
/** @typedef {import("./recap-box.ts").Recap} Recap */
/** @typedef {{ ticket: number, texte: string }} DansTodo */
/** @typedef {{ projet: string, lecture: Read | undefined, todo: DansTodo[] | undefined }} DuProject */

const TITRE = "Since you last looked";
const SERVED = "Served";
const RENVOYES = "Sent back or refused by the pass";
const ARRETS = "Stopped by a guardrail";
const RIEN = "Nothing happened since you last looked.";
const RIEN_DANS_TODO = "Nothing is waiting for you in TODO.";
const INDISPONIBLE = NON_ATTEINT("recap");
const AWAITING_DANS_TODO = "Waiting for you in TODO";
/** @param {number} nombre */
const DANS_TODO = (nombre) => `${AWAITING_DANS_TODO} (${nombre})`;
const SURVOL_DE_LA_PR = "its gates, CI and review, on GitHub";
/** @param {string} instant */
const DEPUIS = (instant) => `Since ${new Date(instant).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })}.`;
/** @param {Recap["sentBack"][number]} renvoi */
// La PR que la raison nomme est la livraison du ticket : elle se dit par lui (pr-du-ticket.js, ticket 3716).
const LINE_DU_SEND_BACK = ({ ticket, kind, reason }) => `#${ticket} ${kind === "refused" ? "refused" : "sent back to a cook"}: ${tellLaPrParSonTicket(reason.replace(/`([^`]*)`/g, "$1"), ticket)}`;

/**
 * Ce qui attend le chef dans TODO, tel que TODO le montre : les cartes rouges du rail rangé, dans l'ordre de leurs
 * colonnes — celles que compte « TODO (N) ». `undefined` tant que le rail n'est pas lu.
 * @param {readonly import("../../facts.ts").Colonne[] | undefined} colonnes
 * @returns {DansTodo[] | undefined}
 */
export function ceQuiAwaitingDansTodo(colonnes) {
  if (colonnes === undefined) return undefined;
  const { colonnes: rangees, compte: account } = rangerLeRail(colonnes);
  if (account === "?") return undefined;
  return rangees.flatMap(({ cartes: cards }) => cards.filter(estRed).map((card) => ({ ticket: card.ticket, texte: card.todo?.question ?? card.titre ?? card.ligne ?? "" })));
}

/**
 * Le bloc de l'accueil : un récapitulatif par projet. `gestes.ouvrir(url)` ouvre la PR d'un ticket servi.
 * @param {Fabrique} doc
 * @param {DuProject[]} projects
 * @param {{ ouvrir: (url: string) => void }} actions
 */
export function poserLeRecap(doc, projects, actions) {
  const racine = doc.createElement("section");
  racine.id = "accueil-recap";
  racine.className = "bloc-de-l-accueil recap";
  racine.ariaLabel = TITRE;
  const titre = doc.createElement("h2");
  titre.textContent = TITRE;
  racine.append(titre, ...projects.map((project) => duProject(doc, project, actions)));
  return racine;
}

/** @param {Fabrique} doc @param {string} texte */
const intertitre = (doc, texte) => {
  const h4 = doc.createElement("h4");
  h4.textContent = texte;
  return h4;
};

/** @param {Fabrique} doc @param {string} classe @param {any[]} lines */
const liste = (doc, classe, lines) => {
  const ul = doc.createElement("ul");
  ul.className = classe;
  ul.append(...lines);
  return ul;
};

/** @param {Fabrique} doc @param {string} texte */
const lineOf = (doc, texte) => {
  const li = doc.createElement("li");
  const dit = doc.createElement("span");
  dit.textContent = texte;
  li.append(dit);
  return li;
};

/** @param {Fabrique} doc @param {DuProject} projet @param {{ ouvrir: (url: string) => void }} gestes */
function duProject(doc, { projet: project, lecture: read, todo }, { ouvrir }) {
  const section = doc.createElement("section");
  section.className = "recap-du-projet";
  section.ariaLabel = project;
  section.dataset.projet = project;
  const name = doc.createElement("h3");
  name.textContent = project;
  section.append(name);
  if (read === undefined) section.append(lineEmpty(doc, READ_DE("the recap")));
  else if ("sans" in read) section.append(lineError(doc, INDISPONIBLE, [read.sans, read.detail ?? ""].filter(Boolean).join("\n")));
  else {
    const { since, served, sentBack, stops } = read.recap;
    const depuis = doc.createElement("p");
    depuis.className = "depuis";
    depuis.textContent = DEPUIS(since);
    section.append(depuis);
    if (served.length + sentBack.length + stops.length === 0) {
      const rien = doc.createElement("p");
      rien.className = "rien";
      rien.textContent = RIEN;
      section.append(rien);
    }
    if (served.length > 0) {
      section.append(
        intertitre(doc, SERVED),
        liste(
          doc,
          "servis",
          served.map(({ ticket, title, prUrl }) => {
            const li = lineOf(doc, `#${ticket} ${title}`);
            const lien = button(doc, PR_DU_TICKET(ticket), () => ouvrir(prUrl), { sorte: "discret" });
            lien.className += " pr";
            lien.title = `${SURVOL_DE_LA_PR} — ${prUrl}`;
            li.dataset.ticket = String(ticket);
            li.append(lien);
            return li;
          }),
        ),
      );
    }
    if (sentBack.length > 0) section.append(intertitre(doc, RENVOYES), liste(doc, "renvoyes", sentBack.map((sendBack) => lineOf(doc, LINE_DU_SEND_BACK(sendBack)))));
    if (stops.length > 0) section.append(intertitre(doc, ARRETS), liste(doc, "arrets", stops.map(({ line }) => lineOf(doc, line))));
  }
  if (todo === undefined) section.append(intertitre(doc, AWAITING_DANS_TODO), lineEmpty(doc, READ_DE("TODO")));
  else section.append(intertitre(doc, DANS_TODO(todo.length)), todo.length === 0 ? lineEmpty(doc, RIEN_DANS_TODO) : liste(doc, "dans-todo", todo.map(({ ticket, texte }) => lineOf(doc, `#${ticket} ${texte}`.trim()))));
  return section;
}
