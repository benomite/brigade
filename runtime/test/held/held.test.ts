// #4271: what the held gestures do when a read fails — the pending file, the file of announces, the comment on GitHub.
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { magasinDeNiveaux } from "../../src/autonomie/agents/niveaux.ts";
import { porteDesGestes } from "../../src/autonomie/agents/porte.ts";
import { OUTCOME } from "../../src/autonomie/agents/gestes.ts";
import { avecLeRailEnFile } from "../../src/attente-du-rail/status.ts";
import { annoncerUneFois, approuverGesteTenu, commentaireDeTenue, direLesTenusDuRail, gestesTenus, lignesDesTenus, lireLesTenus } from "../../src/held/held.ts";
import { repertoireTemporaire } from "../outils.ts";

const PROJET = "held";
const A9 = () => new Date("2026-11-25T09:30:00.000Z");

async function tenirUnDecoupage(repertoire: string, epique = 30) {
  magasinDeNiveaux(repertoire).poser(PROJET, "manager split-epic", "propose");
  const porte = porteDesGestes({ repertoire, projet: PROJET, horloge: A9, avertir: () => {} });
  const passage = await porte.passer({ agent: "manager", reglable: "manager split-epic" }, { line: `split the epic #${epique} into 3 tickets`, reason: "one ticket per part", outcome: OUTCOME.FIXED_BY_SELF }, () => true);
  assert.equal(passage.etat, "held");
  return { porte, id: (passage as { id: number }).id };
}

test("a held split is one record: id, kind, summary, reason, approve command, held at", async (t) => {
  const repertoire = repertoireTemporaire(t);
  const { id } = await tenirUnDecoupage(repertoire);
  assert.deepEqual(gestesTenus(repertoire, { BRIGADE_PROJECT: "shop" }), [
    { id, kind: "epic split", summary: "split #30 into 3 tickets", reason: "one ticket per part", approveCommand: `brigade shop manager approve ${id}`, heldAt: "2026-11-25T09:30:00.000Z", agent: "manager" },
  ]);
  const [tenu] = gestesTenus(repertoire);
  assert.ok(tenu);
  assert.match(commentaireDeTenue(tenu), /Held for the chef[\s\S]*manager approve 1[\s\S]*in the app/);
});

test("a comment that fails is not recorded, and the next poll posts it; a done one is never posted again", async (t) => {
  const repertoire = repertoireTemporaire(t);
  const { id } = await tenirUnDecoupage(repertoire);
  await assert.rejects(annoncerUneFois(repertoire, id, async () => Promise.reject(new Error("GitHub 502"))), /GitHub 502/);
  const postes: number[] = [];
  assert.equal(await annoncerUneFois(repertoire, id, async (tenu) => void postes.push(tenu.id)), true);
  assert.equal(await annoncerUneFois(repertoire, id, async (tenu) => void postes.push(tenu.id)), false);
  assert.deepEqual(postes, [id]);
});

test("a file of announces that cannot be read posts nothing: no comment is posted twice on a guess", async (t) => {
  const repertoire = repertoireTemporaire(t);
  const { id } = await tenirUnDecoupage(repertoire);
  writeFileSync(join(repertoire, "held-announced.json"), "{not json");
  const postes: number[] = [];
  await assert.rejects(annoncerUneFois(repertoire, id, async (tenu) => void postes.push(tenu.id)));
  assert.deepEqual(postes, []);
});

test("a pending file that cannot be read is said in status, never read as nothing held", (t) => {
  const repertoire = repertoireTemporaire(t);
  writeFileSync(join(repertoire, "autonomy-pending.json"), "{not json");
  const lu = lireLesTenus(repertoire);
  assert.deepEqual(lu.tenus, []);
  assert.ok(lu.illisible !== null);
  assert.equal(direLesTenusDuRail(lu), null);
  assert.match(lignesDesTenus(lu, () => "0 s").join("\n"), /held gestures cannot be read/);
});

test("an approved gesture waits for the runtime, not the chef: it leaves the list", async (t) => {
  const repertoire = repertoireTemporaire(t);
  const { id } = await tenirUnDecoupage(repertoire);
  assert.equal(approuverGesteTenu(repertoire, id).id, id);
  assert.deepEqual(gestesTenus(repertoire), []);
  assert.throws(() => approuverGesteTenu(repertoire, 99), /no gesture is pending under 99/);
});

test("the rail's held phrase counts each kind, and tickets queued on GitHub still replace it", () => {
  const tenu = (kind: string, id: number) => ({ id, kind, summary: "s", reason: "r", approveCommand: "c", heldAt: "2026-11-25T09:30:00.000Z", agent: "a" });
  assert.equal(direLesTenusDuRail({ tenus: [tenu("epic split", 1), tenu("closing pass", 2)], illisible: null }), "1 split waits for your OK · 1 closing pass waits for your OK");
  assert.equal(direLesTenusDuRail({ tenus: [], illisible: null }), null);
  const lignes = avecLeRailEnFile(["rail       empty — 2 splits wait for your OK"], [12]);
  assert.match(lignes.join("\n"), /1 queued[\s\S]*#12/);
});
