// Confier la cuisine d'un projet à ses stations, depuis l'app, sans terminal : le chef choisit le
// dépôt GitHub et les stations qui le servent, et valide. L'app écrit la demande dans le gist de chaque
// station choisie (request.ts) ; chaque station la lit là, prépare le projet et l'ajoute à sa
// configuration (runtime/src/projets/). La station recommandée est une station serveur, toujours allumée ;
// choisir seulement l'app d'un ordinateur se dit au moment du choix : la cuisine s'arrête quand on la ferme.
//
// Deux portes y mènent : « + add a project », sur la page d'une station (`ajouter`), et la page d'un
// projet de l'app (#983, `confier`) — qui le confie à une première station, ou à une de plus. Ajouter
// un projet à l'app ne passe pas par ici (addition.ts) : c'est ce geste-ci, et lui seul, qui l'installe
// sur une station.
//
// Le calibrage et le plafond de cooks sont les décisions du chef, mais elles ne commencent pas vides
// (#425, #1107) : l'app propose le nombre de cooks que les cœurs de la station permettent, et le
// calibrage qui tourne déjà sur ses autres projets — ou la valeur de départ mesurée —, chacun avec
// d'où il vient. Ce qui manque est signalé champ par champ, sans rien écrire. Une station de plus
// reprend le dépôt, la branche et le calibrage que la première sert — ou que le clone du projet sur cet
// ordinateur dit (#1307) —, et n'apporte que ce qui est à sa machine : ses cooks et ses capacités.
// Retirer le projet le retire de la demande de chaque station : elle le retire de sa configuration.
//
// Une fois confiée, sa cuisine déménage d'un geste (#1095, `demenager`) : vers cet ordinateur, vers
// sa box, vers une autre station, sans retrait ni rajout — c'est l'opération du runtime qui l'écrit
// (demenagement.ts). Où il cuit se lit dans le suivi de chaque station (`cuitSur`), pas dans la
// demande : une station qui refuse de le reprendre le laisse cuire là où il cuisait.
import type { GitHubDesStations } from "../stations/github.ts";
import type { StationVue } from "../stations/stations.ts";
import { avecLeSuivi, capacitiesLues, documentDeRequest, FICHIER_PROJECTS, FICHIER_SUIVI, lireRequest, lireOnboarding, lireSuivi, doorLeSuivi, type AccesBlocked, type Bascule, type Blockage, type Calibre, type Choice, type Delay, type FailureDuClone, type FailureDuWorktree, type StateDuProject, type Onboarding, type ProjectRequest, type Refusal, type Selections, type SuiviDuProject, type TimePublished } from "./request.ts";
import type { Demenagement, Demenageur } from "./demenagement.ts";
import type { RepositoryDuChef } from "./github.ts";
import { delayDuProject } from "../delays/kitchen.ts";
import { canalDesGists, pourLaPage, type DemanderLeRemede, type IssueDuRemede } from "./remede.ts";

// Le calibrage que la station accepte : ses deux listes fermées (runtime/src/calibrage.ts).
export const MODELES = ["opus", "sonnet", "haiku"] as const;
export const EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;

export type SaisieDuProject = {
  depot: string;
  base: string;
  // Les gists des stations choisies.
  stations: string[];
  cooks: string;
  manager: Calibre;
  reviewer: Calibre;
  // Quand le chef a ouvert le parcours.
  ouvertLe: string;
  // Ce que la machine ajoutée sait faire en plus de coder, coché par le chef (#1307) : sa demande le porte.
  capacites: string[];
};
export type Champ = "nom" | "depot" | "base" | "stations" | "cooks" | "capacites" | "manager-modele" | "manager-effort" | "reviewer-modele" | "reviewer-effort";
export type Signales = Partial<Record<Champ, string>>;

