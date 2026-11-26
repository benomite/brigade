// Le récapitulatif et le rail lisent les mêmes faits de GitHub (#3581) : sur un même faux GitHub — le Todo du chef du
// 2026-11-05 (#2422 : onze `served-elsewhere` techniques, deux livraisons à merger à la main), et des PR servies —, ce que le
// récapitulatif dit servi est ce que la colonne Served du rail montre depuis le marqueur, avec la même PR ; ce qu'il dit en
// attente dans TODO est ce que TODO montre, et ce que la file du chef (`lireCeQuiAttendLeChef`) relaie au second.
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { comprendre, tableau as tableauDe, type Facts, type Tableau } from "../../src/facts.ts";
import { avecCeQuiAwaitingLeChef, lireCeQuiAwaitingLeChef } from "../../src/tableau/wait-du-chef.ts";
import { lireLeTableauDuRepository } from "../../src/tableau/read.ts";
import { statusDuTableau } from "../../src/tableau/rail.ts";
import { lireLeRecap } from "../../src/vue/recap/recap-box.ts";
import { ceQuiAwaitingDansTodo } from "../../src/vue/recap/recap.js";
import { callDeLApp, boxDe, fermee, issue, stationDuRecap, type Monde } from "./monde.ts";

const REPOSITORY = "acme/kitchen";
// Le marqueur, dans le répertoire d'état du projet (runtime/src/recap/marqueur.ts).
const FICHIER_DU_RECAP = "recap.json";
const LU = "2026-11-05T12:00:00.000Z";
const VU_JUSQUA = "2026-11-05T00:00:00.000Z";

const sendBack = (raison: string) => ({ id: 1, body: `<!-- brigade:renvoi n=3 sha=7579211 -->\nStation \`box/claude\`: still not mergeable after 2 sends back — ${raison}\n\nTaken off the kitchen (\`served-elsewhere\`): a human decides.`, author_association: "OWNER", created_at: "2026-11-05T01:00:00Z" });
const sansDelivery = () => ({ id: 2, body: "<!-- brigade:echec n=3 -->\nStation `box/claude`: the cook stopped without a delivery — the cook committed nothing\n\nTaken off the kitchen (`served-elsewhere`) after 3 cooks without a delivery: a human decides.", author_association: "OWNER", created_at: "2026-11-05T01:00:00Z" });
// Une livraison à merger à la main : la carte du chef (`chef-todo`, #4129) qui le demande.
const judge = (ticket: number) => ({ id: 3, body: `<!-- brigade:todo kind=merge-by-hand -->\nMerge the PR of #${ticket} by hand? It changes what judges it.\n- [merge] Merge the PR of #${ticket}`, author_association: "OWNER", created_at: "2026-11-05T01:00:00Z" });
const CONFLICT = "the PR conflicts with the base: merge the base into the branch, resolve the conflicts, run the gates, and commit";
const TECHNIQUES: Record<number, Record<string, unknown>> = { 2301: sendBack(CONFLICT), 2302: sendBack("the CI is red on `7579211` (PR #2400):"), 2304: sansDelivery(), 2305: sendBack(CONFLICT) };

const MONDE: Monde = {
  issues: [
    ...Object.keys(TECHNIQUES).map((n) => issue(REPOSITORY, Number(n), ["fire", "served-elsewhere"])),
    issue(REPOSITORY, 2408, ["fire", "in-pass", "chef-todo"]),
    issue(REPOSITORY, 2322, ["fire", "in-pass", "chef-todo"]),
    issue(REPOSITORY, 1683, ["fire", "served-elsewhere", "kitchen-board"]),
  ],
  commentaires: { ...Object.fromEntries(Object.entries(TECHNIQUES).map(([n, c]) => [Number(n), [c]])), 2408: [judge(2408)], 2322: [judge(2322)] },
  fermees: [
    fermee(REPOSITORY, 2470, 2471, "2026-11-05T11:00:00Z"),
    fermee(REPOSITORY, 2469, 2475, "2026-11-05T09:30:00Z"),
    // Mergée avant le marqueur : dans Served (24 h), déjà vue — pas dans le récapitulatif.
    fermee(REPOSITORY, 2461, 2462, "2026-11-04T18:54:06Z"),
    // Fermée sans merge : servie nulle part.
    fermee(REPOSITORY, 2458, 2459, null),
  ],
};

