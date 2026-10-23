// Ce qui manque à la station pour un projet, et le choix que le chef en fait
// (#1393). Le dépôt dit ce dont les tests du projet ont besoin
// (`detecter.ts`), la machine et les stations déclarées disent ce que la
// station fournit (`fourni.ts`) ; pour chaque besoin qu'elle n'a pas, un seul
// choix, à quatre issues, chacune avec ce qui en suit pour le chef :
//   - `cook-elsewhere` : le cuire sur une station qui l'a — les tickets qui en
//     ont besoin l'attendent ;
//   - `provide-here` : le fournir sur cette station — ce qui s'y installe ;
//   - `adapt-tests` : adapter les tests — ce que la couverture y perd ;
//   - `setup-brings-it` : le setup du projet l'apporte lui-même (#1534) — un
//     ticket le lui demande (`ticket.ts`), rien ne s'installe sur la station.
//     Recommandée (`recommended`) quand la station a déjà ce dont il se sert.
//
// Le choix s'écrit au journal du projet (`need.choice-raised`), avec le
// blocage qui l'attend, sous le même identifiant (`need:<besoin>`, action
// `choose-need`) : la page du projet le montre comme une carte. Le chef
// choisit une issue (`need.choice-selected`) : le choix n'est plus en attente,
// le blocage est levé. Le besoin cesse de manquer — la station l'a désormais,
// ou le dépôt n'en parle plus — : le choix quitte la liste
// (`need.choice-dropped`), le blocage aussi.
//
// Le setup de worktree du projet échoue sur un besoin que la station ne
// fournit pas vraiment (#1533) : la station le dit au journal
// (`need.setup-lacks`, `tenirLeSetup`) et le choix de ce besoin est posé, sa
// cause est le setup — le chef a ce choix, pas l'échec brut du setup. Il tient
// tant que le dernier setup de cette station le dit, et qu'elle ne le fournit
// toujours pas.
//
// La station publie les choix dans le suivi du projet, à côté de ses blocages
// (`projets/demande.ts`, `choix`). Le chef choisit depuis l'app, qui l'écrit
// dans la demande du projet (`"choix": { "need:postgres": "provide-here" }`) :
// la station le pose au journal à sa lecture suivante.
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Base } from "../../base.ts";
import { masquerIdentifiants } from "../../identifiants.ts";
import { ouvrirJournal, type Journal } from "../../journal.ts";
import { blocage, blocagesDuJournal, leverBlocage, lireBlocages, poserBlocage, type Auteur, type Blocage, type NouveauBlocage } from "../blocages/blocages.ts";
import { besoinNomme, idDuChoix, PREFIXE, type Besoin } from "./catalogue.ts";
import { besoinsDuDepot, type BesoinDuProjet } from "./detecter.ts";
import type { ChoixEcrit, OptionDeChoix } from "./evenements.ts";
import { aLeBesoin, apportableSansInstaller, sondeDeLaMachine, stationsDuProjet, stationsQuiFournissent, type Sonde, type StationVue } from "./fourni.ts";
import { besoinsNommesParLeSetup, preuveDuSetup } from "./setup.ts";

export type { ChoixEcrit, OptionDeChoix } from "./evenements.ts";

export const AILLEURS = "cook-elsewhere";
export const ICI = "provide-here";
export const TESTS = "adapt-tests";
export const PROJET = "setup-brings-it";
export const OPTIONS: readonly string[] = [AILLEURS, ICI, TESTS, PROJET];

// Le geste de l'app qui lève le blocage d'un besoin : montrer son choix.
export const ACTION_DU_CHOIX = "choose-need";

// Un choix tel que la page le lit : en attente, ou choisi — l'issue retenue,
// et quand. `ticket` : celui que le choix a ouvert sur le projet, tant que
// le choix tient (`setup-brings-it`).
export type Choix = ChoixEcrit & ({ status: "pending" } | { status: "chosen"; selected: string; selectedAt: string; ticket?: number });

