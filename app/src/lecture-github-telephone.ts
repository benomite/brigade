// La lecture des projets sur le téléphone, de GitHub seul (#2501, épique #2498) : avec la session GitHub du chef (le
// ticket 2500, le jeton du coffre du téléphone), l'app Android lit l'état de chaque cuisine sur GitHub, comme le desktop
// — aucune station n'est jointe, aucune adresse de station n'est demandée. Toutes les demandes partent à l'API de GitHub
// (tableau/client.ts, `clientGitHub`), par l'envoi que la plateforme donne — le HTTP natif de Capacitor sur le téléphone
// (`parCapacitor`), github.com ne répondant pas à une WebView.
//
// Ce qui est lu, toutes les trente secondes et quand la vue le demande :
//   - les projets du chef : ceux que l'app a demandés à ses stations, écrits sur GitHub dans le gist de chacune, sous son
//     compte — `brigade-projets.json` (projets/demande.ts, un nom et un dépôt par projet) et `brigade-selection.json`
//     (runtime/src/enregistrement-station/contrat.ts, des dépôts, chacun nommé comme la station le nomme). Un même dépôt
//     n'est qu'un projet ; rangés par nom ;
//   - le rail et TODO de chacun : la lecture même du desktop (main.ts, `lireLeTableau`) — `lireLeTableauDuDepot`, puis
//     ce qui attend le chef (`avecCeQuiAttendLeChef`), partagé pour le compte connecté (vue/cartes-assignees/), en
//     lectures conditionnelles dont un 304 ne coûte rien.
// Ce qui en est fait est ce que fait le desktop, par les mêmes modules : `facts` passe par `tenirFaits` et devient le
// rail et ses cartes ; `status`, son bloc `attend` mis à part (`mettreAPart`), passe par `attendre` et pose TODO ; la
// bande d'alertes, les lignes de l'accueil, l'activité des cooks et, dans l'espace d'un projet, ce qui est avant le rail
// suivent. La vue reçoit donc d'un projet ce que le desktop reçoit du même, à la même lecture de GitHub.
//
// Ce qui ne se lit pas se dit, jamais un écran vide : la liste qui ne se lit pas garde les projets connus — ceux de la
// dernière liste lue, que le pont garde —, et `liste` dit pourquoi : GitHub pas joint (`injoignable`), la session GitHub
// refusée (`oublie`, se reconnecter), ou un autre refus (`inattendu`). Le rail d'un projet qui ne se lit pas est l'échec
// que le desktop montre, sa raison en une phrase. Un projet sans rien — ni ticket, ni attente — est un rail vide lu, et
// « nothing awaits the chef ».
//
// Et les gestes du chef (#2502) : ce que la vue écrit — répondre à une carte de TODO, reprendre, mettre en suspens —
// s'écrit sur GitHub par les gestes du téléphone (gestes-github-telephone.ts, le code d'écriture du desktop), sur ce que
// la dernière lecture de chaque projet a lu : son dépôt, son dernier rail lu, la carte du chef d'un ticket. Une écriture
// que GitHub a prise relance la lecture, qui la montre ; aucune station n'est jointe pour l'écrire.
import { tenirAccueil, type Accueil } from "./accueil.ts";
import { tenirBandes, type Bande } from "./alertes.ts";
import { tenirAmont, type Vu as VuAmont } from "./amont.ts";
import { mettreAPart } from "./attend.ts";
import { pourLaBarre, type Affichee } from "./barre.ts";
import type { Projet } from "./config.ts";
import { tenirFaits, type Dessinable } from "./faits.ts";
import { pageDesFaits } from "./lecture-seule.ts";
import { ouvrirLesGestesGitHub } from "./gestes-github-telephone.ts";
import type { EnvoiGitHub } from "./priorite.ts";
import { FICHIER_PROJETS, lireDemande } from "./projets/demande.ts";
import { nomDuProjet } from "./projets/projets.ts";
import { avecCeQuiAttendLeChef } from "./tableau/attente-du-chef.ts";
import { partageDesCartesAssignees } from "./vue/cartes-assignees/cartes-assignees.ts";
import { clientGitHub, corpsLu, refusDe, type AppelGitHub, type Envoi, type ReponseGitHub } from "./tableau/client.ts";
import { activitesPubliees, lireLeTableauDuDepot, type ActivitesPubliees, type LectureDuTableauDuDepot, type TableauLu } from "./tableau/lecture.ts";
import { lectureConditionnelle, type MemoireDesLectures } from "./tableau/rail-github.ts";
import { AMONT, FAITS, lectureDuTableau, STATUS } from "./tableau/rail.ts";
import { FICHIER_SELECTION, selectionLue } from "../../runtime/src/enregistrement-station/contrat.ts";