// Le rail et TODO tels que l'app les lit (main.ts, `lireLeTableau`) puis les dessine.
async function railEtTodo(): Promise<Tableau> {
  const appeler = callDeLApp(REPOSITORY, () => MONDE);
  const lu = await avecCeQuiAwaitingLeChef(await lireLeTableauDuRepository({ depot: REPOSITORY, appeler, maintenant: () => new Date(LU) }), appeler);
  assert.ok(lu.lu, "the rail is read");
  const facts = comprendre(JSON.stringify(lu.faits));
  assert.ok(!("informe" in facts));
  return tableauDe(facts as Facts, undefined, { texte: statusDuTableau(lu), a: lu.luLe });
}

async function recap(t: TestContext) {
  const station = stationDuRecap(t, { kitchen: { depot: REPOSITORY, monde: () => MONDE } }, () => LU);
  writeFileSync(join(station.etats.kitchen ?? "", FICHIER_DU_RECAP), JSON.stringify({ seenUntil: VU_JUSQUA }));
  const lue = await lireLeRecap("kitchen", boxDe("kitchen"), REPOSITORY, station.lancer);
  assert.ok("recap" in lue, JSON.stringify(lue));
  return lue.recap;
}

describe("the recap reads the facts the rail and TODO read (#3581)", () => {
  test("served: the tickets of the Served column merged since the marker, each with the same pull request", async (t: TestContext) => {
    const [vu, lu] = await Promise.all([railEtTodo(), recap(t)]);
    const served = vu.rail.colonnes.find(({ nom: name }) => name === "Served")?.cartes ?? [];
    assert.deepEqual(served.map(({ ticket }) => ticket), [2470, 2469, 2461]);
    assert.deepEqual(lu.served.map(({ ticket, prUrl }) => ({ ticket, prUrl })), [
      { ticket: 2470, prUrl: `https://github.com/${REPOSITORY}/pull/2471` },
      { ticket: 2469, prUrl: `https://github.com/${REPOSITORY}/pull/2475` },
    ]);
    assert.deepEqual(lu.served.map(({ ticket }) => ticket), served.map(({ ticket }) => ticket).filter((ticket) => ticket !== 2461));
  });

  test("TODO: what the recap lists as waiting is what TODO shows, and what the chef's queue relays", async (t: TestContext) => {
    const vu = await railEtTodo();
    const todo = vu.rail.colonnes.find(({ nom: name }) => name === "Awaiting you")?.cartes ?? [];
    assert.deepEqual(todo.map(({ ticket }) => ticket), [2322, 2408]);
    const attendu = ceQuiAwaitingDansTodo(vu.rail.colonnes);
    assert.deepEqual(attendu, [
      { ticket: 2322, texte: "Merge the PR of #2322 by hand? It changes what judges it." },
      { ticket: 2408, texte: "Merge the PR of #2408 by hand? It changes what judges it." },
    ]);
    const file = await lireCeQuiAwaitingLeChef({ depot: REPOSITORY, appeler: callDeLApp(REPOSITORY, () => MONDE), maintenant: () => new Date(LU) });
    assert.ok(file.lue);
    assert.deepEqual(file.attentes.map(({ ticket }) => ticket).sort(), (attendu ?? []).map(({ ticket }) => ticket).sort());
    // Le récapitulatif du runtime ne redit pas TODO : il ne porte que ce qui s'est passé.
    assert.deepEqual(Object.keys(await recap(t)).sort(), ["repository", "sentBack", "served", "since", "stops", "until"]);
  });

  test("the set-aside tickets the pass refused since the marker are in the recap with their reason; a cook without delivery is not a refusal", async (t: TestContext) => {
    const lu = await recap(t);
    assert.deepEqual(
      lu.sentBack.map(({ ticket, kind, reason }) => [ticket, kind, reason]).sort(),
      [
        [2301, "refused", CONFLICT],
        [2302, "refused", "the CI is red on `7579211` (PR #2400)"],
        [2305, "refused", CONFLICT],
      ],
    );
  });

  test("TODO not read yet: the recap says it is being read, never that nothing waits", () => {
    assert.equal(ceQuiAwaitingDansTodo(undefined), undefined);
    assert.equal(ceQuiAwaitingDansTodo([{ nom: "Awaiting you", ton: "rouge", compte: "?", cartes: [], vide: "" }]), undefined);
  });
});
