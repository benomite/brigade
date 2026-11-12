// @ts-check
// Le détail d'une carte « Validate its screen » (ticket 3212, après 3185) : un clic sur la carte, ou sur l'une de ses
// captures, l'ouvre en grand par-dessus l'app — en plein écran sur le téléphone. Dans cet ordre : la question ; le brief
// (ticket 3330), ce que le ticket demandait et ce que le cook a changé à l'écran, pour savoir où regarder ; les captures
// avant et après de chaque écran côte à côte, à la plus grande taille que la fenêtre permet ; le lien de la pull request et
// les deux gestes de la carte, « Validate » et le commentaire avec « Send back to the kitchen ».
// Chaque capture se zoome — molette, pincement, ou ses boutons — et se déplace au glisser. L'avant et l'après d'un écran
// partagent leur vue : zoomer l'une zoome l'autre au même endroit. « One over the other » les pose l'une sur l'autre, et
// « Show after » / « Show before » bascule de l'une à l'autre sur place. « Full size » ouvre une capture seule.
// Plusieurs cartes attendent : « Next validation » ouvre la suivante sans repasser par TODO.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément, les images déjà posées, l'affichage tenu par la
// vue (qu'il change au zoom sans reposer le détail) et ce que chaque geste appelle, et rend un élément.

import { bouton } from "../composants/bouton/bouton.js";
import { poserLesGestes, LIEN } from "./validation-design.js";

/** @typedef {import("../briques.js").Fabrique} Fabrique */
/** @typedef {import("../../carte-todo.ts").CarteDeTodo} CarteDeTodo */
/** @typedef {import("../../captures.ts").Moment} Moment */
/** @typedef {import("./validation-design.js").Etat} Etat */

// La vue partagée par l'avant et l'après d'un écran : `echelle` (1, l'image entière dans son cadre) et le point de l'image
// au centre du cadre (`x`, `y`, en fraction de l'image). Les deux images reçoivent la même : elles montrent le même endroit,
// quelle que soit la taille de leur cadre.
/** @typedef {{ echelle: number, x: number, y: number }} Vue */
// Ce que la vue tient du détail ouvert, d'une pose à l'autre : `superposees`, l'avant et l'après l'un sur l'autre ;
// `montre`, par écran, celle que l'on voit alors ; `seule`, la capture ouverte seule ; `vues`, la vue de chaque écran.
/** @typedef {{ superposees: boolean, montre: Map<string, Moment>, seule?: { ecran: string, moment: Moment }, vues: Map<string, Vue> }} Affichage */

export const FERMER = "Close";
export const ZOOMER = "Zoom in";
export const DEZOOMER = "Zoom out";
export const AJUSTER = "Fit";
export const SUPERPOSER = "One over the other";
export const COTE_A_COTE = "Side by side";
export const PLEINE_TAILLE = "Full size";
export const RETOUR = "Back to before and after";
/** @param {Moment} moment */
export const MONTRER = (moment) => (moment === "avant" ? "Show before" : "Show after");
/** @param {number} ticket */
export const SUIVANTE = (ticket) => `Next validation (#${ticket})`;

export const DEMANDE = "What was asked";
export const FAIT = "What was done";
export const SANS_DEMANDE = "this card does not say what its ticket asked — open its pull request";
export const SANS_RESUME = "No summary of what was done is available: the cook wrote none for this delivery.";

export const ECHELLE_MAX = 8;
/** @type {Vue} */
export const ENTIERE = { echelle: 1, x: 0.5, y: 0.5 };
const PAS = 1.5;

/** @returns {Affichage} */
export const affichageNeuf = () => ({ superposees: false, montre: new Map(), vues: new Map() });

/** @param {number} valeur @param {number} bas @param {number} haut */
const borne = (valeur, bas, haut) => Math.min(haut, Math.max(bas, valeur));

// La vue tenue dans l'image : l'échelle entre 1 et ECHELLE_MAX, le centre là où le cadre ne sort pas de l'image.
/** @param {Vue} vue @returns {Vue} */
export function bornee({ echelle, x, y }) {
  const e = borne(Number.isFinite(echelle) ? echelle : 1, 1, ECHELLE_MAX);
  const demi = 0.5 / e;
  return { echelle: e, x: borne(Number.isFinite(x) ? x : 0.5, demi, 1 - demi), y: borne(Number.isFinite(y) ? y : 0.5, demi, 1 - demi) };
}

// Zoomer de `facteur` autour d'un point du cadre (`px`, `py`, en fraction du cadre) : le point de l'image qui y est y reste.
/** @param {Vue} vue @param {number} facteur @param {number} [px] @param {number} [py] @returns {Vue} */
export function zoomer(vue, facteur, px = 0.5, py = 0.5) {
  const echelle = borne(vue.echelle * facteur, 1, ECHELLE_MAX);
  const u = vue.x + (px - 0.5) / vue.echelle;
  const v = vue.y + (py - 0.5) / vue.echelle;
  return bornee({ echelle, x: u - (px - 0.5) / echelle, y: v - (py - 0.5) / echelle });
}

