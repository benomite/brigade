// La demande de passe qui écrit est patiente : demandée une fois, elle attend sa
// condition d'exécution et part seule quand elle est remplie — sans que le chef
// guette ni relance. Elle se lit dans la file, se retire par le même geste, est
// dite sans issue quand elle attend trop longtemps, et il n'y en a qu'une.
// La condition, elle, ne bouge pas : rien ne part sous des cooks en vol.
import assert from "node:assert/strict";
import { test } from "node:test";
import { attentesDuChef, decrireAttentes } from "../../src/attend.ts";
import { SANS_ISSUE_MS } from "../../src/events/closing.ts";
import { lireRail } from "../../src/projections/rail.ts";
import { principal } from "../../src/closing/command.ts";
import { chef, PLAFONDS, STATION } from "../aides/cuisine.ts";
import { appeler, BASE, ENV_GIT, jusqua } from "../outils.ts";
import { cuisineFermee, RETIRER_M1 } from "./kitchen.ts";

type Cuisine = ReturnType<typeof cuisineFermee>;

// Le runtime a relu la demande à `combien` réveils de plus.
async function ticks({ types }: Cuisine, combien: number): Promise<void> {
  const vus = types().filter((type) => type === "runtime.ticked").length;
  await jusqua(() => types().filter((type) => type === "runtime.ticked").length >= vus + combien);
}

// Le bloc `attend` de l'état, tel que `run status` l'écrit.
function attend({ journal }: Cuisine): string {
  return decrireAttentes(attentesDuChef(journal.base, lireRail(journal.base)), () => "1 min").join("\n");
}

// Rien n'est parti : ni closer, ni passe au journal.
function rienNEstParti({ closer, types }: Cuisine): void {
  assert.deepEqual(closer.lancements(), []);
  assert.ok(!types().includes("closing.started"));
}

// Un cook en vol que rien ne rend : son bail ne compte pas, il tourne.
function cookEnVol({ journal }: Cuisine, ticket: number): void {
  journal.ajouter({ project: "brigade", ticket, author: "runtime", type: "cook.launched", payload: { run: `${ticket}-enVol`, limits: PLAFONDS, stream: `runs/${ticket}-enVol.jsonl` } });
}

test("une demande qui attend se lit dans la file : depuis quand, et ce qui la retient — combien de cooks en vol, pour quel seuil ; elle en sort en partant", async (t) => {
  const cuisine = cuisineFermee(t);
  const { runtime, demander, poser, closer, fin } = cuisine;
  closer.gestes(RETIRER_M1);
  await poser(7, "src/tenu");
  assert.equal(runtime.rail.prendre(STATION)?.ticket, 7);

  assert.equal((await demander()).code, 0);
  const bloc = attend(cuisine);
  assert.match(bloc, /^awaiting {3}1 decision awaits the chef — for 1 min\n/);
  assert.match(
    bloc,
    /\n {2}closing {2}for 1 min {2}closing pass requested on \d{4}-\d\d-\d\dT[\d:.]+Z, it waits — start condition not met: 1 cook in flight for a threshold of 1 — the pass leaves when there are fewer than the threshold, or when the rail is empty \(it carries 1 unserved ticket\); it leaves on its own, once, as soon as nothing holds it back, without anyone restarting it — to withdraw it: `brigade <projet> closing cancel`\n/,
  );

  // Et là où le chef observe.
  const observee = appeler(principal, [], { ...ENV_GIT, BRIGADE_REPO_DIR: cuisine.clone, BRIGADE_BASE_BRANCH: BASE, BRIGADE_STATE_DIR: cuisine.repertoire });
  assert.equal(await observee.fin, 0, observee.sortie());
  assert.match(observee.sortie(), /\npass {7}closing pass requested on [\d\-T:.]+Z, it waits — start condition not met: 1 cook in flight for a threshold of 1 /);

  runtime.rail.rendre(7, "essai", STATION);
  assert.equal((await fin()).outcome, "delivered");
  assert.doesNotMatch(attend(cuisine), /closing/);
});

test("une seule demande à la fois : redemandée pendant qu'elle attend, rien n'est redemandé, et une seule passe part", async (t) => {
  const cuisine = cuisineFermee(t);
  const { runtime, demander, poser, closer, fin, types } = cuisine;
  closer.gestes(RETIRER_M1);
  await poser(7, "src/tenu");
  assert.equal(runtime.rail.prendre(STATION)?.ticket, 7);

  assert.equal((await demander()).code, 0);
  const encore = await demander();
  assert.equal(encore.code, 0, encore.sortie);
  assert.match(encore.sortie, /^brigade : already requested, nothing is requested again — closing pass requested on \d{4}-\d\d-\d\dT[\d:.]+Z, it waits — start condition not met: 1 cook in flight for a threshold of 1/);
  assert.deepEqual(types().filter((type) => type === "closing.requested"), ["closing.requested"]);

  runtime.rail.rendre(7, "essai", STATION);
  assert.equal((await fin()).outcome, "delivered");
  await ticks(cuisine, 5);
  assert.equal(closer.lancements().length, 1);
  assert.deepEqual(types().filter((type) => type === "closing.started"), ["closing.started"]);
});