// Un projet du chef, tel que GitHub le dit : son nom, et son dépôt `<owner>/<repo>`.
export type ProjetDuCompte = { nom: string; depot: string };
// La dernière lecture de la liste : lue, ou ce qui l'a empêchée — un motif, et ce que GitHub ou le réseau en a dit. La
// forme est celle de la liste du téléphone appairé (vue/pont.d.ts, `ListeDuTelephone`), ses motifs ceux que GitHub donne.
export type Motif = { reason: "injoignable" | "oublie" | "inattendu"; said: string };
export type ListeLue = { a: string; lue: true } | ({ a: string; lue: false } & Motif);
// Le téléphone, tel que la vue le reçoit : connecté à GitHub — le compte, nul quand il n'est pas dit —, sans station.
export type TelephoneGitHub = { github: { compte: string | null }; liste?: ListeLue };
// Ce que la lecture dit à la vue, par le nom de son abonnement (app/src/vue/pont.d.ts).
export type Dire = {
  (canal: "surConfiguration", configuration: Affichee, fermes: number[]): void;
  (canal: "surFaits", recue: Dessinable): void;
  (canal: "surAlertes", bande: Bande): void;
  (canal: "surAccueil", accueil: Accueil): void;
  (canal: "surActivites", publiees: ActivitesPubliees): void;
  (canal: "surAmont", vu: VuAmont): void;
  (canal: "surTelephone", telephone: TelephoneGitHub): void;
};

export type Options = {
  // Le jeton GitHub du chef — celui du coffre du téléphone ; nul sans lui, et GitHub dit ce qu'il refuse.
  jeton: () => Promise<string | null>;
  // Ce qui porte une demande à l'API de GitHub (`parCapacitor` sur le téléphone).
  envoyer: Envoi;
  // Ce qui porte une écriture à l'API de GitHub (`ecritureParCapacitor` sur le téléphone) : sans lui, aucun geste ne part.
  ecrire?: EnvoiGitHub;
  dire: Dire;
  // Le compte GitHub sous lequel le téléphone est connecté, quand il est su.
  compte?: string | null;
  // Les projets de la dernière liste lue, gardés par le pont : le téléphone les montre avant de relire, et quand la liste
  // ne se lit pas.
  connus?: readonly ProjetDuCompte[];
  garder?: (projets: ProjetDuCompte[]) => void;
  maintenant?: () => Date;
  // Ce qui relance la lecture plus tard ; rend de quoi l'annuler.
  planifier?: (faire: () => void, ms: number) => () => void;
};

// Le rythme du desktop : chaque projet est relu toutes les trente secondes.
export const INTERVALLE_MS = 30_000;
const PAR_PAGE = 100;
const PAGES_AU_PLUS = 30;

