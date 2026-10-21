// The stations: what each announces, what keeps it from serving, and the
// cooks it launched. This is where the chef reads what he pays — each cook
// with its calibration and what it consumed.
//
// Time does not enter here: a quota "exhausted until 3 pm" stays so in the
// table after 3 pm, it is the reader who compares with the current time.
import type { Base } from "../base.ts";
import { geste } from "../geste.ts";
import type { FaitDistante } from "../events/remote.ts";
import type { FaitGardeFous } from "../events/guardrails.ts";
import type { FaitRenouvellement } from "../events/renewal.ts";
import type { FaitStation, Manque, Ressource, Retenue } from "../events/station.ts";
import { definirProjection } from "../projection.ts";

export type EtatStation = {
  station: string;
  engine: string;
  provides: string[];
  // The cap on cooks the station declares: a ceiling on its default cap.
  maxCooks: number;
  // The cores of the machine under it, as it announced them — null: unknown,
  // a remote station's workstation is not seen from the box. Its default cap
  // derives from them.
  cores: number | null;
  // The cap set by the chef — 0: no limit —, or null if he has said nothing.
  cap: number | null;
  announcedAt: string;
  // Non-null: the quota is exhausted until that time, the connection has expired.
  quotaUntil: string | null;
  quotaReason: string | null;
  disconnectedAt: string | null;
  disconnectedReason: string | null;
  // Non-null: the machine can take no more since that instant, and what it
  // lacks first (see `station.saturated`).
  saturatedAt: string | null;
  saturatedResource: Ressource | null;
  saturatedObserved: number | null;
  saturatedLimit: number | null;
  // Every resource it lacks, the first one included, in order — empty while
  // it holds.
  saturatedCauses: Manque[];
  // Non-null: tickets could leave, and the station does not take them since
  // that instant, for that reason (see `station.held`).
  heldAt: string | null;
  heldReason: Retenue | null;
  // Non-null: the arbiter between projects has been unreachable since that
  // instant, and the station runs only one cook at a time (see `station.unarbitrated`).
  unarbitratedAt: string | null;
  unarbitratedReason: string | null;
  // True: it does not run on this machine, it pulls its work.
  remote: boolean;
  // Of a remote station: its latest sign of life, and since when it has been
  // present — null: absent, it has shown no sign, or no longer since the
  // presence delay (see `station.absent`).
  seenAt: string | null;
  presentSince: string | null;
  // True: remote, the chef has it take ordinary tickets too, in its
  // workstation's sandbox.
  ordinary: boolean;
  // True: remote and ordinary, it takes them alongside the stations of this
  // machine, without waiting for them to be saturated — one more station of
  // the project, not a backup. Optional in the type only: `etatStation`
  // always sets it, and a reader built before it (the app's tests) omits it.
  alongside?: boolean;
  // What it said about this sandbox, the last time it changed, and when.
  // Null: it never said anything about it.
  sandbox: { available: boolean; reason: string | null; version: string | null; at: string } | null;
};

export type CookDeStation = {
  run: string;
  ticket: number | null;
  model: string | null;
  effort: string | null;
  branch: string | null;
  // Relative to the state directory.
  worktree: string | null;
  launchedAt: string;
  endedAt: string | null;
  // The ending said by the station (`done`, `failed`, `86`, `disconnected`, `refused`) or, by
  // default, the one the guardrails noted.
  ending: string | null;
  turns: number | null;
  tokens: number | null;
  durationMs: number | null;
  pr: string | null;
};

type Ecoutes =
  | FaitStation
  | Extract<FaitGardeFous, { type: "cook.launched" | "cook.exited" | "cook.interrupted" | "kitchen.resumed" }>
  | Extract<FaitDistante, { type: "remote.asked" }>
  | Extract<FaitRenouvellement, { type: "session.restored" }>;

const texte = (valeur: unknown): valeur is string => typeof valeur === "string" && valeur !== "";
const texteOuRien = (valeur: unknown) => (texte(valeur) ? valeur : null);
const RESSOURCES: unknown[] = ["cpu", "memory", "disk"] satisfies Ressource[];

