// Le bouton qui règle le closer : il écrit dans le second une commande de la doc, et n'envoie
// rien. Ce qui s'écrit se compare ici à docs/runtime/ ; que rien ne parte se prouve sur le
// registre (terminaux.test.ts) et sur un vrai pty (pty.test.ts).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { ecritPourLeCloser } from "../src/boutons.ts";
import { GESTE, type Cuisine } from "../src/box.ts";
import type { Projet } from "../src/config.ts";

const RACINE = join(import.meta.dirname, "../..");
const PARADE: Projet = { nom: "parade", dossier: "/projets/parade" };
const CUISINE: Cuisine = { locale: { node: "/usr/bin/node", runtime: "/r/runtime", racine: "/r/station", env: {} } };
const EN_POSTE = (nom: string, suite: string) => `(cd '/r/runtime' && BRIGADE_STATION_DIR='/r/station' '/usr/bin/node' ${GESTE} ${nom} ${suite})`;

describe("régler le closer (#990)", () => {
  const FERMETURE = readFileSync(join(RACINE, "docs/runtime/fermeture.md"), "utf8");

  test("le modèle et l'effort s'écrivent ensemble, sur une ligne : les deux gestes de la doc, l'un après l'autre — rien ne part", () => {
    for (const geste of ["closer-modele", "closer-effort"]) assert.ok(FERMETURE.includes(geste), `docs/runtime/fermeture.md ne nomme plus « ${geste} »`);
    assert.deepEqual(ecritPourLeCloser(CUISINE, PARADE, "sonnet", "medium"), { commande: `!${EN_POSTE("parade", "station closer-modele sonnet")} && ${EN_POSTE("parade", "station closer-effort medium")}` });
  });

  test("l'un sans l'autre, ou une valeur que la station n'accepte pas, n'écrit rien et dit pourquoi", () => {
    for (const [modele, effort] of [["sonnet", undefined], [undefined, "medium"], ["sonnet", ""], ["gpt", "medium"], ["sonnet", "medium; rm -rf /"]]) {
      const ecrit = ecritPourLeCloser(CUISINE, PARADE, modele, effort);
      assert.ok(ecrit !== undefined && "refus" in ecrit && /a model .* and an effort .*, both/.test(ecrit.refus), `${modele} ${effort}`);
    }
  });

  test("un projet sans cuisine n'a rien à écrire", () => {
    assert.equal(ecritPourLeCloser(undefined, PARADE, "sonnet", "medium"), undefined);
  });

  test("un nom que le shell découperait s'écrit cité : il arrive entier, et rien n'en est exécuté ; rien de ce qui s'écrit ne porte de retour chariot", () => {
    const ecrit = ecritPourLeCloser(CUISINE, { nom: "mon projet", dossier: "/p" }, "sonnet", "medium");
    assert.ok(ecrit !== undefined && "commande" in ecrit);
    assert.ok(ecrit.commande.includes(EN_POSTE("'mon projet'", "station closer-modele sonnet")), ecrit.commande);
    assert.doesNotMatch(ecrit.commande, /[\r\n]/);
  });
});
