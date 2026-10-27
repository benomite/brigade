// Les projets que le chef ajoute à la station depuis l'app, sans terminal.
//
// L'app écrit, dans le gist de la station, les projets qu'il lui demande
// (`demande.ts`). La station le relit à chaque cadence ; pour chaque projet
// dont elle est la principale, elle vérifie que ses Apps GitHub sont
// autorisées sur le dépôt — sinon, elle publie la page où le chef les
// autorise, en un clic —, clone le dépôt, vérifie qu'elle peut le récupérer
// et y pousser — sinon, elle publie pourquoi, et le geste qui le lève
// (`acces.ts`) —, pose les décisions du parcours au
// journal du projet, ouvre le ticket qui prépare son dépôt
// (`preparation-depot/`), puis lui écrit sa ligne dans sa configuration, dans le
// bloc qu'elle tient seule (`bloc.ts`). La station l'ouvre aussitôt : il est
// dans sa liste, et sa présence le publie. Un projet que l'app ne demande plus
// quitte le bloc : la station ne le sert plus — son état et son clone restent.
//
// Avant le ticket qui prépare son dépôt, elle tient à son journal ce qui
// manque à la station pour ses tests (`installation/besoins/`) : le chef en a
// le choix avant qu'aucun ticket ne cuise. Celui qu'il laisse au setup du
// projet lui fait ouvrir, une fois, le ticket qui le lui demande.
//
// Les stations que l'app appaire à un projet en plus de sa principale, la
// principale les lit dans les gists appairés du compte, les déclare au journal
// du projet et dit dans son suivi si chacune est atteinte (`secondaires.ts`).
// Ce qu'elles lui demandent par GitHub — réclamer un ticket, renouveler un
// bail —, elle le lit dans leur gist à chaque cadence et le relaie au journal du
// projet, dont le runtime décide (`tirer-par-github/`).
//
// Un projet que l'app lui demande en principale, alors qu'une autre station
// appairée du compte le sert déjà : elle n'en ouvre pas une seconde cuisine.
// Elle rejoint celle qui tourne, comme une station de plus, en le publiant dans
// son gist d'appairage. Ou elle refuse en une phrase, si elle ne peut pas la
// rejoindre — et rien n'est créé (`rejoindre.ts`).
//
// Ce qu'elle en dit, projet par projet, elle l'écrit dans le même gist
// (`brigade-projets-suivi.json`) : l'app le montre au chef — et, pour chacun,
// la station où il cuit, et si c'est l'ordinateur du chef ; pour ceux qu'elle
// sert, le worktree que leur cuisine n'a pas pu préparer — pourquoi, et quand
// elle réessaie (`echec-du-worktree.ts`) ; pour ceux dont elle est la
// principale, où en est leur onboarding (`onboarding/`). Le refus d'un projet
// porte le remède qui le lève, ou pourquoi il n'y en a pas : l'app le demande
// dans le même gist, la station le joue, réévalue le refus et répond
// (`remedes/`).
//
// La cuisine d'un projet déménage d'une station à une autre sans qu'il soit
// retiré ni rajouté (`demenagement/`) : l'app demande à celle qu'il quitte de
// le remettre (`remise`), à celle qui le reprend de le reprendre (`reprise`).
// Elles se répondent par leurs gists, en deux temps, et jamais deux cuisines ne
// le servent ensemble :
//   1. celle qui le reprend vérifie qu'elle peut le servir — sur l'ordinateur
//      du chef, le bac à sable d'abord —, l'autorise et le clone, puis se dit
//      prête dans son suivi (`acceptee`) ; ou dit, en une phrase, pourquoi elle
//      ne le peut pas (`refusee`) — et rien ne bouge ;
//   2. celle qu'il quitte, la voyant prête, retire sa ligne — sa cuisine se
//      ferme, plus rien n'en part —, arrête ses cooks en vol, et publie son
//      état dans son gist (`remise`) ;
//   3. celle qui le reprend le pose, puis écrit sa ligne : sa cuisine s'ouvre
//      sur le journal reçu, et reprend les tickets où ils en étaient (`recue`).
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { FICHIER_LOCAL } from "../appairage/presence.ts";
import type { Canal, Fichiers } from "../appairage/canal.ts";
import type { Verification } from "../bac-a-sable/local.ts";
import { dejaDemenage, lireRemise, recevoir, remettre, remisAilleurs } from "../demenagement/remise.ts";
import { ouvrirGitHub } from "../github.ts";
import { lireEchecDuWorktree } from "../echec-du-worktree.ts";
import { lireDelai, noterLAjout } from "../installation/delai/delai.ts";
import { leverBlocageDans, lireBlocages, poserBlocageDans } from "../installation/blocages/blocages.ts";
import { blocageDuClone, clonerEnReparant, ID_BLOCAGE_CLONE } from "../installation/clone/clone.ts";
import { lireChoix, suivreLesBesoins } from "../installation/besoins/besoins.ts";
import { attendSonTicket, ouvrirLesTicketsDans } from "../installation/besoins/ticket.ts";
import type { Sonde } from "../installation/besoins/fourni.ts";
import { lireOnboarding } from "../onboarding/lire.ts";
import { ouvrirLaPreparation } from "../preparation-depot/ouvrir.ts";
import { CONFIGURATION, ETATS, lieuxDuProjet } from "../station/configuration.ts";
import { lignesDuBloc, nomsHorsDuBloc, reecrireBloc } from "./bloc.ts";
import { documentDeSuivi, FICHIER_PROJETS, FICHIER_SUIVI, lireDemande, suiviDe, type Bascule, type Demande, type ProjetDemande, type SuiviDuProjet } from "./demande.ts";
import { verifierAcces, type Acces } from "./acces.ts";
import { refus as refusDe, type CodeDeRefus } from "./refus.ts";
import { brancheDuProjet } from "../reglages-projet/en-vigueur.ts";
import { FICHIER } from "../reglages-projet/reglages.ts";
import { capacitesDe, cloner, CloneEnEchec, decisionsDe, poserLesDecisions, verifierAutorisation, type Autorisation } from "./preparer.ts";
import { ENQUETE_MUETTE, enqueter, lireLEchecDuClone, type Enquete } from "./echec-du-clone.ts";
import { repondeurDeRemedes } from "../remedes/distant.ts";
import { executerRemede, type StationDesRemedes } from "../remedes/executer.ts";
import { REMEDES, type Registre } from "../remedes/registre.ts";
import { relayerLesDemandes } from "../tirer-par-github/relayer.ts";
import { plateformeDe } from "../enregistrement-station/contrat.ts";
import { documentDesRejointes, FICHIER_REJOINTES, issueDeLAjout, rejoindreDe, type CuisineRejointe } from "./rejoindre.ts";
import { CADENCE_DES_APPAIREES_MS, declarerLesSecondaires, injoignables, secondairesDuProjet, type LectureDesAppairees, type StationSecondaire } from "./secondaires.ts";

