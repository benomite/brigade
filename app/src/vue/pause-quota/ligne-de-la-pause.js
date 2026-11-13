// @ts-check
// La pause de quota GitHub du compte, à l'écran (ticket 3482) : ce n'est jamais une panne. Elle se dit une fois pour tout le
// compte, en tête de l'app — au-dessus de l'accueil comme d'un projet, au bureau comme sur le téléphone —, d'une couleur
// calme, avec une horloge : quelle limite, la reprise et dans combien de temps, et qu'il n'y a rien à faire. Le compte à
// rebours bouge, et la ligne tombe d'elle-même à la reprise. Chaque projet dit seulement qu'il est en pause pour la même
// raison : ni FAULT, ni « offline », ni « Start the station » — sauf la panne qui ne vient pas de la pause (aucune station ne
// le sert, ou la sienne est vraiment arrêtée), qui garde sa ligne et son geste.
// La pause vient de `facts` (`pauseQuota`, pause-quota.ts) ; ce module ne touche ni `document` ni l'horloge : il reçoit une
// fabrique, l'élément de tête et l'instant.

/** @typedef {import("../briques.js").Fabrique} Fabrique */
/** @typedef {import("./pause-quota.ts").PauseDuCompte} PauseDuCompte */

// Chaque limite, en clair.
/** @type {Record<string, string>} */
export const LIMITES = {
  core: "Paused: GitHub quota of the account reached (its core quota).",
  ecriture: "Paused: GitHub's write limit reached for the account.",
};
export const RIEN_A_FAIRE = "Nothing to do.";
export const REPRISE_INCONNUE = "When it resumes is not known yet.";
// Ce que chaque projet en dit : la même raison, sans la redire.
export const MEME_RAISON = "for the same reason: GitHub quota of the account";
export const PROJET_EN_PAUSE = `Paused ${MEME_RAISON}.`;
// Les pannes que la pause n'explique pas : aucune station ne sert le projet, ou la sienne est vraiment arrêtée.
export const PANNES_HORS_PAUSE = ["aucune-station", "arretee"];

// L'heure, comme le reste de l'app (vue.js, `heureCourte`).
/** @param {string} instant */
const heure = (instant) => new Date(instant).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

// Dans combien de temps : « in 42 s », « in 7 min », « in 1 h 05 ».
/** @param {number} ms */
export function dansCombien(ms) {
  const secondes = Math.max(1, Math.ceil(ms / 1000));
  if (secondes < 60) return `in ${secondes} s`;
  const minutes = Math.ceil(secondes / 60);
  if (minutes < 60) return `in ${minutes} min`;
  return `in ${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")}`;
}

// La pause tient-elle encore à cet instant : sa reprise est à venir, ou elle n'est pas sue.
/** @param {PauseDuCompte | undefined} pause @param {number} maintenant @returns {pause is PauseDuCompte} */
export const enCours = (pause, maintenant) => pause !== undefined && (pause.jusqua === null || Date.parse(pause.jusqua) > maintenant);

// La pause du compte, d'après celles que les projets portent : chacun la lit des mêmes stations, la dernière reprise
// l'emporte ; une reprise inconnue la rend inconnue.
/** @param {readonly (PauseDuCompte | undefined)[]} pauses @param {number} maintenant @returns {PauseDuCompte | undefined} */
export function pauseDesProjets(pauses, maintenant) {
  const tenues = pauses.filter(/** @returns {p is PauseDuCompte} */ (p) => enCours(p, maintenant));
  const inconnue = tenues.find(({ jusqua }) => jusqua === null);
  if (inconnue !== undefined) return inconnue;
  return [...tenues].sort((a, b) => Date.parse(b.jusqua ?? "") - Date.parse(a.jusqua ?? ""))[0];
}

// Ce que la ligne dit : la limite, puis la reprise et rien à faire.
/** @param {PauseDuCompte} pause @param {number} maintenant */
export function phrasesDeLaPause({ limite, jusqua }, maintenant) {
  const reprise = jusqua === null ? REPRISE_INCONNUE : `Resumes at ${heure(jusqua)} (${dansCombien(Date.parse(jusqua) - maintenant)}).`;
  return { titre: LIMITES[limite] ?? LIMITES.core, reprise, rien: RIEN_A_FAIRE };
}

