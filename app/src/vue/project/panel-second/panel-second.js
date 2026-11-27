// Le panneau du second (ticket 2923, épique 2913) : à droite de l'espace du projet, ouvert par défaut. Un seul bouton
// le replie et le déplie ; son bord gauche se tire pour changer sa largeur — jamais sous 280 px, jamais assez large pour
// laisser moins de 640 px au rail. Sa largeur et son état replié sont retenus par projet, d'une même écriture dans le
// stockage de la vue, et reposés au lancement suivant. Sur un écran étroit, il est un onglet : ni bord ni bouton.

import { button } from "../../components/button/button.js";

export const WIDTH_MINIMAL = 280;
export const REMAINS_AT_RAIL = 640;
export const WIDTH_BY_DEFAULT = 360;
export const KEY_OF_PANELS = "brigade.panneau-du-second";
// Un appui sur une flèche, le bord du panneau en main : le clavier tire comme la souris.
const NOT_AT_KEYBOARD = 16;

/** @typedef {{ largeur: number, replie: boolean }} Panel */
/** @typedef {{ getItem(key: string): string | null, setItem(key: string, value: string): void }} Storage */
/** @typedef {{ panneaux: Map<string, Panel>, lisible: boolean }} Held */

/**
 * La largeur tenue dans ses bornes. `disponible` est la place que le rail et le panneau se partagent ; inconnue, seule la
 * borne basse vaut. Une fenêtre trop étroite pour les deux bornes garde les 280 px du panneau.
 * @param {number} width @param {number | undefined} available
 */
export function bound(width, available) {
  const high = available === undefined || !Number.isFinite(available) ? Infinity : available - REMAINS_AT_RAIL;
  return Math.round(Math.max(WIDTH_MINIMAL, Math.min(width, high)));
}

/**
 * Ce que le stockage retient, projet par projet. Illisible — une valeur qui n'est pas un objet JSON, un stockage qui lève
 * —, rien n'est repris et `lisible` est faux : la vue n'y écrit plus, pour ne pas écraser ce qu'elle n'a pas su lire. Une
 * entrée mal formée ne vaut que pour son projet, qui reprend le défaut.
 * @param {Storage | undefined} storage
 * @returns {Held}
 */
export function readThePanels(storage) {
  /** @type {Map<string, Panel>} */
  const panels = new Map();
  if (storage === undefined) return { panneaux: panels, lisible: true };
  let readOnes;
  try {
    const raw = storage.getItem(KEY_OF_PANELS);
    if (raw === null) return { panneaux: panels, lisible: true };
    readOnes = JSON.parse(raw);
  } catch {
    return { panneaux: panels, lisible: false };
  }
  if (readOnes === null || typeof readOnes !== "object" || Array.isArray(readOnes)) return { panneaux: panels, lisible: false };
  for (const [name, readOne] of Object.entries(readOnes)) {
    if (readOne === null || typeof readOne !== "object") continue;
    panels.set(name, {
      largeur: typeof readOne.largeur === "number" && Number.isFinite(readOne.largeur) ? Math.max(WIDTH_MINIMAL, Math.round(readOne.largeur)) : WIDTH_BY_DEFAULT,
      replie: readOne.replie === true,
    });
  }
  return { panneaux: panels, lisible: true };
}

/** Le panneau d'un projet : celui qu'il a laissé, ou ouvert à sa largeur par défaut. @param {Held} retainedOnes @param {string} project @returns {Panel} */
export const panelOf = (retainedOnes, project) => retainedOnes.panneaux.get(project) ?? { largeur: WIDTH_BY_DEFAULT, replie: false };

/**
 * Retient le panneau d'un projet : en mémoire toujours, dans le stockage s'il a été lu. Rend vrai s'il y est écrit.
 * @param {Storage | undefined} storage @param {Held} retainedOnes @param {string} project @param {Panel} panel
 */
export function holdThePanel(storage, retainedOnes, project, panel) {
  retainedOnes.panneaux.set(project, { largeur: Math.round(panel.largeur), replie: panel.replie });
  if (storage === undefined || !retainedOnes.lisible) return false;
  try {
    storage.setItem(KEY_OF_PANELS, JSON.stringify(Object.fromEntries(retainedOnes.panneaux)));
    return true;
  } catch {
    // Sans stockage, le panneau se retient le temps de la session.
    return false;
  }
}

const SVG = "http://www.w3.org/2000/svg";

/**
 * Monte le bord à tirer et le bouton qui replie sur la colonne du second, et rend de quoi la poser pour un projet.
 * @param {{ document: Document, colonne: HTMLElement, tete: HTMLElement, stockage: Storage | undefined, disponible: () => number | undefined }} options
 */
