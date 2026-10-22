// Confier la cuisine d'un projet à ses stations, depuis l'app, sans terminal : le chef choisit le
// dépôt GitHub, les stations qui le servent et sa principale — celle qui fait tourner son manager et
// sa pass —, et valide. L'app écrit la demande dans le gist de chaque station choisie (demande.ts) ;
// chaque station la lit là, prépare le projet et l'ajoute à sa configuration (runtime/src/projets/). La
// principale recommandée est une station serveur, toujours allumée ; choisir l'app d'un ordinateur se
// dit au moment du choix : la cuisine s'arrête quand on la ferme.
//
// Deux portes y mènent : « + add a project », sur la page d'une station (`ajouter`), et la page d'un
// projet de l'app (#983, `confier`) — qui le confie à une première station, ou à une de plus. Ajouter
// un projet à l'app ne passe pas par ici (ajout.ts) : c'est ce geste-ci, et lui seul, qui l'installe
// sur une station.
//
// Le calibrage et le plafond de cooks sont les décisions du chef, mais elles ne commencent pas vides
// (#425, #1107) : l'app propose le nombre de cooks que les cœurs de la principale permettent, et le
// calibrage qui tourne déjà sur ses autres projets — ou la valeur de départ mesurée —, chacun avec
// d'où il vient. Ce qui manque est signalé champ par champ, sans rien écrire. Une station de plus
// reprend ce que l'app a déjà demandé pour le projet. Retirer le projet le retire de la demande de
// chaque station : elle le retire de sa configuration.
//
// Une fois confiée, sa cuisine déménage d'un geste (#1095, `demenager`) : vers cet ordinateur, vers
// sa box, vers une autre station, sans retrait ni rajout — c'est l'opération du runtime qui l'écrit
// (demenagement.ts). Où il cuit se lit dans le suivi de chaque station (`cuitSur`), pas dans la
// demande : une station qui refuse de le reprendre le laisse cuire là où il cuisait.
import type { GitHubDesStations } from "../stations/github.ts";
import type { StationVue } from "../stations/stations.ts";
import { documentDeDemande, FICHIER_PROJETS, FICHIER_SUIVI, lireDemande, lireOnboarding, lireSuivi, type AccesBloque, type Bascule, type Calibre, type EchecDuClone, type EchecDuWorktree, type EtatDuProjet, type Onboarding, type ProjetDemande, type Refus, type SuiviDuProjet } from "./demande.ts";
import type { Demenagement, Demenageur } from "./demenagement.ts";
import type { DepotDuChef } from "./github.ts";
import { canalDesGists, pourLaPage, type DemanderLeRemede, type IssueDuRemede } from "./remede.ts";

// Le calibrage que la station accepte : ses deux listes fermées (runtime/src/calibrage.ts).
export const MODELES = ["opus", "sonnet", "haiku"] as const;
export const EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;

export type SaisieDuProjet = {
  depot: string;
  base: string;
  // Les gists des stations choisies, et celui de la principale.
  stations: string[];
  principale: string;
  cooks: string;
  manager: Calibre;
  reviewer: Calibre;
  // Quand le chef a ouvert le parcours.
  ouvertLe: string;
};
export type Champ = "nom" | "depot" | "base" | "stations" | "principale" | "cooks" | "manager-modele" | "manager-effort" | "reviewer-modele" | "reviewer-effort";
export type Signales = Partial<Record<Champ, string>>;

// Une station d'un projet, telle que la home la montre.
export type StationDuProjet = { id: string; nom: string; principale: boolean; etat: EtatDuProjet | "attendu"; dit: string; autoriser: string[] };
// Où cuit un projet : la station qui le sert — son gist quand elle est appairée —, et si c'est
// celle de cet ordinateur.
export type CuitSur = { id: string | null; nom: string; ici: boolean };
// Un déménagement en cours : d'où, vers où, son étape — `dit`, pourquoi il est refusé.
export type DemenagementEnCours = Bascule & { dit: string };
export type ProjetVu = {
  nom: string;
  depot: string;
  base: string;
  stations: StationDuProjet[];
  // Du parcours ouvert au projet servi par sa principale — la mesure que la spec borne à dix minutes.
  servi: string | null;
  // Où il cuit, tel que ses stations le disent ; nul tant qu'aucune ne le dit.
  cuitSur?: CuitSur | null;
  // Son déménagement, tant qu'il n'est pas fini.
  demenagement?: DemenagementEnCours | null;
  // Où il en est de son ajout à son premier ticket, tel que sa principale le publie (#1110) ; nul
  // tant qu'elle n'en dit rien.
  onboarding?: Onboarding | null;
  // Ce qui retient sa cuisine, tel que sa principale le publie (#1117, #1118) : l'accès au dépôt refusé,
  // avec son geste ; un worktree impossible à préparer, avec sa raison et l'heure du prochain essai.
  // Nuls (ou absents) quand rien ne retient.
  acces?: AccesBloque | null;
  // Pourquoi la station refuse de le servir, en une phrase, et ce que le chef fait (#1178).
  refus?: Refus | null;
  worktree?: EchecDuWorktree | null;
  // Le clone du dépôt en échec, en clair : la cause, le compte GitHub de la station, le geste (#1390).
  // Absent quand le clone n'échoue pas.
  clone?: EchecDuClone;
};
// Ce que l'app propose pour une station choisie comme principale (#1107) : ce que ce choix implique —
// toujours allumée, ou arrêtée avec l'app de son ordinateur —, et le nombre de cooks à la fois que
// ses cœurs permettent, avec d'où il vient.
export type MachineProposee = { toujoursAllumee: boolean; implique: string; cooks: number; cooksDit: string };
// Le calibrage que l'app propose pour un projet qui prend sa première station, et d'où il vient.
export type CalibrageRecommande = { manager: Calibre; reviewer: Calibre; dit: string };
// `recommandee` : la principale que l'app propose d'office — une station serveur ; `avertissements` :
// ce qui se dit quand le chef choisit telle station pour principale ; `machines` : ce que l'écran de
// confiance dit de chaque station, et `calibrage`, ce qu'il propose.
// `locale` : le gist de la station de cet ordinateur, nul quand l'app n'en a pas.
export type VuDesProjets = {
  a: string;
  projets: ProjetVu[];
  locale?: string | null;
  recommandee: string | null;
  avertissements: Record<string, string>;
  machines: Record<string, MachineProposee>;
  calibrage: CalibrageRecommande;
  sans?: string;
};
// `manque` : parmi le dépôt, la branche d'intégration et le plafond de cooks, ceux que la première station
// ne dit pas et que le chef n'a pas donnés — chacun est aussi dans `signales`, sous son nom.
export type Manquant = "depot" | "base" | "cooks";
export type Ajout = { ajoute: string } | { signales: Signales; manque?: Manquant[] } | { refus: string };
export type Retrait = { retire: string } | { refus: string };
export type { Demenagement } from "./demenagement.ts";

