// Le point d'entrée des remèdes : un projet, le refus que la station en sert,
// le remède que ce refus offre. Il vérifie que le refus tient toujours et que
// c'est bien ce remède qu'il offre, joue le remède inscrit au registre
// (`registre.ts`), puis fait réévaluer le refus par la station, et rend ce
// qu'il en est : levé, ou toujours là — avec pourquoi, en une phrase.
//
// Il ne connaît aucun remède : un remède de plus s'inscrit au registre, rien
// ne change ici. Il ne sait pas non plus sur quelle machine il tourne : la
// station le joue elle-même, que ce soit l'ordinateur du chef ou une station
// distante, et l'app le lui demande par son gist (`distant.ts`).
//
// Ce qu'il rend est écrit pour l'app, en anglais.
import type { Refus } from "../projets/refus.ts";
import { REMEDES, type ContexteDuRemede, type Registre } from "./registre.ts";

// Ce que l'app demande : lever ce refus de ce projet par ce remède.
export type DemandeDeRemede = { project: string; refusal: string; remedy: string };

// L'issue, pour l'app :
// - `lifted` : le remède est joué, le refus a disparu ;
// - `holds` : le remède est joué — ou a échoué —, le refus tient : `reason`
//   dit pourquoi, en une phrase, et `refusal` est le refus tel qu'il est
//   maintenant (le même, ou un autre, avec son propre remède) ;
// - `error` : rien n'a été joué, rien n'a changé — `error` dit pourquoi.
export type IssueDuRemede = { outcome: "lifted" } | { outcome: "holds"; reason: string; refusal: Refus } | { outcome: "error"; error: string };

// La station, telle que le point d'entrée la voit.
export type StationDesRemedes = {
  // Le refus qu'elle sert pour ce projet, ou null.
  refusDe(projet: string): Promise<Refus | null> | Refus | null;
  // Elle réévalue ce projet — sa configuration relue, son ouverture rejouée —
  // et rend le refus qu'elle en sert maintenant, ou null.
  reevaluer(projet: string): Promise<Refus | null> | Refus | null;
  // Ce qu'elle donne au remède.
  contexte(projet: string): ContexteDuRemede;
};

const message = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur));
// Une phrase : sur une ligne, la première seulement, avec son point final.
const enUnePhrase = (texte: string) => {
  const phrase = texte.replace(/\s+/g, " ").trim().split(/(?<=[.!?]) (?=[A-Z])/)[0] ?? "";
  return /[.!?]$/.test(phrase) ? phrase : `${phrase}.`;
};
const minuscule = (texte: string) => texte.charAt(0).toLowerCase() + texte.slice(1);

export async function executerRemede(demande: DemandeDeRemede, station: StationDesRemedes, registre: Registre = REMEDES): Promise<IssueDuRemede> {
  const { project: projet, refusal: code, remedy: id } = demande;
  const remede = registre.parId(id);
  if (remede === null) return { outcome: "error", error: `the station knows no remedy called ${id}: nothing was done` };
  let avant: Refus | null;
  try {
    avant = await station.refusDe(projet);
  } catch (erreur) {
    return { outcome: "error", error: `the station could not tell whether it still refuses ${projet}: nothing was done — ${message(erreur)}` };
  }
  if (avant === null) return { outcome: "error", error: `the station no longer refuses ${projet}: nothing was done` };
  if (avant.code !== code) return { outcome: "error", error: `the station now refuses ${projet} for another reason (${avant.code}, not ${code}): nothing was done` };
  if (!("remedy" in avant) || avant.remedy.id !== id) return { outcome: "error", error: `this refusal does not offer the remedy ${id}: nothing was done` };

  let rate: string | null = null;
  try {
    await remede.executer(station.contexte(projet));
  } catch (erreur) {
    // Le geste n'a pas abouti : ce qu'il a pu en faire, la réévaluation le dit.
    rate = message(erreur);
  }
  let apres: Refus | null;
  try {
    apres = await station.reevaluer(projet);
  } catch (erreur) {
    const fait = rate === null ? "The action was done" : `The action did not go through (${rate})`;
    return { outcome: "holds", reason: enUnePhrase(`${fait}, and the station could not check again whether it still refuses this project: ${message(erreur)}`), refusal: avant };
  }
  if (apres === null) return { outcome: "lifted" };
  if (rate !== null) return { outcome: "holds", reason: enUnePhrase(`The action did not go through, so the station still refuses this project: ${rate}`), refusal: apres };
  const pourquoi = apres.code === avant.code ? "still refuses this project" : "now refuses this project for another reason";
  return { outcome: "holds", reason: enUnePhrase(`The action was done, but the station ${pourquoi}: ${minuscule(apres.message)}`), refusal: apres };
}
