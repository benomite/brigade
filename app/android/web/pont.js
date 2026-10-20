// @ts-check
// Le pont d'attente de l'app Android. Sur le desktop, la vue (app/src/vue/vue.js) reçoit
// `window.brigade` de preload.cjs, et derrière lui le process principal d'Electron, qui lit les
// projets, lance les terminaux et joint les stations. Sur Android il n'y a pas de process
// principal : ce téléphone n'est appairé à aucune station, il ne lit rien et n'envoie rien.
// Ce pont donne à la même vue de quoi s'ouvrir sur son premier écran, sans projet :
//   - `demarrage` rend ce que le process principal rendrait — les palettes, onglets, gestes et
//     libellés, lus dans les modules d'app/src/ à la construction (app/packaging/android.ts) — et
//     une liste de projets vide ;
//   - `ajouter` refuse, en disant pourquoi ;
//   - un abonnement (`sur…`) ne reçoit jamais rien ; tout autre geste ne fait rien et ne rend rien.
// L'appairage, la file et les mises à jour ne sont pas ici : ce pont sera remplacé par celui qui
// joint une station.
//
// Ce fichier n'est pas joué tel quel : la construction l'enveloppe, avec `DEMARRAGE`, dans
// www/android/pont.js, que l'activité injecte au début de chaque document de l'app (Pont.java).
/* global DEMARRAGE */
const AUCUNE_STATION = "the Android app is not paired with a station yet: this phone reads nothing and sends nothing";
const configuration = { chemin: `no projects file on this phone — ${AUCUNE_STATION}`, projets: [] };
/** @type {Record<string, (...args: unknown[]) => unknown>} */
const connus = {
  demarrage: async () => ({ ...DEMARRAGE, configuration }),
  choisirDossier: async () => undefined,
  ajouter: async () => ({ etat: "pas-ajoute", titre: `Nothing was added: ${AUCUNE_STATION}.` }),
};
const rien = async () => undefined;
const sourd = () => undefined;
const pont = new Proxy(
  {},
  {
    // `then` n'en est pas un : le pont ne doit pas passer pour une promesse.
    get: (_, nom) => (typeof nom !== "string" || nom === "then" ? undefined : (connus[nom] ?? (/^sur[A-Z]/.test(nom) ? sourd : rien))),
  },
);
Object.defineProperty(window, "brigade", { value: pont, enumerable: true });
