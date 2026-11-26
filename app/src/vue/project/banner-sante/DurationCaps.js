// @ts-check
// Les plafonds de durée, sur Kitchen > Health (ticket 2490, épique 2484) : au-delà, la cuisine signale la dérive. Le
// seuil du temps perdu par ticket (ticket 2670, `lostTimeMaxMin`), tel que la station le publie, puis les seuils `drift.*` que le dépôt du projet
// déclare (`.claude/brigade/projet.json`) — les durées en tête, les autres repliés derrière une ligne. Chaque seuil est
// une rangée de réglage (composants/setting, ticket 2920) : son nom, sa valeur en vigueur et d'où elle vient, son champ,
// qui s'applique dès qu'il change — pas de « save ». Gardé dans le dépôt, un seuil changé s'y propose par une pull
// request (caps-duree.ts), et sa rangée le dit ; la valeur montrée reste celle en vigueur jusqu'au merge. Vide, le
// seuil se propose retiré. Le seuil du temps perdu ne se change pas encore d'ici : sa rangée le dit, la raison au
// survol. Ce module ne touche pas `document` : il reçoit de quoi créer un élément.

import { replie, survol } from "../../briques.js";
import { lineError } from "../../composants/line-error/line-error.js";
import { ditDuSetting, rangeeDeSetting } from "../../composants/setting/setting.js";
import { READ_DE } from "../../lexique.js";

/** @typedef {import("../../briques.js").Fabrique} Fabrique */
/** @typedef {import("../../../caps-duree.ts").CapLu} Cap */
/** @typedef {import("../../../caps-duree.ts").ReadDesCaps} Read */
/** @typedef {import("../../../closer-sante.ts").Calibration} Calibration */
// Ce que le dernier changement a rendu : la PR ouverte et la valeur qu'elle propose (null : le retrait), la valeur déjà
// là, ou le refus.
/** @typedef {{ pr: string, numero: number, valeur: number | Calibration | null } | { fait: string } | { refus: string, detail?: string }} DitDuChangement */
// L'état d'un plafond entre deux poses : ce que le chef a tapé sans l'avoir appliqué, le changement en cours, ce qu'il a rendu.
/** @typedef {{ choisi?: string, enCours?: boolean, dit?: DitDuChangement }} State */

export const TITRE = "Duration caps";
export const AIDE =
  "Above a cap, the kitchen flags the drift. Kept in the project's repository (.claude/brigade/projet.json): a change here opens a pull request on its integration branch, and the station applies it once merged, at its next fetch. Empty, the cap's removal is proposed.";
export const EN_COURS = "opening the pull request…";
export const PERDU_MAX = { nom: "Lost time per ticket", source: "median of recent tickets, published by the station", fige: "not editable here yet" };
export const PERDU_MAX_POURQUOI =
  "The station caps the median lost time of recent tickets (waiting for the manager's judgement, waiting for a claim, failed cooks, send-backs) with lostTimeMaxMin, read from its own clone of projet.json, outside the drift thresholds this block changes: it cannot be changed from the app yet. A ticket's total time has no cap, its size varies.";
export const AUTRES = "Other drift thresholds";

/** @param {Fabrique} doc @param {string} balise @param {string} [texte] */
function cree(doc, balise, texte) {
  const pose = doc.createElement(balise);
  if (texte !== undefined) pose.textContent = texte;
  return pose;
}

/** @param {number} valeur @param {string} unite */
const avecUnite = (valeur, unite) => `${valeur.toLocaleString("en-US")} ${unite}`;

// Ce que le champ propose, et s'il change la valeur du dépôt : vide, c'est retirer une valeur posée.
/** @param {Cap} cap @param {string | undefined} choisi */
export function changeLaValeur(cap, choisi) {
  if (choisi === undefined) return false;
  const tape = choisi.trim();
  if (tape === "") return cap.valeur !== null;
  return Number(tape) !== cap.valeur;
}

// Ce que la rangée dit sous son champ : le changement en cours, puis ce qu'il a rendu — la PR ouverte se dit avec la
// valeur qu'elle propose, `dire` la met en mots.
/**
 * @param {Fabrique} doc @param {State | undefined} state @param {(valeur: any) => string} tell
 * @param {((url: string) => void) | undefined} ouvrir
 */
export function ditDuCap(doc, state, tell, ouvrir) {
  if (state?.enCours === true) return ditDuSetting(doc, { enCours: EN_COURS });
  const dit = state?.dit;
  if (dit !== undefined && "pr" in dit) return ditDuSetting(doc, { pr: dit.pr, numero: dit.numero, valeur: dit.valeur === null ? "removal" : tell(dit.valeur) }, ouvrir === undefined ? {} : { ouvrir });
  return ditDuSetting(doc, dit);
}

// La rangée d'un plafond : son nom, sa valeur en vigueur et d'où elle vient, son champ, puis ce que le dernier changement
// a rendu. Le champ s'applique à son `change` — quitté ou validé par Entrée — quand il change la valeur du dépôt.
// `choisir` garde ce que le chef tape — sans reposer la page : il est en train d'écrire.
/**
 * @param {Fabrique} doc
 * @param {{ plafond: Cap, etat: State | undefined, choisir: (choisi: string) => void, changer: (saisie: string) => void, ouvrir?: (url: string) => void }} options
 */
