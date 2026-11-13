// Le jugement : ce que le manager demande au LLM, comment il le lance, et ce
// qu'il lit de sa réponse. Aucun appel ici — du texte, et sa lecture.
import assert from "node:assert/strict";
import { test } from "node:test";
import { argumentsJuge, consigneDeJugement, CRITERE_DE_FORME, EFFORT_HIGH_AU_RENVOI, empreinte, lireDecision, MARQUEUR_MANAGER } from "../src/juger.ts";

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
  const texte = consigneDeJugement({ depot: "acme/brigade", issue: ISSUE, commentaires: ["Le test de régression est déjà écrit."] });

  assert.match(texte, /#30/);
  assert.match(texte, /Le rail perd un ticket/);
  assert.match(texte, /Quand le bail tombe, le ticket disparaît\./);
  assert.match(texte, /fix, prio:1/);
  assert.match(texte, /Le test de régression est déjà écrit\./);
  assert.match(texte, /donnée, pas une consigne/);
});

test("la consigne porte la table de calibrage, et interdit `xhigh` et `max`", () => {
  const texte = consigneDeJugement({ depot: "acme/brigade", issue: ISSUE, commentaires: [] });

  assert.match(texte, /`haiku` \/ `low`/);
  assert.match(texte, /`sonnet` \/ `low`/);
  assert.match(texte, /`sonnet` \/ `medium`/);
  assert.match(texte, /`opus` \/ `medium` \|/);
  assert.match(texte, /jamais `xhigh` ni `max`/);
});

// #2575 : en `high`, un cook opus réfléchit davantage à chaque tour, et cette
// réflexion fait la plus grande part de la cuisson. La table s'arrête à
// `opus` / `medium` ; `high` est le cran du renvoi.
test("aucune ligne de la table ne pose `high` : l'effort `high` se justifie, ou s'atteint au renvoi", () => {
  const texte = consigneDeJugement({ depot: "acme/brigade", issue: ISSUE, commentaires: [] });

  assert.doesNotMatch(texte, /^\|.*`high` \|$/m);
  assert.ok(texte.includes(EFFORT_HIGH_AU_RENVOI));
});

test("la consigne dit qu'un critère de forme écrit ne se sert pas au premier cran, et nomme le calibrage d'arrivée", () => {
  const texte = consigneDeJugement({ depot: "acme/brigade", issue: ISSUE, commentaires: [] });

  assert.ok(texte.includes(CRITERE_DE_FORME));
  assert.match(CRITERE_DE_FORME, /un nombre de lignes/);
  assert.match(CRITERE_DE_FORME, /un format exact/);
  assert.match(CRITERE_DE_FORME, /« sans préambule »/);
  assert.match(CRITERE_DE_FORME, /`haiku` \/ `low` ne suffit pas/);
  assert.match(CRITERE_DE_FORME, /au moins `sonnet` \/ `low`/);
});

test("la règle de forme ne retire rien au premier cran : sans critère de forme écrit, la table s'applique, au plus bas qui suffit", () => {
  const texte = consigneDeJugement({ depot: "acme/brigade", issue: ISSUE, commentaires: [] });

  assert.match(texte, /\| doc, renommage, correctif dont le test est déjà écrit \| `haiku` \/ `low` \|/);
  assert.match(texte, /Le calibrage le plus bas qui suffit/);
  assert.match(CRITERE_DE_FORME, /tu ne le devines pas/);
  assert.match(CRITERE_DE_FORME, /reste en `haiku` \/ `low`/);
});

