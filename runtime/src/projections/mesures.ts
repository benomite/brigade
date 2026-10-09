// Ce que le journal sait de la lourdeur du projet, livraison mergée par
// livraison mergée : les mesures que ses gates ont déclarées, et ce que ses
// cooks ont consommé. S'y ajoutent les seuils du chef et les franchissements
// déjà signalés. Rien n'est relevé à part : tout vient des faits de la pass et
// des garde-fous.
import type { Base } from "../base.ts";
import type { Fait } from "../evenements.ts";
import type { Seuils } from "../evenements/derive.ts";
import { definirProjection } from "../projection.ts";

type Ecoutes = Extract<
  Fait,
  { type: "pass.judged" | "pass.replayed" | "merge.done" | "cook.launched" | "cook.exited" | "drift.configured" | "drift.crossed" | "drift.cleared" }
>;

// Un cook de ticket. `calibration` : `<modèle>/<effort>`, ou null pour un cook
// lancé sans calibrage connu. `turns`, `durationMs` : nuls tant qu'il tourne,
// ou s'il est mort avec le runtime.
export type CookMesure = { calibration: string | null; turns: number | null; durationMs: number | null };

// Une livraison mergée. `measures` : ce que ses dernières gates ont déclaré.
// `state` : celles de ces mesures qui disent l'état du projet après son merge —
// toutes, sauf quand ses gates ont été jouées avant celles d'une livraison
// mergée plus tôt : une livraison jugée, mise en attente, puis mergée sans
// rejeu derrière une autre ne sait rien de ce que l'autre a ajouté, et ne
// conclut pas. `gatesS` : la durée de toutes ses gates, renvois et rejeux
// compris, ou null si aucune ne l'a déclarée.
export type Livraison = {
  ticket: number | null;
  at: string;
  measures: Record<string, number>;
  state: Record<string, number>;
  gatesS: number | null;
  cooks: CookMesure[];
};

// Les stations sous lesquelles la pass et le manager lancent leurs cooks : ni
// une relecture ni un jugement ne cuisine un ticket.
const HORS_TICKET = ["reviewer", "manager"];

const noterGates = (base: Base, seq: number, ticket: number | null, measures: Record<string, number> | undefined) => {
  if (measures === undefined || ticket === null) return;
  base.executer("INSERT INTO measured_gates (seq, ticket, measures) VALUES (?, ?, ?)", seq, ticket, JSON.stringify(measures));
};

export const mesures = definirProjection<Ecoutes>({
  nom: "mesures",
  tables: ["measured_gates", "measured_cooks", "measured_merges", "drift_limits", "drift_flags"],
  schema: `
    CREATE TABLE IF NOT EXISTS measured_gates (
      seq      INTEGER PRIMARY KEY,
      ticket   INTEGER NOT NULL,
      measures TEXT NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS measured_cooks (
      run          TEXT PRIMARY KEY,
      ticket       INTEGER NOT NULL,
      launched_seq INTEGER NOT NULL,
      calibration  TEXT,
      turns        INTEGER,
      duration_ms  INTEGER
    ) STRICT;
    CREATE TABLE IF NOT EXISTS measured_merges (
      seq    INTEGER PRIMARY KEY,
      ticket INTEGER,
      at     TEXT NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS drift_limits (
      id     INTEGER PRIMARY KEY CHECK (id = 1),
      limits TEXT NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS drift_flags (
      measure TEXT PRIMARY KEY
    ) STRICT;
  `,
  sur: {
    "pass.judged": (base, evenement) => noterGates(base, evenement.seq, evenement.ticket, evenement.payload.gates.measures),
    "pass.replayed": (base, evenement) => noterGates(base, evenement.seq, evenement.ticket, evenement.payload.gates.measures),
    "merge.done": (base, evenement) => {
      base.executer("INSERT INTO measured_merges (seq, ticket, at) VALUES (?, ?, ?)", evenement.seq, evenement.ticket, evenement.at);
    },
    "cook.launched": (base, evenement) => {
      const { run, station, model, effort } = evenement.payload;
      if (evenement.ticket === null || (station !== undefined && HORS_TICKET.includes(station))) return;
      base.executer(
        "INSERT INTO measured_cooks (run, ticket, launched_seq, calibration) VALUES (?, ?, ?, ?)",
        run,
        evenement.ticket,
        evenement.seq,
        model === undefined || effort === undefined ? null : `${model}/${effort}`,
      );
    },
    "cook.exited": (base, evenement) => {
      const { run, turns, durationMs } = evenement.payload;
      const entier = (valeur: unknown) => (Number.isSafeInteger(valeur) ? (valeur as number) : null);
      base.executer("UPDATE measured_cooks SET turns = ?, duration_ms = ? WHERE run = ?", entier(turns), entier(durationMs), run);
    },
    "drift.configured": (base, evenement) => {
      base.executer("INSERT OR REPLACE INTO drift_limits (id, limits) VALUES (1, ?)", JSON.stringify(evenement.payload.limits));
    },
    "drift.crossed": (base, evenement) => {
      base.executer("INSERT OR IGNORE INTO drift_flags (measure) VALUES (?)", evenement.payload.measure);
    },
    "drift.cleared": (base, evenement) => {
      base.executer("DELETE FROM drift_flags WHERE measure = ?", evenement.payload.measure);
    },
  },
});