// Une station d'un projet, telle que la home la montre : toutes de la même façon, ce qu'elle en dit et les autorisations
// GitHub qu'elle attend.
export type StationDuProject = { id: string; nom: string; etat: StateDuProject | "attendu"; dit: string; autoriser: string[] };
// Où cuit un projet : la station qui le sert — son gist quand elle est appairée —, et si c'est
// celle de cet ordinateur.
export type CuitSur = { id: string | null; nom: string; ici: boolean };
// Un déménagement en cours : d'où, vers où, son étape — `dit`, pourquoi il est refusé.
export type DemenagementEnCours = Bascule & { dit: string };
export type ProjectVu = {
  nom: string;
  depot: string;
  base: string;
  stations: StationDuProject[];
  // La station dont le gist porte le suivi du projet — son onboarding, son refus, ses choix — ; absente tant qu'aucune ne le porte.
  suiviPar?: { id: string; nom: string };
  // Du parcours ouvert au projet servi par cette station — la mesure que la spec borne à dix minutes.
  servi: string | null;
  // Où il cuit, tel que ses stations le disent ; nul tant qu'aucune ne le dit.
  cuitSur?: CuitSur | null;
  // Son déménagement, tant qu'il n'est pas fini.
  demenagement?: DemenagementEnCours | null;
  // Où il en est de son ajout à son premier ticket, tel que le suivi le publie (#1110) ; nul
  // tant qu'elle n'en dit rien.
  onboarding?: Onboarding | null;
  // Ce qui retient sa cuisine, tel que le suivi le publie (#1117, #1118) : l'accès au dépôt refusé,
  // avec son geste ; un worktree impossible à préparer, avec sa raison et l'heure du prochain essai.
  // Nuls (ou absents) quand rien ne retient.
  acces?: AccesBlocked | null;
  // Pourquoi la station refuse de le servir, en une phrase, et ce que le chef fait (#1178).
  refus?: Refusal | null;
  worktree?: FailureDuWorktree | null;
  // Le clone du dépôt en échec, en clair : la cause, le compte GitHub de la station, le geste (#1390).
  // Absent quand le clone n'échoue pas.
  clone?: FailureDuClone;
  // Ce qui bloque le projet, tel que le suivi le publie (#1394) : une ligne chacun sur sa page (#1399).
  // Absent quand rien ne bloque.
  blocages?: Blockage[];
  // Le temps de son ajout à son premier ticket servi, tel que le suivi le publie (#1401). Absent sans délai publié.
  delai?: Delay;
  // Les temps de ses derniers tickets et son plafond, tels que le suivi les publie (#2346). Absent sans temps publiés.
  temps?: TimePublished;
  // Sur 24 h, la part des tickets mergés en 10 min ou moins de leur prise et leur médiane, la ligne de `status`,
  // tirée de ces temps (#4299). Absente sans temps publiés.
  delaiDePrise?: string;
  // Ce qui manque à la station pour ses tests, un choix par besoin, tel qu'elle le publie (#1398) — et les
  // issues que l'app a écrites dans sa demande, que la station n'a peut-être pas encore lues (#1400). Absents quand
  // il n'y en a pas.
  choix?: Choice[];
  choisis?: Selections;
};
// Ce que l'app propose pour une station choisie (#1107) : ce que ce choix implique —
// toujours allumée, ou arrêtée avec l'app de son ordinateur —, et le nombre de cooks à la fois que
// ses cœurs permettent, avec d'où il vient.
export type MachineProposee = { toujoursAllumee: boolean; implique: string; cooks: number; cooksDit: string };
// Le calibrage que l'app propose pour un projet qui prend sa première station, et d'où il vient.
export type CalibrationRecommande = { manager: Calibre; reviewer: Calibre; dit: string };
// `recommandee` : la station que l'app propose d'office — un serveur en ligne ; `avertissements` :
// ce qui se dit quand le chef choisit telle station ; `machines` : ce que l'écran de
// confiance dit de chaque station, et `calibrage`, ce qu'il propose.
// `locale` : le gist de la station de cet ordinateur, nul quand l'app n'en a pas.
export type VuDesProjects = {
  a: string;
  projets: ProjectVu[];
  locale?: string | null;
  recommandee: string | null;
  avertissements: Record<string, string>;
  machines: Record<string, MachineProposee>;
  calibrage: CalibrationRecommande;
  sans?: string;
};
// `manque` : parmi le dépôt, la branche d'intégration et le plafond de cooks, ceux que la première station
// ne dit pas et que le chef n'a pas donnés — chacun est aussi dans `signales`, sous son nom.
export type Manquant = "depot" | "base" | "cooks";
// Ce que le formulaire d'ajout d'une station montre d'emblée pour cet ordinateur (#1307), tel que l'opération du
// runtime le calcule (runtime/src/projets/ajout-de-station.ts, `defautsDeStation`) : les cooks que ses cœurs
// permettent et d'où vient ce nombre, le dossier où sa station pose les espaces de travail de ses cooks, et
// chaque capacité qu'elle peut déclarer, dite détectée ou non. `refus` : cet ordinateur n'a pas pu être lu.
export type CapacityDeLaMachine = { capacite: string; nom: string; detectee: boolean };
export type DefautsDeLaMachine = { cooks: number; cooksDit: string; espaceDeTravail: string; capacites: CapacityDeLaMachine[] } | { refus: string; detail?: string };
// Les dossiers de la station de cet ordinateur pour un projet (#2489) : son clone, les worktrees de ses cooks.
export type DossiersDeLaStation = { clone: string; worktrees: string } | { refus: string; detail?: string };
// Ce que le clone d'un projet sur cet ordinateur dit de lui : son dépôt, sa branche d'intégration.
export type DitDuClone = { depot: string | null; base: string | null };
export type Addition = { ajoute: string } | { signales: Signales; manque?: Manquant[] } | { refus: string };
export type Retrait = { retire: string } | { refus: string };
export type { Demenagement } from "./demenagement.ts";

// Un dépôt GitHub : `<owner>/<repo>`.
const REPOSITORY = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?\/[A-Za-z0-9_.-]{1,100}$/;
const BRANCH = /^[A-Za-z0-9._/-]{1,200}$/;
const NAME = /^[a-z0-9][a-z0-9-]*$/;

const texte = (recu: unknown) => (typeof recu === "string" ? recu.trim() : "");
const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

// Ce que la vue envoie, ramené à des textes : rien n'y est cru sur parole.
export function lireSaisie(recu: unknown): SaisieDuProject {
  const { depot: repository, base, stations, cooks, manager, reviewer, ouvertLe, capacites: capacities } = (recu ?? {}) as Record<string, unknown>;
  const calibre = (lu: unknown): Calibre => ({ modele: texte((lu as Calibre | undefined)?.modele), effort: texte((lu as Calibre | undefined)?.effort) });
  return {
    depot: texte(repository),
    base: texte(base),
    stations: Array.isArray(stations) ? [...new Set(stations.map(texte).filter((id) => id !== ""))] : [],
    cooks: texte(cooks),
    manager: calibre(manager),
    reviewer: calibre(reviewer),
    ouvertLe: texte(ouvertLe),
    capacites: capacitiesLues(capacities),
  };
}

// Le nom du projet, tiré de son dépôt : celui de son état et de son clone sur la station.
export function nameDuProject(repository: string): string {
  return (repository.split("/")[1] ?? "")
    .toLowerCase()
    .replace(/\.git$/, "")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Une station est l'app d'un ordinateur quand sa machine est un Mac ou un PC Windows ;
// un Linux est tenu pour un serveur, allumé en permanence.
export const estUnOrdinateur = (station: Pick<StationVue, "machine">) => /^(macOS|Windows)\b/.test(station.machine);

// Les temps de deux stations d'un même projet : un ticket n'est compté qu'une fois (le plus récent des deux enregistrements),
// le seuil du temps perdu est celui de la première station ; le résumé, les chiffres et le temps de la pass, ceux de la
// première qui en publie.
export function fusionnerLesTime(a: TimePublished | undefined, b: TimePublished): TimePublished {
  if (a === undefined) return b;
  const parTicket = new Map<unknown, unknown>();
  const fusion: unknown[] = [];
  for (const e of [...a.enregistrements, ...b.enregistrements]) {
    const ticket = (e as { ticket?: unknown } | null)?.ticket;
    if (typeof ticket !== "number") {
      fusion.push(e);
      continue;
    }
    const deja = parTicket.get(ticket) as { mergedAt?: unknown } | undefined;
    if (deja === undefined || Date.parse(String((e as { mergedAt?: unknown }).mergedAt)) > Date.parse(String(deja.mergedAt))) parTicket.set(ticket, e);
  }
  // Le résumé est celui de la première station qui en publie un ; le seuil, celui de la première.
  const resume = a.resume ?? b.resume;
  const figures = a.chiffres ?? b.chiffres;
  // Le temps de la pass (#3512) aussi : celui de la première station qui en publie un.
  const pass = a.passe ?? b.passe;
  return { enregistrements: [...parTicket.values(), ...fusion], lostTimeMaxMin: a.lostTimeMaxMin, ...(resume === undefined ? {} : { resume }), ...(figures === undefined ? {} : { chiffres: figures }), ...(pass === undefined || pass === null ? {} : { passe: pass }) };
}

// La station que l'app recommande : un serveur qui peut cuire maintenant — en ligne. Aucun en ligne : aucune ; une
// station hors ligne n'est jamais recommandée (#3187).
export function stationRecommandee(stations: readonly StationVue[]): string | undefined {
  return stations.find((station) => station.etat === "en-ligne" && station.cuisine !== false && !estUnOrdinateur(station))?.id;
}

// Celle des stations choisies dont le gist porte le suivi du projet : la recommandée si elle en est, sinon la première.
export function porteurDuSuivi(choisies: readonly string[], recommandee: string | undefined): string {
  return choisies.find((id) => id === recommandee) ?? choisies[0] ?? "";
}

// Le nombre de cooks que les cœurs d'une machine permettent : celui même que la station en dérive
// (runtime/src/projections/stations.ts, `plafondDesCoeurs`, #1079) — deux cœurs gardés pour le
// runtime, la pass et ses gates, puis environ un par cook (#3560). 8 cœurs : 6.
export const cooksDesCoeurs = (coeurs: number): number => Math.max(1, coeurs - 2);
// Une station qui ne publie pas encore ses cœurs : un départ prudent.
export const COOKS_SANS_COEURS = 2;

// Ce que choisir cette station implique, et ses cooks.
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
        : `from ${station.nom}'s ${coeurs} cores: two are kept for the kitchen itself, then about one per cook`,
  };
}

