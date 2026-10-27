// Les gestes de la passe qui écrit pour l'app : l'aperçu dit ce qu'elle coûte
// et ce que le closer va faire, sans rien créer ; la demande ne part qu'avec la
// confirmation du chef, et passe par la décision de `closing write` ; le retrait
// est celui de `closing cancel` — refusé, avec sa raison, une fois la passe partie.
import assert from "node:assert/strict";
import { test } from "node:test";
import { principal } from "../../src/closing/command.ts";
import { PLAFONDS } from "../aides/cuisine.ts";
import { appeler, jusqua } from "../outils.ts";
import { cuisineFermee, RETIRER_M1 } from "../closing/kitchen.ts";
import { posixOnly } from "../support/plateforme.ts";

type Cuisine = ReturnType<typeof cuisineFermee>;

// Un geste de l'app, tel qu'elle le lance sur la box : `brigade <projet> closing <args>`.
async function lancer({ repertoire }: Cuisine, ...args: string[]): Promise<{ code: number; sortie: string; json: any }> {
  const appel = appeler(principal, args, { BRIGADE_STATE_DIR: repertoire });
  const code = await appel.fin;
  const sortie = appel.sortie();
  let json: any = null;
  try {
    json = JSON.parse(sortie);
  } catch {}
  return { code, sortie, json };
}

// Le runtime a relu le journal à `combien` réveils de plus.
async function ticks({ types }: Cuisine, combien: number): Promise<void> {
  const vus = types().filter((type) => type === "runtime.ticked").length;
  await jusqua(() => types().filter((type) => type === "runtime.ticked").length >= vus + combien);
}

// Les faits de la fermeture que le journal porte, hors de ceux que le runtime
// écrit seul à son démarrage.
const demandes = ({ types }: Cuisine) => types().filter((type) => type.startsWith("closing.") && type !== "closing.configured");

// Un cook en vol que rien ne rend : il retient la demande.
function cookEnVol({ journal }: Cuisine, ticket: number): void {
  journal.ajouter({ project: "brigade", ticket, author: "runtime", type: "cook.launched", payload: { run: `${ticket}-enVol`, limits: PLAFONDS, stream: `runs/${ticket}-enVol.jsonl` } });
}

// Le même cook sort : plus rien ne retient la demande.
function cookFini({ journal }: Cuisine, ticket: number): void {
  journal.ajouter({ project: "brigade", ticket, author: "runtime", type: "cook.exited", payload: { run: `${ticket}-enVol`, outcome: "ok", code: 0, signal: null, turns: 1, tokens: 1, durationMs: 1 } });
}

