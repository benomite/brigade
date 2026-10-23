// La lecture de la station appairée, sur le téléphone (#1414) : ce que les veilles du process principal font pour le
// desktop (app/src/main.ts), fait ici par le pont de l'app Android, au guichet de la station
// (runtime/src/telephone/guichet.ts) plutôt que par `ssh`. Il n'y a pas de process principal sur le téléphone : ce module
// tourne dans la WebView, à côté de la vue, chargé par le pont (app/android/web/pont.js) une fois le téléphone appairé.
//
// Ce qui est lu, toutes les trente secondes et quand la vue le demande :
//   - `GET /projects` : la liste des projets de la station, dans son ordre — la barre et « All projects » ;
//   - `GET /projects/<nom>/queue` : `facts` et `status` de chacun, lus par la station comme pour le desktop.
// Ce qui en est fait est ce que fait le desktop, par les mêmes modules d'app/src/ : `facts` passe par `tenirFaits`, et
// devient le rail et ses cartes ; `status`, son bloc `attend` mis à part (`mettreAPart`), passe par `attendre` ; la bande
// d'alertes et les lignes de l'accueil suivent (`tenirBandes`, `tenirAccueil`). La vue reçoit donc d'une file ce que le
// desktop reçoit de la même, au même instant.
//
// Ce qui ne se lit pas se dit, jamais un écran vide : la liste qui ne se lit pas garde les projets connus — ceux de la
// dernière liste lue, que le pont garde —, et `telephone.liste` dit pourquoi, par le motif de l'appairage (`injoignable`,
// `sans-guichet`, `inattendu`) ou `oublie`, le jeton que la station ne connaît plus. La file d'un projet qui ne se lit pas
// est un échec de lecture, comme une box que `ssh` ne joint pas : « the station did not answer ».
//
// Et les gestes de la fiche d'une carte (#1420) : ceux que le guichet porte — merger la livraison, retirer le ticket du
// rail, le renvoyer en cuisine —, proposés par la table du desktop (gestes-fiche.ts) et joués par `POST
// /projects/<nom>/gestures`. Ce que la station en a dit revient à la vue en une phrase, `fait` ou `refus`, et ce qu'elle
// a lancé et écrit au survol ; la vue relit la station quand il est fait.
import { tenirAccueil, type Accueil } from "../../src/accueil.ts";
import { tenirBandes, type Bande } from "../../src/alertes.ts";
import { mettreAPart, type Montree } from "../../src/attend.ts";
import { pourLaBarre, type Affichee } from "../../src/barre.ts";
import type { Echec, Lecture } from "../../src/box.ts";
import type { Projet } from "../../src/config.ts";
import { tenirFaits, type Dessinable } from "../../src/faits.ts";
import { ACTIONS, gestesDeCarte, type Actions, type IdDeFiche, type Propose } from "../../src/gestes-fiche.ts";

// Ce que le guichet a rendu : son code, et son corps — un objet, ou du texte que le HTTP natif n'a pas lu en JSON.
export type Reponse = { status: number; data: unknown };
// Un `GET` au guichet, avec le jeton du téléphone. Lève quand rien n'a répondu.
export type Requete = (chemin: string) => Promise<Reponse>;
// Un `POST` au guichet, avec le jeton du téléphone et ce corps en JSON. Lève quand rien n'a répondu.
export type Envoi = (chemin: string, corps: unknown) => Promise<Reponse>;
// Un projet tel que `GET /projects` le rend (runtime/src/telephone/projets.ts).
export type ProjetDuGuichet = { name: string; repository: string; state: string; reason?: string };
// La dernière lecture de la liste : lue, ou ce qui l'a empêchée — un motif et ce que le réseau ou la station en a dit.
export type Motif = { reason: "injoignable" | "sans-guichet" | "inattendu" | "oublie"; said: string };
export type ListeLue = { a: string; lue: true } | ({ a: string; lue: false } & Motif);
// Ce que le pont dit à la vue, par le nom de son abonnement (app/src/vue/pont.d.ts).
export type Dire = {
  (canal: "surConfiguration", configuration: Affichee, fermes: number[]): void;
  (canal: "surFaits", recue: Dessinable): void;
  (canal: "surLecture", montree: Montree, servies: undefined): void;
  (canal: "surAlertes", bande: Bande): void;
  (canal: "surAccueil", accueil: Accueil): void;
  (canal: "surTelephone", telephone: { appaire: true; station: string; adresse: string; liste?: ListeLue }): void;
};