// Les livraisons mergées, dans l'ordre de leur merge. À chacune reviennent les
// gates et les cooks de son ticket depuis le merge précédent de ce même
// ticket : un ticket servi deux fois fait deux livraisons.
export function livraisonsMergees(base: Base): Livraison[] {
  const gates = base.lire<{ seq: number; ticket: number; measures: string }>("SELECT seq, ticket, measures FROM measured_gates ORDER BY seq");
  const cooks = base.lire<{ ticket: number; seq: number; calibration: string | null; turns: number | null; durationMs: number | null }>(
    "SELECT ticket, launched_seq AS seq, calibration, turns, duration_ms AS durationMs FROM measured_cooks ORDER BY launched_seq",
  );
  const precedents = new Map<number, number>();
  // Par mesure, le passage de gates le plus récent qui l'a déclarée parmi les
  // livraisons déjà mergées.
  const connues = new Map<string, number>();
  return base.lire<{ seq: number; ticket: number | null; at: string }>("SELECT seq, ticket, at FROM measured_merges ORDER BY seq").map((merge) => {
    const depuis = merge.ticket === null ? 0 : (precedents.get(merge.ticket) ?? 0);
    if (merge.ticket !== null) precedents.set(merge.ticket, merge.seq);
    const siennes = <L extends { ticket: number; seq: number }>(lignes: L[]) =>
      lignes.filter((ligne) => ligne.ticket === merge.ticket && ligne.seq > depuis && ligne.seq < merge.seq);
    const passages = siennes(gates);
    const declarees = passages.map((ligne) => JSON.parse(ligne.measures) as Record<string, number>);
    const durees = declarees.flatMap((declare) => (declare.gates_s === undefined ? [] : [declare.gates_s]));
    const measures = declarees.at(-1) ?? {};
    const jouees = passages.at(-1)?.seq ?? 0;
    const state = Object.fromEntries(Object.entries(measures).filter(([nom]) => jouees > (connues.get(nom) ?? 0)));
    for (const nom of Object.keys(state)) connues.set(nom, jouees);
    return {
      ticket: merge.ticket,
      at: merge.at,
      measures,
      state,
      gatesS: durees.length === 0 ? null : durees.reduce((somme, duree) => somme + duree, 0),
      cooks: siennes(cooks).map(({ calibration, turns, durationMs }) => ({ calibration, turns, durationMs })),
    };
  });
}

// Les seuils déclarés, ou null tant qu'aucun runtime n'a démarré avec eux.
export function seuilsEnVigueur(base: Base): Seuils | null {
  const ligne = base.lire<{ limits: string }>("SELECT limits FROM drift_limits WHERE id = 1")[0];
  return ligne ? JSON.parse(ligne.limits) : null;
}

// Les mesures dont le franchissement a été signalé, et qui n'en sont pas revenues.
export function signalements(base: Base): string[] {
  return base.lire<{ measure: string }>("SELECT measure FROM drift_flags ORDER BY measure").map(({ measure }) => measure);
}
