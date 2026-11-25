// #4230: the kinds of action, their default ranks, and the decision function; the `risks` field of the project sheet.
import assert from "node:assert/strict";
import { test } from "node:test";
import { reglagesDuTexte, ReglageRefuse, texteDuFichier, validerReglagesProjet } from "../../src/reglages-projet/reglages.ts";
import { classementDe, ditDeLaSorte, rangDe, RANGS_PAR_DEFAUT, risqueDuTicket, sortesDuTicket } from "../../src/risque/risque.ts";

test("a project sheet with no ranking gives 'chef' for publish, pay and write to a client, and 'safe' for fixing a typo", () => {
  for (const sorte of ["publish", "pay", "write-to-client"]) assert.equal(rangDe(sorte, null), "chef", sorte);
  assert.equal(rangDe("fix-typo", null), "safe");
  assert.deepEqual(Object.keys(RANGS_PAR_DEFAUT).sort(), ["fix-typo", "pay", "publish", "write-to-client"]);
});

test("a kind that is not in the ranking gives 'chef', with or without a sheet's ranking", () => {
  assert.equal(rangDe("delete-production-data", null), "chef");
  assert.equal(rangDe("delete-production-data", { "fix-typo": "safe", publish: "safe" }), "chef");
});

test("the sheet's rank wins over the default, either way", () => {
  assert.equal(rangDe("publish", { publish: "safe" }), "safe");
  assert.equal(rangDe("fix-typo", { "fix-typo": "chef" }), "chef");
  assert.equal(rangDe("rename-a-file", { "rename-a-file": "safe" }), "safe");
});

test("a ticket's kinds come from its `kind:` labels; one kind ranked 'chef' is enough to park it", () => {
  assert.deepEqual(sortesDuTicket(["fire", "kind:publish", "model:sonnet", "kind:fix-typo"]), ["publish", "fix-typo"]);
  assert.equal(risqueDuTicket(["fire", "model:sonnet"], () => null), null);
  assert.deepEqual(risqueDuTicket(["kind:fix-typo"], () => null), { rang: "safe", ceQuIlFera: "fix a typo", pourquoi: "its kinds of action are ranked 'safe': fix-typo" });
  assert.deepEqual(risqueDuTicket(["kind:fix-typo", "kind:write-to-client"], () => null), {
    rang: "chef",
    ceQuIlFera: "fix a typo and write to a client",
    pourquoi: "its kind of action is ranked 'chef' in the project's risk ranking: write-to-client",
  });
  assert.equal(ditDeLaSorte("go-live"), "go live");
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