// Ce que le chef choisit, par identifiant de choix.
export type Selections = Record<string, string>;

// Un choix qui n'existe pas, ou une issue qu'il n'offre pas.
export class ChoixInconnu extends Error {}

// Ce que les phrases d'un choix nomment.
export type Contexte = {
  projet: string;
  // La station qui manque du besoin, telle que le chef la nomme : `box`.
  station: string;
  // Les autres stations du projet qui le fournissent.
  ailleurs: readonly string[];
  // Le setup du projet peut l'apporter sans que rien ne soit installé sur la
  // station : elle a déjà ce dont il se sert. Absent : faux.
  sansInstaller?: boolean;
};

const PHRASE_MAX = 400;
const liste = (noms: readonly string[]) => (noms.length <= 1 ? noms.join("") : `${noms.slice(0, -1).join(", ")} and ${noms.at(-1)}`);

// La cause : ce qui, dans le dépôt, dit le besoin — autant de preuves qu'il en
// tient dans une phrase.
function cause(preuves: readonly string[]): string {
  for (let combien = preuves.length; combien > 1; combien--) {
    const phrase = `${preuves.slice(0, combien).join("; ")}.`;
    if (phrase.length <= PHRASE_MAX) return phrase;
  }
  return `${preuves[0] ?? "The repository asks for it"}.`;
}

// Le choix d'un besoin qui manque : ce qui manque, pourquoi, et les quatre
// issues, chacune avec ce qui en suit. Pur.
export function choixPour({ besoin, preuves }: BesoinDuProjet, { projet, station, ailleurs, sansInstaller = false }: Contexte): ChoixEcrit {
  const capacite = besoin.fourni.capacites[0] ?? besoin.id;
  const options: OptionDeChoix[] = [
    {
      id: AILLEURS,
      label: "Cook it on a station that has it",
      consequence:
        ailleurs.length > 0
          ? `The tickets of ${projet} whose tests need ${besoin.nom} wait for ${liste(ailleurs)}, which ${ailleurs.length > 1 ? "provide" : "provides"} it; ${station} keeps cooking the others.`
          : `The tickets of ${projet} whose tests need ${besoin.nom} wait until a station that provides \`${capacite}\` is declared for ${projet}; none is today, so they do not start.`,
    },
    {
      id: ICI,
      label: `Provide it on ${station}`,
      consequence: `${besoin.installe(station)}, and the tests of ${projet} run there with it: no ticket waits for another station.`,
    },
    {
      id: TESTS,
      label: "Adapt the tests",
      consequence: `A ticket of ${projet} rewrites its tests so they pass without ${besoin.nom}: ${besoin.couverture}.`,
    },
    {
      id: PROJET,
      label: "The project's setup brings it itself",
      consequence: `A ticket of ${projet} makes its worktree setup bring ${besoin.nom} itself — ${besoin.apporte.comment} —, and its tests run with it: ${
        sansInstaller ? `${station} already has what that takes, nothing is installed there.` : `what that takes is not on ${station} yet, so the setup has to fetch it, or that ticket says what must be installed there.`
      }`,
      ...(sansInstaller ? { recommended: true as const } : {}),
    },
  ];
  return { id: idDuChoix(besoin.id), need: besoin.id, message: `The tests of ${projet} need ${besoin.nom}, which ${station} does not have.`, cause: cause(preuves), options };
}

// Les choix que les besoins manquants du projet appellent, devant ce que la
// station fournit. Pur, sa sonde mise à part.
export function choixDesBesoins(besoins: readonly BesoinDuProjet[], station: { projet: string; nom: string; sonde: Sonde; fournit: readonly string[]; ailleurs: ReadonlyArray<{ nom: string; fournit: string[] }> }): ChoixEcrit[] {
  return besoins
    .filter(({ besoin }) => !aLeBesoin(besoin, station.sonde, station.fournit))
    .map((manquant) =>
      choixPour(manquant, { projet: station.projet, station: station.nom, ailleurs: stationsQuiFournissent(manquant.besoin, station.ailleurs), sansInstaller: apportableSansInstaller(manquant.besoin, station.sonde, station.fournit) }),
    );
}