export function poserUnCap(doc, { plafond: cap, etat: state, choisir, changer, ouvrir }) {
  const dite = cree(doc, "strong", cap.valeur === null ? "not set" : avecUnite(cap.valeur, cap.unite));
  dite.className = "mono";
  const source = cree(doc, "small", cap.valeur !== null ? "in the repository" : cap.defaut === null ? "the station's, if any" : `the station's, or ${avecUnite(cap.defaut, cap.unite)}`);
  source.className = "source";

  const occupe = state?.enCours === true;
  const saisie = cree(doc, "input");
  saisie.type = "text";
  saisie.inputMode = cap.entier ? "numeric" : "decimal";
  saisie.ariaLabel = `${cap.nom}, in ${cap.unite}`;
  saisie.spellcheck = false;
  saisie.placeholder = cap.defaut === null ? "—" : String(cap.defaut);
  saisie.value = state?.choisi ?? (cap.valeur === null ? "" : String(cap.valeur));
  saisie.disabled = occupe;
  saisie.addEventListener("input", () => choisir(saisie.value));
  saisie.addEventListener("change", () => {
    if (!occupe && changeLaValeur(cap, saisie.value)) changer(saisie.value.trim());
  });
  const unite = cree(doc, "span", cap.unite);
  unite.className = "unite";
  return rangeeDeSetting(doc, {
    nom: cap.nom,
    cle: cap.cle,
    valeur: [dite, source],
    controle: [saisie, unite],
    depot: true,
    dessous: ditDuCap(doc, state, (valeur) => avecUnite(valeur, cap.unite), ouvrir),
  });
}

// La rangée du seuil du temps perdu par ticket : sa valeur, telle que la station la publie, sans champ.
/** @param {Fabrique} doc @param {number | undefined} lostTimeMaxMin */
function poserLePerduMax(doc, lostTimeMaxMin) {
  const dite = cree(doc, "strong", lostTimeMaxMin === undefined ? "not known yet" : `${lostTimeMaxMin} min`);
  dite.className = "mono";
  const source = cree(doc, "small", lostTimeMaxMin === undefined ? "the station does not publish it yet" : PERDU_MAX.source);
  source.className = "source";
  const fige = cree(doc, "span", PERDU_MAX.fige);
  fige.className = "fige";
  return rangeeDeSetting(doc, { nom: PERDU_MAX.nom, cle: "lostTimeMaxMin", valeur: [dite, source], controle: [fige, survol(doc, PERDU_MAX_POURQUOI)], depot: false });
}

// Le bloc : le seuil du temps perdu par ticket, puis les plafonds du dépôt — tant qu'ils ne sont pas lus, une ligne le dit ;
// une lecture ratée tient en une ligne, son détail au survol.
/**
 * @param {Fabrique} doc
 * @param {{ lecture?: Read, lostTimeMaxMin?: number, etats?: ReadonlyMap<string, State>, autresOuverts?: boolean, basculerAutres?: (ouvert: boolean) => void, choisir?: (cle: string, choisi: string) => void, changer?: (cle: string, saisie: string) => void, ouvrir?: (url: string) => void }} [options]
 */
export function poserBlocCapsDuree(doc, { lecture: read, lostTimeMaxMin, etats: states = new Map(), autresOuverts = false, basculerAutres, choisir = () => {}, changer = () => {}, ouvrir = () => {} } = {}) {
  const bloc = doc.createElement("section");
  bloc.className = "bloc-du-projet";
  bloc.dataset.bloc = "plafonds-duree";
  bloc.ariaLabel = TITRE;
  const titre = doc.createElement("h3");
  titre.textContent = TITRE;
  titre.append(survol(doc, AIDE));
  bloc.append(titre, poserLePerduMax(doc, lostTimeMaxMin));
  if (read === undefined) {
    const wait = cree(doc, "p", READ_DE("the caps of the repository"));
    wait.className = "plafonds-lecture";
    bloc.append(wait);
    return bloc;
  }
  if ("sans" in read) {
    bloc.append(lineError(doc, read.sans, read.detail ?? ""));
    return bloc;
  }
  /** @param {Cap} cap */
  const line = (cap) => poserUnCap(doc, { plafond: cap, etat: states.get(cap.cle), choisir: (choisi) => choisir(cap.cle, choisi), changer: (saisie) => changer(cap.cle, saisie), ouvrir });
  const autres = read.plafonds.filter(({ duree }) => !duree);
  const poses = autres.filter(({ valeur }) => valeur !== null).length;
  bloc.append(
    ...read.plafonds.filter(({ duree }) => duree).map(line),
    replie(doc, { titre: AUTRES, resume: poses === 0 ? "none set in the repository" : `${poses} set in the repository`, ouvert: autresOuverts, ...(basculerAutres === undefined ? {} : { basculer: basculerAutres }) }, autres.map(line)),
  );
  return bloc;
}
