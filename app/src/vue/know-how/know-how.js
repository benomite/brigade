// @ts-check
// The project know-how, a section of Settings (#4239, epic #4135): the entries of `.brigade/know-how.md` of the project's
// repository — the lessons its cooks keep for the next ones (agents/cook.md) —, grouped by section, `Conventions`,
// `Pitfalls`, `Tools` first, each with its source ticket. The chef edits the text of an entry or removes it: the change
// is proposed by a pull request on the integration branch (know-how-github.ts), which the pass reviews, and the list
// keeps what is in force until it is merged. A missing file, or one without an entry, says so in one line.
// The section is held by `tenirLeSavoir`: it reads the file when shown — at most once a minute —, keeps what the chef
// types, and is drawn again after each gesture. This module does not touch `document`: it receives what creates an element.

import { survol } from "../briques.js";
import { bouton } from "../composants/bouton/bouton.js";
import { ligneErreur } from "../composants/ligne-erreur/ligne-erreur.js";
import { ligneVide } from "../composants/ligne-vide/ligne-vide.js";
import { ditDuReglage } from "../composants/reglage/reglage.js";
import { LECTURE_DE, NON_ATTEINT, PAS_ENCORE } from "../lexique.js";

/** @typedef {import("../briques.js").Fabrique} Fabrique */
/** @typedef {import("./know-how-github.ts").LectureDuSavoir} Lecture */
/** @typedef {import("./know-how-github.ts").ChangementDuSavoir} Changement */
/** @typedef {import("./know-how-github.ts").RenduDuSavoir} Rendu */
/** @typedef {import("../../../../runtime/src/know-how/know-how.ts").KnowHowEntry} Entree */
// What the screen holds of one entry, by its line: the text being typed (an edit open), the change on its way, what the
// last one returned.
/** @typedef {{ edition?: string, enCours?: "edit" | "remove", dit?: { pr: string, numero: number, kind: "edit" | "remove" } | { refus: string, detail?: string } }} Etat */

const TITRE = "Project know-how";
const AIDE =
  "The lessons the cooks keep for the next ones, in .brigade/know-how.md of the project's repository. Editing or removing an entry opens a pull request on its integration branch, which the pass reviews; the list changes once it is merged.";
const VIDE = `${PAS_ENCORE("project know-how")} .brigade/know-how.md is missing or has no entry.`;
const NON_LU = NON_ATTEINT("the project know-how");
const VIDE_DETAIL = "Cooks add an entry, - text (#ticket), under Conventions, Pitfalls or Tools, in the pull request of the ticket that taught it.";
const SANS_TICKET = "no source ticket";
const HORS_SECTION = "Outside any section";
const EN_COURS = "opening the pull request…";
const EDITION = "Enter proposes the new text, Escape cancels";
// The sections of the file, in its order: the three it is made of, then any other the file has, in its order.
const SECTIONS = ["Conventions", "Pitfalls", "Tools"];

/** @param {Fabrique} doc @param {string} balise @param {string} [texte] */
function cree(doc, balise, texte) {
  const pose = doc.createElement(balise);
  if (texte !== undefined) pose.textContent = texte;
  return pose;
}

// The entries by section, the file's three sections first.
/** @param {readonly Entree[]} entrees @returns {[string, Entree[]][]} */
function parSection(entrees) {
  /** @type {Map<string, Entree[]>} */
  const groupes = new Map();
  for (const entree of entrees) groupes.set(entree.section, [...(groupes.get(entree.section) ?? []), entree]);
  const rang = (/** @type {string} */ section) => (SECTIONS.includes(section) ? SECTIONS.indexOf(section) : SECTIONS.length);
  return [...groupes].sort(([a], [b]) => rang(a) - rang(b));
}

// What the last change of an entry says under it: on its way, the pull request opened, or the refusal.
/** @param {Fabrique} doc @param {Etat | undefined} etat @param {(url: string) => void} ouvrir */
function ditDeLEntree(doc, etat, ouvrir) {
  if (etat?.enCours !== undefined) return ditDuReglage(doc, { enCours: EN_COURS });
  const dit = etat?.dit;
  if (dit !== undefined && "pr" in dit) return ditDuReglage(doc, { pr: dit.pr, numero: dit.numero, valeur: dit.kind === "edit" ? "the new text" : "the removal" }, { ouvrir });
  return ditDuReglage(doc, dit);
}

