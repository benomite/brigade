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
//     réseau du chef, que la WebView, servie en https, ne joindrait pas elle-même ; d'un autre réseau,
//     il le joint en https sur le tailnet du chef (le ticket 1409), où `tailscale serve` le publie.
//     Appairé, le jeton, l'adresse et la station sont gardés dans le stockage de l'app, et la vue n'en
//     reçoit que le nom. Ce qui n'est pas le guichet est dit : rien ne répond (`injoignable`), la
//     machine répond mais pas le guichet derrière elle (`sans-guichet` : le 502 de `tailscale serve`,
//     la station arrêtée), ou autre chose répond à sa place (`inattendu`) ;
//   - `scannerLeQr` lit le QR de la station par le lecteur de Google Play (Pont.java, `scanner`).
// Et, appairé, les projets de la station et la file de chacun (le ticket 1414) : `faits`, `tous`, `regarder` et
// `relireBox` lisent son guichet (`GET /projects`, `GET /projects/<nom>/queue`) avec le jeton gardé, et ce qui en sort
// arrive à la vue par ses abonnements (`surConfiguration`, `surFaits`, `surLecture`, `surAlertes`, `surAccueil`,
// `surTelephone`) — tel que le process principal du desktop l'enverrait, calculé par les mêmes modules d'app/src/
// (app/android/web/lecture.ts, que la construction pose dans www/android/lecture.js, chargé à la première lecture).
// Les projets de la dernière liste lue sont gardés : relancée, l'app les montre avant de relire. `oublierLeTelephone`
// efface l'appairage — celui que la station ne connaît plus —, et la vue revient à l'écran qui le relie.
// Et les gestes de la fiche d'une carte (le ticket 1420) : `gestesDeFiche` rend ceux que le guichet porte — merger la PR,
// retirer du rail, renvoyer en cuisine —, et `gesteDeFiche` les joue par `POST /projects/<nom>/gestures`, avec le jeton
// gardé ; la lecture rend ce que la station en a dit, que la vue montre sur la fiche avant de relire la file.
// Et la conversation de chaque projet avec son second (le ticket 1426) : `conversation` la lit au guichet
// (`GET /projects/<nom>/second`), `envoyerAuSecond` y écrit un message du chef (`POST`), avec le jeton gardé ; la réponse
// du second, et ce que le chef tape au desktop, arrivent à la vue par `surConversation`. Un lien d'un message du second
// s'ouvre dans le navigateur du téléphone (Pont.java, `ouvrir`).
// Et le tableau de la cuisine de chaque projet (le ticket 1588) : `tableauDuProjet` le lit de GitHub, sans la station,
// par le HTTP natif et le jeton GitHub du coffre du téléphone ; `ouvrirDuTableau` ouvre la page d'une de ses lignes.
// Les mises à jour ne sont pas ici.
//
// Ce fichier n'est pas joué tel quel : la construction l'enveloppe, avec `DEMARRAGE`, dans
// www/android/pont.js, que l'activité injecte au début de chaque document de l'app (Pont.java).
/* global DEMARRAGE */
const AUCUNE_STATION = "the Android app is not paired with a station yet: this phone reads nothing and sends nothing";
const configuration = { chemin: `no projects file on this phone — ${AUCUNE_STATION}`, projets: [] };
// Ce que l'app garde de son appairage, dans son stockage : effacé avec elle, une installation neuve n'en a pas.
const CLE = "brigade.telephone";
// Les projets de la dernière liste lue au guichet de la station appairée.
const CLE_DES_PROJETS = "brigade.telephone.projets";
// Le temps de joindre le guichet, puis celui qu'il réponde : au-delà, la station ne répond pas.
const DELAI_MS = 10_000;
// Le temps qu'un geste a pour répondre, une fois le guichet joint : celui que la station laisse à sa commande — un merge
// attend GitHub (runtime/src/telephone/gestes.ts, `DELAI_DU_GESTE_MS`, deux minutes) —, et de quoi en rendre le verdict.
const DELAI_DU_GESTE_MS = 130_000;
// Ce qu'un relais — `tailscale serve`, un proxy — répond quand rien n'écoute derrière lui. Le guichet,
// lui, n'en rend aucun à `/pairing`.
const SANS_RIEN_DERRIERE = new Set([502, 503, 504]);
/** @returns {{ station: string, adresse: string, jeton: string } | undefined} */
function garde() {
  try {
    const lu = JSON.parse(window.localStorage.getItem(CLE) ?? "null");
    if (typeof lu?.station === "string" && typeof lu.adresse === "string" && typeof lu.jeton === "string") return { station: lu.station, adresse: lu.adresse, jeton: lu.jeton };
  } catch {
    // Illisible, il ne vaut rien : le téléphone se réappaire.
  }
  return undefined;
}
/** @returns {{ appaire: false } | { appaire: true, station: string, adresse: string }} */
function telephone() {
  const lu = garde();
  return lu === undefined ? { appaire: false } : { appaire: true, station: lu.station, adresse: lu.adresse };
}
// Les projets de la dernière liste lue — aucun s'ils ne se relisent pas.
function projetsGardes() {
  try {
    const lus = JSON.parse(window.localStorage.getItem(CLE_DES_PROJETS) ?? "[]");
    return Array.isArray(lus) ? lus : [];
  } catch {
    return [];
  }
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
    // Une autre station, peut-être : ses projets se lisent de nouveau.
    window.localStorage.removeItem(CLE_DES_PROJETS);
    lecture = undefined;
    return { paired: true, station: corps.station.nom };
  }
  if (corps?.paired === false && typeof corps.reason === "string") return { paired: false, reason: corps.reason, said: typeof corps.said === "string" ? corps.said : "" };
  if (SANS_RIEN_DERRIERE.has(rendu.status)) return { paired: false, reason: "sans-guichet", said: `${adresse} answered ${rendu.status}: nothing answers behind it` };
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

