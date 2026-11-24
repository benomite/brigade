// La vue du projet que le second lit à « pourquoi on est bloqués ? » (#4121) : les bandeaux et les cartes du rail que le
// chef voit, tirés du tableau que l'app dessine — rien n'y est recalculé : un état lu est dit tel quel — et déposés, un
// fichier par projet, là où le crochet du second (blocage-du-second.ts) les lit.
import { mkdirSync, writeFileSync } from "node:fs";
import { MOTS_DU_GESTE } from "../../../runtime/src/attente-du-rail/stations.ts";
import type { Tableau } from "../faits.ts";
import type { BandeauDeLaVue, CarteDeLaVue, VueDuProjet } from "./contexte-du-blocage.ts";
import { VUES, vueDe } from "./blocage-du-second.ts";

const LE_CHEF = "the chef";

// Le bandeau STOPPED : ce que l'arrêt attend, et qui — d'après la cause que le runtime a nommée.
function bandeauDArret(arret: NonNullable<Tableau["arretCuisine"]>): BandeauDeLaVue {
  const { cause } = arret;
  if (cause.kind === "frozen-zone") return { label: "STOPPED", waitsFor: `frozen ticket #${cause.ticket} holds the file zone ${cause.zone}`, waitsOn: `whoever serves #${cause.ticket}, or the chef who sets it free` };
  if (cause.kind === "main-red") return { label: "STOPPED", waitsFor: "main is red", waitsOn: "the repair of main" };
  return { label: "STOPPED", waitsFor: "the cause is unknown", waitsOn: LE_CHEF };
}

function vueDuTableau(tableau: Tableau): VueDuProjet {
  const geste = tableau.attenteDuRail?.geste;
  const banners: BandeauDeLaVue[] = [];
  if (tableau.arretCuisine !== undefined) banners.push(bandeauDArret(tableau.arretCuisine));
  for (const a of tableau.alertesDuRail ?? []) {
    banners.push({ label: a.fait.ticket === undefined ? "FAULT" : `FAULT #${a.fait.ticket}`, waitsFor: a.phrase, waitsOn: a.geste ?? LE_CHEF });
  }
  const attente = tableau.attenteDuRail;
  const rail: CarteDeLaVue[] = tableau.rail.colonnes.flatMap((colonne) =>
    colonne.cartes.map((c) => {
      const displayed = c.ligne === undefined ? (c.mot ?? c.etat ?? colonne.nom) : `${c.etat ?? colonne.nom} - ${c.ligne}`;
      // La raison que le rail dit à la file qui ne part pas vaut pour les cartes en file : c'est l'état réel de chacune.
      const enFile = c.etat === "queued" && attente !== undefined && attente.raison !== "normale";
      return { number: c.ticket, title: c.titre ?? "", displayed, real: enFile ? attente.phrase : displayed, waitsOn: enFile ? (geste ? MOTS_DU_GESTE[geste] : LE_CHEF) : LE_CHEF };
    }),
  );
  return { banners, rail, ...(geste ? { gesture: { what: MOTS_DU_GESTE[geste], by: LE_CHEF } } : {}) };
}

// Dépose la vue du projet pour son second. Un dépôt qui échoue se dit, et le second n'a alors pas de vue : le crochet ne rend rien.
export function deposerLaVue(projet: string, tableau: Tableau, vues: string = VUES()): void {
  try {
    mkdirSync(vues, { recursive: true });
    writeFileSync(vueDe(vues, projet), JSON.stringify(vueDuTableau(tableau)));
  } catch (erreur) {
    console.error(`vue du projet ${projet} non déposée pour le second : ${(erreur as Error).message}`);
  }
}