// One entry: its text and its source ticket, then Edit and Remove — or, its edit open, the field holding its text.
/**
 * @param {Fabrique} doc @param {Entree} entree @param {Etat | undefined} etat
 * @param {{ editer: (entree: Entree) => void, taper: (entree: Entree, texte: string) => void, annuler: (entree: Entree) => void, changer: (changement: Changement) => void, ouvrir: (url: string) => void }} gestes
 */
function poserLEntree(doc, entree, etat, { editer, taper, annuler, changer, ouvrir }) {
  const item = cree(doc, "li");
  item.className = "entree-du-savoir";
  item.dataset.ligne = String(entree.line);
  const occupe = etat?.enCours !== undefined;
  const ticket = cree(doc, "span", entree.ticket === null ? SANS_TICKET : `#${entree.ticket}`);
  ticket.className = entree.ticket === null ? "ticket sans" : "ticket mono";
  const gestes = cree(doc, "span");
  gestes.className = "gestes";
  if (etat?.edition !== undefined) {
    // No Save button (#2920): the field applies on its `change` — Enter, or leaving it — when its text is a new one; the
    // text left as it was, or emptied, closes it; Escape closes it.
    const champ = cree(doc, "input");
    champ.type = "text";
    champ.ariaLabel = `new text of the entry${entree.ticket === null ? "" : ` from #${entree.ticket}`}`;
    champ.title = EDITION;
    champ.spellcheck = false;
    champ.value = etat.edition;
    champ.disabled = occupe;
    champ.addEventListener("input", () => taper(entree, champ.value));
    champ.addEventListener("change", () => {
      const texte = champ.value.trim();
      if (texte === "" || texte === entree.text) annuler(entree);
      else changer({ kind: "edit", line: entree.line, text: texte, avant: entree.text });
    });
    champ.addEventListener("keydown", (/** @type {KeyboardEvent} */ evenement) => {
      if (evenement.key === "Escape") annuler(entree);
    });
    item.append(champ, ticket, gestes);
  } else {
    const modifier = bouton(doc, "Edit", () => editer(entree), { sorte: "discret" });
    modifier.className = "editer";
    modifier.disabled = occupe;
    const retirer = bouton(
      doc,
      "Remove",
      () => {
        if (!occupe) changer({ kind: "remove", line: entree.line, avant: entree.text });
      },
      { sorte: "discret" },
    );
    retirer.className = "retirer";
    retirer.disabled = occupe;
    gestes.append(modifier, retirer);
    item.append(cree(doc, "span", entree.text), ticket, gestes);
  }
  const dessous = ditDeLEntree(doc, etat, ouvrir);
  if (dessous.length === 0) return item;
  const sous = cree(doc, "div");
  sous.className = "sous";
  sous.append(...dessous);
  item.append(sous);
  return item;
}

// The section: its title, then — while unread, a line; unreadable, the error line; empty, the empty line — the entries by
// section of the file.
/**
 * @param {Fabrique} doc
 * @param {{ lecture?: Lecture, etats?: ReadonlyMap<number, Etat>, editer?: (entree: Entree) => void, taper?: (entree: Entree, texte: string) => void, annuler?: (entree: Entree) => void, changer?: (changement: Changement) => void, ouvrir?: (url: string) => void }} [options]
 */