// Glisser l'image de `dx`, `dy` (en fraction du cadre) : elle suit le doigt.
/** @param {Vue} vue @param {number} dx @param {number} dy @returns {Vue} */
export const deplacer = (vue, dx, dy) => bornee({ echelle: vue.echelle, x: vue.x - dx / vue.echelle, y: vue.y - dy / vue.echelle });

// Ce que l'image reçoit : le point (`x`, `y`) amené au centre, puis l'échelle autour du centre.
/** @param {Vue} vue */
export const transformDe = ({ echelle, x, y }) => `scale(${echelle}) translate(${(0.5 - x) * 100}%, ${(0.5 - y) * 100}%)`;

/** @param {Fabrique} doc @param {string} balise @param {string} [classe] @param {string} [texte] */
function cree(doc, balise, classe, texte) {
  const pose = doc.createElement(balise);
  if (classe !== undefined) pose.className = classe;
  if (texte !== undefined) pose.textContent = texte;
  return pose;
}

// Le détail, dans son état. `images(ecran, moment)` pose l'image d'une capture — ou sa place, tant qu'elle n'est pas lue.
// `suivante` : le numéro de la carte suivante qui attend, s'il y en a une. `lectureSeule` : rien ne la tranche d'ici.
/**
 * @param {Fabrique} doc
 * @param {number} ticket
 * @param {CarteDeTodo} carte
 * @param {Etat} etat
 * @param {Affichage} affichage
 * @param {{ images: (ecran: string, moment: Moment) => any, commentaire: string, cle: string, lectureSeule?: boolean, grand?: boolean, suivante?: number }} posees
 * @param {{ fermer: () => void, reposer: () => void, suivante: () => void, valider: () => void, renvoyer: (commentaire: string) => void, ecrire: (texte: string) => void, ouvrirPr: () => void }} gestes
 */
export function poserDetailDeValidation(doc, ticket, carte, etat, affichage, { images, commentaire, cle, lectureSeule = false, grand = false, suivante }, gestes) {
  const racine = cree(doc, "div", "detail-de-validation");
  racine.ariaLabel = `the screen #${ticket} asks you to validate, in large`;
  const tete = cree(doc, "header", "tete-du-detail");
  tete.append(cree(doc, "p", "question-carte", carte.question ?? ""));
  const enTete = cree(doc, "div", "gestes-du-detail");
  const { validation, captures } = carte;
  const ecrans = captures?.ecrans ?? [];
  if (ecrans.length > 0 && affichage.seule === undefined) {
    const bascule = bouton(doc, affichage.superposees ? COTE_A_COTE : SUPERPOSER, () => {
      affichage.superposees = !affichage.superposees;
      gestes.reposer();
    });
    bascule.ariaPressed = String(affichage.superposees);
    bascule.title = affichage.superposees ? "shows before and after side by side" : "shows before and after one over the other, to switch between them in place";
    enTete.append(bascule);
  }
  if (suivante !== undefined) {
    const prochaine = bouton(doc, SUIVANTE(suivante), gestes.suivante);
    prochaine.title = `opens the next design validation that waits for you, #${suivante}`;
    enTete.append(prochaine);
  }
  const fermer = bouton(doc, FERMER, gestes.fermer, { sorte: "discret" });
  fermer.className = `${fermer.className} fermer`.trim();
  enTete.append(fermer);
  tete.append(enTete);
  racine.append(tete);
  if (carte.brief !== undefined) racine.append(poserBrief(doc, carte.brief));

  const zone = cree(doc, "div", "ecrans-du-detail");
  if (captures?.incomplete !== undefined) {
    const ligne = cree(doc, "p", "captures-manquantes", captures.incomplete.ligne);
    ligne.title = captures.incomplete.detail;
    zone.append(ligne);
  }
  const seule = affichage.seule;
  if (seule !== undefined) {
    const capture = ecrans.find(({ ecran }) => ecran === seule.ecran)?.[seule.moment];
    if (capture !== undefined) zone.append(poserEcran(doc, seule.ecran, [{ moment: seule.moment, legende: capture.legende }], affichage, images, gestes, { seule: true }));
  } else {
    for (const { ecran, avant, apres } of ecrans) {
      const paire = [avant, apres].map(({ moment, legende }) => ({ moment, legende }));
      zone.append(poserEcran(doc, ecran, paire, affichage, images, gestes, { seule: false }));
    }
  }
  racine.append(zone);

  const pied = cree(doc, "footer", "pied-du-detail");
  if (validation === undefined || "illisible" in validation) {
    pied.append(cree(doc, "p", "validation-illisible", validation?.illisible ?? "this card does not say which pull request it validates"));
  } else {
    const lien = bouton(doc, LIEN(validation.pr), gestes.ouvrirPr, { sorte: "discret" });
    lien.className = `${lien.className} lien-de-la-pr`.trim();
    lien.title = "opens the pull request on GitHub";
    pied.append(lien);
    if (!lectureSeule) pied.append(...poserLesGestes(doc, validation, etat, { commentaire, cle, grand }, gestes));
  }
  racine.append(pied);
  return racine;
}