// Les abonnements de la vue, par leur nom : ce que la lecture de la station leur dit.
/** @type {Map<string, ((...args: any[]) => void)[]>} */
const abonnes = new Map();
/** @param {string} canal @param {unknown[]} args */
const dire = (canal, ...args) => {
  for (const recevoir of abonnes.get(canal) ?? []) recevoir(...args);
};
// La lecture de la station appairée (app/android/web/lecture.ts), ouverte une fois : son module, posé par la
// construction à côté de la vue (www/android/lecture.js), est chargé à la première lecture. Rien sans appairage.
/** @type {Promise<any> | undefined} */
let lecture;
function laLecture() {
  const lu = garde();
  if (lu === undefined) return undefined;
  lecture ??= Promise.resolve()
    .then(() => import(new URL("../../android/lecture.js", window.location.href).href))
    .then(({ ouvrirLaLecture }) =>
    ouvrirLaLecture({
      station: lu.station,
      adresse: lu.adresse,
      dire,
      /** @param {string} chemin */
      requete: (chemin) => natif("CapacitorHttp", "request", { url: `${lu.adresse}${chemin}`, method: "GET", headers: { Authorization: `Bearer ${lu.jeton}` }, connectTimeout: DELAI_MS, readTimeout: DELAI_MS }),
      /** @param {string} chemin @param {unknown} corps */
      envoyer: (chemin, corps) => natif("CapacitorHttp", "request", { url: `${lu.adresse}${chemin}`, method: "POST", headers: { Authorization: `Bearer ${lu.jeton}`, "Content-Type": "application/json" }, data: corps, connectTimeout: DELAI_MS, readTimeout: DELAI_DU_GESTE_MS }),
      connus: projetsGardes(),
      /** @param {unknown[]} projets */
      garder: (projets) => window.localStorage.setItem(CLE_DES_PROJETS, JSON.stringify(projets)),
    }),
  );
  return lecture;
}
// Ce que dit une conversation quand la lecture de la station ne s'est pas chargée.
/** @param {unknown} erreur */
const sansLecture = (erreur) => ({ refus: "this app could not load what reads its station", detail: ditDe(erreur) });
// Une lecture que la vue demande, quand la station est appairée et sa lecture ouverte.
/** @param {(ouverte: any) => unknown} faire */
const avecLaLecture = (faire) => void laLecture()?.then(faire, () => undefined);

async function demarrage() {
  const appaire = telephone();
  /** @type {any} */
  const ouverte = await laLecture()?.catch((/** @type {unknown} */ erreur) => ({ refus: ditDe(erreur) }));
  if (ouverte === undefined) return { ...DEMARRAGE, configuration, telephone: appaire };
  // Le module de lecture ne s'est pas chargé : l'app s'ouvre sans projet, et dit pourquoi.
  if ("refus" in ouverte) return { ...DEMARRAGE, configuration: { chemin: "no projects file on this phone", projets: [] }, telephone: { ...appaire, liste: { a: new Date().toISOString(), lue: false, reason: "inattendu", said: `this app could not load what reads its station: ${ouverte.refus}` } } };
  return { ...DEMARRAGE, configuration: ouverte.configuration(), telephone: ouverte.telephone() };
}

