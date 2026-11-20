// #3911, criterion 2: when the supervisor closes a breaker, it posts a comment on the affected ticket saying the
// breaker was closed and which cause is gone. Cooks that failed in a row: the tickets they failed on; a run that
// kept stalling: the ticket of that run. The check is a run, and the fake `claude` passes it (`fini`).
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { ouvrirJournal } from "../../src/journal.ts";
import { etatDesGardeFous } from "../../src/projections/guardrails.ts";
import { ouvrirCuisine } from "../../src/station/cuisine.ts";
import { CLONES, environnementDuProjet, lireConfiguration } from "../../src/station/configuration.ts";
import { projetSurGit } from "../aides/projet-sur-git.ts";
import { DEPOT, FAUX_CLAUDE, fauxGh, jusqua, repertoireTemporaire, temporaireDuFichier } from "../outils.ts";

const rienNeReste = temporaireDuFichier();
const LIMITES = { durationMs: 3_600_000, tokens: 2_000_000, idleMs: 600_000 };
const CALAGE = { run: "44-github-2222aaaa-r2", kind: "cook", turns: 1, tokens: 10, activity: { doing: "running", target: "cat" }, retries: 2 };

type Cause = "failures" | "stall";

// A kitchen whose log says the breaker opened for `cause`, the check being whatever `claude` does: `scenario`.
function ouvrir(t: TestContext, cause: Cause, scenario: "fini" | "echec") {
  const racine = repertoireTemporaire(t);
  projetSurGit(t, { reglages: { integrationBranch: "v2" }, clone: join(racine, CLONES, "brigade") });
  const [projet] = lireConfiguration(`brigade ${DEPOT}`).projets;
  assert.ok(projet);
  const gh = fauxGh(t);
  gh.repondre("user", { corps: { login: "chef" } });
  gh.repondre(`repos/${DEPOT}`, { corps: { full_name: DEPOT, owner: { login: "acme", type: "Organization" }, permissions: { push: true } } });
  gh.issues([]);
  gh.repondre(`repos/benomite/brigade/issues?*`, { corps: [] });
  gh.repondre(`repos/${DEPOT}/issues/*/comments`, { statut: 201, corps: {} });
  const env = environnementDuProjet(racine, projet, { HOME: repertoireTemporaire(t), BRIGADE_CLAUDE_BIN: FAUX_CLAUDE, FAUX_CLAUDE: scenario, BRIGADE_SESSION_STATE: join(racine, "session", "renouvellement"), BRIGADE_GH_BIN: gh.bin });
  mkdirSync(env.BRIGADE_STATE_DIR ?? "", { recursive: true });
  const journal = ouvrirJournal(env.BRIGADE_STATE_DIR ?? "");
  const decisions = { BRIGADE_STATIONS: "box/claude:2:code", BRIGADE_MANAGER_MODEL: "sonnet", BRIGADE_MANAGER_EFFORT: "medium", BRIGADE_REVIEWER_MODEL: "sonnet", BRIGADE_REVIEWER_EFFORT: "medium" };
  for (const [name, value] of Object.entries(decisions)) journal.ajouter({ project: "brigade", ticket: null, author: "chef", type: "decision.set", payload: { name, value, previous: null } });
  journal.ajouter({ project: "brigade", ticket: null, author: "runtime", type: "guard.configured", payload: { limits: LIMITES, breakerThreshold: 3 } });
  const lancer = (ticket: number, run: string, outcome: "failed" | "stalled") => {
    journal.ajouter({ project: "brigade", ticket, author: "runtime", type: "cook.launched", payload: { run, limits: LIMITES, stream: `runs/${run}.jsonl` } });
    journal.ajouter({ project: "brigade", ticket, author: "runtime", type: "cook.exited", payload: { run, outcome, code: 1, signal: null, turns: 3, tokens: 1000, durationMs: 1000 } });
  };
  if (cause === "failures") {
    for (const ticket of [31, 32, 33]) lancer(ticket, `${ticket}-github-0000000${ticket}`, "failed");
    journal.ajouter({ project: "brigade", ticket: null, author: "runtime", type: "breaker.opened", payload: { failures: 3, threshold: 3 } });
  } else {
    for (const attempt of ["", "-r1", "-r2"]) lancer(44, `44-github-2222aaaa${attempt}`, "stalled");
    journal.ajouter({ project: "brigade", ticket: null, author: "runtime", type: "breaker.opened", payload: { failures: 0, threshold: 3, stalled: CALAGE } });
  }
  journal.fermer();
  const dejaFinis = 3;
  const cuisine = ouvrirCuisine(env, { dire: () => {} });
  const lire = <T>(lecture: (journal: ReturnType<typeof ouvrirJournal>) => T): T => {
    const lu = ouvrirJournal(env.BRIGADE_STATE_DIR ?? "", { lectureSeule: true });
    try {
      return lecture(lu);
    } finally {
      lu.fermer();
    }
  };
  // The body of each comment the station posted, by ticket.
  const commentaires = () =>
    gh
      .appels()
      .filter((args) => args.includes("POST") && /\/issues\/\d+\/comments$/.test(args.at(-1) ?? ""))
      .map((args) => ({ ticket: Number(/issues\/(\d+)\/comments$/.exec(args.at(-1) ?? "")?.[1]), corps: args.find((arg) => arg.startsWith("body="))?.slice("body=".length) ?? "" }));
  return {
    cuisine,
    commentaires,
    ouvert: () => lire((lu) => etatDesGardeFous(lu.base).breakerOpenedAt !== null),
    // The check ran: a run ended after the ones the log already held.
    controleJoue: () => lire((lu) => lu.tout().filter((fait) => fait.type === "cook.exited").length > dejaFinis),
    // Closed because the check passed: a run that ended `ok` after the log's own, then the breaker lifted.
    leve: () =>
      lire((lu) => {
        const faits = lu.tout();
        const reussi = faits.findIndex((fait, i) => fait.type === "cook.exited" && (fait.payload as { outcome?: string }).outcome === "ok" && faits.slice(0, i).filter((avant) => avant.type === "cook.exited").length >= dejaFinis);
        return reussi >= 0 && faits.slice(reussi).some((fait) => fait.type === "breaker.lifted");
      }),
    // Closed at all, whatever the reason.
    leveParQui: () => lire((lu) => lu.tout().some((fait) => fait.type === "breaker.lifted")),
  };
}

const CAUSES: Record<Cause, { tickets: number[]; gone: RegExp }> = {
  failures: { tickets: [31, 32, 33], gone: /failed|failure/i },
  stall: { tickets: [44], gone: /stall|hung|silent/i },
};

for (const cause of ["failures", "stall"] as const) {
  test(`${cause}: closing the breaker posts a comment on the affected ticket saying it was closed and which cause is gone`, async (t) => {
    const { cuisine, commentaires } = ouvrir(t, cause, "fini");
    try {
      const { tickets, gone } = CAUSES[cause];
      const duBreaker = () => commentaires().filter((c) => tickets.includes(c.ticket) && /breaker/i.test(c.corps));
      await jusqua(() => duBreaker().length > 0, 10000);
      const [premier] = duBreaker();
      assert.match(premier?.corps ?? "", /closed/i);
      assert.match(premier?.corps ?? "", gone);
    } finally {
      cuisine.arreter("fin du test");
      await cuisine.arretee?.();
    }
  });
}

test("comment-a-la-fermeture.test.ts ne laisse rien dans le répertoire temporaire", rienNeReste);
