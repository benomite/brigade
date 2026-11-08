// La station d'un ordinateur sert les projets de sa liste (`projets-servis.ts`)
// comme la box sert les siens sur l'état GitHub seul (#2357, épique #2356) :
// pour chacun, elle le clone dans ses propres lieux (`station/configuration.ts`,
// `lieuxDuProjet`), puis fait tourner le tour GitHub seul de la box
// (`brigade-github.ts`, `stationDuDepot`) — prendre, cuisiner, relire, merger —
// sous son propre nom. Ni relais de prise par une autre station, ni journal du
// projet, ni Kitchen board : le relais de prise n'existe plus (#2061).
//
// À chaque tour, elle relit la liste : un dépôt ajouté est cloné et servi à ce
// tour, un dépôt retiré ne prend plus de ticket dès ce tour — les cooks qu'il a
// en vol finissent et livrent. Une liste vide, c'est-à-dire une installation
// neuve, ne clone rien et ne fait tourner aucun tour.
//
// Ce que le tour de la box tient de sa cuisine et qu'elle n'a pas ici : les
// garde-fous de l'ancien chemin (stop, disjoncteur, quota, arbitre), qui lisent
// un journal (`github-seul/garde-fous/`). Les plafonds de chaque cook, eux,
// tiennent (`superviseur.ts`).
import { existsSync } from "node:fs";
import { availableParallelism } from "node:os";
import { join } from "node:path";
import { lireCaches, configBacASableLocal, PLATEFORME_LOCALE } from "../bac-a-sable/local.ts";
import { sondesDeLaMachine } from "../bac-a-sable/detection.ts";
import { ATTENTE_PRESSEE_MS, priseDeLaStation, stationDuDepot, type Lancer, type StationGitHub } from "../brigade-github.ts";
import type { Calibrage } from "../calibrage.ts";
import { configCloison } from "../cloison.ts";
import { lireALaBase, ouvrirDepot } from "../depot.ts";
import { lireReglages } from "../garde-fous.ts";
import { ouvrirGitHub, type GitHub } from "../github.ts";
import { clonerEnReparant } from "../installation/clone/clone.ts";
import { nomDuDepot } from "../projets/ajout-de-station.ts";
import { capacitesDe } from "../projets/preparer.ts";
import { baseDuClone } from "../projets-station/selection.ts";
import { plafondDesCoeurs } from "../projections/stations.ts";
import { brancheDuProjet, reglagesAuDemarrage } from "../reglages-projet/en-vigueur.ts";
import { DECLARATION_RESEAU, lireDeclaration, reglesDuProjet, REGLES_DE_BASE } from "../reseau.ts";
import { ETATS, lieuxDuProjet } from "../station/configuration.ts";
import { retenirLaPrise } from "../station-update/mettre-a-jour.ts";
import { lireProjetsServis } from "./projets-servis.ts";

// Entre deux tours : celui de la box (`brancherBrigadeGithub`).
export const INTERVALLE_MS = 120_000;

// Le reviewer d'un dépôt qui n'en fixe pas : la valeur de départ que l'app
// propose (`projets-station/selection.ts`).
const REVIEWER_DE_DEPART: Calibrage = { model: "sonnet", effort: "medium" };

const message = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur));
const minuscules = (texte: string) => texte.toLowerCase();

// Un projet de la liste, tel que la station le sert : son dépôt, son nom, ses
// lieux et sa branche d'intégration, lue sur son clone.
export type ProjetAServir = { depot: string; nom: string; clone: string; worktrees: string; base: string };

// Le tour d'un projet : celui de la box (`StationGitHub`).
export type TourDuProjet = Pick<StationGitHub, "tour" | "enCuisine" | "calme" | "quitter" | "presser" | "sauver">;

