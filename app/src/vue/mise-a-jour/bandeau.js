// @ts-check
// La ligne d'une version plus haute (le ticket 1528, épique 1525 ; une ligne, sans croix, depuis le ticket 2431), en tête
// de l'app sur un Mac, sous Windows et sur Android : « Brigade 1.4.0 is running — 1.5.0 is out », puis où en est la
// mise à jour de l'app installée — `downloading it, 40 %`, `downloaded: it installs at the next launch` avec
// « Install now », `installing it — the app relaunches itself…` —, ou, quand elle ne se fait pas d'elle-même (une
// release sans `latest-mac.yml`, une mise à jour en échec, Android), le lien « Download » du paquet de ce poste — le
// .dmg, l'installeur .exe ou l'.apk —, jamais la page des releases. Elle reste tant que l'app ne tourne pas sur la
// dernière version : rien ne l'écarte. Sans version plus haute, rien n'est posé.
//
// Ce que la ligne montre vient du process principal — l'avis (mise-a-jour/avis.ts) et l'état de la mise à jour
// (mise-a-jour/etat.ts) : la vue ne lit pas GitHub. Ce module ne touche pas `document` et n'ouvre rien : il reçoit de
// quoi créer un élément (briques.js) et ce que chaque geste appelle, et rend un élément — ou rien.

import { boutonAction } from "../briques.js";

/** @typedef {import("../briques.js").Fabrique} Fabrique */
/** @typedef {import("../../mise-a-jour/avis.ts").Avis} Avis */
/** @typedef {import("../../mise-a-jour/avis.ts").Indice} Indice */
/** @typedef {import("../../mise-a-jour/etat.ts").EtatDeMiseAJour} EtatDeMiseAJour */

// Le premier lancement, par poste, au survol du lien : une app non signée ne s'ouvre pas d'un double-clic la première fois.
/** @type {Record<Indice, string>} */
export const INDICES = {
  "mac-right-click-open": "First open of this unsigned build: right-click Brigade, then Open.",
  "windows-more-info-run-anyway": "First open of this unsigned build: in SmartScreen, click More info, then Run anyway.",
};

// Le nom du paquet, au survol du lien : le dernier morceau de son adresse.
/** @param {string} url */
const paquetDe = (url) => decodeURIComponent(url.slice(url.lastIndexOf("/") + 1));

// Deux versions par leurs nombres, comme mise-a-jour/flux.ts : ce qui suit `+` ne compte pas. Négatif : `a` est plus ancienne.
/** @param {string} a @param {string} b */
export function comparer(a, b) {
  /** @param {string} version */
  const nombres = (version) => (version.split("+")[0] ?? "").split(".").map(Number);
  const [na, nb] = [nombres(a), nombres(b)];
  for (let i = 0; i < Math.max(na.length, nb.length); i++) {
    const ecart = (na[i] ?? 0) - (nb[i] ?? 0);
    if (ecart !== 0) return ecart;
  }
  return 0;
}

// La version que la mise à jour de l'app installée a trouvée au-dessus de la sienne, quand elle en a une.
/** @param {EtatDeMiseAJour | undefined} etat */
const nouvelleDe = (etat) => (etat !== undefined && "nouvelle" in etat ? etat.nouvelle : undefined);

// Ce que la ligne dit : la version qui tourne, la dernière publiée, et ce que la mise à jour en fait. Rien quand l'app
// tourne sur la dernière version qu'elle connaît.
/** @param {Avis | undefined} avis @param {EtatDeMiseAJour | undefined} etat */
export function ligneDeVersion(avis, etat) {
  const nouvelle = nouvelleDe(etat);
  const courante = avis?.courante ?? etat?.version;
  const derniere = avis === undefined ? nouvelle : nouvelle !== undefined && comparer(nouvelle, avis.version) > 0 ? nouvelle : avis.version;
  if (courante === undefined || derniere === undefined || comparer(derniere, courante) <= 0) return undefined;
  return { courante, derniere, nouvelle };
}

