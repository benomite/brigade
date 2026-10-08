// La sauvegarde de l'état d'un projet, et sa restauration.
//
// Du répertoire d'état, seul le journal est la vérité : il part en instantané
// daté. Les flux bruts des cooks (`runs/`) servent au diagnostic : ils sont
// gardés en un seul exemplaire, à côté des instantanés. Le reste ne se
// sauvegarde pas — `lock.db` ne contient rien (le verrou est tenu par le
// noyau, pas écrit), le clone de la station se reclone, et ce qui compte d'un
// worktree a été poussé à la récolte.
//
//   <destination>/<horodatage>/log.db          l'instantané du journal
//   <destination>/<horodatage>/manifeste.json  ce qu'il porte
//   <destination>/runs/                        les flux bruts, jamais retirés
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { Base } from "./base.ts";
import { cheminJournal, ouvrirJournal } from "./journal.ts";

const AUTEUR = "sauvegarde";
const MANIFESTE = "manifeste.json";
const FLUX = "runs";
// Une sauvegarde se construit sous ce nom, et ne prend le sien qu'achevée.
const EN_COURS = ".en-cours-";
// Le nom d'une sauvegarde achevée : son heure UTC, à la seconde.
const DATEE = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z$/;
// Passé ce délai, une sauvegarde encore en cours est tenue pour morte.
const ABANDON_MS = 3_600_000;
// L'instantané est une lecture : il n'attend l'écrivain que le temps d'un
// point de contrôle du journal.
const ATTENTE_MS = 5000;

// Ce que la sauvegarde ou la restauration refuse de faire, quoi qu'on
// réessaie : la commande en sort avec le code d'un refus.
export class SauvegardeRefusee extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SauvegardeRefusee";
  }
}

type Manifeste = { project: string; at: string; lastSeq: number; events: number; streams: number; node: string };

export type OptionsSauvegarde = {
  repertoireEtat: string;
  destination: string;
  // Le nombre de sauvegardes datées à garder, la nouvelle comprise.
  garder: number;
  maintenant?: () => Date;
};

export type Bilan = {
  nom: string;
  chemin: string;
  projet: string;
  evenements: number;
  dernierSeq: number;
  // Les flux bruts de la source, et ceux qu'il a fallu recopier.
  flux: { copies: number; total: number };
  // Les sauvegardes retirées par la rotation.
  retirees: string[];
};

// Écrit dans `cible` un instantané cohérent du journal, pendant que le runtime
// y écrit ou non.
export function prendreInstantane(repertoireEtat: string, cible: string): void {
  const base = new Base(cheminJournal(repertoireEtat), { lectureSeule: true, attenteMs: ATTENTE_MS });
  try {
    base.instantane(cible);
  } finally {
    base.fermer();
  }
}

// Ce qu'un instantané porte — après avoir vérifié qu'il se lit en entier.
function controler(chemin: string): { projet: string | null; evenements: number; dernierSeq: number } {
  const base = new Base(chemin, { lectureSeule: true });
  try {
    const verdict = base.lire<{ integrity_check: string }>("PRAGMA integrity_check")[0]?.integrity_check;
    if (verdict !== "ok") throw new Error(`instantané illisible (${chemin}) : ${verdict}`);
    const compte = base.lire<{ evenements: number; dernier: number | null }>("SELECT count(*) AS evenements, max(seq) AS dernier FROM events")[0];
    const projet = base.lire<{ project: string }>("SELECT project FROM events ORDER BY seq DESC LIMIT 1")[0]?.project ?? null;
    return { projet, evenements: compte?.evenements ?? 0, dernierSeq: compte?.dernier ?? 0 };
  } finally {
    base.fermer();
  }
}

function lireManifeste(sauvegarde: string): Manifeste {
  return JSON.parse(readFileSync(join(sauvegarde, MANIFESTE), "utf8")) as Manifeste;
}

// Les sauvegardes achevées d'une destination, de la plus ancienne à la plus récente.
function datees(destination: string): string[] {
  return readdirSync(destination)
    .filter((nom) => DATEE.test(nom) && existsSync(join(destination, nom, MANIFESTE)))
    .sort();
}

function estDans(chemin: string, parent: string): boolean {
  const depuis = relative(parent, chemin);
  return depuis === "" || (!depuis.startsWith("..") && !isAbsolute(depuis));
}

// Recopie les flux neufs ou qui ont changé depuis leur dernière copie. Un flux
// ne se réécrit jamais plus court : sa taille, ou une date plus récente que sa
// copie, dit qu'il a bougé. Rien n'est retiré de la destination.
function copierFlux(source: string, destination: string): { copies: number; total: number } {
  if (!existsSync(source)) return { copies: 0, total: 0 };
  mkdirSync(destination, { recursive: true });
  let [copies, total] = [0, 0];
  for (const entree of readdirSync(source, { withFileTypes: true })) {
    if (!entree.isFile()) continue;
    total += 1;
    const [de, vers] = [join(source, entree.name), join(destination, entree.name)];
    const origine = statSync(de);
    const copie = statSync(vers, { throwIfNoEntry: false });
    if (copie && copie.size === origine.size && copie.mtimeMs >= origine.mtimeMs) continue;
    // Jamais un flux à moitié copié sous son nom.
    const partiel = join(destination, `.${entree.name}.partiel`);
    copyFileSync(de, partiel);
    renameSync(partiel, vers);
    copies += 1;
  }
  return { copies, total };
}

