// @ts-check
// La table d'autonomie d'un projet, avec ses réglages (ticket 1563, épique 1559) : ce que brigade décide seule,
// décision par décision. Une rangée par sorte de décision — Screens, Merge, Specification, Priorities, Cost,
// Dependencies, Publishing —, chacune à l'une de trois positions : « brigade decides », « brigade decides and tells
// me », « I decide », celle en vigueur pressée. Dessous, les rangées toujours « I decide » — production, secrets, ce
// qui se publie hors du dépôt — posées verrouillées : rien ne s'y clique. Au-dessus, trois profils qui posent toute
// la table d'un clic ; ses rangées restent réglables une à une ensuite.
//
// La table vit dans le journal du projet, là où sa cuisine tourne (runtime/src/autonomie/table.ts) : la vue n'y
// calcule rien. Un clic part par l'API qu'on lui donne, et ce qui s'affiche ensuite est la table que cette API rend
// — celle que le journal porte après le changement, jamais celle que la vue croit avoir posée. Une rangée que rien
// n'a posée dit qu'elle tient le comportement d'aujourd'hui ; la rangée Merge est le grant `merge`.
//
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (briques.js), et l'élément où se poser.

import { boutonAction, lectureIndisponible, survol } from "../briques.js";

/** @typedef {import("../briques.js").Fabrique} Fabrique */

// Les mots de la table, tels que le runtime les écrit (runtime/src/autonomie/table.ts) — le test les compare.
export const POSITIONS = /** @type {const} */ (["brigade-decides", "brigade-decides-and-tells-me", "i-decide"]);
/** @typedef {(typeof POSITIONS)[number]} Position */
export const RANGEES = /** @type {const} */ (["screens", "merge", "specification", "priorities", "cost", "dependencies", "publishing"]);
/** @typedef {(typeof RANGEES)[number]} Rangee */
export const FIXES = /** @type {const} */ (["production", "secrets", "published-outside-the-repository"]);
/** @typedef {(typeof FIXES)[number]} Fixe */
export const NOMS_DES_PROFILS = /** @type {const} */ (["prototype", "client-product", "internal-tool"]);
/** @typedef {(typeof NOMS_DES_PROFILS)[number]} Profil */

// La table telle que le runtime la lit (`lireAutonomie`) : d'où vient chaque position — `default` : rien ne l'a posée,
// elle tient le comportement d'aujourd'hui ; `set` : le chef l'a posée ; `grant` : la rangée Merge, lue du grant ;
// `fixed` : une rangée qu'aucune commande ne change.
/** @typedef {"default" | "set" | "grant" | "fixed"} Source */
/** @typedef {{ row: Rangee, position: Position, source: Source, fixed: boolean }} Ligne */
/** @typedef {{ row: Fixe, position: Position, source: Source, fixed: boolean }} LigneFixe */
/** @typedef {{ rows: Ligne[], fixed: LigneFixe[] }} Table */

// Ce que la lecture rend : la table, ou pourquoi elle ne se lit pas — en une ligne, le détail au survol.
/** @typedef {{ table: Table } | { sans: string, detail?: string }} Lecture */
// Ce qu'un clic rend : la table telle qu'elle est écrite après lui, ou pourquoi rien n'a changé.
/** @typedef {{ table: Table } | { refus: string, detail?: string }} Rendu */
// De quoi lire et changer la table d'un projet, là où sa cuisine tourne.
/** @typedef {{ lire(): Promise<Lecture>, poserRangee(row: Rangee, position: Position): Promise<Rendu>, appliquerProfil(profil: Profil): Promise<Rendu> }} Api */
// Le clic en cours : une rangée et la position demandée, ou un profil.
/** @typedef {{ row: Rangee, position: Position } | { profil: Profil }} EnCours */

export const TITRE = "Autonomy";
export const ATTENDU = "Choose, decision by decision, what brigade decides alone.";
export const AIDE = "Kept in the project's log, where its kitchen runs. A change applies at the kitchen's next read, with no restart.";

export const LIBELLES_DES_POSITIONS = /** @type {const} */ ({
  "brigade-decides": "brigade decides",
  "brigade-decides-and-tells-me": "brigade decides and tells me",
  "i-decide": "I decide",
});

