// Le récapitulatif côté process principal (#3581) : lu par la commande `recap` du runtime, là où la cuisine du projet
// tourne, et son marqueur avancé par elle. Une sortie illisible, un runtime trop vieux, un projet sans station ou sans
// dépôt connu se disent : jamais lus comme « rien ne s'est passé ». Le préchargement porte les trois canaux.
import assert from "node:assert/strict";
import type { ExecFileException } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { runInThisContext } from "node:vm";
import type { Lu, Rendu } from "../../src/box.ts";
import { lireLeRecap, marquerLeRecap } from "../../src/vue/recap/recap-box.ts";
import type { Pont } from "../../src/vue/pont.d.ts";
import { boxDe } from "./monde.ts";

const APP = join(import.meta.dirname, "..", "..");
const BOX = boxDe("parade");
const DEPOT = "chef/parade";
const rendu = (sortie: string, code: number | null = null, erreurs = ""): Rendu => ({
  lance: "$ node geste.ts parade recap chef/parade",
  erreur: code === null ? null : (Object.assign(new Error(`exit ${code}`), { code }) as ExecFileException),
  sortie,
  erreurs,
});
function lanceur(rendre: Rendu) {
  const lancees: string[] = [];
  return { lancees, lancer: async (_: Lu, commande: string) => (lancees.push(commande), rendre) };
}
const RECAP = {
  repository: DEPOT,
  since: "2026-11-10T00:00:00.000Z",
  until: "2026-11-10T10:00:00.000Z",
  served: [{ ticket: 12, title: "Ticket 12", url: `https://github.com/${DEPOT}/issues/12`, pr: 41, prUrl: `https://github.com/${DEPOT}/pull/41`, servedAt: "2026-11-10T09:00:00Z" }],
  sentBack: [{ ticket: 20, url: `https://github.com/${DEPOT}/issues/20`, kind: "sent-back", reason: "the CI is red", at: "2026-11-10T03:00:00Z" }],
  stops: [{ at: "2026-11-10T04:00:00.000Z", ticket: null, guardrail: "breaker", line: "The kitchen was stopped by the breaker, after 3 failures in a row." }],
};

describe("the recap, by the `recap` command", () => {
  test("the read names the project's repository, and gives the recap", async () => {
    const { lancees, lancer } = lanceur(rendu(`${JSON.stringify(RECAP)}\n`));
    assert.deepEqual(await lireLeRecap("parade", BOX, DEPOT, lancer), { recap: RECAP });
    assert.deepEqual(lancees, ["recap chef/parade"]);
  });

  test("what does not read is said, its detail on hover — never an empty recap", async () => {
    assert.deepEqual(await lireLeRecap("parade", undefined, DEPOT, lanceur(rendu("")).lancer), { sans: "recap unavailable: parade has no station — it is read where its kitchen runs" });
    const sansDepot = lanceur(rendu(""));
    assert.deepEqual(await lireLeRecap("parade", BOX, "parade", sansDepot.lancer), { sans: "recap unavailable: the GitHub repository of parade is not known" });
    assert.deepEqual(sansDepot.lancees, []);
    const vieux = await lireLeRecap("parade", BOX, DEPOT, lanceur(rendu("", 66, "brigade: “recap” is not a runtime command")).lancer);
    assert.ok("sans" in vieux);
    assert.equal(vieux.sans, "recap unavailable: this station's runtime does not give it yet — update it");
    const refuse = await lireLeRecap("parade", BOX, DEPOT, lanceur(rendu("", 1, "brigade: the recap is not read — gh api repos/chef/parade/pulls : HTTP 502")).lancer);
    assert.ok("sans" in refuse);
    assert.equal(refuse.sans, "recap unavailable");
    assert.match(refuse.detail ?? "", /HTTP 502/);
    for (const brut of ["not json", JSON.stringify({ ...RECAP, served: [{ ...RECAP.served[0], prUrl: "javascript:alert(1)" }] }), JSON.stringify({ ...RECAP, stops: undefined })]) {
      assert.ok("sans" in (await lireLeRecap("parade", BOX, DEPOT, lanceur(rendu(brut)).lancer)), brut);
    }
  });

  test("marked seen up to `until`: the runtime's marker after it, or the line of its refusal", async () => {
    const vu = lanceur(rendu('{"ok":true,"seenUntil":"2026-11-10T10:00:00.000Z"}'));
    assert.deepEqual(await marquerLeRecap("parade", BOX, DEPOT, RECAP.until, vu.lancer), { seenUntil: "2026-11-10T10:00:00.000Z" });
    assert.deepEqual(vu.lancees, ["recap chef/parade seen 2026-11-10T10:00:00.000Z"]);
    const refus = await marquerLeRecap("parade", BOX, DEPOT, RECAP.until, lanceur(rendu('{"ok":false,"message":"the recap is not marked seen — recap.json is not JSON"}', 1)).lancer);
    assert.ok("refus" in refus);
    assert.equal(refus.refus, "the recap is not marked seen — recap.json is not JSON");
    assert.ok("refus" in (await marquerLeRecap("parade", BOX, DEPOT, RECAP.until, lanceur(rendu("garbage")).lancer)));
    const pasUnInstant = lanceur(rendu(""));
    assert.deepEqual(await marquerLeRecap("parade", BOX, DEPOT, "now; rm -rf /", pasUnInstant.lancer), { refus: "nothing was marked: this is not an instant" });
    assert.deepEqual(pasUnInstant.lancees, []);
  });
});

// Le préchargement tel que l'app le charge, son `electron` feint : `invoke` va aux canaux du process principal.
function pontDe(canaux: Record<string, (...args: unknown[]) => unknown>): Pont {
  let expose: Pont | undefined;
  const electron = {
    contextBridge: { exposeInMainWorld: (_: string, pont: Pont) => void (expose = pont) },
    ipcRenderer: { invoke: (canal: string, ...args: unknown[]) => canaux[canal]!(...args), on: () => {} },
  };
  const source = readFileSync(join(APP, "src", "preload.cjs"), "utf8");
  (runInThisContext(`(function (require) {${source}\n})`) as (require: (nom: string) => unknown) => void)(() => electron);
  return expose!;
}

describe("the recap's wiring", () => {
  test("the preload carries the read, the mark and the pull request's opening, and the main process handles each", async () => {
    const recus: unknown[][] = [];
    const canal = (nom: string, rendu: unknown) => (...args: unknown[]) => (recus.push([nom, ...args]), rendu);
    const pont = pontDe({ lireLeRecap: canal("lireLeRecap", { recap: RECAP }), marquerLeRecap: canal("marquerLeRecap", { seenUntil: RECAP.until }), ouvrirLaPRDuRecap: canal("ouvrirLaPRDuRecap", true) });
    assert.deepEqual(await pont.lireLeRecap?.("parade"), { recap: RECAP });
    assert.deepEqual(await pont.marquerLeRecap?.("parade", RECAP.until), { seenUntil: RECAP.until });
    assert.equal(await pont.ouvrirLaPRDuRecap?.(RECAP.served[0]!.prUrl), true);
    assert.deepEqual(recus, [["lireLeRecap", "parade"], ["marquerLeRecap", "parade", RECAP.until], ["ouvrirLaPRDuRecap", RECAP.served[0]!.prUrl]]);
    const principal = readFileSync(join(APP, "src", "main.ts"), "utf8");
    for (const canal of ["lireLeRecap", "marquerLeRecap", "ouvrirLaPRDuRecap"]) assert.match(principal, new RegExp(`ipcMain\\.handle\\("${canal}"`), canal);
  });
});
