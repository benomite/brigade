// @ts-check
// Lancer un nettoyage depuis la partie closer (le ticket 991, épique 986), à la place que section.js lui garde
// (`closer-lancement`) : le bouton qui le lance, la confirmation qui dit ce qu'il coûte et ce que le
// closer va faire — rien ne part sans le « oui » du chef —, puis où en est la demande : en attente, et
// de quoi ; en cours ; refusée, et pourquoi ; ou finie. Tant qu'elle n'est pas partie, un bouton
// l'annule.
//
// Où en est la demande, c'est la lecture de l'onglet qui le dit (`closing --json`, son `request`) :
// l'app ne le tient pas d'elle-même. Ce que ce module tient, c'est le geste en route (`Etat`) — l'aperçu
// lu, la confirmation ouverte, la demande partie, puis la relecture qui la montre. Les gestes partent
// par le process principal (app/src/closer-lancement.ts) : `closing preview`, `closing write
// --confirm`, `closing cancel`, sur la box. Ce module ne touche pas `document` et ne lance rien : il
// reçoit de quoi créer un élément (briques.js) et ce que chaque bouton appelle, et rend des éléments.

import { confirmationDeGeste, survol } from "../../briques.js";

/** @typedef {import("../../briques.js").Fabrique} Fabrique */
/** @typedef {import("../../../closer-lancement.ts").Rendu} Rendu */
/** @typedef {import("../../../closer-lancement.ts").Apercu} Apercu */

// Ce que `closing --json` dit de la dernière demande (runtime/src/fermeture-lecture/lecture.ts), réduit
// à ce que la place pose, et le calibrage du closer, pour le prix au survol du bouton.
/**
 * @typedef {{ code: string, text: string }} Motif
 * @typedef {{ state: "none" }
 *   | { state: "waiting", since: string, stalledAt: string | null, reason: Motif | null, text: string }
 *   | { state: "running", run: string, since: string, candidates: number }
 *   | { state: "refused", at: string, reason: Motif, text: string }
 *   | { state: "cancelled", at: string }
 *   | { state: "done", at: string, delivered: boolean, text: string }} Demande
 * @typedef {{ model: string, effort: string, tokens: number, removedLines: number }} Closer
 */

// Le geste en route, pour un projet.
//   repos      rien n'est en route : la place dit où en est la demande, d'après la lecture
//   apercu     le bouton est cliqué, l'aperçu est demandé à la box
//   confirmer  l'aperçu est là : la confirmation est ouverte, rien n'est parti
//   envoi      le « oui » — ou l'annulation — est parti, la box n'a pas encore répondu
//   relecture  la box a répondu (`dit`) : la place attend la lecture qui le montre
//   refus      le geste n'a rien fait (`dit`, `detail` au survol) : la place reste au repos
/**
 * @typedef {{ etape: "repos" }
 *   | { etape: "apercu" }
 *   | { etape: "confirmer", apercu: Apercu }
 *   | { etape: "envoi", geste: "lancer" | "annuler" }
 *   | { etape: "relecture", dit: string }
 *   | { etape: "refus", dit: string, detail: string }} Etat
 */

export const LANCER = "Launch a cleanup…";
export const ANNULER = "Cancel the cleanup";
export const OUI = "yes, launch it";
export const NON = "no";
export const LIT_L_APERCU = "reading what a cleanup costs…";
export const ENVOI_LANCER = "requesting the cleanup…";
export const ENVOI_ANNULER = "cancelling the cleanup…";
export const RELECTURE = "reading where it stands…";
export const TITRE = "Launch a cleanup?";
export const FERA = "what the closer will do";
export const EN_ATTENTE = "Cleanup requested — waiting";
export const EN_COURS = "Cleanup running";
export const REFUSEE = "Last cleanup refused";
export const FINIE = "Last cleanup finished";
export const SANS_PRIX = "its cost was not read";

/** @type {Etat} */
export const REPOS = { etape: "repos" };

const nombre = (/** @type {number} */ valeur) => valeur.toLocaleString("en-US");
const s = (/** @type {number} */ combien) => (combien > 1 ? "s" : "");
// Un instant de la box, comme la vue les dit ailleurs (vue.js, `quand`).
const quand = (/** @type {string} */ instant) => (Number.isNaN(Date.parse(instant)) ? instant : new Date(instant).toLocaleString("en-US"));

// Une raison du runtime, en une ligne : sa tête, avant le premier « — » ; elle entière va au survol.
const tete = (/** @type {string} */ texte) => texte.split(" — ")[0] ?? texte;

/** @param {Fabrique} doc @param {string} balise @param {string} [texte] */
function cree(doc, balise, texte) {
  const pose = doc.createElement(balise);
  if (texte !== undefined) pose.textContent = texte;
  return pose;
}

