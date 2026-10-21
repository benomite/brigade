// @ts-check
// L'invite de mise à jour de l'app Android (le ticket 1170, épique 1166), posée au lancement quand la
// vérification (mise-a-jour/android.ts) rend une offre : la version qui est offerte, ses notes, et
// deux gestes — « Update », qui remet l'`apkUrl` à l'installation, et « Not now », qui ferme
// l'invite jusqu'au lancement suivant. Sans offre, rien n'est posé : le lancement reste ce qu'il était.
//
// Ce module ne touche pas `document` et ne lance rien : il reçoit de quoi créer un élément
// (briques.js) et ce que chaque bouton appelle, et rend un élément — ou rien.

import { boutonAction } from "../briques.js";

/** @typedef {import("../briques.js").Fabrique} Fabrique */
/** @typedef {import("../../mise-a-jour/android.ts").UpdateOffer} Offre */

// L'invite d'une offre : une phrase qui nomme la version, ses notes si elles en disent quelque chose,
// puis les deux gestes. L'installation ne coûte rien en jetons : aucun prix au survol.
/** @param {Fabrique} doc @param {Offre} offre @param {{ accepter: (apkUrl: string) => void, refuser: () => void }} gestes */
export function poserInvite(doc, offre, { accepter, refuser }) {
  const racine = doc.createElement("div");
  racine.className = "invite-mise-a-jour";
  racine.role = "dialog";
  racine.ariaLabel = "update available";
  const phrase = doc.createElement("p");
  phrase.className = "phrase";
  phrase.textContent = `Version ${offre.version} is available`;
  racine.append(phrase);
  const notes = offre.notes.trim();
  if (notes !== "") {
    const detail = doc.createElement("p");
    detail.className = "notes";
    detail.textContent = notes;
    racine.append(detail);
  }
  racine.append(
    boutonAction(doc, "Update", () => accepter(offre.apkUrl), { recommande: true }),
    boutonAction(doc, "Not now", refuser),
  );
  return racine;
}

// Ce que la vue tient de l'invite : l'offre du lancement, et si le chef l'a refusée. Un refus tient
// jusqu'au lancement suivant — une offre qui arrive après lui ne rouvre rien.
/** @param {HTMLElement} lieu @param {Fabrique} doc @param {{ installer: (apkUrl: string) => unknown }} pont */
export function tenirInvite(lieu, doc, pont) {
  let refusee = false;
  /** @type {Offre | undefined} */
  let offre;
  const poser = () => {
    lieu.hidden = offre === undefined || refusee;
    lieu.replaceChildren(
      ...(lieu.hidden || offre === undefined
        ? []
        : [
            poserInvite(doc, offre, {
              accepter: (apkUrl) => void pont.installer(apkUrl),
              refuser: () => {
                refusee = true;
                poser();
              },
            }),
          ]),
    );
  };
  return {
    /** @param {Offre} recue */
    offrir(recue) {
      offre = recue;
      poser();
    },
  };
}
