// Ce que le chef lit dans l'app reste comme aujourd'hui (#4056) : le geste que le rapport lui cite, et la phrase
// française de l'échec du setup que lisent le ticket et le cook. Seul ce qui s'écrit sur le dépôt change.
import assert from "node:assert/strict";
import { test } from "node:test";
import { commandeRendre } from "../../src/events/manager.ts";
import { phraseDuSetup } from "../../src/preparation-depot/setup-en-echec.ts";

// brigade:guard
test("le chef lit toujours le geste pour rendre un ticket au manager, et l'échec du setup en français", () => {
  assert.equal(commandeRendre(30), "brigade <projet> manager return 30");
  assert.equal(
    phraseDuSetup({ code: 1, depasse: false, sortie: "./setup.sh: line 9: docker: command not found" }, "mac/claude").fr,
    "le setup a besoin de `docker`, que la station `mac/claude` n'a pas",
  );
});
