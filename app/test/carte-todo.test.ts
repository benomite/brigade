// La carte de TODO, côté process principal (#1281, épique #1277) : ce que `facts` donne dans
// `attend[].carte` (runtime/src/etat.ts, `CarteVue`) est lu — ou laissé de côté s'il n'en a pas la
// forme —, rangé pour la carte du rail, et la réponse du chef part sur la box par une seule commande du
// runtime : `rail choose <ticket> <n>` ou `rail answer <ticket> <texte>`.
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import type { CarteVue } from "../../runtime/src/etat.ts";
import { CHANGEE, carteDeTodo, carteLue, choisir, INCONNUE, PRIX_DU_TEXTE, repondre, repondreALaCarte, SANS_GESTE, VIDE } from "../src/carte-todo.ts";
import { comprendre, tenirFaits, type Faits } from "../src/faits.ts";
import { SANS_POSIX } from "./aides/posix.ts";

const ISSUE = (ticket: number) => `https://github.com/chef/parade/issues/${ticket}`;
const CAPTURE = (moment: string) => `https://github.com/chef/parade/blob/5d41402abc4b2a76b9719d911017c592/docs/captures/12/formulaire-${moment}.png?raw=true`;

const DESIGN = {
  type: "design",
  question: "Does the SIRET field read as the mockup draws it?",
  choix: [
    { texte: "Yes, merge it as delivered.", suite: "merge" },
    { texte: "No: the error line goes under the field.", suite: "resume" },
  ],
  captures: { complet: true, ecrans: [{ ecran: "formulaire", avant: CAPTURE("avant"), apres: CAPTURE("apres") }] },
} satisfies CarteVue;
const PRODUIT = {
  type: "product",
  question: "One journal export per project, or a single one?",
  choix: [
    { texte: "One per project.", suite: "resume" },
    { texte: "A single export.", suite: "resume" },
  ],
  captures: null,
} satisfies CarteVue;

const FAITS = {
  etat: "ouverte",
  lu: "2026-10-21T10:04:11.000Z",
  dernierTick: null,
  compteurs: { rail: 1, auTravail: 0, aLaPass: 1, attend: 2, livres24h: 0 },
  dernierEvenement: null,
  rail: [
    { ticket: 12, etat: "en pass", titre: "Validation SIRET", url: ISSUE(12) },
    { ticket: 21, etat: "en attente", titre: "L'export du journal", url: ISSUE(21) },
  ],
  attend: [
    { ticket: 12, titre: "Validation SIRET", url: ISSUE(12), decision: { quoi: "carte", motif: "design", cause: DESIGN.question, pr: null }, carte: DESIGN },
    { ticket: 21, titre: "L'export du journal", url: ISSUE(21), decision: { quoi: "carte", motif: "product", cause: PRODUIT.question, pr: null }, carte: PRODUIT },
  ],
};

