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

import { bouton } from "../composants/bouton/bouton.js";
import { ligneErreur } from "../composants/ligne-erreur/ligne-erreur.js";
import { ligneVide } from "../composants/ligne-vide/ligne-vide.js";
import { LECTURE_DE, NON_ATTEINT } from "../lexique.js";
import { estRouge, rangerLeRail } from "../todo/todo.js";

/** @typedef {import("../briques.js").Fabrique} Fabrique */
/** @typedef {import("./recap-box.ts").LectureDuRecap} Lecture */
/** @typedef {import("./recap-box.ts").Recap} Recap */
/** @typedef {{ ticket: number, texte: string }} DansTodo */
/** @typedef {{ projet: string, lecture: Lecture | undefined, todo: DansTodo[] | undefined }} DuProjet */

const TITRE = "Since you last looked";
const SERVIS = "Served";
const RENVOYES = "Sent back or refused by the pass";
const ARRETS = "Stopped by a guardrail";
const RIEN = "Nothing happened since you last looked.";
const RIEN_DANS_TODO = "Nothing is waiting for you in TODO.";
const INDISPONIBLE = NON_ATTEINT("recap");
const ATTEND_DANS_TODO = "Waiting for you in TODO";
/** @param {number} nombre */
const DANS_TODO = (nombre) => `${ATTEND_DANS_TODO} (${nombre})`;
/** @param {number} pr */
const LA_PR = (pr) => `PR #${pr}`;
const SURVOL_DE_LA_PR = "its gates, CI and review, on GitHub";
/** @param {string} instant */
const DEPUIS = (instant) => `Since ${new Date(instant).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })}.`;
/** @param {Recap["sentBack"][number]} renvoi */
const LIGNE_DU_RENVOI = ({ ticket, kind, reason }) => `#${ticket} ${kind === "refused" ? "refused" : "sent back to a cook"}: ${reason.replace(/`([^`]*)`/g, "$1")}`;

/**
 * Ce qui attend le chef dans TODO, tel que TODO le montre : les cartes rouges du rail rangé, dans l'ordre de leurs
 * colonnes — celles que compte « TODO (N) ». `undefined` tant que le rail n'est pas lu.
 * @param {readonly import("../../faits.ts").Colonne[] | undefined} colonnes
 * @returns {DansTodo[] | undefined}
 */
export function ceQuiAttendDansTodo(colonnes) {
  if (colonnes === undefined) return undefined;
  const { colonnes: rangees, compte } = rangerLeRail(colonnes);
  if (compte === "?") return undefined;
  return rangees.flatMap(({ cartes }) => cartes.filter(estRouge).map((carte) => ({ ticket: carte.ticket, texte: carte.todo?.question ?? carte.titre ?? carte.ligne ?? "" })));
}

/**
 * Le bloc de l'accueil : un récapitulatif par projet. `gestes.ouvrir(url)` ouvre la PR d'un ticket servi.
 * @param {Fabrique} doc
 * @param {DuProjet[]} projets
 * @param {{ ouvrir: (url: string) => void }} gestes
 */
export function poserLeRecap(doc, projets, gestes) {
  const racine = doc.createElement("section");
  racine.id = "accueil-recap";
  racine.className = "bloc-de-l-accueil recap";
  racine.ariaLabel = TITRE;
  const titre = doc.createElement("h2");
  titre.textContent = TITRE;
  racine.append(titre, ...projets.map((projet) => duProjet(doc, projet, gestes)));
  return racine;
}

/** @param {Fabrique} doc @param {string} texte */
const intertitre = (doc, texte) => {
  const h4 = doc.createElement("h4");
  h4.textContent = texte;
  return h4;
};

/** @param {Fabrique} doc @param {string} classe @param {any[]} lignes */
const liste = (doc, classe, lignes) => {
  const ul = doc.createElement("ul");
  ul.className = classe;
  ul.append(...lignes);
  return ul;
};

/** @param {Fabrique} doc @param {string} texte */
const ligne = (doc, texte) => {
  const li = doc.createElement("li");
  const dit = doc.createElement("span");
  dit.textContent = texte;
  li.append(dit);
  return li;
};

/** @param {Fabrique} doc @param {DuProjet} projet @param {{ ouvrir: (url: string) => void }} gestes */
function duProjet(doc, { projet, lecture, todo }, { ouvrir }) {
  const section = doc.createElement("section");
  section.className = "recap-du-projet";
  section.ariaLabel = projet;
  section.dataset.projet = projet;
  const nom = doc.createElement("h3");
  nom.textContent = projet;
  section.append(nom);
  if (lecture === undefined) section.append(ligneVide(doc, LECTURE_DE("the recap")));
  else if ("sans" in lecture) section.append(ligneErreur(doc, INDISPONIBLE, [lecture.sans, lecture.detail ?? ""].filter(Boolean).join("\n")));
  else {
    const { since, served, sentBack, stops } = lecture.recap;
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
        intertitre(doc, SERVIS),
        liste(
          doc,
          "servis",
          served.map(({ ticket, title, pr, prUrl }) => {
            const li = ligne(doc, `#${ticket} ${title}`);
            const lien = bouton(doc, LA_PR(pr), () => ouvrir(prUrl), { sorte: "discret" });
            lien.className += " pr";
            lien.title = `${SURVOL_DE_LA_PR} — ${prUrl}`;
            li.dataset.ticket = String(ticket);
            li.append(lien);
            return li;
          }),
        ),
      );
    }
    if (sentBack.length > 0) section.append(intertitre(doc, RENVOYES), liste(doc, "renvoyes", sentBack.map((renvoi) => ligne(doc, LIGNE_DU_RENVOI(renvoi)))));
    if (stops.length > 0) section.append(intertitre(doc, ARRETS), liste(doc, "arrets", stops.map(({ line }) => ligne(doc, line))));
  }
  if (todo === undefined) section.append(intertitre(doc, ATTEND_DANS_TODO), ligneVide(doc, LECTURE_DE("TODO")));
  else section.append(intertitre(doc, DANS_TODO(todo.length)), todo.length === 0 ? ligneVide(doc, RIEN_DANS_TODO) : liste(doc, "dans-todo", todo.map(({ ticket, texte }) => ligne(doc, `#${ticket} ${texte}`.trim()))));
  return section;
}
