// Le panneau du second (ticket 2923, épique 2913) : à droite de l'espace du projet, ouvert par défaut. Un seul bouton
// le replie et le déplie ; son bord gauche se tire pour changer sa largeur — jamais sous 280 px, jamais assez large pour
// laisser moins de 640 px au rail. Sa largeur et son état replié sont retenus par projet, d'une même écriture dans le
// stockage de la vue, et reposés au lancement suivant. Sur un écran étroit, il est un onglet : ni bord ni bouton.

import { bouton } from "../../composants/bouton/bouton.js";

export const LARGEUR_MINIMALE = 280;
export const RESTE_AU_RAIL = 640;
export const LARGEUR_PAR_DEFAUT = 360;
export const CLE_DES_PANNEAUX = "brigade.panneau-du-second";
// Un appui sur une flèche, le bord du panneau en main : le clavier tire comme la souris.
const PAS_AU_CLAVIER = 16;

/** @typedef {{ largeur: number, replie: boolean }} Panneau */
/** @typedef {{ getItem(cle: string): string | null, setItem(cle: string, valeur: string): void }} Stockage */
/** @typedef {{ panneaux: Map<string, Panneau>, lisible: boolean }} Retenus */

/**
 * La largeur tenue dans ses bornes. `disponible` est la place que le rail et le panneau se partagent ; inconnue, seule la
 * borne basse vaut. Une fenêtre trop étroite pour les deux bornes garde les 280 px du panneau.
 * @param {number} largeur @param {number | undefined} disponible
 */
export function borner(largeur, disponible) {
  const haute = disponible === undefined || !Number.isFinite(disponible) ? Infinity : disponible - RESTE_AU_RAIL;
  return Math.round(Math.max(LARGEUR_MINIMALE, Math.min(largeur, haute)));
}

/**
 * Ce que le stockage retient, projet par projet. Illisible — une valeur qui n'est pas un objet JSON, un stockage qui lève
 * —, rien n'est repris et `lisible` est faux : la vue n'y écrit plus, pour ne pas écraser ce qu'elle n'a pas su lire. Une
 * entrée mal formée ne vaut que pour son projet, qui reprend le défaut.
 * @param {Stockage | undefined} stockage
 * @returns {Retenus}
 */
export function lireLesPanneaux(stockage) {
  /** @type {Map<string, Panneau>} */
  const panneaux = new Map();
  if (stockage === undefined) return { panneaux, lisible: true };
  let lus;
  try {
    const brut = stockage.getItem(CLE_DES_PANNEAUX);
    if (brut === null) return { panneaux, lisible: true };
    lus = JSON.parse(brut);
  } catch {
    return { panneaux, lisible: false };
  }
  if (lus === null || typeof lus !== "object" || Array.isArray(lus)) return { panneaux, lisible: false };
  for (const [nom, lu] of Object.entries(lus)) {
    if (lu === null || typeof lu !== "object") continue;
    panneaux.set(nom, {
      largeur: typeof lu.largeur === "number" && Number.isFinite(lu.largeur) ? Math.max(LARGEUR_MINIMALE, Math.round(lu.largeur)) : LARGEUR_PAR_DEFAUT,
      replie: lu.replie === true,
    });
  }
  return { panneaux, lisible: true };
}

/** Le panneau d'un projet : celui qu'il a laissé, ou ouvert à sa largeur par défaut. @param {Retenus} retenus @param {string} projet @returns {Panneau} */
export const panneauDe = (retenus, projet) => retenus.panneaux.get(projet) ?? { largeur: LARGEUR_PAR_DEFAUT, replie: false };

/**
 * Retient le panneau d'un projet : en mémoire toujours, dans le stockage s'il a été lu. Rend vrai s'il y est écrit.
 * @param {Stockage | undefined} stockage @param {Retenus} retenus @param {string} projet @param {Panneau} panneau
 */
export function retenirLePanneau(stockage, retenus, projet, panneau) {
  retenus.panneaux.set(projet, { largeur: Math.round(panneau.largeur), replie: panneau.replie });
  if (stockage === undefined || !retenus.lisible) return false;
  try {
    stockage.setItem(CLE_DES_PANNEAUX, JSON.stringify(Object.fromEntries(retenus.panneaux)));
    return true;
  } catch {
    // Sans stockage, le panneau se retient le temps de la session.
    return false;
  }
}

const SVG = "http://www.w3.org/2000/svg";

/**
 * Monte le bord à tirer et le bouton qui replie sur la colonne du second, et rend de quoi la poser pour un projet.
 * @param {{ document: Document, colonne: HTMLElement, tete: HTMLElement, stockage: Stockage | undefined, disponible: () => number | undefined }} options
 */