// ———— Ce que dit le setup du projet ————

// Ce que les choix d'un projet savent de la station : ce que ses stations
// d'ici déclarent fournir, et les autres stations du projet.
export type Stations = { projet: string; sonde: Sonde; fournit: readonly string[]; ailleurs: readonly StationVue[] };

// Les besoins que la sortie d'un setup en échec nomme, et que la station ne
// fournit pas vraiment. Aucun : le setup a échoué sur autre chose, ou sur un
// besoin qu'elle fournit — son échec se dit tel quel. Pur, sa sonde mise à part.
export const besoinsManquesParLeSetup = (sortie: string, { sonde, fournit }: Pick<Stations, "sonde" | "fournit">): Besoin[] => besoinsNommesParLeSetup(sortie).filter((besoin) => !aLeBesoin(besoin, sonde, fournit));

// Ce que le dernier setup de chaque station a dit manquer, d'après le
// journal : station → besoins. Celle dont le dernier dit est vide n'y est pas.
export function manquesDuSetup(base: Base): Map<string, string[]> {
  const manques = new Map<string, string[]>();
  for (const { payload } of base.lire<{ payload: string }>("SELECT payload FROM events WHERE type = 'need.setup-lacks' ORDER BY seq")) {
    const { station, needs } = JSON.parse(payload) as { station: string; needs: string[] };
    if (needs.length === 0) manques.delete(station);
    else manques.set(station, needs);
  }
  return manques;
}

// Les choix que les manques du setup appellent : un par besoin qu'il a dit
// manquer à une station, et qu'elle ne fournit toujours pas. Il manque à
// cette station-là, et c'est le setup qui le prouve. Pur, sa sonde mise à part.
export function choixDuSetup(manques: ReadonlyMap<string, readonly string[]>, { projet, sonde, fournit, ailleurs }: Stations): ChoixEcrit[] {
  const choix: ChoixEcrit[] = [];
  for (const [station, besoins] of manques) {
    for (const id of besoins) {
      const besoin = besoinNomme(id);
      if (besoin === null || choix.some(({ need }) => need === id) || aLeBesoin(besoin, sonde, fournit)) continue;
      choix.push(choixPour({ besoin, preuves: [preuveDuSetup(besoin, station)] }, { projet, station, ailleurs: stationsQuiFournissent(besoin, ailleurs), sansInstaller: apportableSansInstaller(besoin, sonde, fournit) }));
    }
  }
  return choix;
}

// Les choix voulus : ceux du dépôt, puis ceux du setup — qui remplacent ceux
// du dépôt pour le même besoin : le setup qui échoue le prouve mieux.
const avecLeSetup = (duDepot: readonly ChoixEcrit[], duSetup: readonly ChoixEcrit[]): ChoixEcrit[] => [...duDepot.filter(({ id }) => !duSetup.some((un) => un.id === id)), ...duSetup];

// ———— Au journal du projet ————

const TYPES = ["need.choice-raised", "need.choice-selected", "need.choice-dropped", "need.ticket-opening", "need.ticket-opened"];

// Le ticket qu'un choix ouvre sur le projet (`ticket.ts`) : annoncé au
// journal avant l'appel à GitHub (`annonce`, son numéro au journal, et quand),
// puis ouvert (`ticket`). Un choix abandonné l'oublie : le besoin qui revient
// et que le chef confie de nouveau au projet en ouvre un neuf.
export type TicketDuChoix = { need: string; annonce: number; annonceLe: string; ticket: number | null };

