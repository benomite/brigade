// @ts-check
// Les chiffres d'autonomie (ticket 3222, épique 3213) : le but de brigade est l'autonomie, et trois chiffres disent si
// elle tient — servi sans humain, délai, taux de renvoi —, sur les 7 ou les 30 derniers jours, au choix. D'un projet, dans
// sa section de Settings ; de tous les projets ensemble, sur la page de leur coût. Un clic sur « served with a human »
// déplie les tickets qui ont demandé quelque chose au chef, chacun avec sa question et son lien : chacun est un échec à
// corriger (CLAUDE.md, « Brigade's goal: autonomy »). À côté, ce que la pass a laissé passer sur ces mêmes tickets (ticket 3515) :
// les bugs échappés et les reverts, chacun avec ce qui fait son nombre — les tickets, les commits.
//
// La vue n'y calcule rien : la lecture vient de GitHub, par le process principal (autonomy-github.ts), et le calcul est
// celui du runtime. Le bloc garde ce qu'il a lu de chaque période dix minutes ; une période changée se lit si elle ne
// l'a pas été. Ce module ne touche pas `document` : il reçoit de quoi créer un élément (briques.js).

import { survol } from "../briques.js";
import { button } from "../composants/button/button.js";
import { lineError } from "../composants/line-error/line-error.js";
import { lineEmpty } from "../composants/line-empty/line-empty.js";
import { READ_DE, NON_ATTEINT } from "../lexique.js";
import { dureeEnClair } from "../project/delay.js";

/** @typedef {import("../briques.js").Fabrique} Fabrique */
/** @typedef {import("./autonomy-github.ts").ReadDAutonomy} Read */
/** @typedef {Extract<Read, { chiffres: unknown }>["chiffres"]} Figures */

export const TITRE = "Autonomy";
// Les périodes offertes, en jours (runtime/src/autonomie/chiffres/chiffres.ts, `PERIODES`) — le test les compare.
export const PERIODES = /** @type {const} */ ([7, 30]);
/** @param {number} jours */
export const periodeDite = (jours) => `last ${jours} days`;
export const SANS_HUMAN = "served without a human";
export const AVEC_HUMAN = "served with a human";
export const DELAY = "lead time";
export const SENDBack = "send-back rate";
const BUGS_ECHAPPES = "escaped bugs";
const REVERTS = "reverts";
export const DEFINITIONS = {
  sansHumain: "The share of the tickets merged in the period whose path from fire to merge never asked the chef anything: no TODO card, never parked for the chef.",
  delai: "The median time from fire to merge of the tickets merged in the period.",
  renvoi: "The share of the deliveries merged in the period that the pass sent back at least once.",
  bugs: "The bug-labelled issues created after a ticket merged in the period was served, and citing its number in their title or body.",
  reverts: "The commits of the default branch carrying git's 'This reverts commit <sha>' trailer whose reverted commit belongs to a ticket merged in the period.",
};
export const SOURCE = "Read from GitHub only: the merged pull requests, the labels and comments of each ticket, the bug-labelled issues and the reverting commits of the default branch.";
const DEFAUTS_NON_LUS = "not read";
/** @param {string} sha */
const SHA_COURT = (sha) => sha.slice(0, 7);
/** @param {number} jours */
export const AUCUN = (jours) => `no ticket merged in the ${periodeDite(jours)}`;
export const SANS_QUESTION = "question not written on the ticket";
/** @param {number} jours @param {{ projet: string, depuis: string }[]} partiels */
export const PARTIEL = (jours, partiels) =>
  `not read over the whole ${periodeDite(jours)}: ${partiels.map(({ projet: project, depuis }) => `${project} counted only from ${depuis.slice(0, 16).replace("T", " ")} UTC`).join(", ")}`;
export const FRAICHEUR_MS = 10 * 60_000;

export const SANS_READ = NON_ATTEINT("autonomy figures");
/** @param {number} jours @param {string} detail @returns {Read} */
const sans = (jours, detail) => ({ jours, sans: SANS_READ, detail });

