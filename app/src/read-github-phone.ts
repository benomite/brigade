// La lecture des projets sur le téléphone, de GitHub seul (#2501, épique #2498) : avec la session GitHub du chef (le
// ticket 2500, le jeton du coffre du téléphone), l'app Android lit l'état de chaque cuisine sur GitHub, comme le desktop
// — aucune station n'est jointe, aucune adresse de station n'est demandée. Toutes les demandes partent à l'API de GitHub
// (tableau/client.ts, `clientGitHub`), par l'envoi que la plateforme donne — le HTTP natif de Capacitor sur le téléphone
// (`parCapacitor`), github.com ne répondant pas à une WebView.
//
// Ce qui est lu, toutes les trente secondes et quand la vue le demande :
//   - les projets du chef : ceux que l'app a demandés à ses stations, écrits sur GitHub dans le gist de chacune, sous son
//     compte — `brigade-projets.json` (projects/request.ts, un nom et un dépôt par projet) et `brigade-selection.json`
//     (runtime/src/enregistrement-station/contrat.ts, des dépôts, chacun nommé comme la station le nomme). Un même dépôt
//     n'est qu'un projet ; rangés par nom ;
//   - le rail et TODO de chacun : la lecture même du desktop (main.ts, `lireLeTableau`) — `lireLeTableauDuDepot`, puis
//     ce qui attend le chef (`avecCeQuiAttendLeChef`), partagé pour le compte connecté (vue/cards-assignees/), en
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
// s'écrit sur GitHub par les gestes du téléphone (actions-github-phone.ts, le code d'écriture du desktop), sur ce que
// la dernière lecture de chaque projet a lu : son dépôt, son dernier rail lu, la carte du chef d'un ticket. Une écriture
// que GitHub a prise relance la lecture, qui la montre ; aucune station n'est jointe pour l'écrire. Et les captures d'une
// carte (ticket 3185) : chaque image, à l'adresse que la dernière lecture donne, lue sur l'API de GitHub (`capture`).
import { holdHome, type Home } from "./home.ts";
import { holdBandes, type Bande } from "./alerts.ts";
import { holdAmont, type Vu as VuAmont } from "./amont.ts";
import { mettreAPart } from "./awaiting.ts";
import { pourLaBar, type Affichee } from "./bar.ts";
import type { Project } from "./config.ts";
import { holdFacts, type Dessinable } from "./facts.ts";
import { pageDesFacts } from "./read-only.ts";
import { lireCaptureSurLAPI, type Image } from "./captures.ts";
import { ouvrirLesActionsGitHub } from "./actions-github-phone.ts";
import { clientDeLaPriority, type EnvoiGitHub } from "./priority.ts";
import { FICHIER_PROJECTS, lireRequest } from "./projects/request.ts";
import { nameDuProject } from "./projects/projects.ts";
import { avecCeQuiAwaitingLeChef } from "./tableau/wait-du-chef.ts";
import { partageDesCardsAssignees } from "./vue/cards-assignees/cards-assignees.ts";
import { clientGitHub, corpsLu, refusalDe, type CallGitHub, type Envoi, type AnswerGitHub } from "./tableau/client.ts";
import { activitiesPubliees, lireLeTableauDuRepository, type ActivitiesPubliees, type ReadDuTableauDuRepository, type TableauLu } from "./tableau/read.ts";
import { readConditionnelle, type MemoireDesLectures } from "./tableau/rail-github.ts";
import { AMONT, FACTS, readDuTableau, STATUS } from "./tableau/rail.ts";
import { poserLaTrace } from "./phone-connecte.ts";
import { FICHIER_ENREGISTREMENT, FICHIER_SELECTION, selectionLue } from "../../runtime/src/enregistrement-station/contrat.ts";
import { pauseDuAccount, signeDeLEnregistrement, type PauseDuAccount, type Signe } from "./vue/pause-quota/pause-quota.ts";

