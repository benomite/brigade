// Le réglage « prendre aussi les tickets ordinaires » de la station Mac d'un projet
// (docs/runtime.md, « Les tickets ordinaires sur le poste du chef »). Le chef le pose dans les
// réglages du projet ; il s'écrit dans le fichier des projets (`ordinaires`, `limiteCooks`) et
// revient à chaque lecture. L'état du bac à sable, lui, vient de la station : la box le rend dans
// `facts`, champ `stations`, et l'app le dit tel quel, sans le deviner.
import type { Projet } from "./config.ts";

// Seul un Mac a le bac à sable de Claude Code que le runtime sonde (Seatbelt).
export const PLATEFORME = "darwin";

// Ce que `facts` dit d'une station (runtime/src/etat.ts, `stations`) — ce que l'app en lit.
// `bacASable` : nul, la station n'en a rien dit.
export type StationDesFaits = {
  station: string;
  distante: boolean;
  plafond: number | null;
  ordinaires: boolean;
  bacASable: { disponible: boolean; raison: string | null; version: string | null; depuis: string } | null;
  prendOrdinaires: boolean;
};

export const EXPLICATION = "The Mac's cooks run in Claude Code's sandbox: they write only in their own worktree, and reach only the network hosts on the project's list.";

// Ce que la vue pose : l'option, la limite (`null` : aucune écrite), l'explication, et — quand la
// station dit son bac à sable indisponible — le message, avec la raison.
export type Bloc = { actif: boolean; limite: number | null; explication: string; indisponible?: string };

// Le bloc d'un projet, ou rien : l'option n'existe que pour un projet dont ce poste joue une
// station, et sur un Mac.
export function blocDesOrdinaires(projet: Pick<Projet, "stations" | "ordinaires" | "limiteCooks">, plateforme: string, stations: readonly StationDesFaits[] | undefined): Bloc | undefined {
  if (plateforme !== PLATEFORME || projet.stations === undefined || projet.stations.length === 0) return undefined;
  const sans = stations?.find(({ station, bacASable }) => projet.stations?.includes(station) === true && bacASable?.disponible === false);
  return {
    actif: projet.ordinaires === true,
    limite: projet.limiteCooks ?? null,
    explication: EXPLICATION,
    ...(sans?.bacASable == null ? {} : { indisponible: `The sandbox is unavailable on this Mac — ${sans.bacASable.raison ?? "no reason given"}. The Mac takes no ordinary ticket.` }),
  };
}

// Les deux clés d'un projet, telles que le fichier les écrit — ou la raison pour laquelle il est refusé.
export function ordinairesLus(declare: { ordinaires?: unknown; limiteCooks?: unknown }): { ordinaires?: boolean; limiteCooks?: number } | string {
  const { ordinaires, limiteCooks } = declare;
  if (ordinaires !== undefined && typeof ordinaires !== "boolean") return "“ordinaires” must be true or false — whether the Mac also takes the ordinary tickets";
  if (limiteCooks !== undefined && (!Number.isInteger(limiteCooks) || (limiteCooks as number) < 1)) return "“limiteCooks” must be a whole number, one or more — how many cooks the Mac runs at once";
  return { ...(ordinaires === undefined ? {} : { ordinaires }), ...(limiteCooks === undefined ? {} : { limiteCooks: limiteCooks as number }) };
}