// La valeur de départ mesurée (#425) : celle sur laquelle la box de brigade tourne, qui a jugé,
// découpé et relu sans un désaccord.
export const CALIBRATION_MEASURE: Calibre = { modele: "sonnet", effort: "medium" };

// Le calibrage que l'app propose : celui du projet confié le plus récemment à une station — ce sur
// quoi les autres projets du chef tournent —, ou, à défaut, la valeur de départ mesurée.
export function calibrationRecommande(demandes: readonly ProjectRequest[]): CalibrationRecommande {
  const valide = ({ modele, effort }: Calibre) => (MODELES as readonly string[]).includes(modele) && (EFFORTS as readonly string[]).includes(effort);
  const dernier = demandes
    .filter(({ manager, reviewer }) => valide(manager) && valide(reviewer))
    .reduce<ProjectRequest | undefined>((retenu, project) => (retenu === undefined || (project.demandeLe ?? "") > (retenu.demandeLe ?? "") ? project : retenu), undefined);
  if (dernier !== undefined) return { manager: dernier.manager, reviewer: dernier.reviewer, dit: `what ${dernier.nom} runs on, your project most recently given to a station` };
  return { manager: CALIBRATION_MEASURE, reviewer: CALIBRATION_MEASURE, dit: "the starting value measured on brigade's own box, for lack of another project on your stations" };
}

// Ce que l'app dit au moment où le chef choisit cette station.
export function avertissement(station: Pick<StationVue, "nom" | "machine"> | undefined): string | undefined {
  if (station === undefined || !estUnOrdinateur(station)) return undefined;
  return `${station.nom} is a computer's app: this project's kitchen stops whenever you close the app there. A server station, always on, is recommended.`;
}

// Les champs qui empêchent de valider, chacun avec sa raison. Aucun : la saisie peut partir.
export function refusalDeSaisie(saisie: SaisieDuProject, stations: readonly StationVue[], existants: readonly string[]): Signales {
  const signales: Signales = {};
  const signaler = (champ: Champ, raison: string | undefined) => {
    if (raison !== undefined) signales[champ] = raison;
  };
  const name = nameDuProject(saisie.depot);
  signaler(
    "depot",
    saisie.depot === ""
      ? "Choose the project's GitHub repository — `<owner>/<name>`."
      : !REPOSITORY.test(saisie.depot) || saisie.depot.endsWith(".git")
        ? `“${saisie.depot.slice(0, 60)}” is not a GitHub repository: expected \`<owner>/<name>\`.`
        : !NAME.test(name)
          ? "This repository's name gives no project name: letters, digits and dashes."
          : existants.includes(name)
            ? `A project named ${name} is already on your stations: remove it first.`
            : undefined,
  );
  signaler("base", saisie.base === "" ? "The integration branch is missing: the branch the kitchen delivers to." : BRANCH.test(saisie.base) ? undefined : `“${saisie.base.slice(0, 60)}” is not a branch name.`);
  const connues = new Set(stations.map(({ id }) => id));
  const withoutKitchen = stations.filter(({ id, cuisine: kitchen }) => kitchen === false && saisie.stations.includes(id)).map(({ nom: name }) => name);
  signaler("stations", saisie.stations.length === 0 ? "Choose at least one station to serve this project." : saisie.stations.some((id) => !connues.has(id)) ? "A chosen station is no longer paired with this app." : withoutKitchen.length > 0 ? `${withoutKitchen.join(", ")} does not cook: choose a station that does.` : undefined);
  return { ...signales, ...refusalDesDecisions(saisie) };
}

// Le plafond de cooks et le calibrage : les décisions du chef — proposées, mais jamais vides.
function refusalDesDecisions(saisie: Pick<SaisieDuProject, "cooks" | "manager" | "reviewer">): Signales {
  const signales: Signales = {};
  const signaler = (champ: Champ, raison: string | undefined) => {
    if (raison !== undefined) signales[champ] = raison;
  };
  signaler("cooks", saisie.cooks === "" ? "How many cooks may a station run at once for this project?" : /^[1-9][0-9]{0,2}$/.test(saisie.cooks) ? undefined : "The number of cooks is a whole number, 1 or more.");
  for (const role of ["manager", "reviewer"] as const) {
    const { modele, effort } = saisie[role];
    signaler(`${role}-modele`, (MODELES as readonly string[]).includes(modele) ? undefined : `Choose the ${role}'s model.`);
    signaler(`${role}-effort`, (EFFORTS as readonly string[]).includes(effort) ? undefined : `Choose the ${role}'s effort.`);
  }
  return signales;
}

