// Les sorties des commandes qui parlent d'un ticket sont en anglais (#931) : `rail` (avec `remove`, `priority`, `merge`),
// `pass` (avec `issue`, `comment`) et `log`. Un état d'exemple qui
// porte un rail, des livraisons en pass et des attentes passe dans le test de glossaire : aucune ligne, refus compris,
// ne garde un mot de la colonne « français » du glossaire. La sortie `--json` de `pass` garde ses clés.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { principal as montrerRail } from "../src/montrer-rail.ts";
import { principal as relire } from "../src/relire.ts";
import { exempleDuBas } from "./aides/bas-de-status.ts";
import { sansMotFrancais } from "./aides/glossaire.ts";
import { appeler, DEPOT, repertoireTemporaire } from "./outils.ts";

type Commande = Parameters<typeof appeler>[0];

// L'état d'exemple du bas de `status`, et le répertoire où son journal vit.
function etat(t: TestContext) {
  const repertoire = repertoireTemporaire(t);
  exempleDuBas(t, repertoire);
  return { repertoire, env: { BRIGADE_STATE_DIR: repertoire } as Record<string, string> };
}

async function sortie(commande: Commande, args: string[], env: Record<string, string>) {
  const enfant = appeler(commande, args, env);
  const code = await enfant.fin;
  return { code, lignes: enfant.sortie().trimEnd().split("\n") };
}

test("`rail` : le rail de l'état d'exemple ne porte aucun mot français du glossaire, ni ses refus", async (t) => {
  const { env } = etat(t);
  const rail = await sortie(montrerRail, [], env);
  assert.equal(rail.code, 0);
  assert.ok(rail.lignes.length > 10);
  sansMotFrancais(rail.lignes);

  // Les refus : un geste inconnu, un ticket pris, un ticket absent, sans dépôt déclaré.
  for (const args of [["bouger", "1"], ["remove"], ["remove", "31"], ["merge", "404"], ["remove", "30"]]) {
    const refus = await sortie(montrerRail, args, { ...env, BRIGADE_GITHUB_REPO: DEPOT, BRIGADE_GH_BIN: "/inexistant" });
    assert.notEqual(refus.code, 0, args.join(" "));
    sansMotFrancais(refus.lignes);
  }
  const sansDepot = await sortie(montrerRail, ["remove", "30"], env);
  assert.equal(sansDepot.code, 2);
  sansMotFrancais(sansDepot.lignes);
  const sansEtat = await sortie(montrerRail, [], {});
  assert.equal(sansEtat.code, 2);
  sansMotFrancais(sansEtat.lignes);
  const sansJournal = await sortie(montrerRail, [], { BRIGADE_STATE_DIR: repertoireTemporaire(t) });
  assert.equal(sansJournal.code, 1);
  sansMotFrancais(sansJournal.lignes);
});

test("`log` : l'état d'exemple se lit sans mot français du glossaire, et ses refus aussi", async (t) => {
  const { env } = etat(t);
  for (const args of [[], ["--ticks"], ["30"], ["17", "--last", "3"], ["404"]]) {
    const lu = await sortie(relire, args, env);
    assert.equal(lu.code, 0, args.join(" "));
    // Les charges utiles du journal sont des données écrites telles quelles : seul ce que `log` dit lui-même est lu.
    sansMotFrancais(lu.lignes.filter((ligne) => !ligne.includes("{")));
  }
  for (const [args, environnement] of [[["x"], env], [[], {}], [[], { BRIGADE_STATE_DIR: repertoireTemporaire(t) }]] as const) {
    const refus = await sortie(relire, [...args], { ...environnement });
    assert.notEqual(refus.code, 0);
    sansMotFrancais(refus.lignes);
  }
});