// Un dépôt GitHub : `<owner>/<repo>`.
const DEPOT = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?\/[A-Za-z0-9_.-]{1,100}$/;
const BRANCHE = /^[A-Za-z0-9._/-]{1,200}$/;
const NOM = /^[a-z0-9][a-z0-9-]*$/;

const texte = (recu: unknown) => (typeof recu === "string" ? recu.trim() : "");
const message = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur));

// Ce que la vue envoie, ramené à des textes : rien n'y est cru sur parole.
export function lireSaisie(recu: unknown): SaisieDuProjet {
  const { depot, base, stations, principale, cooks, manager, reviewer, ouvertLe } = (recu ?? {}) as Record<string, unknown>;
  const calibre = (lu: unknown): Calibre => ({ modele: texte((lu as Calibre | undefined)?.modele), effort: texte((lu as Calibre | undefined)?.effort) });
  return {
    depot: texte(depot),
    base: texte(base),
    stations: Array.isArray(stations) ? [...new Set(stations.map(texte).filter((id) => id !== ""))] : [],
    principale: texte(principale),
    cooks: texte(cooks),
    manager: calibre(manager),
    reviewer: calibre(reviewer),
    ouvertLe: texte(ouvertLe),
  };
}

// Le nom du projet, tiré de son dépôt : celui de son état et de son clone sur la station.
export function nomDuProjet(depot: string): string {
  return (depot.split("/")[1] ?? "")
    .toLowerCase()
    .replace(/\.git$/, "")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Une station est l'app d'un ordinateur quand sa machine est un Mac ou un PC Windows ;
// un Linux est tenu pour un serveur, allumé en permanence.
export const estUnOrdinateur = (station: Pick<StationVue, "machine">) => /^(macOS|Windows)\b/.test(station.machine);

// La principale que l'app recommande : une station serveur, en ligne d'abord.
export function principaleRecommandee(stations: readonly StationVue[]): string | undefined {
  const serveurs = stations.filter((station) => station.etat !== "illisible" && station.cuisine !== false && !estUnOrdinateur(station));
  return (serveurs.find((station) => station.etat === "en-ligne") ?? serveurs[0])?.id;
}

// Le nombre de cooks que les cœurs d'une machine permettent : celui même que la station en dérive
// (runtime/src/projections/stations.ts, `plafondDesCoeurs`, #1079) — deux cœurs gardés pour le
// runtime, la pass et ses gates, puis environ deux par cook. 8 cœurs : 3.
export const cooksDesCoeurs = (coeurs: number): number => Math.max(1, Math.floor((coeurs - 2) / 2));
// Une station qui ne publie pas encore ses cœurs : un départ prudent.
export const COOKS_SANS_COEURS = 2;

// Ce que choisir cette station pour principale implique, et ses cooks.
export function machineProposee(station: Pick<StationVue, "nom" | "machine" | "coeurs">): MachineProposee {
  const toujoursAllumee = !estUnOrdinateur(station);
  const { coeurs } = station;
  return {
    toujoursAllumee,
    implique: toujoursAllumee ? "always on: it keeps cooking while your computer sleeps" : "stops when you close the app on this computer",
    cooks: coeurs === undefined ? COOKS_SANS_COEURS : cooksDesCoeurs(coeurs),
    cooksDit:
      coeurs === undefined
        ? `${station.nom} does not publish its cores yet: ${COOKS_SANS_COEURS}, a careful start`
        : `from ${station.nom}'s ${coeurs} cores: two are kept for the kitchen itself, then about two per cook`,
  };
}

// La valeur de départ mesurée (#425) : celle sur laquelle la box de brigade tourne, qui a jugé,
// découpé et relu sans un désaccord.
export const CALIBRAGE_MESURE: Calibre = { modele: "sonnet", effort: "medium" };

// Le calibrage que l'app propose : celui du projet confié le plus récemment à une station — ce sur
// quoi les autres projets du chef tournent —, ou, à défaut, la valeur de départ mesurée.
export function calibrageRecommande(demandes: readonly ProjetDemande[]): CalibrageRecommande {
  const valide = ({ modele, effort }: Calibre) => (MODELES as readonly string[]).includes(modele) && (EFFORTS as readonly string[]).includes(effort);
  const dernier = demandes
    .filter(({ manager, reviewer }) => valide(manager) && valide(reviewer))
    .reduce<ProjetDemande | undefined>((retenu, projet) => (retenu === undefined || (projet.demandeLe ?? "") > (retenu.demandeLe ?? "") ? projet : retenu), undefined);
  if (dernier !== undefined) return { manager: dernier.manager, reviewer: dernier.reviewer, dit: `what ${dernier.nom} runs on, your project most recently given to a station` };
  return { manager: CALIBRAGE_MESURE, reviewer: CALIBRAGE_MESURE, dit: "the starting value measured on brigade's own box, for lack of another project on your stations" };
}

// Ce que l'app dit au moment où le chef choisit cette principale.
export function avertissement(station: Pick<StationVue, "nom" | "machine"> | undefined): string | undefined {
  if (station === undefined || !estUnOrdinateur(station)) return undefined;
  return `${station.nom} is a computer's app: this project's kitchen stops whenever you close the app there. A server station, always on, is recommended.`;
}

// Les champs qui empêchent de valider, chacun avec sa raison. Aucun : la saisie peut partir.
export function refusDeSaisie(saisie: SaisieDuProjet, stations: readonly StationVue[], existants: readonly string[]): Signales {
  const signales: Signales = {};
  const signaler = (champ: Champ, raison: string | undefined) => {
    if (raison !== undefined) signales[champ] = raison;
  };
  const nom = nomDuProjet(saisie.depot);
  signaler(
    "depot",
    saisie.depot === ""
      ? "Choose the project's GitHub repository — `<owner>/<name>`."
      : !DEPOT.test(saisie.depot) || saisie.depot.endsWith(".git")
        ? `“${saisie.depot.slice(0, 60)}” is not a GitHub repository: expected \`<owner>/<name>\`.`
        : !NOM.test(nom)
          ? "This repository's name gives no project name: letters, digits and dashes."
          : existants.includes(nom)
            ? `A project named ${nom} is already on your stations: remove it first.`
            : undefined,
  );
  signaler("base", saisie.base === "" ? "The integration branch is missing: the branch the kitchen delivers to." : BRANCHE.test(saisie.base) ? undefined : `“${saisie.base.slice(0, 60)}” is not a branch name.`);
  const connues = new Set(stations.map(({ id }) => id));
  const sansCuisine = stations.filter(({ id, cuisine }) => cuisine === false && saisie.stations.includes(id)).map(({ nom }) => nom);
  signaler("stations", saisie.stations.length === 0 ? "Choose at least one station to serve this project." : saisie.stations.some((id) => !connues.has(id)) ? "A chosen station is no longer paired with this app." : sansCuisine.length > 0 ? `${sansCuisine.join(", ")} does not cook: choose a station that does.` : undefined);
  signaler("principale", saisie.principale === "" ? "Choose its main station: the one that runs its manager and its pass." : saisie.stations.includes(saisie.principale) ? undefined : "The main station must be one of the chosen stations.");
  return { ...signales, ...refusDesDecisions(saisie) };
}

// Le plafond de cooks et le calibrage : les décisions du chef — proposées, mais jamais vides.
function refusDesDecisions(saisie: Pick<SaisieDuProjet, "cooks" | "manager" | "reviewer">): Signales {
  const signales: Signales = {};
  const signaler = (champ: Champ, raison: string | undefined) => {
    if (raison !== undefined) signales[champ] = raison;
  };
  signaler("cooks", saisie.cooks === "" ? "How many cooks may the main station run at once for this project?" : /^[1-9][0-9]{0,2}$/.test(saisie.cooks) ? undefined : "The number of cooks is a whole number, 1 or more.");
  for (const role of ["manager", "reviewer"] as const) {
    const { modele, effort } = saisie[role];
    signaler(`${role}-modele`, (MODELES as readonly string[]).includes(modele) ? undefined : `Choose the ${role}'s model.`);
    signaler(`${role}-effort`, (EFFORTS as readonly string[]).includes(effort) ? undefined : `Choose the ${role}'s effort.`);
  }
  return signales;
}

// Ce que la page d'un projet envoie pour confier sa cuisine : la saisie du parcours, et le nom du
// projet dans l'app — celui sous lequel ses stations le serviront.
export type SaisieDeConfiance = SaisieDuProjet & { nom: string };
export function lireConfiance(recu: unknown): SaisieDeConfiance {
  return { ...lireSaisie(recu), nom: texte((recu as { nom?: unknown } | null | undefined)?.nom) };
}

// Ce que les stations font déjà d'un projet : celles qui le portent — que l'app le leur ait demandé,
// ou qu'elles le servent sans elle —, s'il a déjà sa principale, et ce que l'app en a demandé.
export type DejaTenu = { portee: string[]; principale: boolean; demande?: ProjetDemande };

// Les champs qui empêchent de confier le projet à ces stations, chacun avec sa raison. Une station
// qui le porte déjà ne se choisit pas une seconde fois ; un projet qui a sa principale n'en prend pas
// d'autre ; une station de plus reprend le plafond et le calibrage déjà demandés.
export function refusDeConfiance(saisie: SaisieDeConfiance, stations: readonly StationVue[], tenu: DejaTenu): Signales {
  const signales: Signales = {};
  const signaler = (champ: Champ, raison: string | undefined) => {
    if (raison !== undefined) signales[champ] = raison;
  };
  signaler("nom", NOM.test(saisie.nom) ? undefined : `“${saisie.nom.slice(0, 60)}” cannot be a project's name on a station: lowercase letters, digits and dashes.`);
  signaler(
    "depot",
    saisie.depot === "" ? "Choose the project's GitHub repository — `<owner>/<name>`." : !DEPOT.test(saisie.depot) || saisie.depot.endsWith(".git") ? `“${saisie.depot.slice(0, 60)}” is not a GitHub repository: expected \`<owner>/<name>\`.` : undefined,
  );
  signaler("base", saisie.base === "" ? "The integration branch is missing: the branch the kitchen delivers to." : BRANCHE.test(saisie.base) ? undefined : `“${saisie.base.slice(0, 60)}” is not a branch name.`);
  const connues = new Map(stations.map((station) => [station.id, station.nom]));
  const sansCuisine = stations.filter(({ id, cuisine }) => cuisine === false && saisie.stations.includes(id)).map(({ nom }) => nom);
  const deja = saisie.stations.filter((id) => tenu.portee.includes(id)).map((id) => connues.get(id) ?? id);
  signaler(
    "stations",
    saisie.stations.length === 0
      ? `Choose at least one station to cook ${saisie.nom || "this project"}.`
      : saisie.stations.some((id) => !connues.has(id))
        ? "A chosen station is no longer paired with this app."
        : sansCuisine.length > 0
          ? `${sansCuisine.join(", ")} does not cook: choose a station that does.`
          : deja.length > 0
          ? `${deja.join(", ")} already cook${deja.length > 1 ? "" : "s"} it: choose another station.`
          : undefined,
  );
  if (tenu.principale) signaler("principale", saisie.principale === "" ? undefined : "It already has its main station: the stations you add run neither its manager nor its pass.");
  else signaler("principale", saisie.principale === "" ? "Choose its main station: the one that runs its manager and its pass." : saisie.stations.includes(saisie.principale) ? undefined : "The main station must be one of the chosen stations.");
  return tenu.demande === undefined ? { ...signales, ...refusDesDecisions(saisie) } : signales;
}

// Ce qu'une station dit d'un projet, avec elle.
type Dit = { station: StationVue; suivi: SuiviDuProjet };
const ORDRE_DES_ETAPES: readonly Bascule["etape"][] = ["demandee", "acceptee", "remise", "refusee"];

// Où cuit un projet, d'après ce que ses stations en disent : celle qui le sert ; entre deux — celle
// qu'il quitte a fermé sa cuisine, l'autre ne l'a pas encore ouverte —, celle qu'elles nomment.
export function cuitSurDe(dits: readonly Dit[], locale: string | null): CuitSur | null {
  const servi = dits.find(({ suivi }) => suivi.etat === "servi");
  if (servi !== undefined) return { id: servi.station.id, nom: servi.station.nom, ici: servi.suivi.ici || servi.station.id === locale };
  const nomme = dits.find(({ suivi }) => suivi.cuitSur !== null)?.suivi.cuitSur;
  if (nomme === undefined || nomme === null) return null;
  const station = dits.find(({ station: candidate }) => candidate.nom === nomme)?.station;
  return { id: station?.id ?? null, nom: nomme, ici: station !== undefined && station.id === locale };
}

// L'hôte par lequel se lit le rail d'un projet que le fichier des projets ne dit pas hébergé : celui
// que la station qui le sert donne (`<machine>/<moteur>` : la machine). Un projet ajouté depuis l'app n'a pas
// d'`hote` dans le fichier (ajout.ts) — sans cela, son rail ne serait lu nulle part dès que son parcours
// disparaît (#1405). Rien, quand aucune station ne le sert, ou que c'est celle de cet ordinateur.
export function hoteDeLaStation(vu: Pick<VuDesProjets, "projets"> | undefined, nom: string): string | undefined {
  const cuit = vu?.projets.find((projet) => projet.nom === nom)?.cuitSur;
  if (cuit === undefined || cuit === null || cuit.ici) return undefined;
  const machine = cuit.nom.includes("/") ? cuit.nom.slice(0, cuit.nom.indexOf("/")) : cuit.nom;
  return /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(machine) ? machine : undefined;
}

// Le déménagement en cours d'un projet, d'après ses stations : le plus récent, à son étape la plus
// avancée. Reçu par celle qui le reprend, il est fini : rien. Refusé, `dit` dit pourquoi — ce que
// la station visée en a écrit.
export function demenagementDe(dits: readonly Dit[]): DemenagementEnCours | null {
  const bascules = dits.flatMap(({ station, suivi }) => (suivi.bascule === null ? [] : [{ station, suivi, bascule: suivi.bascule }]));
  const derniere = bascules.reduce<string | undefined>((retenue, { bascule }) => (retenue === undefined || bascule.demandeLe > retenue ? bascule.demandeLe : retenue), undefined);
  const siennes = bascules.filter(({ bascule }) => bascule.demandeLe === derniere);
  if (siennes.length === 0 || siennes.some(({ bascule }) => bascule.etape === "recue")) return null;
  const rang = (etape: Bascule["etape"]) => ORDRE_DES_ETAPES.indexOf(etape);
  const retenue = siennes.reduce((plus, une) => (rang(une.bascule.etape) > rang(plus.bascule.etape) ? une : plus));
  const { de, vers, demandeLe, etape } = retenue.bascule;
  const visee = siennes.find(({ station }) => station.nom === vers);
  const dit = etape === "refusee" ? (visee?.suivi.etat === "refuse" ? visee.suivi.dit : retenue.suivi.dit) : (visee ?? retenue).suivi.dit;
  return { de, vers, demandeLe, etape, dit };
}

// Une durée, telle que la home la dit.
function duree(ms: number): string {
  const secondes = Math.max(0, Math.round(ms / 1000));
  return secondes < 60 ? `${secondes} s` : `${Math.floor(secondes / 60)} min ${String(secondes % 60).padStart(2, "0")} s`;
}

// Les projets se relisent quand les stations se relisent (stations/stations.ts) : c'est à
// chaque lecture des stations que l'app demande `relire`.
export type OptionsProjets = {
  github: GitHubDesStations;
  // Les stations appairées, telles que la dernière lecture les donne.
  stations: () => readonly StationVue[] | undefined;
  depots: () => Promise<DepotDuChef[]>;
  surLecture: (vu: VuDesProjets) => void;
  maintenant?: () => number;
  // Le gist de la station de cet ordinateur, nul quand l'app n'en a pas.
  locale?: () => string | null;
  // L'opération du runtime qui déménage une cuisine (demenagement.ts). Absente, l'app n'a pas de
  // runtime à côté d'elle : rien ne se déménage d'ici.
  demenager?: Demenageur;
  // Note la décision du chef de cuire sans bac à sable pour `station`, dans l'état de `projet` sur cet
  // ordinateur (runtime/src/onboarding/attente.ts, `accepterSansBacASable`). Absente, l'app n'a pas de runtime à côté d'elle.
  accepterSansBac?: (projet: string, station: string) => Promise<void>;
  // L'opération du runtime qui demande un remède à une station par son gist (remede.ts). Absente, l'app
  // n'a pas de runtime à côté d'elle : aucun refus ne se lève d'ici.
  demanderLeRemede?: DemanderLeRemede;
};
export type DecisionSansBac = { fait: string } | { refus: string; detail?: string };

export type Projets = {
  vu(): VuDesProjets | undefined;
  relire(): Promise<VuDesProjets>;
  depots(): Promise<{ depots: DepotDuChef[] } | { refus: string }>;
  ajouter(recu: unknown): Promise<Ajout>;
  // Confie la cuisine d'un projet de l'app à une première station, ou à une de plus.
  confier(recu: unknown): Promise<Ajout>;
  retirer(nom: unknown): Promise<Retrait>;
  // Déménage la cuisine d'un projet vers une station appairée — son gist.
  demenager(nom: unknown, vers: unknown): Promise<Demenagement>;
  // Le chef continue sans bac à sable sur la station du projet : sa décision est notée, la retenue du rail se lève.
  continuerSansBac(nom: unknown): Promise<DecisionSansBac>;
  // Lève le refus que la principale du projet publie, par le remède qu'il offre (#1205) : la station le
  // joue, puis dit si le refus tient. Les projets sont relus avant que la réponse ne parte.
  remedier(nom: unknown, refus: unknown, remede: unknown): Promise<IssueDuRemede>;
  // Les pages GitHub où autoriser brigade, telles que les stations les ont publiées.
  pages(): string[];
};

export function tenirProjets(options: OptionsProjets): Projets {
  const { github } = options;
  const maintenant = options.maintenant ?? Date.now;
  const locale = options.locale ?? (() => null);
  let vu: VuDesProjets | undefined;
  let enCours: Promise<VuDesProjets> | undefined;
  // Les écritures se suivent : deux gestes du chef ne réécrivent pas la même demande en même temps.
  let ecritures: Promise<unknown> = Promise.resolve();
  const enFile = <T>(geste: () => Promise<T>): Promise<T> => {
    const suite = ecritures.then(geste, geste);
    ecritures = suite.catch(() => undefined);
    return suite;
  };
  const appairees = () => options.stations() ?? [];

  // La demande et le suivi de chaque station appairée.
  const lireTout = async () =>
    Promise.all(
      appairees().map(async (station) => {
        const fichiers = await github.lire(station.id);
        return { station, demande: lireDemande(fichiers?.[FICHIER_PROJETS]), suivi: lireSuivi(fichiers?.[FICHIER_SUIVI]), onboarding: lireOnboarding(fichiers?.[FICHIER_SUIVI]) };
      }),
    );

  const choix = () => {
    const stations = appairees();
    return {
      recommandee: principaleRecommandee(stations) ?? null,
      avertissements: Object.fromEntries(stations.flatMap((station) => {
        const dit = avertissement(station);
        return dit === undefined ? [] : [[station.id, dit]];
      })),
      machines: Object.fromEntries(stations.filter(({ etat }) => etat !== "illisible").map((station) => [station.id, machineProposee(station)])),
    };
  };

  const lire = async (): Promise<VuDesProjets> => {
    const instant = maintenant();
    try {
      const lus = await lireTout();
      const ici = locale();
      const projets = new Map<string, ProjetVu>();
      const dits = new Map<string, Dit[]>();
      for (const { station, suivi } of lus) for (const un of suivi) dits.set(un.nom, [...(dits.get(un.nom) ?? []), { station, suivi: un }]);
      for (const { station, demande, suivi, onboarding } of lus) {
        for (const projet of demande ?? []) {
          const siens = dits.get(projet.nom) ?? [];
          const vu: ProjetVu = projets.get(projet.nom) ?? { nom: projet.nom, depot: projet.depot, base: projet.base, stations: [], servi: null, cuitSur: cuitSurDe(siens, ici), demenagement: demenagementDe(siens) };
          // L'onboarding, seule la principale le publie.
          const sien = projet.principale ? onboarding[projet.nom] : undefined;
          if (sien !== undefined) vu.onboarding = sien;
          const dit = suivi.find(({ nom }) => nom === projet.nom);
          // Ce qui retient la cuisine, seule la principale le dit ; relu à chaque lecture, il s'efface quand elle ne le dit plus.
          if (projet.principale) {
            vu.acces = dit?.acces ?? null;
            vu.refus = dit?.refus ?? null;
            vu.worktree = dit?.worktree ?? null;
            if (dit?.clone !== undefined) vu.clone = dit.clone;
            else delete vu.clone;
          }
          vu.stations.push({ id: station.id, nom: station.nom, principale: projet.principale, etat: dit?.etat ?? "attendu", dit: dit?.dit ?? `${station.nom} has not read it yet: it reads what the app asks every 30 s`, autoriser: dit?.autoriser ?? [] });
          if (projet.principale && dit?.etat === "servi" && dit.serviLe !== null) {
            const depuis = projet.ouvertLe ?? projet.demandeLe;
            vu.servi = depuis === null ? null : `served by ${station.nom} ${duree(Date.parse(dit.serviLe) - Date.parse(depuis))} after “add a project” was opened`;
          }
          projets.set(projet.nom, vu);
        }
      }
      for (const projet of projets.values()) projet.stations.sort((a, b) => Number(b.principale) - Number(a.principale) || a.nom.localeCompare(b.nom));
      const calibrage = calibrageRecommande(lus.flatMap(({ demande }) => demande ?? []));
      vu = { a: new Date(instant).toISOString(), projets: [...projets.values()].sort((a, b) => a.nom.localeCompare(b.nom)), locale: ici, ...choix(), calibrage };
    } catch (erreur) {
      vu = { a: new Date(instant).toISOString(), projets: vu?.projets ?? [], locale: locale(), ...choix(), calibrage: vu?.calibrage ?? calibrageRecommande([]), sans: `the projects on your stations could not be read on GitHub — ${message(erreur)}` };
    }
    options.surLecture(vu);
    return vu;
  };

  const relire = () => {
    enCours ??= lire().finally(() => (enCours = undefined));
    return enCours;
  };

  // Réécrit la demande de chaque station : `changer` rend ses projets, à partir de ceux d'avant.
  const reecrire = async (changer: (station: StationVue, avant: ProjetDemande[]) => ProjetDemande[]) => {
    const lus = await lireTout();
    const illisible = lus.find(({ demande }) => demande === null);
    if (illisible !== undefined) throw new Error(`what this app wrote on ${illisible.station.nom}'s gist (${FICHIER_PROJETS}) is unreadable: nothing was changed`);
    const ecrits: string[] = [];
    for (const { station, demande } of lus) {
      const avant = demande ?? [];
      const apres = changer(station, avant);
      if (JSON.stringify(apres) === JSON.stringify(avant)) continue;
      await github.ecrire(station.id, { [FICHIER_PROJETS]: documentDeDemande(apres) });
      ecrits.push(station.nom);
    }
    return ecrits;
  };

  const ajouter = (recu: unknown): Promise<Ajout> =>
    enFile(async () => {
      const saisie = lireSaisie(recu);
      const stations = appairees();
      const existants = (await relire()).projets.map(({ nom }) => nom);
      const signales = refusDeSaisie(saisie, stations, existants);
      if (Object.keys(signales).length > 0) return { signales };
      const nom = nomDuProjet(saisie.depot);
      const instant = new Date(maintenant()).toISOString();
      const projet = (principale: boolean): ProjetDemande => ({
        nom,
        depot: saisie.depot,
        base: saisie.base,
        principale,
        cooks: Number(saisie.cooks),
        manager: saisie.manager,
        reviewer: saisie.reviewer,
        ouvertLe: Number.isNaN(Date.parse(saisie.ouvertLe)) ? null : new Date(saisie.ouvertLe).toISOString(),
        demandeLe: instant,
      });
      try {
        await reecrire((station, avant) => (saisie.stations.includes(station.id) ? [...avant.filter((p) => p.nom !== nom), projet(station.id === saisie.principale)] : avant));
      } catch (erreur) {
        await relire();
        return { refus: `${nom} was not added: GitHub could not be read or written — ${message(erreur)}` };
      }
      await relire();
      return { ajoute: nom };
    });

  // La page d'un projet le confie à des stations : à une première — il prend alors sa principale,
  // son plafond et son calibrage —, ou à une de plus, qui reprend ce que l'app en a déjà demandé.
  const confier = (recu: unknown): Promise<Ajout> =>
    enFile(async () => {
      const saisie = lireConfiance(recu);
      const stations = appairees();
      let lus: Awaited<ReturnType<typeof lireTout>>;
      try {
        lus = await lireTout();
      } catch (erreur) {
        return { refus: `${saisie.nom} was not entrusted to a station: GitHub could not be read — ${message(erreur)}` };
      }
      const demandes = lus.flatMap(({ station, demande }) => (demande ?? []).filter(({ nom }) => nom === saisie.nom).map((projet) => ({ station, projet })));
      const servie = stations.filter((station) => station.projets.includes(saisie.nom));
      const tenu: DejaTenu = {
        portee: [...new Set([...demandes.map(({ station }) => station.id), ...servie.map(({ id }) => id)])],
        principale: servie.length > 0 || demandes.some(({ projet }) => projet.principale),
        ...(demandes[0] === undefined ? {} : { demande: demandes.find(({ projet }) => projet.principale)?.projet ?? demandes[0].projet }),
      };
      // Une station de plus sert ce que la première sert déjà : son dépôt, sa branche et son plafond, tels
      // qu'elle les publie, puis tels que l'app les lui a demandés ; le chef ne les redit pas.
      const dits = lus.flatMap(({ station, suivi }) => suivi.filter(({ nom }) => nom === saisie.nom).map((un) => ({ station, un }))).sort((a, b) => Number(b.un.etat === "servi") - Number(a.un.etat === "servi"));
      const premiere = <C extends "depot" | "base" | "cooks">(champ: C): SuiviDuProjet[C] | undefined => dits.find(({ un }) => un[champ] !== null)?.un[champ];
      const repris = tenu.demande;
      const reprise = tenu.principale
        ? { depot: premiere("depot") ?? repris?.depot ?? saisie.depot, base: premiere("base") ?? repris?.base ?? saisie.base, cooks: premiere("cooks") ?? repris?.cooks ?? (saisie.cooks === "" ? undefined : Number(saisie.cooks)) }
        : { depot: saisie.depot, base: saisie.base, cooks: Number(saisie.cooks) };
      const effective: SaisieDeConfiance = { ...saisie, depot: reprise.depot, base: reprise.base, cooks: reprise.cooks === undefined ? "" : String(reprise.cooks) };
      const signales = refusDeConfiance(effective, stations, tenu);
      const premiereStation = (dits[0]?.station ?? stations.find(({ id }) => tenu.portee.includes(id)))?.nom ?? "the first station";
      const manque: Manquant[] = tenu.principale ? (["depot", "base", "cooks"] as const).filter((champ) => effective[champ] === "") : [];
      for (const champ of manque) signales[champ] = `${premiereStation} does not say ${{ depot: "which GitHub repository it serves", base: "which integration branch it delivers to", cooks: "how many cooks it may run at once" }[champ]} for ${saisie.nom}: give the ${{ depot: "repository", base: "integration branch", cooks: "cook cap" }[champ]}.`;
      if (Object.keys(signales).length > 0) return manque.length > 0 ? { signales, manque } : { signales };
      const instant = new Date(maintenant()).toISOString();
      const projet = (principale: boolean): ProjetDemande => ({
        nom: saisie.nom,
        depot: effective.depot,
        base: effective.base,
        principale,
        cooks: Number(effective.cooks),
        manager: repris?.manager ?? saisie.manager,
        reviewer: repris?.reviewer ?? saisie.reviewer,
        ouvertLe: Number.isNaN(Date.parse(saisie.ouvertLe)) ? null : new Date(saisie.ouvertLe).toISOString(),
        demandeLe: instant,
      });
      try {
        await reecrire((station, avant) => (saisie.stations.includes(station.id) ? [...avant.filter((p) => p.nom !== saisie.nom), projet(!tenu.principale && station.id === saisie.principale)] : avant));
      } catch (erreur) {
        await relire();
        return { refus: `${saisie.nom} was not entrusted to a station: GitHub could not be read or written — ${message(erreur)}` };
      }
      await relire();
      return { ajoute: saisie.nom };
    });

  const retirer = (recu: unknown): Promise<Retrait> =>
    enFile(async () => {
      const nom = texte(recu);
      if (nom === "") return { refus: "which project? none was named" };
      try {
        const ecrits = await reecrire((_, avant) => avant.filter((projet) => projet.nom !== nom));
        if (ecrits.length === 0) return { refus: `${nom} is on none of your stations` };
      } catch (erreur) {
        return { refus: `${nom} was not removed: GitHub could not be read or written — ${message(erreur)}` };
      }
      await relire();
      return { retire: nom };
    });

  // Déménager : vers une station appairée, et par l'opération du runtime seule — elle lit et écrit
  // les demandes elle-même ; l'app relit ensuite ce qu'elle a écrit. À la suite des autres écritures.
  const demenager = (recuNom: unknown, recuVers: unknown): Promise<Demenagement> =>
    enFile(async () => {
      const nom = texte(recuNom);
      const vers = texte(recuVers);
      if (nom === "") return { refus: "which project? none was named" };
      const stations = appairees();
      const visee = stations.find(({ id }) => id === vers);
      if (visee === undefined) return { refus: "that station is no longer paired with this app: nothing was changed" };
      if (visee.cuisine === false) return { refus: `${visee.nom} does not cook: nothing was changed` };
      if (options.demenager === undefined) return { refus: "this app has no runtime beside it to move a kitchen: nothing was changed" };
      const rendu = await options.demenager(nom, visee.id, stations.map(({ id }) => id));
      await relire();
      return rendu;
    });

  // Lever un refus : la demande part vers la principale du projet, par son gist — l'ordinateur du chef ou une
  // station distante, de la même façon. Deux demandes vers le même gist se suivent : chacune y réécrit le
  // fichier des remèdes. Le refus doit être celui que la page montre, et offrir ce remède : sinon rien ne part.
  const remedesEnCours = new Map<string, Promise<IssueDuRemede>>();
  const remedier = async (recuNom: unknown, recuRefus: unknown, recuRemede: unknown): Promise<IssueDuRemede> => {
    const nom = texte(recuNom);
    const code = texte(recuRefus);
    const remede = texte(recuRemede);
    if (nom === "") return { outcome: "error", error: "which project? none was named: nothing was done" };
    const projet = vu?.projets.find((un) => un.nom === nom);
    const principale = projet?.stations.find(({ principale: oui }) => oui);
    if (projet === undefined || principale === undefined) return { outcome: "error", error: `${nom} cooks on none of your stations: nothing was done` };
    const refus = projet.refus ?? null;
    if (refus === null) return { outcome: "error", error: `${principale.nom} no longer refuses ${nom}: nothing was done` };
    if (refus.code !== code || refus.remedy?.id !== remede) return { outcome: "error", error: `${principale.nom} no longer offers this action for ${nom}: nothing was done` };
    const demander = options.demanderLeRemede;
    if (demander === undefined) return { outcome: "error", error: "this app has no runtime beside it to ask for this action: nothing was done" };
    const jouer = async (): Promise<IssueDuRemede> => {
      try {
        return pourLaPage(await demander({ canal: canalDesGists(github), gist: principale.id, demande: { project: nom, refusal: code, remedy: remede } }));
      } catch (erreur) {
        return { outcome: "error", error: `GitHub could not be read or written, so nothing is known to have been done — ${message(erreur)}` };
      }
    };
    const chaine = (remedesEnCours.get(principale.id) ?? Promise.resolve()).then(jouer);
    remedesEnCours.set(principale.id, chaine);
    const issue = await chaine;
    if (remedesEnCours.get(principale.id) === chaine) remedesEnCours.delete(principale.id);
    // La station a réécrit son suivi avant de répondre : relu, le refus levé n'y est plus.
    await relire();
    return issue;
  };

  // Continuer sans bac à sable : la décision s'écrit dans l'état du projet, sur la station de cet
  // ordinateur — la seule que l'app atteigne ; une principale ailleurs dit qui peut la prendre.
  const continuerSansBac = async (recuNom: unknown): Promise<DecisionSansBac> => {
    const nom = texte(recuNom);
    if (nom === "") return { refus: "which project? none was named" };
    const principale = vu?.projets.find((projet) => projet.nom === nom)?.stations.find(({ principale: oui }) => oui);
    if (principale === undefined) return { refus: `${nom} cooks on none of your stations: nothing was changed` };
    if (options.accepterSansBac === undefined || locale() === null) return { refus: "this app has no runtime beside it to record this choice: nothing was changed" };
    if (principale.id !== locale()) return { refus: `${principale.nom} cooks ${nom}, not this computer: the choice can only be recorded from ${principale.nom}'s own computer — or choose another station: nothing was changed` };
    try {
      await options.accepterSansBac(nom, principale.nom);
    } catch (erreur) {
      return { refus: "the choice could not be recorded: nothing was changed", detail: message(erreur) };
    }
    return { fait: `continuing without a sandbox on ${principale.nom}: ${nom} starts on its next turn` };
  };

  return {
    vu: () => vu,
    relire,
    demenager,
    continuerSansBac,
    remedier,
    async depots() {
      try {
        return { depots: await options.depots() };
      } catch (erreur) {
        return { refus: `your repositories could not be read on GitHub — ${message(erreur)}` };
      }
    },
    ajouter,
    confier,
    retirer,
    // Et celles que son onboarding montre : le geste attendu, le ticket de préparation, sa PR ; et celles
    // du geste d'un clone en échec (#1390).
    pages: () =>
      [...new Set((vu?.projets ?? []).flatMap(({ stations, onboarding, clone }) => [
        ...stations.flatMap(({ autoriser }) => autoriser),
        ...(clone?.liens ?? []),
        ...(onboarding?.etapes ?? []).flatMap(({ geste }) => geste?.liens ?? []),
        ...(onboarding?.preparation === null || onboarding?.preparation === undefined ? [] : [onboarding.preparation.url, ...(onboarding.preparation.pr === null ? [] : [onboarding.preparation.pr])]),
      ]))],
  };
}
