// Les décisions du chef sur les lignes du tableau de la cuisine (app/src/vue/gestes-du-tableau.js, #1590) : ce que chaque
// ligne offre, où en est le geste d'après les lectures du tableau, et ce que la ligne en dit. Le module est joué devant
// un faux document.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { GesteDuTableau, LigneDeLaFile } from "../../../runtime/src/tableau/rendu/bloc.ts";
import {
  apresEnvoi,
  attendLaBox,
  echecDe,
  gestesDeLaLigne,
  ligneDeLaBox,
  poserLesDecisions,
  SANS_PONT,
  vuDuGeste,
  type DecisionsDuTableau,
  type Suivi,
} from "../../src/vue/gestes-du-tableau.js";
import { Faux } from "../aides/fausse-vue.ts";
import { TABLEAU } from "../tableau/fixture.ts";

const doc = { createElement: (balise: string) => new Faux(balise) };
const [LIVRAISON, CARTE] = TABLEAU.file as [LigneDeLaFile, LigneDeLaFile];
const COMMENTAIRE = { id: 4242, url: null };
const lu = (etat: "pris" | "refuse", reponse: string): GesteDuTableau => ({ commentaire: 4242, url: "", le: "", geste: "merge", ticket: 18, etat, traiteLe: "", reponse });
const RIEN: DecisionsDuTableau = { decider: () => {}, proposer: () => {}, ecrire: () => {}, oublier: () => {} };

test("ce qu'une ligne offre : une livraison verte se merge d'abord, une remontée se renvoie d'abord, un autre ticket se retire, une ligne sans ticket rien", () => {
  assert.deepEqual(gestesDeLaLigne(LIVRAISON), { gestes: ["merge", "send-back", "set-aside"], recommande: "merge" });
  assert.deepEqual(gestesDeLaLigne({ ...LIVRAISON, quoi: "remontee" }), { gestes: ["send-back", "merge", "set-aside"], recommande: "send-back" });
  // Sans PR, rien à merger ni à renvoyer.
  assert.deepEqual(gestesDeLaLigne({ ...LIVRAISON, decision: { quoi: "merge", motif: null, cause: null, pr: null } }), { gestes: ["set-aside"], recommande: undefined });
  assert.deepEqual(gestesDeLaLigne(CARTE), { gestes: ["set-aside"], recommande: undefined });
  assert.deepEqual(gestesDeLaLigne({ ...LIVRAISON, ticket: null, decision: null }), { gestes: [], recommande: undefined });
});

test("où en est un geste : en route, posté et en attente, puis pris ou refusé d'après le bloc du tableau", () => {
  const decision = { geste: "merge", ticket: 18 } as const;
  const poste: Suivi = { decision, etape: "poste", commentaire: COMMENTAIRE };
  assert.deepEqual(vuDuGeste(undefined, []), { etape: "repos" });
  assert.deepEqual(vuDuGeste({ decision, etape: "envoi" }, []), { etape: "envoi", decision });
  assert.deepEqual(vuDuGeste(poste, undefined), { etape: "pending", decision });
  assert.deepEqual(vuDuGeste(poste, [{ ...lu("pris", "x"), commentaire: 1 }]), { etape: "pending", decision });
  assert.deepEqual(vuDuGeste(poste, [lu("pris", "**Done** — [merge #18](https://x) — cost: none")]), { etape: "taken", decision, reponse: "Done — merge #18 — cost: none" });
  assert.deepEqual(vuDuGeste(poste, [lu("refuse", "**Not done** — [merge #18](https://x): `#18` has no delivery")]), { etape: "refused", decision, reponse: "Not done — merge #18: #18 has no delivery" });
  assert.equal(attendLaBox(poste, []), true);
  assert.equal(attendLaBox(poste, [lu("pris", "")]), false);
  assert.equal(attendLaBox(undefined, []), false);
});

test("ce que le pont rend : posté, un échec, ou rien d'un pont qui ne poste pas", () => {
  const decision = { geste: "set-aside", ticket: 18 } as const;
  assert.deepEqual(apresEnvoi(decision, { etat: "pending", commentaire: COMMENTAIRE }), { decision, etape: "poste", commentaire: COMMENTAIRE });
  assert.deepEqual(apresEnvoi(decision, { etat: "failed", raison: "Nothing was posted: x." }), { decision, etape: "echec", raison: "Nothing was posted: x." });
  assert.deepEqual(apresEnvoi(decision, undefined), { decision, etape: "echec", raison: SANS_PONT });
});

test("un échec : une phrase, et ce que GitHub ou le réseau a dit à part", () => {
  assert.deepEqual(echecDe("The gesture could not be posted on the Kitchen board of chef/parade: getaddrinfo ENOTFOUND api.github.com."), {
    dit: "The gesture could not be posted on the Kitchen board of chef/parade.",
    detail: "getaddrinfo ENOTFOUND api.github.com",
  });
  assert.deepEqual(echecDe("Nothing was posted: #99 is not in the queue of the latest Kitchen board read — read it again."), { dit: "Nothing was posted: #99 is not in the queue of the latest Kitchen board read — read it again.", detail: "" });
  assert.equal(ligneDeLaBox("**Done**  —\n[merge #18](https://github.com/x)"), "Done — merge #18");
});

test("une ligne : ses boutons, le recommandé distingué, le prix au survol ; en route, ils attendent ; en attente de la box, ils s'effacent", () => {
  const boutons = (poses: Faux[]) => poses.flatMap((pose) => [pose, ...pose.descendants()]).filter((pose) => pose.balise === "button" && pose.className !== "aide");
  const repos = poserLesDecisions(doc, LIVRAISON, {}, [], RIEN) as Faux[];
  assert.deepEqual(boutons(repos).map((pose) => [pose.textContent, pose.className, pose.disabled]), [
    ["merge the PR", "recommande", false],
    ["send back to the kitchen", "", false],
    ["remove from the rail", "", false],
  ]);
  const envoi = poserLesDecisions(doc, LIVRAISON, { suivi: { decision: { geste: "merge", ticket: 18 }, etape: "envoi" } }, [], RIEN) as Faux[];
  assert.equal(envoi[0]?.textContent, "merge the PR: sending…");
  assert.deepEqual(boutons(envoi).map((pose) => pose.disabled), [true, true, true]);
  const attente = poserLesDecisions(doc, LIVRAISON, { suivi: { decision: { geste: "merge", ticket: 18 }, etape: "poste", commentaire: COMMENTAIRE } }, [], RIEN) as Faux[];
  assert.equal(attente.length, 1);
  assert.equal(boutons(attente).length, 0);
  // Une carte : ses choix et son champ, puis « remove from the rail ».
  const carte = poserLesDecisions(doc, CARTE, {}, [], RIEN) as Faux[];
  assert.deepEqual(boutons(carte).map((pose) => pose.textContent), ["Green", "Blue", "send", "remove from the rail"]);
});