function lireLeJournal(base: Base): { choix: Choix[]; tickets: Map<string, TicketDuChoix> } {
  const faits = base.lire<{ seq: number; type: string; payload: string; at: string }>(`SELECT seq, type, payload, at FROM events WHERE type IN (${TYPES.map(() => "?").join(", ")}) ORDER BY seq`, ...TYPES);
  const enCours = new Map<string, Choix>();
  const tickets = new Map<string, TicketDuChoix>();
  for (const { seq, type, payload, at } of faits) {
    const lu = JSON.parse(payload) as ChoixEcrit & { option?: string; ticket?: number };
    const deja = enCours.get(lu.id);
    if (type === "need.ticket-opening") tickets.set(lu.id, { need: lu.need, annonce: seq, annonceLe: at, ticket: null });
    else if (type === "need.ticket-opened") {
      const annonce = tickets.get(lu.id);
      tickets.set(lu.id, { need: lu.need, annonce: annonce?.annonce ?? seq, annonceLe: annonce?.annonceLe ?? at, ticket: lu.ticket ?? null });
    } else if (type === "need.choice-dropped") {
      enCours.delete(lu.id);
      tickets.delete(lu.id);
    } else if (type === "need.choice-raised") {
      // Changé, il garde l'issue retenue — si elle est encore offerte.
      const ecrit: ChoixEcrit = { id: lu.id, need: lu.need, message: lu.message, cause: lu.cause, options: lu.options };
      const garde = deja?.status === "chosen" && ecrit.options.some(({ id }) => id === deja.selected);
      enCours.set(lu.id, garde ? { ...ecrit, status: "chosen", selected: deja.selected, selectedAt: deja.selectedAt } : { ...ecrit, status: "pending" });
    } else if (deja !== undefined && lu.option !== undefined) {
      enCours.set(lu.id, { ...ecritDe(deja), status: "chosen", selected: lu.option, selectedAt: at });
    }
  }
  const choix = [...enCours.values()].map((un): Choix => {
    const ticket = tickets.get(un.id)?.ticket ?? null;
    return un.status === "chosen" && un.selected === PROJET && ticket !== null ? { ...un, ticket } : un;
  });
  return { choix, tickets };
}

// Les choix d'un projet, d'après son journal, dans l'ordre où ils ont été posés.
export const choixDuJournal = (base: Base): Choix[] => lireLeJournal(base).choix;

// Les tickets que ses choix ont annoncés ou ouverts, par identifiant de choix.
export const ticketsDesChoix = (base: Base): Map<string, TicketDuChoix> => lireLeJournal(base).tickets;

const ecritDe = (choix: ChoixEcrit): ChoixEcrit => ({ id: choix.id, need: choix.need, message: choix.message, cause: choix.cause, options: choix.options });
// Tel que le journal l'écrit (`identifiants.ts`) : comparé ainsi, rien ne se réécrit pour rien.
const masque = <T>(valeur: T): T => JSON.parse(masquerIdentifiants(JSON.stringify(valeur)).texte) as T;
const memes = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// Le blocage qui attend le choix.
export const blocageDuChoix = (choix: ChoixEcrit): NouveauBlocage => ({ id: choix.id, message: choix.message, cause: choix.cause, action: ACTION_DU_CHOIX });

type Pas = { lever: ChoixEcrit } | { poser: ChoixEcrit } | { abandonner: string } | { choisir: string; option: string } | { bloquer: ChoixEcrit } | { debloquer: string };