/** @type {Record<string, (...args: any[]) => unknown>} */
// Les pages de GitHub que la dernière lecture du tableau de chaque projet a données (`tableauDuProjet`).
/** @type {Map<string, Set<string>>} */
const pagesDuTableau = new Map();
const connus = {
  demarrage,
  appairerLeTelephone,
  scannerLeQr,
  choisirDossier: async () => undefined,
  ajouter: async () => ({ etat: "pas-ajoute", titre: garde() === undefined ? `Nothing was added: ${AUCUNE_STATION}.` : "Nothing was added: a project is added from a computer, and this phone reads it from its station." }),
  faits: (/** @type {number} */ demande) => avecLaLecture((ouverte) => ouverte.faits(demande)),
  tous: (/** @type {number} */ demande) => avecLaLecture((ouverte) => ouverte.tous(demande)),
  regarder: (/** @type {string} */ projet, /** @type {number} */ demande) => avecLaLecture((ouverte) => ouverte.regarder(projet, demande)),
  relireBox: () => avecLaLecture((ouverte) => ouverte.relire()),
  // Une lecture qui ne s'ouvre pas lève : la fiche dit que ses gestes ne se lisent pas, ou que rien n'est parti.
  gestesDeFiche: async (/** @type {unknown} */ carte) => (await laLecture())?.gestesDeFiche(carte) ?? [],
  gesteDeFiche: async (/** @type {string} */ projet, /** @type {string} */ id, /** @type {number} */ ticket) => (await laLecture())?.geste(projet, id, ticket) ?? { refus: `nothing was sent: ${AUCUNE_STATION}` },
  // Sans appairage, rien : la vue dit que la conversation ne se lit pas.
  conversation: async (/** @type {string} */ projet) => {
    try {
      return await (await laLecture())?.conversation(projet);
    } catch (erreur) {
      return sansLecture(erreur);
    }
  },
  envoyerAuSecond: async (/** @type {string} */ projet, /** @type {string} */ texte) => {
    try {
      return await (await laLecture())?.envoyerAuSecond(projet, texte);
    } catch (erreur) {
      return sansLecture(erreur);
    }
  },
  ouvrirLienDuSecond: async (/** @type {string} */ _projet, /** @type {string} */ url) => {
    try {
      await natif("Pont", "ouvrir", { url });
      return true;
    } catch {
      return false;
    }
  },
  // Le tableau de la cuisine d'un projet (le ticket 1588) : lu de GitHub sans la station — ni guichet ni tailnet —, par
  // la lecture du téléphone (`lireLeTableauDuTelephone`, app/android/web/lecture.ts), dans le dépôt que la dernière liste
  // lue donne au projet. Ce qui ne se lit pas se dit en une phrase, comme la lecture le fait.
  tableauDuProjet: async (/** @type {string} */ projet) => {
    const luLe = new Date().toISOString();
    const depot = projetsGardes().find((connu) => connu?.name === projet)?.repository;
    if (typeof depot !== "string") return { lu: false, depot: "", luLe, raison: `The Kitchen board of ${projet} is not read: this phone does not know its GitHub repository yet.` };
    try {
      const { lireLeTableauDuTelephone } = await import(new URL("../../android/lecture.js", window.location.href).href);
      const lu = await lireLeTableauDuTelephone(depot, { natif });
      if (lu?.lu === true) pagesDuTableau.set(projet, new Set(lu.pages));
      return lu;
    } catch {
      return { lu: false, depot, luLe, raison: `The Kitchen board of ${projet} could not be read: this app could not load what reads it.` };
    }
  },
  // Une ligne de la file de ce tableau, ouverte dans le navigateur du téléphone (Pont.java, `ouvrir`) : seulement une page
  // que sa dernière lecture a donnée — sa PR, son issue, ou le tableau.
  ouvrirDuTableau: async (/** @type {string} */ projet, /** @type {string} */ url) => {
    if (pagesDuTableau.get(projet)?.has(url) !== true) return false;
    try {
      await natif("Pont", "ouvrir", { url });
      return true;
    } catch {
      return false;
    }
  },
  // L'appairage effacé : le jeton, la station et ses projets. La vue revient à l'écran qui relie le téléphone.
  oublierLeTelephone: async () => {
    window.localStorage.removeItem(CLE);
    window.localStorage.removeItem(CLE_DES_PROJETS);
    lecture = undefined;
  },
};
const rien = async () => undefined;
/** @param {string} nom */
const abonner = (nom) => (/** @type {(...args: any[]) => void} */ recevoir) => void abonnes.set(nom, [...(abonnes.get(nom) ?? []), recevoir]);
const pont = new Proxy(
  {},
  {
    // `then` n'en est pas un : le pont ne doit pas passer pour une promesse.
    get: (_, nom) => (typeof nom !== "string" || nom === "then" ? undefined : (connus[nom] ?? (/^sur[A-Z]/.test(nom) ? abonner(nom) : rien))),
  },
);
Object.defineProperty(window, "brigade", { value: pont, enumerable: true });