// Ce que la page d'un projet envoie pour confier sa cuisine : la saisie du parcours, et le nom du
// projet dans l'app — celui sous lequel ses stations le serviront.
export type SaisieDeConfiance = SaisieDuProject & { nom: string };
export function lireConfiance(recu: unknown): SaisieDeConfiance {
  return { ...lireSaisie(recu), nom: texte((recu as { nom?: unknown } | null | undefined)?.nom) };
}

// Ce que les stations font déjà d'un projet : celles qui le portent — que l'app le leur ait demandé,
// ou qu'elles le servent sans elle —, si une station en porte déjà le suivi, et ce que l'app en a demandé.
export type DejaTenu = { portee: string[]; suivi: boolean; demande?: ProjectRequest };

// Les champs qui empêchent de confier le projet à ces stations, chacun avec sa raison. Une station
// qui le porte déjà ne se choisit pas une seconde fois ; un projet dont le suivi est porté n'en change pas ; une station de plus reprend le calibrage déjà demandé, et n'a que ses cooks à dire.
export function refusalDeConfiance(saisie: SaisieDeConfiance, stations: readonly StationVue[], tenu: DejaTenu): Signales {
  const signales: Signales = {};
  const signaler = (champ: Champ, raison: string | undefined) => {
    if (raison !== undefined) signales[champ] = raison;
  };
  signaler("nom", NAME.test(saisie.nom) ? undefined : `“${saisie.nom.slice(0, 60)}” cannot be a project's name on a station: lowercase letters, digits and dashes.`);
  signaler(
    "depot",
    saisie.depot === "" ? "Choose the project's GitHub repository — `<owner>/<name>`." : !REPOSITORY.test(saisie.depot) || saisie.depot.endsWith(".git") ? `“${saisie.depot.slice(0, 60)}” is not a GitHub repository: expected \`<owner>/<name>\`.` : undefined,
  );
  signaler("base", saisie.base === "" ? "The integration branch is missing: the branch the kitchen delivers to." : BRANCH.test(saisie.base) ? undefined : `“${saisie.base.slice(0, 60)}” is not a branch name.`);
  const connues = new Map(stations.map((station) => [station.id, station.nom]));
  const withoutKitchen = stations.filter(({ id, cuisine: kitchen }) => kitchen === false && saisie.stations.includes(id)).map(({ nom: name }) => name);
  const deja = saisie.stations.filter((id) => tenu.portee.includes(id)).map((id) => connues.get(id) ?? id);
  signaler(
    "stations",
    saisie.stations.length === 0
      ? `Choose at least one station to cook ${saisie.nom || "this project"}.`
      : saisie.stations.some((id) => !connues.has(id))
        ? "A chosen station is no longer paired with this app."
        : withoutKitchen.length > 0
          ? `${withoutKitchen.join(", ")} does not cook: choose a station that does.`
          : deja.length > 0
          ? `${deja.join(", ")} already cook${deja.length > 1 ? "" : "s"} it: choose another station.`
          : undefined,
  );
  if (tenu.demande === undefined) return { ...signales, ...refusalDesDecisions(saisie) };
  if (saisie.cooks !== "" && !/^[1-9][0-9]{0,2}$/.test(saisie.cooks)) signales.cooks = "The number of cooks is a whole number, 1 or more.";
  return signales;
}

// Ce que la demande d'un projet porte pour une station : ce que son appairage dit qu'elle fournit (#1757,
// stations/document.ts), en plus de ce que le chef a coché — c'est par là que le suivi du projet l'apprend.
export function avecCeQuElleFournit(station: Pick<StationVue, "fournit">, project: ProjectRequest): ProjectRequest {
  const fournit = capacitiesLues([...(project.fournit ?? []), ...(station.fournit ?? [])]);
  return fournit.length === 0 || fournit.join("+") === (project.fournit ?? []).join("+") ? project : { ...project, fournit };
}

// Ce qu'une station dit d'un projet, avec elle.
type Dit = { station: StationVue; suivi: SuiviDuProject };
const ORDRE_DES_STEPS: readonly Bascule["etape"][] = ["demandee", "acceptee", "remise", "refusee"];

// Où cuit un projet, d'après ce que ses stations en disent : celle qui le sert ; entre deux — celle
// qu'il quitte a fermé sa cuisine, l'autre ne l'a pas encore ouverte —, celle qu'elles nomment.
export function cuitSurDe(dits: readonly Dit[], locale: string | null): CuitSur | null {
  const served = dits.find(({ suivi }) => suivi.etat === "servi");
  if (served !== undefined) return { id: served.station.id, nom: served.station.nom, ici: served.suivi.ici || served.station.id === locale };
  const nomme = dits.find(({ suivi }) => suivi.cuitSur !== null)?.suivi.cuitSur;
  if (nomme === undefined || nomme === null) return null;
  const station = dits.find(({ station: candidate }) => candidate.nom === nomme)?.station;
  return { id: station?.id ?? null, nom: nomme, ici: station !== undefined && station.id === locale };
}

// Le rail d'un projet que le fichier des projets ne dit pas cuit sur cet ordinateur se lit du tableau de sa
// cuisine : il se lit dès qu'une station le sert, ailleurs que sur cet ordinateur. Faux, quand aucune station ne
// le sert, ou que c'est celle de cet ordinateur.
export function servedAilleurs(vu: Pick<VuDesProjects, "projets"> | undefined, name: string): boolean {
  const cuit = vu?.projets.find((project) => project.nom === name)?.cuitSur;
  return cuit !== undefined && cuit !== null && !cuit.ici;
}

// La machine d'une station, par son nom — `<machine>/<moteur>` : la machine —, telle que le réseau du chef la nomme.
// Rien, quand ce n'est pas un nom de machine.
export function machineDuName(name: string): string | undefined {
  const machine = name.includes("/") ? name.slice(0, name.indexOf("/")) : name;
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
  const rang = (step: Bascule["etape"]) => ORDRE_DES_STEPS.indexOf(step);
  const retenue = siennes.reduce((plus, une) => (rang(une.bascule.etape) > rang(plus.bascule.etape) ? une : plus));
  const { de, vers, demandeLe: requestLe, etape: step } = retenue.bascule;
  const visee = siennes.find(({ station }) => station.nom === vers);
  const dit = step === "refusee" ? (visee?.suivi.etat === "refuse" ? visee.suivi.dit : retenue.suivi.dit) : (visee ?? retenue).suivi.dit;
  return { de, vers, demandeLe: requestLe, etape: step, dit };
}

