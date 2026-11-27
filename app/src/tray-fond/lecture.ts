// Ce que l'icône de fond (#3631) lit et lance, sans Electron : les projets que la station de cet ordinateur sert
// (poste/cuisine-ici.ts, `servisPar`), les `facts` de chacun lus par son geste comme la veille de l'app les lit
// (box.ts, `lancerIci` ; faits.ts, `comprendre`), et les commandes de pause, d'arrêt et de leur retour (tray-fond.ts).
//
// Une lecture qui échoue — la station ne répond pas, sa sortie n'est pas la forme des faits — laisse le projet sans
// faits : il est compté « not read », jamais pour « 0 ». Une commande qui échoue est rendue avec sa raison, et les
// suivantes partent quand même : chaque projet est à part.
import { echecDe, type Rendu } from "../box.ts";
import type { ProjetLu } from "../barre-de-menus.ts";
import { comprendre } from "../faits.ts";
import { commandesDuGeste } from "./tray-fond.ts";

// Ce qui lance une commande du geste pour un projet, sur la station de cet ordinateur.
export type Lancer = (projet: string, commande: string) => Promise<Rendu>;

// Les faits de chaque projet servi, lus l'un après l'autre.
export async function lireLesProjets(projets: readonly string[], lancer: Lancer): Promise<ProjetLu[]> {
  const lus: ProjetLu[] = [];
  for (const nom of projets) {
    const rendu = await lancer(nom, "facts");
    const compris = rendu.erreur === null ? comprendre(rendu.sortie) : undefined;
    lus.push({ nom, faits: compris === undefined || "informe" in compris ? undefined : compris });
  }
  return lus;
}

// Un geste joué sur chaque projet : ce qui a échoué, une ligne par commande — vide quand tout est passé.
export async function jouerLeGeste(geste: Parameters<typeof commandesDuGeste>[0], projets: readonly ProjetLu[], lancer: Lancer, delaiMs: number): Promise<string[]> {
  const commandes = commandesDuGeste(geste, projets);
  if (commandes.length === 0) return ["no project of this station could be read: nothing was sent"];
  const echecs: string[] = [];
  for (const { projet, commande } of commandes) {
    const rendu = await lancer(projet, commande);
    if (rendu.erreur !== null) echecs.push(`${projet}: ${commande} failed — ${echecDe({ ...rendu, erreur: rendu.erreur }, delaiMs).erreur}`);
  }
  return echecs;
}

// « Start the station » depuis un projet de l'app (#3637) : le même `station start <station>` que le geste `demarrage` de
// l'icône de fond, joué pour ce seul projet. Rend la raison de ce qui a échoué, ou rien.
export async function demarrerLaStationDuProjet(projet: ProjetLu, lancer: Lancer, delaiMs: number): Promise<{ refus?: string }> {
  const echecs = await jouerLeGeste("demarrage", [projet], lancer, delaiMs);
  return echecs.length === 0 ? {} : { refus: echecs.join("\n") };
}
