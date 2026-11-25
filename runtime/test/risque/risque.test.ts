// #4230: the kinds of action, their default ranks, and the decision the pass reads; the `risks` field of the project
// sheet.
import assert from "node:assert/strict";
import { test } from "node:test";
import { reglagesDuTexte, ReglageRefuse, texteDuFichier, validerReglagesProjet } from "../../src/reglages-projet/reglages.ts";
import { classementDe, risqueDuTicket, type ClassementDesRisques } from "../../src/risque/risque.ts";

// The rank of one kind, under the ranking given.
const rang = (sorte: string, classement: ClassementDesRisques | null = null) => risqueDuTicket([`kind:${sorte}`], () => classement)?.rang;

test("a project sheet with no ranking gives 'chef' for publish, pay and write to a client, and 'safe' for fixing a typo", () => {
  for (const sorte of ["publish", "pay", "write-to-client"]) assert.equal(rang(sorte), "chef", sorte);
  assert.equal(rang("fix-typo"), "safe");
});

test("a kind that is not in the ranking gives 'chef', with or without a sheet's ranking", () => {
  assert.equal(rang("delete-production-data"), "chef");
  assert.equal(rang("delete-production-data", { "fix-typo": "safe", publish: "safe" }), "chef");
});

test("the sheet's rank wins over the default, either way", () => {
  assert.equal(rang("publish", { publish: "safe" }), "safe");
  assert.equal(rang("fix-typo", { "fix-typo": "chef" }), "chef");
  assert.equal(rang("rename-a-file", { "rename-a-file": "safe" }), "safe");
});

test("a ticket's kinds come from its `kind:` labels, said plainly; one kind ranked 'chef' is enough to park it", () => {
  assert.equal(risqueDuTicket(["fire", "model:sonnet"], () => null), null);
  assert.deepEqual(risqueDuTicket(["fire", "kind:fix-typo", "model:sonnet"], () => null), { rang: "safe", ceQuIlFera: "fix a typo", pourquoi: "its kinds of action are ranked 'safe': fix-typo" });
  assert.deepEqual(risqueDuTicket(["kind:fix-typo", "kind:write-to-client"], () => null), {
    rang: "chef",
    ceQuIlFera: "fix a typo and write to a client",
    pourquoi: "its kind of action is ranked 'chef' in the project's risk ranking: write-to-client",
  });
  assert.equal(risqueDuTicket(["kind:go-live"], () => null)?.ceQuIlFera, "go live");
});

test("a sheet that cannot be read parks the action for the chef, and says why — nothing is guessed in its place", () => {
  const risque = risqueDuTicket(["kind:fix-typo"], () => {
    throw new Error("git show: bad object");
  });
  assert.equal(risque?.rang, "chef");
  assert.match(risque?.pourquoi ?? "", /risk ranking cannot be read \(git show: bad object\)/);
});

test("the `risks` field of the project sheet is read, written in a stable order, and refused when it is not a ranking", () => {
  const reglages = validerReglagesProjet({ integrationBranch: "main", risks: { pay: "chef", "fix-typo": "safe" } });
  assert.deepEqual(reglages.risks, { pay: "chef", "fix-typo": "safe" });
  const texte = texteDuFichier(reglages);
  assert.match(texte, /"risks": \{\n {4}"fix-typo": "safe",\n {4}"pay": "chef"\n {2}\}/);
  assert.deepEqual(reglagesDuTexte(texte).risks, { "fix-typo": "safe", pay: "chef" });
  // An empty ranking is no ranking: the defaults hold.
  assert.equal(validerReglagesProjet({ integrationBranch: "main", risks: {} }).risks, undefined);
  assert.doesNotMatch(texteDuFichier({ integrationBranch: "main" }), /risks/);

  assert.throws(() => validerReglagesProjet({ integrationBranch: "main", risks: { publish: "maybe" } }), (erreur: unknown) => erreur instanceof ReglageRefuse && erreur.cle === "risks.publish" && /must be `chef` or `safe`/.test(erreur.message));
  assert.throws(() => validerReglagesProjet({ integrationBranch: "main", risks: { "Publish!": "chef" } }), (erreur: unknown) => erreur instanceof ReglageRefuse && erreur.cle === "risks.Publish!");
  assert.throws(() => validerReglagesProjet({ integrationBranch: "main", risks: ["publish"] }), (erreur: unknown) => erreur instanceof ReglageRefuse && erreur.cle === "risks");
  assert.throws(() => classementDe(null), /`risks` must be an object/);
});