// L'horloge : un cadran dessiné en CSS (pause-quota.css), aucune police n'y est pour rien.
/** @param {Fabrique} doc */
function horloge(doc) {
  const cadran = doc.createElement("span");
  cadran.className = "horloge";
  cadran.ariaHidden = "true";
  return cadran;
}

// La ligne de tête, posée dans `element` : `suivre` lui donne la pause du compte à chaque lecture. Tant qu'elle tient, son
// compte à rebours bouge à chaque `battre` ; à la reprise, elle se retire et `auRetour` est appelé — le projet affiché se
// redessine sans sa ligne de pause.
/** @param {HTMLElement} element @param {Fabrique} doc @param {{ maintenant(): number, auRetour(): void }} options */
export function tenirLaPause(element, doc, options) {
  /** @type {PauseDuCompte | undefined} */
  let pause;
  /** @type {HTMLElement | undefined} */
  let reprise;
  const poser = () => {
    const maintenant = options.maintenant();
    if (!enCours(pause, maintenant)) {
      const etait = pause !== undefined;
      pause = undefined;
      reprise = undefined;
      element.hidden = true;
      element.replaceChildren();
      if (etait) options.auRetour();
      return;
    }
    const { titre, reprise: quand, rien } = phrasesDeLaPause(pause, maintenant);
    if (reprise === undefined) {
      const ligne = doc.createElement("p");
      ligne.className = "bandeau-pause";
      ligne.role = "status";
      const fort = doc.createElement("strong");
      fort.textContent = titre;
      const calme = doc.createElement("span");
      calme.className = "rien-a-faire";
      calme.textContent = rien;
      /** @type {HTMLElement} */
      const ecrite = doc.createElement("span");
      ecrite.className = "reprise";
      reprise = ecrite;
      // Le texte coule d'un bloc à côté de l'horloge : sur un téléphone, il passe à la ligne sous lui-même.
      const texte = doc.createElement("span");
      texte.className = "texte";
      texte.append(fort, " ", ecrite, " ", calme);
      ligne.append(horloge(doc), texte);
      element.replaceChildren(ligne);
      element.hidden = false;
    }
    reprise.textContent = quand;
  };
  return {
    /** @param {PauseDuCompte | undefined} lue */
    suivre(lue) {
      const avant = JSON.stringify(pause);
      pause = lue;
      if (JSON.stringify(pause) !== avant) reprise = undefined;
      poser();
    },
    // Le compte à rebours : appelé chaque seconde.
    battre: poser,
    /** @returns {PauseDuCompte | undefined} */
    vue: () => (enCours(pause, options.maintenant()) ? pause : undefined),
  };
}

// Ce que le rail d'un projet dit pendant la pause : sa ligne de pause, à la place du rail bloqué et de l'attente de la file
// — sauf une panne que la pause n'explique pas, qui garde sa ligne et son geste.
/** @typedef {{ cause: string } | { illisible: string }} RailBloqueVu */
/** @typedef {{ raison: string }} AttenteVue */
/**
 * @template {RailBloqueVu} R @template {AttenteVue} A
 * @param {{ pauseQuota?: PauseDuCompte, railBloque?: R, attenteDuRail?: A }} tableau @param {number} maintenant
 * @returns {{ railBloque?: R, attenteDuRail?: A, enPause: boolean }}
 */
export function ceQueLeRailDit({ pauseQuota, railBloque, attenteDuRail }, maintenant) {
  if (!enCours(pauseQuota, maintenant)) return { railBloque, attenteDuRail, enPause: false };
  const horsPause = (/** @type {string} */ raison) => PANNES_HORS_PAUSE.includes(raison);
  const bloque = railBloque !== undefined && ("illisible" in railBloque || horsPause(railBloque.cause)) ? railBloque : undefined;
  const attente = attenteDuRail !== undefined && horsPause(attenteDuRail.raison) ? attenteDuRail : undefined;
  return { railBloque: bloque, attenteDuRail: attente, enPause: bloque === undefined && attente === undefined };
}

// La ligne du projet en pause, en tête de son rail : calme, avec l'horloge, sans geste.
/** @param {Fabrique} doc @param {boolean} enPause @returns {HTMLElement[]} */
export function ligneDuProjetEnPause(doc, enPause) {
  if (!enPause) return [];
  const ligne = doc.createElement("p");
  ligne.className = "pause-du-projet";
  const phrase = doc.createElement("span");
  phrase.textContent = PROJET_EN_PAUSE;
  ligne.append(horloge(doc), phrase);
  return [ligne];
}
