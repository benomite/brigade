// Le manager d'un projet : il décide ce qui entre sur le rail, le calibre,
// découpe les épiques en tickets, et réagit quand un ticket échoue en pass. Sa
// boucle est du code — le sondage des issues ouvertes, le tri de ce qui n'est
// pas une unité de travail, la mémoire de ce qui est déjà tranché, la pose des
// labels, la création des tickets — et il n'appelle un LLM que pour juger, pour
// découper et pour choisir que faire d'un ticket resté rouge : une issue, une
// fois par état.
//
// Il est éteint tant que le chef ne l'a pas allumé, et ne garde rien en
// mémoire : ce qu'il a décidé, posé et dit se relit dans le journal. Le geste
// du chef est toujours plus fort que le sien — il ne retire aucun label, n'en
// pose jamais dans une dimension qui en porte un, et ne pose rien deux fois
// sur la même issue.
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { abandonsAuChef } from "./abandon-au-chef.ts";
import { DE_CONFIANCE, priorite } from "./alimenter.ts";
import { calibrage as calibragePose, complet, EFFORTS, MODELES, type Calibrage } from "./calibrage.ts";
import { dansLeBacASableLocal, type BacASableLocal } from "./bac-a-sable/local.ts";
import { envelopper, type Cloison } from "./cloison.ts";
import { environnementClaude } from "./jeton-claude.ts";
import { direRefus, environnementCook, lireFlux, REFUS_MAX, verdict, type Lecture } from "./claude.ts";
import type { Decisions } from "./decisions.ts";
import { estUneVision, sortirLaVision } from "./besoin/vision.ts";
import { ouvrirDecoupage, type Reponse } from "./decoupage.ts";
import { MARQUEUR_QUESTION, neDUnDecoupage } from "./decouper.ts";
import { porteListe } from "./epique.ts";
import { commandeRendre, NOMS_DE_NATURE_EN, type Ecart, type FaitManager, type Nature } from "./events/manager.ts";
import type { FaitPass } from "./events/pass.ts";
import type { FaitStation } from "./events/station.ts";
import { LancementRefuse, type GardeFous, type Verdict } from "./garde-fous.ts";
import { ECHECS_ATTEINTS, HORS_CUISINE, LABEL, type GitHub, type IssueOuverte } from "./github.ts";
import { estUnePriseDuManager, finirLeTravail, prendreLeTravail, type TenantDuTravail } from "./github-etat/prise-du-manager.ts";
import { auteurSansEcriture } from "./github-etat/auteur.ts";
import { ouvrirIssuesEtrangeres } from "./issue-etrangere/issue-etrangere.ts";
import type { Humain } from "./aiguillage-humains/aiguillage.ts";
import { argumentsJuge, consigneDeJugement, empreinte, estAuChef, lireDecision, MARQUEUR_MANAGER, type Decision } from "./juger.ts";
import { LABEL_WAITING } from "./attente.ts";
import { decoupageDe, epiquesEnAttente, ticketDEpique } from "./projections/splits.ts";
import { etatDesGardeFous } from "./projections/guardrails.ts";
import { issueDuManager, issuesEnAttente, managerAllume, remiseDe, remisesEnAttente, type IssueDuManager, type Remise } from "./projections/manager.ts";
import { labelsMontes } from "./projections/reactions.ts";
import { ticketDuRail } from "./projections/rail.ts";
import { compteRetenu, cookDeRun, refusDAffilee, stationsAnnoncees } from "./projections/stations.ts";
import { ouvrirRequalification } from "./requalifier.ts";
import { ouvrirRoadmap } from "./manager/roadmap.ts";
import { ouvrirVerdictIncomplet } from "./manager/verdict-incomplet.ts";
import { configPlafond, type Plafond } from "./reagir.ts";
import { estLaPauseDeGitHub } from "./limite-github.ts";
import { ConfigInvalide, type Runtime } from "./runtime.ts";
import type { Fin } from "./superviseur.ts";

// Le nom sous lequel les jugements figurent au journal, à la place d'une
// station : c'est par lui que le chef lit ce que le manager lui coûte.
export const MANAGER = "manager";
const AUTEUR = "manager";

// Les labels par lesquels le chef dit lui-même qu'une issue n'est pas une
// unité de travail. Reconnus s'ils sont là, jamais exigés.
const RETENUE = "blocked-on-human";
const LABELS_ECARTES: Ecart[] = [RETENUE, "question", "decision"];
// Celui par lequel il dit qu'elle est à découper. Jamais exigé non plus : le
// jugement reconnaît une épique sans lui.
const LABEL_EPIQUE = "epic";
// Les écarts que le manager dit sur l'issue quand le chef y a posé `fire`.
// Dans chaque commentaire de station qui sort un ticket de la cuisine (renvois, échecs).
const MARQUE_STATION_HORS_CUISINE = "Taken off the kitchen (`served-elsewhere`)";
const ECARTS_DITS: Ecart[] = ["roadmap", "already-split", "served-elsewhere", "set-aside:failures", ...LABELS_ECARTES];

// Un quota épuisé qui ne dit pas quand il revient est retenté une heure après.
const REPLI_QUOTA_MS = 3_600_000;
// Pendant un tour, la liste des issues ouvertes se relit au plus une fois par
// cet intervalle : une issue déposée entre-temps est jugée avant la suite du
// tour, pas au tour suivant (#3422).
const RESONDAGE_MS = 30_000;
const QUOTA = "quota";

export type ConfigManager = {
  // Le modèle et l'effort de ses jugements.
  calibrage: Calibrage;
  // Le numéro de l'issue de roadmap du projet, s'il en a une.
  roadmap: number | null;
  // Jusqu'où il peut monter le calibrage d'un ticket qui échoue, tel qu'au
  // démarrage : `opus` / `high` si le chef ne l'a pas posé.
  plafond: Plafond;
  // Les fichiers suivis du dépôt : le plan dont un découpage tire les zones
  // de ses tickets. Sans lui, il découpe à l'aveugle.
  fichiers?: () => string[];
};

const liste = (valeurs: readonly string[]) => `${valeurs.slice(0, -1).join(", ")} ou ${valeurs.at(-1)}`;

// Lit la configuration du manager dans l'environnement qu'on lui donne : celui
// du runtime y a déjà versé le calibrage décidé au journal. Son calibrage n'a pas
// de défaut, pas plus que celui d'un cook : c'est le quota du chef.
export function configManager(env: Record<string, string | undefined>): ConfigManager {
  const exiger = (variable: string, admis: readonly string[]): string => {
    const valeur = env[variable];
    if (!valeur) throw new ConfigInvalide(`${variable} n'est pas défini — le calibrage des jugements du manager n'a pas de défaut : ${liste(admis)} — à poser par \`brigade <projet> station ${variable === "BRIGADE_MANAGER_MODEL" ? "manager-modele" : "manager-effort"} <valeur>\`, ou dans \`.claude/brigade/projet.json\` du dépôt (\`defaultCalibrations.manager\`)`);
    if (!admis.includes(valeur)) throw new ConfigInvalide(`${variable} invalide : « ${valeur} » — attendu ${liste(admis)}`);
    return valeur;
  };
  const calibrage = { model: exiger("BRIGADE_MANAGER_MODEL", MODELES), effort: exiger("BRIGADE_MANAGER_EFFORT", EFFORTS) };
  const roadmap = env.BRIGADE_ROADMAP_ISSUE;
  if (roadmap && !/^[1-9][0-9]*$/.test(roadmap)) {
    throw new ConfigInvalide(`BRIGADE_ROADMAP_ISSUE invalide : « ${roadmap} » — attendu un numéro d'issue (1)`);
  }
  return { calibrage, roadmap: roadmap ? Number(roadmap) : null, plafond: configPlafond(env) };
}