test("l'aperçu dit ce que coûte la passe et ce que le closer va faire, et ne crée rien : ni demande, ni refus, ni passe", async (t) => {
  const cuisine = cuisineFermee(t);
  const avant = cuisine.journal.tout().filter((e) => e.type.startsWith("closing.")).length;

  const apercu = await lancer(cuisine, "preview", "--json");
  assert.equal(apercu.code, 0, apercu.sortie);
  assert.equal(apercu.sortie.trimEnd().split("\n").length, 1, "un objet JSON, sur une ligne");
  const { configured, cost, does, request, ifRequested } = apercu.json;
  assert.equal(configured, true);
  assert.deepEqual(cost, { model: "sonnet", effort: "low", maxTokens: 1000, maxRemovedLines: 20, startsBelowCooks: 1, text: "closer on `sonnet` / `low` · starts under 1 cook in flight · 1,000 tokens at most · 20 lines removed at most" });
  assert.match(does.join("\n"), /duplicate code blocks and dead exports/);
  assert.match(does.join("\n"), /merges nothing .* one PR, handed to the pass/);
  assert.match(does.join("\n"), /1,000 tokens, 20 lines removed/);
  assert.deepEqual(request, { state: "none" });
  assert.equal(ifRequested.outcome, "leaves");
  assert.match(ifRequested.text, /^a request would leave within the second — start condition met: 0 cooks? in flight for a threshold of 1, rail empty$/);

  // Rien n'est écrit, et rien ne part : le runtime relit le journal et n'y trouve aucune demande.
  await ticks(cuisine, 5);
  assert.equal(cuisine.journal.tout().filter((e) => e.type.startsWith("closing.")).length, avant);
  assert.deepEqual(demandes(cuisine), []);
  assert.deepEqual(cuisine.closer.lancements(), []);

  // Sous un cook en vol, il dit qu'elle attendrait, et pourquoi — toujours sans rien écrire.
  cookEnVol(cuisine, 7);
  const retenu = await lancer(cuisine, "preview", "--json");
  assert.equal(retenu.json.ifRequested.outcome, "waits");
  assert.equal(retenu.json.ifRequested.reason.reason, "cooks");
  assert.match(retenu.json.ifRequested.text, /^a request would wait — start condition not met: 1 cook in flight for a threshold of 1/);
  assert.deepEqual(demandes(cuisine), []);

  // Et en mots, pour le chef qui le tape.
  const enMots = await lancer(cuisine, "preview");
  assert.equal(enMots.code, 0, enMots.sortie);
  assert.match(enMots.sortie, /^cost {7}closer on `sonnet` \/ `low` · starts under 1 cook in flight · 1,000 tokens at most · 20 lines removed at most\ndoes {7}it fetches the integration branch/);
  assert.match(enMots.sortie, /\nrequest {4}none\nnow {8}a request would wait — /);
  assert.deepEqual(demandes(cuisine), []);
});

test("sans `--confirm`, la demande de l'app est refusée et rien n'est écrit ; avec, une demande est créée, qui se lit en attente puis partie", { skip: posixOnly("runs the app's closing gesture through to a closer that is the fake claude (a bash script) on a real git repository; the pass judged the closer's files out of its zone; on the Windows job: + 'zone' - 'delivered'") }, async (t) => {
  const cuisine = cuisineFermee(t);
  const { closer } = cuisine;
  closer.gestes(`attendre\n${RETIRER_M1}`);
  cookEnVol(cuisine, 7);

  const sansOui = await lancer(cuisine, "write", "--json");
  assert.equal(sansOui.code, 1, sansOui.sortie);
  assert.equal(sansOui.json.outcome, "unconfirmed");
  assert.match(sansOui.json.text, /^closing pass not requested, nothing is written — a program requests it only with `--confirm`/);
  assert.deepEqual(demandes(cuisine), []);

  const oui = await lancer(cuisine, "write", "--json", "--confirm");
  assert.equal(oui.code, 0, oui.sortie);
  assert.equal(oui.json.outcome, "requested");
  assert.equal(oui.json.waits.reason, "cooks");
  assert.match(oui.json.text, /^closing pass requested — it waits: start condition not met: 1 cook in flight for a threshold of 1/);
  assert.deepEqual(demandes(cuisine), ["closing.requested"]);

  // En attente, dans ce que l'app relit.
  const attend = await lancer(cuisine, "preview", "--json");
  assert.equal(attend.json.request.state, "waiting");
  assert.equal(attend.json.request.holds.reason, "cooks");
  assert.equal(attend.json.ifRequested.outcome, "already-requested");

  // Redemandée, rien n'est redemandé.
  const encore = await lancer(cuisine, "write", "--json", "--confirm");
  assert.equal(encore.code, 0, encore.sortie);
  assert.equal(encore.json.outcome, "already-requested");
  assert.deepEqual(demandes(cuisine), ["closing.requested"]);

  // Le cook rend la main : elle part, et se lit partie.
  cookFini(cuisine, 7);
  await jusqua(() => closer.lancements().length === 1);
  const partie = await lancer(cuisine, "preview", "--json");
  assert.equal(partie.json.request.state, "running");
  assert.match(partie.json.request.run, /^fermeture-[0-9a-f]{8}$/);
  closer.feu();
  assert.equal((await cuisine.fin()).outcome, "delivered");
});