// Un projet du chef, tel que GitHub le dit : son nom, et son dépôt `<owner>/<repo>`.
export type ProjectDuAccount = { nom: string; depot: string };
// La dernière lecture de la liste : lue, ou ce qui l'a empêchée — un motif, et ce que GitHub ou le réseau en a dit. La
// forme est celle de la liste du téléphone appairé (vue/pont.d.ts, `ListeDuTelephone`), ses motifs ceux que GitHub donne.
export type Motif = { reason: "injoignable" | "oublie" | "inattendu"; said: string };
export type ListeLue = { a: string; lue: true } | ({ a: string; lue: false } & Motif);
// Le téléphone, tel que la vue le reçoit : connecté à GitHub — le compte, nul quand il n'est pas dit —, sans station.
export type PhoneGitHub = { github: { compte: string | null }; liste?: ListeLue };
// Ce que la lecture dit à la vue, par le nom de son abonnement (app/src/vue/pont.d.ts).
export type Tell = {
  (canal: "surConfiguration", configuration: Affichee, fermes: number[]): void;
  (canal: "surFaits", recue: Dessinable): void;
  (canal: "surAlertes", bande: Bande): void;
  (canal: "surAccueil", home: Home): void;
  (canal: "surActivites", publiees: ActivitiesPubliees): void;
  (canal: "surAmont", vu: VuAmont): void;
  (canal: "surTelephone", phone: PhoneGitHub): void;
};

