// Critère 5 (#4384) : la carte du chef d'un geste retenu par une classe de risque est une phrase qui nomme la classe, l'agent et le
// geste. Le flux est celui de l'app : la porte du runtime retient le geste (autonomy-pending.json), `manager` le liste, l'app le lit
// (held/lecture.ts) et le TODO en fait une carte (held/cartes.js). Le contrat de la porte est celui du critère 1 : `risques`.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Lu, Rendu } from "../src/box.ts";
import { poserCartesRetenues } from "../src/held/cartes-retenues.ts";
import { lireLesRetenus } from "../src/held/lecture.ts";
import { OUTCOME } from "../../runtime/src/autonomie/agents/gestes.ts";
import { porteDesGestes } from "../../runtime/src/autonomie/agents/porte.ts";
import { principal as manager } from "../../runtime/src/manager-cli.ts";
import { appeler, repertoireTemporaire } from "../../runtime/test/outils.ts";
import { Faux } from "./aides/fausse-vue.ts";

const LU: Lu = { nom: "shop", cuisine: { locale: { node: "node", runtime: "/runtime", racine: "/station", env: {} } } };
const doc = { createElement: (balise: string) => new Faux(balise) };

test("a gesture held by a risk class reaches the chef's TODO as one card, one sentence naming the class, the agent and the gesture", async (t) => {
  const repertoire = repertoireTemporaire(t);
  const porte = porteDesGestes({ repertoire, projet: "shop", horloge: () => new Date("2026-11-26T09:00:00.000Z"), risques: () => [{ name: "billing", paths: ["src/billing/"], hold: true }] });
  const geste = { line: "pushed cook/12-invoice to origin", reason: "its own reason", outcome: OUTCOME.FIXED_BY_SELF, fichiers: ["src/billing/invoice.ts"] };
  assert.equal((await porte.passer({ agent: "cook #12", reglable: "cook" }, geste, () => 1)).etat, "held");

  const sortie = appeler(manager, [], { BRIGADE_STATE_DIR: repertoire }).sortie();
  const rendu: Rendu = { lance: "$ manager", erreur: null, sortie, erreurs: "" };
  const lus = await lireLesRetenus(LU, async () => rendu);
  const gestes = lus !== undefined && "gestes" in lus ? lus.gestes : assert.fail(JSON.stringify(lus));
  assert.equal(gestes.length, 1);

  const cartes = poserCartesRetenues(doc, gestes, async () => undefined) as Faux[];
  assert.equal(cartes.length, 1);
  const carte = cartes[0] ?? assert.fail("card");
  const texte = carte.textContent;
  for (const mot of ["billing", "cook #12", "pushed cook/12-invoice to origin"]) assert.ok(texte.includes(mot), `${mot} in: ${texte}`);
  // One sentence: no full stop followed by another sentence.
  const phrases = (gestes[0]?.summary + " " + gestes[0]?.reason).split(/[.!?](?:\s+|$)/).filter((p) => p.trim() !== "");
  assert.equal(phrases.length, 1, texte);
  assert.equal(carte.dessous("button").length, 1);
});