// Une ligne d'état : ce qui se lit, et le détail au survol s'il en dit plus. Sa classe, celui qui
// l'appelle la pose en clair (peau.test.ts) : `etat`, et son ton.
/** @param {Fabrique} doc @param {string} ligne @param {string} [detail] */
function etatDit(doc, ligne, detail = "") {
  const pose = cree(doc, "p");
  pose.append(cree(doc, "span", ligne));
  if (detail.trim() !== "" && detail.trim() !== ligne) pose.append(survol(doc, detail));
  return pose;
}

// Ce que coûte un nettoyage, d'après le calibrage du closer : sur le quota du chef.
const prixDuCloser = (/** @type {Closer} */ { model, effort, tokens, removedLines }) =>
  `on your quota: ${model} / ${effort} · ${nombre(tokens)} tokens at most · ${nombre(removedLines)} line${s(removedLines)} removed at most — nothing leaves before your “yes”`;

const ETATS = ["none", "waiting", "running", "refused", "cancelled", "done"];

// Ce que la place lit de l'objet de `closing --json` : la demande et le calibrage du closer — rien,
// sans closer réglé. Un runtime qui ne dit pas la demande la laisse « none » : rien n'y est deviné.
/** @param {unknown} fermeture @returns {{ demande: Demande, closer: Closer } | undefined} */
export function lireLancement(fermeture) {
  if (fermeture === null || typeof fermeture !== "object") return undefined;
  const { configured, closer, request } = /** @type {Record<string, any>} */ (fermeture);
  if (configured !== true || closer === null || typeof closer !== "object") return undefined;
  const lue = request !== null && typeof request === "object" && ETATS.includes(request.state) ? request : { state: "none" };
  return { demande: lue, closer };
}

// --- Ce que la box a rendu -----------------------------------------------------------

// L'étape qui suit la réponse d'un geste. Ce que la demande est devenue se montrera à la relecture :
// l'étape n'en garde que la phrase. Ce qui n'a rien écrit — box pas jointe, impossible — reste un refus.
/** @param {"apercu" | "lancer" | "annuler"} geste @param {Rendu | undefined} rendu @returns {Etat} */
export function apresRendu(geste, rendu) {
  if (rendu === undefined) return { etape: "refus", dit: "nothing was sent: this project has no station", detail: "" };
  if ("refus" in rendu) return { etape: "refus", dit: rendu.refus, detail: rendu.detail };
  if ("apercu" in rendu) return geste === "apercu" ? { etape: "confirmer", apercu: rendu.apercu } : REPOS;
  if ("demandee" in rendu) {
    const { outcome, text } = rendu.demandee;
    if (outcome === "impossible" || outcome === "unconfirmed") return { etape: "refus", dit: `the cleanup was not requested — ${tete(text)}`, detail: text };
    return { etape: "relecture", dit: outcome === "refused" ? "the cleanup was refused" : outcome === "already-requested" ? "a cleanup was already requested" : "the cleanup is requested" };
  }
  const { outcome } = rendu.retiree;
  return { etape: "relecture", dit: outcome === "cancelled" ? "the cleanup is cancelled" : outcome === "none" ? "no cleanup was requested" : "the cleanup has already left: it cannot be cancelled" };
}

// --- La confirmation ---------------------------------------------------------------

// Ce que deviendrait la demande, faite maintenant : ce qui ne la ferait pas partir n'a pas de « oui ».
const sansOui = (/** @type {Apercu["ifRequested"]["outcome"]} */ issue) => issue === "refused" || issue === "impossible" || issue === "already-requested";

// La confirmation : la brique commune — ce que le geste fait, son prix en une ligne, le « oui » et le
// « non » —, et entre les deux ce que le closer va faire, puis ce que deviendrait la demande.
/** @param {Fabrique} doc @param {Apercu} apercu @param {{ oui: () => void, non: () => void }} gestes */
function confirmation(doc, apercu, gestes) {
  const racine = confirmationDeGeste(doc, { titre: TITRE, prix: apercu.cost?.text.replaceAll("`", "") ?? SANS_PRIX, oui: OUI, non: NON }, gestes);
  const enfants = [...racine.children];
  const [accepter, renoncer, avant] = [enfants.at(-2), enfants.at(-1), enfants.at(-3)];
  const fera = cree(doc, "div");
  fera.className = "fera";
  const quoi = cree(doc, "p", FERA);
  quoi.className = "quoi";
  const liste = cree(doc, "ul");
  liste.append(...apercu.does.map((phrase) => cree(doc, "li", phrase)));
  fera.append(quoi, liste);
  const { outcome, text } = apercu.ifRequested;
  const ferme = !apercu.configured || sansOui(outcome);
  const maintenant = etatDit(doc, tete(text), text);
  if (ferme) maintenant.className = "maintenant ferme";
  else maintenant.className = "maintenant";
  avant.after(fera, maintenant);
  if (ferme) accepter.disabled = true;
  // Les deux réponses, côte à côte, sous ce qu'elles engagent.
  const reponses = cree(doc, "div");
  reponses.className = "reponses";
  reponses.append(accepter, renoncer);
  racine.append(reponses);
  return racine;
}

