// Le récapitulatif côté process principal (#3581) : lu par la commande `recap` du runtime, là où la cuisine du projet
// tourne, et son marqueur avancé par elle. Une sortie illisible, un runtime trop vieux, un projet sans station ou sans
// dépôt connu se disent : jamais lus comme « rien ne s'est passé ». Le préchargement porte les trois canaux.
import assert from "node:assert/strict";
import type { ExecFileException } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { runInThisContext } from "node:vm";
import type { Read, Rendered } from "../../src/box.ts";
import { readTheRecap, markTheRecap } from "../../src/vue/recap/recap-box.ts";
import type { Bridge } from "../../src/vue/bridge.d.ts";
import { boxOf } from "./world.ts";

const APP = join(import.meta.dirname, "..", "..");
const BOX = boxOf("parade");
const REPOSITORY = "chef/parade";
const rendered = (output: string, code: number | null = null, errors = ""): Rendered => ({
  lance: "$ node geste.ts parade recap chef/parade",
  erreur: code === null ? null : (Object.assign(new Error(`exit ${code}`), { code }) as ExecFileException),
  sortie: output,
  erreurs: errors,
});
function launcher(render: Rendered) {
  const launched: string[] = [];
  return { lancees: launched, lancer: async (_: Read, command: string) => (launched.push(command), render) };
}
const RECAP = {
  repository: REPOSITORY,
  since: "2026-11-10T00:00:00.000Z",
  until: "2026-11-10T10:00:00.000Z",
  served: [{ ticket: 12, title: "Ticket 12", url: `https://github.com/${REPOSITORY}/issues/12`, pr: 41, prUrl: `https://github.com/${REPOSITORY}/pull/41`, servedAt: "2026-11-10T09:00:00Z" }],
  sentBack: [{ ticket: 20, url: `https://github.com/${REPOSITORY}/issues/20`, kind: "sent-back", reason: "the CI is red", at: "2026-11-10T03:00:00Z" }],
  stops: [{ at: "2026-11-10T04:00:00.000Z", ticket: null, guardrail: "breaker", line: "The kitchen was stopped by the breaker, after 3 failures in a row." }],
};

describe("the recap, by the `recap` command", () => {
  test("the read names the project's repository, and gives the recap", async () => {
    const { lancees: launched, lancer: launch } = launcher(rendered(`${JSON.stringify(RECAP)}\n`));
    assert.deepEqual(await readTheRecap("parade", BOX, REPOSITORY, launch), { recap: RECAP });
    assert.deepEqual(launched, ["recap chef/parade"]);
  });

  test("what does not read is said, its detail on hover — never an empty recap", async () => {
    assert.deepEqual(await readTheRecap("parade", undefined, REPOSITORY, launcher(rendered("")).lancer), { sans: "recap unavailable: parade has no station — it is read where its kitchen runs" });
    const withoutRepository = launcher(rendered(""));
    assert.deepEqual(await readTheRecap("parade", BOX, "parade", withoutRepository.lancer), { sans: "recap unavailable: the GitHub repository of parade is not known" });
    assert.deepEqual(withoutRepository.lancees, []);
    const old = await readTheRecap("parade", BOX, REPOSITORY, launcher(rendered("", 66, "brigade: “recap” is not a runtime command")).lancer);
    assert.ok("sans" in old);
    assert.equal(old.sans, "recap unavailable: this station's runtime does not give it yet — update it");
    const refuses = await readTheRecap("parade", BOX, REPOSITORY, launcher(rendered("", 1, "brigade: the recap is not read — gh api repos/chef/parade/pulls : HTTP 502")).lancer);
    assert.ok("sans" in refuses);
    assert.equal(refuses.sans, "recap unavailable");
    assert.match(refuses.detail ?? "", /HTTP 502/);
    for (const raw of ["not json", JSON.stringify({ ...RECAP, served: [{ ...RECAP.served[0], prUrl: "javascript:alert(1)" }] }), JSON.stringify({ ...RECAP, stops: undefined })]) {
      assert.ok("sans" in (await readTheRecap("parade", BOX, REPOSITORY, launcher(rendered(raw)).lancer)), raw);
    }
  });

  test("marked seen up to `until`: the runtime's marker after it, or the line of its refusal", async () => {
    const seenOne = launcher(rendered('{"ok":true,"seenUntil":"2026-11-10T10:00:00.000Z"}'));
    assert.deepEqual(await markTheRecap("parade", BOX, REPOSITORY, RECAP.until, seenOne.lancer), { seenUntil: "2026-11-10T10:00:00.000Z" });
    assert.deepEqual(seenOne.lancees, ["recap chef/parade seen 2026-11-10T10:00:00.000Z"]);
    const refusal = await markTheRecap("parade", BOX, REPOSITORY, RECAP.until, launcher(rendered('{"ok":false,"message":"the recap is not marked seen — recap.json is not JSON"}', 1)).lancer);
    assert.ok("refus" in refusal);
    assert.equal(refusal.refus, "the recap is not marked seen — recap.json is not JSON");
    assert.ok("refus" in (await markTheRecap("parade", BOX, REPOSITORY, RECAP.until, launcher(rendered("garbage")).lancer)));
    const notOneInstant = launcher(rendered(""));
    assert.deepEqual(await markTheRecap("parade", BOX, REPOSITORY, "now; rm -rf /", notOneInstant.lancer), { refus: "nothing was marked: this is not an instant" });
    assert.deepEqual(notOneInstant.lancees, []);
  });
});

// Le préchargement tel que l'app le charge, son `electron` feint : `invoke` va aux canaux du process principal.
function bridgeOf(channels: Record<string, (...args: unknown[]) => unknown>): Bridge {
  let expose: Bridge | undefined;
  const electron = {
    contextBridge: { exposeInMainWorld: (_: string, bridge: Bridge) => void (expose = bridge) },
    ipcRenderer: { invoke: (channel: string, ...args: unknown[]) => channels[channel]!(...args), on: () => {} },
  };
  const source = readFileSync(join(APP, "src", "preload.cjs"), "utf8");
  (runInThisContext(`(function (require) {${source}\n})`) as (require: (name: string) => unknown) => void)(() => electron);
  return expose!;
}

describe("the recap's wiring", () => {
  test("the preload carries the read, the mark and the pull request's opening, and the main process handles each", async () => {
    const receivedOnes: unknown[][] = [];
    const channel = (name: string, rendered: unknown) => (...args: unknown[]) => (receivedOnes.push([name, ...args]), rendered);
    const bridge = bridgeOf({ lireLeRecap: channel("lireLeRecap", { recap: RECAP }), marquerLeRecap: channel("marquerLeRecap", { seenUntil: RECAP.until }), ouvrirLaPRDuRecap: channel("ouvrirLaPRDuRecap", true) });
    assert.deepEqual(await bridge.lireLeRecap?.("parade"), { recap: RECAP });
    assert.deepEqual(await bridge.marquerLeRecap?.("parade", RECAP.until), { seenUntil: RECAP.until });
    assert.equal(await bridge.ouvrirLaPRDuRecap?.(RECAP.served[0]!.prUrl), true);
    assert.deepEqual(receivedOnes, [["lireLeRecap", "parade"], ["marquerLeRecap", "parade", RECAP.until], ["ouvrirLaPRDuRecap", RECAP.served[0]!.prUrl]]);
    const principal = readFileSync(join(APP, "src", "main.ts"), "utf8");
    for (const channel of ["lireLeRecap", "marquerLeRecap", "ouvrirLaPRDuRecap"]) assert.match(principal, new RegExp(`ipcMain\\.handle\\("${channel}"`), channel);
  });
});