// A lacking resource as a fact says it, or null if it is unreadable. Where its
// minimum comes from is kept only when it reads.
function manque(valeur: unknown): Manque | null {
  if (typeof valeur !== "object" || valeur === null) return null;
  const { resource, observed, limit, limitFrom } = valeur as Record<string, unknown>;
  if (!RESSOURCES.includes(resource) || !Number.isFinite(observed) || !Number.isFinite(limit)) return null;
  const total = typeof limitFrom === "object" && limitFrom !== null ? (limitFrom as Record<string, unknown>).totalMb : undefined;
  const origine = limitFrom === "env" ? { limitFrom: "env" as const } : Number.isFinite(total) ? { limitFrom: { totalMb: Number(total) } } : {};
  return { resource: resource as Ressource, observed: Number(observed), limit: Number(limit), ...origine };
}

// Each hold as the chef reads it.
const RETENUES: Record<Retenue, string> = {
  stopped: "cuisine arrêtée par le chef",
  "station-stopped": "cuisine du projet arrêtée par le chef sur cette station, ses cooks en cours finissent",
  breaker: "disjoncteur ouvert",
  paused: "cuisine en pause pour le renommage du code",
  deploy: "mise en service demandée, la cuisine se vide avant le redémarrage",
  base: "base d'intégration rouge",
  disconnected: "connexion Max expirée",
  quota: "quota épuisé (86)",
  cap: "plafond de cooks atteint",
  setups: "plafond de setups atteint",
  aside: "une même cause met de côté les tickets du projet : un seul est repris à la fois, pour voir si elle a changé",
  setup: "setup du projet en échec à l'identique, aucun setup n'est lancé tant que la branche d'intégration ne bouge pas",
  machine: "machine saturée",
  ramp: "montée progressive, les cooks tout juste partis pèsent d'avance",
  arbiter: "l'arbitre entre projets garde la place pour un autre projet",
  unarbitrated: "arbitre injoignable, un seul cook à la fois",
};

export const direRetenueDeStation = (raison: Retenue) => RETENUES[raison];

// The same, in English: what `status` says.
const RETENUES_EN: Record<Retenue, string> = {
  stopped: "kitchen stopped by the chef",
  "station-stopped": "the project's cooking stopped by the chef on this station, its running cooks finish",
  breaker: "breaker open",
  paused: "kitchen paused for the code rename",
  deploy: "deploy requested, the kitchen empties before the restart",
  base: "integration base red",
  disconnected: "Max connection expired",
  quota: "quota exhausted (86)",
  cap: "cooks cap reached",
  setups: "setups cap reached",
  aside: "one same cause sets the project's tickets aside: only one is taken again at a time, to see whether it has changed",
  setup: "project setup failing identically, no setup is launched as long as the integration branch does not move",
  machine: "machine saturated",
  ramp: "gradual ramp-up, cooks that have just left weigh in advance",
  arbiter: "the arbiter between projects keeps the room for another project",
  unarbitrated: "arbiter unreachable, one cook at a time",
};

export const direRetenueDeStationEn = (raison: Retenue) => RETENUES_EN[raison];

// The reason for a disconnection observed at start: the service's account
// was never connected.
export const SANS_CONNEXION = "not-logged-in";
// The missing Max connection, as the chef reads it: absent when the start
// did not find it, expired when it dropped along the way.
export const direDeconnexion = (raison: string | null) => (raison === SANS_CONNEXION || raison?.startsWith("binaire introuvable") ? "absente" : "expirée");
export const GESTE_DE_CONNEXION = `\`claude /login\` sous le compte du service, puis \`${geste("guardrails resume")}\``;
// The gesture for an already dropped connection: the only one, `claude /login` — the kitchen
// starts again on its own at the first successful pass of the renewal (`session.restored`),
// within the minute. "resume" stays for the other stops.
export const GESTE_DE_CONNEXION_TOMBEE = "`claude /login` sous le compte du service — la cuisine reprend seule dans la minute, sans « resume »";
// The same, in English: what the `awaiting` block of `status` says.
export const direDeconnexionEn = (raison: string | null) => (direDeconnexion(raison) === "absente" ? "missing" : "expired");
export const GESTE_DE_CONNEXION_EN = `\`claude /login\` under the service account, then \`${geste("guardrails resume")}\``;
export const GESTE_DE_CONNEXION_TOMBEE_EN = "`claude /login` under the service account — the kitchen starts again on its own within the minute, without “resume”";
// The dropped Max connection, said from one place: `run installation` quotes it
// as is (`station` says it in English, below, from the same fact).
export const direConnexionTombee = (etat: Pick<EtatStation, "disconnectedAt" | "disconnectedReason">) =>
  `EXPIRÉE depuis le ${etat.disconnectedAt} (${etat.disconnectedReason}) — plus aucun ticket n'est pris ; \`claude /login\` sous le compte du service — la cuisine reprend seule dans la minute`;