// Entre deux lectures de ce que l'app demande.
export const CADENCE_MS = 30_000;

// Ce que la station sert, tel que ce module le lit.
export type ServiParLaStation = {
  projets(): string[];
  // Pourquoi la station refuse ce projet, ou null.
  refus(nom: string): string | null;
  // La cause de ce refus (`refus.ts`) ; absente, « unexpected ».
  cause?(nom: string): CodeDeRefus | null;
};

export type OptionsProjets = {
  racine: string;
  canal: Canal;
  // Le nom de la station : celui de ses stations déclarées.
  station: string;
  env: Record<string, string | undefined>;
  servis: ServiParLaStation;
  // La configuration vient d'être réécrite : la station la relit, et publie sa présence.
  apresEcriture: () => void;
  dire: (ligne: string) => void;
  cadenceMs?: number;
  maintenant?: () => number;
  // Surchargés par les tests.
  autoriser?: (depot: string) => Promise<Autorisation>;
  cloner?: (depot: string, clone: string) => Promise<void>;
  // Après un clone en échec : ce que le `gh` de la station dit de son compte,
  // de son jeton et du propriétaire du dépôt (`echec-du-clone.ts`).
  enqueter?: (depot: string) => Promise<Enquete>;
  // Peut-elle récupérer le dépôt et y pousser, depuis son clone (`acces.ts`) ?
  verifierAcces?: (projet: ProjetResolu, clone: string) => Promise<Acces>;
  // Ouvre le ticket qui prépare le dépôt, une fois (`preparation-depot/`) ;
  // rend son numéro, et s'il vient d'être ouvert.
  ouvrirLaPreparation?: (projet: ProjetResolu, repertoireEtat: string, clone: string) => Promise<{ ticket: number; ouvert: boolean }>;
  // Ouvre le ticket de chaque besoin que le chef laisse au setup du projet
  // (`installation/besoins/ticket.ts`) ; rend ceux qui l'ont été, ou retrouvés.
  ouvrirLesTicketsDesBesoins?: (projet: ProjetDemande, repertoireEtat: string) => Promise<Array<{ id: string; ticket: number; ouvert: boolean }>>;
  // Cette station est celle de l'ordinateur du chef : ses cuisines sont
  // locales (`bac-a-sable/local.ts`). Faux par défaut.
  locale?: boolean;
  // Le bac à sable de ses cuisines peut-il servir ? Joué avant qu'elle accepte
  // de reprendre un projet : `ok`, ou ce qui manque, en une phrase — et elle
  // refuse. Absent : rien à vérifier, la cuisine n'est pas locale.
  verifierBacASable?: () => Verification;
  // Combien de temps la remise attend qu'un cook arrêté soit mort.
  attenteDesCooksMs?: number;
  // Les remèdes que ses refus offrent, et qu'elle joue quand l'app les lui
  // demande (`remedes/`) — par défaut, ceux du runtime.
  remedes?: Registre;
  // Ce que la machine a, pour ce qui manque aux projets (`installation/besoins/`) — par défaut, la machine.
  sonde?: Sonde;
  // D'où vient ce que l'app demande — par défaut, `brigade-projets.json` du
  // gist de son appairage (`demandeDeLAppairage`). La station y met les projets
  // choisis pour elle dans l'app (`projets-station/`).
  source?: () => Promise<DemandeLue | null>;
  // Les gists appairés du compte, où elle lit les stations que l'app appaire à
  // ses projets en plus d'elle (`secondaires.ts`) — au plus toutes les
  // `cadenceDesAppareesMs`. Absent : elle n'en lit aucune.
  lireLesAppairees?: () => Promise<LectureDesAppairees>;
  cadenceDesAppareesMs?: number;
  // La plateforme de sa machine (`process.platform` par défaut) : un Mac fournit
  // `macos` à la cuisine qu'il rejoint (`rejoindre.ts`).
  plateforme?: string;
};

// Ce que l'app demande, tel qu'une lecture le rend : le gist où la station le
// lit et répond, ses fichiers, le fichier lu, et la demande — null si elle est
// illisible, la station n'en change alors rien.
export type DemandeLue = { gist: string; lus: Fichiers; fichier: string; brut: string; demande: Demande | null };

export type ProjetsDeLApp = {
  // Une lecture, tout de suite — après celle qui est en cours.
  relire(): Promise<void>;
  arreter(): void;
};

const message = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur));

// Un projet demandé, sa branche d'intégration résolue par son clone : celle
// que son dépôt déclare, sinon celle que l'app a nommée.
export type ProjetResolu = ProjetDemande & { base: string };

// Sa ligne ne porte la branche que si l'app l'a nommée : sinon, c'est son
// dépôt qui la dit, à chaque ouverture de sa cuisine.
const ligneDe = (projet: ProjetDemande) => (projet.base === null ? `${projet.nom} ${projet.depot}` : `${projet.nom} ${projet.depot} ${projet.base}`);
const nomDe = (ligne: string) => ligne.split(" ")[0] ?? "";

// Le gist de la station, une fois appairée — l'app n'écrit que dans ceux-là.
function gistAppaire(racine: string): string | null {
  try {
    const lu = JSON.parse(readFileSync(join(racine, FICHIER_LOCAL), "utf8")) as { gist?: unknown; appairee?: unknown };
    return lu.appairee === true && typeof lu.gist === "string" && lu.gist !== "" ? lu.gist : null;
  } catch {
    return null;
  }
}

