// Les stations : ce que chacune annonce, ce qui l'empêche de servir, et les
// cooks qu'elle a lancés. C'est ici que le chef lit ce qu'il paie — chaque cook
// avec son calibrage et ce qu'il a consommé.
//
// Le temps n'entre pas ici : un quota « épuisé jusqu'à 15 h » le reste dans la
// table après 15 h, c'est le lecteur qui compare à l'heure qu'il est.
import type { Base } from "../base.ts";
import { geste } from "../geste.ts";
import type { FaitDistante } from "../evenements/distante.ts";
import type { FaitGardeFous } from "../evenements/garde-fous.ts";
import type { FaitRenouvellement } from "../evenements/renouvellement.ts";
import type { FaitStation, Ressource, Retenue } from "../evenements/station.ts";
import { definirProjection } from "../projection.ts";

export type EtatStation = {
  station: string;
  engine: string;
  provides: string[];
  // Le plafond de cooks que la station annonce : celui qui vaut tant que le
  // chef n'a rien réglé.
  maxCooks: number;
  // Le plafond réglé par le chef — 0 : pas de limite —, ou null s'il n'a rien dit.
  cap: number | null;
  announcedAt: string;
  // Non nuls : le quota est épuisé jusqu'à cette heure, la connexion a expiré.
  quotaUntil: string | null;
  quotaReason: string | null;
  disconnectedAt: string | null;
  disconnectedReason: string | null;
  // Non nuls : la machine n'en peut plus depuis cet instant, et de quoi elle
  // manque (voir `station.saturated`).
  saturatedAt: string | null;
  saturatedResource: Ressource | null;
  saturatedObserved: number | null;
  saturatedLimit: number | null;
  // Non nuls : des tickets pourraient partir, et la station ne les prend pas
  // depuis cet instant, pour cette raison (voir `station.held`).
  heldAt: string | null;
  heldReason: Retenue | null;
  // Non nuls : l'arbitre entre projets est injoignable depuis cet instant, et
  // la station ne fait tourner qu'un cook à la fois (voir `station.unarbitrated`).
  unarbitratedAt: string | null;
  unarbitratedReason: string | null;
  // Vrai : elle ne tourne pas sur cette machine, elle tire son travail.
  remote: boolean;
  // D'une station distante : sa dernière manifestation, et depuis quand elle
  // est présente — nul : absente, elle ne s'est pas manifestée, ou plus depuis
  // le délai de présence (voir `station.absent`).
  seenAt: string | null;
  presentSince: string | null;
  // Vrai : distante, le chef lui fait prendre aussi les tickets ordinaires,
  // dans le bac à sable de son poste.
  ordinary: boolean;
  // Ce qu'elle a dit de ce bac à sable, la dernière fois que ça a changé, et
  // quand. Nul : elle n'en a jamais rien dit.
  sandbox: { available: boolean; reason: string | null; version: string | null; at: string } | null;
};