test("sans closer réglé, la demande échoue en le disant et en nommant le geste qui le règle ; l'aperçu le dit aussi", async (t) => {
  const cuisine = cuisineFermee(t, { reglages: { calibration: null } });

  const apercu = await lancer(cuisine, "preview", "--json");
  assert.equal(apercu.code, 0, apercu.sortie);
  assert.equal(apercu.json.configured, false);
  assert.equal(apercu.json.cost, null);
  assert.equal(apercu.json.ifRequested.outcome, "refused");
  assert.equal(apercu.json.ifRequested.reason.reason, "unconfigured");

  const demande = await lancer(cuisine, "write", "--json", "--confirm");
  assert.equal(demande.code, 1, demande.sortie);
  assert.equal(demande.json.outcome, "refused");
  assert.equal(demande.json.reason.reason, "unconfigured");
  assert.match(demande.json.text, /^closing pass refused, nothing is started — the closer is not set on this project — `brigade <projet> station closer-modele <model>` and `brigade <projet> station closer-effort <effort>` set it, without a restart$/);
  assert.ok(!cuisine.types().includes("closing.requested"));
});

test("le retrait d'une demande qui n'est pas partie la retire ; partie, il est refusé avec sa raison", { skip: posixOnly("withdraws then asks again for a closing pass through the app's gesture, whose closer is the fake claude (a bash script) on a real git repository; the pass judged the closer's files out of its zone; on the Windows job: + 'zone' - 'delivered'") }, async (t) => {
  const cuisine = cuisineFermee(t);
  const { closer, types } = cuisine;
  closer.gestes(`attendre\n${RETIRER_M1}`);
  cookEnVol(cuisine, 7);

  const rien = await lancer(cuisine, "cancel", "--json");
  assert.equal(rien.code, 0, rien.sortie);
  assert.deepEqual(rien.json, { outcome: "none", text: "no closing pass is requested: nothing to cancel" });

  assert.equal((await lancer(cuisine, "write", "--json", "--confirm")).json.outcome, "requested");
  const retiree = await lancer(cuisine, "cancel", "--json");
  assert.equal(retiree.code, 0, retiree.sortie);
  assert.equal(retiree.json.outcome, "cancelled");
  assert.match(retiree.json.text, /^closing pass request of \S+ withdrawn: nothing has left/);
  assert.ok(types().includes("closing.cancelled"));
  assert.deepEqual((await lancer(cuisine, "preview", "--json")).json.request, { state: "none" });

  // Rien ne part, même quand la condition se remplit.
  cookFini(cuisine, 7);
  await ticks(cuisine, 10);
  assert.deepEqual(closer.lancements(), []);

  // Redemandée, elle part ; partie, le retrait est refusé, et dit pourquoi.
  assert.equal((await lancer(cuisine, "write", "--json", "--confirm")).json.outcome, "requested");
  await jusqua(() => closer.lancements().length === 1);
  const tard = await lancer(cuisine, "cancel", "--json");
  assert.equal(tard.code, 1, tard.sortie);
  assert.equal(tard.json.outcome, "refused");
  assert.match(tard.json.run, /^fermeture-[0-9a-f]{8}$/);
  assert.match(tard.json.text, /^closing run fermeture-[0-9a-f]{8} has left: it cannot be recalled — “stop” halts it/);
  closer.feu();
  assert.equal((await cuisine.fin()).outcome, "delivered");
});

test("un geste de l'app mal écrit sort en 2 et n'écrit rien", async (t) => {
  const cuisine = cuisineFermee(t);
  for (const args of [["preview", "--confirm"], ["cancel", "--json", "--confirm"], ["write", "--json", "--oui"], ["preview", "encore"]]) {
    const { code, sortie } = await lancer(cuisine, ...args);
    assert.equal(code, 2, `${args.join(" ")} : ${sortie}`);
    assert.match(sortie, /^brigade : usage: /, args.join(" "));
  }
  assert.deepEqual(demandes(cuisine), []);
});
