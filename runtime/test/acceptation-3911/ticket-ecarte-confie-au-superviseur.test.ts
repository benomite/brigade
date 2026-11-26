// #3911, criterion 5: a ticket set aside for its failures is handed to the supervisor — the project's manager, which
// receives a dossier — and it acts on it only with the gestures of step 4 of
// docs/superpowers/specs/2026-11-20-kitchen-spinning.md: rerun failed CI jobs; put a ticket back on the rail with
// a note; park a ticket for a third party; close a duplicate or a stale alert; file one `fix` ticket; post a TODO
// card. Since #4129 the station parks it (`parked`, its marker saying it waits for the supervisor for its failures)
// instead of labelling it `set-aside:failures`. The `claude` of this test records the dossier it is given, then ends well.
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { corpsDuParking } from "../../src/attente-github/marque.ts";
import { ouvrirJournal } from "../../src/journal.ts";
import { ouvrirCuisine } from "../../src/station/cuisine.ts";
import { CLONES, environnementDuProjet, lireConfiguration } from "../../src/station/configuration.ts";
import { projetSurGit } from "../aides/projet-sur-git.ts";
import { DEPOT, fauxGh, issueGitHub, jusqua, repertoireTemporaire, temporaireDuFichier } from "../outils.ts";

const rienNeReste = temporaireDuFichier();
const TICKET = 77;

// The `claude` that keeps what it is asked: its arguments, and what it reads on its input.
function claudeQuiNote(racine: string) {
  const bin = join(racine, "claude-qui-note");
  const dossiers = join(racine, "dossiers");
  mkdirSync(dossiers);
  writeFileSync(bin, `#!/usr/bin/env bash\nf="${dossiers}/$$-$RANDOM"\nprintf '%s\\n' "$@" >"$f"\ncat >>"$f"\necho '{"type":"result","subtype":"success","is_error":false,"num_turns":1,"result":"done"}'\n`);
  chmodSync(bin, 0o755);
  return { bin, dossiers: () => (existsSync(dossiers) ? require_(dossiers) : []) };
}
const require_ = (dossier: string) => readdirSync(dossier).map((nom) => readFileSync(join(dossier, nom), "utf8"));

function ouvrir(t: TestContext) {
  const racine = repertoireTemporaire(t);
  projetSurGit(t, { reglages: { integrationBranch: "v2" }, clone: join(racine, CLONES, "brigade") });
  const [projet] = lireConfiguration(`brigade ${DEPOT}`).projets;
  assert.ok(projet);
  const claude = claudeQuiNote(racine);
  const gh = fauxGh(t);
  gh.repondre("user", { corps: { login: "chef" } });
  gh.repondre(`repos/${DEPOT}`, { corps: { full_name: DEPOT, owner: { login: "acme", type: "Organization" }, permissions: { push: true } } });
  gh.issues([issueGitHub(TICKET, { labels: ["fire", "model:sonnet", "effort:low", "parked"] })]);
  // The marker the station leaves when it parks a ticket for its failures (`parquerSesEchecs`).
  gh.commentaires(TICKET, corpsDuParking({ what: "its cooks failed too many times, the station stopped relaunching it. The reason: the cook stopped", who: "the supervisor", followUp: "2099-01-01T00:00:00.000Z", failures: true }));
  gh.repondre(`repos/${DEPOT}/issues/${TICKET}/events?per_page=100`, { corps: [] });
  gh.repondre(`repos/${DEPOT}/issues/*`, { statut: 201, corps: { number: 900 } });
  gh.repondre(`repos/benomite/brigade/issues?*`, { corps: [] });
  const env = environnementDuProjet(racine, projet, { HOME: repertoireTemporaire(t), BRIGADE_CLAUDE_BIN: claude.bin, BRIGADE_SESSION_STATE: join(racine, "session", "renouvellement"), BRIGADE_GH_BIN: gh.bin });
  mkdirSync(env.BRIGADE_STATE_DIR ?? "", { recursive: true });
  const journal = ouvrirJournal(env.BRIGADE_STATE_DIR ?? "");
  const decisions = { BRIGADE_STATIONS: "box/claude:2:code", BRIGADE_MANAGER_MODEL: "sonnet", BRIGADE_MANAGER_EFFORT: "medium", BRIGADE_REVIEWER_MODEL: "sonnet", BRIGADE_REVIEWER_EFFORT: "medium" };
  for (const [name, value] of Object.entries(decisions)) journal.ajouter({ project: "brigade", ticket: null, author: "chef", type: "decision.set", payload: { name, value, previous: null } });
  journal.fermer();
  const cuisine = ouvrirCuisine(env, { dire: () => {} });
  // Every write the station made to the project's GitHub.
  const ecritures = () => gh.appels().filter((args) => args.some((arg) => ["POST", "PATCH", "PUT", "DELETE"].includes(arg)) && args.at(-1)?.startsWith(`repos/${DEPOT}/`));
  return { cuisine, claude, ecritures };
}

// The gestures of step 4, as a write to GitHub: the path (past the repository) and the arguments that make it one.
const GESTES: Array<[string, (chemin: string, args: string[]) => boolean]> = [
  // The supervisor never reruns a job nor puts a ticket back on the rail (#4233); closed, the ticket is unparked.
  ["unpark a ticket closed", (chemin, args) => chemin === `issues/${TICKET}/labels/parked` && args.includes("DELETE")],
  ["close a duplicate or a stale alert", (chemin, args) => /^issues\/\d+$/.test(chemin) && args.some((arg) => arg.includes("closed"))],
  ["file one fix ticket", (chemin, args) => chemin === "issues" && args.some((arg) => /^labels(\[\])?=fix$/.test(arg) || arg === "fix")],
  ["post a TODO card", (chemin, args) => /^issues\/\d+\/labels$/.test(chemin) && args.some((arg) => arg.includes("chef-todo"))],
  // The trace: one comment on the ticket it acted on — parked for a third party, the parking marker opens it.
  ["trace", (chemin) => /^issues\/\d+\/comments$/.test(chemin)],
];

test("a ticket parked for its failures is handed to the supervisor, which gets a dossier naming it", async (t) => {
  const { cuisine, claude } = ouvrir(t);
  try {
    await jusqua(() => claude.dossiers().some((dossier) => dossier.includes(`#${TICKET}`)), 2000);
  } finally {
    cuisine.arreter("fin du test");
    await cuisine.arretee?.();
  }
});

test("whatever the supervisor does to that ticket is one of the gestures listed in step 4 of the spec", async (t) => {
  const { cuisine, claude, ecritures } = ouvrir(t);
  try {
    await jusqua(() => claude.dossiers().some((dossier) => dossier.includes(`#${TICKET}`)), 2000);
    for (const args of ecritures()) {
      const chemin = (args.at(-1) ?? "").slice(`repos/${DEPOT}/`.length);
      // The station's own claim and healing writes are not the supervisor's: only writes on the ticket set aside count.
      if (!new RegExp(`^issues/${TICKET}(/|$)`).test(chemin)) continue;
      assert.ok(GESTES.some(([, est]) => est(chemin, args)), `not a gesture of step 4: ${args.join(" ")}`);
    }
  } finally {
    cuisine.arreter("fin du test");
    await cuisine.arretee?.();
  }
});

test("ticket-ecarte-confie-au-superviseur.test.ts ne laisse rien dans le répertoire temporaire", rienNeReste);
