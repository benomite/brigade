// Le registre des stations du chef : les machines où l'app brigade est
// installée, à lui et non à un projet. Une station a un nom, une machine, des
// capacités, une cloison ou non, et elle est joignable ou non.
//
// Une machine qui se présente entre toujours « en attente » : avoir l'app et
// l'accès au dépôt ne suffit pas pour brancher une machine sur la cuisine du
// chef. Seule son acceptation, explicite, la rend utilisable — avec les
// capacités que le chef lui reconnaît, celles qu'elle déclare par défaut.
// Aucune sélection ne rend une station en attente.
//
// Un téléphone est une station comme une autre (`sorte.ts`) : il se présente,
// le chef l'accepte, la liste le montre — avec `cuisine: false`. Mais il ne
// fait tourner aucun cook : aucune sélection ne le rend, accepté ou non, même
// seul au registre, et sa venue ou son départ ne change rien à celles qu'elle
// rend.
//
// Le registre est un fichier SQLite du répertoire qu'on lui donne : l'app et
// les runtimes des projets peuvent l'ouvrir ensemble, chaque écriture est une
// transaction qui attend son tour.
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { Base } from "../base.ts";
import { capacite as nomDeCapacite, CAPACITE, FORME_DE_CAPACITE, fournitTout } from "../capacites.ts";
import { cuisine, estUneSorte, ORDINATEUR, SORTES, type Sorte } from "./sorte.ts";

export type Statut = "en-attente" | "acceptee";

// Ce qu'une machine dit d'elle en se présentant.
export type Presentation = {
  // Le nom par lequel le chef la désigne : en minuscules, chiffres et tirets,
  // comme la machine d'une station déclarée (`mac`, `windows-de-test`).
  nom: string;
  // Ce qu'elle est, tel que la home l'affiche (`macOS 26`, `Windows 11`).
  machine: string;
  // Ce qu'elle dit fournir.
  capacites: readonly string[];
  // Vrai : ses cooks tournent dans une cloison, comme sur la box. Faux : ils
  // voient tout ce que le compte de la machine voit.
  cloisonnee: boolean;
  // Ce qu'elle est : un ordinateur, si elle n'en dit rien, ou un téléphone,
  // qui ne cuisine pas.
  sorte?: Sorte;
};

export type StationGlobale = {
  nom: string;
  machine: string;
  // Ce qu'elle déclare fournir, à sa dernière présentation.
  declarees: string[];
  // Ce que le chef lui reconnaît : ce qui la sélectionne. Vide tant qu'elle
  // est en attente.
  capacites: string[];
  cloisonnee: boolean;
  sorte: Sorte;
  // Faux : elle ne fait tourner aucun cook — un téléphone. Aucune sélection ne
  // la rend.
  cuisine: boolean;
  joignable: boolean;
  statut: Statut;
  // Sa première présentation. Une acceptation perdue — revenue sous une
  // autre machine ou une autre cloison — la remet à la date de son retour.
  presenteeLe: string;
  // Nulle tant qu'elle est en attente.
  accepteeLe: string | null;
};

export type Registre = {
  // La machine se présente : inconnue, elle entre en attente.
  presenter(presentation: Presentation): StationGlobale;
  // Le chef l'accepte, avec les capacités qu'il lui reconnaît — celles
  // qu'elle déclare, s'il n'en dit pas d'autres. Acceptée, il les règle de
  // nouveau par le même geste.
  accepter(nom: string, options?: { capacites?: readonly string[] }): StationGlobale;
  // Elle répond, ou ne répond plus. Ni son statut ni ses capacités n'en
  // changent.
  joignable(nom: string, joignable: boolean): StationGlobale;
  lire(nom: string): StationGlobale | null;
  // Le chef la retire : elle quitte le registre, et la rend telle qu'elle y
  // était. Revenue, elle se présente de nouveau, en attente.
  retirer(nom: string): StationGlobale;
  // Toutes, en attente comprises, celles qui ne cuisinent pas aussi, dans
  // l'ordre de leur nom.
  liste(): StationGlobale[];
  // Les stations acceptées qui cuisinent et fournissent tout ce qui est
  // `demande`, dans l'ordre de leur nom : les candidates pour faire tourner
  // les cooks d'un projet. Jamais une station qui ne cuisine pas. Joignables
  // ou non : dire d'une station éteinte qu'elle est absente, plutôt que
  // manquante, est l'affaire de qui choisit.
  utilisables(demande?: readonly string[]): StationGlobale[];
  fermer(): void;
};

// Une présentation, ou une acceptation, mal formée : rien n'est écrit.
export class PresentationInvalide extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PresentationInvalide";
  }
}