export function mountThePanel({ document, colonne: column, tete: head, stockage: storage, disponible: available }) {
  const retainedOnes = readThePanels(storage);
  /** @type {string | undefined} */
  let project;
  let active = false;

  const edge = document.createElement("button");
  edge.type = "button";
  edge.id = "bord-du-second";
  edge.ariaLabel = "Resize the second's panel (drag; its width is kept)";
  edge.title = "Drag to resize — the width is kept";
  edge.append(document.createElement("span"));
  column.prepend(edge);

  // Replier est un geste discret de la famille (components/button) : son libellé est le chevron, son nom dans `ariaLabel`.
  const fold = button(document, "", undefined, { sorte: "discret" });
  fold.id = "replier-second";
  const chevron = document.createElementNS(SVG, "svg");
  chevron.setAttribute("viewBox", "0 0 16 16");
  chevron.setAttribute("aria-hidden", "true");
  const trait = document.createElementNS(SVG, "path");
  trait.setAttribute("d", "M6 3 L11 8 L6 13");
  chevron.append(trait);
  fold.append(chevron);
  head.append(fold);

  /** @param {number} width */
  const showWidth = (width) => column.style.setProperty("--largeur-du-second", `${bound(width, available())}px`);

  // Le panneau du projet montré, tel qu'il est retenu : sa largeur bornée à la fenêtre d'aujourd'hui, sans la réécrire.
  function set() {
    const panel = project === undefined ? undefined : panelOf(retainedOnes, project);
    const folded = active && panel?.replie === true;
    edge.hidden = !active || folded;
    fold.hidden = !active;
    column.toggleAttribute("data-replie", folded);
    fold.ariaExpanded = String(!folded);
    fold.ariaLabel = folded ? "Unfold the second's panel" : "Fold the second's panel";
    fold.title = fold.ariaLabel;
    if (panel !== undefined && active) showWidth(panel.largeur);
    else column.style.removeProperty("--largeur-du-second");
  }

  /** @param {Partial<Panel>} change */
  function change(change) {
    if (project === undefined) return;
    holdThePanel(storage, retainedOnes, project, { ...panelOf(retainedOnes, project), ...change });
    set();
  }

  fold.addEventListener("click", () => change({ replie: !(project !== undefined && panelOf(retainedOnes, project).replie) }));

  // Tirer le bord : la largeur suit le pointeur, bornée à chaque pas, et n'est retenue qu'au lâcher.
  /** @type {{ x: number, largeur: number, pointeur: number } | undefined} */
  let pulls;
  /** @param {PointerEvent} event */
  const widthPulled = (event) => (pulls === undefined ? 0 : bound(pulls.largeur + pulls.x - event.clientX, available()));
  edge.addEventListener("pointerdown", (event) => {
    if (project === undefined) return;
    event.preventDefault();
    pulls = { x: event.clientX, largeur: bound(panelOf(retainedOnes, project).largeur, available()), pointeur: event.pointerId };
    edge.setPointerCapture?.(event.pointerId);
    column.toggleAttribute("data-tire", true);
  });
  edge.addEventListener("pointermove", (event) => {
    if (pulls === undefined) return;
    showWidth(widthPulled(event));
  });
  /** @param {PointerEvent} event */
  const release = (event) => {
    if (pulls === undefined) return;
    const width = widthPulled(event);
    edge.releasePointerCapture?.(pulls.pointeur);
    pulls = undefined;
    column.toggleAttribute("data-tire", false);
    change({ largeur: width });
  };
  edge.addEventListener("pointerup", release);
  edge.addEventListener("pointercancel", release);
  edge.addEventListener("keydown", (event) => {
    if (project === undefined || (event.key !== "ArrowLeft" && event.key !== "ArrowRight")) return;
    event.preventDefault();
    const width = bound(panelOf(retainedOnes, project).largeur, available());
    change({ largeur: bound(width + (event.key === "ArrowLeft" ? NOT_AT_KEYBOARD : -NOT_AT_KEYBOARD), available()) });
  });

  return {
    /** Pose le panneau du projet montré ; `actif` est faux sur un écran étroit, ou sans projet. @param {string | undefined} name @param {boolean} inProgress */
    poser(name, inProgress) {
      project = name;
      active = name !== undefined && inProgress;
      set();
    },
    /** La fenêtre a changé de taille : la largeur montrée se reborne, la retenue ne bouge pas. */
    reborner: () => set(),
    /** Vrai quand le panneau du projet montré est replié. */
    replie: () => column.hasAttribute("data-replie"),
  };
}