export type Options = {
  // Le jeton GitHub du chef — celui du coffre du téléphone ; nul sans lui, et GitHub dit ce qu'il refuse.
  jeton: () => Promise<string | null>;
  // Ce qui porte une demande à l'API de GitHub (`parCapacitor` sur le téléphone).
  envoyer: Envoi;
  // Ce qui porte une écriture à l'API de GitHub (`ecritureParCapacitor` sur le téléphone) : sans lui, aucun geste ne part.
  ecrire?: EnvoiGitHub;
  dire: Tell;
  // Le compte GitHub sous lequel le téléphone est connecté, quand il est su.
  compte?: string | null;
  // Les projets de la dernière liste lue, gardés par le pont : le téléphone les montre avant de relire, et quand la liste
  // ne se lit pas.
  connus?: readonly ProjectDuAccount[];
  garder?: (projects: ProjectDuAccount[]) => void;
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
export type AnswerNative = { status: number; data: unknown; headers?: Record<string, string> };
// L'envoi d'une lecture par le HTTP natif de Capacitor (`CapacitorHttp.request`) : un `GET`, ses en-têtes, et l'ETag de
// la réponse, quel que soit le nom que le téléphone donne à son en-tête.
export function parCapacitor(requete: (options: { url: string; method: "GET"; headers: Record<string, string> }) => Promise<AnswerNative>): Envoi {
  return async (adresse, entetes) => {
    const { status, data, headers = {} } = await requete({ url: adresse, method: "GET", headers: entetes });
    const etag = Object.entries(headers).find(([name]) => name.toLowerCase() === "etag")?.[1];
    return { status, data: typeof data === "string" ? corpsLu(data) : data, ...(typeof etag === "string" && etag !== "" ? { etag } : {}) };
  };
}

class Refusal extends Error {
  readonly motif: Motif;
  constructor(motif: Motif) {
    super(motif.said);
    this.motif = motif;
  }
}

type Brut = Record<string, unknown>;
const objet = (valeur: unknown): Brut | null => (typeof valeur === "object" && valeur !== null && !Array.isArray(valeur) ? (valeur as Brut) : null);
const ditDe = (error: unknown) => (error instanceof Error ? error.message : String(error)).trim().split("\n")[0]?.replace(/[.\s]+$/, "") ?? "";

// La réponse de GitHub, ou le refus de la liste : `quoi` nomme ce qui était demandé.
function donneesDe(answer: AnswerGitHub, quoi: string): unknown {
  if (answer.status === 200) return answer.data;
  return new Refusal({ reason: answer.status === 401 ? "oublie" : "inattendu", said: refusalDe(quoi, answer).message });
}

// Les projets du chef, lus dans les gists de ses stations. Lève un `Refus` quand GitHub refuse, une erreur quand il ne
// répond pas. `signes` reçoit le signe de vie et le quota GitHub de chaque station que ces gists enregistrent (ticket 3482) :
// la pause de quota du compte s'en tire, comme au desktop.
export async function lireLesProjectsDuAccount(appeler: CallGitHub, signes: Signe[] = []): Promise<ProjectDuAccount[]> {
  const gists: string[] = [];
  for (let page = 1; page <= PAGES_AU_PLUS; page++) {
    const rendus = donneesDe(await appeler(`/gists?per_page=${PAR_PAGE}&page=${page}`), "the list of your gists, where your stations keep your projects");
    if (rendus instanceof Refusal) throw rendus;
    if (!Array.isArray(rendus)) throw new Refusal({ reason: "inattendu", said: "GitHub answered the list of your gists with something that is not a list, so your projects could not be read" });
    for (const gist of rendus) {
      const fichiers = objet(objet(gist)?.files);
      const id = objet(gist)?.id;
      if (typeof id === "string" && fichiers !== null && (FICHIER_PROJECTS in fichiers || FICHIER_SELECTION in fichiers)) gists.push(id);
    }
    if (rendus.length < PAR_PAGE) break;
  }
  const projects = new Map<string, ProjectDuAccount>();
  const ajouter = (name: string, repository: string) => {
    const cle = repository.toLowerCase();
    if (name !== "" && !projects.has(cle)) projects.set(cle, { nom: name, depot: repository });
  };
  const parSelection: string[] = [];
  for (const id of gists) {
    const answer = await appeler(`/gists/${encodeURIComponent(id)}`);
    // Supprimé entre la liste et sa lecture : il ne porte plus rien.
    if (answer.status === 404) continue;
    const gist = donneesDe(answer, "a gist of your stations");
    if (gist instanceof Refusal) throw gist;
    const fichiers = objet(objet(gist)?.files) ?? {};
    const contenu = (name: string) => {
      const texte = objet(fichiers[name])?.content;
      return typeof texte === "string" ? texte : undefined;
    };
    for (const { nom: name, depot: repository } of lireRequest(contenu(FICHIER_PROJECTS)) ?? []) ajouter(name, repository);
    const signe = signeDeLEnregistrement(contenu(FICHIER_ENREGISTREMENT));
    if (signe !== null) signes.push(signe);
    const selection = contenu(FICHIER_SELECTION);
    if (selection !== undefined) parSelection.push(...(selectionLue(selection)?.repositories ?? []));
  }
  // Un dépôt demandé sous un nom garde ce nom ; un dépôt choisi seulement prend celui que la station lui donne.
  for (const repository of parSelection) ajouter(nameDuProject(repository), repository);
  return [...projects.values()].sort((a, b) => a.nom.localeCompare(b.nom) || a.depot.localeCompare(b.depot));
}

// Un projet du chef, tel que la barre le reçoit : son nom, son dépôt. Aucun dossier : rien n'est ouvert sur le téléphone.
const projectDe = ({ nom: name, depot: repository }: ProjectDuAccount): Project => ({ nom: name, dossier: "", depot: repository });

export function ouvrirLaReadGitHub(options: Options) {
  const { dire: tell } = options;
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
  const lireLesGists = readConditionnelle(appeler, memoire(""));

  const facts = holdFacts();
  const bandes = holdBandes({ maintenant: () => maintenant().getTime() });
  const amonts = holdAmont();
  let projects: ProjectDuAccount[] = [...(options.connus ?? [])];
  // La dernière lecture réussie du rail de chaque projet, par son nom : c'est elle que visent les gestes du chef, comme
  // ceux du desktop (tableau/rail.ts, `dernier`).
  const derniers = new Map<string, TableauLu>();
  const home = holdHome({ projets: () => projects.map(({ nom: name }) => ({ nom: name, servi: true })), maintenant: () => maintenant().getTime() });
  let liste: ListeLue | undefined;
  // La trace du téléphone connecté (#3303, phone-connecte.ts) : posée une fois par lancement, après une liste lue ;
  // ratée, elle se repose à la lecture suivante. Sans `ecrire`, rien ne part.
  let tracee = false;
  const poserLaTraceUneFois = async () => {
    if (tracee || options.ecrire === undefined) return;
    try {
      await poserLaTrace({ client: clientDeLaPriority({ jeton: options.jeton, appeler: lireLesGists, envoyer: options.ecrire }), maintenant });
      tracee = true;
    } catch {
      // Rien de posé : la lecture suivante réessaie, et la liste des projets n'en dépend pas.
    }
  };
  // Les demandes de la vue : celle des faits (la barre), celle de l'écran affiché, les projets dont il lit `status`, et
  // celui dont l'espace est ouvert — ce qui est avant son rail se lit aussi.
  let factsRequest: number | undefined;
  let requestVue = 0;
  let vus: string[] = [];
  let space: string | undefined;

  const configuration = (): Affichee => pourLaBar({ chemin: "GitHub — the projects your stations serve", projets: projects.map(projectDe) }, () => true);
  const phone = (): PhoneGitHub => ({ github: { compte: options.compte ?? null }, ...(liste === undefined ? {} : { liste }) });
  const tellLHome = (vu: Home | undefined) => {
    if (vu !== undefined) tell("surAccueil", vu);
  };

  // La pause de quota GitHub du compte (ticket 3482), de la dernière liste lue : chaque projet la porte dans `facts`, comme
  // au desktop. Une liste qui ne se lit pas la garde : la vue la retire d'elle-même à sa reprise.
  let pause: PauseDuAccount | null = null;
  const avecLaPauseDuAccount = (lue: ReadDuTableauDuRepository): ReadDuTableauDuRepository => (lue.lu && pause !== null ? { ...lue, faits: { ...lue.faits, pauseQuota: pause } } : lue);

  // La lecture du desktop pour un projet : son rail, puis ce qui attend le chef. Ne lève pas.
  async function lireLeProject({ depot: repository }: ProjectDuAccount): Promise<ReadDuTableauDuRepository> {
    try {
      const lu = await lireLeTableauDuRepository({ depot: repository, appeler, memoire: memoire(repository), maintenant });
      const lecteur = readConditionnelle(appeler, memoire(repository));
      // Les cartes du compte connecté, et celles d'un autre humain sous « Awaiting others », comme au desktop (#2985).
      const lue = await avecCeQuiAwaitingLeChef(lu, lecteur, partageDesCardsAssignees({ appeler: lecteur, depot: repository, login: async () => options.compte ?? null }));
      return avecLaPauseDuAccount(lue);
    } catch (error) {
      return { lu: false, depot: repository, luLe: maintenant().toISOString(), raison: `The rail of ${repository} was not read from GitHub: ${ditDe(error)}.` };
    }
  }

  // Une lecture de la liste, puis du rail de chaque projet — ceux qu'elle a lus, ou les connus quand elle ne se lit pas.
  async function lireTout(): Promise<void> {
    const a = maintenant().toISOString();
    try {
      const signes: Signe[] = [];
      const lus = await lireLesProjectsDuAccount(lireLesGists, signes);
      pause = pauseDuAccount(signes, maintenant().getTime());
      liste = { a, lue: true };
      await poserLaTraceUneFois();
      if (JSON.stringify(lus) !== JSON.stringify(projects)) {
        projects = lus;
        options.garder?.(lus);
        tell("surConfiguration", configuration(), []);
        tellLHome(home.relire());
      }
    } catch (error) {
      const motif: Motif = error instanceof Refusal ? error.motif : { reason: "injoignable", said: `GitHub could not be reached to list your projects: ${ditDe(error)}` };
      liste = { a, lue: false, ...motif };
    }
    tell("surTelephone", phone());
    for (const project of projects) recevoir(project.nom, await lireLeProject(project));
  }

  // Ce que le desktop fait d'une lecture du rail : `facts` pour la barre et le rail, `status` pour l'écran affiché, et ce
  // qui est avant le rail pour l'espace ouvert.
  function recevoir(project: string, lu: ReadDuTableauDuRepository): void {
    if (lu.lu) derniers.set(project, lu);
    if (factsRequest !== undefined) {
      const read = readDuTableau(lu, project, factsRequest, [FACTS]);
      tell("surFaits", facts.recevoir(read));
      if (lu.lu) tell("surActivites", activitiesPubliees(project, lu));
      tell("surAlertes", bandes.faits(read));
      tellLHome(home.faits(read));
    }
    if (vus.includes(project)) {
      const montree = mettreAPart(readDuTableau(lu, project, requestVue, [STATUS]));
      const redessine = facts.attendre(montree);
      if (redessine !== undefined) tell("surFaits", redessine);
      tell("surAlertes", bandes.status(montree));
      tellLHome(home.status(montree));
    }
    if (space === project) tell("surAmont", amonts.recevoir(readDuTableau(lu, project, requestVue, [AMONT])));
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
  function regarderLes(lus: string[], request: number, ouvert: string | undefined): Promise<void> {
    requestVue = request;
    vus = lus;
    space = ouvert;
    amonts.veiller(ouvert === undefined ? [] : [ouvert]);
    for (const redessine of facts.veiller(vus)) tell("surFaits", redessine);
    for (const bande of bandes.veiller(vus)) tell("surAlertes", bande);
    tellLHome(home.veiller(vus));
    return lire();
  }

  // Les gestes du chef, écrits sur GitHub avec le même jeton : rien ne part sans `ecrire`.
  const sansEcriture: EnvoiGitHub = async () => {
    throw new Error("this phone has nothing to write to GitHub with");
  };
  const actions = ouvrirLesActionsGitHub({
    jeton: options.jeton,
    appeler,
    envoyer: options.ecrire ?? sansEcriture,
    depot: (project) => projects.find(({ nom: name }) => name === project)?.depot,
    dernier: (project) => derniers.get(project),
    chef: (project, ticket) => facts.chef(project, ticket),
    // La prochaine lecture va à GitHub tout de suite, et montre l'écriture.
    ecrit: () => void lire(),
  });

  return {
    configuration,
    telephone: phone,
    gestes: actions,
    // La barre est posée : chaque projet a sa bande, et son rail est lu.
    faits(request: number): Promise<void> {
      factsRequest = request;
      for (const bande of bandes.ouvrir(projects.map(({ nom: name }) => name))) tell("surAlertes", bande);
      return lire();
    },
    tous: (request: number) => regarderLes(projects.map(({ nom: name }) => name), request, undefined),
    regarder: (project: string, request: number) => regarderLes([project], request, project),
    // « réessayer maintenant » : GitHub est relu tout de suite.
    relire: () => lire(),
    // Un lien de la ligne d'un projet en lecture seule (ticket 3163) : la page, pour le seul dépôt que sa dernière lecture
    // dit en lecture seule — rien sinon.
    pageDeLaLectureSeule: (project: unknown, page: unknown): string | undefined => (typeof project === "string" ? pageDesFacts(derniers.get(project)?.faits, page) : undefined),
    // L'image d'une capture d'une carte (ticket 3185) : à l'adresse que la dernière lecture donne pour elle, lue sur l'API
    // de GitHub — jamais une adresse venue de la vue.
    capture: (project: unknown, ticket: unknown, screen: unknown, moment: unknown): Promise<Image> => {
      const adresse = typeof project === "string" ? facts.capture(project, ticket, screen, moment) : undefined;
      return adresse === undefined ? Promise.resolve({ sans: "the reading gave no address for this screenshot: the app has nothing to read" }) : lireCaptureSurLAPI(appeler, adresse);
    },
    // L'onglet affiché n'a pas de lecture propre sur le téléphone : son contenu vient du rail lu.
    onglet: (_project: string | undefined, _id: string | undefined, _request: number) => undefined,
  };
}
