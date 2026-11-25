// L'écran d'une station lit le plafond de cooks de `box` dans son `status` par le code de l'app (plafond.ts) ; l'app ne
// lit plus de retenue de saturation (#4285) : l'écran ne la demande plus, et se charge.
import assert from "node:assert/strict";
import { test } from "node:test";
import { detailDe, PAR_DEFAUT } from "../ecrans/plafond-status.ts";

test("le plafond de `box` se lit du `status`, réglable ; sans ligne de plafond, rien n'est dit", () => {
  assert.deepEqual(detailDe(PAR_DEFAUT), { plafond: detailDe(PAR_DEFAUT).plafond ?? assert.fail("aucun plafond lu"), reglable: true });
  assert.deepEqual(detailDe("rail       nothing queued"), {});
});