// --- La place ----------------------------------------------------------------------

/**
 * @typedef {object} Gestes
 * @property {() => void} lancer  le bouton est cliqué : l'aperçu est demandé
 * @property {() => void} confirmer  le « oui » du chef : la demande part
 * @property {() => void} renoncer  le « non » : rien ne part
 * @property {() => void} annuler  la demande qui attend est retirée
 */

/** @param {Fabrique} doc @param {Closer} closer @param {() => void} lancer @param {boolean} [enRoute] */
function boutonLancer(doc, closer, lancer, enRoute = false) {
  const groupe = cree(doc, "span");
  groupe.className = "action";
  const bouton = cree(doc, "button", LANCER);
  bouton.type = "button";
  bouton.className = "recommande";
  bouton.disabled = enRoute;
  bouton.addEventListener("click", () => {
    if (!bouton.disabled) lancer();
  });
  groupe.append(bouton, survol(doc, prixDuCloser(closer)));
  return groupe;
}

/** @param {Fabrique} doc @param {() => void} annuler */
function boutonAnnuler(doc, annuler) {
  const bouton = cree(doc, "button", ANNULER);
  bouton.type = "button";
  bouton.className = "annuler";
  bouton.addEventListener("click", annuler);
  return bouton;
}

// Où en est la dernière demande, d'après la lecture : sa ligne, et ce qui s'y fait. Annulée, elle
// laisse la place comme si rien n'avait été demandé.
/** @param {Fabrique} doc @param {Demande} demande @param {Closer} closer @param {Gestes} gestes @returns {any[]} */
function selonLaDemande(doc, demande, closer, gestes) {
  const lancer = () => [boutonLancer(doc, closer, gestes.lancer)];
  switch (demande.state) {
    case "waiting": {
      const pourquoi = demande.reason === null ? "it leaves at the runtime's next wake-up, within the second" : tete(demande.reason.text);
      const coince = demande.stalledAt === null ? "" : ` — stuck since ${quand(demande.stalledAt)}`;
      const ligne = etatDit(doc, `${EN_ATTENTE}: ${pourquoi}${coince}`, `requested on ${quand(demande.since)} — ${demande.reason?.text ?? "nothing holds it back"}`);
      ligne.className = "etat retenue";
      return [ligne, boutonAnnuler(doc, gestes.annuler)];
    }
    case "running": {
      const ligne = etatDit(doc, `${EN_COURS} — since ${quand(demande.since)}`, `run ${demande.run} · ${demande.candidates} candidate${s(demande.candidates)} · it merges nothing: what it removes arrives through a PR`);
      ligne.className = "etat cours";
      return [ligne];
    }
    case "refused": {
      const ligne = etatDit(doc, `${REFUSEE} on ${quand(demande.at)}: ${tete(demande.reason.text)}`, demande.reason.text);
      ligne.className = "etat refusee";
      return [ligne, ...lancer()];
    }
    case "done": {
      const ligne = etatDit(doc, `${FINIE} on ${quand(demande.at)}`, demande.text);
      ligne.className = "etat finie";
      return [ligne, ...lancer()];
    }
    case "none":
    case "cancelled":
      return lancer();
  }
}

// La place entière : ce qui s'y pose pour ce geste en route, d'après cette lecture.
/** @param {Fabrique} doc @param {{ demande: Demande, closer: Closer }} lu @param {Etat} etat @param {Gestes} gestes @returns {any[]} */
export function poserLancement(doc, { demande, closer }, etat, gestes) {
  // Un geste en route : une ligne discrète, qui dit ce qui se fait.
  const enRoute = (/** @type {string} */ ligne) => {
    const pose = etatDit(doc, ligne);
    pose.className = "etat sans";
    return pose;
  };
  switch (etat.etape) {
    case "apercu":
      return [boutonLancer(doc, closer, gestes.lancer, true), enRoute(LIT_L_APERCU)];
    case "confirmer":
      return [confirmation(doc, etat.apercu, { oui: gestes.confirmer, non: gestes.renoncer })];
    case "envoi":
      return [enRoute(etat.geste === "lancer" ? ENVOI_LANCER : ENVOI_ANNULER)];
    case "relecture":
      return [enRoute(`${etat.dit} — ${RELECTURE}`)];
    case "refus": {
      const refus = etatDit(doc, etat.dit, etat.detail);
      refus.className = "etat indisponible";
      return [...selonLaDemande(doc, demande, closer, gestes), refus];
    }
    case "repos":
      return selonLaDemande(doc, demande, closer, gestes);
  }
}
