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
// Et l'appairage du téléphone (le ticket 1161), sans terminal :
//   - `demarrage` rend aussi `telephone`, ce que ce téléphone garde de son appairage — aucun sur une
//     installation neuve : la vue s'ouvre alors sur l'écran qui le relie aux projets ;
//   - `appairerLeTelephone` envoie le code au guichet de la station (`POST /pairing`,
//     runtime/src/telephone/guichet.ts) par le HTTP natif de Capacitor — le guichet parle http, sur le
//     réseau du chef, que la WebView, servie en https, ne joindrait pas elle-même. Appairé, le jeton,
//     l'adresse et la station sont gardés dans le stockage de l'app, et la vue n'en reçoit que le nom ;
//   - `scannerLeQr` lit le QR de la station par le lecteur de Google Play (Pont.java, `scanner`).
// La file et les mises à jour ne sont pas ici : ce pont sera remplacé par celui qui lit une station.
//
// Ce fichier n'est pas joué tel quel : la construction l'enveloppe, avec `DEMARRAGE`, dans
// www/android/pont.js, que l'activité injecte au début de chaque document de l'app (Pont.java).
/* global DEMARRAGE */
const AUCUNE_STATION = "the Android app is not paired with a station yet: this phone reads nothing and sends nothing";
const configuration = { chemin: `no projects file on this phone — ${AUCUNE_STATION}`, projets: [] };
// Ce que l'app garde de son appairage, dans son stockage : effacé avec elle, une installation neuve n'en a pas.
const CLE = "brigade.telephone";
// Le temps de joindre le guichet, puis celui qu'il réponde : au-delà, la station ne répond pas.
const DELAI_MS = 10_000;
/** @returns {{ appaire: false } | { appaire: true, station: string, adresse: string }} */
function telephone() {
  try {
    const garde = JSON.parse(window.localStorage.getItem(CLE) ?? "null");
    if (typeof garde?.station === "string" && typeof garde.adresse === "string" && typeof garde.jeton === "string") return { appaire: true, station: garde.station, adresse: garde.adresse };
  } catch {
    // Illisible, il ne vaut rien : le téléphone se réappaire.
  }
  return { appaire: false };
}
/** @param {unknown} erreur */
const ditDe = (erreur) => (erreur instanceof Error ? erreur.message : typeof erreur === "object" && erreur !== null && "message" in erreur ? String(erreur.message) : String(erreur));
/** @param {string} plugin @param {string} methode @param {Record<string, unknown>} options @returns {Promise<any>} */
function natif(plugin, methode, options) {
  const capacitor = /** @type {any} */ (window).Capacitor;
  if (typeof capacitor?.nativePromise !== "function") return Promise.reject(new Error("the app's native bridge is missing"));
  return capacitor.nativePromise(plugin, methode, options);
}
/** @param {{ adresse: string, code: string, nom: string, machine: string }} demande */
async function appairerLeTelephone({ adresse, code, nom, machine }) {
  /** @type {{ status: number, data: unknown }} */
  let rendu;
  try {
    rendu = await natif("CapacitorHttp", "request", { url: `${adresse}/pairing`, method: "POST", headers: { "Content-Type": "application/json" }, data: { code, name: nom, machine }, connectTimeout: DELAI_MS, readTimeout: DELAI_MS });
  } catch (erreur) {
    return { paired: false, reason: "injoignable", said: ditDe(erreur) };
  }
  /** @type {any} */
  let corps = rendu.data;
  if (typeof corps === "string") {
    try {
      corps = JSON.parse(corps);
    } catch {
      // Ce n'est pas le guichet qui a répondu.
    }
  }
  if (rendu.status === 201 && corps?.paired === true && typeof corps.token === "string" && typeof corps.station?.nom === "string") {
    window.localStorage.setItem(CLE, JSON.stringify({ station: corps.station.nom, adresse, jeton: corps.token }));
    return { paired: true, station: corps.station.nom };
  }
  if (corps?.paired === false && typeof corps.reason === "string") return { paired: false, reason: corps.reason, said: typeof corps.said === "string" ? corps.said : "" };
  return { paired: false, reason: "inattendu", said: `${adresse} answered ${rendu.status}, not as a station's phone desk` };
}
async function scannerLeQr() {
  try {
    const lu = await natif("Pont", "scanner", {});
    return typeof lu?.texte === "string" ? { lu: lu.texte } : { annule: true };
  } catch (erreur) {
    return { refus: ditDe(erreur) };
  }
}
/** @type {Record<string, (...args: any[]) => unknown>} */
const connus = {
  demarrage: async () => ({ ...DEMARRAGE, configuration, telephone: telephone() }),
  appairerLeTelephone,
  scannerLeQr,
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