// The same, in English: what `station` says.
export const direConnexionTombeeEn = (etat: Pick<EtatStation, "disconnectedAt" | "disconnectedReason">) =>
  `EXPIRED since ${etat.disconnectedAt} (${etat.disconnectedReason}) — no ticket is taken any more; ${GESTE_DE_CONNEXION_TOMBEE_EN}`;

// A station enters the table at the first fact that names it: an exhausted
// quota or a disconnection holds even if the announcement was lost.
const modifier = (base: Base, station: unknown, at: string, affectation: string, ...parametres: Array<string | number | null>) => {
  if (!texte(station)) return;
  base.executer("INSERT OR IGNORE INTO stations (station, engine, provides, max_cooks, announced_at) VALUES (?, '', '[]', 0, ?)", station, at);
  base.executer(`UPDATE stations SET ${affectation} WHERE station = ?`, ...parametres, station);
};

export const stations = definirProjection<Ecoutes>({
  nom: "stations",
  tables: ["stations", "station_cooks", "stations_undeclared", "setup_du_projet", "mise_de_cote_du_projet", "stations_arretees"],
  schema: `
    CREATE TABLE IF NOT EXISTS stations (
      station             TEXT PRIMARY KEY,
      engine              TEXT NOT NULL,
      provides            TEXT NOT NULL,
      max_cooks           INTEGER NOT NULL,
      cores               INTEGER,
      cap                 INTEGER,
      announced_at        TEXT NOT NULL,
      quota_until         TEXT,
      quota_reason        TEXT,
      disconnected_at     TEXT,
      disconnected_reason TEXT,
      saturated_at        TEXT,
      saturated_resource  TEXT,
      saturated_observed  REAL,
      saturated_limit     REAL,
      saturated_causes    TEXT,
      held_at            TEXT,
      held_reason         TEXT,
      unarbitrated_at     TEXT,
      unarbitrated_reason TEXT,
      remote              INTEGER NOT NULL DEFAULT 0,
      seen_at             TEXT,
      present_since       TEXT,
      ordinary            INTEGER NOT NULL DEFAULT 0,
      alongside           INTEGER NOT NULL DEFAULT 0,
      sandbox_available   INTEGER,
      sandbox_reason      TEXT,
      sandbox_version     TEXT,
      sandbox_at          TEXT
    ) STRICT;
    CREATE TABLE IF NOT EXISTS stations_undeclared (
      id    INTEGER PRIMARY KEY CHECK (id = 1),
      since TEXT NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS setup_du_projet (
      id             INTEGER PRIMARY KEY CHECK (id = 1),
      last_why       TEXT,
      last_hosts     TEXT,
      blocked_at     TEXT,
      blocked_why    TEXT,
      blocked_hosts  TEXT,
      blocked_base   TEXT,
      blocked_ticket INTEGER,
      blocked_by     TEXT
    ) STRICT;
    CREATE TABLE IF NOT EXISTS mise_de_cote_du_projet (
      id             INTEGER PRIMARY KEY CHECK (id = 1),
      last_reason    TEXT,
      blocked_at     TEXT,
      blocked_reason TEXT,
      blocked_base   TEXT,
      blocked_ticket INTEGER,
      blocked_by     TEXT
    ) STRICT;
    CREATE TABLE IF NOT EXISTS stations_arretees (
      station TEXT PRIMARY KEY,
      since   TEXT NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS station_cooks (
      run          TEXT PRIMARY KEY,
      station      TEXT NOT NULL,
      ticket       INTEGER,
      model        TEXT,
      effort       TEXT,
      branch       TEXT,
      worktree     TEXT,
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
        "engine = ?, provides = ?, max_cooks = ?, cores = ?, announced_at = ?, remote = ?, ordinary = ?, alongside = ?",
        String(payload.engine),
        JSON.stringify(Array.isArray(payload.provides) ? payload.provides : []),
        Number.isSafeInteger(payload.maxCooks) ? payload.maxCooks : 0,
        Number.isSafeInteger(payload.cores) && Number(payload.cores) > 0 ? Number(payload.cores) : null,
        at,
        payload.remote === true ? 1 : 0,
        payload.ordinary === true ? 1 : 0,
        payload.alongside === true ? 1 : 0,
      );
      if (texte(payload.station)) base.executer("DELETE FROM stations_undeclared");
    },
    // What held it leaves with it; its cooks stay in the record.
    "station.withdrawn": (base, { payload }) => {
      if (texte(payload.station)) base.executer("DELETE FROM stations WHERE station = ?", payload.station);
    },
    // Only a station the project declares has a presence: a request made
    // under another name creates nobody.
    "remote.asked": (base, { at, payload }) => {
      if (texte(payload.station)) base.executer("UPDATE stations SET seen_at = ? WHERE station = ? AND remote = 1", at, payload.station);
    },
    "station.present": (base, { at, payload }) => {
      if (texte(payload.station)) base.executer("UPDATE stations SET present_since = ?, seen_at = coalesce(seen_at, ?) WHERE station = ?", at, at, payload.station);
    },
    "station.sandbox": (base, { at, payload }) => {
      if (typeof payload.available !== "boolean") return;
      modifier(
        base,
        payload.station,
        at,
        "sandbox_available = ?, sandbox_reason = ?, sandbox_version = ?, sandbox_at = ?",
        payload.available ? 1 : 0,
        texteOuRien(payload.reason),
        texteOuRien(payload.version),
        at,
      );
    },
    "station.absent": (base, { payload }) => {
      if (texte(payload.station)) base.executer("UPDATE stations SET present_since = NULL WHERE station = ?", payload.station);
    },
    "stations.undeclared": (base, { at }) => {
      base.executer("INSERT OR IGNORE INTO stations_undeclared (id, since) VALUES (1, ?)", at);
    },
    "station.capped": (base, { at, payload }) => {
      if (payload.maxCooks === null) modifier(base, payload.station, at, "cap = NULL");
      else if (Number.isSafeInteger(payload.maxCooks) && payload.maxCooks >= 0) modifier(base, payload.station, at, "cap = ?", payload.maxCooks);
    },
    // Outside the stations table: a stop falls neither with an announcement nor
    // with a withdrawal — the station declared again stays stopped.
    "station.stopped": (base, { at, payload }) => {
      if (texte(payload.station)) base.executer("INSERT OR IGNORE INTO stations_arretees (station, since) VALUES (?, ?)", payload.station, at);
    },
    "station.started": (base, { payload }) => {
      if (texte(payload.station)) base.executer("DELETE FROM stations_arretees WHERE station = ?", payload.station);
    },
    "station.saturated": (base, { at, payload }) => {
      const premier = manque(payload);
      if (premier === null) return;
      const autres = Array.isArray(payload.also) ? payload.also.map(manque).filter((autre) => autre !== null) : [];
      const { resource, observed, limit } = premier;
      modifier(
        base,
        payload.station,
        at,
        "saturated_at = ?, saturated_resource = ?, saturated_observed = ?, saturated_limit = ?, saturated_causes = ?",
        at,
        resource,
        observed,
        limit,
        JSON.stringify([premier, ...autres]),
      );
    },
    "station.relieved": (base, { at, payload }) => {
      modifier(base, payload.station, at, "saturated_at = NULL, saturated_resource = NULL, saturated_observed = NULL, saturated_limit = NULL, saturated_causes = NULL");
    },
    "station.held": (base, { at, payload }) => {
      if (Object.hasOwn(RETENUES, payload.reason)) modifier(base, payload.station, at, "held_at = ?, held_reason = ?", at, payload.reason);
    },
    "station.released": (base, { at, payload }) => {
      modifier(base, payload.station, at, "held_at = NULL, held_reason = NULL");
    },
    "station.unarbitrated": (base, { at, payload }) => {
      modifier(base, payload.station, at, "unarbitrated_at = ?, unarbitrated_reason = ?", at, texteOuRien(payload.reason));
    },
    "station.arbitrated": (base, { at, payload }) => {
      modifier(base, payload.station, at, "unarbitrated_at = NULL, unarbitrated_reason = NULL");
    },
    "station.86": (base, { at, payload }) => {
      modifier(base, payload.station, at, "quota_until = ?, quota_reason = ?", texteOuRien(payload.until), texteOuRien(payload.reason));
    },
    "station.disconnected": (base, { at, payload }) => {
      modifier(base, payload.station, at, "disconnected_at = ?, disconnected_reason = ?", at, texteOuRien(payload.reason));
    },
    // "resume": the chef considers the connection restored.
    "kitchen.resumed": (base) => {
      base.executer("UPDATE stations SET disconnected_at = NULL, disconnected_reason = NULL");
    },
    // The renewal saw the connection come back: the lifting happens on its own.
    "session.restored": (base, { payload }) => {
      for (const station of payload.stations) base.executer("UPDATE stations SET disconnected_at = NULL, disconnected_reason = NULL WHERE station = ?", station);
    },
    "cook.launched": (base, evenement) => {
      const { run, station, model, effort, branch, worktree } = evenement.payload;
      // A cook launched without a station belongs to none.
      if (!texte(run) || !texte(station)) return;
      // A setup from here has just passed: the earlier failure is not the one
      // that precedes the next. A remote station's ran elsewhere.
      base.executer("UPDATE setup_du_projet SET last_why = NULL, last_hosts = NULL WHERE NOT EXISTS (SELECT 1 FROM stations WHERE station = ? AND remote = 1)", station);
      // Likewise for the cause of an aside: a cook has left, the
      // project is no longer on the same one.
      // And a cook leaving is the cause lifted: the block falls with it.
      base.executer(
        "UPDATE mise_de_cote_du_projet SET last_reason = NULL, blocked_at = NULL, blocked_reason = NULL, blocked_base = NULL, blocked_ticket = NULL, blocked_by = NULL",
      );
      base.executer(
        `INSERT OR REPLACE INTO station_cooks (run, station, ticket, model, effort, branch, worktree, launched_seq, launched_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        run,
        station,
        evenement.ticket,
        texteOuRien(model),
        texteOuRien(effort),
        texteOuRien(branch),
        texteOuRien(worktree),
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
    // A signal for the chef, read in the log and on the issue: it changes nothing
    // about what the station knows of a cook.
    "cook.out-of-zone": () => {},
    // Likewise: `status` reads the time without progress on the rail.
    "cook.stalled": () => {},
    // Likewise: the ticket is 86 on the rail, and that is where `status` reads it.
    "secrets.unavailable": () => {},
    // Likewise: the failure it ends is read from the log (`echec-du-worktree.ts`).
    "worktree.prepared": () => {},
    // The issue says it; here only the cause counts, the one the
    // next failure is compared with.
    "setup.failed": (base, { payload }) => {
      if (!texte(payload.why)) return;
      base.executer("INSERT OR IGNORE INTO setup_du_projet (id) VALUES (1)");
      base.executer("UPDATE setup_du_projet SET last_why = ?, last_hosts = ?", payload.why, JSON.stringify(hotes(payload.hosts)));
    },
    "setup.blocked": (base, { at, ticket, payload }) => {
      if (!texte(payload.why) || !texte(payload.base)) return;
      const hosts = JSON.stringify(hotes(payload.hosts));
      base.executer("INSERT OR IGNORE INTO setup_du_projet (id) VALUES (1)");
      base.executer(
        "UPDATE setup_du_projet SET last_why = ?, last_hosts = ?, blocked_at = ?, blocked_why = ?, blocked_hosts = ?, blocked_base = ?, blocked_ticket = ?, blocked_by = ?",
        payload.why,
        hosts,
        at,
        payload.why,
        hosts,
        payload.base,
        ticket,
        texteOuRien(payload.station),
      );
    },
    "aside.failed": (base, { payload }) => {
      if (!texte(payload.reason)) return;
      base.executer("INSERT OR IGNORE INTO mise_de_cote_du_projet (id) VALUES (1)");
      base.executer("UPDATE mise_de_cote_du_projet SET last_reason = ?", payload.reason);
    },
    "aside.blocked": (base, { at, ticket, payload }) => {
      if (!texte(payload.reason) || !texte(payload.base)) return;
      base.executer("INSERT OR IGNORE INTO mise_de_cote_du_projet (id) VALUES (1)");
      base.executer(
        "UPDATE mise_de_cote_du_projet SET last_reason = ?, blocked_at = ?, blocked_reason = ?, blocked_base = ?, blocked_ticket = ?, blocked_by = ?",
        payload.reason,
        at,
        payload.reason,
        payload.base,
        ticket,
        texteOuRien(payload.station),
      );
    },
    // `last_reason` stays that of the block when it is the base that moved:
    // the same cause, on the new base, blocks again at once. When the cause
    // changed, it is the new one's `aside.failed` that replaces it.
    "aside.unblocked": (base) => {
      base.executer("UPDATE mise_de_cote_du_projet SET blocked_at = NULL, blocked_reason = NULL, blocked_base = NULL, blocked_ticket = NULL, blocked_by = NULL");
    },
    // The cause stays that of the block: the same failure, on the base that
    // moved, blocks again at once.
    "setup.unblocked": (base) => {
      base.executer("UPDATE setup_du_projet SET blocked_at = NULL, blocked_why = NULL, blocked_hosts = NULL, blocked_base = NULL, blocked_ticket = NULL, blocked_by = NULL");
    },
  },
});