export type Options = {
  requete: Requete;
  // Sans lui, aucun geste ne part.
  envoyer?: Envoi;
  // La station appairée, et l'adresse de son guichet.
  station: string;
  adresse: string;
  dire: Dire;
  // Les projets de la dernière liste lue, gardés par le pont : le téléphone les montre avant de relire, et quand la station ne répond pas.
  connus?: readonly ProjetDuGuichet[];
  garder?: (projets: ProjetDuGuichet[]) => void;
  maintenant?: () => Date;
  // Ce qui relance la lecture plus tard ; rend de quoi l'annuler.
  planifier?: (faire: () => void, ms: number) => () => void;
};

// Le rythme du desktop : chaque box est relue toutes les trente secondes.
export const INTERVALLE_MS = 30_000;
// Ce qu'un relais — `tailscale serve`, un proxy — répond quand rien n'écoute derrière lui.
const SANS_RIEN_DERRIERE = new Set([502, 503, 504]);

// Le corps d'une réponse, en objet quand il en est un.
function corpsDe(data: unknown): Record<string, unknown> | undefined {
  let lu = data;
  if (typeof lu === "string") {
    try {
      lu = JSON.parse(lu);
    } catch {
      return undefined;
    }
  }
  return typeof lu === "object" && lu !== null && !Array.isArray(lu) ? (lu as Record<string, unknown>) : undefined;
}
const ditDe = (erreur: unknown) => (erreur instanceof Error ? erreur.message : typeof erreur === "object" && erreur !== null && "message" in erreur ? String(erreur.message) : String(erreur));
const phraseDe = (corps: Record<string, unknown> | undefined) => (typeof corps?.said === "string" ? corps.said : undefined);

// Ce qu'une réponse qui n'est pas la bonne dit de la station : le motif de la liste qui ne se lit pas.
function motifDe(adresse: string, { status, data }: Reponse): Motif {
  const corps = corpsDe(data);
  const said = phraseDe(corps);
  if (status === 401) return { reason: "oublie", said: said ?? `${adresse} answered 401` };
  if (said === undefined && SANS_RIEN_DERRIERE.has(status)) return { reason: "sans-guichet", said: `${adresse} answered ${status}: nothing answers behind it` };
  return { reason: "inattendu", said: said ?? `${adresse} answered ${status}, not as a station's phone desk` };
}

// La liste rendue par le guichet, ou rien si ce n'en est pas une.
function projetsDe(data: unknown): ProjetDuGuichet[] | undefined {
  const liste = corpsDe(data)?.projects;
  if (!Array.isArray(liste)) return undefined;
  const lus = liste.filter((projet): projet is ProjetDuGuichet => typeof projet?.name === "string" && typeof projet.repository === "string" && typeof projet.state === "string");
  return lus.length === liste.length ? lus.map(({ name, repository, state, reason }) => ({ name, repository, state, ...(typeof reason === "string" ? { reason } : {}) })) : undefined;
}

// La file d'un projet, telle que la veille du desktop la rendrait de `ssh` : les sorties de `facts` et de `status`, mot
// pour mot, ou ce qui a été obtenu à leur place.
function fileDe(adresse: string, reponse: Reponse): { sorties: { facts: string; status: string } } | Echec {
  const corps = corpsDe(reponse.data);
  if (reponse.status === 200 && typeof corps?.facts === "object" && corps.facts !== null && typeof corps.status === "string") return { sorties: { facts: JSON.stringify(corps.facts), status: corps.status } };
  const said = phraseDe(corps);
  if (reponse.status === 401) return { erreur: said ?? `${adresse} answered 401`, atteinte: true, cas: "sans-droit" };
  if (reponse.status === 404 && said !== undefined) return { erreur: said, atteinte: true, cas: "projet-inconnu" };
  if (said === undefined && SANS_RIEN_DERRIERE.has(reponse.status)) return { erreur: `${adresse} answered ${reponse.status}: nothing answers behind it`, atteinte: false, cas: null };
  return { erreur: said ?? `${adresse} answered ${reponse.status}, not as a station's phone desk`, atteinte: true, cas: null };
}

// Les gestes de la fiche que le guichet de la station porte (runtime/src/telephone/gestes.ts), par le nom qu'il leur
// donne : chacun y joue la commande que le desktop lance pour le même bouton (gestes-fiche.ts, `ACTIONS`). Les autres
// gestes de la fiche — ouvrir l'issue ou la PR, demander au second, changer la priorité — ne se proposent pas sur le
// téléphone : rien ne les y joue.
export const GESTES_DU_GUICHET = { merger: "merge", retirer: "remove", cuisine: "back-to-kitchen" } as const satisfies Partial<Record<IdDeFiche, string>>;
const ACTIONS_DU_TELEPHONE: Actions = Object.fromEntries(Object.entries(ACTIONS).filter(([id]) => Object.hasOwn(GESTES_DU_GUICHET, id)));
// Ce qu'un geste a donné, tel que la vue le dit sur la fiche (app/src/vue/pont.d.ts, `gesteDeFiche`).
export type RenduDuGeste = { fait: string; detail: string } | { refus: string; detail: string };
// Ce que le réseau dit d'une demande qui n'a pas joint la station : rien n'est parti. Toute autre erreur — la réponse
// qui n'arrive pas à temps — laisse ouvert si le geste a été fait.
const PAS_JOINTE = /failed to connect|unable to resolve host|connection refused|ECONNREFUSED|ENETUNREACH|EHOSTUNREACH|network is unreachable|no route to host/i;