// Une durée, telle que la home la dit.
function duree(ms: number): string {
  const secondes = Math.max(0, Math.round(ms / 1000));
  return secondes < 60 ? `${secondes} s` : `${Math.floor(secondes / 60)} min ${String(secondes % 60).padStart(2, "0")} s`;
}

// Les projets se relisent quand les stations se relisent (stations/stations.ts) : c'est à
// chaque lecture des stations que l'app demande `relire`.
export type OptionsProjects = {
  github: GitHubDesStations;
  // Les stations appairées, telles que la dernière lecture les donne.
  stations: () => readonly StationVue[] | undefined;
  depots: () => Promise<RepositoryDuChef[]>;
  surLecture: (vu: VuDesProjects) => void;
  maintenant?: () => number;
  // Le gist de la station de cet ordinateur, nul quand l'app n'en a pas.
  locale?: () => string | null;
  // L'opération du runtime qui déménage une cuisine (demenagement.ts). Absente, l'app n'a pas de
  // runtime à côté d'elle : rien ne se déménage d'ici.
  demenager?: Demenageur;
  // Note la décision du chef de cuire sans bac à sable pour `station`, dans l'état de `projet` sur cet
  // ordinateur (runtime/src/onboarding/attente.ts, `accepterSansBacASable`). Absente, l'app n'a pas de runtime à côté d'elle.
  accepterSansBac?: (project: string, station: string) => Promise<void>;
  // L'opération du runtime qui demande un remède à une station par son gist (remede.ts). Absente, l'app
  // n'a pas de runtime à côté d'elle : aucun refus ne se lève d'ici.
  demanderLeRemede?: DemanderLeRemede;
  // Ce que le clone du projet sur cet ordinateur dit de lui (runtime/src/projets/ajout-de-station.ts,
  // `projetDuClone`) — nul sans clone ici. Une station de plus en prend le dépôt et la branche que la
  // première ne dit pas : le chef ne les retape pas (#1307).
  leClone?: (name: string) => Promise<DitDuClone | null>;
};
export type DecisionSansBac = { fait: string } | { refus: string; detail?: string };
export type Choisi = { fait: string } | { refus: string; detail?: string };

export type Projects = {
  vu(): VuDesProjects | undefined;
  relire(): Promise<VuDesProjects>;
  depots(): Promise<{ depots: RepositoryDuChef[] } | { refus: string }>;
  ajouter(recu: unknown): Promise<Addition>;
  // Confie la cuisine d'un projet de l'app à une première station, ou à une de plus.
  confier(recu: unknown): Promise<Addition>;
  retirer(name: unknown): Promise<Retrait>;
  // Déménage la cuisine d'un projet vers une station appairée — son gist.
  demenager(name: unknown, vers: unknown): Promise<Demenagement>;
  // Le chef continue sans bac à sable sur la station du projet : sa décision est notée, la retenue du rail se lève.
  continuerSansBac(name: unknown): Promise<DecisionSansBac>;
  // Lève le refus que le suivi du projet publie, par le remède qu'il offre (#1205) : la station le
  // joue, puis dit si le refus tient. Les projets sont relus avant que la réponse ne parte.
  remedier(name: unknown, refusal: unknown, remede: unknown): Promise<IssueDuRemede>;
  // Retient une issue d'un choix que le suivi du projet attend (#1400) : elle s'écrit dans la demande de la
  // station qui le porte, qui la pose à son journal à sa lecture suivante (runtime/src/installation/besoins/).
  choisir(name: unknown, choice: unknown, issue: unknown): Promise<Choisi>;
  // Les pages GitHub où autoriser brigade, telles que les stations les ont publiées.
  pages(): string[];
};