const hotes = (valeur: unknown): string[] => (Array.isArray(valeur) ? valeur.filter(texte) : []);

// The cause of a setup failure: its reason, and what the door refused.
export type CauseDeSetup = { why: string; hosts: string[] };

// The same failure as `avant`: same reason, and no refused host that it has not
// already named. Hosts are not all required: the door does not repeat a host
// within ten minutes, to anyone — a close follow-up attempt keeps quiet about
// the one that made it fail.
export const memeCause = (avant: CauseDeSetup, apres: CauseDeSetup) => avant.why === apres.why && apres.hosts.every((hote) => avant.hosts.includes(hote));

// The cause of the project's latest setup failure, if no setup from here has
// passed since: it is what the next failure is compared with.
export function dernierEchecDeSetup(base: Base): CauseDeSetup | null {
  const ligne = base.lire<{ why: string | null; hosts: string | null }>("SELECT last_why AS why, last_hosts AS hosts FROM setup_du_projet")[0];
  return ligne?.why ? { why: ligne.why, hosts: JSON.parse(ligne.hosts ?? "[]") } : null;
}

// The project's blocked setup: since when, on which cause, by which ticket,
// and the base the worktree had left from — as long as it has not moved, no
// setup is launched. Null: nothing blocks it.
export type SetupBloque = CauseDeSetup & { since: string; base: string; ticket: number | null; station: string | null };

