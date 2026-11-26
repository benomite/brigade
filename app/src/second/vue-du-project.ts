// La vue du projet que le second lit à « pourquoi on est bloqués ? » (#4121) : les bandeaux et les cartes du rail que le
// chef voit, tirés du tableau que l'app dessine — rien n'y est recalculé : un état lu est dit tel quel — et déposés, un
// fichier par projet, là où le crochet du second (blockage-du-second.ts) les lit.
import { mkdirSync, writeFileSync } from "node:fs";
import { statutDeLArret } from "../../../runtime/src/arret-cuisine/arret-cuisine.ts";
import { MOTS_DU_GESTE } from "../../../runtime/src/attente-du-rail/stations.ts";
import type { Card, Tableau } from "../facts.ts";
import type { BannerDeLaVue, CardDeLaVue, VueDuProject } from "./context-du-blockage.ts";
import { VUES, vueDe } from "./blockage-du-second.ts";

const LE_CHEF = "the chef";

// Le bandeau STOPPED : ce que l'arrêt attend, et qui — d'après la cause que le runtime a nommée.
function bannerDStop(stop: NonNullable<Tableau["arretCuisine"]>): BannerDeLaVue {
  const { cause } = stop;
  if (cause.kind === "frozen-zone") return { label: "STOPPED", waitsFor: statutDeLArret(stop), waitsOn: `whoever serves #${cause.ticket}, or the chef who sets it free` };
  if (cause.kind === "zone-held") return { label: "STOPPED", waitsFor: statutDeLArret(stop), waitsOn: `whoever serves PR ${cause.pr}, or the chef who merges or closes it` };
  if (cause.kind === "main-red") return { label: "STOPPED", waitsFor: statutDeLArret(stop), waitsOn: "the repair of main" };
  return { label: "STOPPED", waitsFor: statutDeLArret(stop), waitsOn: LE_CHEF };
}

// Qui est vraiment attendu d'une carte : le chef seulement quand elle lui demande quelque chose.
function quiAwaiting(c: Card, state: string | undefined): string {
  if (c.attendu || c.question) return LE_CHEF;
  if (c.enWaiting || c.relancePassee) return c.relancePassee ? LE_CHEF : "the station, which set the card aside";
  const word = (state ?? "").toLowerCase();
  if (/^(cooking|pris|taken|tests written|tests écrits)$/.test(word)) return "a cook";
  if (word === "in pass" || word === "pass" || word === "base rouge") return word === "base rouge" ? "main to be green" : "the pass";
  if (word === "queued" || word === "en attente") return "the kitchen, which will take it";
  return "a third party";
}

function vueDuTableau(tableau: Tableau): VueDuProject {
  const action = tableau.attenteDuRail?.geste;
  const banners: BannerDeLaVue[] = [];
  if (tableau.arretCuisine !== undefined) banners.push(bannerDStop(tableau.arretCuisine));
  for (const a of tableau.alertesDuRail ?? []) {
    // Une alerte que la station gère déjà (boucle arrêtée, carte mise de côté) n'attend pas le chef : le rail la dit gérée.
    if (a.geree !== null) continue;
    banners.push({ label: a.fait.ticket === undefined ? "FAULT" : `FAULT #${a.fait.ticket}`, waitsFor: a.phrase, waitsOn: a.geste ?? LE_CHEF });
  }
  const wait = tableau.attenteDuRail;
  // « base rouge » n'est dit que si le rail dit la base rouge : une alerte de base rouge, ou un arrêt dû à main rouge.
  const baseRed = (tableau.alertesDuRail ?? []).some((a) => a.sorte === "base-rouge") || tableau.arretCuisine?.cause.kind === "main-red";
  const rail: CardDeLaVue[] = tableau.rail.colonnes.flatMap((colonne) =>
    colonne.cartes.filter((c) => c.etat !== "served" && colonne.nom !== "SERVED").map((c) => {
      const perimee = c.etat === "base rouge" && !baseRed;
      const state = perimee ? "in pass" : c.etat;
      const displayed = perimee ? "in pass" : c.ligne === undefined ? (c.mot ?? c.etat ?? colonne.nom) : `${c.etat ?? colonne.nom} - ${c.ligne}`;
      // La raison que le rail dit à la file qui ne part pas vaut pour les cartes en file : c'est l'état réel de chacune.
      const enFile = c.etat === "queued" && wait !== undefined && wait.raison !== "normale";
      return { number: c.ticket, title: c.titre ?? "", displayed, real: enFile ? wait.phrase : displayed, waitsOn: enFile ? (action ? MOTS_DU_GESTE[action] : LE_CHEF) : quiAwaiting(c, state) };
    }),
  );
  return { banners, rail, ...(action ? { gesture: { what: MOTS_DU_GESTE[action], by: LE_CHEF } } : {}) };
}

// Dépose la vue du projet pour son second. Un dépôt qui échoue se dit, et le second n'a alors pas de vue : le crochet ne rend rien.
export function deposerLaVue(project: string, tableau: Tableau, vues: string = VUES()): void {
  try {
    mkdirSync(vues, { recursive: true });
    writeFileSync(vueDe(vues, project), JSON.stringify(vueDuTableau(tableau)));
  } catch (error) {
    console.error(`vue du projet ${project} non déposée pour le second : ${(error as Error).message}`);
  }
}