export function holdProjects(options: OptionsProjects): Projects {
  const { github } = options;
  const maintenant = options.maintenant ?? Date.now;
  const locale = options.locale ?? (() => null);
  // Le clone illisible se tait : la première station, ou le chef, dit le reste.
  const lireLeClone = async (name: string): Promise<DitDuClone | null> => {
    try {
      return (await options.leClone?.(name)) ?? null;
    } catch {
      return null;
    }
  };
  let vu: VuDesProjects | undefined;
  let enCours: Promise<VuDesProjects> | undefined;
  // Les écritures se suivent : deux gestes du chef ne réécrivent pas la même demande en même temps.
  let ecritures: Promise<unknown> = Promise.resolve();
  const enFile = <T>(action: () => Promise<T>): Promise<T> => {
    const suite = ecritures.then(action, action);
    ecritures = suite.catch(() => undefined);
    return suite;
  };
  const appairees = () => options.stations() ?? [];

  // La demande et le suivi de chaque station appairée.
  const lireTout = async () =>
    Promise.all(
      appairees().map(async (station) => {
        const fichiers = await github.lire(station.id);
        return { station, demande: lireRequest(fichiers?.[FICHIER_PROJECTS]), suivi: lireSuivi(fichiers?.[FICHIER_SUIVI]), onboarding: lireOnboarding(fichiers?.[FICHIER_SUIVI]) };
      }),
    );

  const choice = () => {
    const stations = appairees();
    return {
      recommandee: stationRecommandee(stations) ?? null,
      avertissements: Object.fromEntries(stations.flatMap((station) => {
        const dit = avertissement(station);
        return dit === undefined ? [] : [[station.id, dit]];
      })),
      machines: Object.fromEntries(stations.filter(({ etat: state }) => state !== "illisible").map((station) => [station.id, machineProposee(station)])),
    };
  };

  const lire = async (): Promise<VuDesProjects> => {
    const instant = maintenant();
    try {
      const lus = await lireTout();
      const ici = locale();
      const projects = new Map<string, ProjectVu>();
      const dits = new Map<string, Dit[]>();
      for (const { station, suivi } of lus) for (const un of suivi) dits.set(un.nom, [...(dits.get(un.nom) ?? []), { station, suivi: un }]);
      for (const { station, demande: request, suivi, onboarding } of lus) {
        for (const project of request ?? []) {
          const siens = dits.get(project.nom) ?? [];
          const vu: ProjectVu = projects.get(project.nom) ?? { nom: project.nom, depot: project.depot, base: project.base, stations: [], servi: null, cuitSur: cuitSurDe(siens, ici), demenagement: demenagementDe(siens) };
          // L'onboarding, seule la station qui porte le suivi le publie.
          const door = doorLeSuivi(project);
          const sien = door ? onboarding[project.nom] : undefined;
          if (sien !== undefined) vu.onboarding = sien;
          const dit = suivi.find(({ nom: name }) => name === project.nom);
          // Ce qui retient la cuisine, seule cette station le dit ; relu à chaque lecture, il s'efface quand elle ne le dit plus.
          if (door) {
            vu.suiviPar ??= { id: station.id, nom: station.nom };
            vu.acces = dit?.acces ?? null;
            vu.refus = dit?.refus ?? null;
            vu.worktree = dit?.worktree ?? null;
            if (dit?.clone !== undefined) vu.clone = dit.clone;
            else delete vu.clone;
            if (dit?.blocages !== undefined) vu.blocages = dit.blocages;
            else delete vu.blocages;
            if (dit?.delai !== undefined) vu.delai = dit.delai;
            else delete vu.delai;
            if (dit?.choix !== undefined) vu.choix = dit.choix;
            else delete vu.choix;
            if (project.choix !== undefined) vu.choisis = project.choix;
            else delete vu.choisis;
          }
          // Les temps, toute station qui sert le projet les publie : l'app fusionne leurs enregistrements.
          if (dit?.temps !== undefined) vu.temps = fusionnerLesTime(vu.temps, dit.temps);
          vu.stations.push({ id: station.id, nom: station.nom, etat: dit?.etat ?? "attendu", dit: dit?.dit ?? `${station.nom} has not read it yet: it reads what the app asks every 30 s`, autoriser: dit?.autoriser ?? [] });
          if (door && dit?.etat === "servi" && dit.serviLe !== null) {
            const depuis = project.ouvertLe ?? project.demandeLe;
            vu.servi = depuis === null ? null : `served by ${station.nom} ${duree(Date.parse(dit.serviLe) - Date.parse(depuis))} after “add a project” was opened`;
          }
          projects.set(project.nom, vu);
        }
      }
      for (const project of projects.values()) project.stations.sort((a, b) => a.nom.localeCompare(b.nom));
      for (const project of projects.values()) if (project.temps !== undefined) project.delaiDePrise = delayDuProject(project.temps, new Date(instant));
      const calibration = calibrationRecommande(lus.flatMap(({ demande: request }) => request ?? []));
      vu = { a: new Date(instant).toISOString(), projets: [...projects.values()].sort((a, b) => a.nom.localeCompare(b.nom)), locale: ici, ...choice(), calibrage: calibration };
      // Une station ajoutée avant que son appairage ne dise ce qu'elle fournit : sa demande le reprend.
      if (lus.some(({ station, demande: request }) => (request ?? []).some((project) => avecCeQuElleFournit(station, project) !== project))) porterCeQuEllesFournissent();
    } catch (error) {
      vu = { a: new Date(instant).toISOString(), projets: vu?.projets ?? [], locale: locale(), ...choice(), calibrage: vu?.calibrage ?? calibrationRecommande([]), sans: `the projects on your stations could not be read on GitHub — ${message(error)}` };
    }
    options.surLecture(vu);
    return vu;
  };

  const relire = () => {
    enCours ??= lire().finally(() => (enCours = undefined));
    return enCours;
  };

  // Porte dans la demande de chaque station ce que son appairage dit qu'elle fournit, à la suite des gestes du
  // chef. GitHub en panne : la lecture suivante réessaie.
  let door: Promise<unknown> | undefined;
  const porterCeQuEllesFournissent = () => {
    door ??= enFile(() => reecrire((station, avant) => avant.map((project) => avecCeQuElleFournit(station, project))))
      .catch(() => undefined)
      .finally(() => (door = undefined));
  };

  // Réécrit la demande de chaque station : `changer` rend ses projets, à partir de ceux d'avant.
  const reecrire = async (changer: (station: StationVue, avant: ProjectRequest[]) => ProjectRequest[]) => {
    const lus = await lireTout();
    const illisible = lus.find(({ demande: request }) => request === null);
    if (illisible !== undefined) throw new Error(`what this app wrote on ${illisible.station.nom}'s gist (${FICHIER_PROJECTS}) is unreadable: nothing was changed`);
    const ecrits: string[] = [];
    for (const { station, demande: request } of lus) {
      const avant = request ?? [];
      const apres = changer(station, avant);
      if (JSON.stringify(apres) === JSON.stringify(avant)) continue;
      await github.ecrire(station.id, { [FICHIER_PROJECTS]: documentDeRequest(apres) });
      ecrits.push(station.nom);
    }
    return ecrits;
  };

  const ajouter = (recu: unknown): Promise<Addition> =>
    enFile(async () => {
      const saisie = lireSaisie(recu);
      const stations = appairees();
      const existants = (await relire()).projets.map(({ nom: name }) => name);
      const signales = refusalDeSaisie(saisie, stations, existants);
      if (Object.keys(signales).length > 0) return { signales };
      const name = nameDuProject(saisie.depot);
      const instant = new Date(maintenant()).toISOString();
      const porteur = porteurDuSuivi(saisie.stations, stationRecommandee(stations));
      const project = (suivi: boolean): ProjectRequest => avecLeSuivi({
        nom: name,
        depot: saisie.depot,
        base: saisie.base,
        cooks: Number(saisie.cooks),
        manager: saisie.manager,
        reviewer: saisie.reviewer,
        ouvertLe: Number.isNaN(Date.parse(saisie.ouvertLe)) ? null : new Date(saisie.ouvertLe).toISOString(),
        demandeLe: instant,
      }, suivi);
      try {
        await reecrire((station, avant) => (saisie.stations.includes(station.id) ? [...avant.filter((p) => p.nom !== name), avecCeQuElleFournit(station, project(station.id === porteur))] : avant));
      } catch (error) {
        await relire();
        return { refus: `${name} was not added: GitHub could not be read or written — ${message(error)}` };
      }
      await relire();
      return { ajoute: name };
    });

  // La page d'un projet le confie à des stations : à une première — il prend alors son suivi,
  // son plafond et son calibrage —, ou à une de plus, qui reprend ce que l'app en a déjà demandé.
  const confier = (recu: unknown): Promise<Addition> =>
    enFile(async () => {
      const saisie = lireConfiance(recu);
      const stations = appairees();
      let lus: Awaited<ReturnType<typeof lireTout>>;
      try {
        lus = await lireTout();
      } catch (error) {
        return { refus: `${saisie.nom} was not entrusted to a station: GitHub could not be read — ${message(error)}` };
      }
      const demandes = lus.flatMap(({ station, demande: request }) => (request ?? []).filter(({ nom: name }) => name === saisie.nom).map((project) => ({ station, projet: project })));
      const served = stations.filter((station) => station.projets.includes(saisie.nom));
      const tenu: DejaTenu = {
        portee: [...new Set([...demandes.map(({ station }) => station.id), ...served.map(({ id }) => id)])],
        suivi: served.length > 0 || demandes.some(({ projet: project }) => doorLeSuivi(project)),
        ...(demandes[0] === undefined ? {} : { demande: demandes.find(({ projet: project }) => doorLeSuivi(project))?.projet ?? demandes[0].projet }),
      };
      // Une station de plus sert ce que la première sert déjà : son dépôt, sa branche et son plafond, tels
      // qu'elle les publie, puis tels que l'app les lui a demandés ; le chef ne les redit pas.
      const dits = lus.flatMap(({ station, suivi }) => suivi.filter(({ nom: name }) => name === saisie.nom).map((un) => ({ station, un }))).sort((a, b) => Number(b.un.etat === "servi") - Number(a.un.etat === "servi"));
      const first = <C extends "depot" | "base" | "cooks">(champ: C): SuiviDuProject[C] | undefined => dits.find(({ un }) => un[champ] !== null)?.un[champ];
      const repris = tenu.demande;
      // Ce que ni la première ni la demande ne disent, le clone du projet sur cet ordinateur le dit (#1307). Les
      // cooks sont ceux de la machine ajoutée, tels que le chef les envoie : ceux de la première, à défaut.
      const [repositoryConnu, baseConnue] = [first("depot") ?? repris?.depot, first("base") ?? repris?.base];
      const clone = tenu.suivi && (repositoryConnu === undefined || baseConnue === undefined) ? await lireLeClone(saisie.nom) : null;
      const resumption = tenu.suivi
        ? {
            depot: repositoryConnu ?? clone?.depot ?? saisie.depot,
            base: baseConnue ?? clone?.base ?? saisie.base,
            cooks: saisie.cooks !== "" ? Number(saisie.cooks) : (first("cooks") ?? repris?.cooks),
          }
        : { depot: saisie.depot, base: saisie.base, cooks: Number(saisie.cooks) };
      const effective: SaisieDeConfiance = { ...saisie, depot: resumption.depot, base: resumption.base, cooks: resumption.cooks === undefined ? "" : String(resumption.cooks) };
      const signales = refusalDeConfiance(effective, stations, tenu);
      const stationDuRepository = (dits[0]?.station ?? stations.find(({ id }) => tenu.portee.includes(id)))?.nom ?? "the station that cooks it";
      const manque: Manquant[] = tenu.suivi ? (["depot", "base", "cooks"] as const).filter((champ) => effective[champ] === "") : [];
      for (const champ of manque) {
        signales[champ] =
          champ === "cooks"
            ? `${stationDuRepository} does not say how many cooks it may run at once for ${saisie.nom}: give the cook cap.`
            : `${stationDuRepository} does not say ${champ === "depot" ? "which GitHub repository it serves" : "which integration branch it delivers to"} for ${saisie.nom}, and neither does its folder on this computer.`;
      }
      if (Object.keys(signales).length > 0) return manque.length > 0 ? { signales, manque } : { signales };
      const instant = new Date(maintenant()).toISOString();
      const porteur = porteurDuSuivi(saisie.stations, stationRecommandee(stations));
      const project = (suivi: boolean): ProjectRequest => avecLeSuivi({
        nom: saisie.nom,
        depot: effective.depot,
        base: effective.base,
        cooks: Number(effective.cooks),
        manager: repris?.manager ?? saisie.manager,
        reviewer: repris?.reviewer ?? saisie.reviewer,
        ouvertLe: Number.isNaN(Date.parse(saisie.ouvertLe)) ? null : new Date(saisie.ouvertLe).toISOString(),
        demandeLe: instant,
        ...(saisie.capacites.length === 0 ? {} : { fournit: saisie.capacites }),
      }, suivi);
      try {
        await reecrire((station, avant) => (saisie.stations.includes(station.id) ? [...avant.filter((p) => p.nom !== saisie.nom), avecCeQuElleFournit(station, project(!tenu.suivi && station.id === porteur))] : avant));
      } catch (error) {
        await relire();
        return { refus: `${saisie.nom} was not entrusted to a station: GitHub could not be read or written — ${message(error)}` };
      }
      await relire();
      return { ajoute: saisie.nom };
    });

  const retirer = (recu: unknown): Promise<Retrait> =>
    enFile(async () => {
      const name = texte(recu);
      if (name === "") return { refus: "which project? none was named" };
      try {
        const ecrits = await reecrire((_, avant) => avant.filter((project) => project.nom !== name));
        if (ecrits.length === 0) return { refus: `${name} is on none of your stations` };
      } catch (error) {
        return { refus: `${name} was not removed: GitHub could not be read or written — ${message(error)}` };
      }
      await relire();
      return { retire: name };
    });

  // Déménager : vers une station appairée, et par l'opération du runtime seule — elle lit et écrit
  // les demandes elle-même ; l'app relit ensuite ce qu'elle a écrit. À la suite des autres écritures.
  const demenager = (recuName: unknown, recuVers: unknown): Promise<Demenagement> =>
    enFile(async () => {
      const name = texte(recuName);
      const vers = texte(recuVers);
      if (name === "") return { refus: "which project? none was named" };
      const stations = appairees();
      const visee = stations.find(({ id }) => id === vers);
      if (visee === undefined) return { refus: "that station is no longer paired with this app: nothing was changed" };
      if (visee.cuisine === false) return { refus: `${visee.nom} does not cook: nothing was changed` };
      if (options.demenager === undefined) return { refus: "this app has no runtime beside it to move a kitchen: nothing was changed" };
      // La station qu'il quitte : celle où la page le dit cuire, si elle est appairée.
      const de = vu?.projets.find((project) => project.nom === name)?.cuitSur?.id ?? null;
      const gists = stations.map(({ id }) => id);
      const rendu = await options.demenager(name, visee.id, gists, de !== null && gists.includes(de) ? de : undefined);
      await relire();
      return rendu;
    });

  // Lever un refus : la demande part vers la station qui porte le suivi du projet, par son gist — l'ordinateur du chef ou une
  // station distante, de la même façon. Deux demandes vers le même gist se suivent : chacune y réécrit le
  // fichier des remèdes. Le refus doit être celui que la page montre, et offrir ce remède : sinon rien ne part.
  const remedesEnCours = new Map<string, Promise<IssueDuRemede>>();
  const remedier = async (recuName: unknown, recuRefusal: unknown, recuRemede: unknown): Promise<IssueDuRemede> => {
    const name = texte(recuName);
    const code = texte(recuRefusal);
    const remede = texte(recuRemede);
    if (name === "") return { outcome: "error", error: "which project? none was named: nothing was done" };
    const project = vu?.projets.find((un) => un.nom === name);
    const porteuse = project?.suiviPar;
    if (project === undefined || porteuse === undefined) return { outcome: "error", error: `${name} cooks on none of your stations: nothing was done` };
    const refusal = project.refus ?? null;
    if (refusal === null) return { outcome: "error", error: `${porteuse.nom} no longer refuses ${name}: nothing was done` };
    if (refusal.code !== code || refusal.remedy?.id !== remede) return { outcome: "error", error: `${porteuse.nom} no longer offers this action for ${name}: nothing was done` };
    const demander = options.demanderLeRemede;
    if (demander === undefined) return { outcome: "error", error: "this app has no runtime beside it to ask for this action: nothing was done" };
    const jouer = async (): Promise<IssueDuRemede> => {
      try {
        return pourLaPage(await demander({ canal: canalDesGists(github), gist: porteuse.id, demande: { project: name, refusal: code, remedy: remede } }));
      } catch (error) {
        return { outcome: "error", error: `GitHub could not be read or written, so nothing is known to have been done — ${message(error)}` };
      }
    };
    const chaine = (remedesEnCours.get(porteuse.id) ?? Promise.resolve()).then(jouer);
    remedesEnCours.set(porteuse.id, chaine);
    const issue = await chaine;
    if (remedesEnCours.get(porteuse.id) === chaine) remedesEnCours.delete(porteuse.id);
    // La station a réécrit son suivi avant de répondre : relu, le refus levé n'y est plus.
    await relire();
    return issue;
  };

  // Continuer sans bac à sable : la décision s'écrit dans l'état du projet, sur la station de cet
  // ordinateur — la seule que l'app atteigne ; une autre station dit qui peut la prendre.
  const continuerSansBac = async (recuName: unknown): Promise<DecisionSansBac> => {
    const name = texte(recuName);
    if (name === "") return { refus: "which project? none was named" };
    const porteuse = vu?.projets.find((project) => project.nom === name)?.suiviPar;
    if (porteuse === undefined) return { refus: `${name} cooks on none of your stations: nothing was changed` };
    if (options.accepterSansBac === undefined || locale() === null) return { refus: "this app has no runtime beside it to record this choice: nothing was changed" };
    if (porteuse.id !== locale()) return { refus: `${porteuse.nom} cooks ${name}, not this computer: the choice can only be recorded from ${porteuse.nom}'s own computer — or choose another station: nothing was changed` };
    try {
      await options.accepterSansBac(name, porteuse.nom);
    } catch (error) {
      return { refus: "the choice could not be recorded: nothing was changed", detail: message(error) };
    }
    return { fait: `continuing without a sandbox on ${porteuse.nom}: ${name} starts on its next turn` };
  };

  // Choisir une issue : le choix doit être celui que la page montre, en attente, et offrir cette issue — sinon rien
  // ne s'écrit. Seule la demande de la station qui porte le suivi change : c'est elle qui tient le choix. À la suite des autres écritures.
  const choisir = (recuName: unknown, recuChoice: unknown, recuIssue: unknown): Promise<Choisi> =>
    enFile(async () => {
      const name = texte(recuName);
      const id = texte(recuChoice);
      const issue = texte(recuIssue);
      if (name === "") return { refus: "which project? none was named: nothing was recorded" };
      const project = vu?.projets.find((un) => un.nom === name);
      const porteuse = project?.suiviPar;
      if (project === undefined || porteuse === undefined) return { refus: `${name} cooks on none of your stations: nothing was recorded` };
      const choice = project.choix?.find((un) => un.id === id);
      if (choice === undefined || choice.status !== "pending") return { refus: `${porteuse.nom} no longer waits for this choice: nothing was recorded` };
      const retenue = choice.options.find((option) => option.id === issue);
      if (retenue === undefined) return { refus: `${porteuse.nom} no longer offers this option: nothing was recorded` };
      try {
        const ecrits = await reecrire((station, avant) => (station.id === porteuse.id ? avant.map((un) => (un.nom === name && doorLeSuivi(un) ? { ...un, choix: { ...un.choix, [id]: issue } } : un)) : avant));
        if (ecrits.length === 0) return { refus: `${name} is no longer asked of ${porteuse.nom}: nothing was recorded` };
      } catch (error) {
        return { refus: "the choice could not be recorded: GitHub could not be read or written", detail: message(error) };
      }
      await relire();
      return { fait: `“${retenue.label}” is recorded: ${porteuse.nom} applies it at its next read` };
    });

  return {
    vu: () => vu,
    relire,
    demenager,
    continuerSansBac,
    remedier,
    choisir,
    async depots() {
      try {
        return { depots: await options.depots() };
      } catch (error) {
        return { refus: `your repositories could not be read on GitHub — ${message(error)}` };
      }
    },
    ajouter,
    confier,
    retirer,
    // Et celles que son onboarding montre : le geste attendu, le ticket de préparation, sa PR ; et celles
    // du geste d'un clone en échec (#1390) ; et celles où lever un blocage hors de l'app (#1399).
    pages: () =>
      [...new Set((vu?.projets ?? []).flatMap(({ stations, onboarding, clone, blocages: blockages }) => [
        ...stations.flatMap(({ autoriser }) => autoriser),
        ...(clone?.liens ?? []),
        ...(blockages ?? []).flatMap(({ link }) => (link === undefined ? [] : [link])),
        ...(onboarding?.etapes ?? []).flatMap(({ geste: action }) => action?.liens ?? []),
        ...(onboarding?.preparation === null || onboarding?.preparation === undefined ? [] : [onboarding.preparation.url, ...(onboarding.preparation.pr === null ? [] : [onboarding.preparation.pr])]),
      ]))],
  };
}
