// La pass juge une livraison de la même façon, quel que soit le moteur qui l'a cuisinée (#3748) : même diff, même
// ticket, mêmes critères, la station étiquetée de chacun des trois moteurs — le verdict et ses raisons sont identiques.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { stationDuDepot, type Lancer } from "../../src/brigade-github.ts";
import { FauxGitHub, fauxClient, STATION_DU_DEPOT } from "../faux-github.ts";

const MOTEURS = ["claude-subscription", "claude-api-key", "codex"] as const;
const CORPS = "## Context\n\nCONTEXTE\n\n## Acceptance criteria\n\n- It adds two numbers\n- The doc says so";
const DIFF = "diff --git a/lib/somme.ts b/lib/somme.ts\n+export const somme = (a, b) => a + b;\n";

// La pass juge la livraison du ticket 11, cuisinée par une station `box/<moteur>` dont le cook rend son compte à la
// manière de son moteur ; la relecture répond `constats`. Rend ce que la pass écrit : le verdict de la PR, et le renvoi.
async function parLaStation(t: TestContext, moteur: (typeof MOTEURS)[number], constats: unknown[]) {
  const repertoire = mkdtempSync(join(tmpdir(), "passe-moteur-"));
  t.after(() => rmSync(repertoire, { recursive: true, force: true }));
  const faux = new FauxGitHub();
  faux.feu(11, ["fire", "model:opus", "effort:high", "tech"], CORPS);
  const lancer: Lancer = ({ args, flux }) => {
    const reviewer = args.includes("--tools");
    const bloque = constats.some((c) => (c as { gravite: string }).gravite === "bloquant");
    const relecture = { verdict: bloque ? "rouge" : "vert", resume: "Read against the criteria.", constats, criteres: [{ critere: 1, tests: [], relecture: true }, { critere: 2, tests: [], relecture: true }] };
    writeFileSync(flux, `${JSON.stringify({ type: "result", is_error: false, result: reviewer ? JSON.stringify(relecture) : `[${moteur}] I added the sum and wrote the doc.` })}\n`);
    return { fin: Promise.resolve({ code: 0, signal: null, turns: 30, tokens: 1, durationMs: 1, arret: null, erreur: null }) };
  };
  const station = stationDuDepot({
    ...STATION_DU_DEPOT,
    nom: `box/${moteur}`,
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
    env: { PATH: process.env.PATH },
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
  const renvoi = (faux.commentaires.get(11) ?? []).find((c) => c.body.startsWith("<!-- brigade:renvoi"))?.body ?? "";
  return { merge: faux.mergee(11) !== undefined, verdict, renvoi };
}

// Ce que la pass dit d'une livraison, sans le nom de la station qui la signe : la signature porte le moteur, le jugement non.
const sansMoteur = (texte: string, moteur: string) => texte.split(`box/${moteur}`).join("<station>");

test("one green delivery, labelled with each engine, gets the same verdict from the pass", async (t) => {
  const jugements = [];
  for (const moteur of MOTEURS) jugements.push({ moteur, ...(await parLaStation(t, moteur, [])) });
  for (const { moteur, merge, verdict } of jugements) {
    assert.ok(merge, `${moteur}: merged`);
    assert.match(verdict, /verdict=approve/, moteur);
  }
  const [premier, ...autres] = jugements;
  for (const autre of autres) assert.equal(sansMoteur(autre.verdict, autre.moteur), sansMoteur(premier!.verdict, premier!.moteur), `${autre.moteur} judged as ${premier!.moteur}`);
});

test("one failing delivery, labelled with each engine, is sent back for the same reasons", async (t) => {
  const constats = [
    { gravite: "bloquant", categorie: "critere-non-tenu", fichier: "lib/somme.ts", constat: "It breaks criterion 1." },
    { gravite: "remarque", fichier: null, constat: "A test more would help." },
  ];
  const jugements = [];
  for (const moteur of MOTEURS) jugements.push({ moteur, ...(await parLaStation(t, moteur, constats)) });
  for (const { moteur, merge, verdict, renvoi } of jugements) {
    assert.ok(!merge, `${moteur}: not merged`);
    assert.match(verdict, /verdict=request-changes[\s\S]*Criterion of the ticket not met — It breaks criterion 1\./, moteur);
    assert.match(renvoi, /Criterion of the ticket not met — It breaks criterion 1\./, moteur);
  }
  const [premier, ...autres] = jugements;
  for (const autre of autres) {
    assert.equal(sansMoteur(autre.verdict, autre.moteur), sansMoteur(premier!.verdict, premier!.moteur), `${autre.moteur} verdict as ${premier!.moteur}`);
    assert.equal(sansMoteur(autre.renvoi, autre.moteur), sansMoteur(premier!.renvoi, premier!.moteur), `${autre.moteur} send-back as ${premier!.moteur}`);
  }
});