export type OptionsManager = ConfigManager & {
  github: GitHub;
  // `<owner>/<repo>`, pour la consigne du jugement.
  depotGitHub: string;
  repertoireEtat: string;
  // Le binaire `claude`.
  bin: string;
  // L'environnement dont part celui des jugements. Par défaut, celui du runtime.
  env?: NodeJS.ProcessEnv;
  // La cloison dans laquelle partent les jugements.
  cloison?: Cloison | null;
  // Le bac à sable d'une cuisine locale, sur le Mac du chef : les jugements y
  // partent. Absent : ils partent sans.
  bacASable?: BacASableLocal | null;
  maintenant?: () => Date;
  // Où va ce que le manager a à dire hors du journal (journald).
  avertir?: (message: string) => void;
  // La station qui le fait tourner, telle que le projet la déclare sur cette
  // machine : son travail sur une issue se prend sur GitHub sous ce nom
  // (`github-etat/prise-du-manager.ts`, #2568), et une autre station du projet
  // n'y touche pas. Absente, rien ne se prend : il se croit seul.
  station?: string | null;
  // Les décisions du chef : présentes, le calibrage des jugements y est relu
  // à chaque jugement, et le plafond à chaque réaction — le chef a pu les
  // changer sans redémarrer.
  decisions?: Pick<Decisions, "manager" | "plafond">;
  // Un ticket que le manager vient de rendre prenable — `fire` ou son
  // calibrage posés, un ticket de découpage lancé — : la station le prend à
  // son tour tout de suite, pas à son tour suivant, jusqu'à deux minutes plus
  // loin (#2796).
  surLeRail?: () => void;
  // Les humains du projet (`humans` de ses réglages), relus à chaque carte :
  // l'humain `product` reçoit celle de l'issue d'un auteur sans l'écriture
  // (#2934). Absents, elle va au chef.
  humains?: () => Humain[];
  // L'issue que la ligne « Roadmap » des bindings du dépôt nomme
  // (`**Roadmap** : issue #1`), relue à chaque tour, ou null s'il n'y en a
  // pas ; lève si elle ne se lit pas. Elle est la roadmap, comme `roadmap`
  // (#3436). Absente : seule `roadmap` l'est.
  roadmapDuDepot?: () => number | null;
};

const RAISONS: Partial<Record<Ecart, string>> = {
  roadmap: "it is the project's roadmap",
  epic: "it has the `epic` label",
  question: "it has the `question` label",
  decision: "it has the `decision` label",
  "blocked-on-human": "it has the `blocked-on-human` label",
  "served-elsewhere": "it has the `served-elsewhere` label: it is not served on this box",
  "set-aside:failures": "it has the `set-aside:failures` label: its failure count set it aside",
  "already-split": "it is an epic whose body already lists its tickets",
  vision: "it is a product vision or a reference document, not a deliverable",
};

const nombre = (valeur: number) => valeur.toLocaleString("en-US");
const pluriel = (combien: number, mot: string) => `${nombre(combien)} ${mot}${combien > 1 ? "s" : ""}`;
const duree = (ms: number) =>
  ms >= 60_000 ? `${(ms / 60_000).toLocaleString("en-US", { maximumFractionDigits: 1 })} min` : `${(ms / 1000).toLocaleString("en-US", { maximumFractionDigits: 1 })} s`;
const message = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur));
const code = (labels: string[]) => labels.map((label) => `\`${label}\``).join(", ");

// Ce que le code décide d'une issue, sans LLM.
type Tri =
  // Plus rien à décider : elle est lancée et calibrée, ou ce qui lui manque
  // n'est pas au manager.
  | { quoi: "rien" }
  // Une épique découpée, ou un ticket né d'un découpage : ce que le manager
  // avait à y faire est fait, et ce qu'ils portent depuis est au chef.
  | { quoi: "fini" }
  | { quoi: "ecart"; raison: Ecart; fired: boolean }
  | { quoi: "juger" }
  // Une épique : elle se découpe, elle ne se lance pas.
  | { quoi: "decouper" };

// Une issue que le tour sert : l'état sous lequel son travail se prend, une
// fois lu, et si une autre station en a déjà fait le travail.
type Servie = { issue: IssueOuverte; etat?: string; cedee?: boolean };

const dimension = (labels: string[], prefixe: string) => labels.filter((label) => label.startsWith(prefixe));
const deCalibrage = (label: string) => label.startsWith("model:") || label.startsWith("effort:");