// Ce que le HTTP natif de Capacitor rend d'une demande : son code, son corps — un objet, ou du texte qu'il n'a pas lu en
// JSON —, et ses en-têtes.
export type ReponseNative = { status: number; data: unknown; headers?: Record<string, string> };
// L'envoi d'une lecture par le HTTP natif de Capacitor (`CapacitorHttp.request`) : un `GET`, ses en-têtes, et l'ETag de
// la réponse, quel que soit le nom que le téléphone donne à son en-tête.
export function parCapacitor(requete: (options: { url: string; method: "GET"; headers: Record<string, string> }) => Promise<ReponseNative>): Envoi {
  return async (adresse, entetes) => {
    const { status, data, headers = {} } = await requete({ url: adresse, method: "GET", headers: entetes });
    const etag = Object.entries(headers).find(([nom]) => nom.toLowerCase() === "etag")?.[1];
    return { status, data: typeof data === "string" ? corpsLu(data) : data, ...(typeof etag === "string" && etag !== "" ? { etag } : {}) };
  };
}

class Refus extends Error {
  readonly motif: Motif;
  constructor(motif: Motif) {
    super(motif.said);
    this.motif = motif;
  }
}

type Brut = Record<string, unknown>;
const objet = (valeur: unknown): Brut | null => (typeof valeur === "object" && valeur !== null && !Array.isArray(valeur) ? (valeur as Brut) : null);
const ditDe = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur)).trim().split("\n")[0]?.replace(/[.\s]+$/, "") ?? "";

// La réponse de GitHub, ou le refus de la liste : `quoi` nomme ce qui était demandé.
function donneesDe(reponse: ReponseGitHub, quoi: string): unknown {
  if (reponse.status === 200) return reponse.data;
  return new Refus({ reason: reponse.status === 401 ? "oublie" : "inattendu", said: refusDe(quoi, reponse).message });
}

// Les projets du chef, lus dans les gists de ses stations. Lève un `Refus` quand GitHub refuse, une erreur quand il ne
// répond pas.
export async function lireLesProjetsDuCompte(appeler: AppelGitHub): Promise<ProjetDuCompte[]> {
  const gists: string[] = [];
  for (let page = 1; page <= PAGES_AU_PLUS; page++) {
    const rendus = donneesDe(await appeler(`/gists?per_page=${PAR_PAGE}&page=${page}`), "the list of your gists, where your stations keep your projects");
    if (rendus instanceof Refus) throw rendus;
    if (!Array.isArray(rendus)) throw new Refus({ reason: "inattendu", said: "GitHub answered the list of your gists with something that is not a list, so your projects could not be read" });
    for (const gist of rendus) {
      const fichiers = objet(objet(gist)?.files);
      const id = objet(gist)?.id;
      if (typeof id === "string" && fichiers !== null && (FICHIER_PROJETS in fichiers || FICHIER_SELECTION in fichiers)) gists.push(id);
    }
    if (rendus.length < PAR_PAGE) break;
  }
  const projets = new Map<string, ProjetDuCompte>();
  const ajouter = (nom: string, depot: string) => {
    const cle = depot.toLowerCase();
    if (nom !== "" && !projets.has(cle)) projets.set(cle, { nom, depot });
  };
  const parSelection: string[] = [];
  for (const id of gists) {
    const reponse = await appeler(`/gists/${encodeURIComponent(id)}`);
    // Supprimé entre la liste et sa lecture : il ne porte plus rien.
    if (reponse.status === 404) continue;
    const gist = donneesDe(reponse, "a gist of your stations");
    if (gist instanceof Refus) throw gist;
    const fichiers = objet(objet(gist)?.files) ?? {};
    const contenu = (nom: string) => {
      const texte = objet(fichiers[nom])?.content;
      return typeof texte === "string" ? texte : undefined;
    };
    for (const { nom, depot } of lireDemande(contenu(FICHIER_PROJETS)) ?? []) ajouter(nom, depot);
    const selection = contenu(FICHIER_SELECTION);
    if (selection !== undefined) parSelection.push(...(selectionLue(selection)?.repositories ?? []));
  }
  // Un dépôt demandé sous un nom garde ce nom ; un dépôt choisi seulement prend celui que la station lui donne.
  for (const depot of parSelection) ajouter(nomDuProjet(depot), depot);
  return [...projets.values()].sort((a, b) => a.nom.localeCompare(b.nom) || a.depot.localeCompare(b.depot));
}

