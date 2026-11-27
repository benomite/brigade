// Le lexique de l'app : un mot par chose, sur tous les écrans (maquette `docs/maquettes/app/`, section Lexicon de
// Main.dc.html ; épique 2897, ticket 2910). Toute vue qui montre l'un de ces mots l'importe d'ici, et n'en déclare pas de
// copie : `test/lexicon.test.ts` échoue si un mot que le lexique a remplacé revient dans une chaîne d'une vue.

/** L'ordinateur sur lequel l'app tourne (remplace « this machine », « this Mac », « this PC »). */
export const THIS_COMPUTER = "this computer";

/** Renoncer à un geste ouvert (remplace « cancel », « Cancel the cleanup », « no »). */
export const CANCEL = "Cancel";

/** La réponse affirmative d'une confirmation : « Yes, <verbe> » (remplace « yes, launch it », « run it »). */
export const YES = (/** @type {string} */ verbe) => `Yes, ${verbe}`;

/** Un enregistrement en cours (remplace « saving… » ; il n'y a plus de bouton « Save », chaque réglage s'applique au clic). */
export const RECORDING = "Saving…";

/** Retenter après un échec (remplace « Retry »). */
export const RETRY = "Try again";

/** Ajouter un projet (remplace « Add to the app », « Add to the kitchen »). */
export const ADD_ONE_PROJECT = "Add a project";

/** Passer à la nouvelle version (remplace « Install now »). */
export const PUT_A_DAY = "Update now";

/** La passe du closer (remplace « cleanup »). */
export const PASS_OF_CLOSING = "closing pass";

/** Une lecture qui n'a pas abouti : « <quoi> not reached. » (remplace « unavailable », « could not reach »). */
export const NOT_REACHED = (/** @type {string} */ what) => `${what.charAt(0).toUpperCase()}${what.slice(1)} not reached.`;

/** Une ligne qui dit qu'il n'y a rien : « No <chose> yet. » (remplace les fragments « no … yet »). */
export const NOT_STILL = (/** @type {string} */ chose) => `No ${chose} yet.`;

/** Une lecture en cours : « Reading <quoi>… » (remplace « reading … » en minuscule). */
export const READ_OF = (/** @type {string} */ what) => `Reading ${what}…`;

/** Une lecture en cours dont l'objet est dit à côté (remplace « reading… »). */
export const READING = "Reading…";