export function setupBloque(base: Base): SetupBloque | null {
  const ligne = base.lire<{ since: string | null; why: string; hosts: string; base: string; ticket: number | null; station: string | null }>(
    "SELECT blocked_at AS since, blocked_why AS why, blocked_hosts AS hosts, blocked_base AS base, blocked_ticket AS ticket, blocked_by AS station FROM setup_du_projet",
  )[0];
  return ligne?.since ? { ...ligne, since: ligne.since, hosts: JSON.parse(ligne.hosts) } : null;
}

type LigneDeStation = Omit<EtatStation, "provides" | "remote" | "ordinary" | "alongside" | "sandbox" | "saturatedCauses"> & {
  provides: string;
  saturatedCauses: string | null;
  remote: number;
  ordinary: number;
  alongside: number;
  sandboxAvailable: number | null;
  sandboxReason: string | null;
  sandboxVersion: string | null;
  sandboxAt: string | null;
};

export function etatStation(base: Base, station: string): EtatStation | null {
  const ligne = base.lire<LigneDeStation>(
    `SELECT station, engine, provides, max_cooks AS maxCooks, cores, cap, announced_at AS announcedAt,
            quota_until AS quotaUntil, quota_reason AS quotaReason,
            disconnected_at AS disconnectedAt, disconnected_reason AS disconnectedReason,
            saturated_at AS saturatedAt, saturated_resource AS saturatedResource,
            saturated_observed AS saturatedObserved, saturated_limit AS saturatedLimit, saturated_causes AS saturatedCauses,
            held_at AS heldAt, held_reason AS heldReason,
            unarbitrated_at AS unarbitratedAt, unarbitrated_reason AS unarbitratedReason,
            remote, seen_at AS seenAt, present_since AS presentSince, ordinary, alongside,
            sandbox_available AS sandboxAvailable, sandbox_reason AS sandboxReason, sandbox_version AS sandboxVersion, sandbox_at AS sandboxAt
     FROM stations WHERE station = ?`,
    station,
  )[0];
  if (!ligne) return null;
  const { sandboxAvailable, sandboxReason, sandboxVersion, sandboxAt, saturatedCauses, ...reste } = ligne;
  return {
    ...reste,
    saturatedCauses: saturatedCauses === null ? [] : JSON.parse(saturatedCauses),
    provides: JSON.parse(ligne.provides),
    remote: ligne.remote === 1,
    ordinary: ligne.ordinary === 1,
    alongside: ligne.alongside === 1,
    sandbox: sandboxAvailable === null || sandboxAt === null ? null : { available: sandboxAvailable === 1, reason: sandboxReason, version: sandboxVersion, at: sandboxAt },
  };
}

