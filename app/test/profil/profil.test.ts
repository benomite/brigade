// Un profil de cook proposé, côté process principal (app/src/profil.ts, #1053) : le champ `profils` de
// `facts` lu champ pour champ, la carte qu'il donne au rail — le nom, le domaine, les chiffres dits en
// phrases, les tickets ouvrables, ce que le profil contiendrait —, et le « yes » ou le « no » du chef,
// lancé une fois sur la box par un faux `ssh` écrit par chaque test. La forme lue est tenue contre celle
// que le runtime écrit (runtime/src/profils/cartes.ts) par le contrôle de types.
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import type { CarteDeProfil as CarteDuRuntime } from "../../../runtime/src/profils/cartes.ts";
import { INCONNUE, PAS_COMPRIS, SANS_GESTE } from "../../src/correction.ts";
import { comprendre, tenirFaits, type Faits } from "../../src/faits.ts";
import { carteDeProfil, commandeDe, type ProfilLu, profilsLus, repondreAuProfil } from "../../src/profil.ts";
import { FAITS, PROFIL } from "./donnees.ts";

// Ce que le runtime écrit, l'app le lit : toute carte de `facts` entre dans la forme de l'app.
const _formeTenue: CarteDuRuntime extends ProfilLu ? true : never = true;
void _formeTenue;

const A = "2026-10-13T10:04:12.000Z";
const lire = (faits: unknown) => tenirFaits().recevoir({ projet: "parade", demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(faits) }] });

describe("le profil proposé, dans `facts`", () => {
  test("lu champ pour champ, tel que le runtime l'écrit", () => {
    assert.deepEqual(profilsLus([PROFIL]), [PROFIL]);
    const faits = comprendre(JSON.stringify(FAITS));
    assert.ok(!("informe" in faits));
    assert.deepEqual(faits.profils, [PROFIL]);
  });

  test("une proposition : une carte de la file — son nom, son domaine, ses chiffres, ses tickets, ce que le profil contiendrait", () => {
    const recue = lire(FAITS);
    assert.ok("tableau" in recue);
    assert.deepEqual(recue.tableau.rail.profils, [
      {
        proposition: 377,
        nom: "app-src-vue",
        domaine: "app/src/vue",
        frequence: "5 of the last 20 tickets served touch it",
        premierCoup: "delivered on the first try: 40% here (2 of 5), against 75% for the whole project (15 of 20) — 35 points below",
        seuils: "proposed because it touches at least 5 of the last 20 tickets served and sits at least 20 points below the project's first-try rate — the project's thresholds",
        tickets: [
          { ticket: 4, ouvrable: true },
          { ticket: 7, ouvrable: true },
          { ticket: 9, ouvrable: true },
          { ticket: 11, ouvrable: true },
          { ticket: 14, ouvrable: false },
        ],
        skills: [],
        perimetre: ["app/src/vue"],
        carnet: [
          { id: "L-007", texte: "A view change is judged on a screenshot.", de: "from #9" },
          { id: "L-012", texte: "Reuse the bricks before writing a new style.", de: "from #11, retro-3" },
        ],
        proposee: "2026-10-13T09:41:05.000Z",
      },
    ]);
  });

  test("sans proposition, aucune carte : le champ manque, ou il est vide", () => {
    const { profils: _, ...sans } = FAITS;
    for (const faits of [sans, { ...FAITS, profils: [] }]) {
      const recue = lire(faits);
      assert.ok("tableau" in recue);
      assert.equal("profils" in recue.tableau.rail, false);
    }
  });

  test("un profil qui n'a pas sa forme refuse `facts` entier, et dit quel champ", () => {
    for (const [faute, champ] of [
      [{ ...PROFIL, chiffres: { ...PROFIL.chiffres, tickets: [{ ticket: "4", url: null }] } }, "profils[0].chiffres.tickets[0].ticket"],
      [{ ...PROFIL, chiffres: { ...PROFIL.chiffres, domaine: { premiers: 2, retenus: 5, part: 2 } } }, "profils[0].chiffres.domaine.part"],
      [{ ...PROFIL, carnet: [{ id: "L-1", texte: "x", retros: "#9" }] }, "profils[0].carnet[0].retros"],
      [{ ...PROFIL, skills: undefined }, "profils[0].skills"],
      [{ ...PROFIL, proposee: "hier" }, "profils[0].proposee"],
    ] as const) {
      const faits = comprendre(JSON.stringify({ ...FAITS, profils: [faute] }));
      assert.ok("informe" in faits, champ);
      assert.match(faits.informe, new RegExp(`^${champ.replaceAll(/[[\].]/g, "\\$&")}:`));
    }
    assert.ok("informe" in comprendre(JSON.stringify({ ...FAITS, profils: {} })));
  });

  test("chaque ticket du domaine s'ouvre à l'adresse que la box a donnée — en https seulement", () => {
    const tenus = tenirFaits();
    tenus.recevoir({ projet: "parade", demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(FAITS) }] });
    assert.equal(tenus.adresse("parade", 4), "https://github.com/chef/parade/issues/4");
    assert.equal(tenus.adresse("parade", 11), "https://github.com/chef/parade/issues/11");
    // #14 : la box n'en connaît pas l'adresse.
    assert.equal(tenus.adresse("parade", 14), undefined);
    assert.deepEqual(tenus.profils("parade"), [377]);
    assert.deepEqual(tenus.profils("cantine"), []);
  });

  test("les parts se disent en pour cent arrondis, l'écart en points arrondis ; une leçon sans rétro ne dit pas d'où elle vient", () => {
    const carte = carteDeProfil({
      ...PROFIL,
      chiffres: { ...PROFIL.chiffres, domaine: { premiers: 1, retenus: 3, part: 1 / 3 }, projet: { premiers: 14, retenus: 19, part: 14 / 19 }, ecart: 40.35087719298246 },
      carnet: [{ id: "L-1", texte: "x", retros: [] }],
    });
    assert.equal(carte.premierCoup, "delivered on the first try: 33% here (1 of 3), against 74% for the whole project (14 of 19) — 40 points below");
    assert.deepEqual(carte.carnet, [{ id: "L-1", texte: "x", de: "" }]);
  });
});

