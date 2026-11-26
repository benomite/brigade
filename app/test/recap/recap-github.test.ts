// Le récapitulatif et le rail lisent les mêmes faits de GitHub (#3581) : sur un même faux GitHub — le Todo du chef du
// 2026-11-05 (#2422 : onze `served-elsewhere` techniques, deux livraisons à merger à la main), et des PR servies —, ce que le
// récapitulatif dit servi est ce que la colonne Served du rail montre depuis le marqueur, avec la même PR ; ce qu'il dit en
// attente dans TODO est ce que TODO montre, et ce que la file du chef (`lireCeQuiAttendLeChef`) relaie au second.
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { comprendre, tableau as tableauDe, type Faits, type Tableau } from "../../src/faits.ts";
import { avecCeQuiAttendLeChef, lireCeQuiAttendLeChef } from "../../src/tableau/attente-du-chef.ts";
import { lireLeTableauDuDepot } from "../../src/tableau/lecture.ts";
import { statusDuTableau } from "../../src/tableau/rail.ts";
import { lireLeRecap } from "../../src/vue/recap/recap-box.ts";
import { ceQuiAttendDansTodo } from "../../src/vue/recap/recap.js";
import { appelDeLApp, boxDe, fermee, issue, stationDuRecap, type Monde } from "./monde.ts";

const DEPOT = "acme/kitchen";
// Le marqueur, dans le répertoire d'état du projet (runtime/src/recap/marqueur.ts).
const FICHIER_DU_RECAP = "recap.json";
const LU = "2026-11-05T12:00:00.000Z";
const VU_JUSQUA = "2026-11-05T00:00:00.000Z";

const renvoi = (raison: string) => ({ id: 1, body: `<!-- brigade:renvoi n=3 sha=7579211 -->\nStation \`box/claude\`: still not mergeable after 2 sends back — ${raison}\n\nTaken off the kitchen (\`served-elsewhere\`): a human decides.`, author_association: "OWNER", created_at: "2026-11-05T01:00:00Z" });
const sansLivraison = () => ({ id: 2, body: "<!-- brigade:echec n=3 -->\nStation `box/claude`: the cook stopped without a delivery — the cook committed nothing\n\nTaken off the kitchen (`served-elsewhere`) after 3 cooks without a delivery: a human decides.", author_association: "OWNER", created_at: "2026-11-05T01:00:00Z" });
// Une livraison à merger à la main : la carte du chef (`chef-todo`, #4129) qui le demande.
const juge = (ticket: number) => ({ id: 3, body: `<!-- brigade:todo kind=merge-by-hand -->\nMerge the PR of #${ticket} by hand? It changes what judges it.\n- [merge] Merge the PR of #${ticket}`, author_association: "OWNER", created_at: "2026-11-05T01:00:00Z" });
const CONFLIT = "the PR conflicts with the base: merge the base into the branch, resolve the conflicts, run the gates, and commit";
const TECHNIQUES: Record<number, Record<string, unknown>> = { 2301: renvoi(CONFLIT), 2302: renvoi("the CI is red on `7579211` (PR #2400):"), 2304: sansLivraison(), 2305: renvoi(CONFLIT) };

const MONDE: Monde = {
  issues: [
    ...Object.keys(TECHNIQUES).map((n) => issue(DEPOT, Number(n), ["fire", "served-elsewhere"])),
    issue(DEPOT, 2408, ["fire", "in-pass", "chef-todo"]),
    issue(DEPOT, 2322, ["fire", "in-pass", "chef-todo"]),
    issue(DEPOT, 1683, ["fire", "served-elsewhere", "kitchen-board"]),
  ],
  commentaires: { ...Object.fromEntries(Object.entries(TECHNIQUES).map(([n, c]) => [Number(n), [c]])), 2408: [juge(2408)], 2322: [juge(2322)] },
  fermees: [
    fermee(DEPOT, 2470, 2471, "2026-11-05T11:00:00Z"),
    fermee(DEPOT, 2469, 2475, "2026-11-05T09:30:00Z"),
    // Mergée avant le marqueur : dans Served (24 h), déjà vue — pas dans le récapitulatif.
    fermee(DEPOT, 2461, 2462, "2026-11-04T18:54:06Z"),
    // Fermée sans merge : servie nulle part.
    fermee(DEPOT, 2458, 2459, null),
  ],
};

