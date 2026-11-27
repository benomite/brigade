// Le lexique de l'app : un mot par chose, sur tous les écrans (maquette `docs/maquettes/app/`, section Lexicon de
// Main.dc.html ; épique 2897, ticket 2910). Toute vue qui montre l'un de ces mots l'importe d'ici, et n'en déclare pas de
// copie : `test/lexique.test.ts` échoue si un mot que le lexique a remplacé revient dans une chaîne d'une vue.

/** L'ordinateur sur lequel l'app tourne (remplace « this machine », « this Mac », « this PC »). */
export const CET_ORDINATEUR = "this computer";

/** Renoncer à un geste ouvert (remplace « cancel », « Cancel the cleanup », « no »). */
export const ANNULER = "Cancel";

/** La réponse affirmative d'une confirmation : « Yes, <verbe> » (remplace « yes, launch it », « run it »). */
export const OUI = (/** @type {string} */ verbe) => `Yes, ${verbe}`;

/** Un enregistrement en cours (remplace « saving… » ; il n'y a plus de bouton « Save », chaque réglage s'applique au clic). */
export const ENREGISTREMENT = "Saving…";

/** Retenter après un échec (remplace « Retry »). */
export const REESSAYER = "Try again";

/** Ajouter un projet (remplace « Add to the app », « Add to the kitchen »). */
export const AJOUTER_UN_PROJET = "Add a project";

/** Passer à la nouvelle version (remplace « Install now »). */
export const METTRE_A_JOUR = "Update now";

/** La passe du closer (remplace « cleanup »). */
export const PASSE_DE_FERMETURE = "closing pass";

/** Une lecture qui n'a pas abouti : « <quoi> not reached. » (remplace « unavailable », « could not reach »). */
export const NON_ATTEINT = (/** @type {string} */ quoi) => `${quoi.charAt(0).toUpperCase()}${quoi.slice(1)} not reached.`;

/** Une ligne qui dit qu'il n'y a rien : « No <chose> yet. » (remplace les fragments « no … yet »). */
export const PAS_ENCORE = (/** @type {string} */ chose) => `No ${chose} yet.`;

/** Une lecture en cours : « Reading <quoi>… » (remplace « reading … » en minuscule). */
export const LECTURE_DE = (/** @type {string} */ quoi) => `Reading ${quoi}…`;

/** Une lecture en cours dont l'objet est dit à côté (remplace « reading… »). */
export const LECTURE = "Reading…";