// Ce qu'il faut écrire pour que le journal porte les choix voulus et les
// sélections du chef. Rien : il les porte déjà. Pur.
function plan(avant: readonly Choix[], blocages: readonly Blocage[], voulus: readonly ChoixEcrit[], selections: Selections): Pas[] {
  const pas: Pas[] = [];
  const voulusParId = new Map(voulus.map((voulu) => [voulu.id, masque(voulu)]));
  for (const deja of avant) {
    if (!voulusParId.has(deja.id)) pas.push({ abandonner: deja.id });
  }
  const apres = new Map<string, Choix>();
  for (const voulu of voulusParId.values()) {
    const deja = avant.find(({ id }) => id === voulu.id);
    if (deja === undefined || !memes(ecritDe(deja), voulu)) pas.push({ poser: voulu });
    const garde = deja?.status === "chosen" && voulu.options.some(({ id }) => id === deja.selected);
    apres.set(voulu.id, garde ? { ...voulu, status: "chosen", selected: deja.selected, selectedAt: deja.selectedAt } : { ...voulu, status: "pending" });
  }
  for (const [id, option] of Object.entries(selections)) {
    const choix = apres.get(id);
    if (choix === undefined || !choix.options.some((offerte) => offerte.id === option)) continue;
    if (choix.status === "chosen" && choix.selected === option) continue;
    pas.push({ choisir: id, option });
    apres.set(id, { ...ecritDe(choix), status: "chosen", selected: option, selectedAt: "" });
  }
  // Le blocage d'un choix en attente est posé, tel quel ; celui d'un choix
  // retenu, ou disparu, est levé.
  for (const blocageEnCours of blocages) {
    if (!blocageEnCours.id.startsWith(PREFIXE) || blocageEnCours.action !== ACTION_DU_CHOIX) continue;
    if (apres.get(blocageEnCours.id)?.status !== "pending") pas.push({ debloquer: blocageEnCours.id });
  }
  for (const choix of apres.values()) {
    if (choix.status !== "pending") continue;
    const enCours = blocages.find(({ id }) => id === choix.id);
    if (enCours === undefined || !memes(enCours, masque(blocage(blocageDuChoix(choix))))) pas.push({ bloquer: choix });
  }
  return pas;
}

// Fait porter au journal du projet les choix voulus — posés, changés, ou
// abandonnés quand le besoin ne manque plus — et les issues que le chef a
// retenues, avec les blocages qui les attendent. Une seule transaction : deux
// process qui le font ensemble n'écrivent qu'une fois. Rend le nombre de faits
// écrits — aucun, quand le journal les porte déjà.
export function tenirLesChoix(journal: Journal, auteur: Auteur, voulus: readonly ChoixEcrit[], selections: Selections = {}, chef = "chef"): number {
  const { projet } = auteur;
  return journal.base.transaction(() => {
    const pas = plan(choixDuJournal(journal.base), blocagesDuJournal(journal.base), voulus, selections);
    for (const un of pas) {
      if ("abandonner" in un) journal.ajouter({ project: projet, ticket: null, author: auteur.auteur, type: "need.choice-dropped", payload: { id: un.abandonner } });
      else if ("poser" in un) journal.ajouter({ project: projet, ticket: null, author: auteur.auteur, type: "need.choice-raised", payload: un.poser });
      else if ("choisir" in un) journal.ajouter({ project: projet, ticket: null, author: chef, type: "need.choice-selected", payload: { id: un.choisir, option: un.option } });
      else if ("bloquer" in un) poserBlocage(journal, auteur, blocageDuChoix(un.bloquer));
      else if ("debloquer" in un) leverBlocage(journal, auteur, un.debloquer);
    }
    return pas.length;
  });
}

// Retient l'issue que le chef choisit : le choix n'est plus en attente, son
// blocage est levé. Rend faux si elle était déjà retenue — rien ne s'écrit.
// Un choix qui n'est pas posé, ou une issue qu'il n'offre pas, est refusé.
export function choisir(journal: Journal, auteur: Auteur, id: string, option: string, chef = "chef"): boolean {
  return journal.base.transaction(() => {
    const choix = choixDuJournal(journal.base);
    const vise = choix.find((un) => un.id === id);
    if (vise === undefined) throw new ChoixInconnu(`choix ${id} : aucun choix en cours sous cet identifiant`);
    if (!vise.options.some((offerte) => offerte.id === option)) throw new ChoixInconnu(`choix ${id} : l'issue ${option} n'est pas offerte — attendu ${vise.options.map((offerte) => offerte.id).join(", ")}`);
    return tenirLesChoix(journal, auteur, choix.map(ecritDe), { [id]: option }, chef) > 0;
  });
}

