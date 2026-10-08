// Les stations : ce que chacune annonce, ce qui l'empêche de servir, et les
// cooks qu'elle a lancés. C'est ici que le chef lit ce qu'il paie — chaque cook
// avec son calibrage et ce qu'il a consommé.
//
// Le temps n'entre pas ici : un quota « épuisé jusqu'à 15 h » le reste dans la
// table après 15 h, c'est le lecteur qui compare à l'heure qu'il est.
import type { Base } from "../base.ts";
import type { FaitGardeFous } from "../evenements/garde-fous.ts";
import type { FaitStation } from "../evenements/station.ts";
import { definirProjection } from "../projection.ts";

export type EtatStation = {
  station: string;
  engine: string;
  provides: string[];
  maxCooks: number;
  announcedAt: string;
  // Non nuls : le quota est épuisé jusqu'à cette heure, la connexion a expiré.
  quotaUntil: string | null;
  quotaReason: string | null;
  disconnectedAt: string | null;
  disconnectedReason: string | null;
};

export type CookDeStation = {
  run: string;
  ticket: number | null;
  model: string | null;
  effort: string | null;
  branch: string | null;
  launchedAt: string;
  endedAt: string | null;
  // La fin dite par la station (`done`, `failed`, `86`, `disconnected`) ou, à
  // défaut, celle que les garde-fous ont notée.
  ending: string | null;
  turns: number | null;
  tokens: number | null;
  durationMs: number | null;
  pr: string | null;
};

type Ecoutes =
  | FaitStation
  | Extract<FaitGardeFous, { type: "cook.launched" | "cook.exited" | "cook.interrupted" | "kitchen.resumed" }>;

const texte = (valeur: unknown): valeur is string => typeof valeur === "string" && valeur !== "";
const texteOuRien = (valeur: unknown) => (texte(valeur) ? valeur : null);

// Une station entre dans la table au premier fait qui la nomme : un quota
// épuisé ou une déconnexion valent même si l'annonce s'est perdue.
const modifier = (base: Base, station: unknown, at: string, affectation: string, ...parametres: Array<string | number | null>) => {
  if (!texte(station)) return;
  base.executer("INSERT OR IGNORE INTO stations (station, engine, provides, max_cooks, announced_at) VALUES (?, '', '[]', 0, ?)", station, at);
  base.executer(`UPDATE stations SET ${affectation} WHERE station = ?`, ...parametres, station);
};

