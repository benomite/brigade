// Une correction proposée des consignes du projet, côté process principal (app/src/correction.ts, #999) :
// le champ `corrections` de `facts` lu champ pour champ, la carte qu'il donne au rail — la cause, les
// tickets ouvrables, le diff découpé par fichier, ses lignes ajoutées et retirées à part, le coût —,
// et le « yes » ou le « no » du chef, lancé une fois sur la box par un faux `ssh` écrit par chaque test.
// La forme lue est tenue contre celle que le runtime écrit (runtime/src/correctif/cartes.ts) par le
// contrôle de types.
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import type { CarteDeCorrection as CarteDuRuntime } from "../../../runtime/src/correctif/cartes.ts";
import { carteDeCorrection, commandeDe, correctionsLues, type CorrectionLue, decouper, INCONNUE, PAS_COMPRIS, repondreALaCorrection, SANS_GESTE } from "../../src/correction.ts";
import { comprendre, tenirFaits, type Faits } from "../../src/faits.ts";
import { CORRECTION, DIFF, FAITS } from "./donnees.ts";

// Ce que le runtime écrit, l'app le lit : toute carte de `facts` entre dans la forme de l'app.
const _formeTenue: CarteDuRuntime extends CorrectionLue ? true : never = true;
void _formeTenue;

const A = "2026-10-13T10:04:12.000Z";
const lire = (faits: unknown) => tenirFaits().recevoir({ projet: "parade", demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(faits) }] });

describe("la correction proposée, dans `facts`", () => {
  test("lue champ pour champ, telle que le runtime l'écrit", () => {
    assert.deepEqual(correctionsLues([CORRECTION]), [CORRECTION]);
    const faits = comprendre(JSON.stringify(FAITS));
    assert.ok(!("informe" in faits));
    assert.deepEqual(faits.corrections, [CORRECTION]);
  });

  test("une proposition : une carte de la file — sa cause, ses tickets, le diff fichier par fichier, son coût", () => {
    const recue = lire(FAITS);
    assert.ok("tableau" in recue);
    assert.deepEqual(recue.tableau.rail.corrections, [
      {
        proposition: 412,
        cause: "gates-app",
        titre: "red gates: app tests",
        tickets: [
          { ticket: 3, ouvrable: true },
          { ticket: 5, ouvrable: true },
          { ticket: 8, ouvrable: false },
        ],
        motif: "The guidance never says a test waits for a fact.",
        fichiers: [
          {
            fichier: "CLAUDE.md",
            ajoutees: 2,
            retirees: 1,
            lignes: [
              { genre: "morceau", texte: "@@ -1,3 +1,4 @@ Conventions" },
              { genre: "contexte", texte: " - Tests: `npm test`." },
              { genre: "retrait", texte: "-- A test may wait a few seconds." },
              { genre: "ajout", texte: "+- A test never runs against the clock:" },
              { genre: "ajout", texte: "+  it waits for a fact." },
              { genre: "contexte", texte: " - Never kill a process by its name." },
            ],
          },
          {
            fichier: ".claude/brigade/gates.sh",
            ajoutees: 1,
            retirees: 0,
            lignes: [
              { genre: "morceau", texte: "@@ -4,2 +4,3 @@" },
              { genre: "contexte", texte: " npm --prefix app test" },
              { genre: "ajout", texte: "+npm --prefix app run typecheck" },
              { genre: "note", texte: "\\ No newline at end of file" },
            ],
          },
        ],
        cout: "18,342 tokens",
        proposee: "2026-10-13T09:58:40.000Z",
      },
    ]);
  });

  test("sans proposition, aucune carte : le champ manque, ou il est vide", () => {
    const { corrections: _, ...sans } = FAITS;
    for (const faits of [sans, { ...FAITS, corrections: [] }]) {
      const recue = lire(faits);
      assert.ok("tableau" in recue);
      assert.equal(recue.tableau.rail.corrections, undefined);
      assert.equal("corrections" in recue.tableau.rail, false);
    }
  });

  test("une correction qui n'a pas sa forme refuse `facts` entier, et dit quel champ", () => {
    for (const [faute, champ] of [
      [{ ...CORRECTION, tickets: [{ ticket: "3", url: null }] }, "corrections[0].tickets[0].ticket"],
      [{ ...CORRECTION, cout: { tokens: -1 } }, "corrections[0].cout.tokens"],
      [{ ...CORRECTION, diff: undefined }, "corrections[0].diff"],
      [{ ...CORRECTION, proposee: "hier" }, "corrections[0].proposee"],
    ] as const) {
      const faits = comprendre(JSON.stringify({ ...FAITS, corrections: [faute] }));
      assert.ok("informe" in faits, champ);
      assert.match(faits.informe, new RegExp(`^${champ.replaceAll(/[[\].]/g, "\\$&")}:`));
    }
    assert.ok("informe" in comprendre(JSON.stringify({ ...FAITS, corrections: {} })));
  });

  test("chaque ticket concerné s'ouvre à l'adresse que la box a donnée — en https seulement", () => {
    const tenus = tenirFaits();
    tenus.recevoir({ projet: "parade", demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(FAITS) }] });
    assert.equal(tenus.adresse("parade", 3), "https://github.com/chef/parade/issues/3");
    assert.equal(tenus.adresse("parade", 5), "https://github.com/chef/parade/issues/5");
    // #8 : la box n'en connaît pas l'adresse.
    assert.equal(tenus.adresse("parade", 8), undefined);
    assert.deepEqual(tenus.corrections("parade"), [412]);
    assert.deepEqual(tenus.corrections("cantine"), []);
  });
});