function avecLeJournal<T>(repertoireEtat: string, faire: (journal: Journal) => T): T {
  mkdirSync(repertoireEtat, { recursive: true });
  const journal = ouvrirJournal(repertoireEtat);
  try {
    return faire(journal);
  } finally {
    journal.fermer();
  }
}

// Le setup de `station` vient d'échouer sur ces besoins, qu'elle ne fournit
// pas vraiment — aucun : il a échoué sur autre chose, ou il passe. La station
// le dit au journal, si cela change, et les choix de ces besoins sont posés
// aussitôt, à côté de ceux qui y sont déjà : la lecture suivante de la station
// les retrouve tels quels (`suivreLesBesoins`). Un besoin que plus aucun setup
// ne dit manquer perd son choix — la lecture suivante le repose si le dépôt le
// demande toujours. `stations` n'est lu que s'il y a des choix à poser. Une
// seule transaction. Rend le nombre de faits écrits.
export function tenirLeSetup(journal: Journal, auteur: Auteur, station: string, besoins: readonly string[], stations?: Stations): number {
  return journal.base.transaction(() => {
    const avant = manquesDuSetup(journal.base);
    let ecrits = 0;
    if (!memes(avant.get(station) ?? [], besoins)) {
      journal.ajouter({ project: auteur.projet, ticket: null, author: auteur.auteur, type: "need.setup-lacks", payload: { station, needs: [...besoins] } });
      ecrits++;
    }
    const apres = manquesDuSetup(journal.base);
    const tus = (avant.get(station) ?? []).filter((id) => ![...apres.values()].some((ids) => ids.includes(id)));
    const duSetup = stations === undefined || besoins.length === 0 ? [] : choixDuSetup(apres, stations);
    if (tus.length === 0 && duSetup.length === 0) return ecrits;
    const gardes = choixDuJournal(journal.base)
      .map(ecritDe)
      .filter(({ need }) => !tus.includes(need));
    return ecrits + tenirLesChoix(journal, auteur, avecLeSetup(gardes, duSetup));
  });
}

export const choisirDans = (repertoireEtat: string, auteur: Auteur, id: string, option: string, chef = "chef") => avecLeJournal(repertoireEtat, (journal) => choisir(journal, auteur, id, option, chef));

// Les choix d'un projet, lus dans son répertoire d'état, en lecture seule.
// Sans journal, ou illisible, aucun.
export function lireChoix(repertoireEtat: string): Choix[] {
  let journal;
  try {
    journal = ouvrirJournal(repertoireEtat, { lectureSeule: true });
  } catch {
    return [];
  }
  try {
    return choixDuJournal(journal.base);
  } catch {
    return [];
  } finally {
    journal.fermer();
  }
}

// Ce que le dernier setup de chaque station a dit manquer, lu dans le
// répertoire d'état d'un projet, en lecture seule. Sans journal, rien.
export function lireManquesDuSetup(repertoireEtat: string): Map<string, string[]> {
  let journal;
  try {
    journal = ouvrirJournal(repertoireEtat, { lectureSeule: true });
  } catch {
    return new Map();
  }
  try {
    return manquesDuSetup(journal.base);
  } catch {
    return new Map();
  } finally {
    journal.fermer();
  }
}

// Ce que l'app écrit du choix du chef, dans la demande d'un projet : un objet
// `{ "<id du choix>": "<issue>" }`. Ce qui n'en a pas la forme est ignoré.
export function selectionsLues(brut: unknown): Selections {
  if (brut === null || typeof brut !== "object" || Array.isArray(brut)) return {};
  return Object.fromEntries(Object.entries(brut as Record<string, unknown>).filter((entree): entree is [string, string] => entree[0].startsWith(PREFIXE) && typeof entree[1] === "string" && OPTIONS.includes(entree[1])));
}

