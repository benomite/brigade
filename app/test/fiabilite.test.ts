// La dérive de la fiabilité des cooks, dans `status` (#987) : l'app en lit les lignes `drift`, écrites ici par les
// fonctions mêmes du runtime — elle lit ce que la box écrit, pas une copie de sa forme. La vue ne pose plus la
// section de fiabilité (#2921, la page Cooks est supprimée).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { direJaugeEn } from "../../runtime/src/mesures.ts";
import { direDerivePremierCoupEn } from "../../runtime/src/renvois.ts";
import { ligneDeProjet, type FaitsLus } from "../src/accueil.ts";
import type { Faits } from "../src/faits.ts";
import { deriveDe } from "../src/fiabilite.ts";
import { ALLUMAGE } from "../src/allumage.ts";
import { pourLaBarre } from "../src/barre.ts";
import { EXEMPLE } from "../src/config.ts";
import { PALETTE } from "../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../src/cuisine.ts";
import { BANNIERE } from "../src/faits.ts";
import { CONFIRMES, DIRECTS } from "../src/gestes.ts";
import { EFFORTS, MODELES } from "../src/projets/projets.ts";
import { ONGLETS, RUBRIQUES } from "../src/onglets.ts";
import { jouerLaVue, repos } from "./aides/fausse-vue.ts";

const A = "2026-10-19T10:00:00.000Z";

describe("la dérive, dans `status`, et l'accueil", () => {
  const drift = (ligne: string) => `${"drift".padEnd(11)}${ligne} — \`brigade parade measures\``;
  const PREMIER_COUP_DERIVE = drift(direDerivePremierCoupEn({ premiers: 1, retenus: 7, fenetre: 10, seuil: 50 }));
  const PERDUS_DERIVE = drift([{ measure: "tests", observed: 1200, limit: 1000 }, { measure: "tokens_perdus", observed: 842_809, limit: 400_000 }].map(direJaugeEn).join(" · "));
  const COUT_SEUL = drift(direJaugeEn({ measure: "tokens_ticket", observed: 1_038_705, limit: 400_000 }));

  test("la part du premier coup sous son seuil, et les tokens perdus au-delà du leur, sont la fiabilité ; les autres seuils non", () => {
    assert.deepEqual(deriveDe(["project    parade", COUT_SEUL, PERDUS_DERIVE, PREMIER_COUP_DERIVE].join("\n")), [
      "tokens lost over the last 10 merges 842,809 for a threshold of 400,000",
      "1/7 merged tickets delivered on the first try, among the last 10 served (threshold 50%)",
    ]);
    assert.deepEqual(deriveDe(["project    parade", COUT_SEUL].join("\n")), []);
  });

  const FAITS: Faits = { etat: "ouverte", lu: A, dernierTick: A, compteurs: { rail: 0, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 }, dernierEvenement: null, rail: [], cooks: [] };
  const lus: FaitsLus = { a: A, faits: FAITS };
  const PROJET = { nom: "parade", servi: true };

  test("la ligne d'un projet dont la fiabilité a dérivé le dit d'un mot, et le détail au survol ; sa pastille ne change pas", () => {
    const ligne = ligneDeProjet(PROJET, lus, { texte: ["project    parade", PREMIER_COUP_DERIVE].join("\n") });
    assert.equal(ligne.dit, "nothing cooking, nothing waits for you · drifting");
    assert.equal(ligne.ton, "vert");
    assert.match(ligne.survol, /reliability drifting: 1\/7 merged tickets delivered on the first try/);
    assert.doesNotMatch(ligne.survol, /`/);
  });

  test("sans dérive, ou sans `status` lu, rien n'est dit", () => {
    assert.equal(ligneDeProjet(PROJET, lus, { texte: ["project    parade", COUT_SEUL].join("\n") }).dit, "nothing cooking, nothing waits for you");
    assert.equal(ligneDeProjet(PROJET, lus, undefined).dit, "nothing cooking, nothing waits for you");
  });
});

describe("la fiabilité des cooks n'est plus une page de Settings ni de la vue (#1699, #2921)", () => {
  test("Settings n'a plus de page Reliability : ni sous-pages (#1700), ni section de fiabilité", async () => {
    const vue = await jouerLaVue({
      demarrage: () => ({
        configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [{ nom: "parade", dossier: "/tmp/parade" }] }, () => true),
        palette: PALETTE,
        exemple: EXEMPLE,
        onglets: ONGLETS,
        rubriques: RUBRIQUES,
        gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, directs: DIRECTS, confirmes: CONFIRMES },
        banniere: BANNIERE,
        calibrage: { modeles: MODELES, efforts: EFFORTS },
        code: undefined,
      }),
      espace: () => [],
    });
    (vue.element("projets").children.at(1) ?? assert.fail("pas de case parade")).click();
    await repos();
    (vue.element("onglets-du-projet").children.find(({ textContent }) => textContent === "Settings") ?? assert.fail("pas d'onglet Settings")).click();
    await repos();
    assert.throws(() => vue.element("parametres-onglets"), /aucun élément « parametres-onglets »/);
    assert.ok(!vue.element("etat").dessous("button").some(({ textContent }) => textContent === "Reliability"));
    // La vue ne pose plus de section de fiabilité : ni sur Settings, ni sur aucun autre onglet.
    assert.throws(() => vue.element("fiabilite-du-projet"), /aucun élément « fiabilite-du-projet »/);
  });
});