export type OptionsDuService = {
  // Le répertoire de la station (`BRIGADE_STATION_DIR`) : sa liste et ses lieux.
  racine: string;
  // Son nom, celui de ses prises et de ses verdicts : `<machine>/claude`.
  station: string;
  env: NodeJS.ProcessEnv;
  // Le compte de la machine, sous lequel vit l'atelier de la station.
  maison: string | undefined;
  gh: string;
  claude: string;
  dire: (ligne: string) => void;
  // Entre deux tours, pour `servirLesProjetsChoisis`.
  intervalleMs?: number;
  // Vrai tant que la station se vide pour sa mise à jour (#2189) : aucun ticket neuf n'est pris.
  retenue?: () => boolean;
  // Les dépôts que les cuisines de la station servent déjà, par l'ancien chemin
  // (`station/station.ts`) : ils ne sont pas servis une seconde fois ici, sur le même clone.
  dejaServis?: () => readonly string[];
  // Surchargés par les tests : le clone, le tour d'un projet, et ce que le tour
  // par défaut reçoit — le client GitHub et le lanceur de `claude`.
  cloner?: (clone: { gh: string; depot: string; clone: string; env: NodeJS.ProcessEnv }) => Promise<void>;
  ouvrirLeTour?: (projet: ProjetAServir) => TourDuProjet | { refus: string };
  github?: (depot: string) => GitHub;
  lancer?: Lancer;
};

export type ServiceDeLOrdinateur = {
  // Un tour : la liste relue, puis le tour GitHub seul de chaque projet servi.
  // Un tour demandé pendant un autre part après lui.
  tourner(): Promise<void>;
  // Les dépôts servis à cet instant, dans l'ordre de la liste.
  servis(): string[];
  // Les tickets que ses cooks cuisinent : ce que sa mise à jour attend (#2189).
  enCuisine(): number[];
  // Sauve le travail de ces cooks sur leur branche, avant une relance (#2586).
  sauver?(): Promise<number[]>;
  // Plus aucun tour ; ce qu'un tour tient est rendu.
  arreter(): Promise<void>;
  // Posé par la boucle : un projet a bougé au pass, le tour suivant presse ;
  // tout de suite si `maintenant` — un fait qui rend un ticket prenable (#2832).
  presser?: (maintenant?: boolean) => void;
};

// Le tour GitHub seul de la box pour un projet de la liste, ou pourquoi il ne
// peut pas tourner : ce que `station/cuisine.ts` lui donne, lu ici sans cuisine.
export function tourDeLaBox(options: OptionsDuService): (projet: ProjetAServir) => TourDuProjet | { refus: string } {
  return (projet) => {
    const { env } = options;
    const lieu = { clone: projet.clone, base: projet.base };
    const etat = join(options.racine, ETATS, projet.nom);
    // La liste réseau que la branche d'intégration déclare, relue à chaque lancement ; illisible, le socle seul.
    const hotes = () => {
      try {
        return reglesDuProjet(lireDeclaration(lireALaBase(lieu, DECLARATION_RESEAU, env) ?? "").hotes);
      } catch {
        return REGLES_DE_BASE;
      }
    };
    try {
      const { reglages } = reglagesAuDemarrage(lieu, env);
      const { plafonds, graceMs } = lireReglages(env);
      // Sur le Mac du chef, chaque `claude` part dans le bac à sable ; s'il n'y est pas, le projet n'est pas servi.
      const bacASable = configBacASableLocal(sondesDeLaMachine(options.claude), { home: options.maison, worktrees: projet.worktrees, caches: lireCaches(env) }, hotes);
      const retenue = options.retenue;
      const managerDuDepot = reglages?.defaultCalibrations?.manager;
      return stationDuDepot({
        nom: options.station,
        places: plafondDesCoeurs(availableParallelism()),
        capacites: capacitesDe([], process.platform === PLATEFORME_LOCALE ? "macos" : undefined),
        base: projet.base,
        depotGitHub: projet.depot,
        github: options.github?.(projet.depot) ?? ouvrirGitHub({ depot: projet.depot, bin: options.gh, projet: projet.nom }),
        depot: ouvrirDepot({ clone: projet.clone, base: projet.base, worktrees: projet.worktrees, env }),
        prise: retenue === undefined ? priseDeLaStation : (github, nom) => retenirLaPrise(priseDeLaStation(github, nom), retenue),
        claude: options.claude,
        env,
        cloison: configCloison(env, { repertoireEtat: etat, clone: projet.clone }),
        bacASable,
        plafonds,
        graceMs,
        reviewer: reglages?.defaultCalibrations?.reviewer ?? REVIEWER_DE_DEPART,
        // La question d'un cook bloqué va au manager que le dépôt calibre (#2894).
        ...(managerDuDepot === undefined ? {} : { manager: () => managerDuDepot }),
        flux: join(etat, "github-seul"),
        avertir: options.dire,
        // Le temps de chaque ticket mergé s'écrit dans le clone du projet (#2342).
        clone: projet.clone,
        ...(options.lancer === undefined ? {} : { lancer: options.lancer }),
      });
    } catch (erreur) {
      return { refus: message(erreur) };
    }
  };
}

