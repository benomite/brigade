// La supervision d'un sous-processus, contre le faux `claude` : aucun quota,
// et des délais en millisecondes.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import type { Plafonds } from "../src/evenements/garde-fous.ts";
import { superviser, type Arret } from "../src/superviseur.ts";
import { FAUX_CLAUDE, repertoireTemporaire } from "./outils.ts";

const LARGES: Plafonds = { turns: 1000, durationMs: 60_000, tokens: 1_000_000, idleMs: 60_000 };

function cook(t: TestContext, scenario: string, plafonds: Partial<Plafonds> = {}, graceMs = 2000) {
  const flux = join(repertoireTemporaire(t), "run.jsonl");
  const arrets: Arret[] = [];
  const supervise = superviser({
    commande: FAUX_CLAUDE,
    args: ["-p", "peu importe"],
    env: { PATH: process.env.PATH ?? "", FAUX_CLAUDE: scenario },
    plafonds: { ...LARGES, ...plafonds },
    graceMs,
    flux,
    surArret: (arret) => arrets.push(arret),
  });
  t.after(() => supervise.abandonner());
  return { ...supervise, flux, arrets };
}

// Résout dès que le cook a écrit dans son flux : il est lancé, et ce qu'il
// fait avant de parler (poser un gestionnaire de signal) est fait.
async function aParle(flux: string): Promise<void> {
  while (!existsSync(flux) || readFileSync(flux, "utf8") === "") await new Promise((resoudre) => setTimeout(resoudre, 5));
}

const vivant = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