// Ce que l'app demande par le gist de l'appairage : null tant que la station
// n'est pas appairée, ou si son gist n'existe plus.
export async function demandeDeLAppairage(racine: string, canal: Canal): Promise<DemandeLue | null> {
  const gist = gistAppaire(racine);
  if (gist === null) return null;
  const lus = await canal.lire(gist);
  if (lus === null) return null;
  const brut = lus[FICHIER_PROJETS];
  return { gist, lus, fichier: FICHIER_PROJETS, brut: brut ?? "", demande: brut === undefined ? { projets: [], problemes: [] } : lireDemande(brut) };
}

function lireTexte(fichier: string): string {
  try {
    return readFileSync(fichier, "utf8");
  } catch {
    return "";
  }
}

export function tenirProjetsDeLApp(options: OptionsProjets): ProjetsDeLApp {
  const { racine, canal, station, env, servis, dire } = options;
  const maintenant = options.maintenant ?? Date.now;
  const fichier = join(racine, CONFIGURATION);
  const gh = env.BRIGADE_GH_BIN || "gh";
  const autoriser = options.autoriser ?? ((depot: string) => verifierAutorisation(env, depot));
  const clonerLe = options.cloner ?? ((depot: string, clone: string) => clonerEnReparant({ gh, depot, clone }));
  const enqueterLe = options.enqueter ?? ((depot: string) => enqueter({ gh, depot, env: { ...process.env, ...env } }));
  const verifierLAcces = options.verifierAcces ?? ((projet: ProjetResolu, clone: string) => verifierAcces({ station, depot: projet.depot, base: projet.base, clone, env: { ...process.env, ...env } }));
  const ouvrirLe =
    options.ouvrirLaPreparation ??
    (async (projet: ProjetResolu, repertoireEtat: string, clone: string) => {
      const github = ouvrirGitHub({ depot: projet.depot, bin: gh, projet: projet.nom });
      try {
        return await ouvrirLaPreparation({ repertoireEtat, projet: projet.nom, depot: projet.depot, base: projet.base, clone, github });
      } finally {
        github.fermer();
      }
    });
  const ouvrirLesTicketsDe =
    options.ouvrirLesTicketsDesBesoins ??
    ((projet: ProjetDemande, repertoireEtat: string) => ouvrirLesTicketsDans(repertoireEtat, { projet: projet.nom, auteur: `station:${station}` }, () => ouvrirGitHub({ depot: projet.depot, bin: gh, projet: projet.nom })));
  // Ce qui a déjà été dit : la même chose ne se répète pas à chaque cadence.
  const dits = new Set<string>();
  const direUneFois = (cle: string, ligne: string) => {
    if (dits.has(cle)) return;
    dits.add(cle);
    dire(ligne);
  };
  // Un dépôt autorisé le reste : la station ne le redemande pas à GitHub.
  const autorises = new Set<string>();
  // Quand chaque projet a été servi pour la première fois.
  const serviLe = new Map<string, string>();
  let dernierSuivi = "";
  // Les cuisines rejointes, telles que son gist d'appairage les porte : null
  // avant de l'avoir lu.
  let rejointesPubliees: string | null = null;
  // La dernière lecture du gist, et le dernier suivi : ce que les remèdes en lisent.
  let derniersLus: { gist: string; lus: Fichiers } | null = null;
  let derniersSuivis: SuiviDuProjet[] = [];
  let arrete = false;

  const locale = options.locale ?? false;
  const etatDe = (nom: string) => join(racine, ETATS, nom);
  // Le clone d'un projet, dans l'atelier de la station : là où ses cooks le
  // liront (`station/configuration.ts`).
  const cloneDe = (nom: string) => lieuxDuProjet(racine, nom, env.HOME).clone;
  const remedes = options.remedes ?? REMEDES;
  const besoins = suivreLesBesoins({ station, sonde: options.sonde, avertir: dire });
  const suiviDu = (projet: ProjetDemande, etat: SuiviDuProjet["etat"], dit: string, autoriser: string[] = [], cause?: CodeDeRefus): SuiviDuProjet => ({ nom: projet.nom, etat, dit, autoriser, serviLe: null, cuitSur: null, ici: false, bascule: null, ...(cause === undefined ? {} : { refus: refusDe(cause, remedes) }) });

  // Les stations que l'app appaire à ses projets en plus d'elle : la dernière
  // lecture des gists appairés, et ce qu'elle a trouvé pour chaque projet —
  // gardé, non atteint, quand GitHub ne répond pas à la suivante.
  let appairees: { a: number; lue: LectureDesAppairees | { panne: string } } | null = null;
  const secondairesConnues = new Map<string, StationSecondaire[]>();
  // Ce que le journal de service a dit de chacune : il ne le redit qu'au changement.
  const ditDesSecondaires = new Map<string, string>();
  const lireLesAppairees = async (): Promise<LectureDesAppairees | { panne: string } | null> => {
    const lire = options.lireLesAppairees;
    if (lire === undefined) return null;
    const instant = maintenant();
    if (appairees === null || instant - appairees.a >= (options.cadenceDesAppareesMs ?? CADENCE_DES_APPAIREES_MS)) {
      appairees = { a: instant, lue: await lire().catch((erreur: unknown) => ({ panne: message(erreur) })) };
    }
    return appairees.lue;
  };
  // Déclare au journal du projet celles que l'app lui appaire, et rend ce que
  // son suivi en dit.
  const tenirLesSecondaires = (projet: ProjetDemande, lue: LectureDesAppairees | { panne: string }): StationSecondaire[] => {
    const trouvees = "panne" in lue ? { illisible: lue.panne } : secondairesDuProjet(lue, projet.depot, { nom: station, gist: gistAppaire(racine) });
    if ("illisible" in trouvees) return injoignables(secondairesConnues.get(projet.nom) ?? [], trouvees.illisible);
    secondairesConnues.set(projet.nom, trouvees);
    try {
      const { ecrites, refusees } = declarerLesSecondaires(etatDe(projet.nom), projet.nom, trouvees);
      for (const nom of ecrites) {
        const tenue = trouvees.find((une) => une.station === nom);
        dire(`brigade : station — ${projet.nom} : ${nom} déclarée au journal, appairée par l'app en plus de ${station} — ${tenue?.cooks ?? "?"} cook(s) au plus, fournit : ${tenue?.fournit.join(", ") ?? "?"} ; elle tire son travail`);
      }
      for (const { station: nom, raison } of refusees) direUneFois(`secondaire refusee ${projet.nom} ${nom} ${raison}`, `brigade : station — ${projet.nom} : ${nom}, appairée par l'app, n'est pas déclarée — ${raison}`);
    } catch (erreur) {
      direUneFois(`secondaires ${projet.nom} ${message(erreur)}`, `brigade : station — ${projet.nom} : les stations que l'app lui appaire ne sont pas déclarées au journal, la station réessaie : ${message(erreur)}`);
    }
    for (const secondaire of trouvees) {
      const cle = `${projet.nom} ${secondaire.station}`;
      if (ditDesSecondaires.get(cle) === secondaire.dit) continue;
      ditDesSecondaires.set(cle, secondaire.dit);
      dire(`brigade : station — ${projet.nom} : ${secondaire.station} ${secondaire.atteinte ? "atteinte" : "pas atteinte"} (${secondaire.dit})`);
    }
    return trouvees;
  };

  // Le projet, sa branche d'intégration résolue par son clone ; null si ni son
  // dépôt ni l'app ne la nomment.
  const avecSaBranche = (projet: ProjetDemande): ProjetResolu | null => {
    const { branche } = brancheDuProjet(cloneDe(projet.nom), projet.base);
    return branche === null ? null : { ...projet, base: branche };
  };

  // Ce qu'il faut pour servir un projet avant d'y rien écrire : ses Apps
  // autorisées sur le dépôt, son clone, et l'accès de son clone au dépôt — en
  // lecture et en écriture. Rend null s'il l'est, ou ce qu'il en est.
  const accueillir = async (projet: ProjetDemande): Promise<SuiviDuProjet | null> => {
    const suivi = (etat: SuiviDuProjet["etat"], dit: string, autoriser: string[] = [], cause?: CodeDeRefus) => suiviDu(projet, etat, dit, autoriser, cause);
    if (!autorises.has(projet.depot)) {
      const autorisation = await autoriser(projet.depot);
      if ("panne" in autorisation) return suivi("en-preparation", `GitHub could not tell whether the station may act on ${projet.depot}; retried every ${Math.round((options.cadenceMs ?? CADENCE_MS) / 1000)} s — ${autorisation.panne}`);
      if (!autorisation.autorisee) {
        direUneFois(`autoriser ${projet.nom} ${autorisation.pages.join(" ")}`, `brigade : station — ${projet.nom} attend que le chef autorise brigade sur ${projet.depot} : ${autorisation.pages.join(", ")}`);
        return suivi("a-autoriser", `authorize brigade on ${projet.depot}, on GitHub: one click per page`, autorisation.pages);
      }
      autorises.add(projet.depot);
    }
    try {
      await clonerLe(projet.depot, cloneDe(projet.nom));
    } catch (erreur) {
      // Ce que git a dit reste au journal de la station et dans `detail` ; la
      // page dit la cause, le compte et le geste (`echec-du-clone.ts`).
      const erreurs = erreur instanceof CloneEnEchec ? erreur.erreurs : message(erreur);
      const enquete = await enqueterLe(projet.depot).catch(() => ENQUETE_MUETTE);
      const reessaieToutesLes = Math.round((options.cadenceMs ?? CADENCE_MS) / 1000);
      const clone = lireLEchecDuClone({ station, depot: projet.depot, erreurs, enquete, reessaieToutesLes });
      try {
        poserBlocageDans(etatDe(projet.nom), { projet: projet.nom, auteur: "station" }, blocageDuClone(clone));
      } catch {}
      direUneFois(`clone ${projet.nom} ${clone.cause} ${message(erreur)}`, `brigade : station — ${projet.nom} n'est pas cloné, la station réessaie : ${clone.raison} — ${message(erreur)}`);
      return { ...suivi("refuse", `${clone.raison} ${clone.geste}`, [], "clone-failed"), clone };
    }
    try {
      if (lireBlocages(etatDe(projet.nom)).some(({ id }) => id === ID_BLOCAGE_CLONE)) leverBlocageDans(etatDe(projet.nom), { projet: projet.nom, auteur: "station" }, ID_BLOCAGE_CLONE);
    } catch {}
    const resolu = avecSaBranche(projet);
    if (resolu === null) return suivi("refuse", `${projet.depot} does not declare its integration branch (${FICHIER}, or the “Branche d'intégration” line of its CLAUDE.md), and the app names none`, [], "configuration-invalid");
    // Un accès refusé ne se lève que par un geste du chef : rien n'est préparé
    // d'ici là — ni décisions, ni ticket de préparation, ni ligne. La station
    // revérifie à chaque cadence, et le sert dès que le geste est fait.
    const acces = await verifierLAcces(resolu, cloneDe(projet.nom));
    if (acces.etat === "injoignable") return suivi("en-preparation", `the station could not check that it may fetch and push on ${projet.depot}; it retries every ${Math.round((options.cadenceMs ?? CADENCE_MS) / 1000)} s — ${acces.dit}`);
    if (acces.etat === "bloque") {
      const { bloque, raison, geste } = acces;
      direUneFois(`acces ${projet.nom} ${raison} ${geste}`, `brigade : station — ${projet.nom} n'est pas servi, son dépôt refuse le ${bloque} : ${raison} Geste : ${geste}`);
      return { ...suivi("refuse", `${raison} ${geste}`, [], bloque === "fetch" ? "fetch-blocked" : "push-blocked"), acces: { bloque, raison, geste } };
    }
    return null;
  };

  // Prépare un projet dont la station est la principale. Rend sa ligne s'il
  // peut être servi, ou ce qu'il en est. `recu` : son état vient d'une autre
  // station, qui le servait — son dépôt est déjà préparé, son rail tourne.
  const preparer = async (projet: ProjetDemande, recu = false): Promise<{ ligne: string } | SuiviDuProjet> => {
    const suivi = (etat: SuiviDuProjet["etat"], dit: string, cause?: CodeDeRefus) => suiviDu(projet, etat, dit, [], cause);
    const accueil = await accueillir(projet);
    if (accueil !== null) return accueil;
    try {
      const posees = poserLesDecisions(join(racine, ETATS, projet.nom), projet.nom, decisionsDe(projet, station));
      if (posees.length > 0) dire(`brigade : station — ${projet.nom} : décisions du parcours posées au journal (${posees.join(", ")})`);
    } catch (erreur) {
      return suivi("refuse", `the chef's choices could not be written to its log — ${message(erreur)}`, "decisions-not-written");
    }
    if (recu) return { ligne: ligneDe(projet) };
    try {
      noterLAjout(join(racine, ETATS, projet.nom), projet.nom, `station:${station}`, () => new Date(maintenant()));
    } catch (erreur) {
      direUneFois(`ajout ${projet.nom} ${message(erreur)}`, `brigade : station — ${projet.nom} : son ajout n'est pas noté au journal, le délai de son premier ticket n'en dira rien : ${message(erreur)}`);
    }
    // Ce qui manque à la station pour ses tests, devant ce qu'elle fournit
    // vraiment (`installation/besoins/`) : tenu à son journal avant son premier
    // ticket et avant sa ligne — le chef a le choix avant qu'aucun ne cuise.
    besoins.tenir(projet, { repertoireEtat: join(racine, ETATS, projet.nom), clone: cloneDe(projet.nom) });
    // Le premier ticket de sa cuisine, ouvert avant sa ligne : la cuisine qui
    // s'ouvre ensuite n'en laisse partir aucun autre avant lui.
    try {
      const resolu = avecSaBranche(projet);
      if (resolu === null) throw new Error(`${projet.depot} no longer declares its integration branch`);
      const { ticket, ouvert } = await ouvrirLe(resolu, join(racine, ETATS, projet.nom), cloneDe(projet.nom));
      if (ouvert) dire(`brigade : station — ${projet.nom} : ticket #${ticket} ouvert sur ${projet.depot} pour préparer le dépôt (gates, setup de worktree, sites autorisés) — le rail n'en sert aucun autre avant son merge`);
    } catch (erreur) {
      const dit = message(erreur);
      direUneFois(`preparation ${projet.nom} ${dit}`, `brigade : station — ${projet.nom} : le ticket qui prépare son dépôt n'est pas ouvert sur GitHub, la station réessaie : ${dit}`);
      return suivi("en-preparation", `the station could not open the ticket that prepares ${projet.depot}; it retries — ${dit}`);
    }
    return { ligne: ligneDe(projet) };
  };

  const source = options.source ?? (() => demandeDeLAppairage(racine, canal));
  const cycle = async () => {
    const lue = await source();
    if (lue === null || arrete) return;
    const { gist, lus, demande } = lue;
    derniersLus = { gist, lus };
    if (demande === null) {
      direUneFois(`illisible ${lue.fichier} ${lue.brut}`, `brigade : station — ce que l'app demande (${lue.fichier}) est illisible : la station n'en change rien`);
      return;
    }
    for (const probleme of demande.problemes) direUneFois(probleme, `brigade : station — ${probleme}`);

    const texte = lireTexte(fichier);
    const avant = lignesDuBloc(texte);
    const aLaMain = new Set(nomsHorsDuBloc(texte));
    const lignes: string[] = [];
    const suivis = new Map<string, SuiviDuProjet>();
    // Ce que la station dit de plus d'un projet qu'elle sert encore, et où en
    // est son déménagement.
    const motifs = new Map<string, string>();
    const bascules = new Map<string, Bascule>();
    // Ceux qu'une autre station sert déjà : rejoints, ou refusés — leur
    // cuisine ne s'ouvre pas ici, rien ne s'en prépare (`rejoindre.ts`).
    const horsCuisine = new Set<string>();
    const rejointes: CuisineRejointe[] = [];
    // Les projets à remettre : leur ligne quitte le bloc d'abord.
    const aRemettre: Array<{ projet: ProjetDemande; remise: NonNullable<ProjetDemande["remise"]> }> = [];
    for (const projet of demande.projets) {
      if (!projet.principale) {
        const remise = projet.remise ?? null;
        if (remise === null) {
          suivis.set(projet.nom, suiviDu(projet, "secondaire", "not its main station: it runs neither its manager nor its pass"));
          continue;
        }
        const bascule = { de: station, vers: remise.vers, demandeLe: remise.demandeLe };
        // Déjà remis : rien ne se rouvre ici — la remise se republie seulement
        // si le gist ne la porte plus. Sans journal, la remise publiée est tout
        // ce qu'il y avait à remettre.
        const publiee = lireRemise(lus, projet.nom);
        const publieePourElle = publiee !== null && publiee.demandeLe === remise.demandeLe && publiee.vers === remise.vers;
        if (dejaDemenage(etatDe(projet.nom), remise) || (publieePourElle && publiee.journal === null)) {
          if (publieePourElle) {
            suivis.set(projet.nom, { ...suiviDu(projet, "secondaire", `handed over to ${remise.vers}: its kitchen is closed here, it cooks there now`), cuitSur: remise.vers, bascule: { ...bascule, etape: "remise" } });
          } else aRemettre.push({ projet, remise });
          continue;
        }
        const chezElle = suiviDe((await canal.lire(remise.gist))?.[FICHIER_SUIVI], projet.nom);
        if (arrete) return;
        const sienne = chezElle?.bascule;
        const pourCelleCi = sienne !== null && sienne !== undefined && sienne.demandeLe === remise.demandeLe && sienne.de === station && sienne.vers === remise.vers;
        if (pourCelleCi && (sienne.etape === "acceptee" || sienne.etape === "recue")) {
          aRemettre.push({ projet, remise });
          continue;
        }
        // L'autre n'est pas prête, ou refuse : rien ne bouge, elle le sert toujours.
        const refusee = pourCelleCi && sienne.etape === "refusee";
        const motif = refusee
          ? `moving to ${remise.vers} is refused, so it stays here — ${chezElle?.dit ?? ""}`
          : `moving to ${remise.vers} is asked: it cooks here until ${remise.vers} is ready to take it over`;
        if (refusee) direUneFois(`refus ${projet.nom} ${remise.demandeLe} ${chezElle?.dit}`, `brigade : station — ${projet.nom} : ${remise.vers} refuse de le reprendre, il reste servi ici — ${chezElle?.dit ?? ""}`);
        bascules.set(projet.nom, { ...bascule, etape: refusee ? "refusee" : "demandee" });
        const ligne = avant.find((une) => nomDe(une) === projet.nom);
        if (ligne !== undefined) {
          lignes.push(ligne);
          motifs.set(projet.nom, motif);
        } else suivis.set(projet.nom, { ...suiviDu(projet, "secondaire", motif), bascule: bascules.get(projet.nom) ?? null });
        continue;
      }
      if (aLaMain.has(projet.nom)) {
        suivis.set(projet.nom, suiviDu(projet, "refuse", `the station's configuration already has a line for ${projet.nom}, written by hand: remove it, and the station takes this one`, [], "hand-written-line"));
        continue;
      }
      // Déjà dans le bloc, tel quel : rien à préparer.
      if (avant.includes(ligneDe(projet))) {
        lignes.push(ligneDe(projet));
        const reprise = projet.reprise ?? null;
        if (reprise !== null && dejaDemenage(etatDe(projet.nom), { vers: station, demandeLe: reprise.demandeLe })) bascules.set(projet.nom, { de: reprise.de, vers: station, demandeLe: reprise.demandeLe, etape: "recue" });
        continue;
      }
      const reprise = projet.reprise ?? null;
      let recu = false;
      if (reprise !== null) {
        const bascule = { de: reprise.de, vers: station, demandeLe: reprise.demandeLe };
        const deLa = (etat: SuiviDuProjet["etat"], dit: string, etape: Bascule["etape"]): SuiviDuProjet => ({ ...suiviDu(projet, etat, dit), cuitSur: reprise.de, bascule: { ...bascule, etape } });
        recu = dejaDemenage(etatDe(projet.nom), { vers: station, demandeLe: reprise.demandeLe });
        if (!recu) {
          // Sur l'ordinateur du chef, pas de reprise sans bac à sable : elle est
          // refusée en une phrase, et l'autre station le sert toujours.
          const bac = options.verifierBacASable?.();
          if (bac !== undefined && !bac.ok) {
            direUneFois(`bac ${projet.nom} ${reprise.demandeLe} ${bac.raison}`, `brigade : station — ${projet.nom} n'est pas repris de ${reprise.de} : ${bac.raison}`);
            suivis.set(projet.nom, { ...deLa("refuse", bac.raison, "refusee"), refus: refusDe("sandbox-unusable", remedes) });
            continue;
          }
          const accueil = await accueillir(projet);
          if (arrete) return;
          if (accueil !== null) {
            suivis.set(projet.nom, { ...accueil, cuitSur: reprise.de, bascule: { ...bascule, etape: "demandee" } });
            continue;
          }
          const chezElle = await canal.lire(reprise.gist);
          if (arrete) return;
          const remise = lireRemise(chezElle, projet.nom);
          if (remise === null || remise.demandeLe !== reprise.demandeLe || remise.vers !== station || remise.de !== reprise.de) {
            suivis.set(projet.nom, deLa("en-preparation", `ready to take it over from ${reprise.de}: waiting for ${reprise.de} to close its kitchen and hand over its state`, "acceptee"));
            continue;
          }
          try {
            const pose = recevoir({ repertoireEtat: etatDe(projet.nom), remise, fichiers: chezElle ?? {} });
            recu = pose !== null;
            dire(`brigade : station — ${projet.nom} repris de ${reprise.de} : ${pose === null ? "elle n'en avait aucun journal, il arrive neuf" : `son journal est posé (${pose.evenements} événements), ses tickets reprennent ici`}`);
          } catch (erreur) {
            const dit = message(erreur);
            direUneFois(`reception ${projet.nom} ${dit}`, `brigade : station — ${projet.nom} : la reprise de ${reprise.de} n'a pas abouti, la station réessaie : ${dit}`);
            suivis.set(projet.nom, deLa("en-preparation", `taking it over from ${reprise.de} did not go through; the station retries — ${dit}`, "acceptee"));
            continue;
          }
        }
        bascules.set(projet.nom, { ...bascule, etape: "recue" });
      } else {
        // Une cuisine remise ne se rouvre pas ici sans être reprise : deux
        // stations ne la serviraient plus que le temps d'une lecture, mais elles
        // la serviraient ensemble.
        const ailleurs = remisAilleurs(etatDe(projet.nom), station);
        if (ailleurs !== null) {
          suivis.set(projet.nom, { ...suiviDu(projet, "refuse", `it was handed over to ${ailleurs.to} (move asked on ${ailleurs.askedAt}) and cooks there: move it back to bring it here`, [], "handed-over-elsewhere"), cuitSur: ailleurs.to });
          continue;
        }
        // Une autre station le sert déjà : avant tout clone, toute décision,
        // tout journal, elle en rejoint la cuisine, ou refuse en une phrase.
        const issue = issueDeLAjout(await lireLesAppairees(), projet.depot, { nom: station, gist: gistAppaire(racine) });
        if (arrete) return;
        if (issue.issue !== "seule") {
          horsCuisine.add(projet.nom);
          if (issue.issue === "rejointe") {
            const { nom: principale } = issue.principale;
            const fournit = capacitesDe(projet.fournit, plateformeDe(options.plateforme ?? process.platform));
            rejointes.push({ nom: projet.nom, depot: projet.depot, principale, cooks: projet.cooks, fournit });
            direUneFois(`rejointe ${projet.nom} ${principale}`, `brigade : station — ${projet.nom} est déjà servi par ${principale} : elle en rejoint la cuisine comme une station de plus (${projet.cooks} cook(s) au plus, fournit : ${fournit.join(", ")}) — ${principale} garde son manager et sa pass, aucune cuisine ne s'ouvre ici`);
            suivis.set(projet.nom, { ...suiviDu(projet, "secondaire", `joined the kitchen that ${principale} runs: it cooks there as one more station, and ${principale} keeps the manager and the pass`), cuitSur: principale, rejoindre: rejoindreDe(issue) });
          } else {
            direUneFois(`injoignable ${projet.nom} ${issue.phrase}`, `brigade : station — ${projet.nom} n'est pas servi ici, et aucune cuisine ne s'ouvre : ${issue.phrase}`);
            suivis.set(projet.nom, { ...suiviDu(projet, "refuse", issue.phrase, [], "kitchen-not-joinable"), rejoindre: rejoindreDe(issue) });
          }
          continue;
        }
      }
      const prepare = await preparer(projet, recu);
      if (arrete) return;
      if ("ligne" in prepare) lignes.push(prepare.ligne);
      else suivis.set(projet.nom, { ...prepare, bascule: bascules.get(projet.nom) ?? null });
    }

    const remis = new Set(aRemettre.map(({ projet }) => projet.nom));
    if (lignes.join("\n") !== avant.join("\n")) {
      // La configuration se remplace d'un coup : la station ne lit jamais une moitié.
      const neuf = reecrireBloc(lireTexte(fichier), lignes);
      writeFileSync(`${fichier}.app`, neuf);
      renameSync(`${fichier}.app`, fichier);
      const noms = (liste: string[]) => new Set(liste.map(nomDe));
      const [anciens, nouveaux] = [noms(avant), noms(lignes)];
      for (const nom of nouveaux) if (!anciens.has(nom)) dire(`brigade : station — ${nom} ajouté depuis l'app : sa ligne est écrite dans la configuration`);
      for (const nom of anciens) {
        if (nouveaux.has(nom)) continue;
        dire(remis.has(nom) ? `brigade : station — ${nom} déménage : sa ligne quitte la configuration, sa cuisine se ferme ici et plus aucun cook n'en part` : `brigade : station — ${nom} retiré depuis l'app : sa ligne quitte la configuration (son état et son clone restent)`);
      }
      // La station relit sa configuration : la cuisine d'un projet qui
      // déménage est fermée avant que sa remise ne commence.
      options.apresEcriture();
    }

    // Les remises : la cuisine fermée, ses cooks arrêtés, son état publié.
    for (const { projet, remise } of aRemettre) {
      const bascule = { de: station, vers: remise.vers, demandeLe: remise.demandeLe };
      try {
        const fichiers = await remettre({ repertoireEtat: etatDe(projet.nom), projet: projet.nom, de: station, vers: remise.vers, demandeLe: remise.demandeLe, maintenant: () => new Date(maintenant()), attenteMs: options.attenteDesCooksMs });
        if (arrete) return;
        if ((await canal.ecrire(gist, fichiers)) === "absent") throw new Error("the station's gist no longer exists");
        direUneFois(`remis ${projet.nom} ${remise.demandeLe}`, `brigade : station — ${projet.nom} remis à ${remise.vers} : sa cuisine est fermée ici, son état publié — il cuit là-bas désormais`);
        suivis.set(projet.nom, { ...suiviDu(projet, "secondaire", `handed over to ${remise.vers}: its kitchen is closed here, it cooks there now`), cuitSur: remise.vers, bascule: { ...bascule, etape: "remise" } });
      } catch (erreur) {
        const dit = message(erreur);
        direUneFois(`remise ${projet.nom} ${dit}`, `brigade : station — ${projet.nom} : sa remise à ${remise.vers} attend, la station réessaie : ${dit}`);
        suivis.set(projet.nom, { ...suiviDu(projet, "secondaire", `handing its kitchen over to ${remise.vers}: no cook leaves here any more; the station retries — ${dit}`), bascule: { ...bascule, etape: "acceptee" } });
      }
    }

    const instant = maintenant();
    const servisMaintenant = new Set(servis.projets());
    const suivi = demande.projets.map((projet): SuiviDuProjet => {
      const dit = suivis.get(projet.nom);
      if (dit !== undefined) return dit;
      const bascule = bascules.get(projet.nom) ?? null;
      const motif = motifs.get(projet.nom);
      if (servisMaintenant.has(projet.nom)) {
        if (!serviLe.has(projet.nom)) serviLe.set(projet.nom, new Date(instant).toISOString());
        // Un worktree que sa cuisine n'a pas pu préparer : la raison et l'heure
        // du prochain essai, lues dans son journal, jusqu'à ce qu'il se prépare.
        const echec = lireEchecDuWorktree(etatDe(projet.nom));
        return {
          nom: projet.nom,
          etat: "servi",
          dit: motif === undefined ? `served by ${station}` : `served by ${station}; ${motif}`,
          autoriser: [],
          serviLe: serviLe.get(projet.nom) ?? null,
          cuitSur: station,
          ici: locale,
          bascule,
          ...(echec === null ? {} : { worktree: echec }),
        };
      }
      const refus = servis.refus(projet.nom);
      return refus === null
        ? { ...suiviDu(projet, "en-preparation", "its line is written: the station is opening it"), bascule }
        : { ...suiviDu(projet, "refuse", `the station refuses to serve it — ${refus}`, [], servis.cause?.(projet.nom) ?? "unexpected"), bascule };
    }).map((dit, rang) => {
      // Ce qui manque à la station pour ses tests : un choix par besoin, et le
      // blocage qui l'attend — tenus avant que les blocages ne soient lus.
      // Un projet dont elle a rejoint la cuisine n'a pas de journal ici : elle n'en est pas la principale.
      const projet = demande.projets[rang]!;
      const choix = besoins.tenir(horsCuisine.has(projet.nom) ? { ...projet, principale: false } : projet, { repertoireEtat: etatDe(dit.nom), clone: cloneDe(dit.nom) });
      // Ce qui bloque le projet, lu dans son journal, quel que soit son état.
      const blocages = lireBlocages(etatDe(dit.nom));
      // Le temps de son ajout à son premier ticket servi (#1401).
      const delai = lireDelai(etatDe(dit.nom));
      return { ...dit, ...(delai === null ? {} : { delai }), ...(blocages.length === 0 ? {} : { blocages }), ...(choix.length === 0 ? {} : { choix }) };
    });
    // Les stations que l'app appaire au projet en plus de celle-ci : déclarées
    // au journal de chaque projet qu'elle sert en principale, et dites dans son
    // suivi, atteintes ou non (`secondaires.ts`). Sans un tel projet, les gists
    // du compte ne sont pas lus.
    const principaux = [...suivi.entries()].filter(([rang, dit]) => demande.projets[rang]!.principale && dit.etat === "servi");
    const lesAppairees = principaux.length === 0 ? null : await lireLesAppairees();
    if (arrete) return;
    if (lesAppairees !== null) {
      for (const [rang, dit] of principaux) {
        const secondaires = tenirLesSecondaires(demande.projets[rang]!, lesAppairees);
        if (secondaires.length > 0) suivi[rang] = { ...dit, secondaires };
      }
      // Ce que ces stations demandent par GitHub — réclamer un ticket, renouveler
      // un bail —, relayé au journal du projet à chaque lecture : son runtime en
      // décide, et publie sa réponse au Kitchen board (`tirer-par-github/`).
      for (const [rang] of principaux) {
        const projet = demande.projets[rang]!;
        const secondaires = secondairesConnues.get(projet.nom) ?? [];
        if (secondaires.length === 0) continue;
        try {
          const { relayees } = await relayerLesDemandes({ repertoireEtat: etatDe(projet.nom), depot: projet.depot, secondaires, lire: (id) => canal.lire(id), maintenant });
          for (const { station: nom, verb } of relayees) dire(`brigade : station — ${projet.nom} : ${nom} demande par GitHub (${verb}), relayé au journal du projet`);
        } catch (erreur) {
          direUneFois(`relais ${projet.nom} ${message(erreur)}`, `brigade : station — ${projet.nom} : ce que ses stations secondaires demandent par GitHub n'est pas relayé, la station réessaie : ${message(erreur)}`);
        }
        if (arrete) return;
      }
    }
    // Un besoin que le chef laisse au setup du projet : la principale ouvre sur
    // le projet le ticket qui le lui demande, une fois, et son choix le dit.
    // GitHub en panne : elle réessaie à la lecture suivante.
    for (const [rang, dit] of suivi.entries()) {
      const projet = demande.projets[rang]!;
      if (!projet.principale || horsCuisine.has(projet.nom) || !(dit.choix ?? []).some(attendSonTicket)) continue;
      try {
        for (const { id, ticket, ouvert } of await ouvrirLesTicketsDe(projet, etatDe(dit.nom))) {
          if (ouvert) dire(`brigade : station — ${projet.nom} : ticket #${ticket} ouvert sur ${projet.depot} pour que son setup apporte lui-même ce qui manque (${id})`);
        }
        const choix = lireChoix(etatDe(dit.nom));
        suivi[rang] = { ...dit, ...(choix.length === 0 ? {} : { choix }) };
      } catch (erreur) {
        const raison = message(erreur);
        direUneFois(`besoin ${projet.nom} ${raison}`, `brigade : station — ${projet.nom} : le ticket qui demande à son setup d'apporter ce qui manque n'est pas ouvert sur GitHub, la station réessaie : ${raison}`);
      }
      if (arrete) return;
    }
    for (const nom of [...serviLe.keys()]) if (!servisMaintenant.has(nom)) serviLe.delete(nom);
    // Où en est chaque projet dont elle est la principale, de son ajout à son
    // premier ticket. Un projet qu'elle reprend d'une autre station n'est pas
    // neuf : il n'en a pas.
    const onboarding = Object.fromEntries(
      demande.projets.flatMap((projet) => {
        if (!projet.principale || (projet.reprise ?? null) !== null || horsCuisine.has(projet.nom)) return [];
        const dit = suivi.find(({ nom }) => nom === projet.nom) ?? null;
        const repertoireEtat = etatDe(projet.nom);
        return [[projet.nom, lireOnboarding({ repertoireEtat, projet: projet.nom, depot: projet.depot, station, suivi: dit, clone: existsSync(cloneDe(projet.nom)) })]];
      }),
    );
    derniersSuivis = suivi;
    // Les cuisines qu'elle a rejointes, dans son gist d'appairage : c'est là
    // que la principale de chacune les lit, et l'y déclare (`secondaires.ts`).
    const appairage = gistAppaire(racine);
    if (appairage !== null) {
      const rejointesDoc = documentDesRejointes(rejointes);
      if (rejointesPubliees === null) rejointesPubliees = (appairage === gist ? lus : await canal.lire(appairage))?.[FICHIER_REJOINTES] ?? documentDesRejointes([]);
      if (arrete) return;
      if (rejointesDoc !== rejointesPubliees && (await canal.ecrire(appairage, { [FICHIER_REJOINTES]: rejointesDoc })) !== "absent") rejointesPubliees = rejointesDoc;
      if (arrete) return;
    }
    // Le suivi ne se réécrit que s'il a changé : un gist n'est pas un journal.
    const compare = JSON.stringify({ suivi, onboarding });
    if (compare === dernierSuivi && lus[FICHIER_SUIVI] !== undefined) return;
    await canal.ecrire(gist, { [FICHIER_SUIVI]: documentDeSuivi(suivi, instant, { nom: station, locale }, onboarding) });
    dernierSuivi = compare;
  };

  // Les remèdes que l'app demande, par le même gist (`remedes/distant.ts`) :
  // joués après la lecture, par le point d'entrée (`remedes/executer.ts`), qui
  // fait réévaluer le refus par une lecture de plus — le refus qu'elle sert
  // est alors celui de son nouveau suivi.
  const refusServi = (projet: string) => derniersSuivis.find(({ nom }) => nom === projet)?.refus ?? null;
  const ici: StationDesRemedes = {
    refusDe: refusServi,
    reevaluer: async (projet) => {
      await cycle();
      return refusServi(projet);
    },
    contexte: (projet) => ({ projet, racine, env, dire, relireLaConfiguration: options.apresEcriture }),
  };
  const repondeur = repondeurDeRemedes({ executer: (demande) => executerRemede(demande, ici, remedes), maintenant });
  const servirLesRemedes = async () => {
    const derniers = derniersLus;
    derniersLus = null;
    if (derniers === null || arrete) return;
    const fichiers = await repondeur.repondre(derniers.lus);
    if (fichiers !== null && !arrete) await canal.ecrire(derniers.gist, fichiers);
  };

  let panne: string | null = null;
  let fil: Promise<void> = Promise.resolve();
  let enCours = false;
  const enchainer = () => {
    fil = fil.then(async () => {
      if (arrete) return;
      enCours = true;
      try {
        await cycle();
        await servirLesRemedes();
        if (panne !== null) dire("brigade : station — GitHub répond de nouveau : elle relit les projets que l'app lui demande");
        panne = null;
      } catch (erreur) {
        const dit = message(erreur);
        if (dit !== panne) dire(`brigade : station — les projets que l'app lui demande ne sont pas lus, elle réessaie : ${dit}`);
        panne = dit;
      } finally {
        enCours = false;
      }
    });
    return fil;
  };

  void enchainer();
  // Un clone long ne fait pas s'empiler les lectures : la suivante attend la fin de celle-ci.
  const veille = setInterval(() => void (enCours ? undefined : enchainer()), options.cadenceMs ?? CADENCE_MS);

  return {
    relire: enchainer,
    arreter() {
      arrete = true;
      clearInterval(veille);
    },
  };
}
