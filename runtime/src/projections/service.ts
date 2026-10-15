// Les serveurs des worktrees : ceux qui tournent, chacun avec son worktree, son
// port et son état, et ce qui empêche le projet d'être servi. C'est ici que
// `station` et `status` lisent ce qui est allumé.
//
// Un serveur ne survit pas à son runtime : une vie qui commence n'en a aucun,
// quoi que la précédente ait eu le temps d'écrire.
import type { Base } from "../base.ts";
import { pageDeLEcran, type EcranARegarder } from "../ecran.ts";
import type { FaitRuntime } from "../evenements/runtime.ts";
import type { FaitService } from "../evenements/service.ts";
import type { FaitStation } from "../evenements/station.ts";
import { definirProjection } from "../projection.ts";

// `starting` : la commande est lancée, son port ne répond pas encore.
// `listening` : il répond.
export type EtatDeServeur = "starting" | "listening";

export type Serveur = {
  ticket: number;
  station: string;
  run: string;
  // Relatif au répertoire d'état.
  worktree: string;
  branch: string;
  port: number;
  pid: number;
  state: EtatDeServeur;
  startedAt: string;
  // Depuis quand il est dans cet état.
  since: string;
  // L'écran à regarder de la livraison servie, ou null : elle n'en a pas.
  ecran: EcranARegarder | null;
};

// Ce qui empêche le projet d'être servi, tel que la dernière livraison l'a
// trouvé. `ticket` : cette livraison.
export type ServiceIndisponible = { station: string; ticket: number | null; declared: boolean; why: string; since: string };

// Chaque état tel que le chef le lit.
const ETATS: Record<EtatDeServeur, string> = { starting: "démarre", listening: "écoute" };

export const direEtatDeServeur = (etat: EtatDeServeur) => ETATS[etat];

// Ce que `station` et `status` disent de la page d'un serveur : celle de
// l'écran à regarder, ou pourquoi il n'y en a aucune — jamais la racine.
export function direPage({ port, ecran }: Pick<Serveur, "port" | "ecran">): string {
  const page = pageDeLEcran(port, ecran);
  if (page !== null) return page;
  return ecran === null ? "aucune page à ouvrir : la livraison ne dit aucun écran, et n'en touche aucun que le projet déclare" : `aucune page à ouvrir : l'écran « ${ecran.ecran} » n'est pas une route`;
}