export const LIBELLES_DES_RANGEES = /** @type {const} */ ({
  screens: { titre: "Screens", dit: "validating the captures of an interface change before merge" },
  merge: { titre: "Merge", dit: "merging a green delivery (the `merge` grant)" },
  specification: { titre: "Specification", dit: "adjusting a ticket's criteria, splitting it again, closing a ticket judged useless" },
  priorities: { titre: "Priorities", dit: "changing ticket priorities, posing tickets born in the kitchen" },
  cost: { titre: "Cost", dit: "raising a ticket's calibration, relaunching it beyond its resends, the share of the Max quota" },
  dependencies: { titre: "Dependencies", dit: "adding a library or a service (a database, Docker…)" },
  publishing: { titre: "Publishing", dit: "releases and station updates" },
  production: { titre: "Production", dit: "any action on the project's production" },
  secrets: { titre: "Secrets", dit: "reading or writing the project's secrets" },
  "published-outside-the-repository": { titre: "Published outside the repository", dit: "anything published outside the repository" },
});

// Les profils, et la table que chacun pose — le runtime l'applique, la vue ne la dit qu'au survol de son bouton.
/** @param {Partial<Record<Rangee, Position>>} sauf @returns {Record<Rangee, Position>} */
const profil = (sauf) => /** @type {Record<Rangee, Position>} */ (Object.fromEntries(RANGEES.map((row) => [row, sauf[row] ?? "brigade-decides"])));
export const PROFILS = {
  prototype: { libelle: "prototype", table: profil({}) },
  "client-product": { libelle: "client product", table: profil({ screens: "i-decide", specification: "i-decide" }) },
  "internal-tool": { libelle: "internal tool", table: profil(Object.fromEntries(RANGEES.map((row) => [row, "brigade-decides-and-tells-me"]))) },
};

// Ce que pose un profil, en mots : les rangées groupées par position, la plus fréquente dite « every other row ».
/** @param {Profil} nom */
export function ceQuePose(nom) {
  const { table } = PROFILS[nom];
  const parPosition = POSITIONS.map((position) => ({ position, rangees: RANGEES.filter((row) => table[row] === position) })).filter(({ rangees }) => rangees.length > 0);
  if (parPosition.length === 1) return `Every row: ${LIBELLES_DES_POSITIONS[parPosition[0]?.position ?? "i-decide"]}.`;
  const [reste] = [...parPosition].sort((a, b) => b.rangees.length - a.rangees.length);
  const dits = parPosition.filter((groupe) => groupe !== reste).map(({ position, rangees }) => `${rangees.map((row) => LIBELLES_DES_RANGEES[row].titre).join(" and ")}: ${LIBELLES_DES_POSITIONS[position]}`);
  return `${dits.join(". ")}. Every other row: ${LIBELLES_DES_POSITIONS[reste?.position ?? "i-decide"]}.`;
}

// Ce qui se dit d'une rangée à côté de ses positions : d'où vient celle en vigueur, quand ce n'est pas le chef.
export const AUJOURDHUI = "today's behavior";
export const PAR_LE_GRANT = "the merge grant";
export const VERROUILLEE = { titre: "Always I decide", libelle: "locked", survol: "No button changes these rows: only a delivery of brigade does." };
export const EN_COURS = "saving…";
export const PROFILS_DITS = { titre: "Start from a profile", survol: "A profile sets every row at once; each row can then be changed alone." };

/** @param {Fabrique} doc @param {string} balise @param {string} [texte] */
function cree(doc, balise, texte) {
  const pose = doc.createElement(balise);
  if (texte !== undefined) pose.textContent = texte;
  return pose;
}

// Le nom d'une rangée, et ce qu'elle décide au survol.
/** @param {Fabrique} doc @param {Rangee | Fixe} row */
function nomDe(doc, row) {
  const { titre, dit } = LIBELLES_DES_RANGEES[row];
  const nom = cree(doc, "span", titre);
  nom.className = "nom";
  nom.append(survol(doc, dit));
  return nom;
}