export type CookDeStation = {
  run: string;
  ticket: number | null;
  model: string | null;
  effort: string | null;
  branch: string | null;
  // Relatif au répertoire d'état.
  worktree: string | null;
  launchedAt: string;
  endedAt: string | null;
  // La fin dite par la station (`done`, `failed`, `86`, `disconnected`, `refused`) ou, à
  // défaut, celle que les garde-fous ont notée.
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

// Chaque retenue telle que le chef la lit.
const RETENUES: Record<Retenue, string> = {
  stopped: "cuisine arrêtée par le chef",
  breaker: "disjoncteur ouvert",
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

// La raison d'une déconnexion constatée au démarrage : le compte du service
// n'a jamais été connecté.
export const SANS_CONNEXION = "not-logged-in";
// La connexion Max qui manque, telle que le chef la lit : absente quand le
// démarrage ne l'a pas trouvée, expirée quand elle est tombée en route.
export const direDeconnexion = (raison: string | null) => (raison === SANS_CONNEXION || raison?.startsWith("binaire introuvable") ? "absente" : "expirée");
export const GESTE_DE_CONNEXION = `\`claude /login\` sous le compte du service, puis \`${geste("guardrails resume")}\``;
// Le geste d'une connexion déjà tombée : le seul, `claude /login` — la cuisine
// reprend seule au premier passage réussi du renouvellement (`session.restored`),
// dans la minute. « resume » reste pour les autres arrêts.
export const GESTE_DE_CONNEXION_TOMBEE = "`claude /login` sous le compte du service — la cuisine reprend seule dans la minute, sans « resume »";
// Les mêmes, en anglais : ce que dit le bloc `awaiting` de `status`.
export const direDeconnexionEn = (raison: string | null) => (direDeconnexion(raison) === "absente" ? "missing" : "expired");
export const GESTE_DE_CONNEXION_EN = `\`claude /login\` under the service account, then \`${geste("guardrails resume")}\``;
export const GESTE_DE_CONNEXION_TOMBEE_EN = "`claude /login` under the service account — the kitchen starts again on its own within the minute, without “resume”";
// La connexion Max tombée, dite d'un seul endroit : `run station` et
// `run installation` la citent telle quelle — deux rendus d'un même fait, ce
// serait deux endroits où il peut devenir faux.
export const direConnexionTombee = (etat: Pick<EtatStation, "disconnectedAt" | "disconnectedReason">) =>
  `EXPIRÉE depuis le ${etat.disconnectedAt} (${etat.disconnectedReason}) — plus aucun ticket n'est pris ; \`claude /login\` sous le compte du service — la cuisine reprend seule dans la minute`;

// Une station entre dans la table au premier fait qui la nomme : un quota
// épuisé ou une déconnexion valent même si l'annonce s'est perdue.
const modifier = (base: Base, station: unknown, at: string, affectation: string, ...parametres: Array<string | number | null>) => {
  if (!texte(station)) return;
  base.executer("INSERT OR IGNORE INTO stations (station, engine, provides, max_cooks, announced_at) VALUES (?, '', '[]', 0, ?)", station, at);
  base.executer(`UPDATE stations SET ${affectation} WHERE station = ?`, ...parametres, station);
};

export const stations = definirProjection<Ecoutes>({
  nom: "stations",
  tables: ["stations", "station_cooks", "stations_undeclared", "setup_du_projet", "mise_de_cote_du_projet"],
  schema: `
    CREATE TABLE IF NOT EXISTS stations (
      station             TEXT PRIMARY KEY,
      engine              TEXT NOT NULL,
      provides            TEXT NOT NULL,
      max_cooks           INTEGER NOT NULL,
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
      held_at             TEXT,
      held_reason         TEXT,
      unarbitrated_at     TEXT,
      unarbitrated_reason TEXT,
      remote              INTEGER NOT NULL DEFAULT 0,
      seen_at             TEXT,
      present_since       TEXT,
      ordinary            INTEGER NOT NULL DEFAULT 0,
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
        "engine = ?, provides = ?, max_cooks = ?, announced_at = ?, remote = ?, ordinary = ?",
        String(payload.engine),
        JSON.stringify(Array.isArray(payload.provides) ? payload.provides : []),
        Number.isSafeInteger(payload.maxCooks) ? payload.maxCooks : 0,
        at,
        payload.remote === true ? 1 : 0,
        payload.ordinary === true ? 1 : 0,
      );
      if (texte(payload.station)) base.executer("DELETE FROM stations_undeclared");
    },
    // Ce qui la retenait part avec elle ; ses cooks restent au relevé.
    "station.withdrawn": (base, { payload }) => {
      if (texte(payload.station)) base.executer("DELETE FROM stations WHERE station = ?", payload.station);
    },
    // Seule une station que le projet déclare a une présence : une demande
    // faite sous un autre nom ne crée personne.
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
      if (Number.isSafeInteger(payload.maxCooks) && payload.maxCooks >= 0) modifier(base, payload.station, at, "cap = ?", payload.maxCooks);
    },
    "station.saturated": (base, { at, payload }) => {
      const { resource, observed, limit } = payload;
      if (!RESSOURCES.includes(resource) || !Number.isFinite(observed) || !Number.isFinite(limit)) return;
      modifier(base, payload.station, at, "saturated_at = ?, saturated_resource = ?, saturated_observed = ?, saturated_limit = ?", at, resource, observed, limit);
    },
    "station.relieved": (base, { at, payload }) => {
      modifier(base, payload.station, at, "saturated_at = NULL, saturated_resource = NULL, saturated_observed = NULL, saturated_limit = NULL");
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
    // « reprendre » : le chef tient la connexion pour rétablie.
    "kitchen.resumed": (base) => {
      base.executer("UPDATE stations SET disconnected_at = NULL, disconnected_reason = NULL");
    },
    // Le renouvellement a vu la connexion revenir : la levée se fait seule.
    "session.restored": (base, { payload }) => {
      for (const station of payload.stations) base.executer("UPDATE stations SET disconnected_at = NULL, disconnected_reason = NULL WHERE station = ?", station);
    },
    "cook.launched": (base, evenement) => {
      const { run, station, model, effort, branch, worktree } = evenement.payload;
      // Un cook lancé sans station n'appartient à aucune.
      if (!texte(run) || !texte(station)) return;
      // Un setup d'ici vient de passer : l'échec d'avant n'est plus celui qui
      // précède le prochain. Celui d'une station distante a tourné ailleurs.
      base.executer("UPDATE setup_du_projet SET last_why = NULL, last_hosts = NULL WHERE NOT EXISTS (SELECT 1 FROM stations WHERE station = ? AND remote = 1)", station);
      // De même pour la cause d'une mise de côté : un cook est parti, le
      // projet n'est plus sur la même.
      // Et un cook parti est la cause levée : le blocage tombe avec elle.
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
    // Un signal pour le chef, lu au journal et sur l'issue : il ne change rien
    // à ce que la station sait d'un cook.
    "cook.out-of-zone": () => {},
    // De même : `status` lit le temps sans progrès au rail.
    "cook.stalled": () => {},
    // De même : le ticket est 86 au rail, et c'est là que `status` le lit.
    "secrets.unavailable": () => {},
    // L'issue le dit ; ici ne compte que la cause, celle à laquelle le
    // prochain échec se compare.
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
    // `last_reason` reste celle du blocage quand c'est la base qui a bougé :
    // la même cause, sur la nouvelle base, rebloque aussitôt. Quand la cause a
    // changé, c'est `aside.failed` de la nouvelle qui la remplace.
    "aside.unblocked": (base) => {
      base.executer("UPDATE mise_de_cote_du_projet SET blocked_at = NULL, blocked_reason = NULL, blocked_base = NULL, blocked_ticket = NULL, blocked_by = NULL");
    },
    // La cause reste celle du blocage : le même échec, sur la base qui a
    // bougé, rebloque aussitôt.
    "setup.unblocked": (base) => {
      base.executer("UPDATE setup_du_projet SET blocked_at = NULL, blocked_why = NULL, blocked_hosts = NULL, blocked_base = NULL, blocked_ticket = NULL, blocked_by = NULL");
    },
  },
});

const hotes = (valeur: unknown): string[] => (Array.isArray(valeur) ? valeur.filter(texte) : []);

// La cause d'un échec de setup : son motif, et ce que la porte a refusé.
export type CauseDeSetup = { why: string; hosts: string[] };

// Le même échec que `avant` : même motif, et aucun hôte refusé qu'il n'ait
// déjà nommé. Les hôtes ne s'exigent pas tous : la porte ne redit pas un hôte
// avant dix minutes, à qui que ce soit — un essai qui suit de près se tait sur
// celui qui l'a fait échouer.
export const memeCause = (avant: CauseDeSetup, apres: CauseDeSetup) => avant.why === apres.why && apres.hosts.every((hote) => avant.hosts.includes(hote));

// La cause du dernier échec de setup du projet, s'il n'est passé aucun setup
// d'ici depuis : c'est à elle que le prochain échec se compare.
export function dernierEchecDeSetup(base: Base): CauseDeSetup | null {
  const ligne = base.lire<{ why: string | null; hosts: string | null }>("SELECT last_why AS why, last_hosts AS hosts FROM setup_du_projet")[0];
  return ligne?.why ? { why: ligne.why, hosts: JSON.parse(ligne.hosts ?? "[]") } : null;
}

// Le setup du projet bloqué : depuis quand, sur quelle cause, par quel ticket,
// et la base dont le worktree était parti — tant qu'elle n'a pas bougé, aucun
// setup n'est lancé. Null : rien ne le bloque.
export type SetupBloque = CauseDeSetup & { since: string; base: string; ticket: number | null; station: string | null };

export function setupBloque(base: Base): SetupBloque | null {
  const ligne = base.lire<{ since: string | null; why: string; hosts: string; base: string; ticket: number | null; station: string | null }>(
    "SELECT blocked_at AS since, blocked_why AS why, blocked_hosts AS hosts, blocked_base AS base, blocked_ticket AS ticket, blocked_by AS station FROM setup_du_projet",
  )[0];
  return ligne?.since ? { ...ligne, since: ligne.since, hosts: JSON.parse(ligne.hosts) } : null;
}

type LigneDeStation = Omit<EtatStation, "provides" | "remote" | "ordinary" | "sandbox"> & {
  provides: string;
  remote: number;
  ordinary: number;
  sandboxAvailable: number | null;
  sandboxReason: string | null;
  sandboxVersion: string | null;
  sandboxAt: string | null;
};

export function etatStation(base: Base, station: string): EtatStation | null {
  const ligne = base.lire<LigneDeStation>(
    `SELECT station, engine, provides, max_cooks AS maxCooks, cap, announced_at AS announcedAt,
            quota_until AS quotaUntil, quota_reason AS quotaReason,
            disconnected_at AS disconnectedAt, disconnected_reason AS disconnectedReason,
            saturated_at AS saturatedAt, saturated_resource AS saturatedResource,
            saturated_observed AS saturatedObserved, saturated_limit AS saturatedLimit,
            held_at AS heldAt, held_reason AS heldReason,
            unarbitrated_at AS unarbitratedAt, unarbitrated_reason AS unarbitratedReason,
            remote, seen_at AS seenAt, present_since AS presentSince, ordinary,
            sandbox_available AS sandboxAvailable, sandbox_reason AS sandboxReason, sandbox_version AS sandboxVersion, sandbox_at AS sandboxAt
     FROM stations WHERE station = ?`,
    station,
  )[0];
  if (!ligne) return null;
  const { sandboxAvailable, sandboxReason, sandboxVersion, sandboxAt, ...reste } = ligne;
  return {
    ...reste,
    provides: JSON.parse(ligne.provides),
    remote: ligne.remote === 1,
    ordinary: ligne.ordinary === 1,
    sandbox: sandboxAvailable === null || sandboxAt === null ? null : { available: sandboxAvailable === 1, reason: sandboxReason, version: sandboxVersion, at: sandboxAt },
  };
}

// Combien de cooks la station fait tourner à la fois, au plus : ce que le chef
// a réglé, sinon ce qu'elle annonce. Null : pas de limite — c'est ce que dit zéro.
export function plafondDeCooks(etat: Pick<EtatStation, "maxCooks" | "cap">): number | null {
  const regle = etat.cap ?? etat.maxCooks;
  return regle === 0 ? null : regle;
}

const JOUR_MS = 86_400_000;

// Ce que les cooks de la station ont consommé, en tokens, sur 24 h et sur 7
// jours glissants : ceux qui ont fini dans la fenêtre. C'est la consommation
// des cooks de tickets, pas celle du compte.
export function consommationDesCooks(base: Base, station: string, maintenant: Date): { jour: number; semaine: number } {
  const depuis = (jours: number) => new Date(maintenant.getTime() - jours * JOUR_MS).toISOString();
  const ligne = base.lire<{ jour: number | null; semaine: number | null }>(
    `SELECT SUM(CASE WHEN ended_at >= ? THEN tokens END) AS jour, SUM(tokens) AS semaine
     FROM station_cooks WHERE station = ? AND ended_at >= ?`,
    depuis(1),
    station,
    depuis(7),
  )[0];
  return { jour: ligne?.jour ?? 0, semaine: ligne?.semaine ?? 0 };
}

// Les derniers cooks de la station, le plus récent d'abord.
export function cooksDeStation(base: Base, station: string, combien: number): CookDeStation[] {
  return base.lire<CookDeStation>(
    `SELECT run, ticket, model, effort, branch, worktree, launched_at AS launchedAt, ended_at AS endedAt, ending,
            turns, tokens, duration_ms AS durationMs, pr
     FROM station_cooks WHERE station = ? ORDER BY launched_seq DESC LIMIT ?`,
    station,
    combien,
  );
}

// Les cooks de la station qui tournent, le plus ancien d'abord.
export function cooksEnCoursDeStation(base: Base, station: string): CookDeStation[] {
  return base.lire<CookDeStation>(
    `SELECT run, ticket, model, effort, branch, worktree, launched_at AS launchedAt, ended_at AS endedAt, ending,
            turns, tokens, duration_ms AS durationMs, pr
     FROM station_cooks WHERE station = ? AND ended_at IS NULL ORDER BY launched_seq`,
    station,
  );
}

// Ce qu'un cook a coûté, par son run — ou null si aucune station ne l'a lancé.
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

// Combien des derniers lancements dont le run porte ce préfixe — les cooks d'un
// ticket, les relectures d'une livraison, les jugements d'une issue — le modèle
// a refusés d'affilée.
export function refusDAffilee(base: Base, prefixe: string): number {
  const fins = base.lire<{ ending: string | null }>(
    "SELECT ending FROM station_cooks WHERE substr(run, 1, length(?)) = ? ORDER BY launched_seq DESC",
    prefixe,
    prefixe,
  );
  const autre = fins.findIndex((cook) => cook.ending !== "refused");
  return autre === -1 ? fins.length : autre;
}

// Les stations dont la connexion a expiré, et que le chef n'a pas fait reprendre.
export function stationsDeconnectees(base: Base): string[] {
  return base.lire<{ station: string }>("SELECT station FROM stations WHERE disconnected_at IS NOT NULL ORDER BY station").map((ligne) => ligne.station);
}

// Ce que fournissent, à elles toutes, les stations que le projet déclare : les
// capacités qu'un ticket peut demander sans rester sur le rail.
export function capacitesFournies(base: Base): string[] {
  return [...new Set(stationsAnnoncees(base).flatMap((station) => etatStation(base, station)?.provides ?? []))];
}

// Depuis quand le projet ne déclare aucune station, ou null s'il en déclare —
// ou si aucun runtime n'a encore dit ce qu'il déclare.
export function sansStationDepuis(base: Base): string | null {
  return base.lire<{ since: string }>("SELECT since FROM stations_undeclared")[0]?.since ?? null;
}

// Le compte que les stations consomment est aussi celui des relectures et des
// jugements : ils n'ont pas lieu tant qu'une station le dit déconnecté, ou
// épuisé jusqu'à une heure qui n'est pas passée.
export function compteRetenu(base: Base, maintenant: Date): boolean {
  return base.lire("SELECT 1 FROM stations WHERE disconnected_at IS NOT NULL OR quota_until > ? LIMIT 1", maintenant.toISOString()).length > 0;
}

// Les stations que le projet déclare, telles que le journal les connaît : une
// station retirée n'en est plus.
export function stationsAnnoncees(base: Base): string[] {
  return base.lire<{ station: string }>("SELECT station FROM stations ORDER BY station").map((ligne) => ligne.station);
}

// La cause qui a mis de côté le dernier ticket du projet, s'il n'est parti
// aucun cook depuis : c'est à elle que la prochaine se compare.
export function derniereMiseDeCote(base: Base): string | null {
  return base.lire<{ reason: string | null }>("SELECT last_reason AS reason FROM mise_de_cote_du_projet")[0]?.reason ?? null;
}

// Le projet bloqué sur une cause de mise de côté qui se répète : depuis quand,
// laquelle, par quel ticket, et la base d'où elle a été vue. Null : rien ne le
// bloque.
export type MiseDeCoteBloquee = { since: string; reason: string; base: string; ticket: number | null; station: string | null };

export function miseDeCoteBloquee(base: Base): MiseDeCoteBloquee | null {
  const ligne = base.lire<{ since: string | null; reason: string; base: string; ticket: number | null; station: string | null }>(
    "SELECT blocked_at AS since, blocked_reason AS reason, blocked_base AS base, blocked_ticket AS ticket, blocked_by AS station FROM mise_de_cote_du_projet",
  )[0];
  return ligne?.since ? { ...ligne, since: ligne.since } : null;
}
