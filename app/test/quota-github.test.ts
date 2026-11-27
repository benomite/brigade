// La jauge du quota GitHub lit GitHub lui-même (#4645) : `/rate_limit`, que GitHub ne compte pas, hors du budget de l'app —
// la pause ne le retient pas —, au plus une fois par minute ; et la jauge le dit en vert sous 80 %, en orange dès 80 %.
process.env.TZ = "UTC";
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { holdTheQuotaGitHub, withTheQuota } from "../src/quota-github.ts";
import { holdTheBudgetGitHub } from "../src/budget-github.ts";
import type { AnswerGitHub } from "../src/board/client.ts";
import type { BoardRead } from "../src/board/read.ts";
import { quotaRead } from "../src/vue/stations-quota/quota-read.ts";
import { setTheQuota } from "../src/vue/stations-quota/stations-quota.js";
import { Fake } from "./helpers/false-vue.ts";

const RESET = Date.parse("2026-11-27T17:27:00Z") / 1000;
const rateLimit = (used: number): AnswerGitHub => ({ status: 200, data: { resources: { core: { limit: 5000, used, remaining: 5000 - used, reset: RESET } } } });
const doc = { createElement: (balise: string) => new Fake(balise), createElementNS: (_space: string, balise: string) => new Fake(balise) };
const finds = (n: Fake, classe: string): Fake | undefined => (n.className.split(" ").includes(classe) ? n : n.children.map((c: Fake) => finds(c, classe)).find((c) => c !== undefined));

describe("le quota du compte, lu de GitHub (#4645)", () => {
  test("il ne demande que /rate_limit, l'appel que GitHub ne compte pas, au plus une fois par minute", async () => {
    const paths: string[] = [];
    const clock = { t: 0 };
    const quota = holdTheQuotaGitHub({ appeler: async (path) => (paths.push(path), rateLimit(1200)), maintenant: () => clock.t });
    const read = await quota.lire();
    assert.deepEqual(paths, ["/rate_limit"]);
    assert.deepEqual(read, { limite: "core", pauseJusqua: null, utilise: 1200, maximum: 5000, renouvellement: "2026-11-27T17:27:00.000Z" });
    clock.t = 59_000;
    await quota.lire();
    assert.deepEqual(paths, ["/rate_limit"]);
    clock.t = 60_000;
    await quota.lire();
    assert.deepEqual(paths, ["/rate_limit", "/rate_limit"]);
  });

  test("la pause des lectures ne le retient pas : il passe hors du budget", async () => {
    const budget = holdTheBudgetGitHub({ maintenant: () => 0 });
    await budget.appeler(async () => ({ status: 200, data: {}, limite: { restant: 0, total: 5000, repriseLe: 3_600_000 } }))("/x");
    assert.notEqual(budget.enPauseJusqua(), null);
    const quota = holdTheQuotaGitHub({ appeler: async () => rateLimit(5000), maintenant: () => 0 });
    assert.equal((await quota.lire())?.utilise, 5000);
    assert.deepEqual(budget.demandesDeLaDerniereHeure(), { parties: 1, comptees: 1 });
  });

  test("une lecture ratée garde la dernière bonne ; une réponse illisible ne fait pas de quota", async () => {
    let answer: () => Promise<AnswerGitHub> = async () => rateLimit(100);
    const clock = { t: 0 };
    const quota = holdTheQuotaGitHub({ appeler: () => answer(), maintenant: () => clock.t });
    await quota.lire();
    answer = async () => assert.fail("réseau coupé");
    clock.t = 120_000;
    assert.equal((await quota.lire())?.utilise, 100);
    assert.equal(await holdTheQuotaGitHub({ appeler: async () => ({ status: 200, data: { resources: {} } }) }).lire(), null);
  });

  test("la lecture du rail porte le quota frais dans ses faits, jusqu'à l'onglet Stations", () => {
    const board = { lu: true, depot: "chef/parade", luLe: "2026-11-27T16:00:00Z", faits: { etat: "ouverte", quotaGithub: { utilise: 1 } } } as unknown as BoardRead;
    const quota = { limite: "core", pauseJusqua: null, utilise: 4000, maximum: 5000, renouvellement: "2026-11-27T17:27:00.000Z" };
    const withIt = withTheQuota(board, quota);
    assert.ok(withIt.lu);
    assert.deepEqual(withIt.faits.quotaGithub, quota);
    assert.ok(withIt.lu && !("quotaGithub" in withTheQuota(board, null).faits));
    assert.deepEqual(quotaRead(JSON.parse(JSON.stringify(withIt.faits.quotaGithub))).quotaGithub, quota);
  });

  test("sous 80 % la jauge est verte avec son heure de renouvellement, dès 80 % orange ; sans détail par station", async () => {
    for (const [used, ton] of [[3999, "normal"], [4000, "alerte"], [5000, "alerte"]] as const) {
      const quota = (await holdTheQuotaGitHub({ appeler: async () => rateLimit(used) }).lire())!;
      const gauge = setTheQuota(doc, quota);
      assert.equal(gauge.dataset.ton, ton, `${used}`);
      assert.match(finds(gauge, "quota-ligne")!.textContent, new RegExp(`${used} / 5000 calls used \\(reads and writes\\).*renews around 17:27`));
      assert.equal(finds(gauge, "replie"), undefined);
    }
  });
});
