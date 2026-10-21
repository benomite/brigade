// Le plafond de calibrage d'un projet (ticket 1284) : jusqu'où le manager monte le modèle et l'effort d'un
// ticket resté rouge avant de le remonter au chef. C'est une décision du chef, au journal du projet, avec un
// défaut — `opus` / `high` — pour ce qu'il n'a pas posé. Tout vient de `facts`, champ `plafondDeCalibrage`
// (runtime/src/faits.ts) : la valeur en vigueur, dimension par dimension, et si le chef l'a posée. L'app ne
// connaît pas le défaut, elle le lit.
//
// Le geste est la commande du runtime, `station ceiling-modele <modèle>` et `station ceiling-effort <effort>`
// (docs/runtime/manager.md, « The calibration ceiling ») ; « back to the default », `station remove …` des deux.
// Elle part là où la cuisine du projet tourne, comme le bouton d'une station (cuisson.ts) : ni `sudo`, ni
// redémarrage, ni fichier — le runtime relit la décision à sa réaction suivante.
import type { Lu, Rendu } from "./box.ts";
import { EFFORTS, MODELES } from "./projets/projets.ts";

// Ce que `facts` en dit.
export type PlafondLu = { modele: string; effort: string; parLeChef: { modele: boolean; effort: boolean } };

// Ce que la page en pose : la valeur, d'où elle vient en quelques mots, et ce que les deux listes proposent.
// `parLeChef` : une dimension au moins a été posée — « back to the default » a de quoi retirer.
export type PlafondVu = { modele: string; effort: string; dit: string; source: string; parLeChef: boolean; modeles: readonly string[]; efforts: readonly string[] };

export function plafondVu({ modele, effort, parLeChef }: PlafondLu): PlafondVu {
  const source =
    parLeChef.modele && parLeChef.effort ? "set by you" : !parLeChef.modele && !parLeChef.effort ? "default" : parLeChef.modele ? "model set by you, effort by default" : "effort set by you, model by default";
  return { modele, effort, dit: `${modele} / ${effort}`, source, parLeChef: parLeChef.modele || parLeChef.effort, modeles: MODELES, efforts: EFFORTS };
}

// Le choix du chef : deux valeurs, ou le retour au défaut.
export type ChoixDuPlafond = { modele: string; effort: string } | "defaut";
export type RenduDuPlafond = { fait: string; detail?: string } | { refus: string; detail?: string };

// Règle le plafond du projet là où sa cuisine tourne (`lu`), d'après ses derniers faits (`plafond`) : seules
// les dimensions qui changent partent, l'une après l'autre. La première que le runtime refuse arrête le tour, et
// ce qui était déjà posé est dit.
export async function reglerLePlafond(projet: string, lu: Lu | undefined, plafond: PlafondLu | undefined, choix: unknown, lancer: (lu: Lu, commande: string) => Promise<Rendu>): Promise<RenduDuPlafond> {
  if (lu === undefined) return { refus: `nothing was sent: “${projet}” has no station — there is no command to run` };
  if (plafond === undefined) return { refus: `nothing was sent: ${projet}'s ceiling is not read yet — its runtime may not give it: update it to set the ceiling from here` };
  let commandes: string[];
  if (choix === "defaut") {
    commandes = [...(plafond.parLeChef.modele ? ["station remove ceiling-modele"] : []), ...(plafond.parLeChef.effort ? ["station remove ceiling-effort"] : [])];
    if (commandes.length === 0) return { refus: "nothing was sent: the ceiling is already the default" };
  } else {
    const { modele, effort } = (choix !== null && typeof choix === "object" ? choix : {}) as Record<string, unknown>;
    if (!(MODELES as readonly unknown[]).includes(modele) || !(EFFORTS as readonly unknown[]).includes(effort)) {
      return { refus: `nothing was sent: the ceiling takes a model (${MODELES.join(", ")}) and an effort (${EFFORTS.join(", ")}), both` };
    }
    // Une valeur égale au défaut, choisie par le chef, se pose : c'est sa décision, le défaut pourra changer.
    commandes = [
      ...(modele !== plafond.modele || !plafond.parLeChef.modele ? [`station ceiling-modele ${modele}`] : []),
      ...(effort !== plafond.effort || !plafond.parLeChef.effort ? [`station ceiling-effort ${effort}`] : []),
    ];
    if (commandes.length === 0) return { refus: `nothing was sent: the ceiling is already ${modele} / ${effort}, set by you` };
  }
  const details: string[] = [];
  for (const [rang, commande] of commandes.entries()) {
    const rendu = await lancer(lu, commande);
    details.push(`${rendu.lance}\n${rendu.erreurs}${rendu.sortie}`.trim());
    if (rendu.erreur !== null) {
      const deja = rang === 0 ? "nothing was changed" : "the model was changed, not the effort";
      return { refus: `the ceiling was not changed: the runtime did not take it — ${deja}`, detail: details.join("\n") };
    }
  }
  const fait = choix === "defaut" ? "the ceiling is back to the default" : `the ceiling is ${(choix as { modele: string }).modele} / ${(choix as { effort: string }).effort}`;
  return { fait: `${fait}: the manager reads it at its next reaction, no restart`, detail: details.join("\n") };
}