// Rend le runtime, augmenté de son manager. Son `arreter` l'emporte avec lui.
export function brancherManager<R extends Runtime & GardeFous>(runtime: R, options: OptionsManager): R {
  const { journal, projet } = runtime;
  const { base } = journal;
  const { github } = options;
  const maintenant = options.maintenant ?? (() => new Date());
  const avertir = options.avertir ?? ((texte: string) => console.error(texte));
  const noter = (ticket: number | null, fait: FaitManager | FaitStation | FaitPass) => journal.ajouter({ project: projet, ticket, author: AUTEUR, ...fait });

  let arrete = false;
  // Les commentaires de confiance de chaque issue, tels que lus à sa dernière
  // modification. Cache, pas état : le perdre coûte une lecture par issue.
  // `echanges` : les mêmes, et les questions que le manager a posées.
  const lus = new Map<number, { updatedAt: string; corps: string[]; echanges: string[] }>();

  // Les issues ouvertes du dernier sondage confirmé : ce que GitHub dit quand
  // il répond « inchangé ». Cache, comme l'ETag qu'il accompagne.
  let confirmees: IssueOuverte[] | null = null;
  // Les remises dont un tour complet n'a rien eu à faire : elles ne valent
  // plus de retrier une liste inchangée.
  const sansObjet = new Set<string>();
  const cle = (remise: Remise) => `${remise.ticket}@${remise.at}`;

  // L'issue que les bindings du dépôt nomment roadmap, telle que relue au début
  // du tour ; `undefined` tant qu'elle ne s'est jamais lue.
  let roadmapDesBindings: number | null | undefined = options.roadmapDuDepot === undefined ? null : undefined;
  let roadmapNonLue = false;
  // Relit la roadmap des bindings. Illisible, la dernière lue vaut toujours ;
  // jamais lue, aucune issue ne se juge ni ne se découpe — ce pourrait être la
  // roadmap —, le reste du tri suit son cours. Dit une fois, jusqu'à la lecture
  // suivante qui réussit.
  const relireLaRoadmap = () => {
    if (options.roadmapDuDepot === undefined) return;
    try {
      roadmapDesBindings = options.roadmapDuDepot();
      roadmapNonLue = false;
    } catch (erreur) {
      if (!roadmapNonLue) avertir(`brigade : la ligne « Roadmap » du \`CLAUDE.md\` n'a pas pu se lire${roadmapDesBindings === undefined ? " — le manager ne juge ni ne découpe rien tant qu'elle ne se lit pas" : ": la dernière lue vaut toujours"} — ${message(erreur)}`);
      roadmapNonLue = true;
    }
  };
  const estLaRoadmap = (numero: number) => numero === options.roadmap || numero === roadmapDesBindings;

  // Les issues d'un inconnu qu'un membre de confiance a lancées ou priorisées :
  // le manager lit qui a posé le label, pas qui a écrit l'issue (#2619).
  const garanties = new Set<number>();
  // Les comptes que le projet déclare (`humans`) : seuls ils font d'une marque de station celle d'une station (#3012).
  // Des réglages illisibles ne déclarent personne : la marque ne vaut alors rien, et l'issue reste celle d'un inconnu.
  const declares = () => {
    try {
      return (options.humains?.() ?? []).map(({ login }) => login);
    } catch {
      return [];
    }
  };
  const garantir = async (issue: IssueOuverte) => {
    garanties.delete(issue.number);
    if (!auteurSansEcriture(issue, declares()) || !github.labelsPosesParDeConfiance) return;
    if (!issue.labels.some((label) => label === LABEL || priorite([label]) !== null)) return;
    try {
      const posees = await github.labelsPosesParDeConfiance(issue.number);
      if (posees.some((label) => issue.labels.includes(label) && (label === LABEL || priorite([label]) !== null))) garanties.add(issue.number);
    } catch (erreur) {
      if (!arrete && !estLaPauseDeGitHub(erreur)) avertir(`brigade : auteur des labels non lu sur l'issue #${issue.number} — ${message(erreur)}`);
    }
  };

  const trier = (issue: IssueOuverte, connue: IssueDuManager | null): Tri => {
    const fired = issue.labels.includes(LABEL);
    // La roadmap est un document de suivi, jamais un ticket : reconnue avant
    // tout le reste, elle n'est ni jugée, ni lancée, ni au chef (#3436).
    if (estLaRoadmap(issue.number)) return { quoi: "ecart", raison: "roadmap", fired };
    // Mis de côté par son compte d'échecs : aucune station ne le sert, et il ne repart pas sans que son label tombe.
    if (issue.labels.includes(ECHECS_ATTEINTS)) return { quoi: "ecart", raison: ECHECS_ATTEINTS, fired };
    // Le ticket dit qu'il ne se sert pas ici : il l'emporte sur tout le reste,
    // `fire` posé, calibrage complet compris.
    if (issue.labels.includes(HORS_CUISINE)) return { quoi: "ecart", raison: "served-elsewhere", fired };
    // Une épique découpée ne se rejuge plus ; il peut rester à finir ce que le
    // découpage a commencé.
    const decoupee = decoupageDe(base, issue.number);
    if (decoupee?.state === "split") {
      if (decoupee.done && decoupee.commented) return { quoi: "fini" };
      // Retenue par le chef au milieu des créations : elles attendent.
      return issue.labels.includes(RETENUE) ? { quoi: "ecart", raison: RETENUE, fired } : { quoi: "decouper" };
    }
    // Un ticket né d'un découpage est déjà jugé et calibré.
    if (ticketDEpique(base, issue.number)?.index != null || neDUnDecoupage(issue.body)) return { quoi: "fini" };
    // Une vision produit, un document de référence : pas un livrable. Le manager
    // la sort du rail et le dit (`besoin/vision.ts`, #3479).
    if (estUneVision(issue)) return { quoi: "ecart", raison: "vision", fired };
    if (fired && complet(calibragePose(issue.labels))) return { quoi: "rien" };
    // Sorti du rail par la cuisine sans être servi, il attend la réponse du
    // chef (#2118) : le manager ne le remet pas sur le rail à sa place.
    if (!fired && ticketDuRail(base, issue.number) === null && abandonsAuChef(base, issue.number).length > 0) return { quoi: "fini" };
    // Le manager a déjà posé sur cette issue, et il y manque quelque chose : le
    // chef l'a retiré. Tout ce qu'elle porte est désormais à lui.
    if (connue && connue.posed.length > 0) return { quoi: "ecart", raison: "chef-changed", fired };
    if (auteurSansEcriture(issue, declares()) && !garanties.has(issue.number)) return { quoi: "ecart", raison: "untrusted-author", fired };
    const label = LABELS_ECARTES.find((ecarte) => issue.labels.includes(ecarte));
    if (label) return { quoi: "ecart", raison: label, fired };
    // La liste de ses tickets est déjà dans son corps, et le journal ne sait
    // rien d'un découpage : il a été fait à la main.
    if (porteListe(issue.body)) return { quoi: "ecart", raison: "already-split", fired };
    if (issue.labels.includes(LABEL_EPIQUE)) return { quoi: "decouper" };
    // Lancée, et chaque dimension porte déjà un label — illisible, ou en
    // double : le chef n'a pas fini de trancher, la station le lui dit.
    if (fired && dimension(issue.labels, "model:").length > 0 && dimension(issue.labels, "effort:").length > 0) return { quoi: "rien" };
    return { quoi: "juger" };
  };

  // Ce qui pèse dans un jugement : les commentaires de ceux qui ont la main
  // sur le dépôt, moins ceux du manager.
  const lire = async (issue: IssueOuverte) => {
    const connus = lus.get(issue.number);
    if (connus?.updatedAt === issue.updatedAt) return connus;
    // Une prise du travail n'est pas un échange : la poster ne change pas l'état de l'issue.
    const deConfiance = (await github.commentaires(issue.number))
      .filter((commentaire) => DE_CONFIANCE.includes(commentaire.association) && !estUnePriseDuManager(commentaire.body))
      .map((commentaire) => commentaire.body);
    const lu = {
      updatedAt: issue.updatedAt,
      corps: deConfiance.filter((corps) => !corps.includes(MARQUEUR_MANAGER)),
      echanges: deConfiance.filter((corps) => !corps.includes(MARQUEUR_MANAGER) || corps.includes(MARQUEUR_QUESTION)),
    };
    lus.set(issue.number, lu);
    return lu;
  };
  const commentaires = async (issue: IssueOuverte): Promise<string[]> => (await lire(issue)).corps;

  // Plusieurs stations servent le projet, chacune avec son manager (#2568) :
  // avant de juger, découper, requalifier une issue ou d'y dire un écart, la
  // station en prend le travail sur GitHub, pour l'état où elle la lit. La
  // première prise l'emporte ; les autres la laissent tranquille jusqu'à ce
  // que le travail soit dit fait, ou que la prise périme.
  const station = options.station ?? null;
  // Le travail que cette station tient, pas encore dit fait, par issue.
  const tenues = new Map<number, TenantDuTravail>();
  // Les états d'issue dont une autre station a fait le travail. Cache, pas
  // état : le perdre coûte une lecture des commentaires.
  const faitsAilleurs = new Set<string>();
  // Les issues que le tour est en train de servir.
  const servies = new Map<number, Servie>();
  // Les épiques dont le découpage tourne hors du tour, et leur issue servie.
  const decoupages = new Map<number, Servie>();

  // L'état sous lequel le travail d'une issue se prend : l'empreinte de ses
  // jugements. Rendue par le chef, elle est un travail neuf même inchangée.
  const etatDe = async (servie: Servie): Promise<string> => {
    if (servie.etat === undefined) {
      const { corps } = await lire(servie.issue);
      const remise = remiseDe(base, servie.issue.number);
      servie.etat = empreinte(servie.issue, remise === null ? corps : [...corps, `handed back ${remise.at}`]);
    }
    return servie.etat;
  };

  // Rend vrai si cette station peut faire le travail de l'issue : elle le
  // tient, ou il ne se prend pas (pas de nom de station, ou une issue que le
  // tour ne sert pas). Faux s'il est à une autre, ou que GitHub ne répond pas.
  const tenir = async (numero: number): Promise<boolean> => {
    const servie = servies.get(numero) ?? decoupages.get(numero);
    if (station === null || servie === undefined) return true;
    try {
      const etat = await etatDe(servie);
      if (faitsAilleurs.has(`${numero}@${etat}`)) {
        servie.cedee = true;
        return false;
      }
      const { prise, tenant } = await prendreLeTravail(numero, etat, { github, station, maintenant });
      if (prise && tenant !== null) {
        if (!tenant.fait) tenues.set(numero, tenant);
        return true;
      }
      if (tenant?.fait) {
        faitsAilleurs.add(`${numero}@${etat}`);
        servie.cedee = true;
      }
      return false;
    } catch (erreur) {
      if (!arrete && !estLaPauseDeGitHub(erreur)) avertir(`brigade : travail du manager non pris sur l'issue #${numero} — ${message(erreur)}`);
      return false;
    }
  };

  // Dit fait le travail que la station tient sur l'issue, s'il y en a un. Rend
  // faux si c'est à redire au tour suivant.
  const finir = async (numero: number): Promise<boolean> => {
    const tenant = tenues.get(numero);
    if (tenant === undefined) return true;
    try {
      await finirLeTravail(numero, tenant, github);
    } catch (erreur) {
      if (!arrete && !estLaPauseDeGitHub(erreur)) avertir(`brigade : travail du manager non dit fait sur l'issue #${numero} — ${message(erreur)}`);
      return false;
    }
    tenues.delete(numero);
    return true;
  };

  // Un jugement consomme le quota du compte : il n'a pas lieu si le chef a dit
  // « stop », si le disjoncteur est ouvert, ou si une station dit le compte
  // épuisé ou déconnecté.
  const peutJuger = (): boolean => {
    const garde = etatDesGardeFous(base);
    if (garde.stoppedAt !== null || garde.breakerOpenedAt !== null) return false;
    return !compteRetenu(base, maintenant());
  };
  // Les stations dont les jugements consomment le quota : celles des cooks,
  // telles que le projet les déclare. Un compte épuisé ou déconnecté se dit
  // d'elles toutes ; sans station, il n'est retenu nulle part, et le jugement
  // suivant le redécouvre.
  const noterDesStations = (fait: (station: string) => FaitStation) => {
    for (const station of stationsAnnoncees(base)) noter(null, fait(station));
  };

  const signature = (run: string | null, verbe = "Judged"): string => {
    const cook = run === null ? null : cookDeRun(base, run);
    const calibrage = cook?.model && cook.effort ? ` in \`${cook.model}\` / \`${cook.effort}\`` : "";
    const mesure = cook?.turns == null ? "" : ` · ${pluriel(cook.turns, "turn")} · ${nombre(cook.tokens ?? 0)} tokens · ${duree(cook.durationMs ?? 0)}`;
    return `_${verbe} by the manager${calibrage}${mesure}._`;
  };

  // Le dernier jugement de l'issue, tel qu'au journal : la question qu'il pose au chef (#3429) — `undefined` pour un
  // jugement d'avant elle, qui n'en demandait aucune.
  const dernierJugement = (numero: number) => journal.duTicket(numero).findLast((evenement) => evenement.type === "manager.judged")?.payload as Partial<Pick<Decision, "question" | "answers" | "recommended" | "awaits">> | undefined;
  const questionDuVerdict = (numero: number): string | null => {
    const question = dernierJugement(numero)?.question;
    return typeof question === "string" && question !== "" ? question : null;
  };
  // Les lignes de la carte qui suivent sa question (#3434), dans la forme que l'app lit (tableau/mise-de-cote-github.ts,
  // `carteDeLEcart`) : un bouton par réponse — `- [resume] <réponse>`, qui la poste et rend l'issue au manager ; `close`
  // pour celle qui la ferme —, et, quand la question attend un tiers, `- [wait] Wait for <qui>` d'abord, que l'app joue
  // en mettant l'issue en WAITING. Puis la recommandation : la réponse recommandée et pourquoi, en une ligne — WAITING
  // quand un tiers est attendu —, et aucune sans fondement. Un jugement d'avant #3434 n'en porte aucune : rien.
  const lignesDeLaCarte = (numero: number): string[] => {
    const jugement = dernierJugement(numero);
    const awaits = typeof jugement?.awaits === "string" ? jugement.awaits : null;
    const answers = Array.isArray(jugement?.answers) ? jugement.answers : [];
    const attendre = awaits === null ? null : `Wait for ${awaits}`;
    const recommande = attendre !== null ? { answer: attendre, why: "the answer is theirs to give, not yours" } : (jugement?.recommended ?? null);
    return [
      ...(attendre === null ? [] : [`- [wait] ${attendre}`]),
      ...answers.map((reponse) => `- [${/^close it\b/i.test(reponse) ? "close" : "resume"}] ${reponse}`),
      ...(recommande === null ? [] : ["", `**Recommended:** ${recommande.answer} — ${recommande.why}`]),
    ];
  };
  // Refusée au chef par un jugement d'avant #3429 : il ne lui demandait pas de question, et rien ne l'a montrée au chef.
  // Elle se rejuge une fois, pour que sa carte en pose une.
  const auChefSansQuestion = (issue: IssueOuverte, connue: IssueDuManager | null): boolean =>
    connue?.decision === "refused" && estAuChef(connue.kind) && !issue.labels.includes(LABEL_WAITING) && !("question" in (dernierJugement(issue.number) ?? { question: null }));

  const dire = (issue: IssueOuverte, connue: IssueDuManager, parLaStation = false): string => {
    const fired = issue.labels.includes(LABEL);
    switch (connue.decision) {
      case "fire": {
        const poses = connue.labels ?? [];
        // Ce qui était là avant le manager : ce qu'il n'a pas posé lui-même.
        const laisses = [
          ...(poses.includes(LABEL) ? [] : [LABEL]),
          ...(poses.some((label) => label.startsWith("model:")) ? [] : dimension(issue.labels, "model:")),
          ...(poses.some((label) => label.startsWith("effort:")) ? [] : dimension(issue.labels, "effort:")),
        ];
        return [
          MARQUEUR_MANAGER,
          `**Manager — ticket put on the rail.** ${poses.length === 0 ? "Nothing to set: everything was there." : `Set: ${code(poses)}.`}`,
          "",
          `**Why it is workable.** ${connue.reason}`,
          "",
          `**Why \`${connue.model}\` / \`${connue.effort}\`.** ${connue.calibration ?? ""}`,
          ...(laisses.length === 0 ? [] : ["", `${code(laisses)} ${laisses.length > 1 ? "were already set: left as they were" : "was already set: left as it was"}.`]),
          "",
          "It is your quota: replace a calibration label, the manager will not rewrite it.",
          "",
          `⚠️ **Removing \`fire\`, \`model:\` or \`effort:\` without replacing it takes this ticket away from the manager**: it will set nothing on it again and will not judge it again, even if the issue changes — until you give it back (\`${commandeRendre(issue.number)}\`). Correcting \`prio:\`, or setting or removing \`question\` or \`blocked-on-human\`, does not take it away.`,
          "",
          signature(connue.run),
        ].join("\n");
      }
      case "refused": {
        const auChef = estAuChef(connue.kind);
        const question = auChef ? questionDuVerdict(issue.number) : null;
        const awaits = auChef && question !== null ? (dernierJugement(issue.number)?.awaits ?? null) : null;
        return [
          MARQUEUR_MANAGER,
          `**Manager — not a workable ticket: ${NOMS_DE_NATURE_EN[connue.kind as Nature] ?? connue.kind}.** Nothing is set, no cook will start.`,
          "",
          connue.reason,
          ...(connue.missing === null ? [] : ["", `**What would make it workable.** ${connue.missing}`]),
          "",
          // Une issue qui attend le chef est une carte de son TODO (#3429) : la question en est la dernière ligne qui
          // finit par « ? » (app : tableau/mise-de-cote-github.ts, `carteDeLEcart`).
          ...(auChef
            ? [
                awaits === null
                  ? `**Yours to settle.** The manager sets \`${connue.kind}\` on this issue: it is a card in your TODO. Answer it there — one of its answers or your own words — and the manager judges the issue again with your answer; or close the issue.${fired ? " `fire` is set on it: it stays, but without a calibration no cook starts." : ""}`
                  : `**Not yours to answer: it waits on ${awaits}.** The manager sets \`${connue.kind}\` on this issue: its card in your TODO proposes to put it in WAITING, awaiting ${awaits}. If you already have the answer, give it there instead — one of its answers or your own words — and the manager judges the issue again with it; or close the issue.${fired ? " `fire` is set on it: it stays, but without a calibration no cook starts." : ""}`,
                ...(question === null ? [] : ["", question, ...lignesDeLaCarte(issue.number)]),
              ]
            : [`The issue will be judged again as soon as it changes — body edited, or an answer in a comment.${fired ? " `fire` is set on it: it stays, but without a calibration no cook starts." : ""}`]),
          "",
          signature(connue.run),
        ].join("\n");
      }
      case "failed":
        return [
          MARQUEUR_MANAGER,
          `**Manager — unreadable judgement.** The judgement of this issue gave no readable decision (${connue.reason}): nothing is set.`,
          "",
          "It will be judged again when it changes; until then, `fire` and the calibration are set by hand.",
          "",
          signature(connue.run),
        ].join("\n");
      case "aside": {
        if (connue.reason !== ("chef-changed" satisfies Ecart)) return direEcart(connue, parLaStation);
        const manque = connue.lacking ?? [];
        return [
          MARQUEUR_MANAGER,
          `**Manager — ticket set aside: it is no longer fired and calibrated.** The manager had set labels on it, and ${manque.length === 0 ? "its calibration no longer reads" : `it now lacks ${code(manque)}`}. The issue is yours: the manager sets nothing on it any more and does not judge it again, even if it changes.`,
          "",
          `**To give it back:** \`${commandeRendre(issue.number)}\`. It judges it afresh: it removes the calibration it had set, then sets \`fire\` and the one of the new judgement — or says why it is not a workable ticket.`,
          "",
          "To cook it without the manager, set `fire`, `model:` and `effort:` yourself.",
        ].join("\n");
      }
    }
  };

  const direEcart = (connue: IssueDuManager, parLaStation = false): string =>
    connue.reason === ECHECS_ATTEINTS
      ? [
          MARQUEUR_MANAGER,
          `**Manager — set aside by its failure count (\`${ECHECS_ATTEINTS}\`).**${connue.fired ? " `fire` is set on it, and the label wins: the ticket does not enter the rail, no cook starts." : " It does not enter the rail."} Its cooks stopped without a delivery too many times in a row; no other box serves it.`,
          "",
          `The reason is in the station's last comment. Remove \`${ECHECS_ATTEINTS}\` to try the ticket again.`,
        ].join("\n")
      : connue.reason === ("served-elsewhere" satisfies Ecart)
      ? parLaStation
        ? [
            MARQUEUR_MANAGER,
            `**Manager — \`served-elsewhere\`: the station set this ticket aside.**${connue.fired ? " `fire` is set on it, and `served-elsewhere` wins: the ticket does not enter the rail, no cook starts." : " It does not enter the rail."} This is the station's failure counter, not a ticket served by another box: nobody serves it.`,
            "",
            "The reason is in the station's last comment. Remove `served-elsewhere` to relaunch the ticket.",
          ].join("\n")
        : [
          MARQUEUR_MANAGER,
          `**Manager — \`served-elsewhere\`: this ticket is not served on this box.**${connue.fired ? " `fire` is set on it, and `served-elsewhere` wins: the ticket does not enter the rail, no cook starts." : " It does not enter the rail."} The reason is on the issue, from whoever set the label.`,
          "",
          "Nothing here awaits the chef: the ticket is served elsewhere. Remove `served-elsewhere` if the box must take it.",
        ].join("\n")
      : [
      MARQUEUR_MANAGER,
      `**Manager — \`fire\` left, ticket not calibrated.** For the manager, this issue is not a unit of work — ${RAISONS[connue.reason as Ecart] ?? connue.reason}. It does not remove your \`fire\`, and sets no calibration.`,
      "",
      "Without `model:` and `effort:`, no cook starts. Set them yourself if you want it cooked.",
    ].join("\n");

  // Note qu'une issue est écartée, si ce n'est pas déjà ce que le journal dit.
  const ecarter = (issue: Pick<IssueOuverte, "number" | "labels">, tri: Extract<Tri, { quoi: "ecart" }>, connue: IssueDuManager | null) => {
    if (connue?.decision === "aside" && connue.reason === tri.raison && connue.fired === tri.fired) return;
    // Ce qui manque, pas « ce que le chef a retiré » : après une montée ou un
    // calibrage remplacé, le journal ne sait plus lequel de ses labels était là.
    const lacking = [...(tri.fired ? [] : [LABEL]), ...["model:", "effort:"].filter((prefixe) => dimension(issue.labels, prefixe).length === 0)];
    noter(issue.number, { type: "manager.set-aside", payload: { reason: tri.raison, fired: tri.fired, ...(tri.raison === "chef-changed" ? { lacking } : {}) } });
  };

  // Porte une décision sur GitHub : les labels, puis le commentaire. Chaque
  // pas est noté une fois fait — ce qui échoue se reprend au réveil suivant,
  // sans rejuger. Rend vrai quand il ne reste rien à faire.
  const appliquer = async (lue: IssueOuverte): Promise<boolean> => {
    let issue = lue;
    let connue = issueDuManager(base, issue.number);
    if (!connue) return true;
    if (connue.decision === "fire" && connue.labels === null) {
      const { model, effort } = connue;
      let aPoser: string[] = [];
      try {
        // Les labels lus en début de tour ont l'âge des jugements qui ont
        // précédé celui-ci : des minutes, sur un backlog. Le chef a pu retenir
        // l'issue, ou la lancer et la calibrer lui-même. Ils se relisent juste
        // avant d'écrire, et le tri repasse sur ce qu'ils disent.
        const fraiche = await github.issue(issue.number);
        if (arrete) return false;
        // Fermée ou disparue : il n'y a plus rien à poser, ni à dire.
        if (!fraiche || fraiche.state !== "open") return true;
        issue = { ...issue, labels: fraiche.labels };
        await garantir(issue);
        const tri = trier(issue, connue);
        if (tri.quoi === "ecart") ecarter(issue, tri, connue);
        // Devenue une épique depuis son jugement — le chef y a posé `epic` :
        // elle se découpe, elle ne se lance pas. Le tour suivant la reprend.
        else if (tri.quoi === "decouper") return false;
        else if (tri.quoi === "fini") return true;
        else {
          aPoser = [
            ...(issue.labels.includes(LABEL) ? [] : [LABEL]),
            ...(dimension(issue.labels, "model:").length > 0 ? [] : [`model:${model}`]),
            ...(dimension(issue.labels, "effort:").length > 0 ? [] : [`effort:${effort}`]),
          ];
          if (aPoser.length > 0) await github.labelliser(issue.number, aPoser);
          if (arrete) return false;
          if (aPoser.length > 0) options.surLeRail?.();
          noter(issue.number, { type: "manager.labeled", payload: { labels: aPoser } });
        }
      } catch (erreur) {
        if (!arrete) avertir(`brigade : labels non posés sur l'issue #${issue.number}${aPoser.length === 0 ? "" : ` (${aPoser.join(", ")})`} — ${message(erreur)}`);
        return false;
      }
      connue = issueDuManager(base, issue.number) ?? connue;
    }
    // Un écart ne se dit que s'il surprend le chef : il a lancé l'issue
    // lui-même, ou il vient de la retirer au manager sans le savoir — pas un
    // `chef-changed` d'avant ce commentaire, que le journal note sans `lacking`.
    const aDire = connue.decision !== "aside" || connue.lacking !== null || (connue.fired && ECARTS_DITS.includes(connue.reason as Ecart));
    if (!aDire || connue.commented) return true;
    // Un écart se décide par le code, sur chaque station : une seule le dit.
    if (connue.decision === "aside" && !(await tenir(issue.number))) return false;
    try {
      // `served-elsewhere` posé par le compteur de la station n'est pas un ticket servi ailleurs.
      const parLaStation = connue.decision === "aside" && connue.reason === ("served-elsewhere" satisfies Ecart) && (await github.commentaires(issue.number)).some((c) => c.body.includes(MARQUE_STATION_HORS_CUISINE));
      await github.commenter(issue.number, dire(issue, connue, parLaStation));
    } catch (erreur) {
      if (!arrete) avertir(`brigade : décision du manager non commentée sur l'issue #${issue.number} — ${message(erreur)}`);
      return false;
    }
    if (arrete) return false;
    noter(issue.number, { type: "manager.commented", payload: {} });
    return true;
  };

  // Une issue refusée parce qu'elle attend le chef — `question`, `decision` — ne reste jamais hors du rail et hors de
  // TODO (#3429) : son refus dit, le manager y pose le label du même nom, dont la carte TODO pose au chef sa question
  // (#3370). Répondue, la carte retire le label (`resume`) et le manager la rejuge avec la réponse. Une issue que le chef
  // a mise en WAITING ne l'attend pas, lui : rien n'y est posé. Le label posé, l'issue est écartée par ce label, comme
  // celle où le chef l'aurait posé lui-même — ce n'est pas un label du manager : le retirer ne la lui retire pas. Rend
  // faux si c'est à refaire au tour suivant.
  const demanderAuChef = async (issue: IssueOuverte): Promise<boolean> => {
    const connue = issueDuManager(base, issue.number);
    if (connue?.decision !== "refused" || !estAuChef(connue.kind) || !connue.commented) return true;
    const label = connue.kind;
    let fraiche;
    try {
      // Relus juste avant d'écrire : le chef a pu fermer l'issue, la mettre en WAITING, ou poser le label.
      fraiche = await github.issue(issue.number);
      if (arrete) return false;
      if (!fraiche || fraiche.state !== "open" || fraiche.labels.includes(LABEL_WAITING)) return true;
      if (!fraiche.labels.includes(label)) await github.labelliser(issue.number, [label]);
    } catch (erreur) {
      if (!arrete) avertir(`brigade : \`${label}\` non posé sur l'issue #${issue.number}, refusée au chef — repris au tour suivant — ${message(erreur)}`);
      return false;
    }
    if (arrete) return false;
    // Le refus est déjà dit sur l'issue, avec sa question : l'écart ne se redit pas.
    journal.base.transaction(() => {
      noter(issue.number, { type: "manager.set-aside", payload: { reason: label, fired: fraiche.labels.includes(LABEL) } });
      noter(issue.number, { type: "manager.commented", payload: {} });
    });
    return true;
  };

  // Fait répondre le LLM à une consigne, sous les garde-fous : un jugement, ou
  // un découpage. Rend sa réponse lue — ou ce qui la rend illisible —, et null
  // s'il n'a pas abouti : il reste alors à faire.
  const demander = async <T>(
    sujet: { numero: number; prefixe: string; nom: string },
    consigne: string,
    lire: (message: string | null) => { valeur: T } | { illisible: string },
    envDuRole: NodeJS.ProcessEnv = options.env ?? process.env,
  ): Promise<Reponse<T> | null> => {
    const run = `${sujet.prefixe}-${sujet.numero}-${randomUUID().slice(0, 8)}`;
    let lecture: Lecture | null = null;
    let lue: ReturnType<typeof lire> | null = null;
    const conclure = (fin: Fin): Verdict => {
      let flux = "";
      try {
        flux = readFileSync(join(options.repertoireEtat, "runs", `${run}.jsonl`), "utf8");
      } catch {
        // Sans flux, il n'y a pas de décision.
      }
      lecture = lireFlux(flux);
      if (fin.arret) return "failed";
      const comment = verdict(lecture, fin.code);
      if (comment === "86" || comment === "disconnected") return "neutral";
      if (comment === "refused") return "refused";
      if (comment !== "done") return "failed";
      lue = lire(lecture.message);
      // Un jugement réussi ne remet pas à zéro les échecs d'affilée des cooks :
      // il ne compte ni pour ni contre.
      return "valeur" in lue ? "neutral" : "failed";
    };

    // Une autre station fait ce travail, ou l'a fait : rien ne part d'ici.
    if (!(await tenir(sujet.numero)) || arrete) return null;
    const calibrage = options.decisions?.manager() ?? options.calibrage;
    let lance;
    try {
      lance = runtime.lancer({
        ticket: null,
        run,
        contexte: { station: MANAGER, ...calibrage },
        // Hors de tout dépôt : un jugement ne lit que sa consigne.
        ...envelopper(options.cloison, { commande: options.bin, args: dansLeBacASableLocal(options.bacASable, argumentsJuge(consigne, calibrage), tmpdir()) }, { cwd: tmpdir(), depot: null }),
        cwd: tmpdir(),
        env: environnementClaude(environnementCook(envDuRole), envDuRole),
        juger: conclure,
      });
    } catch (erreur) {
      // « stop » ou disjoncteur, arrivés depuis le dernier regard.
      if (erreur instanceof LancementRefuse) return null;
      throw erreur;
    }
    const fin = await lance.fin;
    if (arrete || fin.outcome === "stop" || fin.outcome === "interrupted") return null;

    const flux = lecture as Lecture | null;
    const reponse = lue as ReturnType<typeof lire> | null;
    const comment = fin.arret || !flux ? "failed" : verdict(flux, fin.code);
    if (comment === "86") {
      const instant = maintenant();
      const annonce = flux?.quota?.retour ?? null;
      const retour = annonce !== null && annonce > instant ? annonce : new Date(instant.getTime() + REPLI_QUOTA_MS);
      noterDesStations((station) => ({ type: "station.86", payload: { station, reason: QUOTA, until: retour.toISOString(), window: flux?.quota?.fenetre ?? null } }));
      return null;
    }
    if (comment === "disconnected") {
      noterDesStations((station) => ({ type: "station.disconnected", payload: { station, reason: "authentication_failed", run } }));
      avertir(`brigade : connexion Max absente ou expirée, vue par un ${sujet.nom} du manager — \`claude /login\` sous le compte du service — la cuisine reprend seule dans la minute`);
      return null;
    }
    // Le modèle a refusé de répondre. Ce n'est pas une panne : la demande
    // repart au réveil suivant, mais pas sans fin — au-delà, elle s'épingle
    // comme une réponse qui ne se lit pas, et celui qui l'a posée le dit.
    if (comment === "refused") {
      const refus = refusDAffilee(base, `${sujet.prefixe}-${sujet.numero}-`);
      avertir(`brigade : ${sujet.nom} de l'issue #${sujet.numero} refusé par le modèle (${direRefus(flux)}), essai ${Math.min(refus, REFUS_MAX)}/${REFUS_MAX}`);
      if (refus < REFUS_MAX) return null;
      // Posé sur l'issue : en anglais.
      return { run, illisible: `model refusal${flux?.refus?.categorie ? ` (${flux.refus.categorie})` : ""}, ${refus} times in a row (\`stop_reason: refusal\`)` };
    }
    // Seul un jugement allé à son terme dit quelque chose de l'issue, que sa
    // réponse se lise ou non : il s'épingle sur son état. Tout le reste —
    // binaire introuvable, panne réseau, arrêt par un garde-fou — dit quelque
    // chose de la machine : rien n'est épinglé ni commenté, il repart au
    // réveil suivant, et c'est le disjoncteur qui borne.
    if (comment === "done" && reponse) return { run, ...reponse };
    const raison = fin.arret
      ? `guard:${fin.arret.reason}`
      : (fin.erreur ?? (fin.code === 0 ? "flux sans résultat" : fin.code === null ? `signal ${fin.signal}` : `code de sortie ${fin.code}`));
    avertir(`brigade : ${sujet.nom} de l'issue #${sujet.numero} non abouti (${raison}) — il sera retenté`);
    return null;
  };

  // Fait juger une issue. Rend vrai si une décision — ou une réponse illisible
  // — est au journal ; faux si le jugement n'a pas abouti, et reste à faire.
  const juger = async (issue: IssueOuverte, corps: string[], etat: string): Promise<boolean> => {
    const reponse = await demander<Decision>(
      { numero: issue.number, prefixe: "juge", nom: "jugement" },
      consigneDeJugement({ depot: options.depotGitHub, issue, commentaires: corps }),
      (texte) => {
        const lue = lireDecision(texte);
        return "decision" in lue ? { valeur: lue.decision } : lue;
      },
    );
    if (!reponse) return false;
    if ("valeur" in reponse) noter(issue.number, { type: "manager.judged", payload: { run: reponse.run, fingerprint: etat, ...reponse.valeur } });
    else {
      noter(issue.number, { type: "manager.failed", payload: { run: reponse.run, fingerprint: etat, reason: reponse.illisible } });
      avertir(`brigade : jugement illisible sur l'issue #${issue.number} (${reponse.illisible}) — rien n'est posé`);
    }
    return true;
  };

  const decoupage = ouvrirDecoupage({
    journal,
    github,
    depotGitHub: options.depotGitHub,
    fichiers: options.fichiers ?? (() => []),
    noter,
    demander,
    peutJuger,
    jugerSeul: juger,
    arrete: () => arrete,
    eteint: () => !managerAllume(base),
    avertir,
    signature,
    ...(options.surLeRail === undefined ? {} : { surLeRail: options.surLeRail }),
  });

  // L'issue d'un auteur sans l'écriture : une proposition de tri, et une carte
  // à l'humain `product`, dont la réponse la met sur le rail ou la ferme (#2934).
  const etrangeres = ouvrirIssuesEtrangeres({
    github,
    depotGitHub: options.depotGitHub,
    demander,
    peutJuger,
    arrete: () => arrete,
    avertir,
    humains: options.humains ?? (() => []),
  });
  // Les issues ouvertes du tour en cours, parmi lesquelles le tri cherche un doublon.
  let ouvertesDuTour: IssueOuverte[] = [];

  const requalification = ouvrirRequalification({
    journal,
    projet,
    github,
    depotGitHub: options.depotGitHub,
    noter,
    demander,
    peutJuger,
    arrete: () => arrete,
    avertir,
    signature,
  });

  // La roadmap écartée : ce qui y questionne le chef s'en retire, et le travail
  // séparé qu'elle porte s'ouvre en issues (#3436).
  const roadmap = ouvrirRoadmap({
    journal,
    projet,
    github,
    depotGitHub: options.depotGitHub,
    noter,
    demander,
    peutJuger,
    arrete: () => arrete,
    avertir,
    signature,
  });

  const verdictIncomplet = ouvrirVerdictIncomplet({
    journal,
    projet,
    github,
    depotGitHub: options.depotGitHub,
    noter,
    demander,
    peutJuger,
    arrete: () => arrete,
    avertir,
    signature,
  });

  // Une issue rendue par le chef repart à neuf : le calibrage que le manager y
  // avait posé, et qu'elle porte encore, s'en va avant le jugement — sans quoi
  // il resterait, le manager ne réécrivant pas une dimension qui porte un
  // label. Un label que le chef a posé n'est jamais retiré, et rien ne l'est
  // d'une issue qu'il a relancée et calibrée lui-même entre-temps : elle peut
  // déjà cuire. Rend les labels de l'issue, ou null si le retrait reste à faire.
  const reprendre = async (issue: IssueOuverte, remise: Remise & { labels: string[] }): Promise<string[] | null> => {
    const siens = new Set([...remise.labels, ...labelsMontes(base, issue.number)].filter(deCalibrage));
    let retires: string[] = [];
    let portes = issue.labels;
    try {
      // Relus juste avant d'écrire : ceux du sondage ont l'âge du tour.
      const fraiche = await github.issue(issue.number);
      if (arrete) return null;
      if (fraiche?.state === "open") {
        portes = fraiche.labels;
        if (!(portes.includes(LABEL) && complet(calibragePose(portes)))) retires = portes.filter((label) => siens.has(label));
        for (const label of retires) await github.delabelliser(issue.number, label);
        if (arrete) return null;
      }
    } catch (erreur) {
      if (!arrete) avertir(`brigade : calibrage du manager non retiré de l'issue #${issue.number}, rendue par le chef — ${message(erreur)}`);
      return null;
    }
    noter(issue.number, { type: "manager.withdrew", payload: { labels: retires } });
    return portes.filter((label) => !retires.includes(label));
  };

  // Ce que la liste des issues ouvertes dit de celles dont le manager attend
  // le chef : fermée, l'issue ne l'attend plus ; rouverte, de nouveau. Sans E/S.
  const constater = (presentes: Set<number>) => {
    const attendues = new Map([
      ...epiquesEnAttente(base).map(({ epic, closed }) => [epic, closed] as const),
      ...issuesEnAttente(base).map(({ ticket, closed }) => [ticket, closed] as const),
    ]);
    for (const [numero, closed] of attendues) {
      if (closed === presentes.has(numero)) noter(numero, { type: closed ? "manager.reopened" : "manager.closed", payload: {} });
    }
    // Un ticket que la cuisine a sorti du rail attend le chef jusqu'à sa
    // réponse : l'issue qu'il ferme en est une (abandon-au-chef.ts).
    for (const { ticket } of abandonsAuChef(base)) {
      if (!attendues.has(ticket) && !presentes.has(ticket) && ticketDuRail(base, ticket) === null) noter(ticket, { type: "manager.closed", payload: {} });
    }
  };

  const lisible = (issue: IssueOuverte): boolean =>
    Number.isSafeInteger(issue.number) && [issue.title, issue.updatedAt].every((champ) => typeof champ === "string" && champ !== "");

  // L'ordre du rail : `prio:1` d'abord, les issues sans priorité en dernier ;
  // à priorité égale, la plus ancienne.
  const ordre = (a: IssueOuverte, b: IssueOuverte) =>
    (priorite(a.labels) ?? 10) - (priorite(b.labels) ?? 10) || a.createdAt.localeCompare(b.createdAt) || a.number - b.number;

  // Sert une issue du tour. `fait` : il n'y reste rien à faire ; `reste` :
  // quelque chose y attend un réveil suivant ; `arret` : le tour s'arrête là.
  const servir = async (sondee: IssueOuverte): Promise<"fait" | "reste" | "arret"> => {
    let issue = sondee;
    const remise = remiseDe(base, issue.number);
    if (remise && remise.labels !== null) {
      const labels = await reprendre(issue, { ...remise, labels: remise.labels });
      if (labels === null) return "reste";
      issue = { ...issue, labels };
    }
    const connue = issueDuManager(base, issue.number);
    await garantir(issue);
    let tri = trier(issue, connue);
    // Un ticket retenu sans dire ce qu'il attend : une carte, ou la cuisine le
    // reprend. Une épique retenue est au chef, pas requalifiée.
    if (tri.quoi === "ecart" && tri.raison === RETENUE && !issue.labels.includes(LABEL_EPIQUE) && decoupageDe(base, issue.number)?.state !== "split") {
      const { corps } = await lire(issue);
      const suite = await requalification.traiter(issue, corps);
      if (suite === "attente") return "reste";
      if (suite === "reprise") {
        issue = { ...issue, labels: issue.labels.filter((label) => label !== RETENUE) };
        tri = trier(issue, connue);
      }
    }
    // La roadmap des bindings ne s'est jamais lue : cette issue l'est peut-être.
    if ((tri.quoi === "juger" || tri.quoi === "decouper") && roadmapDesBindings === undefined) return "reste";
    let epique = tri.quoi === "decouper";
    if (tri.quoi === "fini") return "fait";
    if (tri.quoi === "ecart") {
      ecarter(issue, tri, connue);
      if (tri.raison === ("untrusted-author" satisfies Ecart)) {
        if (arrete || !managerAllume(base)) return "arret";
        return etrangeres.traiter(issue, ouvertesDuTour);
      }
      if (tri.raison === ("vision" satisfies Ecart)) {
        if (arrete || !managerAllume(base)) return "arret";
        // Sans `fire`, elle n'est pas sur le rail : il n'y a rien à prendre.
        if (tri.fired && (!(await tenir(issue.number)) || !(await sortirLaVision(github, issue, avertir)))) return "reste";
      }
      if (tri.raison === ("roadmap" satisfies Ecart)) {
        if (arrete || !managerAllume(base)) return "arret";
        if (!(await roadmap.traiter(issue, await commentaires(issue), ouvertesDuTour))) return "reste";
      }
    } else if (tri.quoi === "juger") {
      const corps = await commentaires(issue);
      const etat = empreinte(issue, corps);
      if (connue?.fingerprint !== etat || auChefSansQuestion(issue, connue)) {
        if (!peutJuger() || !(await juger(issue, corps, etat))) return "reste";
      }
      // Le jugement y a reconnu une épique : elle ne se refuse pas, elle se
      // découpe.
      const jugee = issueDuManager(base, issue.number);
      epique = jugee?.decision === "refused" && jugee.kind === ("epic" satisfies Nature);
      // Jugée incomplète : jamais laissée sur un commentaire seul (#2692).
      if (jugee?.decision === "refused" && jugee.kind === ("incomplete" satisfies Nature)) {
        if (arrete || !managerAllume(base)) return "arret";
        if ((await verdictIncomplet.traiter(issue, corps, jugee)) === "attente") return "reste";
      }
    }
    if (epique) {
      if (arrete || !managerAllume(base)) return "arret";
      decouperHorsDuTour(issue, servies.get(issue.number) ?? { issue });
      return "reste";
    }
    // Éteint pendant le jugement : la décision est au journal, rien n'est
    // posé. Elle le sera, sans rejuger, quand le chef rallumera.
    if (arrete || !managerAllume(base)) return "arret";
    return (await appliquer(issue)) && (await demanderAuChef(issue)) ? "fait" : "reste";
  };

  // Le découpage d'une épique tourne hors du tour, comme la relecture d'une
  // station (#2329) : un `claude` de plusieurs minutes ne retient plus le
  // jugement des autres issues. Avant, un ticket déposé pendant un découpage
  // attendait `fire` jusqu'à la fin du tour — 40 min pour BOBL-tech/espace#840,
  // comptées dans son attente d'une prise (#3156). Un découpage à la fois par
  // épique ; ce qui reste à faire, le réveil suivant le reprend.
  const decouperHorsDuTour = (issue: IssueOuverte, servie: Servie) => {
    if (decoupages.has(issue.number)) return;
    decoupages.set(issue.number, servie);
    void (async () => {
      try {
        const { corps, echanges } = await lire(issue);
        if (await decoupage.traiter(issue, corps, echanges)) await finir(issue.number);
      } catch (erreur) {
        if (!arrete && !estLaPauseDeGitHub(erreur)) avertir(`brigade : découpage de l'épique #${issue.number} interrompu — ${message(erreur)}`);
      } finally {
        decoupages.delete(issue.number);
      }
    })();
  };

  // Une issue que le manager n'a jamais vue, et que le code laisse à juger :
  // elle attend son jugement, et `fire` avec lui.
  const neuve = (issue: IssueOuverte) => issueDuManager(base, issue.number) === null && trier(issue, null).quoi === "juger";

  // Un tour : chaque issue ouverte est triée par le code, et seules celles
  // qu'il ne sait pas trancher, dans un état jamais jugé, vont au LLM.
  //
  // Les issues neuves passent d'abord, avant le suivi des épiques et les
  // issues déjà vues, et le tour relit la liste toutes les `RESONDAGE_MS` :
  // une issue déposée pendant qu'il tourne est jugée à la relecture suivante.
  // Avant, le tour servait les issues ouvertes de la plus ancienne à la plus
  // récente, après avoir relu sur GitHub les tickets de chaque épique : une
  // issue déposée attendait la fin du tour en cours, puis tout le tour suivant.
  // BOBL-tech/mirrorlab#732, déposée à 15:40:33, n'a été jugée qu'à 15:55:45 :
  // aucun jugement en 5 min, puis la station relancée à 15:45:25 n'a lancé le
  // sien que 10 min plus tard. 15 de ses 16,5 min de temps perdu (#3422).
  const tour = async () => {
    if (!managerAllume(base)) return;
    relireLaRoadmap();
    const sondage = await github.ouvertes();
    let sondeA = maintenant().getTime();
    // Tant qu'une issue attend quelque chose qui ne la modifie pas — un quota,
    // un « reprendre », un GitHub qui répond de nouveau —, le sondage reste
    // inconditionnel.
    let complet = true;
    // Les issues que ce tour a déjà servies.
    const faites = new Set<number>();
    // Sert une issue du tour ; faux : le tour s'arrête là.
    const servirLa = async (sondee: IssueOuverte): Promise<boolean> => {
      faites.add(sondee.number);
      // Son découpage tourne encore : le tour passe à la suivante.
      if (decoupages.has(sondee.number)) {
        complet = false;
        return true;
      }
      const servie = { issue: sondee } as Servie;
      servies.set(sondee.number, servie);
      try {
        const suite = await servir(sondee);
        if (suite === "arret") return false;
        // Le travail de cet état, une autre station l'a fait : il ne reste
        // rien à faire ici, et rien à attendre d'elle.
        if (suite === "reste" && !servie.cedee) complet = false;
        if (suite === "fait" && !(await finir(sondee.number))) complet = false;
      } finally {
        servies.delete(sondee.number);
      }
      return true;
    };
    // Les neuves d'une liste que ce tour n'a pas servies, une fois chacune, dans l'ordre du rail.
    const neuves = (liste: readonly IssueOuverte[]) => [...new Map(liste.filter((issue) => lisible(issue) && !faites.has(issue.number) && neuve(issue)).map((issue) => [issue.number, issue])).values()].sort(ordre);
    // Les neuves d'une relecture de la liste, si la dernière date d'au moins
    // `RESONDAGE_MS`. Une relecture qui échoue n'arrête pas le tour : ses
    // neuves attendent la suivante, ou le tour d'après.
    const resonder = async (): Promise<IssueOuverte[]> => {
      if (maintenant().getTime() - sondeA < RESONDAGE_MS) return [];
      sondeA = maintenant().getTime();
      try {
        const relu = await github.ouvertes();
        return relu.inchange ? [] : neuves(relu.issues);
      } catch (erreur) {
        if (!arrete && !estLaPauseDeGitHub(erreur)) avertir(`brigade : le manager n'a pas relu les issues ouvertes pendant son tour — ${message(erreur)}`);
        return [];
      }
    };
    // Sert les neuves d'une liste, et celles que les relectures montrent entre-temps.
    const servirLesNeuves = async (liste: readonly IssueOuverte[]): Promise<boolean> => {
      for (let file = neuves(liste); file.length > 0; file = neuves([...file, ...(await resonder())])) {
        if (arrete || !managerAllume(base)) return false;
        if (!(await servirLa(file[0] as IssueOuverte))) return false;
      }
      return true;
    };
    if (!sondage.inchange) {
      ouvertesDuTour = sondage.issues.filter(lisible);
      if (!(await servirLesNeuves(sondage.issues))) return;
    }
    // L'avancement de chaque épique se lit sur GitHub, à chaque tour, avant
    // les issues déjà vues : une épique dont tous les tickets sont fermés se
    // ferme, et ce tour ne la sert plus (#2618).
    const vues = sondage.inchange ? confirmees : sondage.issues;
    const terminees = vues === null ? new Set<number>() : await decoupage.suivre(vues.filter(lisible));
    if (arrete) return;
    // Rendre une issue ne la modifie pas : GitHub répond « inchangé », et la
    // liste confirmée se retrie telle quelle.
    if (sondage.inchange && (confirmees === null || remisesEnAttente(base).every((remise) => sansObjet.has(cle(remise))))) return;
    const issues = (sondage.inchange ? (confirmees ?? []) : sondage.issues).filter((issue) => !terminees.has(issue.number));
    const presentes = new Set(issues.map((issue) => issue.number));
    ouvertesDuTour = issues.filter(lisible);
    requalification.suivre(issues);
    for (const numero of [...lus.keys()]) if (!presentes.has(numero)) lus.delete(numero);
    decoupage.observer(issues.filter(lisible));
    constater(presentes);

    // Les remises que ce tour verra toutes : celle que le chef écrit pendant
    // qu'il tourne est au suivant.
    const remises = remisesEnAttente(base);
    for (const sondee of issues.filter(lisible).sort(ordre)) {
      if (arrete || !managerAllume(base)) return;
      if (faites.has(sondee.number)) continue;
      if (!(await servirLesNeuves(await resonder()))) return;
      if (!(await servirLa(sondee))) return;
    }
    if (arrete || !complet) return;
    // Ce qu'un tour complet laisse en attente n'a plus rien à attendre du
    // manager : l'issue est fermée, ou le chef l'a relancée lui-même.
    for (const remise of remises) if (remiseDe(base, remise.ticket)?.at === remise.at) sansObjet.add(cle(remise));
    if (sondage.inchange) return;
    sondage.confirmer();
    confirmees = sondage.issues;
  };

  // Un seul tour à la fois. Un réveil qui arrive pendant un jugement n'est pas
  // perdu : le tour repasse une fois le premier fini.
  let enCours = false;
  let aRefaire = false;
  const reveiller = () => {
    if (arrete) return;
    if (enCours) {
      aRefaire = true;
      return;
    }
    enCours = true;
    void (async () => {
      try {
        do {
          aRefaire = false;
          await tour();
        } while (aRefaire && !arrete);
      } catch (erreur) {
        // `gh` en panne : rien n'est décidé, le réveil suivant réessaie.
        if (!arrete && !estLaPauseDeGitHub(erreur)) avertir(`brigade : le manager a buté — ${message(erreur)}`);
      } finally {
        enCours = false;
      }
    })();
  };

  const desabonner = runtime.surReveil(reveiller);
  reveiller();

  return {
    ...runtime,
    arreter(signal) {
      arrete = true;
      desabonner();
      runtime.arreter(signal);
    },
  };
}