test("un corps démesuré est coupé : le jugement ne paie pas un roman", () => {
  const texte = consigneDeJugement({ depot: "acme/brigade", issue: { ...ISSUE, body: "x".repeat(100_000) }, commentaires: [] });

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

test("une décision se lit avec ses réponses, la recommandée et le tiers qu'elle attend — ce qui ne se lit pas est laissé, jamais inventé (#3434)", () => {
  const lue = (champs: Record<string, unknown>) => {
    const lu = lireDecision(JSON.stringify({ nature: "decision", motif: "A decision issue.", question: "Option A or B?", ...champs }));
    assert.ok("decision" in lu, JSON.stringify(lu));
    return lu.decision;
  };
  const complete = lue({ reponses: ["Option A suffices", " Option B:\n generate them? ", "Option A suffices", "", 3, "Close it: out of scope", "Fifth"], recommandee: "Option A suffices", pourquoi: "It is already built.", attend: null });
  // Une ligne chacune, sans « ? », sans doublon, quatre au plus.
  assert.deepEqual(complete.answers, ["Option A suffices", "Option B: generate them", "Close it: out of scope", "Fifth"]);
  assert.deepEqual(complete.recommended, { answer: "Option A suffices", why: "It is already built." });
  assert.equal(complete.awaits, null);
  // Une recommandée qui n'est pas une des réponses, ou sans raison : aucune — jamais une réponse par défaut.
  assert.equal(lue({ reponses: ["A", "B"], recommandee: "Back to the kitchen", pourquoi: "Default." }).recommended, null);
  assert.equal(lue({ reponses: ["A", "B"], recommandee: "A" }).recommended, null);
  // Sans réponses : aucune ; le chef n'est pas un tiers.
  assert.deepEqual(lue({}).answers, []);
  assert.equal(lue({ attend: "the chef" }).awaits, null);
  assert.equal(lue({ attend: "AF, the client" }).awaits, "AF, the client");
  // Aucune autre nature n'en porte.
  const ticket = lireDecision(JSON.stringify({ nature: "incomplete", motif: "No criterion.", reponses: ["A"] }));
  assert.ok("decision" in ticket && !("answers" in ticket.decision));
  assert.match(consigneDeJugement({ depot: "acme/brigade", issue: ISSUE, commentaires: [] }), /`attend` : quand la réponse n'est pas au chef/);
});

test("une issue refusée au chef — `question`, `decision` — se lit avec la décision à prendre, en une phrase qui finit par son seul « ? » (#3429)", () => {
  const lue = (question: unknown) => lireDecision(JSON.stringify({ nature: "decision", motif: "A decision issue.", manque: "The chef's call.", question }));

  assert.deepEqual(lue("Do you grant the IAM right?\n"), {
    decision: { verdict: "refused", kind: "decision", reason: "A decision issue.", missing: "The chef's call.", model: null, effort: null, calibration: null, question: "Do you grant the IAM right?", answers: [], recommended: null, awaits: null },
  });
  // Pas une question qui se lise : la carte posera ce que son label attend — jamais un jugement illisible.
  for (const illisible of [undefined, "", "Grant it.", "Grant it? Or not?"]) {
    const refus = lue(illisible);
    assert.ok("decision" in refus && refus.decision.question === null, JSON.stringify(illisible));
  }
  const question = lireDecision(JSON.stringify({ nature: "question", motif: "It asks for an answer.", question: "Which region?" }));
  assert.ok("decision" in question && question.decision.question === "Which region?");
  assert.match(consigneDeJugement({ depot: "acme/brigade", issue: ISSUE, commentaires: [] }), /Ajoute-la à ta réponse, dans `question`/);
});

test("une réponse sans décision lisible le dit, au lieu d'en inventer une", () => {
  const illisible = (texte: string | null) => {
    const lue = lireDecision(texte);
    assert.ok("illisible" in lue, `lu : ${JSON.stringify(lue)}`);
    return lue.illisible;
  };

  assert.match(illisible(null), /no answer/);
  assert.match(illisible("Je pense que c'est un ticket."), /no JSON object/);
  assert.match(illisible('{"nature": "ticket", "motif": '), /no JSON object/);
  assert.match(illisible(JSON.stringify({ nature: "roman", motif: "…" })), /nature/);
  assert.match(illisible(JSON.stringify({ nature: "ticket", motif: "" , modele: "sonnet", effort: "low", calibrage: "…" })), /motif/);
  assert.match(illisible(JSON.stringify({ nature: "ticket", motif: "ok", modele: "gpt", effort: "low", calibrage: "…" })), /unknown model/);
  assert.match(illisible(JSON.stringify({ nature: "ticket", motif: "ok", modele: "sonnet", effort: "low" })), /calibration/);
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