export const stations = definirProjection<Ecoutes>({
  nom: "stations",
  tables: ["stations", "station_cooks"],
  schema: `
    CREATE TABLE IF NOT EXISTS stations (
      station             TEXT PRIMARY KEY,
      engine              TEXT NOT NULL,
      provides            TEXT NOT NULL,
      max_cooks           INTEGER NOT NULL,
      announced_at        TEXT NOT NULL,
      quota_until         TEXT,
      quota_reason        TEXT,
      disconnected_at     TEXT,
      disconnected_reason TEXT
    ) STRICT;
    CREATE TABLE IF NOT EXISTS station_cooks (
      run          TEXT PRIMARY KEY,
      station      TEXT NOT NULL,
      ticket       INTEGER,
      model        TEXT,
      effort       TEXT,
      branch       TEXT,
      launched_seq INTEGER NOT NULL,
      launched_at  TEXT NOT NULL,
      ended_at     TEXT,
      ending       TEXT,
      turns        INTEGER,
      tokens       INTEGER,
      duration_ms  INTEGER,
      pr           TEXT
    ) STRICT;
  `,
  sur: {
    "station.announced": (base, { at, payload }) => {
      modifier(
        base,
        payload.station,
        at,
        "engine = ?, provides = ?, max_cooks = ?, announced_at = ?",
        String(payload.engine),
        JSON.stringify(Array.isArray(payload.provides) ? payload.provides : []),
        Number.isSafeInteger(payload.maxCooks) ? payload.maxCooks : 0,
        at,
      );
    },
    "station.86": (base, { at, payload }) => {
      modifier(base, payload.station, at, "quota_until = ?, quota_reason = ?", texteOuRien(payload.until), texteOuRien(payload.reason));
    },
    "station.disconnected": (base, { at, payload }) => {
      modifier(base, payload.station, at, "disconnected_at = ?, disconnected_reason = ?", at, texteOuRien(payload.reason));
    },
    // « reprendre » : le chef tient la connexion pour rétablie.
    "kitchen.resumed": (base) => {
      base.executer("UPDATE stations SET disconnected_at = NULL, disconnected_reason = NULL");
    },
    "cook.launched": (base, evenement) => {
      const { run, station, model, effort, branch } = evenement.payload;
      // Un cook lancé sans station n'appartient à aucune.
      if (!texte(run) || !texte(station)) return;
      base.executer(
        `INSERT OR REPLACE INTO station_cooks (run, station, ticket, model, effort, branch, launched_seq, launched_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        run,
        station,
        evenement.ticket,
        texteOuRien(model),
        texteOuRien(effort),
        texteOuRien(branch),
        evenement.seq,
        evenement.at,
      );
    },
    "cook.exited": (base, { at, payload }) => {
      const entier = (valeur: unknown) => (Number.isSafeInteger(valeur) ? (valeur as number) : null);
      base.executer(
        "UPDATE station_cooks SET ended_at = ?, ending = ?, turns = ?, tokens = ?, duration_ms = ? WHERE run = ?",
        at,
        texteOuRien(payload.outcome),
        entier(payload.turns),
        entier(payload.tokens),
        entier(payload.durationMs),
        texteOuRien(payload.run),
      );
    },
    "cook.interrupted": (base, { at, payload }) => {
      base.executer("UPDATE station_cooks SET ended_at = ?, ending = 'interrupted' WHERE run = ?", at, texteOuRien(payload.run));
    },
    "cook.reported": (base, { payload }) => {
      base.executer("UPDATE station_cooks SET ending = ?, pr = ? WHERE run = ?", texteOuRien(payload.ending), texteOuRien(payload.pr), texteOuRien(payload.run));
    },
  },
});

export function etatStation(base: Base, station: string): EtatStation | null {
  const ligne = base.lire<Omit<EtatStation, "provides"> & { provides: string }>(
    `SELECT station, engine, provides, max_cooks AS maxCooks, announced_at AS announcedAt,
            quota_until AS quotaUntil, quota_reason AS quotaReason,
            disconnected_at AS disconnectedAt, disconnected_reason AS disconnectedReason
     FROM stations WHERE station = ?`,
    station,
  )[0];
  return ligne ? { ...ligne, provides: JSON.parse(ligne.provides) } : null;
}

// Les derniers cooks de la station, le plus récent d'abord.
export function cooksDeStation(base: Base, station: string, combien: number): CookDeStation[] {
  return base.lire<CookDeStation>(
    `SELECT run, ticket, model, effort, branch, launched_at AS launchedAt, ended_at AS endedAt, ending,
            turns, tokens, duration_ms AS durationMs, pr
     FROM station_cooks WHERE station = ? ORDER BY launched_seq DESC LIMIT ?`,
    station,
    combien,
  );
}

// Ce qu'un cook a coûté, par son run — ou null si aucune station ne l'a lancé.
export function cookDeRun(base: Base, run: string): CookDeStation | null {
  return (
    base.lire<CookDeStation>(
      `SELECT run, ticket, model, effort, branch, launched_at AS launchedAt, ended_at AS endedAt, ending,
              turns, tokens, duration_ms AS durationMs, pr
       FROM station_cooks WHERE run = ?`,
      run,
    )[0] ?? null
  );
}

// Les stations dont la connexion a expiré, et que le chef n'a pas fait reprendre.
export function stationsDeconnectees(base: Base): string[] {
  return base.lire<{ station: string }>("SELECT station FROM stations WHERE disconnected_at IS NOT NULL ORDER BY station").map((ligne) => ligne.station);
}

export function stationsAnnoncees(base: Base): string[] {
  return base.lire<{ station: string }>("SELECT station FROM stations ORDER BY station").map((ligne) => ligne.station);
}
