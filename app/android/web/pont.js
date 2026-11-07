// @ts-check
// Le pont d'attente de l'app Android. Sur le desktop, la vue (app/src/vue/vue.js) reçoit
// `window.brigade` de preload.cjs, et derrière lui le process principal d'Electron, qui lit les
// projets, lance les terminaux et joint les stations. Sur Android il n'y a pas de process
// principal. Ce pont donne à la même vue de quoi s'ouvrir sur son premier écran, sans projet :
//   - `demarrage` rend ce que le process principal rendrait — les palettes, onglets, gestes et
//     libellés, lus dans les modules d'app/src/ à la construction (app/packaging/android.ts) — et
//     une liste de projets vide ;
//   - `ajouter` refuse, en disant pourquoi ;
//   - un abonnement (`sur…`) ne reçoit jamais rien ; tout autre geste ne fait rien et ne rend rien.
// Et la connexion du téléphone à GitHub (le ticket 2500, épique 2498), sans station ni terminal :
//   - `demarrage` rend aussi `telephone.github`, le compte sous lequel ce téléphone est connecté — aucun sur une
//     installation neuve : la vue s'ouvre alors sur l'écran de connexion (app/src/vue/connexion-github.js) ;
//   - `seConnecterAGitHub` mène le « device flow » de GitHub par le HTTP natif de Capacitor — github.com ne répond pas
//     à une WebView (CORS) : il demande un code à usage unique, ouvre la page où le taper dans le navigateur du
//     téléphone (Pont.java, `ouvrir`), et rend le code à la vue. Il attend ensuite que le chef l'ait tapé, au pas que
//     GitHub donne ; la fin — connecté, refusé sur GitHub, le code expiré — arrive à la vue par `surConnexionGitHub`.
//     Connecté, le jeton est gardé dans le coffre du téléphone (Coffre.java, chiffré par une clé du Keystore
//     d'Android), le compte dans le stockage de l'app ; la vue ne voit jamais le jeton ;
//   - `ouvrirLaPage` rouvre la page de GitHub où taper le code.
// Et, connecté, les projets du chef, le rail et TODO de chacun, lus sur GitHub seul (le ticket 2501) : `demarrage`,
// `faits`, `tous`, `regarder` et `relireBox` passent par la lecture d'app/src/lecture-github-telephone.ts — celle du
// desktop, avec le jeton du coffre, par le HTTP natif de Capacitor, à l'API de GitHub et nulle part ailleurs —, et ce qui
// en sort arrive à la vue par ses abonnements (`surConfiguration`, `surFaits`, `surAlertes`, `surAccueil`, `surActivites`,
// `surAmont`, `surTelephone`), tel que le process principal du desktop l'enverrait. La construction pose ce module à côté
// de la vue (www/src/lecture-github-telephone.js), chargé à la première lecture. Les projets de la dernière liste lue
// sont gardés : relancée, l'app les montre avant de relire. Aucune station n'est lue : pas connecté, le téléphone ne lit
// rien.
// `oublierLeTelephone` oublie sa connexion à GitHub — celle que GitHub refuse.
// Et, connecté, les gestes du chef, écrits sur GitHub seul (le ticket 2502) : `gestesDeFiche`, `gesteDeFiche`, `attente` et
// `repondreCarte` passent par les gestes de la même lecture (app/src/gestes-github-telephone.ts) — le code d'écriture du
// desktop, sur le dernier rail lu, avec le jeton du coffre, par le HTTP natif de Capacitor, à l'API de GitHub et nulle part
// ailleurs. Répondre à une carte de TODO poste sa réponse sur l'issue et joue son geste ; reprendre (« back to the
// kitchen », « it arrived ») retire `waiting` ; mettre en suspens (« remove from the rail ») retire `fire`. Ce que GitHub
// refuse, ou un GitHub qui ne répond pas, revient à la vue en une phrase, et rien n'est montré fait. Aucune station n'est
// jointe pour un geste : pas connecté, rien ne part.
// Les mises à jour ne sont pas ici.
//
// Ce fichier n'est pas joué tel quel : la construction l'enveloppe, avec `DEMARRAGE`, dans
// www/android/pont.js, que l'activité injecte au début de chaque document de l'app (Pont.java).
/* global DEMARRAGE */
const AUCUNE_STATION = "the Android app reads no project yet: this phone reads nothing and sends nothing";
const configuration = { chemin: `no projects file on this phone — ${AUCUNE_STATION}`, projets: [] };
// Les projets de la dernière liste lue sur GitHub.
const CLE_DES_PROJETS_GITHUB = "brigade.github.projets";
// Le temps de joindre GitHub, puis celui qu'il réponde : au-delà, il ne répond pas.
const DELAI_MS = 10_000;
// Le temps qu'une écriture a pour répondre, une fois GitHub joint : un merge attend que GitHub l'ait fait.
const DELAI_D_ECRITURE_MS = 60_000;
// Ce que dit un geste quand le téléphone n'est pas connecté à GitHub : rien n'est parti.
const SANS_GITHUB = "nothing was sent: this phone is not signed in to GitHub — sign in, then try again";
// La connexion à GitHub (le ticket 2500) : l'App OAuth au nom de laquelle le téléphone demande son code — celle de la
// GitHub CLI, que le desktop emploie déjà par `gh auth login` (connexion-github.ts) : le chef y a déjà donné son accord
// et n'en donne aucun à un tiers de plus. Son « device flow » ne demande aucun secret. Une App OAuth de brigade, son
// device flow activé, la remplacerait ici. Les droits demandés sont ceux de `gh` : les dépôts, les gists, l'organisation lue.
const CLIENT_GITHUB = "178c6fc778ccc68e1d6a";
const DROITS_GITHUB = "repo read:org gist";
// Sous ces noms, le jeton dans le coffre du téléphone (Coffre.java) et le compte dans le stockage de l'app.
const CLE_GITHUB = "github";
const CLE_DU_COMPTE = "brigade.github";
// Le pas d'attente que GitHub donne, quand il n'en dit aucun, et ce qu'il y ajoute quand il dit d'aller moins vite
// (`slow_down`) — en secondes, comme lui.
const PAS_GITHUB_S = 5;
// Les projets de la dernière liste lue — aucun s'ils ne se relisent pas.
function projetsGardes(cle) {
  try {
    const lus = JSON.parse(window.localStorage.getItem(cle) ?? "[]");
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
// Les abonnements de la vue, par leur nom : ce que la lecture sur GitHub, ou la connexion, leur dit.
/** @type {Map<string, ((...args: any[]) => void)[]>} */
const abonnes = new Map();
/** @param {string} canal @param {unknown[]} args */
const dire = (canal, ...args) => {
  for (const recevoir of abonnes.get(canal) ?? []) recevoir(...args);
};

// Le corps d'une réponse de CapacitorHttp : du JSON, lu s'il arrive en texte — rien s'il ne se lit pas.
/** @param {unknown} corps @returns {any} */
function corpsLu(corps) {
  if (typeof corps !== "string") return corps;
  try {
    return JSON.parse(corps);
  } catch {
    return undefined;
  }
}
/** @param {string} url @param {Record<string, string>} donnees */
const versGitHub = (url, donnees) => natif("CapacitorHttp", "request", { url, method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json" }, data: donnees, connectTimeout: DELAI_MS, readTimeout: DELAI_MS });
// Ce que GitHub a dit d'un refus, pour le survol : son code d'erreur et sa phrase.
/** @param {number} status @param {any} corps */
const ditDeGitHub = (status, corps) => [`github.com answered ${status}`, ...[corps?.error, corps?.error_description].filter((dit) => typeof dit === "string" && dit !== "")].join(" — ");
/** @param {number} ms */
const attendre = (ms) => new Promise((suite) => window.setTimeout(suite, ms));

// Le jeton GitHub du coffre : nul s'il n'y en a pas, ou que le coffre ne le rend pas.
/** @returns {Promise<string | null>} */
async function jetonDuCoffre() {
  try {
    const lu = await natif("Coffre", "lire", { cle: CLE_GITHUB });
    return typeof lu?.valeur === "string" && lu.valeur !== "" ? lu.valeur : null;
  } catch {
    return null;
  }
}
// Le compte GitHub sous lequel ce téléphone est connecté : nul quand GitHub ne l'a pas dit ; aucun sans jeton dans le coffre.
/** @returns {Promise<{ compte: string | null } | undefined>} */
async function connexionGardee() {
  if ((await jetonDuCoffre()) === null) return undefined;
  const compte = window.localStorage.getItem(CLE_DU_COMPTE);
  return { compte: compte === null || compte === "" ? null : compte };
}

// Le login que GitHub mène sans station : son code et sa page, rendus à la vue ; puis, au pas que GitHub donne, la
// question de savoir si le chef l'a tapé — la fin part par `surConnexionGitHub`. Un seul à la fois : un second geste,
// pendant que le premier attend le chef, rend le même code sans rien demander de plus.
/** @type {Promise<any> | undefined} */
let connexionEnCours;
function seConnecterAGitHub() {
  connexionEnCours ??= commencerLaConnexion().then((debut) => {
    if (!("code" in debut)) connexionEnCours = undefined;
    return debut;
  });
  return connexionEnCours;
}
async function commencerLaConnexion() {
  /** @type {{ status: number, data: unknown }} */
  let rendu;
  try {
    rendu = await versGitHub("https://github.com/login/device/code", { client_id: CLIENT_GITHUB, scope: DROITS_GITHUB });
  } catch (erreur) {
    return { refus: "This phone could not reach GitHub: check its connection, then try again.", detail: ditDe(erreur) };
  }
  const corps = corpsLu(rendu.data);
  const { device_code: appareil, user_code: code, verification_uri: page } = corps ?? {};
  if (rendu.status !== 200 || typeof appareil !== "string" || typeof code !== "string" || typeof page !== "string" || !/^https:\/\//.test(page)) {
    return { refus: "GitHub did not start the sign-in: try again.", detail: ditDeGitHub(rendu.status, corps) };
  }
  void natif("Pont", "ouvrir", { url: page }).catch(() => undefined);
  const pas = typeof corps.interval === "number" && corps.interval >= 0 ? corps.interval : PAS_GITHUB_S;
  const duree = typeof corps.expires_in === "number" && corps.expires_in > 0 ? corps.expires_in : 900;
  void attendreLeChef(appareil, pas, Date.now() + duree * 1000).then((fin) => {
    connexionEnCours = undefined;
    dire("surConnexionGitHub", fin);
  });
  return { code, page };
}
// Demander à GitHub, au pas qu'il donne, si le chef a tapé le code : rend la fin — connecté, ou pourquoi pas. Un réseau
// qui manque un moment ne l'arrête pas : la question repart au pas suivant, jusqu'à l'échéance du code.
/** @param {string} appareil @param {number} pas @param {number} echeance */
async function attendreLeChef(appareil, pas, echeance) {
  const EXPIRE = { refus: "The code expired before it was typed on GitHub: sign in again." };
  for (;;) {
    await attendre(pas * 1000);
    if (Date.now() > echeance) return EXPIRE;
    /** @type {{ status: number, data: unknown }} */
    let rendu;
    try {
      rendu = await versGitHub("https://github.com/login/oauth/access_token", { client_id: CLIENT_GITHUB, device_code: appareil, grant_type: "urn:ietf:params:oauth:grant-type:device_code" });
    } catch {
      continue;
    }
    const corps = corpsLu(rendu.data);
    if (rendu.status === 200 && typeof corps?.access_token === "string" && corps.access_token !== "") return garderLaConnexion(corps.access_token);
    const erreur = corps?.error;
    if (erreur === "authorization_pending") continue;
    if (erreur === "slow_down") {
      pas = typeof corps.interval === "number" ? corps.interval : pas + PAS_GITHUB_S;
      continue;
    }
    if (erreur === "access_denied") return { refus: "The sign-in was cancelled on GitHub: this phone is not signed in.", detail: ditDeGitHub(rendu.status, corps) };
    if (erreur === "expired_token") return { ...EXPIRE, detail: ditDeGitHub(rendu.status, corps) };
    return { refus: "GitHub refused the sign-in: sign in again.", detail: ditDeGitHub(rendu.status, corps) };
  }
}
// Le jeton rendu : gardé dans le coffre, et le compte qu'il ouvre lu sur GitHub — nul s'il ne s'y lit pas.
/** @param {string} jeton */
async function garderLaConnexion(jeton) {
  try {
    await natif("Coffre", "garder", { cle: CLE_GITHUB, valeur: jeton });
  } catch (erreur) {
    return { refus: "This phone could not keep its GitHub sign-in: sign in again.", detail: ditDe(erreur) };
  }
  /** @type {string | null} */
  let compte = null;
  try {
    const lu = await natif("CapacitorHttp", "request", { url: "https://api.github.com/user", method: "GET", headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${jeton}` }, connectTimeout: DELAI_MS, readTimeout: DELAI_MS });
    const login = corpsLu(lu.data)?.login;
    if (lu.status === 200 && typeof login === "string" && login !== "") compte = login;
  } catch {
    // Le compte se tait : le téléphone est connecté quand même.
  }
  if (compte === null) window.localStorage.removeItem(CLE_DU_COMPTE);
  else window.localStorage.setItem(CLE_DU_COMPTE, compte);
  // Un autre compte, peut-être : ses projets se lisent de nouveau.
  window.localStorage.removeItem(CLE_DES_PROJETS_GITHUB);
  lectureGitHub = undefined;
  return { connecte: true, compte };
}

// La lecture des projets sur GitHub (app/src/lecture-github-telephone.ts), ouverte une fois le téléphone connecté : son
// module, posé par la construction à côté de la vue (www/src/lecture-github-telephone.js), est chargé à la première
// lecture. Rien sans connexion. Les faits que la vue a demandés avant — la barre posée derrière l'écran de connexion —
// lui sont demandés dès qu'elle s'ouvre.
/** @type {Promise<any> | undefined} */
let lectureGitHub;
/** @type {number | undefined} */
let faitsDemandes;
async function laLectureGitHub() {
  if (lectureGitHub !== undefined) return lectureGitHub;
  const connexion = await connexionGardee();
  if (connexion === undefined) return undefined;
  lectureGitHub ??= Promise.resolve()
    .then(() => Promise.all([import(new URL("../lecture-github-telephone.js", window.location.href).href), import(new URL("../gestes-github-telephone.js", window.location.href).href)]))
    .then(([{ ouvrirLaLectureGitHub, parCapacitor }, { ecritureParCapacitor }]) => {
      const ouverte = ouvrirLaLectureGitHub({
        jeton: jetonDuCoffre,
        envoyer: parCapacitor((/** @type {Record<string, unknown>} */ demande) => natif("CapacitorHttp", "request", { ...demande, connectTimeout: DELAI_MS, readTimeout: DELAI_MS })),
        ecrire: ecritureParCapacitor((/** @type {Record<string, unknown>} */ demande) => natif("CapacitorHttp", "request", { ...demande, connectTimeout: DELAI_MS, readTimeout: DELAI_D_ECRITURE_MS })),
        dire,
        compte: connexion.compte,
        connus: projetsGardes(CLE_DES_PROJETS_GITHUB),
        /** @param {unknown[]} projets */
        garder: (projets) => window.localStorage.setItem(CLE_DES_PROJETS_GITHUB, JSON.stringify(projets)),
        /** @param {() => void} faire @param {number} ms */
        planifier: (faire, ms) => {
          const minuterie = window.setTimeout(faire, ms);
          return () => window.clearTimeout(minuterie);
        },
      });
      if (faitsDemandes !== undefined) void ouverte.faits(faitsDemandes);
      return ouverte;
    });
  return lectureGitHub;
}
// Une lecture que la vue demande, quand le téléphone est connecté et sa lecture ouverte.
/** @param {(ouverte: any) => unknown} faire */
const avecLaLectureGitHub = (faire) => void laLectureGitHub().then((ouverte) => (ouverte === undefined ? undefined : faire(ouverte)), () => undefined);
// Un geste du chef, quand le téléphone est connecté : les gestes de sa lecture GitHub. Une lecture qui ne s'ouvre pas
// lève : la fiche dit que ses gestes ne se lisent pas, ou que rien n'est parti.
/** @param {(gestes: any) => unknown} faire @param {unknown} sans */
const avecLesGestes = async (faire, sans) => {
  const ouverte = await laLectureGitHub();
  return ouverte === undefined ? sans : faire(ouverte.gestes);
};
// Pas connecté, la vue s'ouvre sur l'écran de connexion à GitHub, sans projet ; connecté, sur les projets de la dernière
// liste lue sur GitHub, que la lecture relit.
async function demarrage() {
  const github = await connexionGardee();
  if (github === undefined) return { ...DEMARRAGE, configuration, telephone: {} };
  /** @type {any} */
  const ouverte = await laLectureGitHub().catch((/** @type {unknown} */ erreur) => ({ refus: ditDe(erreur) }));
  if (ouverte === undefined) return { ...DEMARRAGE, configuration, telephone: {} };
  // Le module de lecture ne s'est pas chargé : l'app s'ouvre sans projet, et dit pourquoi.
  if ("refus" in ouverte) return { ...DEMARRAGE, configuration: { chemin: "no projects file on this phone", projets: [] }, telephone: { github, liste: { a: new Date().toISOString(), lue: false, reason: "inattendu", said: `this app could not load what reads your projects on GitHub: ${ouverte.refus}` } } };
  return { ...DEMARRAGE, configuration: ouverte.configuration(), telephone: ouverte.telephone() };
}

/** @type {Record<string, (...args: any[]) => unknown>} */
const connus = {
  demarrage,
  seConnecterAGitHub,
  ouvrirLaPage: async (/** @type {string} */ url) => {
    if (!/^https:\/\/github\.com\//.test(url)) return false;
    try {
      await natif("Pont", "ouvrir", { url });
      return true;
    } catch {
      return false;
    }
  },
  choisirDossier: async () => undefined,
  ajouter: async () => ({ etat: "pas-ajoute", titre: (await connexionGardee()) === undefined ? `Nothing was added: ${AUCUNE_STATION}.` : "Nothing was added: a project is added from a computer, and this phone reads it from GitHub." }),
  faits: (/** @type {number} */ demande) => {
    faitsDemandes = demande;
    avecLaLectureGitHub((ouverte) => ouverte.faits(demande));
  },
  tous: (/** @type {number} */ demande) => avecLaLectureGitHub((ouverte) => ouverte.tous(demande)),
  regarder: (/** @type {string} */ projet, /** @type {number} */ demande) => avecLaLectureGitHub((ouverte) => ouverte.regarder(projet, demande)),
  relireBox: () => avecLaLectureGitHub((ouverte) => ouverte.relire()),
  gestesDeFiche: (/** @type {unknown} */ carte) => avecLesGestes((gestes) => gestes.gestesDeFiche(carte), []),
  gesteDeFiche: (/** @type {string} */ projet, /** @type {string} */ id, /** @type {number} */ ticket) => avecLesGestes((gestes) => gestes.geste(projet, id, ticket), { refus: SANS_GITHUB, detail: "" }),
  attente: (/** @type {string} */ projet, /** @type {string} */ id, /** @type {number} */ ticket) => avecLesGestes((gestes) => gestes.attente(projet, id, ticket), { refus: SANS_GITHUB, detail: "" }),
  repondreCarte: (/** @type {string} */ projet, /** @type {number} */ ticket, /** @type {unknown} */ reponse) => avecLesGestes((gestes) => gestes.repondreCarte(projet, ticket, reponse), { refus: SANS_GITHUB, detail: "" }),
  // La connexion à GitHub oubliée — le jeton du coffre, le compte et ses projets. La vue revient à l'écran de
  // connexion à GitHub.
  oublierLeTelephone: async () => {
    await natif("Coffre", "oublier", { cle: CLE_GITHUB }).catch(() => undefined);
    for (const cle of [CLE_DU_COMPTE, CLE_DES_PROJETS_GITHUB]) window.localStorage.removeItem(cle);
    lectureGitHub = undefined;
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
