// @ts-check
// Les chiffres d'autonomie (ticket 3222, épique 3213) : le but de brigade est l'autonomie, et trois chiffres disent si
// elle tient — servi sans humain, délai, taux de renvoi —, sur les 7 ou les 30 derniers jours, au choix. D'un projet, dans
// sa section de Settings ; de tous les projets ensemble, sur la page de leur coût. Un clic sur « served with a human »
// déplie les tickets qui ont demandé quelque chose au chef, chacun avec sa question et son lien : chacun est un échec à
// corriger (CLAUDE.md, « Brigade's goal: autonomy »).
//
// La vue n'y calcule rien : la lecture vient de GitHub, par le process principal (autonomie-github.ts), et le calcul est
// celui du runtime. Le bloc garde ce qu'il a lu de chaque période dix minutes ; une période changée se lit si elle ne
// l'a pas été. Ce module ne touche pas `document` : il reçoit de quoi créer un élément (briques.js).

import { survol } from "../briques.js";
import { bouton } from "../composants/bouton/bouton.js";
import { ligneErreur } from "../composants/ligne-erreur/ligne-erreur.js";
import { ligneVide } from "../composants/ligne-vide/ligne-vide.js";
import { LECTURE_DE, NON_ATTEINT } from "../lexique.js";
import { dureeEnClair } from "../projet/delai.js";

/** @typedef {import("../briques.js").Fabrique} Fabrique */
/** @typedef {import("./autonomie-github.ts").LectureDAutonomie} Lecture */
/** @typedef {Extract<Lecture, { chiffres: unknown }>["chiffres"]} Chiffres */

export const TITRE = "Autonomy";
// Les périodes offertes, en jours (runtime/src/autonomie/chiffres/chiffres.ts, `PERIODES`) — le test les compare.
export const PERIODES = /** @type {const} */ ([7, 30]);
/** @param {number} jours */
export const periodeDite = (jours) => `last ${jours} days`;
export const SANS_HUMAIN = "served without a human";
export const AVEC_HUMAIN = "served with a human";
export const DELAI = "lead time";
export const RENVOI = "send-back rate";
export const DEFINITIONS = {
  sansHumain: "The share of the tickets merged in the period whose path from fire to merge never asked the chef anything: no TODO card, no blocked-on-human.",
  delai: "The median time from fire to merge of the tickets merged in the period.",
  renvoi: "The share of the deliveries merged in the period that the pass sent back at least once.",
};
export const SOURCE = "Read from GitHub only: the merged pull requests, and the labels and comments of each ticket.";
/** @param {number} jours */
export const AUCUN = (jours) => `no ticket merged in the ${periodeDite(jours)}`;
export const SANS_QUESTION = "question not written on the ticket";
export const FRAICHEUR_MS = 10 * 60_000;

export const SANS_LECTURE = NON_ATTEINT("autonomy figures");
/** @param {number} jours @param {string} detail @returns {Lecture} */
const sans = (jours, detail) => ({ jours, sans: SANS_LECTURE, detail });

/** @param {number} part */
const pourcent = (part) => `${Math.round(part * 100)} %`;

// Le bloc, son état, et `poser()` qui le rend à jour — et lit la période choisie si elle ne l'a pas été depuis dix minutes.
// `lire` : la lecture des chiffres de la période ; `ouvrir` : l'issue d'un ticket, dans le navigateur ; `tous` : le bloc de
// tous les projets nomme le projet de chaque ticket.
/**
 * @param {Fabrique} doc
 * @param {{ lire: (jours: number) => Promise<Lecture>, ouvrir: (url: string) => void, tous?: boolean, maintenant?: () => number }} options
 */