describe("le diff, découpé pour être lu", () => {
  test("les têtes de fichier nomment le fichier, et ne sont pas des lignes de la correction", () => {
    const [claude, gates] = decouper(DIFF);
    assert.equal(claude?.fichier, "CLAUDE.md");
    assert.equal(gates?.fichier, ".claude/brigade/gates.sh");
    for (const { lignes } of [claude, gates]) for (const { texte } of lignes ?? []) assert.doesNotMatch(texte, /^(diff --git|index |--- |\+\+\+ )/);
  });

  test("chaque ligne est gardée telle quelle, son signe compris : rien n'est récrit", () => {
    const lignes = decouper(DIFF).flatMap(({ lignes: siennes }) => siennes.map(({ texte }) => texte));
    const corps = DIFF.split("\n").filter((ligne) => ligne !== "" && !/^(diff --git|index |--- |\+\+\+ )/.test(ligne));
    assert.deepEqual(lignes, corps);
  });

  test("un diff sans `diff --git` se découpe sur ses `---` / `+++` ; un diff sans tête reste entier, sous le fichier que la box nomme", () => {
    assert.deepEqual(decouper("--- a/docs/team.md\n+++ b/docs/team.md\n@@ -1 +1 @@\n-old\n+new\n"), [
      { fichier: "docs/team.md", ajoutees: 1, retirees: 1, lignes: [{ genre: "morceau", texte: "@@ -1 +1 @@" }, { genre: "retrait", texte: "-old" }, { genre: "ajout", texte: "+new" }] },
    ]);
    assert.deepEqual(decouper("@@ -1 +1 @@\n-old\n+new", ["CLAUDE.md"]), [
      { fichier: "CLAUDE.md", ajoutees: 1, retirees: 1, lignes: [{ genre: "morceau", texte: "@@ -1 +1 @@" }, { genre: "retrait", texte: "-old" }, { genre: "ajout", texte: "+new" }] },
    ]);
  });

  test("une ligne retirée qui commence par `--` reste une ligne retirée, dans un diff de `git`", () => {
    const [fichier] = decouper("diff --git a/CLAUDE.md b/CLAUDE.md\n--- a/CLAUDE.md\n+++ b/CLAUDE.md\n@@ -1,2 +1,2 @@\n--- old rule\n+++ new rule\n");
    assert.deepEqual(fichier?.lignes, [
      { genre: "morceau", texte: "@@ -1,2 +1,2 @@" },
      { genre: "retrait", texte: "--- old rule" },
      { genre: "ajout", texte: "+++ new rule" },
    ]);
  });

  test("le coût se dit en tokens, au singulier pour un seul ; un motif vide n'est pas un motif", () => {
    assert.equal(carteDeCorrection({ ...CORRECTION, cout: { tokens: 1 } }).cout, "1 token");
    assert.equal(carteDeCorrection({ ...CORRECTION, cout: { tokens: 0 } }).cout, "0 tokens");
    assert.equal(carteDeCorrection({ ...CORRECTION, motif: "  " }).motif, null);
    assert.equal(carteDeCorrection({ ...CORRECTION, motif: null }).motif, null);
  });
});

// --- Le geste, sur la box ------------------------------------------------------------

const SERVI = { nom: "parade", box: { hote: "box" } };
const OPTIONS = "-o BatchMode=yes -o ConnectTimeout=10";

