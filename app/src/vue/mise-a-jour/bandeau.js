// @ts-check
// Le bandeau d'une version plus haute (le ticket 1528, épique 1525), en tête de l'app sur un Mac, sous Windows et sur
// Android : « Version X available — Download », où « Download » est le lien direct du paquet de ce poste — le .dmg,
// l'installeur .exe ou l'.apk —, jamais la page des releases. Sur un Mac et sous Windows, une ligne dit comment ouvrir
// la première fois une app qui n'est pas signée ; sur Android, rien. La croix l'écarte pour cette version seulement :
// le pont s'en souvient, relancée l'app ne la montre plus, et une version plus haute le rouvre. Sans version plus
// haute, rien n'est posé.
//
// Ce que le bandeau montre vient de la vérification du process principal (mise-a-jour/avis.ts) : la vue ne lit pas
// GitHub. Ce module ne touche pas `document` et n'ouvre rien : il reçoit de quoi créer un élément (briques.js) et ce
// que chaque geste appelle, et rend un élément — ou rien.

/** @typedef {import("../briques.js").Fabrique} Fabrique */
/** @typedef {import("../../mise-a-jour/avis.ts").Avis} Avis */
/** @typedef {import("../../mise-a-jour/avis.ts").Indice} Indice */

// La ligne du premier lancement, par poste : une app non signée ne s'ouvre pas d'un double-clic la première fois.
/** @type {Record<Indice, string>} */
export const INDICES = {
  "mac-right-click-open": "First open of this unsigned build: right-click Brigade, then Open.",
  "windows-more-info-run-anyway": "First open of this unsigned build: in SmartScreen, click More info, then Run anyway.",
};

// Le nom du paquet, au survol du lien : le dernier morceau de son adresse.
/** @param {string} url */
const paquetDe = (url) => decodeURIComponent(url.slice(url.lastIndexOf("/") + 1));

// Le bandeau d'un avis : la phrase et son lien, la ligne du premier lancement s'il y en a une, et la croix.
/** @param {Fabrique} doc @param {Avis} avis @param {{ telecharger: (url: string) => void, ecarter: () => void }} gestes */
export function poserBandeau(doc, avis, { telecharger, ecarter }) {
  const racine = doc.createElement("div");
  racine.className = "bandeau-mise-a-jour";
  racine.role = "status";
  const phrase = doc.createElement("p");
  phrase.className = "phrase";
  // Un lien ne navigue pas dans l'app : le clic demande au pont de l'ouvrir dans le navigateur.
  const lien = doc.createElement("a");
  lien.className = "telecharger";
  lien.href = avis.url;
  lien.textContent = "Download";
  lien.title = `download ${paquetDe(avis.url)} in your browser`;
  lien.addEventListener("click", (/** @type {{ preventDefault(): void }} */ evenement) => {
    evenement.preventDefault();
    telecharger(avis.url);
  });
  phrase.append(`Version ${avis.version} available — `, lien);
  racine.append(phrase);
  if (avis.indice !== undefined) {
    const indice = doc.createElement("p");
    indice.className = "indice";
    indice.textContent = INDICES[avis.indice];
    racine.append(indice);
  }
  const croix = doc.createElement("button");
  croix.type = "button";
  croix.className = "ecarter";
  croix.textContent = "×";
  croix.ariaLabel = `dismiss version ${avis.version}`;
  croix.title = "hide until a newer version is out";
  croix.addEventListener("click", ecarter);
  racine.append(croix);
  return racine;
}

// Ce que la vue tient du bandeau : le dernier avis reçu, et la version que le chef a écartée. Écarter le cache tout de
// suite et le dit au pont, qui s'en souvient d'un lancement à l'autre ; un avis d'une autre version le rouvre.
/** @param {HTMLElement} lieu @param {Fabrique} doc @param {{ telecharger: (url: string) => unknown, refuser: (version: string) => unknown }} pont */
export function tenirBandeau(lieu, doc, pont) {
  /** @type {Avis | undefined} */
  let avis;
  /** @type {string | undefined} */
  let ecartee;
  const poser = () => {
    const montre = avis !== undefined && avis.version !== ecartee ? avis : undefined;
    lieu.hidden = montre === undefined;
    lieu.replaceChildren(
      ...(montre === undefined
        ? []
        : [
            poserBandeau(doc, montre, {
              telecharger: (url) => void pont.telecharger(url),
              ecarter: () => {
                ecartee = montre.version;
                poser();
                void pont.refuser(montre.version);
              },
            }),
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
  };
}
