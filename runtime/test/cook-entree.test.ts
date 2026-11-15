// La consigne d'un cook part sur son entrée, pas sur sa ligne de commande
// (#3655) : Linux plafonne un argument à 128 Kio, et `spawn` échouait en E2BIG.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { argumentsClaude } from "../src/claude.ts";
import type { Plafonds } from "../src/events/guardrails.ts";
import { superviser } from "../src/superviseur.ts";
import { ENV_ENFANT, repertoireTemporaire } from "./outils.ts";

const LARGES: Plafonds = { durationMs: 60_000, tokens: 1_000_000, idleMs: 60_000 };

// Un faux `claude` : note ses arguments et tout ce qu'il lit sur son entrée.
const SCRIPT = `
const { readFileSync, writeFileSync } = require("node:fs");
writeFileSync(process.env.TEMOIN, JSON.stringify({ argv: process.argv.slice(2), entree: readFileSync(0, "utf8") }));
`;

async function lancer(t: TestContext, consigne: string) {
  const repertoire = repertoireTemporaire(t);
  const script = join(repertoire, "faux.cjs");
  const temoin = join(repertoire, "temoin.json");
  writeFileSync(script, SCRIPT);
  const supervise = superviser({
    commande: process.execPath,
    args: [script, ...argumentsClaude({ model: "sonnet", effort: "low" })],
    entree: consigne,
    env: { ...ENV_ENFANT, TEMOIN: temoin },
    plafonds: LARGES,
    graceMs: 2000,
    flux: join(repertoire, "run.jsonl"),
  });
  const fin = await supervise.fin;
  return { fin, ...(JSON.parse(readFileSync(temoin, "utf8")) as { argv: string[]; entree: string }) };
}

test("une consigne de 300 Kio se lance sans spawn E2BIG, et le cook la reçoit entière", async (t) => {
  const consigne = "é".repeat(150 * 1024) + "\nfin";
  assert.ok(Buffer.byteLength(consigne) > 300 * 1024);

  const { fin, entree, argv } = await lancer(t, consigne);

  assert.equal(fin.erreur, null);
  assert.equal(fin.code, 0);
  assert.equal(entree, consigne);
  assert.ok(!argv.some((arg) => arg.includes("é")));
});

test("une petite consigne arrive telle quelle, et la ligne de commande ne la porte pas", async (t) => {
  const consigne = "Tu es un cook.\nTicket #1 — « titre »";

  const { fin, entree, argv } = await lancer(t, consigne);

  assert.equal(fin.erreur, null);
  assert.equal(entree, consigne);
  assert.ok(argv.includes("-p"));
  assert.ok(!argv.some((arg) => arg.includes("Tu es un cook")));
});