// Sauvegarde l'état du projet, et rend ce qu'elle a fait — ou null s'il n'y a
// encore aucun journal à sauvegarder.
export function sauvegarder(options: OptionsSauvegarde): Bilan | null {
  const repertoireEtat = resolve(options.repertoireEtat);
  const destination = resolve(options.destination);
  const maintenant = options.maintenant ?? (() => new Date());
  if (estDans(destination, repertoireEtat)) {
    throw new SauvegardeRefusee(`la destination (${destination}) est dans le répertoire d'état (${repertoireEtat}) : elle partirait avec lui`);
  }
  if (!existsSync(cheminJournal(repertoireEtat))) return null;

  mkdirSync(destination, { recursive: true });
  for (const nom of readdirSync(destination)) {
    const reste = join(destination, nom);
    if (nom.startsWith(EN_COURS) && Date.now() - statSync(reste).mtimeMs > ABANDON_MS) rmSync(reste, { recursive: true, force: true });
  }

  const prise = maintenant();
  const nom = `${prise.toISOString().slice(0, 19).replaceAll(":", "-")}Z`;
  const chemin = join(destination, nom);
  if (existsSync(chemin)) throw new Error(`la sauvegarde ${nom} existe déjà dans ${destination}`);
  const enCours = join(destination, `${EN_COURS}${nom}`);
  mkdirSync(enCours);
  let bilan: Bilan;
  try {
    prendreInstantane(repertoireEtat, join(enCours, "log.db"));
    const { projet, evenements, dernierSeq } = controler(join(enCours, "log.db"));
    if (projet === null) {
      rmSync(enCours, { recursive: true, force: true });
      return null;
    }
    const precedente = datees(destination).at(-1);
    const voisin = precedente === undefined ? projet : lireManifeste(join(destination, precedente)).project;
    if (voisin !== projet) {
      throw new SauvegardeRefusee(`${destination} porte déjà les sauvegardes du projet « ${voisin} » : une destination par projet`);
    }
    const flux = copierFlux(join(repertoireEtat, FLUX), join(destination, FLUX));
    const manifeste: Manifeste = { project: projet, at: prise.toISOString(), lastSeq: dernierSeq, events: evenements, streams: flux.total, node: process.version };
    writeFileSync(join(enCours, MANIFESTE), `${JSON.stringify(manifeste, null, 2)}\n`);
    renameSync(enCours, chemin);
    bilan = { nom, chemin, projet, evenements, dernierSeq, flux, retirees: [] };
  } catch (erreur) {
    rmSync(enCours, { recursive: true, force: true });
    throw erreur;
  }

  // La réussite s'écrit au journal du projet, comme une commande du chef :
  // depuis ce process, le runtime la voit dans la seconde.
  const journal = ouvrirJournal(repertoireEtat, { maintenant });
  try {
    journal.ajouter({
      project: bilan.projet,
      ticket: null,
      author: AUTEUR,
      type: "backup.completed",
      payload: { name: nom, lastSeq: bilan.dernierSeq, events: bilan.evenements, streams: bilan.flux.total },
    });
  } finally {
    journal.fermer();
  }

  // La rotation vient en dernier : rien n'est retiré tant que la nouvelle
  // sauvegarde n'est pas faite.
  for (const ancienne of datees(destination).slice(0, -options.garder)) {
    rmSync(join(destination, ancienne), { recursive: true, force: true });
    bilan.retirees.push(ancienne);
  }
  return bilan;
}

export type OptionsRestauration = {
  // Le répertoire d'une sauvegarde datée : <destination>/<horodatage>.
  sauvegarde: string;
  repertoireEtat: string;
};

export type BilanRestauration = { projet: string; prise: string; evenements: number; dernierSeq: number; flux: number };

// Pose une sauvegarde dans un répertoire d'état qui n'a pas de journal. Ni
// verrou, ni clone, ni worktree : le runtime qui démarre ensuite y trouve le
// journal d'un runtime mort sans préavis, et repart de là.
export function restaurer(options: OptionsRestauration): BilanRestauration {
  const sauvegarde = resolve(options.sauvegarde);
  const repertoireEtat = resolve(options.repertoireEtat);
  const instantane = join(sauvegarde, "log.db");
  if (!existsSync(instantane) || !existsSync(join(sauvegarde, MANIFESTE))) {
    throw new SauvegardeRefusee(`${sauvegarde} n'est pas une sauvegarde : il y faut log.db et ${MANIFESTE}`);
  }
  if (existsSync(cheminJournal(repertoireEtat))) {
    throw new SauvegardeRefusee(`${repertoireEtat} a déjà un journal : une restauration n'en écrase jamais un — déplace l'ancien état d'abord`);
  }
  const manifeste = lireManifeste(sauvegarde);
  const lu = controler(instantane);
  if (lu.projet !== manifeste.project || lu.dernierSeq !== manifeste.lastSeq || lu.evenements !== manifeste.events) {
    throw new SauvegardeRefusee(
      `la base de ${sauvegarde} ne dit pas ce que dit son manifeste (projet ${lu.projet}, ${lu.evenements} événements jusqu'au n° ${lu.dernierSeq}) : sauvegarde abîmée`,
    );
  }

  mkdirSync(repertoireEtat, { recursive: true });
  const { total } = copierFlux(join(dirname(sauvegarde), FLUX), join(repertoireEtat, FLUX));
  // Le journal en dernier, et d'un seul geste : une restauration interrompue
  // ne laisse pas un état qui démarre, et se rejoue.
  const partiel = join(repertoireEtat, "log.db.restauration");
  copyFileSync(instantane, partiel);
  renameSync(partiel, cheminJournal(repertoireEtat));
  return { projet: manifeste.project, prise: manifeste.at, evenements: lu.evenements, dernierSeq: lu.dernierSeq, flux: total };
}
