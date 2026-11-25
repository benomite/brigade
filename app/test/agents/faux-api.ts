// Un faux de l'API des agents (#4224, épique #4117), tel que le contrat du ticket la décrit : `GET /api/agents`,
// `GET|PUT /api/agents/:id/settings`, `GET /api/agents/:id/gestures`. Il prend la place de `source.demander`
// (app/src/vue/agents/source.js), tient son état — un PUT accepté change le réglage que la relecture rend —, et garde chaque
// demande reçue. Un PUT que `refuser` refuse rend 400 et sa raison, et ne change rien.
import { source } from "../../src/vue/agents/source.js";

export type Chiffre = { label: string; value: number | string; meaning: string };
export type Agent = { id: string; name: string; role: string; state: "idle" | "working" | "broken"; workingOn: number | null; nextRun: string | null; figures: Chiffre[]; settings: unknown };
export type Champ = { key: string; label: string; kind: string; value: unknown; source: string; editable: boolean; livesIn: string | null; changedAt: string | null; changedBy: string | null };
export type Geste = { at: string; summary: string; reason: string; issue: number | null };

export const QUAND = "2026-11-25T14:00:00.000Z";
export const QUI = "benomite";

export const champ = (key: string, plus: Partial<Champ> = {}): Champ => ({ key, label: key, kind: "integer", value: null, source: "default", editable: true, livesIn: null, changedAt: null, changedBy: null, ...plus });

export const AGENTS: Agent[] = [
  {
    id: "manager",
    name: "Manager",
    role: "Splits the epics and calibrates each ticket.",
    state: "idle",
    workingOn: null,
    nextRun: "2026-11-25T16:30:00.000Z",
    figures: [
      { label: "Fixed by itself", value: 4, meaning: "gestures it made and closed without the chef, last 7 days" },
      { label: "Handed to the chef", value: 1, meaning: "gestures it handed to the chef to decide, last 7 days" },
    ],
    settings: null,
  },
  {
    id: "cook",
    name: "Cooks",
    role: "Each cook takes one ticket on the rail, writes its change and delivers it.",
    state: "working",
    workingOn: 4224,
    nextRun: null,
    figures: [
      { label: "Fixed by itself", value: 12, meaning: "gestures it made and closed without the chef, last 7 days" },
      { label: "Handed to the chef", value: 0, meaning: "gestures it handed to the chef to decide, last 7 days" },
    ],
    settings: null,
  },
  {
    id: "closer",
    name: "Closer",
    role: "Prunes what the project no longer needs.",
    state: "broken",
    workingOn: null,
    nextRun: "2026-11-26T03:00:00.000Z",
    figures: [
      { label: "Fixed by itself", value: 2, meaning: "gestures it made and closed without the chef, last 7 days" },
      { label: "Handed to the chef", value: 3, meaning: "gestures it handed to the chef to decide, last 7 days" },
      { label: "Lines removed", value: 1234, meaning: "lines of code its closing passes removed, last 7 days" },
    ],
    settings: null,
  },
];

export const REGLAGES: Record<string, Champ[]> = {
  manager: [
    champ("model", { label: "Model of its judgments", kind: "model", value: "opus", source: "env" }),
    champ("autonomy", { label: "Autonomy level", kind: "autonomy", value: "propose" }),
    champ("pause", { label: "Pause", kind: "switch", editable: false, livesIn: "the project switch, one for the whole project" }),
  ],
  cook: [champ("places", { label: "Places (cooks at once)", editable: false, livesIn: "each station's configuration, on its own machine" }), champ("autonomy", { label: "Autonomy level", kind: "autonomy", value: "act" })],
  closer: [champ("driftLostTokens", { label: "Drift: lost tokens", kind: "integer", value: 50000, source: "app", changedAt: "2026-11-20T09:00:00.000Z", changedBy: "someone" }), champ("pause", { label: "Pause", kind: "switch", value: false })],
};

export const GESTES: Record<string, Geste[]> = {
  manager: [
    { at: "2026-11-25T12:10:00.000Z", summary: "split epic #4117", reason: "the epic named three screens", issue: 4117 },
    { at: "2026-11-24T08:00:00.000Z", summary: "calibrated #4224", reason: "a new screen with several states", issue: 4224 },
  ],
  cook: [],
  closer: [{ at: "2026-11-23T03:00:00.000Z", summary: "opened a closing pass", reason: "20 merges since the last pass", issue: null }],
};

type Demande = [string, string, unknown];

// Le faux posé sur `source.demander`. `refuser(id, key, value)` : la raison d'un 400, ou null pour accepter.
export function fausseApi({ agents = AGENTS, reglages = REGLAGES, gestes = GESTES, refuser = () => null, avecReglages = [] as string[] }: { agents?: Agent[]; reglages?: Record<string, Champ[]>; gestes?: Record<string, Geste[]>; refuser?: (id: string, key: string, value: unknown) => string | null; avecReglages?: string[] } = {}) {
  const etat = structuredClone(reglages);
  const demandes: Demande[] = [];
  Object.assign(source, {
    demander: async (demande: string, projet: string, corps?: { key: string; value: unknown }) => {
      demandes.push([demande, projet, corps]);
      const [methode, chemin] = demande.split(" ") as [string, string];
      if (methode === "GET" && chemin === "/api/agents") return { statut: 200, corps: agents.map((agent) => ({ ...agent, settings: avecReglages.includes(agent.id) ? { fields: etat[agent.id] ?? [] } : agent.settings })) };
      const [, id, quoi] = /^\/api\/agents\/([^/]+)\/(settings|gestures)$/.exec(chemin) ?? [];
      if (id === undefined || !agents.some((agent) => agent.id === id)) return { statut: 404, corps: { reason: `no agent “${id}”` } };
      if (quoi === "gestures") return { statut: 200, corps: structuredClone(gestes[id] ?? []) };
      if (methode === "GET") return { statut: 200, corps: { fields: structuredClone(etat[id] ?? []) } };
      if (corps === undefined) return { statut: 400, corps: { reason: "the request body must be {key, value}" } };
      const refus = refuser(id, corps.key, corps.value);
      if (refus !== null) return { statut: 400, corps: { reason: refus } };
      const liste = etat[id] ?? [];
      const cible = liste.find((un) => un.key === corps.key);
      if (cible === undefined) return { statut: 400, corps: { reason: `${id} has no setting ${corps.key}` } };
      Object.assign(cible, { value: corps.value, source: "app", changedAt: QUAND, changedBy: QUI });
      return { statut: 200, corps: structuredClone(cible) };
    },
  });
  return { demandes };
}