// The cap the machine's cores allow: two cores kept for the runtime, the
// pass and its gates, then about two per cook — a cook's `claude`, its tests,
// its setup. The load stays under the core count: 3 on 8 cores, 7 on 16, and
// never less than one cook.
export const plafondDesCoeurs = (coeurs: number): number => Math.max(1, Math.floor((coeurs - 2) / 2));

type ReglesDuPlafond = Pick<EtatStation, "maxCooks" | "cores" | "cap">;

// The cap that holds while the chef has set nothing, and where it comes from:
// the machine's cores, or the declaration when it is lower — or when the
// cores are unknown. Null: no limit.
export function plafondParDefaut({ maxCooks, cores }: ReglesDuPlafond): { plafond: number | null; origine: { coeurs: number } | "declared" } {
  const declare = maxCooks > 0 ? maxCooks : null;
  if (cores === null) return { plafond: declare, origine: "declared" };
  const desCoeurs = plafondDesCoeurs(cores);
  return declare !== null && declare < desCoeurs ? { plafond: declare, origine: "declared" } : { plafond: desCoeurs, origine: { coeurs: cores } };
}

// How many cooks the station runs at once, at most: what the chef set,
// otherwise its default cap. Null: no limit — that is what zero says.
export function plafondDeCooks(etat: ReglesDuPlafond): number | null {
  if (etat.cap !== null) return etat.cap === 0 ? null : etat.cap;
  return plafondParDefaut(etat).plafond;
}

