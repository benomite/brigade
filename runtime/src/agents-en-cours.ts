// Ce que la cuisine fait tourner en ce moment hors des cooks de ticket (#1971) : la pass qui juge une livraison, le
// manager qui juge, découpe ou réagit, le triage, le closer qui nettoie le projet. Le bloc de chaque station, sur
// l'onglet Cooks de l'app, les montre à côté de ses cooks : une station qui ne fait que juger n'a pas l'air oisive.
//
// La pass se lit à l'activité des tickets en pass (activites.ts) : seules ses phases de travail comptent — une
// livraison qui attend la pass ne la fait pas tourner. Le manager, le triage et le closer se lisent à leurs lancements
// sans fin dans le journal (`cook_runs`, station `manager` ou `closer`) : le préfixe du run dit ce qu'ils font et sur
// quel ticket (manager.ts, `demander` : `<prefixe>-<numero>-<id>` ; closing/run.ts : `fermeture-<id>`).
import { PASS_A_L_OUVRAGE, type ActiviteDeTicket } from "./activites.ts";
import type { Base } from "./base.ts";

export type RoleEnCours = "pass" | "manager" | "triage" | "closer";
// `ticket` : celui sur lequel il travaille, nul pour le closer. `fait` : ce qu'il fait, en anglais. `depuis` : l'heure
// où il s'y est mis, à l'horloge de la box.
export type AgentEnCours = { role: RoleEnCours; ticket: number | null; fait: string; depuis: string };

// Un lancement hors ticket qui tourne : son run, la station sous laquelle il est parti, son départ.
export type RunHorsTicket = { run: string; station: string; launchedAt: string };

// Les stations sous lesquelles le manager et le closer lancent leur `claude` (manager.ts, `MANAGER` ; closing/run.ts,
// `STATION`). Le reviewer et le second juge sont la pass : son activité les dit déjà.
const STATIONS = ["manager", "closer"] as const;

// Ce que dit chaque préfixe de run du manager : le rôle qui l'a lancé, et ce qu'il fait.
const PREFIXES: Record<string, { role: RoleEnCours; fait: string }> = {
  juge: { role: "manager", fait: "qualifying the issue" },
  decoupe: { role: "manager", fait: "splitting the epic" },
  reagit: { role: "manager", fait: "deciding what follows a red ticket" },
  requalifie: { role: "manager", fait: "re-reading a held issue" },
  trie: { role: "triage", fait: "triaging the card" },
};
export const NETTOIE = "closing: cleaning up the project";
export const JUGE = "judging";

// Les lancements du manager et du closer sans fin dans le journal, le plus ancien d'abord.
export function runsHorsTicket(base: Base): RunHorsTicket[] {
  return base.lire<RunHorsTicket>(
    `SELECT run, station, launched_at AS launchedAt FROM cook_runs
     WHERE ended_seq IS NULL AND station IN (${STATIONS.map(() => "?").join(", ")}) ORDER BY launched_seq`,
    ...STATIONS,
  );
}

// Un lancement, lu : `<prefixe>-<numero>-<id>` pour le manager, `fermeture-<id>` pour le closer.
function agentDuRun({ run, station, launchedAt }: RunHorsTicket): AgentEnCours {
  if (station === "closer") return { role: "closer", ticket: null, fait: NETTOIE, depuis: launchedAt };
  const lu = /^([a-z]+)-(\d+)-/.exec(run);
  const numero = lu === null ? null : Number(lu[2]);
  const ticket = numero !== null && Number.isSafeInteger(numero) && numero > 0 ? numero : null;
  const dit = lu === null ? undefined : PREFIXES[lu[1] as string];
  return { role: dit?.role ?? "manager", ticket, fait: dit?.fait ?? JUGE, depuis: launchedAt };
}

// Ce qui tourne, la pass d'abord — dans l'ordre du rail —, puis le manager, le triage et le closer, dans l'ordre de
// leur départ. `pass` : les tickets en pass et ce que la cuisine en fait ; `runs` : les lancements hors ticket.
export function agentsEnCours(pass: ReadonlyArray<{ ticket: number; activite: ActiviteDeTicket | null | undefined }>, runs: readonly RunHorsTicket[]): AgentEnCours[] {
  return [
    ...pass.flatMap(({ ticket, activite }) =>
      activite != null && PASS_A_L_OUVRAGE.has(activite.faitEn) ? [{ role: "pass" as const, ticket, fait: activite.faitEn, depuis: activite.depuis }] : [],
    ),
    ...runs.map(agentDuRun),
  ];
}