// La ligne : la phrase, puis la suite que donne l'état de la mise à jour — son geste « Install now », ou le lien
// « Download » quand l'app ne se met pas à jour d'elle-même. `refus` : pourquoi « Install now » n'a pas installé.
/** @param {Fabrique} doc @param {{ courante: string, derniere: string, nouvelle?: string }} ligne @param {Avis | undefined} avis @param {EtatDeMiseAJour | undefined} etat @param {{ telecharger: (url: string) => void, installer: () => void }} gestes @param {string} [refus] */
export function poserBandeau(doc, ligne, avis, etat, { telecharger, installer }, refus) {
  const racine = doc.createElement("div");
  racine.className = "bandeau-mise-a-jour";
  racine.role = "status";
  const phrase = doc.createElement("p");
  phrase.className = "phrase";
  phrase.append(`Brigade ${ligne.courante} is running — ${ligne.derniere} is out`);
  // La version que la mise à jour porte, quand ce n'est pas la dernière (une plus haute est sortie depuis).
  const elle = ligne.nouvelle === undefined || ligne.nouvelle === ligne.derniere ? "it" : ligne.nouvelle;
  /** @type {string | undefined} */
  let suite;
  let lien = false;
  if (etat?.etat === "telechargement") suite = `downloading ${elle}, ${etat.taille > 0 ? Math.floor((100 * etat.recus) / etat.taille) : 0} %`;
  else if (etat?.etat === "disponible") suite = `downloading ${elle}`;
  else if (etat?.etat === "prete") suite = refus ?? `${elle === "it" ? "it is" : `${elle} is`} downloaded: it installs at the next launch`;
  else if (etat?.etat === "installation") suite = `installing ${elle} — the app relaunches itself…`;
  else if (etat?.etat === "erreur") {
    suite = "it could not update itself";
    phrase.title = etat.raison;
    lien = true;
  } else lien = true;
  if (suite !== undefined) phrase.append(` · ${suite}`);
  if (lien && avis !== undefined) {
    // Un lien ne navigue pas dans l'app : le clic demande au pont de l'ouvrir dans le navigateur.
    const telechargement = doc.createElement("a");
    telechargement.className = "telecharger";
    telechargement.href = avis.url;
    telechargement.textContent = "Download";
    telechargement.title = [`download ${paquetDe(avis.url)} in your browser`, ...(avis.indice === undefined ? [] : [INDICES[avis.indice]])].join(" — ");
    telechargement.addEventListener("click", (/** @type {{ preventDefault(): void }} */ evenement) => {
      evenement.preventDefault();
      telecharger(avis.url);
    });
    phrase.append(" — ", telechargement);
  }
  racine.append(phrase);
  if (etat?.etat === "prete") racine.append(boutonAction(doc, "Install now", installer, { recommande: true, prix: "closes the app's terminals, then relaunches it on the new version" }));
  return racine;
}

// Ce que la vue tient de la ligne : le dernier avis reçu et le dernier état de la mise à jour. Chacun la repose ; elle
// disparaît quand l'app tourne sur la dernière version.
/** @param {HTMLElement} lieu @param {Fabrique} doc @param {{ telecharger: (url: string) => unknown, installer: () => Promise<{ refus: string } | undefined> | { refus: string } | undefined }} pont */
export function tenirBandeau(lieu, doc, pont) {
  /** @type {Avis | undefined} */
  let avis;
  /** @type {EtatDeMiseAJour | undefined} */
  let etat;
  /** @type {string | undefined} */
  let refus;
  const poser = () => {
    const ligne = ligneDeVersion(avis, etat);
    lieu.hidden = ligne === undefined;
    lieu.replaceChildren(
      ...(ligne === undefined
        ? []
        : [
            poserBandeau(doc, ligne, avis, etat, {
              telecharger: (url) => void pont.telecharger(url),
              installer: () =>
                void Promise.resolve(pont.installer()).then((rendu) => {
                  if (rendu === undefined) return;
                  refus = rendu.refus;
                  poser();
                }),
            }, refus),
          ]),
    );
  };
  return {
    // Un avis, ou rien : la dernière vérification n'a rien trouvé de plus haut.
    /** @param {Avis | undefined | null} recu */
    recevoir(recu) {
      avis = recu ?? undefined;
      poser();
    },
    // L'état de la mise à jour de l'app installée, à chaque changement.
    /** @param {EtatDeMiseAJour | undefined | null} recu */
    suivre(recu) {
      etat = recu ?? undefined;
      refus = undefined;
      poser();
    },
  };
}
