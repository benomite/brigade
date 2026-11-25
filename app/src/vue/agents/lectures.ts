// Ce que `switch` et `log` rendent, lu pour l'onglet Agents (ticket 4117) : l'interrupteur du projet — allumé ou éteint, depuis
// quand, par qui —, et la dernière décision posée de chaque réglage. Ce qui ne se lit pas se dit, jamais deviné.
import type { Changements, Interrupteur, Manque } from "./fiches.ts";

const estObjet = (valeur: unknown): valeur is Record<string, unknown> => typeof valeur === "object" && valeur !== null && !Array.isArray(valeur);

// `switch` : « switch     OFF since 2026-… (by chef) — … » — ou « NOT SET », que rien n'allume ni n'éteint.
export function interrupteurLu(sortie: string): Interrupteur | Manque {
  const lu = /^switch\s+(ON|OFF)\s+since\s+(\S+)\s+\(by ([^,)]+)/m.exec(sortie);
  return lu === null ? { sans: "the project switch is not set, or its answer cannot be read", detail: sortie.trim() } : { on: lu[1] === "ON", since: lu[2] as string, by: (lu[3] as string).trim() };
}

// `log` : « <seq>  <heure>  <projet>  <ticket>  <type>  <auteur>  <charge> » — la dernière décision posée de chaque réglage, et
// le dernier plafond de cooks. Une décision retirée n'est plus posée.
export function changementsLus(sortie: string): Changements {
  const changements: Changements = new Map();
  for (const ligne of sortie.split("\n")) {
    const lu = /^\d+  (\S+)  \S+  \S+  (decision\.set|decision\.withdrawn|station\.capped)  (\S+)  (.*)$/.exec(ligne);
    if (lu === null) continue;
    const [, at, type, by, charge] = lu as unknown as [string, string, string, string, string];
    let payload: unknown = null;
    try {
      payload = JSON.parse(charge);
    } catch {
      continue;
    }
    if (!estObjet(payload)) continue;
    if (type === "station.capped") changements.set("cooks", { at, by });
    else if (typeof payload.name === "string") {
      if (type === "decision.set") changements.set(payload.name, { at, by });
      else changements.delete(payload.name);
    }
  }
  return changements;
}