// Le rail et TODO tels que l'app les lit (main.ts, `lireLeTableau`) puis les dessine.
async function railEtTodo(): Promise<Tableau> {
  const appeler = appelDeLApp(DEPOT, () => MONDE);
  const lu = await avecCeQuiAttendLeChef(await lireLeTableauDuDepot({ depot: DEPOT, appeler, maintenant: () => new Date(LU) }), appeler);
  assert.ok(lu.lu, "the rail is read");
  const faits = comprendre(JSON.stringify(lu.faits));
  assert.ok(!("informe" in faits));
  return tableauDe(faits as Faits, undefined, { texte: statusDuTableau(lu), a: lu.luLe });
}

async function recap(t: TestContext) {
  const station = stationDuRecap(t, { kitchen: { depot: DEPOT, monde: () => MONDE } }, () => LU);
  writeFileSync(join(station.etats.kitchen ?? "", FICHIER_DU_RECAP), JSON.stringify({ seenUntil: VU_JUSQUA }));
  const lue = await lireLeRecap("kitchen", boxDe("kitchen"), DEPOT, station.lancer);
  assert.ok("recap" in lue, JSON.stringify(lue));
  return lue.recap;
}

describe("the recap reads the facts the rail and TODO read (#3581)", () => {
  test("served: the tickets of the Served column merged since the marker, each with the same pull request", async (t: TestContext) => {
    const [vu, lu] = await Promise.all([railEtTodo(), recap(t)]);
    const served = vu.rail.colonnes.find(({ nom }) => nom === "Served")?.cartes ?? [];
    assert.deepEqual(served.map(({ ticket }) => ticket), [2470, 2469, 2461]);
    assert.deepEqual(lu.served.map(({ ticket, prUrl }) => ({ ticket, prUrl })), [
      { ticket: 2470, prUrl: `https://github.com/${DEPOT}/pull/2471` },
      { ticket: 2469, prUrl: `https://github.com/${DEPOT}/pull/2475` },
    ]);
    assert.deepEqual(lu.served.map(({ ticket }) => ticket), served.map(({ ticket }) => ticket).filter((ticket) => ticket !== 2461));
  });

  test("TODO: what the recap lists as waiting is what TODO shows, and what the chef's queue relays", async (t: TestContext) => {
    const vu = await railEtTodo();
    const todo = vu.rail.colonnes.find(({ nom }) => nom === "Awaiting you")?.cartes ?? [];
    assert.deepEqual(todo.map(({ ticket }) => ticket), [2322, 2408]);
    const attendu = ceQuiAttendDansTodo(vu.rail.colonnes);
    assert.deepEqual(attendu, [
      { ticket: 2322, texte: "Merge the PR of #2322 by hand? It changes what judges it." },
      { ticket: 2408, texte: "Merge the PR of #2408 by hand? It changes what judges it." },
    ]);
    const file = await lireCeQuiAttendLeChef({ depot: DEPOT, appeler: appelDeLApp(DEPOT, () => MONDE), maintenant: () => new Date(LU) });
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
        [2301, "refused", CONFLIT],
        [2302, "refused", "the CI is red on `7579211` (PR #2400)"],
        [2305, "refused", CONFLIT],
      ],
    );
  });

  test("TODO not read yet: the recap says it is being read, never that nothing waits", () => {
    assert.equal(ceQuiAttendDansTodo(undefined), undefined);
    assert.equal(ceQuiAttendDansTodo([{ nom: "Awaiting you", ton: "rouge", compte: "?", cartes: [], vide: "" }]), undefined);
  });
});
