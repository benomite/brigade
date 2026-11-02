// La cadence du rôle produit, sur un vrai runtime : rail, garde-fous, un faux
// rôle dont le test écrit la réponse, un GitHub de test et une horloge que le
// test avance. Le tick du runtime bat toutes les 20 ms ; ce qui doit ne pas
// arriver est vérifié après plusieurs ticks, jamais après une durée.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { avecRail } from "../../../src/alimenter.ts";
import { brancherGardeFous } from "../../../src/garde-fous.ts";
import { commanderInterrupteur } from "../../../src/interrupteur.ts";
import type { Issue } from "../../../src/github.ts";
import { brancherCadence } from "../../../src/produit/cadence/brancher.ts";
import { principal } from "../../../src/produit/cadence/commande.ts";
import { lireLaCadence } from "../../../src/produit/cadence/etat.ts";
import { ECART_MIN_MS } from "../../../src/produit/cadence/regle.ts";
import { lireRail } from "../../../src/projections/rail.ts";
import { demarrer } from "../../../src/runtime.ts";
import { BAIL_MS, fauxGitHub, issue, montre, REGLAGES } from "../../aides/cuisine.ts";
import { DEPOT, jusqua, repertoireTemporaire } from "../../outils.ts";

const FAUX_ROLE = join(import.meta.dirname, "faux-role.sh");
const JOUR_MS = 24 * 60 * 60 * 1000;

// Une réponse du rôle qui dépose `combien` issues.
const issues = (combien: number, prefixe = "Need") =>
  Array.from({ length: combien }, (_, rang) => [`## Issue: ${prefixe} ${rang + 1}`, "Labels: product, filed-by:product, prio:2", `Filed from usage: #${rang + 1}.`, ""].join("\n")).join("\n");

type Options = { issues?: Issue[]; reponse?: string; allume?: boolean; plafond?: number };

function cuisine(t: TestContext, options: Options = {}) {
  let arreter: (() => void) | undefined;
  t.after(() => arreter?.());
  const repertoire = repertoireTemporaire(t);
  const dossier = join(repertoire, "role");
  mkdirSync(dossier, { recursive: true });
  if (options.reponse !== undefined) writeFileSync(join(dossier, "reponse.txt"), options.reponse);
  const heure = montre();
  const gh = fauxGitHub(...(options.issues ?? []));
  const avertissements: string[] = [];
  const socle = demarrer({ repertoireEtat: repertoire, projet: "brigade", intervalleVeilleMs: 5, intervalleTickMs: 20, maintenant: heure.maintenant });
  const garde = brancherGardeFous(REGLAGES, avecRail(socle, { depot: DEPOT, dureeBailMs: BAIL_MS, gh: "", github: gh.github, maintenant: heure.maintenant }));
  const runtime = brancherCadence(garde, {
    github: gh.github,
    depotGitHub: DEPOT,
    repertoireEtat: repertoire,
    bin: FAUX_ROLE,
    calibrage: () => ({ model: "sonnet", effort: "low" }),
    env: { ...process.env, FAUX_ROLE_DIR: dossier },
    maintenant: heure.maintenant,
    avertir: (message) => void avertissements.push(message),
  });
  arreter = () => runtime.arreter("test");
  const { base } = runtime.journal;
  // Le geste du chef, joué comme `node …/commande.ts` le joue.
  const geste = (...args: string[]) => {
    const dit: string[] = [];
    principal({ args, env: { BRIGADE_STATE_DIR: repertoire }, dire: (ligne) => void dit.push(ligne), redire: (ligne) => void dit.push(ligne) });
    return dit;
  };
  if (options.plafond !== undefined) geste("cap", String(options.plafond));
  if (options.allume ?? true) geste("on");
  const lignes = (fichier: string) => (existsSync(join(dossier, fichier)) ? readFileSync(join(dossier, fichier), "utf8").split("\n").filter(Boolean).length : 0);
  const lancements = () => lignes("lancements");
  const ticks = () => base.lire<{ n: number }>("SELECT count(*) AS n FROM events WHERE type = 'runtime.ticked'")[0]?.n ?? 0;
  // Laisse passer `combien` ticks de plus, et le temps que chacun finisse ce qu'il a commencé.
  // Les ticks battent pendant qu'un passage attend son rôle : on attend d'abord que tout rôle
  // lancé ait fini, puis on compte — un rôle lent (bash sous Windows) dure plus de dix ticks.
  const laisserPasser = async (combien = 10) => {
    await jusqua(() => lignes("fins") === lancements());
    const depart = ticks();
    await jusqua(() => ticks() >= depart + combien);
  };
  const deposees = () => gh.creations.map((numero) => ({ numero, titre: gh.lire(numero)?.title, labels: gh.lire(numero)?.labels }));
  return { repertoire, dossier, base, journal: runtime.journal, gh, heure, avertissements, geste, lancements, laisserPasser, deposees, consigne: () => readFileSync(join(dossier, "consigne"), "utf8") };
}