export function monterLePanneau({ document, colonne, tete, stockage, disponible }) {
  const retenus = lireLesPanneaux(stockage);
  /** @type {string | undefined} */
  let projet;
  let actif = false;

  const bord = document.createElement("button");
  bord.type = "button";
  bord.id = "bord-du-second";
  bord.ariaLabel = "Resize the second's panel (drag; its width is kept)";
  bord.title = "Drag to resize — the width is kept";
  bord.append(document.createElement("span"));
  colonne.prepend(bord);

  // Replier est un geste discret de la famille (composants/bouton) : son libellé est le chevron, son nom dans `ariaLabel`.
  const replier = bouton(document, "", undefined, { sorte: "discret" });
  replier.id = "replier-second";
  const chevron = document.createElementNS(SVG, "svg");
  chevron.setAttribute("viewBox", "0 0 16 16");
  chevron.setAttribute("aria-hidden", "true");
  const trait = document.createElementNS(SVG, "path");
  trait.setAttribute("d", "M6 3 L11 8 L6 13");
  chevron.append(trait);
  replier.append(chevron);
  tete.append(replier);

  /** @param {number} largeur */
  const montrerLargeur = (largeur) => colonne.style.setProperty("--largeur-du-second", `${borner(largeur, disponible())}px`);

  // Le panneau du projet montré, tel qu'il est retenu : sa largeur bornée à la fenêtre d'aujourd'hui, sans la réécrire.
  function poser() {
    const panneau = projet === undefined ? undefined : panneauDe(retenus, projet);
    const replie = actif && panneau?.replie === true;
    bord.hidden = !actif || replie;
    replier.hidden = !actif;
    colonne.toggleAttribute("data-replie", replie);
    replier.ariaExpanded = String(!replie);
    replier.ariaLabel = replie ? "Unfold the second's panel" : "Fold the second's panel";
    replier.title = replier.ariaLabel;
    if (panneau !== undefined && actif) montrerLargeur(panneau.largeur);
    else colonne.style.removeProperty("--largeur-du-second");
  }

  /** @param {Partial<Panneau>} change */
  function changer(change) {
    if (projet === undefined) return;
    retenirLePanneau(stockage, retenus, projet, { ...panneauDe(retenus, projet), ...change });
    poser();
  }

  replier.addEventListener("click", () => changer({ replie: !(projet !== undefined && panneauDe(retenus, projet).replie) }));

  // Tirer le bord : la largeur suit le pointeur, bornée à chaque pas, et n'est retenue qu'au lâcher.
  /** @type {{ x: number, largeur: number, pointeur: number } | undefined} */
  let tire;
  /** @param {PointerEvent} evenement */
  const largeurTiree = (evenement) => (tire === undefined ? 0 : borner(tire.largeur + tire.x - evenement.clientX, disponible()));
  bord.addEventListener("pointerdown", (evenement) => {
    if (projet === undefined) return;
    evenement.preventDefault();
    tire = { x: evenement.clientX, largeur: borner(panneauDe(retenus, projet).largeur, disponible()), pointeur: evenement.pointerId };
    bord.setPointerCapture?.(evenement.pointerId);
    colonne.toggleAttribute("data-tire", true);
  });
  bord.addEventListener("pointermove", (evenement) => {
    if (tire === undefined) return;
    montrerLargeur(largeurTiree(evenement));
  });
  /** @param {PointerEvent} evenement */
  const lacher = (evenement) => {
    if (tire === undefined) return;
    const largeur = largeurTiree(evenement);
    bord.releasePointerCapture?.(tire.pointeur);
    tire = undefined;
    colonne.toggleAttribute("data-tire", false);
    changer({ largeur });
  };
  bord.addEventListener("pointerup", lacher);
  bord.addEventListener("pointercancel", lacher);
  bord.addEventListener("keydown", (evenement) => {
    if (projet === undefined || (evenement.key !== "ArrowLeft" && evenement.key !== "ArrowRight")) return;
    evenement.preventDefault();
    const largeur = borner(panneauDe(retenus, projet).largeur, disponible());
    changer({ largeur: borner(largeur + (evenement.key === "ArrowLeft" ? PAS_AU_CLAVIER : -PAS_AU_CLAVIER), disponible()) });
  });

  return {
    /** Pose le panneau du projet montré ; `actif` est faux sur un écran étroit, ou sans projet. @param {string | undefined} nom @param {boolean} enCours */
    poser(nom, enCours) {
      projet = nom;
      actif = nom !== undefined && enCours;
      poser();
    },
    /** La fenêtre a changé de taille : la largeur montrée se reborne, la retenue ne bouge pas. */
    reborner: () => poser(),
    /** Vrai quand le panneau du projet montré est replié. */
    replie: () => colonne.hasAttribute("data-replie"),
  };
}