export function tenirLesChiffresDAutonomie(doc, { lire, ouvrir, tous = false, maintenant = Date.now }) {
  const element = doc.createElement("section");
  element.className = "chiffres-autonomie";
  element.ariaLabel = tous ? `${TITRE} of all projects` : TITRE;
  element.dataset.bloc = "chiffres-autonomie";
  /** @type {number} */
  let jours = PERIODES[0];
  let ouvert = false;
  /** @type {Map<number, { le: number, lecture: Lecture | null }>} */
  const lues = new Map();

  /** @param {number} periode */
  const lirePeriode = (periode) => {
    lues.set(periode, { le: maintenant(), lecture: lues.get(periode)?.lecture ?? null });
    void Promise.resolve()
      .then(() => lire(periode))
      .then(
        (lue) => (typeof lue === "object" && lue !== null && ("sans" in lue || "chiffres" in lue) ? lue : sans(periode, "the app gave no figures")),
        (/** @type {unknown} */ erreur) => sans(periode, erreur instanceof Error ? erreur.message : String(erreur)),
      )
      .then((lecture) => {
        lues.set(periode, { le: lues.get(periode)?.le ?? maintenant(), lecture });
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
      const choix = bouton(doc, periodeDite(periode), () => choisir(periode), { sorte: "discret" });
      choix.ariaPressed = String(periode === jours);
      periodes.append(choix);
    }
    tete.append(titre, periodes);
    element.replaceChildren(tete, corps());
  };

  const corps = () => {
    const lecture = lues.get(jours)?.lecture ?? null;
    if (lecture === null) return ligneVide(doc, LECTURE_DE("GitHub"), { classe: "lecture" });
    if ("sans" in lecture) return ligneErreur(doc, lecture.sans, lecture.detail);
    const { chiffres, manquants } = lecture;
    const contenu = doc.createElement("div");
    contenu.className = "corps";
    if (chiffres.tickets === 0) contenu.append(ligneVide(doc, AUCUN(jours)));
    else contenu.append(figures(chiffres));
    if (manquants.length > 0) {
      contenu.append(ligneErreur(doc, `not read: ${manquants.map(({ projet }) => projet).join(", ")}`, manquants.map(({ projet, raison }) => `${projet}: ${raison}`).join("\n"), { classe: "manquants" }));
    }
    if (ouvert && chiffres.avecHumain.length > 0) contenu.append(liste(chiffres));
    return contenu;
  };

  /** @param {Chiffres} chiffres */
  const figures = (chiffres) => {
    const grille = doc.createElement("div");
    grille.className = "figures";
    const avec = chiffres.avecHumain.length;
    const sansHumain = figure(SANS_HUMAIN, DEFINITIONS.sansHumain, pourcent(chiffres.partSansHumain ?? 0), `${chiffres.sansHumain} of ${chiffres.tickets} merged tickets`);
    if (avec > 0) {
      const deplier = bouton(doc, `${AVEC_HUMAIN} · ${avec}`, () => basculer());
      deplier.className = "avec-humain";
      deplier.ariaExpanded = String(ouvert);
      sansHumain.append(deplier);
    }
    grille.append(
      sansHumain,
      figure(DELAI, DEFINITIONS.delai, dureeEnClair(chiffres.delaiMedianMs ?? 0), "median, fire to merge"),
      figure(RENVOI, DEFINITIONS.renvoi, pourcent(chiffres.partRenvoyee ?? 0), `${chiffres.renvoyes} of ${chiffres.tickets} deliveries sent back`),
    );
    return grille;
  };

  /** @param {string} nom @param {string} definition @param {string} valeur @param {string} dit */
  const figure = (nom, definition, valeur, dit) => {
    const cadre = doc.createElement("div");
    cadre.className = "figure";
    const titre = doc.createElement("h4");
    titre.textContent = nom;
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

  /** @param {Chiffres} chiffres */
  const liste = (chiffres) => {
    const ul = doc.createElement("ul");
    ul.className = "avec-humain";
    ul.ariaLabel = `${AVEC_HUMAIN}, ${periodeDite(jours)}`;
    for (const servi of chiffres.avecHumain) {
      const li = doc.createElement("li");
      const lien = bouton(doc, `${tous ? `${servi.projet} ` : ""}#${servi.ticket} ${servi.titre}`, () => ouvrir(servi.url), { sorte: "discret", coupe: true });
      lien.className = "ticket";
      li.append(lien);
      for (const question of servi.questions) {
        const ligne = doc.createElement("p");
        ligne.className = question === null ? "question sans" : "question";
        ligne.textContent = question ?? SANS_QUESTION;
        li.append(ligne);
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