// Chaque test attend un vrai process et de vrais délais : ils tournent de
// front, pour que la suite reste de l'ordre de la seconde.
describe("superviser", { concurrency: true }, () => {
  test("un cook qui finit rend son code, ses tours et ses tokens, sans qu'aucun garde-fou n'intervienne", async (t) => {
    const { fin, arrets } = cook(t, "fini");

    const resultat = await fin;

    assert.deepEqual({ ...resultat, durationMs: 0 }, { code: 0, signal: null, turns: 2, tokens: 20, durationMs: 0, arret: null, erreur: null });
    assert.ok(resultat.durationMs > 0);
    assert.deepEqual(arrets, []);
  });

  test("le flux brut du cook est gardé tel quel dans son fichier", async (t) => {
    const { fin, flux } = cook(t, "fini");
    await fin;

    const lignes = readFileSync(flux, "utf8").trimEnd().split("\n").map((ligne) => JSON.parse(ligne).type);
    assert.deepEqual(lignes, ["assistant", "assistant", "result"]);
  });

  test("ce que le cook écrit sur sa sortie d'erreur est gardé à côté du flux", async (t) => {
    const { fin, flux } = cook(t, "plaintif");
    await fin;

    assert.equal(readFileSync(`${flux}.stderr`, "utf8"), "attention\n");
  });

  test("un cook qui échoue rend son code de sortie", async (t) => {
    const resultat = await cook(t, "echec").fin;

    assert.deepEqual([resultat.code, resultat.arret], [1, null]);
  });

  test("un message livré en plusieurs lignes compte pour un tour, et son usage une seule fois", async (t) => {
    const resultat = await cook(t, "morcele").fin;

    assert.deepEqual([resultat.turns, resultat.tokens], [1, 12]);
  });

  test("les tokens comptent l'entrée, la sortie et l'écriture de cache — pas les lectures de cache", async (t) => {
    const resultat = await cook(t, "cache").fin;

    assert.deepEqual([resultat.turns, resultat.tokens], [1, 7]);
  });

  test("un cook qui dépasse son plafond de tours est arrêté, avec le motif", async (t) => {
    const { fin, arrets } = cook(t, "bavard", { turns: 3 });

    const resultat = await fin;

    assert.deepEqual(resultat.arret, { reason: "turns", limit: 3, observed: 4 });
    assert.deepEqual(arrets, [resultat.arret]);
    assert.equal(resultat.signal, "SIGTERM");
  });

  test("un cook qui dépasse son plafond de tokens est arrêté, avec le motif", async (t) => {
    const resultat = await cook(t, "bavard", { tokens: 25 }).fin;

    assert.deepEqual(resultat.arret, { reason: "tokens", limit: 25, observed: 30 });
  });

  test("un cook qui dépasse son plafond de durée est arrêté, même s'il produit", async (t) => {
    const resultat = await cook(t, "bavard", { durationMs: 150 }).fin;

    assert.equal(resultat.arret?.reason, "duration");
    assert.equal(resultat.arret?.limit, 150);
    assert.ok((resultat.arret?.observed ?? 0) >= 150);
  });

  test("un cook muet est détecté comme inactif et arrêté", async (t) => {
    const resultat = await cook(t, "muet", { idleMs: 150 }).fin;

    assert.equal(resultat.arret?.reason, "idle");
    assert.equal(resultat.arret?.limit, 150);
    assert.equal(resultat.turns, 0);
  });

  test("un cook qui se tait après avoir parlé est détecté comme inactif", async (t) => {
    const resultat = await cook(t, "muet-apres-un-tour", { idleMs: 500 }).fin;

    assert.deepEqual([resultat.arret?.reason, resultat.turns], ["idle", 1]);
  });

  test("un cook qui produit n'est pas pris pour un inactif", async (t) => {
    const resultat = await cook(t, "bavard", { idleMs: 500, turns: 350 }).fin;

    assert.equal(resultat.arret?.reason, "turns");
  });

  test("la commande d'arrêt arrête le cook, une seule fois", async (t) => {
    const { fin, arreter, arrets } = cook(t, "bavard");

    arreter();
    arreter();

    assert.deepEqual((await fin).arret, { reason: "stop", limit: null, observed: null });
    assert.equal(arrets.length, 1);
  });

  test("un cook sourd à SIGTERM est tué après le délai de grâce", async (t) => {
    const { fin, arreter, flux } = cook(t, "sourd", {}, 100);
    await aParle(flux);

    arreter();

    assert.equal((await fin).signal, "SIGKILL");
  });

  test("un petit-enfant sourd à SIGTERM meurt avec le groupe de son cook", async (t) => {
    const { fin, flux, pid, arreter } = cook(t, "petit-enfant-sourd");
    await aParle(flux);
    const { petitEnfant } = JSON.parse(readFileSync(flux, "utf8").trim());
    assert.equal(vivant(petitEnfant), true);

    arreter();
    const resultat = await fin;

    assert.equal(resultat.signal, "SIGTERM");
    assert.equal(vivant(petitEnfant), false);
    assert.equal(vivant(pid ?? 0), false);
  });

  test("le motif est remis avant que le signal parte : le cook vit encore quand on le note", async (t) => {
    let vivaitEncore: boolean | null = null;
    const flux = join(repertoireTemporaire(t), "run.jsonl");
    const supervise = superviser({
      commande: FAUX_CLAUDE,
      args: [],
      env: { PATH: process.env.PATH ?? "", FAUX_CLAUDE: "bavard" },
      plafonds: { ...LARGES, turns: 1 },
      graceMs: 2000,
      flux,
      surArret: () => {
        vivaitEncore = vivant(supervise.pid ?? 0);
      },
    });
    t.after(() => supervise.abandonner());

    await supervise.fin;

    assert.equal(vivaitEncore, true);
  });

  test("un motif qui ne peut pas être noté n'empêche pas l'arrêt", async (t) => {
    const flux = join(repertoireTemporaire(t), "run.jsonl");
    const supervise = superviser({
      commande: FAUX_CLAUDE,
      args: [],
      env: { PATH: process.env.PATH ?? "", FAUX_CLAUDE: "bavard" },
      plafonds: { ...LARGES, turns: 1 },
      graceMs: 2000,
      flux,
      surArret: () => {
        throw new Error("journal en panne");
      },
    });
    t.after(() => supervise.abandonner());

    const resultat = await supervise.fin;

    assert.equal(resultat.arret?.reason, "turns");
    assert.equal(resultat.signal, "SIGTERM");
  });

  test("un binaire introuvable est une fin en erreur, pas un cook qui pend", async (t) => {
    const supervise = superviser({
      commande: join(repertoireTemporaire(t), "pas-de-claude-ici"),
      args: [],
      plafonds: LARGES,
      graceMs: 2000,
      flux: join(repertoireTemporaire(t), "run.jsonl"),
    });

    const resultat = await supervise.fin;

    assert.equal(resultat.code, null);
    assert.match(resultat.erreur ?? "", /ENOENT/);
  });

  test("abandonner tue le cook sur-le-champ, sans noter de motif", async (t) => {
    const { fin, abandonner, arrets } = cook(t, "sourd");

    abandonner();

    const resultat = await fin;
    assert.equal(resultat.signal, "SIGKILL");
    assert.equal(resultat.arret, null);
    assert.deepEqual(arrets, []);
  });
});