/** @param {number} part */
const pourcent = (part) => `${Math.round(part * 100)} %`;

// Le bloc, son état, et `poser()` qui le rend à jour — et lit la période choisie si elle ne l'a pas été depuis dix minutes.
// `lire` : la lecture des chiffres de la période ; `ouvrir` : l'issue d'un ticket, dans le navigateur ; `tous` : le bloc de
// tous les projets nomme le projet de chaque ticket.
/**
 * @param {Fabrique} doc
 * @param {{ lire: (jours: number) => Promise<Read>, ouvrir: (url: string) => void, tous?: boolean, maintenant?: () => number }} options
 */
export function holdLesFiguresDAutonomy(doc, { lire, ouvrir, tous = false, maintenant = Date.now }) {
  const element = doc.createElement("section");
  element.className = "chiffres-autonomie";
  element.ariaLabel = tous ? `${TITRE} of all projects` : TITRE;
  element.dataset.bloc = "chiffres-autonomie";
  /** @type {number} */
  let jours = PERIODES[0];
  let ouvert = false;
  /** @type {Map<number, { le: number, lecture: Read | null }>} */
  const lues = new Map();

  /** @param {number} periode */
  const lirePeriode = (periode) => {
    lues.set(periode, { le: maintenant(), lecture: lues.get(periode)?.lecture ?? null });
    void Promise.resolve()
      .then(() => lire(periode))
      .then(
        (lue) => (typeof lue === "object" && lue !== null && ("sans" in lue || "chiffres" in lue) ? lue : sans(periode, "the app gave no figures")),
        (/** @type {unknown} */ error) => sans(periode, error instanceof Error ? error.message : String(error)),
      )
      .then((read) => {
        lues.set(periode, { le: lues.get(periode)?.le ?? maintenant(), lecture: read });
        rendre();
      });
  };

  const rendre = () => {
    const tete = doc.createElement("div");
    tete.className = "tete";
    const titre = doc.createElement("h3");
    titre.textContent = TITRE;
    titre.append(survol(doc, SOURCE));
    const periodes = doc.createElement("div");
    periodes.className = "periodes";
    periodes.role = "group";
    periodes.ariaLabel = "period";
    for (const periode of PERIODES) {
      const choice = button(doc, periodeDite(periode), () => choisir(periode), { sorte: "discret" });
      choice.ariaPressed = String(periode === jours);
      periodes.append(choice);
    }
    tete.append(titre, periodes);
    element.replaceChildren(tete, corps());
  };

  const corps = () => {
    const read = lues.get(jours)?.lecture ?? null;
    if (read === null) return lineEmpty(doc, READ_DE("GitHub"), { classe: "lecture" });
    if ("sans" in read) return lineError(doc, read.sans, read.detail);
    const { chiffres: theFigures, manquants, partiels } = read;
    const contenu = doc.createElement("div");
    contenu.className = "corps";
    // Des chiffres sur une période lue en partie le disent avant tout, avec la part qu'ils couvrent.
    if (partiels.length > 0) {
      contenu.append(lineError(doc, PARTIEL(jours, partiels), partiels.map(({ projet: project, raison }) => `${project}: ${raison}`).join("\n"), { classe: "partiels" }));
    }
    if (theFigures.tickets === 0) contenu.append(lineEmpty(doc, AUCUN(jours)));
    else contenu.append(figures(theFigures));
    if (manquants.length > 0) {
      contenu.append(lineError(doc, `not read: ${manquants.map(({ projet: project }) => project).join(", ")}`, manquants.map(({ projet: project, raison }) => `${project}: ${raison}`).join("\n"), { classe: "manquants" }));
    }
    if (ouvert && theFigures.avecHumain.length > 0) contenu.append(liste(theFigures));
    return contenu;
  };

  /** @param {Figures} theFigures */
  const figures = (theFigures) => {
    const grille = doc.createElement("div");
    grille.className = "figures";
    const avec = theFigures.avecHumain.length;
    const sansHuman = figure(SANS_HUMAN, DEFINITIONS.sansHumain, pourcent(theFigures.partSansHumain ?? 0), `${theFigures.sansHumain} of ${theFigures.tickets} merged tickets`);
    if (avec > 0) {
      const deplier = button(doc, `${AVEC_HUMAN} · ${avec}`, () => basculer());
      deplier.className = "avec-humain";
      deplier.ariaExpanded = String(ouvert);
      sansHuman.append(deplier);
    }
    grille.append(
      sansHuman,
      figure(DELAY, DEFINITIONS.delai, dureeEnClair(theFigures.delaiMedianMs ?? 0), "median, fire to merge"),
      figure(SENDBack, DEFINITIONS.renvoi, pourcent(theFigures.partRenvoyee ?? 0), `${theFigures.renvoyes} of ${theFigures.tickets} deliveries sent back`),
      defauts(BUGS_ECHAPPES, DEFINITIONS.bugs, theFigures.bugsEchappes, theFigures.defautsNonLus, (bug) => `${nomme(bug.projet)}${bug.tickets.map((ticket) => `#${ticket}`).join(", ")} (bug #${bug.bug})`),
      defauts(REVERTS, DEFINITIONS.reverts, theFigures.reverts, theFigures.defautsNonLus, (revert) => `${nomme(revert.projet)}${SHA_COURT(revert.sha)} (${revert.tickets.map((ticket) => `#${ticket}`).join(", ")})`),
    );
    return grille;
  };

  /** @param {string} project */
  const nomme = (project) => (tous ? `${project} ` : "");

  // Un nombre de défauts, et sous lui ce qui le fait ; non lus, ni nombre ni zéro : pourquoi, au survol.
  /**
   * @template {{ projet: string }} T
   * @param {string} name @param {string} definition @param {T[] | null} lus @param {Figures["defautsNonLus"]} nonLus @param {(un: T) => string} tell
   */
  const defauts = (name, definition, lus, nonLus, tell) => {
    const cadre =
      lus === null
        ? figure(name, definition, DEFAUTS_NON_LUS, nonLus.map(({ projet: project, raison }) => `${project}: ${raison}`).join("\n"))
        : figure(name, definition, String(lus.length), lus.length === 0 ? "none" : lus.map(tell).join(" · "));
    cadre.classList.add("defauts");
    return cadre;
  };

  /** @param {string} name @param {string} definition @param {string} valeur @param {string} dit */
  const figure = (name, definition, valeur, dit) => {
    const cadre = doc.createElement("div");
    cadre.className = "figure";
    const titre = doc.createElement("h4");
    titre.textContent = name;
    titre.append(survol(doc, definition));
    const total = doc.createElement("p");
    total.className = "valeur";
    total.textContent = valeur;
    const sous = doc.createElement("p");
    sous.className = "dit";
    sous.textContent = dit;
    cadre.append(titre, total, sous);
    return cadre;
  };

  /** @param {Figures} theFigures */
  const liste = (theFigures) => {
    const ul = doc.createElement("ul");
    ul.className = "avec-humain";
    ul.ariaLabel = `${AVEC_HUMAN}, ${periodeDite(jours)}`;
    for (const served of theFigures.avecHumain) {
      const li = doc.createElement("li");
      const lien = button(doc, `${tous ? `${served.projet} ` : ""}#${served.ticket} ${served.titre}`, () => ouvrir(served.url), { sorte: "discret", coupe: true });
      lien.className = "ticket";
      li.append(lien);
      for (const question of served.questions) {
        const line = doc.createElement("p");
        line.className = question === null ? "question sans" : "question";
        line.textContent = question ?? SANS_QUESTION;
        li.append(line);
      }
      ul.append(li);
    }
    return ul;
  };

  /** @param {number} periode */
  const choisir = (periode) => {
    jours = periode;
    poser();
  };
  const basculer = () => {
    ouvert = !ouvert;
    rendre();
  };

  const poser = () => {
    const lue = lues.get(jours);
    if (lue === undefined || maintenant() - lue.le >= FRAICHEUR_MS) lirePeriode(jours);
    rendre();
    return element;
  };

  return { element, poser };
}