// Un projet de la station, tel que la barre le reçoit : son nom, son dépôt, et sa station en guise de box — ce qui se lit.
// Aucun dossier : rien n'est ouvert sur le téléphone.
const projetDe = (station: string, { name, repository }: ProjetDuGuichet): Projet => ({ nom: name, dossier: "", depot: repository, box: { hote: station } });

export function ouvrirLaLecture(options: Options) {
  const { requete, station, adresse, dire } = options;
  const maintenant = options.maintenant ?? (() => new Date());
  const planifier =
    options.planifier ??
    ((faire, ms) => {
      const minuterie = setTimeout(faire, ms);
      return () => clearTimeout(minuterie);
    });
  const faits = tenirFaits();
  const bandes = tenirBandes({ maintenant: () => maintenant().getTime() });
  let projets: ProjetDuGuichet[] = [...(options.connus ?? [])];
  const accueil = tenirAccueil({ projets: () => projets.map(({ name }) => ({ nom: name, box: true, desinstalle: false })), maintenant: () => maintenant().getTime() });
  let liste: ListeLue | undefined;
  // Les demandes de la vue : celle des faits (la barre), celle de l'écran affiché, et les projets dont il lit `status`.
  let demandeFaits: number | undefined;
  let demandeVue = 0;
  let vus: string[] = [];

  const configuration = (): Affichee => pourLaBarre({ chemin: `${adresse} — the phone desk of ${station}`, projets: projets.map((projet) => projetDe(station, projet)), hotes: [station] });
  const telephone = () => ({ appaire: true as const, station, adresse, ...(liste === undefined ? {} : { liste }) });
  const direLAccueil = (vu: Accueil | undefined) => {
    if (vu !== undefined) dire("surAccueil", vu);
  };

  // Une lecture de la liste, puis de la file de chaque projet.
  async function lireTout(): Promise<void> {
    const a = () => maintenant().toISOString();
    let empechee: Echec | undefined;
    try {
      const rendue = await requete("/projects");
      const lus = rendue.status === 200 ? projetsDe(rendue.data) : undefined;
      if (lus === undefined) {
        const motif: Motif = rendue.status === 200 ? { reason: "inattendu", said: `${adresse} answered 200 without a list of projects` } : motifDe(adresse, rendue);
        liste = { a: a(), lue: false, ...motif };
        empechee = { erreur: motif.said, atteinte: true, cas: motif.reason === "oublie" ? "sans-droit" : null };
      } else {
        liste = { a: a(), lue: true };
        if (JSON.stringify(lus) !== JSON.stringify(projets)) {
          projets = lus;
          options.garder?.(lus);
          dire("surConfiguration", configuration(), []);
          direLAccueil(accueil.relire());
        }
      }
    } catch (erreur) {
      const said = ditDe(erreur);
      liste = { a: a(), lue: false, reason: "injoignable", said };
      empechee = { erreur: said, atteinte: false, cas: null };
    }
    dire("surTelephone", telephone());
    for (const { name } of projets) {
      let file: ReturnType<typeof fileDe>;
      if (empechee !== undefined) file = empechee;
      else {
        try {
          file = fileDe(adresse, await requete(`/projects/${encodeURIComponent(name)}/queue`));
        } catch (erreur) {
          file = { erreur: ditDe(erreur), atteinte: false, cas: null };
        }
      }
      recevoir(name, a(), file);
    }
  }

  // Ce que le desktop fait d'une lecture de `facts`, puis de `status` quand l'écran affiché le lit.
  function recevoir(projet: string, a: string, file: ReturnType<typeof fileDe>): void {
    if (demandeFaits !== undefined) {
      const lecture: Lecture = "sorties" in file ? { projet, demande: demandeFaits, a, sorties: [{ commande: "facts", texte: file.sorties.facts }] } : { projet, demande: demandeFaits, a, ...file };
      dire("surFaits", faits.recevoir(lecture));
      dire("surAlertes", bandes.faits(lecture));
      direLAccueil(accueil.faits(lecture));
    }
    if (!vus.includes(projet)) return;
    const montree = mettreAPart("sorties" in file ? { projet, demande: demandeVue, a, sorties: [{ commande: "status", texte: file.sorties.status }] } : { projet, demande: demandeVue, a, ...file });
    dire("surLecture", montree, undefined);
    const redessine = faits.attendre(montree);
    if (redessine !== undefined) dire("surFaits", redessine);
    dire("surAlertes", bandes.status(montree));
    direLAccueil(accueil.status(montree));
  }

  // Une lecture à la fois : une demande qui arrive pendant l'une est servie juste après elle. La suivante part trente
  // secondes après la dernière.
  let enCours: Promise<void> | undefined;
  let encore = false;
  let annuler: (() => void) | undefined;
  function lire(): Promise<void> {
    if (enCours !== undefined) {
      encore = true;
      return enCours;
    }
    annuler?.();
    annuler = undefined;
    enCours = (async () => {
      do {
        encore = false;
        await lireTout();
      } while (encore);
    })().finally(() => {
      enCours = undefined;
      annuler = planifier(() => void lire(), INTERVALLE_MS);
    });
    return enCours;
  }

  // Les projets dont `status` est lu désormais : ce qui était tenu des autres est lâché, comme sur le desktop.
  function regarderLes(lus: string[], demande: number): Promise<void> {
    demandeVue = demande;
    vus = lus;
    for (const redessine of faits.veiller(vus)) dire("surFaits", redessine);
    for (const bande of bandes.veiller(vus)) dire("surAlertes", bande);
    direLAccueil(accueil.veiller(vus));
    return lire();
  }

  // Un geste de la fiche, joué au guichet : la phrase de la station, ou ce qui l'a empêché. Une réponse qui n'est pas
  // venue, ou une station qui n'a pas su dire si la commande l'a fait, ne dit pas que rien n'a changé : la station est
  // relue, et la file dit ce qu'il en est.
  async function geste(projet: string, id: unknown, ticket: unknown): Promise<RenduDuGeste> {
    const nom = typeof id === "string" && Object.hasOwn(GESTES_DU_GUICHET, id) ? GESTES_DU_GUICHET[id as keyof typeof GESTES_DU_GUICHET] : undefined;
    if (nom === undefined) return { refus: "nothing was sent: this phone does not carry this action to its station", detail: `“${String(id)}” is not a gesture of ${station}'s phone desk` };
    if (typeof ticket !== "number" || !Number.isSafeInteger(ticket) || ticket < 1) return { refus: "nothing was sent: the action names no ticket", detail: "" };
    if (options.envoyer === undefined) return { refus: "nothing was sent: this phone sends nothing to its station", detail: "" };
    let rendue: Reponse;
    try {
      rendue = await options.envoyer(`/projects/${encodeURIComponent(projet)}/gestures`, { gesture: nom, ticket });
    } catch (erreur) {
      const said = ditDe(erreur);
      if (PAS_JOINTE.test(said)) return { refus: `${station} could not be reached: nothing was changed`, detail: said };
      void lire();
      return { refus: `${station} did not answer: the next read shows whether it went through`, detail: said };
    }
    const corps = corpsDe(rendue.data);
    const said = phraseDe(corps);
    const detail = typeof corps?.detail === "string" ? corps.detail : "";
    if (rendue.status === 200 && corps?.done === true) return { fait: said ?? `#${ticket}: done`, detail };
    if (rendue.status === 401) return { refus: `${station} no longer knows this phone: pair it again`, detail: said ?? `${adresse} answered 401` };
    // 502 : la commande n'a pas rendu de verdict.
    if (rendue.status === 502 && said !== undefined) void lire();
    if (said !== undefined) return { refus: said, detail: detail === "" ? `${adresse} answered ${rendue.status}` : detail };
    const motif = motifDe(adresse, rendue);
    return { refus: motif.reason === "sans-guichet" ? `${station}'s phone desk does not answer: nothing was changed` : `what answers at ${adresse} is not ${station}'s phone desk: nothing was changed`, detail: motif.said };
  }

  return {
    configuration,
    telephone,
    // Les gestes de la fiche de cette carte que le téléphone joue, dans l'ordre et avec le prix du desktop.
    gestesDeFiche: (carte: unknown): Propose[] => gestesDeCarte(carte, ACTIONS_DU_TELEPHONE),
    geste,
    // La barre est posée : chaque projet a sa bande, et ses faits sont lus.
    faits(demande: number): Promise<void> {
      demandeFaits = demande;
      for (const bande of bandes.ouvrir(projets.map(({ name }) => name))) dire("surAlertes", bande);
      return lire();
    },
    tous: (demande: number) => regarderLes(projets.map(({ name }) => name), demande),
    regarder: (projet: string, demande: number) => regarderLes([projet], demande),
    // « réessayer maintenant » : la station est relue tout de suite.
    relire: () => lire(),
    // L'onglet affiché n'a pas de lecture propre sur le téléphone : son contenu vient des faits et de `status`.
    onglet: (_projet: string | undefined, _id: string | undefined, _demande: number) => undefined,
  };
}