// ———— À chaque lecture de la station ————

// Ce qui désigne le contenu du clone : le commit où il est. Null quand il ne
// se lit pas — le dépôt est alors relu à chaque fois.
function empreinteDuClone(clone: string): string | null {
  try {
    const tete = readFileSync(join(clone, ".git", "HEAD"), "utf8").trim();
    if (!tete.startsWith("ref: ")) return tete;
    const ref = tete.slice(5);
    if (existsSync(join(clone, ".git", ref))) return `${ref} ${readFileSync(join(clone, ".git", ref), "utf8").trim()}`;
    const emballee = readFileSync(join(clone, ".git", "packed-refs"), "utf8")
      .split("\n")
      .find((ligne) => ligne.endsWith(` ${ref}`));
    return emballee === undefined ? null : `${ref} ${emballee}`;
  } catch {
    return null;
  }
}

export type ProjetSuivi = { nom: string; principale: boolean; choix?: Selections };

export type SuiviDesBesoins = {
  // Tient les choix du projet à son journal, et rend ceux que son suivi publie.
  tenir: (projet: ProjetSuivi, lieux: { repertoireEtat: string; clone: string }) => Choix[];
};

// Ce que la station tient des besoins de ses projets, d'une lecture à
// l'autre : seule la station principale d'un projet le détecte, sur son
// clone ; le dépôt n'est relu que quand son clone a changé de commit, la
// machine à chaque lecture — le chef qui y installe ce qui manque voit le
// choix disparaître à la suivante.
export function suivreLesBesoins(options: { station: string; sonde?: Sonde; avertir?: (ligne: string) => void }): SuiviDesBesoins {
  const { station } = options;
  const sonde = options.sonde ?? sondeDeLaMachine();
  const lus = new Map<string, { empreinte: string; besoins: BesoinDuProjet[] }>();
  const avertis = new Set<string>();
  const avertir = (ligne: string) => {
    if (avertis.has(ligne)) return;
    avertis.add(ligne);
    options.avertir?.(ligne);
  };
  const besoinsDe = (clone: string): BesoinDuProjet[] => {
    const empreinte = empreinteDuClone(clone);
    const deja = lus.get(clone);
    if (empreinte !== null && deja?.empreinte === empreinte) return deja.besoins;
    const besoins = besoinsDuDepot(clone);
    if (empreinte !== null) lus.set(clone, { empreinte, besoins });
    return besoins;
  };
  return {
    tenir(projet, { repertoireEtat, clone }) {
      if (!projet.principale || !existsSync(join(clone, ".git"))) return lireChoix(repertoireEtat);
      try {
        const declarees = stationsDuProjet(repertoireEtat);
        const stations: Stations = { projet: projet.nom, sonde, fournit: declarees.ici.flatMap(({ fournit }) => fournit), ailleurs: declarees.ailleurs };
        const voulus = avecLeSetup(choixDesBesoins(besoinsDe(clone), { ...stations, nom: station }), choixDuSetup(lireManquesDuSetup(repertoireEtat), stations));
        const selections = projet.choix ?? {};
        // Le journal n'est ouvert en écriture que s'il y a quelque chose à y écrire.
        if (plan(lireChoix(repertoireEtat), lireBlocages(repertoireEtat), voulus, selections).length > 0) {
          avecLeJournal(repertoireEtat, (journal) => tenirLesChoix(journal, { projet: projet.nom, auteur: `station:${station}` }, voulus, selections));
        }
      } catch (erreur) {
        avertir(`brigade : station — ${projet.nom} : ce qui lui manque n'a pas pu être tenu à son journal — ${erreur instanceof Error ? erreur.message : String(erreur)}`);
      }
      return lireChoix(repertoireEtat);
    },
  };
}