export class StationInconnue extends Error {
  constructor(nom: string) {
    super(`station inconnue du registre : \`${nom}\` ne s'est jamais présentée`);
    this.name = "StationInconnue";
  }
}

export const cheminRegistre = (repertoire: string) => join(repertoire, "stations.db");

// La machine d'un nom de station déclarée (`stations-declarees.ts`) : une
// station du registre la remplacera, sous le même nom.
const NOM = /^[\p{Ll}\p{N}][\p{Ll}\p{N}-]*$/u;

// 2 : la sorte de chaque station (#1158). Un registre de la version 1 la
// prend à son ouverture : ses stations sont des ordinateurs.
const VERSION = 2;

type Rangee = {
  nom: string;
  machine: string;
  declarees: string;
  capacites: string;
  cloisonnee: number;
  sorte: Sorte;
  joignable: number;
  statut: Statut;
  presentee_le: string;
  acceptee_le: string | null;
};

const versStation = (rangee: Rangee): StationGlobale => ({
  nom: rangee.nom,
  machine: rangee.machine,
  declarees: JSON.parse(rangee.declarees) as string[],
  capacites: JSON.parse(rangee.capacites) as string[],
  cloisonnee: rangee.cloisonnee === 1,
  sorte: rangee.sorte,
  cuisine: cuisine(rangee.sorte),
  joignable: rangee.joignable === 1,
  statut: rangee.statut,
  presenteeLe: rangee.presentee_le,
  accepteeLe: rangee.acceptee_le,
});

// Les capacités telles qu'elles se comparent, sans doublon, dans l'ordre où
// elles sont écrites.
function lireCapacites(ecrites: readonly string[]): string[] {
  if (!Array.isArray(ecrites)) throw new PresentationInvalide(`capacités : une liste est attendue — ${FORME_DE_CAPACITE}`);
  const lues = ecrites.map((ecrite) => {
    const nom = typeof ecrite === "string" ? nomDeCapacite(ecrite.trim()) : "";
    if (!CAPACITE.test(nom)) throw new PresentationInvalide(`capacité : « ${String(ecrite)} » n'est pas un nom de capacité — ${FORME_DE_CAPACITE}`);
    return nom;
  });
  return [...new Set(lues)];
}

function lirePresentation(presentation: Presentation): Required<Presentation> & { capacites: string[] } {
  const { nom, machine, capacites, cloisonnee, sorte = ORDINATEUR } = presentation;
  if (typeof nom !== "string" || !NOM.test(nom)) throw new PresentationInvalide(`nom : « ${String(nom)} » n'est pas un nom de station — des minuscules, des chiffres et des tirets (mac, windows-de-test)`);
  if (typeof machine !== "string" || machine.trim() === "") throw new PresentationInvalide(`machine : elle manque — ce qu'est la machine de \`${nom}\` (macOS 26, Windows 11)`);
  if (typeof cloisonnee !== "boolean") throw new PresentationInvalide(`cloisonnée : \`${nom}\` doit dire si ses cooks tournent dans une cloison (vrai ou faux)`);
  if (!estUneSorte(sorte)) throw new PresentationInvalide(`sorte : « ${String(sorte)} » n'est pas une sorte de station — ${SORTES.join(" ou ")}`);
  return { nom, machine: machine.trim(), capacites: lireCapacites(capacites), cloisonnee, sorte };
}

export type OptionsRegistre = { maintenant?: () => Date };