// Le brief, en deux parties titrées : ce que le ticket demandait, coupé à deux lignes (en entier au survol), et ce que le
// cook a changé à l'écran, un point par ligne — ou qu'il n'en a rien dit.
/** @param {Fabrique} doc @param {import("../../carte-todo.ts").BriefDeCarte} brief */
function poserBrief(doc, { demande, fait }) {
  const bloc = cree(doc, "section", "brief-du-detail");
  bloc.ariaLabel = "what the ticket asked and what was done on the screen";
  const demandee = cree(doc, "div", "partie-du-brief");
  const texte = cree(doc, "p", "demande-du-ticket", demande === "" ? SANS_DEMANDE : demande);
  if (demande !== "") texte.title = demande;
  demandee.append(cree(doc, "h3", undefined, DEMANDE), texte);
  const faite = cree(doc, "div", "partie-du-brief");
  faite.append(cree(doc, "h3", undefined, FAIT));
  if (fait === null) faite.append(cree(doc, "p", "sans-resume", SANS_RESUME));
  else {
    const liste = cree(doc, "ul", "fait-a-l-ecran");
    liste.append(...fait.map((point) => cree(doc, "li", undefined, point)));
    faite.append(liste);
  }
  bloc.append(demandee, faite);
  return bloc;
}

// Un écran : ses captures (l'avant et l'après, ou celle ouverte seule), qui partagent la vue de l'écran, et sa barre — zoomer,
// dézoomer, ajuster ; l'une sur l'autre, la bascule ; seule, le retour.
/**
 * @param {Fabrique} doc @param {string} ecran @param {{ moment: Moment, legende: string }[]} captures @param {Affichage} affichage
 * @param {(ecran: string, moment: Moment) => any} images
 * @param {{ reposer: () => void }} gestes
 * @param {{ seule: boolean }} options
 */
function poserEcran(doc, ecran, captures, affichage, images, { reposer }, { seule }) {
  const bloc = cree(doc, "section", "ecran-du-detail");
  bloc.ariaLabel = ecran === "" ? "the screen" : `the screen ${ecran}`;
  /** @type {any[]} */
  const zoomables = [];
  const appliquer = () => {
    const vue = affichage.vues.get(ecran) ?? ENTIERE;
    for (const image of zoomables) image.style.setProperty("transform", transformDe(vue));
  };
  /** @param {Vue} vue */
  const changer = (vue) => {
    affichage.vues.set(ecran, bornee(vue));
    appliquer();
  };
  const vue = () => affichage.vues.get(ecran) ?? ENTIERE;

  const barre = cree(doc, "div", "barre-de-zoom");
  barre.append(
    bouton(doc, DEZOOMER, () => changer(zoomer(vue(), 1 / PAS)), { sorte: "discret" }),
    bouton(doc, ZOOMER, () => changer(zoomer(vue(), PAS)), { sorte: "discret" }),
    bouton(doc, AJUSTER, () => changer(ENTIERE), { sorte: "discret" }),
  );

  const superposees = !seule && affichage.superposees;
  const paire = cree(doc, "div", superposees ? "paire superposees" : seule ? "paire seule" : "paire");
  if (superposees) {
    // L'une sur l'autre : un seul cadre, les deux images dedans ; la bascule montre l'autre sur place, sans rien reposer.
    const montree = () => affichage.montre.get(ecran) ?? "avant";
    const figure = cree(doc, "figure", "capture-zoomable");
    const cadre = cadreZoomable(doc, vue, changer);
    const titre = cree(doc, "figcaption");
    const legende = cree(doc, "span", "legende");
    /** @type {Map<Moment, any>} */
    const poses = new Map();
    for (const { moment } of captures) {
      const image = images(ecran, moment);
      image.dataset.moment = moment;
      poses.set(moment, image);
      zoomables.push(image);
      cadre.append(image);
    }
    const autre = () => (montree() === "avant" ? "apres" : "avant");
    const bascule = bouton(doc, MONTRER(autre()), () => {
      affichage.montre.set(ecran, autre());
      montrer();
    });
    const montrer = () => {
      for (const [moment, image] of poses) image.hidden = moment !== montree();
      legende.textContent = captures.find(({ moment }) => moment === montree())?.legende ?? "";
      bascule.textContent = MONTRER(autre());
      bascule.title = `shows ${autre() === "avant" ? "before" : "after"} in place, at the same spot`;
    };
    montrer();
    titre.append(legende);
    figure.append(cadre, titre);
    barre.append(bascule);
    paire.append(figure);
  } else {
    for (const { moment, legende } of captures) {
      const figure = cree(doc, "figure", "capture-zoomable");
      figure.dataset.moment = moment;
      const cadre = cadreZoomable(doc, vue, changer);
      const image = images(ecran, moment);
      zoomables.push(image);
      cadre.append(image);
      const titre = cree(doc, "figcaption");
      titre.append(cree(doc, "span", "legende", legende));
      if (!seule) {
        const pleine = bouton(
          doc,
          PLEINE_TAILLE,
          () => {
            affichage.seule = { ecran, moment };
            reposer();
          },
          { sorte: "discret" },
        );
        pleine.title = `opens ${legende} alone, at full size`;
        titre.append(pleine);
      }
      figure.append(cadre, titre);
      paire.append(figure);
    }
  }
  if (seule) {
    const retour = bouton(doc, RETOUR, () => {
      delete affichage.seule;
      reposer();
    });
    barre.append(retour);
  }
  appliquer();
  bloc.append(barre, paire);
  return bloc;
}

