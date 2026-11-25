// #4235, critère 1 : when the review says 'send back' and the manager says 'accept', the dish is sent back.
// Test d'acceptation gelé (#3725) : par la station, un cook qui livre, une relecture qui répond, et la pass qui juge.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { stationDuDepot, type Lancer } from "../../src/brigade-github.ts";
import { FauxGitHub, fauxClient, STATION_DU_DEPOT } from "../faux-github.ts";
import type { GitHub } from "../../src/github.ts";

const CORPS = "## Acceptance criteria\n\n- It adds two numbers";
const DIFF = "diff --git a/lib/somme.ts b/lib/somme.ts\n+export const somme = (a, b) => a + b;\n";

// `reponses` : le verdict de la relecture à chaque essai, dans l'ordre (`vert` ou `rouge`).
// `apres` : à chaque essai, le verdict qu'un autre agent (le manager…) poste sur la PR juste après celui de la relecture.
async function parLaStation(t: TestContext, reponses: Array<"vert" | "rouge">, apres: Array<"approve" | "request-changes" | null> = [], tours = 6) {
  const repertoire = mkdtempSync(join(tmpdir(), "acceptation-4235-"));
  t.after(() => rmSync(repertoire, { recursive: true, force: true }));
  const faux = new FauxGitHub();
  faux.feu(11, ["fire", "model:opus", "effort:high", "tech"], CORPS);
  const journal: string[] = [];
  let relectures = 0;
  const lancer: Lancer = ({ args, flux }) => {
    const reviewer = args.includes("--tools");
    const verdict = reponses[Math.min(relectures, reponses.length - 1)] as string;
    if (reviewer) relectures += 1;
    // Le cook d'un nouvel essai pousse : la tête de la PR change.
    else for (const pr of faux.prs) if (pr.branche === "cook/11-github") pr.sha = faux.sha();
    const constats = verdict === "rouge" ? [{ gravite: "bloquant", categorie: "critere-non-tenu", fichier: "lib/somme.ts", constat: "It breaks criterion 1." }] : [];
    const relecture = { verdict, resume: "Read against the criteria.", constats, criteres: [{ critere: 1, tests: [], relecture: true }] };
    writeFileSync(flux, `${JSON.stringify({ type: "result", is_error: false, result: reviewer ? JSON.stringify(relecture) : "done" })}\n`);
    return { fin: Promise.resolve({ code: 0, signal: null, turns: 30, tokens: 1, durationMs: 1, arret: null, erreur: null }) };
  };
  const client: GitHub = fauxClient(faux);
  const commenter = client.commenter;
  client.commenter = async (numero, corps) => {
    await commenter(numero, corps);
    const pr = corps.match(/^<!-- brigade:verdict station=\S+ verdict=\S+ sha=([0-9a-f]+) -->/);
    const autre = apres[Math.max(0, relectures - 1)] ?? null;
    if (pr !== null && autre !== null) {
      faux.poster(numero, "manager", `<!-- brigade:verdict station=manager verdict=${autre} sha=${pr[1]} -->\n${autre === "approve" ? "Approved" : "Changes requested"} by station \`manager\`.`);
    }
  };
  const station = stationDuDepot({
    ...STATION_DU_DEPOT,
    github: client,
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
    avertir: (texte) => void journal.push(texte),
  });
  if ("refus" in station) throw new Error(station.refus);
  for (let tour = 0; tour < tours && faux.mergee(11) === undefined; tour += 1) {
    await station.tour();
    await station.calme();
  }
  const ticket = (faux.commentaires.get(11) ?? []).map((c) => c.body).join("\n");
  const pr = faux.prs.find((p) => p.branche === "cook/11-github")?.number ?? 0;
  const verdicts = (faux.commentaires.get(pr) ?? []).map((c) => c.body).filter((b) => b.startsWith("<!-- brigade:verdict station=box"));
  return { faux, journal, ticket, verdicts, relectures: () => relectures };
}

test("the review sends the delivery back, the manager's later accept does not undo it: the delivery is not merged and goes back to its cook", async (t) => {
  const { faux, ticket, verdicts } = await parLaStation(t, ["rouge"], ["approve"], 2);
  assert.match(verdicts[0] ?? "", /verdict=request-changes/);
  assert.equal(faux.mergee(11), undefined);
  assert.match(ticket, /brigade:renvoi n=1[\s\S]*sent back to a cook/);
});