describe("la carte de TODO, lue dans `facts`", () => {
  test("`attend[].carte` est lue telle que le runtime la donne : sa sorte, sa question, ses choix, ses captures", () => {
    const lus = comprendre(JSON.stringify(FAITS));
    assert.ok(!("informe" in lus));
    assert.deepEqual(lus.attend?.[0]?.carte, DESIGN);
    assert.deepEqual(lus.attend?.[1]?.carte, PRODUIT);
  });

  test("une carte qui n'en a pas la forme est laissée de côté — le reste de `facts` est lu", () => {
    for (const carte of [{}, { ...PRODUIT, question: "" }, { ...PRODUIT, choix: "1. One" }, { ...PRODUIT, choix: [{ texte: "One" }, PRODUIT.choix[1]] }, "product"]) {
      const lus = comprendre(JSON.stringify({ ...FAITS, attend: [{ ...FAITS.attend[1], carte }] }));
      assert.ok(!("informe" in lus));
      assert.equal(lus.attend?.[0]?.ticket, 21);
      assert.equal(lus.attend?.[0]?.carte, undefined);
    }
    assert.equal(carteLue({ ...DESIGN, captures: "two screens" })?.captures, null);
  });

  test("rangée pour la carte du rail : chaque choix porte son prix, celui d'un merge dit qu'il ne se défait pas ; sans écran, aucune capture", () => {
    const design = carteDeTodo(DESIGN);
    assert.equal(design.sorte, "design");
    assert.deepEqual(
      design.choix.map(({ texte }) => texte),
      DESIGN.choix.map(({ texte }) => texte),
    );
    assert.match(design.choix[0]?.prix ?? "", /merged .* not undone/);
    assert.equal(design.choix[1]?.prix, PRIX_DU_TEXTE);
    assert.deepEqual(design.captures?.ecrans.map(({ avant, apres }) => [avant.livree, apres.livree]), [[true, true]]);
    assert.equal(design.captures?.incomplete, undefined);
    assert.ok(!("captures" in carteDeTodo(PRODUIT)));
  });

  test("le rail porte la carte sur le bon de TODO, et le process principal en garde la carte et les captures", () => {
    const faits = tenirFaits();
    const recue = faits.recevoir({ projet: "parade", demande: 0, a: FAITS.lu, sorties: [{ commande: "facts", texte: JSON.stringify(FAITS) }] });
    assert.ok("tableau" in recue);
    const todo = recue.tableau.rail.colonnes.find(({ nom }) => nom === "TODO");
    assert.deepEqual(
      todo?.cartes.map(({ ticket, todo: carte }) => [ticket, carte?.question]),
      [
        [12, DESIGN.question],
        [21, PRODUIT.question],
      ],
    );
    assert.deepEqual(faits.carte("parade", 21), PRODUIT);
    assert.equal(faits.carte("parade", 30), undefined);
    assert.equal(faits.capture("parade", 12, "formulaire", "apres"), CAPTURE("apres"));
  });
});

// --- La réponse, sur la box ------------------------------------------------------------

const SERVI = { nom: "parade", box: { hote: "box" } };
const OPTIONS = "-o BatchMode=yes -o ConnectTimeout=10";

// Un faux `ssh` : il note chaque appel, puis joue `corps`.
function box(t: TestContext, corps: string) {
  const racine = mkdtempSync(join(tmpdir(), "carte-todo-"));
  t.after(() => rmSync(racine, { recursive: true, force: true }));
  const ssh = join(racine, "ssh");
  writeFileSync(ssh, `#!/bin/sh\nD='${racine}'\nprintf '%s\\n' "$*" >>"$D/appels"\n${corps}\n`);
  chmodSync(ssh, 0o755);
  const appels = () => (existsSync(join(racine, "appels")) ? readFileSync(join(racine, "appels"), "utf8") : "");
  return { reglages: { ssh, delaiMs: 60_000, connexionS: 10 }, appels };
}
const dit = (texte: string, code = 0, sortie: 1 | 2 = 1) => `cat <<'FIN' >&${sortie}\n${texte}\nFIN\nexit ${code}`;