// Le cadre d'une capture : la molette zoome autour du pointeur ; un doigt, ou la souris, glisse l'image ; deux doigts la
// pincent. Rien n'est reposé : la vue change, et les images de l'écran la reçoivent.
/** @param {Fabrique} doc @param {() => Vue} vue @param {(vue: Vue) => void} changer */
function cadreZoomable(doc, vue, changer) {
  const cadre = cree(doc, "div", "cadre");
  /** @param {{ clientX: number, clientY: number }} point */
  const dans = ({ clientX, clientY }) => {
    const { left, top, width, height } = cadre.getBoundingClientRect();
    return width > 0 && height > 0 ? { x: (clientX - left) / width, y: (clientY - top) / height } : undefined;
  };
  cadre.addEventListener(
    "wheel",
    /** @param {WheelEvent} evenement */ (evenement) => {
      evenement.preventDefault();
      const point = dans(evenement);
      if (point === undefined) return;
      changer(zoomer(vue(), Math.exp(-evenement.deltaY * 0.002), point.x, point.y));
    },
    { passive: false },
  );
  /** @type {Map<number, { x: number, y: number }>} */
  const pointeurs = new Map();
  cadre.addEventListener("pointerdown", /** @param {PointerEvent} evenement */ (evenement) => {
    const point = dans(evenement);
    if (point === undefined) return;
    evenement.preventDefault();
    cadre.setPointerCapture?.(evenement.pointerId);
    pointeurs.set(evenement.pointerId, point);
  });
  cadre.addEventListener("pointermove", /** @param {PointerEvent} evenement */ (evenement) => {
    const avant = pointeurs.get(evenement.pointerId);
    const point = dans(evenement);
    if (avant === undefined || point === undefined) return;
    const autres = [...pointeurs].filter(([id]) => id !== evenement.pointerId).map(([, autre]) => autre);
    pointeurs.set(evenement.pointerId, point);
    const [autre] = autres;
    if (autre === undefined) return changer(deplacer(vue(), point.x - avant.x, point.y - avant.y));
    // Deux doigts : l'écart qui grandit zoome autour de leur milieu, et le milieu qui bouge emmène l'image avec lui.
    const ecart = (/** @type {{ x: number, y: number }} */ a) => Math.hypot(a.x - autre.x, a.y - autre.y);
    if (ecart(avant) === 0) return;
    const milieu = { x: (point.x + autre.x) / 2, y: (point.y + autre.y) / 2 };
    const ancien = { x: (avant.x + autre.x) / 2, y: (avant.y + autre.y) / 2 };
    changer(deplacer(zoomer(vue(), ecart(point) / ecart(avant), ancien.x, ancien.y), milieu.x - ancien.x, milieu.y - ancien.y));
  });
  const lacher = (/** @type {PointerEvent} */ evenement) => void pointeurs.delete(evenement.pointerId);
  cadre.addEventListener("pointerup", lacher);
  cadre.addEventListener("pointercancel", lacher);
  // Un double clic zoome là où il tombe ; zoomé, il rend l'image entière.
  cadre.addEventListener("dblclick", /** @param {MouseEvent} evenement */ (evenement) => {
    const point = dans(evenement);
    if (point === undefined) return;
    changer(vue().echelle > 1 ? ENTIERE : zoomer(vue(), PAS * PAS, point.x, point.y));
  });
  return cadre;
}