// Le service, sans sa boucle : chaque tour se demande par `tourner`.
export function ouvrirLeService(options: OptionsDuService): ServiceDeLOrdinateur {
  const { racine, station, dire } = options;
  const cloner = options.cloner ?? clonerEnReparant;
  const ouvrirLeTour = options.ouvrirLeTour ?? tourDeLaBox(options);
  const dit = (ligne: string) => dire(`brigade : station ${station} — ${ligne}`);
  // Les projets servis, par dépôt en minuscules ; et ceux retirés dont des cooks sont encore en vol.
  const ouverts = new Map<string, { depot: string; tour: TourDuProjet; dernier: string | null }>();
  const retires = new Set<TourDuProjet>();
  // Ce qui a été dit de chaque dépôt qui n'a pas pu être servi, et de la liste
  // (vide, illisible) : redit seulement quand cela change.
  const refus = new Map<string, string>();
  let ditDeLaListe: string | null = null;
  const direDeLaListe = (ligne: string | null) => {
    if (ligne !== null && ligne !== ditDeLaListe) dit(ligne);
    ditDeLaListe = ligne;
  };
  const refuser = (cle: string, ligne: string) => {
    if (refus.get(cle) !== ligne) dit(ligne);
    refus.set(cle, ligne);
  };
  let arrete = false;
  let service: ServiceDeLOrdinateur;

  const retirer = (cle: string, pourquoi: string) => {
    const ouvert = ouverts.get(cle);
    if (ouvert === undefined) return;
    ouverts.delete(cle);
    dit(`${ouvert.depot} ${pourquoi}: it takes no more of its tickets — its cooks in flight finish and deliver`);
    void ouvert.tour.quitter?.();
    retires.add(ouvert.tour);
    void ouvert.tour.calme().finally(() => retires.delete(ouvert.tour));
  };

  // Clone le dépôt dans les lieux de la station s'il n'y est pas, lit sa
  // branche d'intégration, et ouvre son tour. Lève ce qui l'en empêche.
  const ouvrir = async (depot: string, nom: string): Promise<TourDuProjet> => {
    const { clone, worktrees } = lieuxDuProjet(racine, nom, options.maison);
    if (!existsSync(join(clone, ".git"))) {
      dit(`cloning ${depot} into ${clone}`);
      await cloner({ gh: options.gh, depot, clone, env: options.env });
    }
    const lue = brancheDuProjet(clone, null, options.env);
    const base = lue.branche ?? baseDuClone(clone, options.env);
    if (base === null) throw new Error(`its integration branch cannot be read from its clone ${clone}${lue.problemes.length === 0 ? "" : ` (${lue.problemes.join("; ")})`}`);
    const tour = ouvrirLeTour({ depot, nom, clone, worktrees, base });
    if ("refus" in tour) throw new Error(tour.refus);
    // Un fait du pass (une livraison, un verdict, un merge) presse le tour
    // suivant ; celui qui libère une place, une zone ou une dépendance le veut
    // tout de suite (#2802), et le dit par `maintenant` : sans lui, ici, le
    // ticket qu'il rendait prenable attendait sa prise 30 s de plus (#2832).
    tour.presser = (maintenant) => service.presser?.(maintenant);
    dit(`serves ${depot} from GitHub only, under its own name — it takes, cooks, reviews and merges its tickets (clone ${clone}, branch ${base})`);
    return tour;
  };

  const unTour = async () => {
    if (arrete) return;
    let depots: string[] = [];
    try {
      depots = lireProjetsServis(racine);
      direDeLaListe(depots.length === 0 ? "no project is chosen for this station: it serves none" : null);
    } catch (erreur) {
      direDeLaListe(message(erreur));
    }
    const deja = new Set((options.dejaServis?.() ?? []).map(minuscules));
    const voulus = new Map<string, { depot: string; nom: string }>();
    for (const depot of depots) {
      const cle = minuscules(depot);
      const nom = nomDuDepot(depot);
      if (deja.has(cle)) refuser(cle, `${depot} is already served by this station's kitchen of the project: it is not served a second time from GitHub only`);
      else if (nom === null) refuser(cle, `${depot} gives no project name (lower case, digits and dashes): it is not served`);
      else if (!voulus.has(cle)) voulus.set(cle, { depot, nom });
    }
    for (const cle of [...ouverts.keys()]) if (!voulus.has(cle)) retirer(cle, deja.has(cle) ? "is now served by this station's kitchen of the project" : "left this station's served projects");
    for (const cle of [...refus.keys()]) if (!depots.some((depot) => minuscules(depot) === cle)) refus.delete(cle);
    for (const [cle, { depot, nom }] of voulus) {
      if (ouverts.has(cle) || arrete) continue;
      try {
        ouverts.set(cle, { depot, tour: await ouvrir(depot, nom), dernier: null });
        refus.delete(cle);
      } catch (erreur) {
        refuser(cle, `${depot} is not served this turn, it is tried again at the next — ${message(erreur)}`);
      }
    }
    for (const ouvert of [...ouverts.values()]) {
      if (arrete) return;
      let ligne: string;
      try {
        await ouvert.tour.tour();
        const cuits = ouvert.tour.enCuisine();
        ligne = `GitHub-only turn on ${ouvert.depot}: ${cuits.length === 0 ? "no ticket cooking here" : `cooking ${cuits.map((numero) => `#${numero}`).join(", ")}`}`;
      } catch (erreur) {
        ligne = `GitHub-only turn on ${ouvert.depot} — ${message(erreur)}`;
      }
      if (ligne !== ouvert.dernier) dit(ligne);
      ouvert.dernier = ligne;
    }
  };

  let chaine: Promise<void> = Promise.resolve();
  service = {
    tourner: () => {
      chaine = chaine.then(unTour).catch((erreur: unknown) => dit(`turn — ${message(erreur)}`));
      return chaine;
    },
    servis: () => [...ouverts.values()].map(({ depot }) => depot),
    enCuisine: () => [...[...ouverts.values()].map(({ tour }) => tour), ...retires].flatMap((tour) => tour.enCuisine()),
    sauver: async () => (await Promise.all([...[...ouverts.values()].map(({ tour }) => tour), ...retires].map(async (tour) => (await tour.sauver?.()) ?? []))).flat(),
    arreter: async () => {
      arrete = true;
      await chaine;
      for (const { tour } of ouverts.values()) await tour.quitter?.();
    },
  };
  return service;
}