describe("la réponse du chef, sur la box", () => {
  test("les deux commandes : `rail choose <ticket> <n>`, et `rail answer <ticket>` suivi du texte en un seul argument cité", () => {
    assert.equal(choisir(21, 2), "rail choose 21 2");
    assert.equal(repondre(12, "it's fine"), `rail answer 12 'it'\\''s fine'`);
  });

  test("un clic sur un choix lance `rail choose`, une fois : écrite, la réponse fait quitter TODO à la carte", { skip: SANS_POSIX }, async (t) => {
    const { reglages, appels } = box(t, dit("#21: card answered, choice 2 — cost: your answer is written on the issue"));
    const rendu = await repondreALaCarte(reglages, SERVI, PRODUIT, 21, { question: PRODUIT.question, choix: 2 });
    assert.deepEqual(rendu, { repondue: true, dit: "#21: card answered, choice 2 — cost: your answer is written on the issue" });
    assert.equal(appels(), `${OPTIONS} -- box brigade parade rail choose 21 2\n`);
  });

  test("le texte libre lance `rail answer`, tel que le chef l'a tapé, ses blancs autour retirés", { skip: SANS_POSIX }, async (t) => {
    const { reglages, appels } = box(t, dit("#12: card answered"));
    const rendu = await repondreALaCarte(reglages, SERVI, DESIGN, 12, { question: DESIGN.question, texte: "  Merge it; don't touch the label.\r\n" });
    assert.ok("repondue" in rendu);
    assert.equal(appels(), `${OPTIONS} -- box brigade parade rail answer 12 'Merge it; don'\\''t touch the label.'\n`);
  });

  test("rien n'est lancé pour une carte que les faits ne portent pas, une autre question, un choix hors de la carte, un texte vide", async (t) => {
    const { reglages, appels } = box(t, dit("ok"));
    assert.deepEqual(await repondreALaCarte(reglages, SERVI, undefined, 21, { question: PRODUIT.question, choix: 1 }), { refus: INCONNUE, detail: "" });
    assert.deepEqual(await repondreALaCarte(reglages, SERVI, PRODUIT, "21", { question: PRODUIT.question, choix: 1 }), { refus: INCONNUE, detail: "" });
    assert.deepEqual(await repondreALaCarte(reglages, SERVI, PRODUIT, 21, { question: "Another question?", choix: 1 }), { refus: CHANGEE, detail: "" });
    for (const choix of [0, 3, 1.5, "1"]) assert.match(((await repondreALaCarte(reglages, SERVI, PRODUIT, 21, { question: PRODUIT.question, choix })) as { refus: string }).refus, /choices 1 to 2/);
    for (const texte of ["", "   ", undefined]) assert.deepEqual(await repondreALaCarte(reglages, SERVI, PRODUIT, 21, { question: PRODUIT.question, texte }), { refus: VIDE, detail: "" });
    assert.equal(appels(), "");
  });

  test("refusée par le runtime (1) : sa dernière ligne le dit, la commande et le code au survol", { skip: SANS_POSIX }, async (t) => {
    const { reglages } = box(t, dit("#21 is not touched: a cook is working on #21: answer once it has delivered — cost: none: nothing was changed", 1, 2));
    const rendu = await repondreALaCarte(reglages, SERVI, PRODUIT, 21, { question: PRODUIT.question, choix: 1 });
    assert.ok("refus" in rendu);
    assert.equal(rendu.refus, "nothing was recorded — #21 is not touched: a cook is working on #21: answer once it has delivered — cost: none: nothing was changed");
    assert.match(rendu.detail, /rail choose 21 1/);
    assert.match(rendu.detail, /exit code 1/);
  });

  test("un runtime qui ne connaît pas encore `choose` ni `answer` (2 sur son usage, ou 66) : une ligne, sans commande ni code", { skip: SANS_POSIX }, async (t) => {
    for (const code of [2, 66]) {
      const { reglages } = box(t, dit("unknown gesture: “choose”", code, 2));
      const rendu = await repondreALaCarte(reglages, SERVI, PRODUIT, 21, { question: PRODUIT.question, choix: 1 });
      assert.ok("refus" in rendu);
      assert.equal(rendu.refus, SANS_GESTE);
      assert.doesNotMatch(rendu.refus, /ssh|code|`/);
      assert.match(rendu.detail, new RegExp(`exit code ${code}`));
    }
  });

  test("une box pas jointe : une ligne, et ce que `ssh` a rendu au survol", { skip: SANS_POSIX }, async (t) => {
    const { reglages } = box(t, `echo "ssh: connect to host box port 22: Connection refused" >&2\nexit 255`);
    const rendu = await repondreALaCarte(reglages, SERVI, PRODUIT, 21, { question: PRODUIT.question, choix: 1 });
    assert.ok("refus" in rendu);
    assert.equal(rendu.refus, "nothing was sent: the station could not be asked — not reached");
    assert.match(rendu.detail, /Connection refused/);
  });
});

// Les faits d'un runtime qui porte des cartes de TODO : le type de la forme les tient.
void (FAITS satisfies Faits);
