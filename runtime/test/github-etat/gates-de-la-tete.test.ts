// Les gates d'un projet sans CI sur ses PR, jouées par une station sur la tête
// et publiées en statut de commit (#2456) : une seule station les joue, les
// autres lisent son verdict, et une prise périmée se reprend.
import assert from "node:assert/strict";
import { test } from "node:test";
import { CONTEXTE_DES_GATES, GATES_PERIMEES_MS, jouerLesGatesDeLaTete, type GitHubDesGates, type LieuDesGates, type VerdictDesGates } from "../../src/github-etat/gates-de-la-tete.ts";
import type { StatutDeCommit } from "../../src/github.ts";

const SHA = "a".repeat(40);
const DEBUT = Date.parse("2026-11-05T15:00:00Z");

// Les statuts d'un commit sur GitHub, que plusieurs stations lisent et
// écrivent ; chaque statut reçoit l'id suivant et l'instant de l'horloge.
function commitSurGitHub() {
  const horloge = { maintenant: DEBUT };
  let id = 100;
  const statuts: StatutDeCommit[] = [];
  const github: GitHubDesGates = {
    statuts: async (sha, contexte) => statuts.filter((statut) => sha === SHA && statut.context === contexte),
    poserStatut: async (_sha, { state, context, description }) => {
      statuts.push({ id: ++id, state, context, description, createdAt: new Date(horloge.maintenant).toISOString() });
      return id;
    },
  };
  return { github, statuts, horloge };
}

// Un lieu des gates qui rend `verdict`, et ce qu'il a fait.
function lieu(verdict: VerdictDesGates | null = { vert: true, resume: "", detail: "" }) {
  const fait = { prepare: 0, joue: 0, libere: 0 };
  const preparer = async (): Promise<LieuDesGates> => {
    fait.prepare += 1;
    return {
      jouer: async () => {
        fait.joue += 1;
        return verdict;
      },
      liberer: () => void (fait.libere += 1),
    };
  };
  return { fait, preparer };
}

test("une tête sans statut : la station prend la tête par un pending, joue les gates et pose leur verdict", async () => {
  const commit = commitSurGitHub();
  const { fait, preparer } = lieu();
  const issue = await jouerLesGatesDeLaTete(SHA, { github: commit.github, station: "box/claude", preparer, maintenant: () => commit.horloge.maintenant });
  assert.deepEqual(issue, { issue: "jouees", verdict: { vert: true, resume: "", detail: "" } });
  assert.deepEqual(
    commit.statuts.map(({ state, context, description }) => [state, context, description]),
    [
      ["pending", CONTEXTE_DES_GATES, "Gates running on station box/claude"],
      ["success", CONTEXTE_DES_GATES, "Gates green on station box/claude"],
    ],
  );
  assert.deepEqual(fait, { prepare: 1, joue: 1, libere: 1 });
  // Jugée : aucune station ne les rejoue.
  const autre = lieu();
  assert.deepEqual(await jouerLesGatesDeLaTete(SHA, { github: commit.github, station: "mac/claude", preparer: autre.preparer, maintenant: () => commit.horloge.maintenant }), { issue: "jugee" });
  assert.equal(autre.fait.prepare, 0);
});

test("rouges : le statut est failure et dit ce qui a échoué, en 140 caractères au plus", async () => {
  const commit = commitSurGitHub();
  const { preparer } = lieu({ vert: false, resume: `FAIL  runtime/test/pass.test.ts ${"x".repeat(200)}`, detail: "- `FAIL ...`" });
  const issue = await jouerLesGatesDeLaTete(SHA, { github: commit.github, station: "box/claude", preparer, maintenant: () => commit.horloge.maintenant });
  assert.equal(issue.issue, "jouees");
  const verdict = commit.statuts.at(-1);
  assert.equal(verdict?.state, "failure");
  assert.match(verdict?.description ?? "", /^Gates red on station box\/claude: FAIL {2}runtime\/test\/pass\.test\.ts x+…$/);
  assert.equal(verdict?.description.length, 140);
});

test("une autre station les joue : on attend son verdict, sans rien poser ni préparer ; périmée, sa prise se reprend", async () => {
  const commit = commitSurGitHub();
  await commit.github.poserStatut(SHA, { state: "pending", context: CONTEXTE_DES_GATES, description: "Gates running on station mac/claude" });
  const { fait, preparer } = lieu();
  const options = { github: commit.github, station: "box/claude", preparer, maintenant: () => commit.horloge.maintenant };
  commit.horloge.maintenant = DEBUT + GATES_PERIMEES_MS - 1;
  assert.deepEqual(await jouerLesGatesDeLaTete(SHA, options), { issue: "tenues", par: "mac/claude" });
  assert.equal(fait.prepare, 0);
  assert.equal(commit.statuts.length, 1);
  // La station qui les jouait est tombée pendant : la prise périme, une autre reprend.
  commit.horloge.maintenant = DEBUT + GATES_PERIMEES_MS;
  assert.equal((await jouerLesGatesDeLaTete(SHA, options)).issue, "jouees");
  assert.deepEqual(commit.statuts.map(({ state }) => state), ["pending", "pending", "success"]);
});

test("deux stations prennent la tête au même instant : le plus ancien pending l'emporte, l'autre ne joue rien", async () => {
  const commit = commitSurGitHub();
  const mac = lieu();
  const box = lieu();
  // `mac` a posé son pending entre la lecture de `box` et le sien.
  const github: GitHubDesGates = {
    ...commit.github,
    poserStatut: async (sha, statut) => {
      await commit.github.poserStatut(sha, { state: "pending", context: CONTEXTE_DES_GATES, description: "Gates running on station mac/claude" });
      return commit.github.poserStatut(sha, statut);
    },
  };
  assert.deepEqual(await jouerLesGatesDeLaTete(SHA, { github, station: "box/claude", preparer: box.preparer, maintenant: () => commit.horloge.maintenant }), { issue: "tenues", par: "mac/claude" });
  assert.deepEqual(box.fait, { prepare: 1, joue: 0, libere: 1 });
  assert.equal(mac.fait.prepare, 0);
});

test("des gates qui ne peuvent pas se jouer ici ne prennent pas la tête ; coupées par l'arrêt, elles ne posent aucun verdict", async () => {
  const commit = commitSurGitHub();
  const options = { github: commit.github, station: "box/claude", maintenant: () => commit.horloge.maintenant };
  assert.deepEqual(await jouerLesGatesDeLaTete(SHA, { ...options, preparer: async () => ({ nonJouees: "the project has no gates" }) }), { issue: "non-jouees", motif: "the project has no gates" });
  assert.equal(commit.statuts.length, 0);
  const coupees = lieu(null);
  assert.equal((await jouerLesGatesDeLaTete(SHA, { ...options, preparer: coupees.preparer })).issue, "non-jouees");
  assert.deepEqual(commit.statuts.map(({ state }) => state), ["pending"]);
  assert.equal(coupees.fait.libere, 1);
});
