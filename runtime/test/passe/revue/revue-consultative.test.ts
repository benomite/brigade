// La relecture de la pass conseille, sauf pour une liste nommée de catégories
// (#3504) : par la station, un constat hors de ces catégories est posté sur la
// PR comme un conseil et la livraison est mergée ; un constat d'une catégorie
// nommée la renvoie, le motif citant la catégorie. Le reviewer ne lit que les
// critères d'acceptation du ticket et le diff, jamais ce que le cook en dit.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { priseDeLaStation, stationDuDepot, type Lancer } from "../../../src/brigade-github.ts";
import { FauxGitHub, fauxClient } from "../../faux-github.ts";

const CORPS = "## Context\n\nCONTEXTE-DU-TICKET\n\n## Acceptance criteria\n\n- It adds two numbers\n- The doc says so";
const COMPTE_RENDU = "COMPTE-RENDU-DU-COOK: I added the sum and wrote the doc.";
const DIFF = "diff --git a/lib/somme.ts b/lib/somme.ts\n+export const somme = (a, b) => a + b;\n";

// Un cook qui livre en disant ce qu'il a fait, puis une relecture qui répond
// `constats` ; la pass juge. `tech` : aucun test ajouté n'est rejoué.
async function parLaStation(t: TestContext, constats: unknown[]) {
  const repertoire = mkdtempSync(join(tmpdir(), "revue-consultative-"));
  t.after(() => rmSync(repertoire, { recursive: true, force: true }));
  const faux = new FauxGitHub();
  faux.feu(11, ["fire", "model:opus", "effort:high", "tech"], CORPS);
  const consignes: string[] = [];
  const lancer: Lancer = ({ args, flux }) => {
    const reviewer = args.includes("--tools");
    if (reviewer) consignes.push(args[args.indexOf("-p") + 1] ?? "");
    const relecture = { verdict: constats.some((c) => (c as { gravite: string }).gravite === "bloquant") ? "rouge" : "vert", resume: "Read against the criteria.", constats, criteres: [{ critere: 1, tests: [], relecture: true }, { critere: 2, tests: [], relecture: true }] };
    writeFileSync(flux, `${JSON.stringify({ type: "result", is_error: false, result: reviewer ? JSON.stringify(relecture) : COMPTE_RENDU })}\n`);
    return { fin: Promise.resolve({ code: 0, signal: null, turns: 30, tokens: 1, durationMs: 1, arret: null, erreur: null }) };
  };
  const station = stationDuDepot({
    nom: "box",
    places: 1,
    base: "main",
    depotGitHub: "faux/depot",
    github: fauxClient(faux),
    depot: {
      connait: () => false,
      preparer: async (run) => ({ worktree: join(repertoire, run), branche: `cook/${run}` }),
      reprendre: async (run) => join(repertoire, run),
      retirer: () => {},
      ranger: async () => null,
      pousser: () => {},
      commits: () => 1,
      changes: () => ["lib/somme.ts"],
      diff: () => DIFF,
    },
    prise: priseDeLaStation,
    claude: "claude",
    env: { PATH: process.env.PATH },
    cloison: null,
    plafonds: { durationMs: 60_000, tokens: 1_000, idleMs: 60_000 },
    graceMs: 1,
    reviewer: { model: "sonnet", effort: "medium" },
    flux: repertoire,
    lancer,
    avertir: () => {},
  });
  if ("refus" in station) throw new Error(station.refus);
  for (let tour = 0; tour < 4 && faux.mergee(11) === undefined && !(faux.commentaires.get(11) ?? []).some((c) => c.body.startsWith("<!-- brigade:renvoi")); tour += 1) {
    await station.tour();
    await station.calme();
  }
  const pr = faux.prs.find((p) => p.branche === "cook/11-github")?.number ?? 0;
  const verdict = (faux.commentaires.get(pr) ?? []).find((c) => c.body.startsWith("<!-- brigade:verdict"))?.body ?? "";
  return { faux, consignes, verdict, ticket: (faux.commentaires.get(11) ?? []).map((c) => c.body).join("\n") };
}

test("a blocking finding outside the named categories does not send the delivery back: it is written on the PR as advice, and the delivery is merged", async (t) => {
  const { faux, verdict, ticket } = await parLaStation(t, [{ gravite: "bloquant", fichier: "lib/somme.ts", constat: "The name `somme` could be clearer." }]);
  assert.equal(faux.mergee(11)?.mergeePar, "box");
  assert.doesNotMatch(ticket, /brigade:renvoi/);
  assert.match(verdict, /verdict=approve[\s\S]*Read against the criteria\.\n- Advice \(`lib\/somme\.ts`\): The name `somme` could be clearer\./);
  assert.doesNotMatch(verdict, /\*\*Blocking\*\*/);
});

for (const [categorie, libelle] of [
  ["critere-non-tenu", "Criterion of the ticket not met"],
  ["securite", "Security risk"],
  ["perte-de-donnees", "Data loss"],
] as const) {
  test(`a finding in the named category \`${categorie}\` sends the delivery back, and the reason quotes the category by name`, async (t) => {
    const { faux, verdict, ticket } = await parLaStation(t, [
      { gravite: "bloquant", categorie, fichier: "lib/somme.ts", constat: "It breaks criterion 1." },
      { gravite: "remarque", fichier: null, constat: "A test more would help." },
    ]);
    assert.equal(faux.mergee(11), undefined);
    assert.match(verdict, new RegExp(`verdict=request-changes[\\s\\S]*- \\*\\*Blocking\\*\\* \\(\`lib/somme\\.ts\`\\): ${libelle} — It breaks criterion 1\\.\\n- Advice: A test more would help\\.`));
    assert.match(ticket, new RegExp(`brigade:renvoi n=1[\\s\\S]*sent back to a cook \\(1/2\\) — the review requested changes: [\\s\\S]*${libelle} — It breaks criterion 1\\.`));
  });
}

test("the reviewer is given the ticket's acceptance criteria and the diff, asked to find what breaks them, and never the cook's own account of the work", async (t) => {
  const { consignes } = await parLaStation(t, []);
  assert.equal(consignes.length, 1);
  const consigne = consignes[0] ?? "";
  assert.match(consigne, /Ses critères d'acceptation\. C'est contre eux que tu juges le diff : trouve ce qui les casse\.\n\n1\. It adds two numbers\n2\. The doc says so/);
  assert.ok(consigne.includes(`<diff>\n${DIFF}\n</diff>`), consigne);
  // Ni le compte-rendu du cook, ni la description de la PR, ni le reste du corps du ticket.
  for (const absent of ["COMPTE-RENDU-DU-COOK", "Cooked by station", "CONTEXTE-DU-TICKET", "<compte-rendu>"]) assert.ok(!consigne.includes(absent), absent);
});
