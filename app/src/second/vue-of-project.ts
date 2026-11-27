// La vue du projet que le second lit à « pourquoi on est bloqués ? » (#4121) : les bandeaux et les cartes du rail que le
// chef voit, tirés du tableau que l'app dessine — rien n'y est recalculé : un état lu est dit tel quel — et déposés, un
// fichier par projet, là où le crochet du second (blockage-of-second.ts) les lit.
import { mkdirSync, writeFileSync } from "node:fs";
import { statutDeLArret } from "../../../runtime/src/arret-cuisine/arret-cuisine.ts";
import { MOTS_DU_GESTE } from "../../../runtime/src/attente-du-rail/stations.ts";
import type { Card, Board } from "../facts.ts";
import type { BannerOfTheVue, CardOfTheVue, VueOfProject } from "./context-of-blockage.ts";
import { VIEWS, vueOf } from "./blockage-of-second.ts";

const THE_CHEF = "the chef";

// Le bandeau STOPPED : ce que l'arrêt attend, et qui — d'après la cause que le runtime a nommée.
function bannerOfStop(stop: NonNullable<Board["arretCuisine"]>): BannerOfTheVue {
  const { cause } = stop;
  if (cause.kind === "frozen-zone") return { label: "STOPPED", waitsFor: statutDeLArret(stop), waitsOn: `whoever serves #${cause.ticket}, or the chef who sets it free` };
  if (cause.kind === "zone-held") return { label: "STOPPED", waitsFor: statutDeLArret(stop), waitsOn: `whoever serves PR ${cause.pr}, or the chef who merges or closes it` };
  if (cause.kind === "main-red") return { label: "STOPPED", waitsFor: statutDeLArret(stop), waitsOn: "the repair of main" };
  return { label: "STOPPED", waitsFor: statutDeLArret(stop), waitsOn: THE_CHEF };
}

// Qui est vraiment attendu d'une carte : le chef seulement quand elle lui demande quelque chose.
function whoAwaiting(c: Card, state: string | undefined): string {
  if (c.attendu || c.question) return THE_CHEF;
  if (c.enWaiting || c.relancePassee) return c.relancePassee ? THE_CHEF : "the station, which set the card aside";
  const word = (state ?? "").toLowerCase();
  if (/^(cooking|pris|taken|tests written|tests écrits)$/.test(word)) return "a cook";
  if (word === "in pass" || word === "pass" || word === "base rouge") return word === "base rouge" ? "main to be green" : "the pass";
  if (word === "queued" || word === "en attente") return "the kitchen, which will take it";
  return "a third party";
}

function vueOfBoard(board: Board): VueOfProject {
  const action = board.attenteDuRail?.geste;
  const banners: BannerOfTheVue[] = [];
  if (board.arretCuisine !== undefined) banners.push(bannerOfStop(board.arretCuisine));
  for (const a of board.alertesDuRail ?? []) {
    // Une alerte que la station gère déjà (boucle arrêtée, carte mise de côté) n'attend pas le chef : le rail la dit gérée.
    if (a.geree !== null) continue;
    banners.push({ label: a.fait.ticket === undefined ? "FAULT" : `FAULT #${a.fait.ticket}`, waitsFor: a.phrase, waitsOn: a.geste ?? THE_CHEF });
  }
  const wait = board.attenteDuRail;
  // « base rouge » n'est dit que si le rail dit la base rouge : une alerte de base rouge, ou un arrêt dû à main rouge.
  const baseRed = (board.alertesDuRail ?? []).some((a) => a.sorte === "base-rouge") || board.arretCuisine?.cause.kind === "main-red";
  const rail: CardOfTheVue[] = board.rail.colonnes.flatMap((column) =>
    column.cartes.filter((c) => c.etat !== "served" && column.nom !== "SERVED").map((c) => {
      const staleOne = c.etat === "base rouge" && !baseRed;
      const state = staleOne ? "in pass" : c.etat;
      const displayed = staleOne ? "in pass" : c.ligne === undefined ? (c.mot ?? c.etat ?? column.nom) : `${c.etat ?? column.nom} - ${c.ligne}`;
      // La raison que le rail dit à la file qui ne part pas vaut pour les cartes en file : c'est l'état réel de chacune.
      const enFile = c.etat === "queued" && wait !== undefined && wait.raison !== "normale";
      return { number: c.ticket, title: c.titre ?? "", displayed, real: enFile ? wait.phrase : displayed, waitsOn: enFile ? (action ? MOTS_DU_GESTE[action] : THE_CHEF) : whoAwaiting(c, state) };
    }),
  );
  return { banners, rail, ...(action ? { gesture: { what: MOTS_DU_GESTE[action], by: THE_CHEF } } : {}) };
}

// Dépose la vue du projet pour son second. Un dépôt qui échoue se dit, et le second n'a alors pas de vue : le crochet ne rend rien.
export function dropTheVue(project: string, board: Board, views: string = VIEWS()): void {
  try {
    mkdirSync(views, { recursive: true });
    writeFileSync(vueOf(views, project), JSON.stringify(vueOfBoard(board)));
  } catch (error) {
    console.error(`vue du projet ${project} non déposée pour le second : ${(error as Error).message}`);
  }
}