// Un faux `ssh` : il note chaque appel, puis joue `corps`.
function box(t: TestContext, corps: string) {
  const racine = mkdtempSync(join(tmpdir(), "correction-geste-"));
  t.after(() => rmSync(racine, { recursive: true, force: true }));
  const ssh = join(racine, "ssh");
  writeFileSync(ssh, `#!/bin/sh\nD='${racine}'\necho "$*" >>"$D/appels"\n${corps}\n`);
  chmodSync(ssh, 0o755);
  const appels = () => (existsSync(join(racine, "appels")) ? readFileSync(join(racine, "appels"), "utf8") : "");
  return { reglages: { ssh, delaiMs: 60_000, connexionS: 10 }, appels };
}
const dit = (texte: string, code = 0) => `cat <<'FIN'\n${texte}\nFIN\nexit ${code}`;

describe("le « yes » ou le « no » du chef, sur la box", () => {
  test("les deux commandes sont `correction yes <proposition>` et `correction no <proposition>`", () => {
    assert.equal(commandeDe("yes", 412), "correction yes 412");
    assert.equal(commandeDe("no", 7), "correction no 7");
  });

  test("« yes » lance `correction yes 412`, une fois : écrite, la réponse fait quitter la file à la carte", async (t) => {
    const { reglages, appels } = box(t, dit("correction 412 accepted"));
    const rendu = await repondreALaCorrection(reglages, SERVI, [412], 412, "yes");
    assert.ok("tranchee" in rendu);
    assert.equal(rendu.tranchee, "yes");
    assert.equal(appels(), `${OPTIONS} -- box brigade parade correction yes 412\n`);
  });

  test("« no » lance `correction no 412`, une fois", async (t) => {
    const { reglages, appels } = box(t, dit("correction 412 refused"));
    const rendu = await repondreALaCorrection(reglages, SERVI, [412], 412, "no");
    assert.ok("tranchee" in rendu);
    assert.equal(rendu.tranchee, "no");
    assert.equal(appels(), `${OPTIONS} -- box brigade parade correction no 412\n`);
  });

  test("une proposition que les derniers faits lus ne portent pas, ou une autre réponse que « yes » et « no » : rien n'est lancé", async (t) => {
    const { reglages, appels } = box(t, dit("ok"));
    for (const proposition of [413, "412", undefined, -1]) assert.deepEqual(await repondreALaCorrection(reglages, SERVI, [412], proposition, "yes"), { refus: INCONNUE, detail: "" });
    for (const reponse of ["oui", "YES", "", undefined, true]) assert.deepEqual(await repondreALaCorrection(reglages, SERVI, [412], 412, reponse), { refus: PAS_COMPRIS, detail: "" });
    assert.equal(appels(), "");
  });

  test("refusée par le runtime (1) : sa dernière ligne le dit, rien n'est écrit, la carte reste", async (t) => {
    const { reglages } = box(t, dit("brigade: correction 412 is not shown in the queue: it cannot be answered", 1));
    const rendu = await repondreALaCorrection(reglages, SERVI, [412], 412, "yes");
    assert.ok("refus" in rendu);
    assert.equal(rendu.refus, "nothing was recorded — brigade: correction 412 is not shown in the queue: it cannot be answered");
    assert.match(rendu.detail, /exit code 1/);
  });

  test("un runtime qui ne connaît pas encore le geste (66, ou 2 sur son usage) : une ligne, la commande et le code au survol", async (t) => {
    for (const code of [66, 2]) {
      const { reglages } = box(t, `echo "brigade: “correction” is not a command of the runtime" >&2\nexit ${code}`);
      const rendu = await repondreALaCorrection(reglages, SERVI, [412], 412, "no");
      assert.ok("refus" in rendu);
      assert.equal(rendu.refus, SANS_GESTE);
      assert.match(rendu.detail, /correction no 412/);
      assert.match(rendu.detail, new RegExp(`exit code ${code}`));
      assert.doesNotMatch(rendu.refus, /ssh|code|`/);
    }
  });

  test("une box pas jointe : une ligne, et ce que `ssh` a rendu au survol", async (t) => {
    const { reglages } = box(t, `echo "ssh: connect to host box port 22: Connection refused" >&2\nexit 255`);
    const rendu = await repondreALaCorrection(reglages, SERVI, [412], 412, "yes");
    assert.ok("refus" in rendu);
    assert.equal(rendu.refus, "nothing was sent: the station could not be asked — not reached");
    assert.match(rendu.detail, /Connection refused/);
  });
});

// Les faits de « parade » d'un runtime qui porte une correction : le type de la forme les tient.
void (FAITS satisfies Faits);