// Ce que `station` et `status` disent d'un projet qui ne peut pas être servi :
// le motif, tel que `service.ts` l'a écrit.
export const direServiceIndisponible = ({ declared, why, ticket }: ServiceIndisponible) =>
  `${declared ? "NON SERVABLE" : "NON DÉCLARÉ"} — ${why}${ticket === null ? "" : ` (livraison du ticket #${ticket})`} ; aucun serveur n'est lancé`;

type Ecoutes = FaitService | Extract<FaitRuntime, { type: "runtime.started" }> | Extract<FaitStation, { type: "station.withdrawn" }>;

const texte = (valeur: unknown): valeur is string => typeof valeur === "string" && valeur !== "";
const port = (valeur: unknown): valeur is number => Number.isSafeInteger(valeur) && (valeur as number) >= 1 && (valeur as number) <= 65535;

export const service = definirProjection<Ecoutes>({
  nom: "service",
  tables: ["service_servers", "service_unavailable"],
  schema: `
    CREATE TABLE IF NOT EXISTS service_servers (
      worktree   TEXT PRIMARY KEY,
      ticket     INTEGER NOT NULL,
      station    TEXT NOT NULL,
      run        TEXT NOT NULL,
      branch     TEXT NOT NULL,
      port       INTEGER NOT NULL,
      pid        INTEGER NOT NULL,
      state      TEXT NOT NULL CHECK (state IN ('starting', 'listening')),
      started_at TEXT NOT NULL,
      since      TEXT NOT NULL,
      screen     TEXT,
      sentence   TEXT,
      source     TEXT CHECK (source IN ('declare', 'deduit'))
    ) STRICT;
    CREATE TABLE IF NOT EXISTS service_unavailable (
      station  TEXT PRIMARY KEY,
      ticket   INTEGER,
      declared INTEGER NOT NULL,
      why      TEXT NOT NULL,
      since    TEXT NOT NULL
    ) STRICT;
  `,
  sur: {
    "runtime.started": (base) => {
      base.executer("DELETE FROM service_servers");
    },
    // Un fait illisible est ignoré : lever ici empêcherait le runtime de redémarrer.
    "service.started": (base, { ticket, at, payload }) => {
      const { station, run, worktree, branch, pid } = payload;
      if (ticket === null || !texte(station) || !texte(run) || !texte(worktree) || !texte(branch) || !port(payload.port) || !Number.isSafeInteger(pid)) return;
      // Un écran illisible n'en est pas un : le serveur reste, sans page.
      const ecran = payload.screen;
      const lisible = texte(ecran?.name) && (ecran.source === "declare" || ecran.source === "deduit");
      base.executer(
        `INSERT OR REPLACE INTO service_servers (worktree, ticket, station, run, branch, port, pid, state, started_at, since, screen, sentence, source)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'starting', ?, ?, ?, ?, ?)`,
        worktree,
        ticket,
        station,
        run,
        branch,
        payload.port,
        pid,
        at,
        at,
        lisible ? ecran.name : null,
        lisible && texte(ecran.sentence) ? ecran.sentence : null,
        lisible ? ecran.source : null,
      );
    },
    "service.listening": (base, { at, payload }) => {
      if (texte(payload.worktree)) base.executer("UPDATE service_servers SET state = 'listening', since = ? WHERE worktree = ? AND state = 'starting'", at, payload.worktree);
    },
    "service.stopped": (base, { payload }) => {
      if (texte(payload.worktree)) base.executer("DELETE FROM service_servers WHERE worktree = ?", payload.worktree);
    },
    "service.unavailable": (base, { at, payload }) => {
      if (!texte(payload.station) || !texte(payload.why)) return;
      base.executer(
        "INSERT OR REPLACE INTO service_unavailable (station, ticket, declared, why, since) VALUES (?, ?, ?, ?, ?)",
        payload.station,
        Number.isSafeInteger(payload.delivery) ? payload.delivery : null,
        payload.declared === true ? 1 : 0,
        payload.why,
        at,
      );
    },
    "service.available": (base, { payload }) => {
      if (texte(payload.station)) base.executer("DELETE FROM service_unavailable WHERE station = ?", payload.station);
    },
    // Une station que le projet ne déclare plus ne sert plus rien : ce qui
    // l'en empêchait n'a plus à se dire.
    "station.withdrawn": (base, { payload }) => {
      if (texte(payload.station)) base.executer("DELETE FROM service_unavailable WHERE station = ?", payload.station);
    },
  },
});

const COLONNES = "ticket, station, run, worktree, branch, port, pid, state, started_at AS startedAt, since, screen, sentence, source";

type Ligne = Omit<Serveur, "ecran"> & { screen: string | null; sentence: string | null; source: EcranARegarder["source"] | null };

// Les serveurs qui tournent, par ticket. `station` : ceux de cette station
// seulement.
export function serveursEnCours(base: Base, station?: string): Serveur[] {
  const lignes =
    station === undefined
      ? base.lire<Ligne>(`SELECT ${COLONNES} FROM service_servers ORDER BY ticket, worktree`)
      : base.lire<Ligne>(`SELECT ${COLONNES} FROM service_servers WHERE station = ? ORDER BY ticket, worktree`, station);
  return lignes.map(({ screen, sentence, source, ...serveur }) => ({ ...serveur, ecran: screen === null || source === null ? null : { ecran: screen, phrase: sentence, source } }));
}

// Ce qui empêche le projet d'être servi, station par station — rien, le plus
// souvent. `station` : ce qu'en dit cette station seulement.
export function servicesIndisponibles(base: Base, station?: string): ServiceIndisponible[] {
  return base
    .lire<Omit<ServiceIndisponible, "declared"> & { declared: number }>("SELECT station, ticket, declared, why, since FROM service_unavailable ORDER BY station")
    .filter((ligne) => station === undefined || ligne.station === station)
    .map((ligne) => ({ ...ligne, declared: ligne.declared === 1 }));
}
