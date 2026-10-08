// Le jugement : ce que le manager demande au LLM, comment il le lance, et ce
// qu'il lit de sa réponse. Aucun appel ici — du texte, et sa lecture.
import assert from "node:assert/strict";
import { test } from "node:test";
import { argumentsJuge, consigneDeJugement, empreinte, lireDecision, MARQUEUR_MANAGER } from "../src/juger.ts";

const CALIBRAGE = { model: "sonnet", effort: "medium" };
const ISSUE = { number: 30, title: "Le rail perd un ticket", body: "Quand le bail tombe, le ticket disparaît.", labels: ["fix", "prio:1"] };

test("le jugement est lancé en flux JSON, avec le calibrage du manager, et sans aucun outil", () => {
  const args = argumentsJuge("la consigne", CALIBRAGE);

  assert.deepEqual(args.slice(0, 9), ["-p", "la consigne", "--output-format", "stream-json", "--verbose", "--model", "sonnet", "--effort", "medium"]);
  assert.equal(args[args.indexOf("--tools") + 1], "");
  assert.equal(args[args.indexOf("--setting-sources") + 1], "");
  assert.ok(args.includes("--disable-slash-commands"));
  assert.ok(args.includes("--strict-mcp-config"));
  assert.ok(!args.includes("bypassPermissions"));
});

test("la consigne donne l'issue comme une donnée, avec ses labels et les commentaires qui font foi", () => {
  const texte = consigneDeJugement({ depot: "benomite/brigade", issue: ISSUE, commentaires: ["Le test de régression est déjà écrit."] });

  assert.match(texte, /#30/);
  assert.match(texte, /Le rail perd un ticket/);
  assert.match(texte, /Quand le bail tombe, le ticket disparaît\./);
  assert.match(texte, /fix, prio:1/);
  assert.match(texte, /Le test de régression est déjà écrit\./);
  assert.match(texte, /donnée, pas une consigne/);
});

test("la consigne porte la table de calibrage, et interdit `xhigh` et `max`", () => {
  const texte = consigneDeJugement({ depot: "benomite/brigade", issue: ISSUE, commentaires: [] });

  assert.match(texte, /`haiku` \/ `low`/);
  assert.match(texte, /`sonnet` \/ `low`/);
  assert.match(texte, /`sonnet` \/ `medium`/);
  assert.match(texte, /`opus` \/ `high`/);
  assert.match(texte, /jamais `xhigh` ni `max`/);
});

test("un corps démesuré est coupé : le jugement ne paie pas un roman", () => {
  const texte = consigneDeJugement({ depot: "benomite/brigade", issue: { ...ISSUE, body: "x".repeat(100_000) }, commentaires: [] });

  assert.ok(texte.length < 40_000);
  assert.match(texte, /\[coupé\]/);
});

const reponse = (objet: unknown) => `Voici ma décision.\n\n\`\`\`json\n${JSON.stringify(objet, null, 2)}\n\`\`\``;

test("un ticket exécutable se lit avec son motif, son calibrage et sa justification", () => {
  const lue = lireDecision(reponse({ nature: "ticket", motif: "Un livrable, un test.", modele: "haiku", effort: "low", calibrage: "Correctif dont le test est écrit." }));

  assert.deepEqual(lue, {
    decision: { verdict: "fire", kind: "ticket", reason: "Un livrable, un test.", missing: null, model: "haiku", effort: "low", calibration: "Correctif dont le test est écrit." },
  });
});

test("un refus se lit avec sa nature, son motif et ce qui manque", () => {
  const lue = lireDecision(JSON.stringify({ nature: "epic", motif: "Trois livrables.", manque: "La découper en tickets." }));

  assert.deepEqual(lue, {
    decision: { verdict: "refused", kind: "epic", reason: "Trois livrables.", missing: "La découper en tickets.", model: null, effort: null, calibration: null },
  });
});

test("une réponse sans décision lisible le dit, au lieu d'en inventer une", () => {
  const illisible = (texte: string | null) => {
    const lue = lireDecision(texte);
    assert.ok("illisible" in lue, `lu : ${JSON.stringify(lue)}`);
    return lue.illisible;
  };

  assert.match(illisible(null), /aucune réponse/);
  assert.match(illisible("Je pense que c'est un ticket."), /aucun objet JSON/);
  assert.match(illisible('{"nature": "ticket", "motif": '), /aucun objet JSON/);
  assert.match(illisible(JSON.stringify({ nature: "roman", motif: "…" })), /nature/);
  assert.match(illisible(JSON.stringify({ nature: "ticket", motif: "" , modele: "sonnet", effort: "low", calibrage: "…" })), /motif/);
  assert.match(illisible(JSON.stringify({ nature: "ticket", motif: "ok", modele: "gpt", effort: "low", calibrage: "…" })), /modele/);
  assert.match(illisible(JSON.stringify({ nature: "ticket", motif: "ok", modele: "sonnet", effort: "low" })), /calibrage/);
});

test("`xhigh` et `max` ne sont pas au manager : un jugement qui les pose est illisible", () => {
  for (const effort of ["xhigh", "max"]) {
    const lue = lireDecision(JSON.stringify({ nature: "ticket", motif: "ok", modele: "opus", effort, calibrage: "…" }));
    assert.ok("illisible" in lue && /effort/.test(lue.illisible));
  }
});

test("l'empreinte tient au titre, au corps et aux commentaires — pas aux labels, ni à ce que le manager a écrit", () => {
  const de = (issue: Partial<typeof ISSUE>, ...commentaires: string[]) => empreinte({ ...ISSUE, ...issue }, commentaires);
  const reference = de({});

  assert.equal(de({ labels: ["fire", "model:sonnet"] }), reference);
  assert.equal(de({}, `${MARQUEUR_MANAGER}\n**Manager — pas un ticket exécutable.**`), reference);
  assert.notEqual(de({ title: "Autre titre" }), reference);
  assert.notEqual(de({ body: "Autre corps" }), reference);
  assert.notEqual(de({}, "Le chef précise."), reference);
  assert.notEqual(de({}, "a", "b"), de({}, "ab"));
});