test("le chef renonce à la demande par le même geste : rien ne part, même quand la condition se remplit ; partie, elle ne se rappelle pas", async (t) => {
  const cuisine = cuisineFermee(t);
  const { runtime, demander, annuler, poser, closer, fin, types } = cuisine;
  closer.gestes(`attendre\n${RETIRER_M1}`);
  await poser(7, "src/tenu");
  assert.equal(runtime.rail.prendre(STATION)?.ticket, 7);
  assert.equal((await demander()).code, 0);

  const retiree = await annuler();
  assert.equal(retiree.code, 0, retiree.sortie);
  assert.match(retiree.sortie, /^brigade : closing pass request of \d{4}-\d\d-\d\dT[\d:.]+Z withdrawn: nothing has left, and nothing will leave without another request\n$/);
  assert.ok(types().includes("closing.cancelled"));
  assert.doesNotMatch(attend(cuisine), /closing/);

  // La condition se remplit : rien ne part.
  runtime.rail.rendre(7, "essai", STATION);
  await ticks(cuisine, 10);
  rienNEstParti(cuisine);
  assert.equal((await annuler()).sortie, "brigade : no closing pass is requested: nothing to cancel\n");

  // Redemandée, elle part ; partie, elle ne se retire plus.
  assert.equal((await demander()).code, 0);
  await jusqua(() => closer.lancements().length === 1);
  const tard = await annuler();
  assert.equal(tard.code, 1);
  assert.match(tard.sortie, /^brigade : closing run fermeture-[0-9a-f]{8} has left: it cannot be recalled — “stop” halts it/);
  closer.feu();
  assert.equal((await fin()).outcome, "delivered");
});

test("une demande qui attend depuis deux heures est dite sans issue — une fois, au journal, dans journald et dans la file — et attend toujours", async (t) => {
  const cuisine = cuisineFermee(t);
  const { journal, heure, closer, types, dernier, avertissements } = cuisine;
  closer.gestes(RETIRER_M1);
  cookEnVol(cuisine, 7);
  // Écrite à l'heure de la cuisine, que le test avance : la commande, elle,
  // l'écrirait à celle de l'horloge.
  journal.ajouter({ project: "brigade", ticket: null, author: "chef", type: "closing.requested", payload: {} });

  heure.avancer(SANS_ISSUE_MS - 60_000);
  await ticks(cuisine, 5);
  assert.ok(!types().includes("closing.stalled"));
  assert.doesNotMatch(attend(cuisine), /WITH NO WAY OUT/);

  heure.avancer(60_000);
  await jusqua(() => types().includes("closing.stalled"));
  assert.deepEqual(dernier("closing.stalled"), { requestedAt: "2026-10-08T10:00:00.000Z", reason: "cooks", observed: 1, limit: 1, detail: "0" });
  const dit = /PASSE DE FERMETURE SANS ISSUE : demandée le 2026-10-08T10:00:00\.000Z, elle attend depuis plus de 2 h — condition d'exécution non remplie : 1 cook en vol pour un seuil de 1 .* ; le rail ne se vide pas seul — à trancher : relever le seuil \(`brigade <projet> station closer-cooks <N>`\), éteindre le manager le temps que le rail se vide \(`brigade <projet> manager off`\), ou y renoncer : `brigade <projet> closing cancel`/;
  assert.match(avertissements.join("\n"), dit);
  // La file, elle, le dit en anglais.
  assert.match(attend(cuisine), /CLOSING PASS WITH NO WAY OUT: requested on 2026-10-08T10:00:00\.000Z, it has waited for more than 2 h — start condition not met: 1 cook in flight for a threshold of 1 .*; the rail does not empty on its own — to decide: raise the threshold \(`brigade <projet> station closer-cooks <N>`\), turn the manager off while the rail empties \(`brigade <projet> manager off`\), or withdraw it: `brigade <projet> closing cancel`/);

  // Dit une fois, et elle attend toujours : rien n'est refusé, rien n'est parti.
  heure.avancer(SANS_ISSUE_MS);
  await ticks(cuisine, 5);
  assert.deepEqual(types().filter((type) => type === "closing.stalled"), ["closing.stalled"]);
  assert.ok(!types().includes("closing.refused"));
  rienNEstParti(cuisine);
});

test("le « stop » du chef pendant qu'elle attend la refuse : elle ne repart pas d'elle-même à la reprise", async (t) => {
  const cuisine = cuisineFermee(t);
  const { runtime, demander, poser, closer, dernier, repertoire, avertissements } = cuisine;
  closer.gestes(RETIRER_M1);
  await poser(7, "src/tenu");
  assert.equal(runtime.rail.prendre(STATION)?.ticket, 7);
  assert.equal((await demander()).code, 0);

  chef(repertoire, "kitchen.stopped");
  await jusqua(() => dernier("closing.refused") !== undefined);
  assert.equal(dernier("closing.refused")?.reason, "stopped");
  assert.match(avertissements.join("\n"), /passe de fermeture refusée — la cuisine est arrêtée par le chef depuis le /);

  chef(repertoire, "kitchen.resumed");
  runtime.rail.rendre(7, "essai", STATION);
  await ticks(cuisine, 10);
  rienNEstParti(cuisine);
  assert.doesNotMatch(attend(cuisine), /closing/);
});
