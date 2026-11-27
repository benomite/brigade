// Les alertes du haut du rail, posées par la vue (ticket 3823) : une lecture de `facts` telle que le process principal la
// donne, l'espace de `parade` ouvert sur son rail. L'alerte se pose en tête du rail ; celle qui dit qu'aucun cook ne peut
// partir se tait pendant que la station de cet ordinateur redémarre pour sa mise à jour (ticket 3637) ; la phrase de
// l'attente qui porte un geste ne se montre plus — les alertes disent seules les pannes —, celle sans geste reste.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ALLUMAGE } from "../../src/allumage.ts";
import { pourLaBarre } from "../../src/barre.ts";
import { EXEMPLE } from "../../src/config.ts";
import { PALETTE } from "../../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../../src/cuisine.ts";
import { BANNIERE, tenirFaits } from "../../src/faits.ts";
import { CONFIRMES, DIRECTS } from "../../src/gestes.ts";
import { ONGLETS, RUBRIQUES } from "../../src/onglets.ts";
import { EFFORTS, MODELES } from "../../src/projets/projets.ts";
import type { Terminal } from "../../src/terminaux.ts";
import { jouerLaVue, repos, type Faux } from "../aides/fausse-vue.ts";

const PARADE = "parade";
const LU = "2026-11-18T12:00:00.000Z";
const SECOND: Terminal = { id: 1, projet: PARADE, genre: "second", titre: "second · claude", note: "session neuve", arrete: false };
const BASE = { etat: "ouverte", lu: LU, dernierTick: null, compteurs: { rail: 1, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 }, dernierEvenement: null, rail: [] };
const AUCUN_COOK = { sorte: "aucun-cook", phrase: "Station parade-box has been offline since 11:00 UTC (1 h), so no cook can start: #4 waits. Start it on its computer.", fait: { depuis: "2026-11-18T11:00:00.000Z", ticket: 4, check: "the signs of life of parade-box" }, geste: "Start it on its computer", geree: null, bouton: "demarrer-la-station" };
const BASE_ROUGE = { sorte: "base-rouge", phrase: "The main branch has been red since 10:00 UTC (2 h) (check runtime tests fails, #12): no delivery merges.", fait: { depuis: "2026-11-18T10:00:00.000Z", ticket: 12, check: "runtime tests" }, geste: null, geree: "The kitchen repairs it on #12." };

// L'espace de `parade` ouvert sur son rail — sa station d'ici en train de redémarrer, ou non ; `montrer` y pose une lecture de `facts`.
async function espace(redemarre: boolean) {
  const configuration = pourLaBarre({ chemin: "/tmp/app.json", projets: [{ nom: PARADE, dossier: "/tmp/parade" }] }, () => true, () => true, () => !redemarre, () => (redemarre ? "2.5.0" : null));
  const vue = await jouerLaVue({
    demarrage: () => ({ configuration, palette: PALETTE, exemple: EXEMPLE, onglets: ONGLETS, rubriques: RUBRIQUES, gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, directs: DIRECTS, confirmes: CONFIRMES }, banniere: BANNIERE, calibrage: { modeles: MODELES, efforts: EFFORTS }, code: undefined }),
    espace: () => [SECOND],
  });
  (vue.element("projets").children.at(1) ?? assert.fail("pas de case pour parade")).click();
  await repos();
  return async (faits: Record<string, unknown>) => {
    const dessinable = tenirFaits().recevoir({ projet: PARADE, demande: 1, a: new Date().toISOString(), sorties: [{ commande: "facts", texte: `${JSON.stringify({ ...BASE, ...faits })}\n` }] });
    vue.dire("surFaits", { ...dessinable, demande: vue.dernier("faits")[0] as number });
    await repos();
    return vue.element("rail");
  };
}
const alertesDe = (rail: Faux) => rail.children.filter(({ className }) => className.includes("alerte-du-rail")).map(({ dataset }) => dataset.sorte);
const attentesDe = (rail: Faux) => rail.children.filter(({ className }) => className.includes("attente-du-rail")).map(({ dataset }) => dataset.raison);

describe("les alertes du haut du rail, dans la vue", () => {
  test("l'alerte qui dit qu'aucun cook ne peut partir se pose en tête du rail ; pendant le redémarrage de la station d'ici, elle se tait, et la base rouge reste", async () => {
    const montrer = await espace(false);
    assert.deepEqual(alertesDe(await montrer({ alertesDuRail: [AUCUN_COOK] })), ["aucun-cook"]);
    const pendant = await espace(true);
    assert.deepEqual(alertesDe(await pendant({ alertesDuRail: [AUCUN_COOK] })), []);
    // La base rouge que la cuisine répare seule ne demande rien au chef : pas de bannière (#4238). Celle qui attend son geste reste,
    // avec un bouton.
    assert.deepEqual(alertesDe(await pendant({ alertesDuRail: [AUCUN_COOK, BASE_ROUGE] })), []);
    const rail = await pendant({ alertesDuRail: [AUCUN_COOK, { ...BASE_ROUGE, geste: "Open the failing check", geree: null }] });
    assert.deepEqual(alertesDe(rail), ["base-rouge"]);
    assert.deepEqual(rail.children.find(({ className }) => className.includes("alerte-du-rail"))?.dessous("button").map(({ textContent }) => textContent), ["open #12"]);
  });

  test("la phrase de l'attente qui porte un geste ne se montre plus ; celle sans geste reste", async () => {
    const montrer = await espace(false);
    assert.deepEqual(attentesDe(await montrer({ attenteDuRail: { raison: "aucune-station", phrase: "No station serves this project, so no cook can start. Add the project to a station.", geste: "ajouter-a-une-station", stations: [] } })), []);
    assert.deepEqual(attentesDe(await montrer({ attenteDuRail: { raison: "normale", phrase: "Normal wait: a cook takes the ticket within minutes (the oldest has waited 2 min). It resolves by itself.", geste: null, stations: [] } })), ["normale"]);
  });
});