export function ouvrirRegistre(repertoire: string, options: OptionsRegistre = {}): Registre {
  const maintenant = options.maintenant ?? (() => new Date());
  mkdirSync(repertoire, { recursive: true });
  const base = new Base(cheminRegistre(repertoire), { attenteMs: 5000 });
  base.transaction(() => {
    base.script(`
      CREATE TABLE IF NOT EXISTS stations (
        nom          TEXT PRIMARY KEY,
        machine      TEXT NOT NULL,
        declarees    TEXT NOT NULL,
        capacites    TEXT NOT NULL,
        cloisonnee   INTEGER NOT NULL CHECK (cloisonnee IN (0, 1)),
        sorte        TEXT NOT NULL DEFAULT '${ORDINATEUR}' CHECK (sorte IN (${SORTES.map((sorte) => `'${sorte}'`).join(", ")})),
        joignable    INTEGER NOT NULL CHECK (joignable IN (0, 1)),
        statut       TEXT NOT NULL CHECK (statut IN ('en-attente', 'acceptee')),
        presentee_le TEXT NOT NULL,
        acceptee_le  TEXT
      ) STRICT;
    `);
    // Un registre écrit par un runtime plus récent ne se lit pas à l'aveugle.
    const version = Number(base.lire<{ user_version: number }>("PRAGMA user_version")[0]?.user_version);
    if (version > VERSION) throw new Error(`registre des stations en version ${version}, ce runtime n'en lit que la ${VERSION} : ${cheminRegistre(repertoire)}`);
    if (version < VERSION) {
      const colonnes = base.lire<{ name: string }>("PRAGMA table_info(stations)").map(({ name }) => name);
      if (!colonnes.includes("sorte")) {
        base.script(`ALTER TABLE stations ADD COLUMN sorte TEXT NOT NULL DEFAULT '${ORDINATEUR}' CHECK (sorte IN (${SORTES.map((sorte) => `'${sorte}'`).join(", ")}))`);
      }
      base.script(`PRAGMA user_version = ${VERSION}`);
    }
  });

  const rangee = (nom: string) => base.lire<Rangee>("SELECT * FROM stations WHERE nom = ?", nom)[0];
  const station = (nom: string): StationGlobale => {
    const lue = rangee(nom);
    if (!lue) throw new StationInconnue(nom);
    return versStation(lue);
  };

  return {
    presenter(presentation) {
      const { nom, machine, capacites, cloisonnee, sorte } = lirePresentation(presentation);
      const instant = maintenant().toISOString();
      return base.transaction(() => {
        const connue = rangee(nom);
        // L'acceptation vaut pour une machine, sa cloison et sa sorte : sous
        // une autre machine, une autre cloison, ou revenue téléphone, elle ne
        // se transmet pas. Elle ne vaut pas pour ce que la station déclare de
        // plus — seul le chef reconnaît une capacité.
        const memeMachine = connue !== undefined && connue.machine === machine && connue.cloisonnee === Number(cloisonnee) && connue.sorte === sorte;
        if (connue && memeMachine) {
          base.executer("UPDATE stations SET declarees = ?, joignable = 1 WHERE nom = ?", JSON.stringify(capacites), nom);
        } else if (connue && connue.statut === "en-attente") {
          base.executer("UPDATE stations SET machine = ?, declarees = ?, cloisonnee = ?, sorte = ?, joignable = 1 WHERE nom = ?", machine, JSON.stringify(capacites), Number(cloisonnee), sorte, nom);
        } else {
          base.executer(
            `INSERT INTO stations (nom, machine, declarees, capacites, cloisonnee, sorte, joignable, statut, presentee_le, acceptee_le)
             VALUES (?, ?, ?, '[]', ?, ?, 1, 'en-attente', ?, NULL)
             ON CONFLICT (nom) DO UPDATE SET machine = excluded.machine, declarees = excluded.declarees, capacites = '[]',
               cloisonnee = excluded.cloisonnee, sorte = excluded.sorte, joignable = 1, statut = 'en-attente', presentee_le = excluded.presentee_le, acceptee_le = NULL`,
            nom,
            machine,
            JSON.stringify(capacites),
            Number(cloisonnee),
            sorte,
            instant,
          );
        }
        return station(nom);
      });
    },
    accepter(nom, { capacites } = {}) {
      const reconnues = capacites === undefined ? null : lireCapacites(capacites);
      const instant = maintenant().toISOString();
      return base.transaction(() => {
        const connue = station(nom);
        base.executer(
          "UPDATE stations SET capacites = ?, statut = 'acceptee', acceptee_le = ? WHERE nom = ?",
          JSON.stringify(reconnues ?? connue.declarees),
          connue.accepteeLe ?? instant,
          nom,
        );
        return station(nom);
      });
    },
    joignable(nom, joignable) {
      return base.transaction(() => {
        station(nom);
        base.executer("UPDATE stations SET joignable = ? WHERE nom = ?", Number(joignable), nom);
        return station(nom);
      });
    },
    retirer(nom) {
      return base.transaction(() => {
        const retiree = station(nom);
        base.executer("DELETE FROM stations WHERE nom = ?", nom);
        return retiree;
      });
    },
    lire: (nom) => {
      const lue = rangee(nom);
      return lue ? versStation(lue) : null;
    },
    liste: () => base.lire<Rangee>("SELECT * FROM stations ORDER BY nom").map(versStation),
    utilisables(demande = []) {
      const voulues = demande.map((voulue) => nomDeCapacite(voulue.trim()));
      return base
        .lire<Rangee>("SELECT * FROM stations WHERE statut = 'acceptee' ORDER BY nom")
        .map(versStation)
        .filter((acceptee) => acceptee.cuisine && fournitTout(acceptee.capacites, voulues));
    },
    fermer: () => base.fermer(),
  };
}
