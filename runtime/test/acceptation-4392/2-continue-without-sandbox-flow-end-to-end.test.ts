// #4392 : sur une machine représentée sans bac à sable, le chef décide, la cuisine s'ouvre et un
// cook va à sa fin avec le faux `claude` (BRIGADE_CLAUDE_BIN) ; la ligne de la station et l'écran
// portent « restricted mode: no sandbox ».
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { brancheDuTicket } from "../../src/brigade-github.ts";
import { ouvrirJournal } from "../../src/journal.ts";
import { accepterSansBacASable } from "../../src/onboarding/attente.ts";
import { lireFaitsDuProjet } from "../../src/onboarding/lire.ts";
import { etatDOnboarding } from "../../src/onboarding/etat.ts";
import { brancherGardeFous } from "../../src/garde-fous.ts";
import { demarrer } from "../../src/runtime.ts";
import { ouvrirCuisine } from "../../src/station/cuisine.ts";
import { CLONES, environnementDuProjet, lireConfiguration } from "../../src/station/configuration.ts";
import { projetSurGit } from "../aides/projet-sur-git.ts";
import { DEPOT, ENV_ENFANT, FAUX_CLAUDE, fauxGh, issueGitHub, repertoireTemporaire, temporaireDuFichier } from "../outils.ts";

const rienNeReste = temporaireDuFichier();

test("le chef continue sans bac à sable, la cuisine s'ouvre, un cook va à sa fin : la station et l'écran disent « restricted mode: no sandbox »", async (t: TestContext) => {
  const racine = repertoireTemporaire(t);
  projetSurGit(t, { reglages: { integrationBranch: "v2" }, clone: join(racine, CLONES, "brigade") });
  const [projet] = lireConfiguration(`brigade ${DEPOT}`).projets;
  assert.ok(projet);
  const gh = fauxGh(t);
  gh.repondre("user", { corps: { login: "chef" } });
  gh.repondre(`repos/${DEPOT}`, { corps: { full_name: DEPOT, owner: { login: "acme", type: "Organization" }, permissions: { push: true } } });
  gh.issues([issueGitHub(7, { labels: ["fire", "model:sonnet", "effort:low"] })]);
  gh.repondre(`repos/${DEPOT}/issues/7/events?per_page=100`, { corps: [] });
  gh.repondre(`repos/${DEPOT}/pulls?head=${DEPOT.split("/")[0]}:${brancheDuTicket(7)}&state=all&per_page=1`, { corps: [] });
  gh.repondre(`repos/${DEPOT}/commits/v2/check-runs?per_page=100`, { corps: { check_runs: [] } });
  gh.repondre(`repos/${DEPOT}/commits/v2/status?per_page=100`, { corps: { statuses: [] } });
  gh.repondre(`repos/${DEPOT}/issues/7/comments`, { statut: 201, corps: { id: 1, body: "<!-- brigade:prise station=box/claude -->\nTaken by station `box/claude`.", author_association: "OWNER", user: { login: "chef" } } });
  gh.repondre(`repos/${DEPOT}/issues/7/comments?per_page=100`, { corps: [{ id: 1, body: "<!-- brigade:prise station=box/claude -->\nTaken by station `box/claude`.", author_association: "OWNER", user: { login: "chef" } }] });
  gh.repondre(`repos/${DEPOT}/pulls?state=open&per_page=100`, { corps: [] });
  const env = environnementDuProjet(racine, projet, { HOME: repertoireTemporaire(t), BRIGADE_CLAUDE_BIN: FAUX_CLAUDE, BRIGADE_SESSION_STATE: join(racine, "session", "renouvellement"), BRIGADE_GH_BIN: gh.bin, BRIGADE_MAX_LOAD_PER_CORE: "1000000", BRIGADE_MIN_FREE_MEMORY_MB: "0", BRIGADE_MIN_FREE_DISK_MB: "0" });
  const etat = env.BRIGADE_STATE_DIR ?? "";
  mkdirSync(etat, { recursive: true });
  const journal = ouvrirJournal(etat);
  const decisions = { BRIGADE_STATIONS: "box/claude:2:code", BRIGADE_MANAGER_MODEL: "sonnet", BRIGADE_MANAGER_EFFORT: "medium", BRIGADE_REVIEWER_MODEL: "sonnet", BRIGADE_REVIEWER_EFFORT: "medium" };
  for (const [name, value] of Object.entries(decisions)) journal.ajouter({ project: "brigade", ticket: null, author: "chef", type: "decision.set", payload: { name, value, previous: null } });
  journal.fermer();

  // Le chef décide : une décision, une seule.
  accepterSansBacASable({ repertoireEtat: etat, station: "box" });

  const dits: string[] = [];
  const cuisine = ouvrirCuisine(env, { dire: (dit) => void dits.push(dit), intervalleTickMs: 50 });
  try {
    // La cuisine s'ouvre sans bac à sable : sa ligne le dit, en mode restreint.
    const ligne = dits.filter((dit) => /restricted mode: no sandbox/.test(dit)).join("\n");
    assert.match(ligne, /restricted mode: no sandbox/, dits.join("\n"));
    assert.match(ligne, /sed -i/);
    assert.match(ligne, /curl -o/);
  } finally {
    cuisine.arreter("fin du test");
    await cuisine.arretee?.();
  }

  // Un cook va à sa fin, avec le faux `claude`, dans le journal de ce projet.
  const runtime = brancherGardeFous({ plafonds: { durationMs: 3_600_000, tokens: 1_000_000, idleMs: 60_000 }, seuilDisjoncteur: 3, graceMs: 2000 }, demarrer({ repertoireEtat: etat, projet: "brigade", intervalleVeilleMs: 5 }));
  t.after(() => runtime.arreter("test"));
  const fin = await runtime.lancer({ ticket: 7, commande: FAUX_CLAUDE, args: [], env: { ...ENV_ENFANT, FAUX_CLAUDE: "fini" } }).fin;
  assert.equal(fin.outcome, "ok");
  assert.ok(runtime.journal.duTicket(7).some((e) => e.type === "cook.exited"));

  // L'écran : l'étape de la machine, d'après le journal du projet.
  const faits = lireFaitsDuProjet(etat);
  assert.equal(faits.sansBacASable, true);
  const machine = etatDOnboarding({ projet: "brigade", depot: DEPOT, station: "box", suivi: { etat: "servi", dit: "served by box", autoriser: [] }, clone: true, ...faits }).etapes.find(({ etape }) => etape === "machine");
  assert.match(machine?.dit ?? "", /restricted mode: no sandbox/);
});

test("2-continue-without-sandbox-flow-end-to-end.test.ts ne laisse rien dans le répertoire temporaire", rienNeReste);