// Le service et sa boucle : un tour tout de suite, puis un toutes les
// `intervalleMs` ; après un fait du pass, le suivant vient dans les 30 s, comme
// sur la box (#2333) — tout de suite quand ce fait rend un ticket prenable
// (#2802), comme sur la box aussi : la station de l'ordinateur ne tenait que
// les 30 s, et chaque merge, livraison ou cook rendu y laissait le ticket
// suivant attendre sa prise jusqu'à 30 s de plus, après la fin du tour en
// cours si le fait tombait pendant lui (#2832).
export function servirLesProjetsChoisis(options: OptionsDuService): ServiceDeLOrdinateur {
  const service = ouvrirLeService(options);
  const intervalleMs = options.intervalleMs ?? INTERVALLE_MS;
  const presseeMs = Math.min(ATTENTE_PRESSEE_MS, intervalleMs);
  let arrete = false;
  let enTour = false;
  // Le délai qu'un fait arrivé pendant le tour demande au suivant ; sans fait, l'intervalle.
  let demande: number | undefined;
  let minuterie: NodeJS.Timeout | undefined;
  let echeance = 0;
  const programmer = (delai: number) => {
    clearTimeout(minuterie);
    echeance = Date.now() + delai;
    minuterie = setTimeout(boucle, delai);
  };
  const boucle = async () => {
    enTour = true;
    demande = undefined;
    await service.tourner();
    enTour = false;
    if (!arrete) programmer(demande ?? intervalleMs);
  };
  service.presser = (maintenant = false) => {
    if (arrete) return;
    const delai = maintenant ? 0 : presseeMs;
    if (enTour) demande = Math.min(demande ?? delai, delai);
    else if (echeance - Date.now() > delai) programmer(delai);
  };
  void boucle();
  return {
    ...service,
    arreter: async () => {
      arrete = true;
      clearTimeout(minuterie);
      await service.arreter();
    },
  };
}