// Un projet du chef, tel que la barre le reçoit : son nom, son dépôt. Aucun dossier : rien n'est ouvert sur le téléphone.
const projetDe = ({ nom, depot }: ProjetDuCompte): Projet => ({ nom, dossier: "", depot });

export function ouvrirLaLectureGitHub(options: Options) {
  const { dire } = options;
  const maintenant = options.maintenant ?? (() => new Date());
  const planifier =
    options.planifier ??
    ((faire, ms) => {
      const minuterie = setTimeout(faire, ms);
      return () => clearTimeout(minuterie);
    });
  // Le seul chemin des demandes : l'API de GitHub. Les réponses gardées avec leur ETag, par dépôt — et une pour les gists.
  const appeler = clientGitHub({ jeton: options.jeton, envoyer: options.envoyer });
  const memoires = new Map<string, MemoireDesLectures>();
  const memoire = (cle: string): MemoireDesLectures => memoires.get(cle) ?? memoires.set(cle, new Map()).get(cle)!;
  const lireLesGists = lectureConditionnelle(appeler, memoire(""));

  const faits = tenirFaits();
  const bandes = tenirBandes({ maintenant: () => maintenant().getTime() });
  const amonts = tenirAmont();
  let projets: ProjetDuCompte[] = [...(options.connus ?? [])];
  // La dernière lecture réussie du rail de chaque projet, par son nom : c'est elle que visent les gestes du chef, comme
  // ceux du desktop (tableau/rail.ts, `dernier`).
  const derniers = new Map<string, TableauLu>();
  const accueil = tenirAccueil({ projets: () => projets.map(({ nom }) => ({ nom, servi: true })), maintenant: () => maintenant().getTime() });
  let liste: ListeLue | undefined;
  // Les demandes de la vue : celle des faits (la barre), celle de l'écran affiché, les projets dont il lit `status`, et
  // celui dont l'espace est ouvert — ce qui est avant son rail se lit aussi.
  let demandeFaits: number | undefined;
  let demandeVue = 0;
  let vus: string[] = [];
  let espace: string | undefined;

  const configuration = (): Affichee => pourLaBarre({ chemin: "GitHub — the projects your stations serve", projets: projets.map(projetDe) }, () => true);
  const telephone = (): TelephoneGitHub => ({ github: { compte: options.compte ?? null }, ...(liste === undefined ? {} : { liste }) });
  const direLAccueil = (vu: Accueil | undefined) => {
    if (vu !== undefined) dire("surAccueil", vu);
  };

  // La lecture du desktop pour un projet : son rail, puis ce qui attend le chef. Ne lève pas.
  async function lireLeProjet({ depot }: ProjetDuCompte): Promise<LectureDuTableauDuDepot> {
    try {
      const lu = await lireLeTableauDuDepot({ depot, appeler, memoire: memoire(depot), maintenant });
      const lecteur = lectureConditionnelle(appeler, memoire(depot));
      // Les cartes du compte connecté, et celles d'un autre humain sous « Awaiting others », comme au desktop (#2985).
      return await avecCeQuiAttendLeChef(lu, lecteur, partageDesCartesAssignees({ appeler: lecteur, depot, login: async () => options.compte ?? null }));
    } catch (erreur) {
      return { lu: false, depot, luLe: maintenant().toISOString(), raison: `The rail of ${depot} was not read from GitHub: ${ditDe(erreur)}.` };
    }
  }

  // Une lecture de la liste, puis du rail de chaque projet — ceux qu'elle a lus, ou les connus quand elle ne se lit pas.
  async function lireTout(): Promise<void> {
    const a = maintenant().toISOString();
    try {
      const lus = await lireLesProjetsDuCompte(lireLesGists);
      liste = { a, lue: true };
      if (JSON.stringify(lus) !== JSON.stringify(projets)) {
        projets = lus;
        options.garder?.(lus);
        dire("surConfiguration", configuration(), []);
        direLAccueil(accueil.relire());
      }
    } catch (erreur) {
      const motif: Motif = erreur instanceof Refus ? erreur.motif : { reason: "injoignable", said: `GitHub could not be reached to list your projects: ${ditDe(erreur)}` };
      liste = { a, lue: false, ...motif };
    }
    dire("surTelephone", telephone());
    for (const projet of projets) recevoir(projet.nom, await lireLeProjet(projet));
  }

  // Ce que le desktop fait d'une lecture du rail : `facts` pour la barre et le rail, `status` pour l'écran affiché, et ce
  // qui est avant le rail pour l'espace ouvert.
  function recevoir(projet: string, lu: LectureDuTableauDuDepot): void {
    if (lu.lu) derniers.set(projet, lu);
    if (demandeFaits !== undefined) {
      const lecture = lectureDuTableau(lu, projet, demandeFaits, [FAITS]);
      dire("surFaits", faits.recevoir(lecture));
      if (lu.lu) dire("surActivites", activitesPubliees(projet, lu));
      dire("surAlertes", bandes.faits(lecture));
      direLAccueil(accueil.faits(lecture));
    }
    if (vus.includes(projet)) {
      const montree = mettreAPart(lectureDuTableau(lu, projet, demandeVue, [STATUS]));
      const redessine = faits.attendre(montree);
      if (redessine !== undefined) dire("surFaits", redessine);
      dire("surAlertes", bandes.status(montree));
      direLAccueil(accueil.status(montree));
    }
    if (espace === projet) dire("surAmont", amonts.recevoir(lectureDuTableau(lu, projet, demandeVue, [AMONT])));
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
  function regarderLes(lus: string[], demande: number, ouvert: string | undefined): Promise<void> {
    demandeVue = demande;
    vus = lus;
    espace = ouvert;
    amonts.veiller(ouvert === undefined ? [] : [ouvert]);
    for (const redessine of faits.veiller(vus)) dire("surFaits", redessine);
    for (const bande of bandes.veiller(vus)) dire("surAlertes", bande);
    direLAccueil(accueil.veiller(vus));
    return lire();
  }

  // Les gestes du chef, écrits sur GitHub avec le même jeton : rien ne part sans `ecrire`.
  const sansEcriture: EnvoiGitHub = async () => {
    throw new Error("this phone has nothing to write to GitHub with");
  };
  const gestes = ouvrirLesGestesGitHub({
    jeton: options.jeton,
    appeler,
    envoyer: options.ecrire ?? sansEcriture,
    depot: (projet) => projets.find(({ nom }) => nom === projet)?.depot,
    dernier: (projet) => derniers.get(projet),
    chef: (projet, ticket) => faits.chef(projet, ticket),
    // La prochaine lecture va à GitHub tout de suite, et montre l'écriture.
    ecrit: () => void lire(),
  });

  return {
    configuration,
    telephone,
    gestes,
    // La barre est posée : chaque projet a sa bande, et son rail est lu.
    faits(demande: number): Promise<void> {
      demandeFaits = demande;
      for (const bande of bandes.ouvrir(projets.map(({ nom }) => nom))) dire("surAlertes", bande);
      return lire();
    },
    tous: (demande: number) => regarderLes(projets.map(({ nom }) => nom), demande, undefined),
    regarder: (projet: string, demande: number) => regarderLes([projet], demande, projet),
    // « réessayer maintenant » : GitHub est relu tout de suite.
    relire: () => lire(),
    // Un lien de la ligne d'un projet en lecture seule (ticket 3163) : la page, pour le seul dépôt que sa dernière lecture
    // dit en lecture seule — rien sinon.
    pageDeLaLectureSeule: (projet: unknown, page: unknown): string | undefined => (typeof projet === "string" ? pageDesFaits(derniers.get(projet)?.faits, page) : undefined),
    // L'onglet affiché n'a pas de lecture propre sur le téléphone : son contenu vient du rail lu.
    onglet: (_projet: string | undefined, _id: string | undefined, _demande: number) => undefined,
  };
}
