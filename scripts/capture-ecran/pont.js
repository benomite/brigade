// Le faux pont, posé dans la page avant la vue : `window.brigade` tel que preload.cjs le pose,
// mais rien n'en part. Ce qu'il rend vient des données figées de l'écran (`window.__donnees`,
// écrites par capture.ts) : une réponse par geste invoqué, et, pour chaque lecture que la vue
// demande — `faits`, `tous`, `regarder`, `onglet` —, ce que le process principal lui enverrait.
// L'heure est arrêtée à celle de l'écran. Et la page dit quand elle s'est posée (`__capture.calme`).
(() => {
  /** @type {{ maintenant: string, reponses: Record<string, unknown>, envois: { faits?: Envoi[], tous?: Envoi[], regarder?: Record<string, Envoi[]>, onglet?: Record<string, Envoi[]> } }} */
  const donnees = window.__donnees;
  /** @typedef {{ sur: string, args: unknown[], demande?: "faits" | "vue" | "onglet" }} Envoi */

  // L'heure de l'écran, partout où la vue la lit : `Date.now()` et `new Date()`.
  const MAINTENANT = Date.parse(donnees.maintenant);
  const DateReelle = Date;
  class DateArretee extends DateReelle {
    /** @param {any[]} valeurs */
    constructor(...valeurs) {
      super(...(valeurs.length === 0 ? [MAINTENANT] : valeurs));
    }
    static now() {
      return MAINTENANT;
    }
  }
  window.Date = /** @type {DateConstructor} */ (/** @type {unknown} */ (DateArretee));

  // Ce qui est en route vers la vue : une réponse, un envoi. La page n'est posée que sans rien en route.
  let enRoute = 0;
  /** @param {() => void} faire */
  const plusTard = (faire) => {
    enRoute++;
    setTimeout(() => {
      enRoute--;
      faire();
    }, 0);
  };

  /** @type {Map<string, (...args: unknown[]) => void>} */
  const ecoutes = new Map();
  // La dernière demande de chaque lecture : la vue écarte ce qui ne répond pas à la sienne.
  const demandes = { faits: 0, vue: 0, onglet: 0 };
  /** @param {Envoi[] | undefined} envois */
  const envoyer = (envois) => {
    for (const { sur, args, demande } of envois ?? []) {
      plusTard(() => {
        const copies = structuredClone(args);
        if (demande !== undefined) copies[0] = { .../** @type {object} */ (copies[0]), demande: demandes[demande] };
        ecoutes.get(sur)?.(...copies);
      });
    }
  };
  /** @type {Record<string, (...args: any[]) => void>} */
  const lectures = {
    faits: (demande) => {
      demandes.faits = demande;
      envoyer(donnees.envois.faits);
    },
    tous: (demande) => {
      demandes.vue = demande;
      envoyer(donnees.envois.tous);
    },
    regarder: (projet, demande) => {
      demandes.vue = demande;
      envoyer(donnees.envois.regarder?.[projet]);
    },
    onglet: (projet, id, demande) => {
      demandes.onglet = demande;
      envoyer(donnees.envois.onglet?.[`${projet}/${id}`]);
    },
    // Ce que le chef tape, et la taille du terminal : rien ne les reçoit.
    ecrire: () => undefined,
    redimensionner: () => undefined,
  };

  // Tout autre geste est invoqué : il rend sa réponse figée — rien, s'il n'en a pas. Chacun est
  // noté : capture.ts vérifie que la vue a bien démarré.
  /** @type {string[]} */
  const invoques = [];
  window.brigade = new Proxy(
    {},
    {
      get: (_, nom) => {
        if (typeof nom !== "string" || nom === "then") return undefined;
        if (nom.startsWith("sur")) return (/** @type {(...args: unknown[]) => void} */ ecouter) => void ecoutes.set(nom, ecouter);
        if (Object.hasOwn(lectures, nom)) return lectures[nom];
        return () => {
          invoques.push(nom);
          return new Promise((rendre) => plusTard(() => rendre(structuredClone(donnees.reponses[nom]))));
        };
      },
    },
  );

  // La page est posée quand rien n'est en route vers elle, que ses polices sont là, et que rien
  // n'y a bougé pendant plusieurs images de suite.
  let mouvements = 0;
  new MutationObserver(() => void mouvements++).observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
  const IMAGES_STABLES = 5;
  window.__capture = {
    demandes: invoques,
    async calme() {
      let stables = 0;
      let vus = -1;
      while (stables < IMAGES_STABLES) {
        await new Promise((suite) => requestAnimationFrame(() => suite(undefined)));
        await document.fonts.ready;
        if (enRoute === 0 && mouvements === vus) stables++;
        else {
          stables = 0;
          vus = mouvements;
        }
      }
    },
  };
})();
