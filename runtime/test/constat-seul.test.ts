// Un ticket dont les critères admettent un constat écrit se sert sans commit
// (#2854). Les tests de station passent par `stationDuDepot`, dont le faux
// `claude` ne commite rien et finit sur un `<livrable>`.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { priseDeLaStation, stationDuDepot, type Lancer } from "../src/brigade-github.ts";
import { admetUnConstat, MARQUE_DE_CONSTAT } from "../src/constat-seul.ts";
import { HORS_CUISINE } from "../src/github.ts";
import { MARQUE_D_ECHEC } from "../src/qualite-github.ts";
import { FauxGitHub, fauxClient } from "./faux-github.ts";

const TICKET = 826;
const DIAGNOSTIC = [
  "## Context",
  "",
  "The empty-rail alert fired while tickets were cookable.",
  "",
  "## Acceptance criteria",
  "",
  "- Find the root cause of the alert.",
  "- When the cause is outside the repository, the deliverable is a written comment on the issue with no code change.",
].join("\n");
const LIVRAISON = ["## Context", "", "The alert is wrong.", "", "## Acceptance criteria", "", "- The alert no longer fires on waiting tickets.", "- A test covers it."].join("\n");
const CONSTAT = "Root cause: the detector counted waiting tickets as cookable; fixed upstream by #2848.";

// Une station dont le cook ne commite rien et finit sur `message`, sur un ticket de corps `corps`, jouée `tours` fois.
async function cookSansCommit(t: TestContext, corps: string, message: string, tours = 1) {
  const repertoire = mkdtempSync(join(tmpdir(), "constat-seul-"));
  t.after(() => rmSync(repertoire, { recursive: true, force: true }));
  const faux = new FauxGitHub();
  faux.feu(TICKET, ["fire", "model:opus", "effort:medium"], corps);
  const lancer: Lancer = ({ flux }) => {
    writeFileSync(flux, `${JSON.stringify({ type: "result", is_error: false, result: message })}\n`);
    return { fin: Promise.resolve({ code: 0, signal: null, turns: 12, tokens: 1, durationMs: 1, arret: null, erreur: null }) };
  };
  let heure = Date.parse("2026-11-08T03:43:00Z");
  const station = stationDuDepot({
    nom: "box",
    places: 1,
    base: "main",
    depotGitHub: "faux/depot",
    github: fauxClient(faux),
    depot: {
      connait: () => false,
      preparer: async (run) => ({ worktree: join(repertoire, run), branche: `cook/${TICKET}-github` }),
      reprendre: async (run) => join(repertoire, run),
      retirer: () => {},
      ranger: async () => null,
      pousser: () => {},
      commits: () => 0,
      changes: () => [],
      diff: () => "",
      tete: () => "a".repeat(40),
    },
    prise: priseDeLaStation,
    claude: "claude",
    env: {},
    cloison: null,
    plafonds: { durationMs: 60_000, tokens: 1_000, idleMs: 60_000 },
    graceMs: 1,
    reviewer: { model: "sonnet", effort: "medium" },
    flux: repertoire,
    lancer,
    maintenant: () => new Date(heure),
    avertir: () => {},
  });
  assert.ok(!("refus" in station));
  if ("refus" in station) throw new Error(String(station.refus));
  for (let i = 0; i < tours; i += 1) {
    await station.tour();
    await station.calme();
    heure += 24 * 3_600_000;
  }
  return { faux, corps: (faux.commentaires.get(TICKET) ?? []).map((c) => c.body) };
}

test("a diagnosis-only ticket whose cook commits nothing and delivers a finding is served: the finding is posted, the ticket closed, no echec and no served-elsewhere (#2854)", async (t) => {
  const { faux, corps } = await cookSansCommit(t, DIAGNOSTIC, `I read the detector.\n\n<livrable>\n${CONSTAT}\n</livrable>\n\n<retro></retro>`);
  const constat = corps.filter((c) => c.startsWith(MARQUE_DE_CONSTAT));
  assert.equal(constat.length, 1);
  assert.ok(constat[0]?.includes(CONSTAT));
  assert.doesNotMatch(constat[0] ?? "", /I read the detector/);
  assert.equal(corps.filter((c) => c.startsWith(MARQUE_D_ECHEC)).length, 0);
  assert.equal(faux.ticket(TICKET).labels.has(HORS_CUISINE), false);
  assert.equal(faux.ticket(TICKET).state, "closed");
});

test("a delivery-expecting ticket whose cook commits nothing still records an echec, finding or not (#2854)", async (t) => {
  const { faux, corps } = await cookSansCommit(t, LIVRAISON, `<livrable>\n${CONSTAT}\n</livrable>`);
  assert.equal(corps.filter((c) => c.startsWith(MARQUE_D_ECHEC)).length, 1);
  assert.equal(corps.filter((c) => c.startsWith(MARQUE_DE_CONSTAT)).length, 0);
  assert.equal(faux.ticket(TICKET).state, "open");
});

test("a diagnosis-only ticket whose cook commits nothing and delimits no deliverable records an echec, and is set aside as before (#2854)", async (t) => {
  const { faux, corps } = await cookSansCommit(t, DIAGNOSTIC, "I looked around and found nothing conclusive.", 2);
  // Deux arrêts de suite au même motif suffisent à l'écarter (#2729).
  assert.equal(corps.filter((c) => c.startsWith(MARQUE_D_ECHEC)).length, 2);
  assert.equal(corps.filter((c) => c.startsWith(MARQUE_DE_CONSTAT)).length, 0);
  assert.equal(faux.ticket(TICKET).labels.has(HORS_CUISINE), true);
  assert.equal(faux.ticket(TICKET).state, "open");
});

test("only the acceptance criteria saying the deliverable is a written finding or comment admit a finding, never a quote of them (#2854)", () => {
  assert.equal(admetUnConstat(DIAGNOSTIC), true);
  assert.equal(admetUnConstat("## Critères d'acceptation\n\n- Le livrable est un constat écrit sur l'issue, sans changement de code."), true);
  assert.equal(admetUnConstat(LIVRAISON), false);
  // Sans section de critères, le ticket attend un commit.
  assert.equal(admetUnConstat("The deliverable is a written finding in the issue."), false);
  // Dit ailleurs que dans les critères : le contexte n'en décide pas.
  assert.equal(admetUnConstat("## Context\n\nThe deliverable is a written finding.\n\n## Acceptance criteria\n\n- A test covers it."), false);
  // Cité : un ticket qui parle de ces tickets n'en est pas un.
  assert.equal(admetUnConstat('## Acceptance criteria\n\n- A ticket whose criteria say "the deliverable is a written finding" is closed with it.'), false);
  assert.equal(admetUnConstat("## Acceptance criteria\n\n> the deliverable is a written finding\n\n- A test covers it."), false);
  assert.equal(admetUnConstat("## Acceptance criteria\n\n- `the deliverable is a written comment` is recognised."), false);
  // Le corps de #2854 lui-même attend un commit.
  assert.equal(
    admetUnConstat(
      [
        "## Context",
        "",
        '- Same family: manager comment on #826 itself said "the deliverable is a written finding in the issue".',
        "",
        "## Acceptance criteria",
        "",
        "- When a cook stops without a commit and its final message carries a deliverable on a ticket whose criteria allow a finding-only outcome, the station posts that message as an issue comment and closes the ticket.",
        "- A test drives a fake cook that commits nothing and returns a finding for a diagnosis-only ticket.",
      ].join("\n"),
    ),
    false,
  );
});