// --- Le geste, sur la box ------------------------------------------------------------

const SERVI = { nom: "parade", box: { hote: "box" } };
const OPTIONS = "-o BatchMode=yes -o ConnectTimeout=10";

// Un faux `ssh` : il note chaque appel, puis joue `corps`.
function box(t: TestContext, corps: string) {
  const racine = mkdtempSync(join(tmpdir(), "profil-geste-"));
  t.after(() => rmSync(racine, { recursive: true, force: true }));
  const ssh = join(racine, "ssh");
  writeFileSync(ssh, `#!/bin/sh\nD='${racine}'\necho "$*" >>"$D/appels"\n${corps}\n`);
  chmodSync(ssh, 0o755);
  const appels = () => (existsSync(join(racine, "appels")) ? readFileSync(join(racine, "appels"), "utf8") : "");
  return { reglages: { ssh, delaiMs: 60_000, connexionS: 10 }, appels };
}
const dit = (texte: string, code = 0) => `cat <<'FIN'\n${texte}\nFIN\nexit ${code}`;

describe("le « yes » ou le « no » du chef sur un profil proposé, sur la box", () => {
  test("les deux commandes sont `profile yes <proposition>` et `profile no <proposition>`", () => {
    assert.equal(commandeDe("yes", 377), "profile yes 377");
    assert.equal(commandeDe("no", 7), "profile no 7");
  });

  test("« yes » lance `profile yes 377`, une fois : écrite, la réponse fait quitter la file à la carte", async (t) => {
    const { reglages, appels } = box(t, dit("profile app-src-vue accepted: .claude/brigade/profils/app-src-vue.md"));
    const rendu = await repondreAuProfil(reglages, SERVI, [377], 377, "yes");
    assert.ok("tranchee" in rendu);
    assert.equal(rendu.tranchee, "yes");
    assert.match(rendu.dit, /definition is written to the project's repository/);
    assert.equal(appels(), `${OPTIONS} -- box brigade parade profile yes 377\n`);
  });

  test("« no » lance `profile no 377`, une fois", async (t) => {
    const { reglages, appels } = box(t, dit("profile app-src-vue refused"));
    const rendu = await repondreAuProfil(reglages, SERVI, [377], 377, "no");
    assert.ok("tranchee" in rendu);
    assert.equal(rendu.tranchee, "no");
    assert.equal(appels(), `${OPTIONS} -- box brigade parade profile no 377\n`);
  });

  test("une proposition que les derniers faits lus ne portent pas, ou une autre réponse que « yes » et « no » : rien n'est lancé", async (t) => {
    const { reglages, appels } = box(t, dit("ok"));
    for (const proposition of [378, "377", undefined]) assert.deepEqual(await repondreAuProfil(reglages, SERVI, [377], proposition, "yes"), { refus: INCONNUE, detail: "" });
    for (const reponse of ["oui", "YES", undefined]) assert.deepEqual(await repondreAuProfil(reglages, SERVI, [377], 377, reponse), { refus: PAS_COMPRIS, detail: "" });
    assert.equal(appels(), "");
  });

  test("refusée par le runtime (1) — le profil existe déjà dans le dépôt : sa dernière ligne le dit, la carte reste", async (t) => {
    const { reglages } = box(t, dit("brigade: .claude/brigade/profils/app-src-vue.md already exists: nothing was written", 1));
    const rendu = await repondreAuProfil(reglages, SERVI, [377], 377, "yes");
    assert.ok("refus" in rendu);
    assert.equal(rendu.refus, "nothing was recorded — brigade: .claude/brigade/profils/app-src-vue.md already exists: nothing was written");
    assert.match(rendu.detail, /exit code 1/);
  });

  test("un runtime qui ne connaît pas encore le geste (66, ou 2 sur son usage) : une ligne, la commande et le code au survol", async (t) => {
    for (const code of [66, 2]) {
      const { reglages } = box(t, `echo "brigade: “profile” is not a command of the runtime" >&2\nexit ${code}`);
      const rendu = await repondreAuProfil(reglages, SERVI, [377], 377, "no");
      assert.ok("refus" in rendu);
      assert.equal(rendu.refus, SANS_GESTE);
      assert.match(rendu.detail, /profile no 377/);
      assert.match(rendu.detail, new RegExp(`exit code ${code}`));
    }
  });
});

// Les faits de « parade » d'un runtime qui porte un profil proposé : le type de la forme les tient.
void (FAITS satisfies Faits);