function poserBlocSavoir(doc, { lecture, etats = new Map(), editer = () => {}, taper = () => {}, annuler = () => {}, changer = () => {}, ouvrir = () => {} } = {}) {
  const bloc = cree(doc, "section");
  bloc.className = "bloc-du-projet";
  bloc.dataset.bloc = "know-how";
  bloc.ariaLabel = TITRE;
  const titre = cree(doc, "h3", TITRE);
  titre.append(survol(doc, AIDE));
  bloc.append(titre);
  if (lecture === undefined) {
    bloc.append(cree(doc, "p", LECTURE_DE("the project know-how")));
    return bloc;
  }
  if ("sans" in lecture) {
    bloc.append(ligneErreur(doc, lecture.sans, lecture.detail ?? ""));
    return bloc;
  }
  if (lecture.vide) {
    bloc.append(ligneVide(doc, VIDE, { classe: "savoir-vide", detail: VIDE_DETAIL }));
    return bloc;
  }
  for (const [section, entrees] of parSection(lecture.entries)) {
    const partie = cree(doc, "div");
    partie.className = "section-du-savoir";
    partie.dataset.section = section;
    const tete = cree(doc, "h4", section === "" ? HORS_SECTION : section);
    const compte = cree(doc, "small", String(entrees.length));
    compte.className = "compte";
    tete.append(compte);
    const liste = cree(doc, "ul");
    liste.append(...entrees.map((entree) => poserLEntree(doc, entree, etats.get(entree.line), { editer, taper, annuler, changer, ouvrir })));
    partie.append(tete, liste);
    bloc.append(partie);
  }
  return bloc;
}

// The section of one project, held between two drawings: its reading, the state of each entry. `lire` and `changer` go
// to the main process (main.ts, `savoirDuProjet`, `changerLeSavoir`); `reposer` draws Settings again — after a reading,
// `garder`: not under a field the chef is typing in.
/**
 * @param {Fabrique} doc
 * @param {{ lire: () => Promise<Lecture | undefined>, changer: (changement: Changement) => Promise<Rendu | undefined>, ouvrir: (url: string) => void, reposer: (garder?: boolean) => void, maintenant?: () => number }} options
 */
export function tenirLeSavoir(doc, { lire, changer, ouvrir, reposer, maintenant = Date.now }) {
  /** @type {Lecture | undefined} */
  let lecture;
  let luLe = -Infinity;
  let enLecture = false;
  /** @type {Map<number, Etat>} */
  const etats = new Map();

  const relire = () => {
    if (enLecture) return;
    enLecture = true;
    luLe = maintenant();
    void Promise.resolve()
      .then(lire)
      .then(
        (lue) => lue ?? { sans: NON_LU, detail: "the app gave no reading" },
        (/** @type {unknown} */ erreur) => ({ sans: NON_LU, detail: erreur instanceof Error ? erreur.message : String(erreur) }),
      )
      .then((lue) => {
        enLecture = false;
        // A reading moves the lines: what was said of the old ones no longer names them.
        if (JSON.stringify(lue) !== JSON.stringify(lecture)) for (const [ligne, etat] of etats) if (etat.enCours === undefined) etats.delete(ligne);
        lecture = lue;
        reposer(true);
      });
  };

  /** @param {Changement} changement */
  const proposer = async (changement) => {
    if (etats.get(changement.line)?.enCours !== undefined) return;
    etats.set(changement.line, { ...etats.get(changement.line), enCours: changement.kind, dit: undefined });
    reposer();
    /** @type {Rendu} */
    let rendu;
    try {
      rendu = (await changer(changement)) ?? { refus: "nothing was proposed: nothing was sent" };
    } catch (erreur) {
      rendu = { refus: "nothing was proposed: nothing was sent", detail: erreur instanceof Error ? erreur.message : String(erreur) };
    }
    if ("pr" in rendu) etats.set(changement.line, { dit: { pr: rendu.pr, numero: rendu.numero, kind: rendu.kind } });
    else etats.set(changement.line, { ...etats.get(changement.line), enCours: undefined, dit: rendu });
    reposer();
  };

  return {
    poser() {
      if (maintenant() - luLe > 60_000) relire();
      return poserBlocSavoir(doc, {
        ...(lecture === undefined ? {} : { lecture }),
        etats,
        editer: (entree) => {
          etats.set(entree.line, { edition: entree.text });
          reposer();
        },
        taper: (entree, texte) => void etats.set(entree.line, { ...etats.get(entree.line), edition: texte }),
        annuler: (entree) => {
          etats.delete(entree.line);
          reposer();
        },
        changer: (changement) => void proposer(changement),
        ouvrir,
      });
    },
  };
}