export const direNombreDeCooksEn = (plafond: number | null) => (plafond === null ? "no limit" : `${plafond} at most`);

// The cap as `status` and `station` say it: how many, and where it comes from
// — `3 at most — 8 cores`, `5 at most — set by you, replaces 3 (8 cores)`.
export function direPlafondEn(etat: ReglesDuPlafond): string {
  const defaut = plafondParDefaut(etat);
  const origine = defaut.origine === "declared" ? "declared" : `${defaut.origine.coeurs} cores`;
  if (etat.cap === null) return `${direNombreDeCooksEn(defaut.plafond)} — ${origine}`;
  return `${direNombreDeCooksEn(plafondDeCooks(etat))} — set by you, replaces ${defaut.plafond ?? "no limit"} (${origine})`;
}

const JOUR_MS = 86_400_000;

// What the station's cooks consumed, in tokens, over 24 h and over 7 sliding
// days: those that finished within the window. It is the consumption of the
// ticket cooks, not that of the account.
export function consommationDesCooks(base: Base, station: string, maintenant: Date): { jour: number; semaine: number } {
  const since = (jours: number) => new Date(maintenant.getTime() - jours * JOUR_MS).toISOString();
  const ligne = base.lire<{ jour: number | null; semaine: number | null }>(
    `SELECT SUM(CASE WHEN ended_at >= ? THEN tokens END) AS jour, SUM(tokens) AS semaine
     FROM station_cooks WHERE station = ? AND ended_at >= ?`,
    since(1),
    station,
    since(7),
  )[0];
  return { jour: ligne?.jour ?? 0, semaine: ligne?.semaine ?? 0 };
}

// The station's latest cooks, most recent first.
export function cooksDeStation(base: Base, station: string, combien: number): CookDeStation[] {
  return base.lire<CookDeStation>(
    `SELECT run, ticket, model, effort, branch, worktree, launched_at AS launchedAt, ended_at AS endedAt, ending,
            turns, tokens, duration_ms AS durationMs, pr
     FROM station_cooks WHERE station = ? ORDER BY launched_seq DESC LIMIT ?`,
    station,
    combien,
  );
}