// Les trois positions d'une rangée : celle en vigueur pressée. `choisir` absent, rien ne se clique.
/** @param {Fabrique} doc @param {{ row: Rangee | Fixe, position: Position, demandee?: Position, choisir?: (position: Position) => void }} options */
function positionsDe(doc, { row, position, demandee, choisir }) {
  const groupe = cree(doc, "span");
  groupe.className = "positions";
  groupe.role = "group";
  groupe.ariaLabel = `${LIBELLES_DES_RANGEES[row].titre}: who decides`;
  groupe.append(
    ...POSITIONS.map((possible) => {
      const bouton = cree(doc, "button", LIBELLES_DES_POSITIONS[possible]);
      bouton.type = "button";
      bouton.dataset.position = possible;
      bouton.ariaPressed = String(possible === position);
      if (possible === demandee) bouton.className = "demandee";
      bouton.disabled = choisir === undefined;
      if (choisir !== undefined) bouton.addEventListener("click", () => choisir(possible));
      return bouton;
    }),
  );
  return groupe;
}

// Une rangée réglable : son nom, ses trois positions, et d'où vient la sienne — ou le clic en cours. Sa position
// pressée ne se reclique que si elle tient le comportement d'aujourd'hui : le chef la pose alors pour de bon.
/** @param {Fabrique} doc @param {{ ligne: Ligne, enCours: EnCours | undefined, poser: (row: Rangee, position: Position) => void }} options */
function rangeeDe(doc, { ligne, enCours, poser }) {
  const { row, position, source } = ligne;
  const rangee = cree(doc, "div");
  rangee.className = "rangee";
  rangee.dataset.row = row;
  rangee.dataset.source = source;
  const demandee = enCours !== undefined && "row" in enCours && enCours.row === row ? enCours.position : undefined;
  const occupe = enCours !== undefined;
  const note = cree(doc, "small", demandee !== undefined ? EN_COURS : source === "default" ? AUJOURDHUI : source === "grant" ? PAR_LE_GRANT : "");
  note.className = "source";
  rangee.append(nomDe(doc, row), positionsDe(doc, { row, position, ...(demandee === undefined ? {} : { demandee }), ...(occupe ? {} : { choisir: (pris) => void ((pris !== position || source === "default") && poser(row, pris)) }) }), note);
  return rangee;
}

// Une rangée verrouillée : son nom, « I decide » pressé, rien ne se clique.
/** @param {Fabrique} doc @param {LigneFixe} ligne */
function verrouilleeDe(doc, { row, position }) {
  const rangee = cree(doc, "div");
  rangee.className = "rangee verrouillee";
  rangee.dataset.row = row;
  rangee.append(nomDe(doc, row), positionsDe(doc, { row, position }));
  return rangee;
}

// La table, ou null tant que rien n'est lu. Une lecture ratée tient en une ligne, son détail au survol ; un clic
// refusé se dit sous la table, la table restant celle qui est écrite.
/**
 * @param {Fabrique} doc
 * @param {{ lecture: Lecture | undefined, enCours?: EnCours, refus?: { refus: string, detail?: string }, poser: (row: Rangee, position: Position) => void, appliquer: (profil: Profil) => void }} options
 */
