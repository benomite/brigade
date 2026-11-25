// #4278, critère 5 : la marque d'étape de l'issue donne le numéro, le nombre d'étapes et le nom ; elle change quand le ticket passe à l'étape suivante. Contrat : `decrireEtape(etat)` -> texte de la marque posée sur l'issue GitHub.
import assert from "node:assert/strict";
import { test } from "node:test";
import { decrireEtape, type EtatDeEtapes } from "../../src/etapes-du-ticket.ts";

test("the mark reads 'stage 2 of 4: storyboard' and becomes the next one when the ticket moves on", () => {
  const etapes = ["script", "storyboard", "voice", "render"];
  const avant = decrireEtape({ etapes, courante: 1, essais: 0 } as EtatDeEtapes);
  assert.match(avant, /2\s*(\/|of|sur)\s*4/);
  assert.match(avant, /storyboard/);
  const apres = decrireEtape({ etapes, courante: 2, essais: 0 } as EtatDeEtapes);
  assert.match(apres, /3\s*(\/|of|sur)\s*4/);
  assert.match(apres, /voice/);
  assert.notEqual(apres, avant);
});