// The station's cooks that are running, oldest first.
export function cooksEnCoursDeStation(base: Base, station: string): CookDeStation[] {
  return base.lire<CookDeStation>(
    `SELECT run, ticket, model, effort, branch, worktree, launched_at AS launchedAt, ended_at AS endedAt, ending,
            turns, tokens, duration_ms AS durationMs, pr
     FROM station_cooks WHERE station = ? AND ended_at IS NULL ORDER BY launched_seq`,
    station,
  );
}

// What a cook cost, by its run — or null if no station launched it.
export function cookDeRun(base: Base, run: string): CookDeStation | null {
  return (
    base.lire<CookDeStation>(
      `SELECT run, ticket, model, effort, branch, worktree, launched_at AS launchedAt, ended_at AS endedAt, ending,
              turns, tokens, duration_ms AS durationMs, pr
       FROM station_cooks WHERE run = ?`,
      run,
    )[0] ?? null
  );
}

// How many of the latest launches whose run carries this prefix — a ticket's
// cooks, a delivery's reviews, an issue's judgements — the model refused in a
// row.
export function refusDAffilee(base: Base, prefixe: string): number {
  const fins = base.lire<{ ending: string | null }>(
    "SELECT ending FROM station_cooks WHERE substr(run, 1, length(?)) = ? ORDER BY launched_seq DESC",
    prefixe,
    prefixe,
  );
  const autre = fins.findIndex((cook) => cook.ending !== "refused");
  return autre === -1 ? fins.length : autre;
}

// The stations whose connection expired, and which the chef has not had resume.
export function stationsDeconnectees(base: Base): string[] {
  return base.lire<{ station: string }>("SELECT station FROM stations WHERE disconnected_at IS NOT NULL ORDER BY station").map((ligne) => ligne.station);
}

// What the stations provide, all together, that the project declares: the
// capabilities a ticket can ask for without staying on the rail.
export function capacitesFournies(base: Base): string[] {
  return [...new Set(stationsAnnoncees(base).flatMap((station) => etatStation(base, station)?.provides ?? []))];
}

// Since when the project declares no station, or null if it declares one —
// or if no runtime has yet said what it declares.
export function sansStationDepuis(base: Base): string | null {
  return base.lire<{ since: string }>("SELECT since FROM stations_undeclared")[0]?.since ?? null;
}

// The account the stations consume is also that of reviews and judgements:
// they do not take place as long as a station says it is disconnected, or
// exhausted until a time that has not passed.
export function compteRetenu(base: Base, maintenant: Date): boolean {
  return base.lire("SELECT 1 FROM stations WHERE disconnected_at IS NOT NULL OR quota_until > ? LIMIT 1", maintenant.toISOString()).length > 0;
}

// Since when the chef has stopped the project's cooking on this station, or
// null if it cooks (see `station.stopped`).
export function arreteeDepuis(base: Base, station: string): string | null {
  return base.lire<{ since: string }>("SELECT since FROM stations_arretees WHERE station = ?", station)[0]?.since ?? null;
}

// The stations the project declares, as the log knows them: a withdrawn
// station is no longer one.
export function stationsAnnoncees(base: Base): string[] {
  return base.lire<{ station: string }>("SELECT station FROM stations ORDER BY station").map((ligne) => ligne.station);
}

// The cause that set the project's latest ticket aside, if no cook has left
// since: it is what the next one is compared with.
export function derniereMiseDeCote(base: Base): string | null {
  return base.lire<{ reason: string | null }>("SELECT last_reason AS reason FROM mise_de_cote_du_projet")[0]?.reason ?? null;
}

// The project blocked on an aside cause that repeats: since when, which one,
// by which ticket, and the base it was seen from. Null: nothing blocks it.
export type MiseDeCoteBloquee = { since: string; reason: string; base: string; ticket: number | null; station: string | null };

export function miseDeCoteBloquee(base: Base): MiseDeCoteBloquee | null {
  const ligne = base.lire<{ since: string | null; reason: string; base: string; ticket: number | null; station: string | null }>(
    "SELECT blocked_at AS since, blocked_reason AS reason, blocked_base AS base, blocked_ticket AS ticket, blocked_by AS station FROM mise_de_cote_du_projet",
  )[0];
  return ligne?.since ? { ...ligne, since: ligne.since } : null;
}