export function poserLaTableDAutonomie(doc, { lecture, enCours, refus, poser, appliquer }) {
  if (lecture === undefined) return null;
  const section = cree(doc, "section");
  section.className = "autonomie";
  section.ariaLabel = TITRE;
  const titre = cree(doc, "h3", TITRE);
  titre.append(survol(doc, AIDE));
  const attendu = cree(doc, "p", ATTENDU);
  attendu.className = "attendu";
  section.append(titre, attendu);
  if ("sans" in lecture) {
    section.append(lectureIndisponible(doc, lecture.sans, lecture.detail ?? ""));
    return section;
  }
  section.ariaBusy = String(enCours !== undefined);

  const profils = cree(doc, "p");
  profils.className = "profils";
  const dit = cree(doc, "span", PROFILS_DITS.titre);
  dit.className = "nom";
  dit.append(survol(doc, PROFILS_DITS.survol));
  profils.append(
    dit,
    ...NOMS_DES_PROFILS.map((nom) => {
      const pris = enCours !== undefined && "profil" in enCours && enCours.profil === nom;
      const bouton = boutonAction(doc, pris ? EN_COURS : PROFILS[nom].libelle, () => appliquer(nom));
      bouton.className = "action profil";
      bouton.dataset.profil = nom;
      /** @type {any} */
      const clic = bouton.children[0];
      if (clic !== undefined) {
        clic.title = ceQuePose(nom);
        clic.disabled = enCours !== undefined;
      }
      return bouton;
    }),
  );

  const rangees = cree(doc, "div");
  rangees.className = "rangees";
  rangees.append(...lecture.table.rows.map((ligne) => rangeeDe(doc, { ligne, enCours, poser })));

  const fixes = cree(doc, "div");
  fixes.className = "rangees fixes";
  const tete = cree(doc, "p");
  tete.className = "tete-fixes";
  const verrou = cree(doc, "span", VERROUILLEE.libelle);
  verrou.className = "verrou";
  tete.append(cree(doc, "strong", VERROUILLEE.titre), verrou, survol(doc, VERROUILLEE.survol));
  fixes.append(tete, ...lecture.table.fixed.map((ligne) => verrouilleeDe(doc, ligne)));

  section.append(profils, rangees);
  if (refus !== undefined) {
    const rendu = cree(doc, "p");
    rendu.className = "dit refus";
    rendu.append(cree(doc, "span", refus.refus));
    if ((refus.detail ?? "").trim() !== "") rendu.append(survol(doc, refus.detail ?? ""));
    section.append(rendu);
  }
  section.append(fixes);
  return section;
}

const RATEE = "the autonomy table is unavailable";
const NON_ECRIT = "nothing was changed: the answer could not be read";

/** @param {unknown} erreur */
const detailDe = (erreur) => (erreur instanceof Error ? erreur.message : String(erreur));

// Tient la table d'un projet dans `racine` : la lit, la pose, et à chaque clic appelle l'API puis pose ce qu'elle
// rend — la table écrite après le changement. Un seul clic à la fois : pendant qu'il part, rien d'autre ne se clique.
// Rend de quoi la relire (une lecture faite ailleurs : le projet rouvert, la cuisine qui l'a changée).
/** @param {Fabrique} doc @param {{ replaceChildren(...noeuds: any[]): void, hidden: boolean }} racine @param {Api} api */
export function tenirLaTableDAutonomie(doc, racine, api) {
  /** @type {Lecture | undefined} */
  let lecture;
  /** @type {EnCours | undefined} */
  let enCours;
  /** @type {{ refus: string, detail?: string } | undefined} */
  let refus;
  const reposer = () => {
    const pose = poserLaTableDAutonomie(doc, {
      lecture,
      ...(enCours === undefined ? {} : { enCours }),
      ...(refus === undefined ? {} : { refus }),
      poser: (row, position) => void agir({ row, position }, () => api.poserRangee(row, position)),
      appliquer: (profil) => void agir({ profil }, () => api.appliquerProfil(profil)),
    });
    racine.hidden = pose === null;
    racine.replaceChildren(...(pose === null ? [] : [pose]));
  };
  /** @param {EnCours} quoi @param {() => Promise<Rendu>} appel */
  const agir = async (quoi, appel) => {
    if (enCours !== undefined) return;
    enCours = quoi;
    refus = undefined;
    reposer();
    try {
      const rendu = await appel();
      if (rendu !== null && typeof rendu === "object" && "table" in rendu) lecture = { table: rendu.table };
      else if (rendu !== null && typeof rendu === "object" && "refus" in rendu) refus = rendu;
      else refus = { refus: NON_ECRIT };
    } catch (erreur) {
      refus = { refus: NON_ECRIT, detail: detailDe(erreur) };
    }
    enCours = undefined;
    reposer();
  };
  const lire = async () => {
    try {
      lecture = await api.lire();
    } catch (erreur) {
      lecture = { sans: RATEE, detail: detailDe(erreur) };
    }
    reposer();
  };
  return { lire };
}