describe("le rail vide réveille le rôle", () => {
  test("rail vide, aucune UI, rôle allumé : un tick le lance une fois, et ce qu'il écrit est déposé sous ses labels", async (t) => {
    const k = cuisine(t, { reponse: issues(2) });
    await jusqua(() => k.gh.creations.length === 2);
    await k.laisserPasser();
    assert.equal(k.lancements(), 1, "une fois, pas à chaque tick");
    assert.deepEqual(k.deposees(), [
      { numero: 501, titre: "Need 1", labels: ["product", "filed-by:product", "prio:2"] },
      { numero: 502, titre: "Need 2", labels: ["product", "filed-by:product", "prio:2"] },
    ]);
    assert.match(k.consigne(), /au plus 3 dépôts/);
    const etat = lireLaCadence(k.base);
    assert.equal(etat.deposees, 2);
    assert.equal(etat.dernierPassage, "2026-10-08T10:00:00.000Z");
    assert.ok(k.avertissements.includes("brigade : product role runs — the rail is empty; it may file 3 today"), k.avertissements.join("\n"));
    assert.ok(k.avertissements.includes("brigade : product role filed #501, #502 — 2/3 today"), k.avertissements.join("\n"));
  });

  test("un ticket sur le rail : le rôle ne part pas", async (t) => {
    // Allumé une fois le ticket sur le rail : un tick d'avant le premier sondage ne le verrait pas.
    const k = cuisine(t, { issues: [issue(7)], reponse: issues(1), allume: false });
    await jusqua(() => lireRail(k.base).length === 1);
    k.geste("on");
    await k.laisserPasser();
    assert.equal(k.lancements(), 0);
    assert.deepEqual(k.gh.creations, []);
    assert.equal(lireLaCadence(k.base).dernierPassage, null);
  });

  test("un ticket sur le rail, mais une issue d'un autre que le chef sans réponse depuis plus d'un jour : le rôle part, et la lit", async (t) => {
    const k = cuisine(t, { issues: [issue(7), issue(9, [], { title: "Crash on start" })], reponse: issues(1), allume: false });
    k.gh.decrire(9, { association: "NONE", body: "It crashes when I open it." });
    await jusqua(() => lireRail(k.base).length === 1);
    k.geste("on");
    await jusqua(() => k.lancements() === 1);
    await jusqua(() => k.gh.creations.length === 1);
    assert.equal(lireRail(k.base).length, 1);
    assert.match(k.consigne(), /^#### #9 Crash on start\n\nIt crashes when I open it\.$/m);
    assert.ok(k.avertissements.some((ligne) => ligne.includes("1 outside issue unanswered for more than a day (#9)")), k.avertissements.join("\n"));
  });

  test("l'issue d'un autre à laquelle le chef a répondu ne réveille pas le rôle", async (t) => {
    const k = cuisine(t, { issues: [issue(7), issue(9, [])], reponse: issues(1), allume: false });
    k.gh.decrire(9, { association: "NONE", body: "Help." });
    k.gh.repondre(9, "Thanks, looking into it.");
    await jusqua(() => lireRail(k.base).length === 1);
    k.geste("on");
    await k.laisserPasser();
    assert.equal(k.lancements(), 0);
  });

  test("après un passage, il ne repart qu'une fois l'écart passé", async (t) => {
    const k = cuisine(t);
    await jusqua(() => k.lancements() === 1);
    // Le lancement précède la réponse du rôle : on attend l'avertissement, pas un nombre de ticks.
    await jusqua(() => k.avertissements.includes("brigade : product role filed nothing — rien de neuf."));
    await k.laisserPasser();
    assert.equal(k.lancements(), 1);
    k.heure.avancer(ECART_MIN_MS);
    await jusqua(() => k.lancements() === 2);
  });
});

describe("le plafond du jour", () => {
  test("le rôle ne dépose jamais plus que le plafond ; au plafond, les ticks du jour ne déposent rien et le disent une fois ; le lendemain, il reprend", async (t) => {
    const k = cuisine(t, { plafond: 2, reponse: issues(3) });
    await jusqua(() => k.gh.creations.length === 2);
    await k.laisserPasser();
    assert.equal(k.gh.creations.length, 2, "la troisième dépasse le plafond");
    assert.match(k.consigne(), /au plus 2 dépôts/);
    assert.ok(k.avertissements.includes("brigade : product role — 1 section beyond the daily cap, not filed"), k.avertissements.join("\n"));

    // Le même jour, passé l'écart : rien ne part, et le journal du runtime dit le plafond — une fois.
    k.heure.avancer(ECART_MIN_MS);
    const dit = "brigade : product role — daily cap reached (2/2 filed today): nothing more is filed before tomorrow";
    await jusqua(() => k.avertissements.includes(dit));
    await k.laisserPasser();
    assert.equal(k.lancements(), 1);
    assert.equal(k.gh.creations.length, 2);
    assert.equal(k.avertissements.filter((ligne) => ligne === dit).length, 1);

    // Le lendemain : il repart, et dépose de nouveau.
    k.heure.avancer(JOUR_MS);
    await jusqua(() => k.gh.creations.length === 4);
    assert.equal(k.lancements(), 2);
    const etat = lireLaCadence(k.base);
    assert.equal(etat.jour, "2026-10-09");
    assert.equal(etat.deposees, 2);
  });

  test("les issues `filed-by:product` créées aujourd'hui sur GitHub comptent, même si ce runtime ne les a pas déposées", async (t) => {
    const k = cuisine(t, { plafond: 1, reponse: issues(1), issues: [issue(80, ["product", "filed-by:product", "prio:1"], { createdAt: "2026-10-08T08:00:00Z", updatedAt: "2026-10-08T08:00:00Z" })] });
    await jusqua(() => k.avertissements.some((ligne) => ligne.includes("daily cap reached (1/1 filed today)")));
    await k.laisserPasser();
    assert.equal(k.lancements(), 0);
    assert.deepEqual(k.gh.creations, []);
  });

  test("un plafond de 0 : le rôle ne part jamais", async (t) => {
    const k = cuisine(t, { plafond: 0, reponse: issues(1) });
    await k.laisserPasser();
    assert.equal(k.lancements(), 0);
  });
});

describe("l'interrupteur du rôle", () => {
  test("éteint par défaut : tant que le chef ne l'a pas allumé, rien ne part", async (t) => {
    const k = cuisine(t, { allume: false, reponse: issues(1) });
    await k.laisserPasser();
    assert.equal(k.lancements(), 0);
    assert.equal(lireLaCadence(k.base).allume, false);
  });

  test("`off` arrête tout passage ; `on`, du même geste, les fait reprendre", async (t) => {
    const k = cuisine(t, { reponse: issues(1) });
    await jusqua(() => k.gh.creations.length === 1);
    // Le geste dit la ligne de `status` à l'heure de la machine, pas à celle du test : le compte du jour n'y est pas lu.
    assert.match(k.geste("off").join("\n"), /^brigade : product role: OFF — \d+\/3 issues filed today — last run: 2026-10-08 10:00 UTC$/);
    k.heure.avancer(ECART_MIN_MS);
    await k.laisserPasser();
    assert.equal(k.lancements(), 1, "éteint, il ne part plus");
    assert.match(k.geste("on").join("\n"), /^brigade : product role: ON — /);
    await jusqua(() => k.lancements() === 2);
    await jusqua(() => k.gh.creations.length === 2);
  });

  test("l'interrupteur du projet éteint retient le rôle comme il retient les cooks", async (t) => {
    const k = cuisine(t, { allume: false, reponse: issues(1) });
    commanderInterrupteur(k.journal, "off", k.heure.maintenant());
    k.geste("on");
    await k.laisserPasser();
    assert.equal(k.lancements(), 0);
  });
});

describe("chaque projet a sa cadence", () => {
  test("deux projets, deux plafonds : chacun est tenu", async (t) => {
    const un = cuisine(t, { plafond: 1, reponse: issues(3, "One") });
    const deux = cuisine(t, { plafond: 2, reponse: issues(3, "Two") });
    await jusqua(() => un.gh.creations.length === 1 && deux.gh.creations.length === 2);
    await Promise.all([un.laisserPasser(), deux.laisserPasser()]);
    assert.deepEqual(un.deposees().map(({ titre }) => titre), ["One 1"]);
    assert.deepEqual(deux.deposees().map(({ titre }) => titre), ["Two 1", "Two 2"]);
    assert.equal(lireLaCadence(un.base).plafond, 1);
    assert.equal(lireLaCadence(deux.base).plafond, 2);
    // Éteindre l'un n'éteint pas l'autre.
    un.geste("off");
    assert.equal(lireLaCadence(deux.base).allume, true);
  });
});
