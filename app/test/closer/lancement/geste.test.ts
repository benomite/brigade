// Les trois gestes de la partie closer, côté process principal (app/src/closer-lancement.ts, #991) :
// l'aperçu, la demande — qui ne part qu'avec le « oui » du chef —, son annulation. Chacun lance, une
// fois, la commande que le runtime offre à l'app (runtime/src/fermeture-action/action.ts) par le geste
// de la station de cet ordinateur, un faux `node` écrit par chaque test ; ce que le runtime répond, en 0
// comme en 1, est rendu tel quel. Les formes rendues sont tenues contre celles du runtime par le contrôle de types.
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import type { Locale } from "../../../src/box.ts";
import { ACTIONS, agirSurLeCloser, SANS_OUI } from "../../../src/closer-lancement.ts";
import { SANS_POSIX } from "../../aides/posix.ts";
import { APERCU } from "./donnees.ts";

const lu = (locale: Locale) => ({ nom: "parade", cuisine: { locale } });

function repertoire(t: TestContext): string {
  const racine = mkdtempSync(join(tmpdir(), "closer-geste-"));
  t.after(() => rmSync(racine, { recursive: true, force: true }));
  return racine;
}

// Un faux `node` de station : il note chaque appel (le geste reçu, son projet et ses mots), puis joue `corps`.
function station(t: TestContext, corps: string) {
  const racine = repertoire(t);
  const runtime = join(racine, "runtime");
  mkdirSync(runtime);
  const node = join(racine, "node");
  writeFileSync(node, `#!/bin/sh\nD='${racine}'\nshift\necho "$*" >>"$D/appels"\n${corps}\n`);
  chmodSync(node, 0o755);
  const appels = () => (existsSync(join(racine, "appels")) ? readFileSync(join(racine, "appels"), "utf8") : "");
  const locale: Locale = { node, runtime, racine, env: { PATH: process.env.PATH } };
  return { reglages: { delaiMs: 60_000 }, servi: lu(locale), locale, appels };
}
// Ce que le faux node écrit sur sa sortie, puis son code.
const dit = (texte: string, code = 0) => `cat <<'FIN'\n${texte}\nFIN\nexit ${code}`;
const agir = (essai: ReturnType<typeof station>, action: string, oui?: unknown) => agirSurLeCloser(essai.reglages, essai.servi, action, oui);
const ligne = (objet: unknown) => JSON.stringify(objet);

describe("les gestes de la partie closer, de la station", () => {
  test("les trois commandes sont celles que le runtime offre à l'app — la demande seule porte `--confirm`", () => {
    assert.deepEqual(ACTIONS, { apercu: "closing preview --json", lancer: "closing write --json --confirm", annuler: "closing cancel --json" });
  });

  test("l'aperçu lance `closing preview --json`, une fois, et rend ce qu'il dit", { skip: SANS_POSIX }, async (t) => {
    const { reglages, servi, appels } = station(t, dit(ligne(APERCU)));
    assert.deepEqual(await agirSurLeCloser(reglages, servi, "apercu"), { apercu: APERCU });
    assert.equal(appels(), `parade closing preview --json\n`);
  });

  test("sans le « oui » du chef, la demande ne part pas : rien n'est lancé", async (t) => {
    const { reglages, servi, appels } = station(t, dit(ligne({ outcome: "requested", waits: null, text: "closing pass requested" })));
    for (const oui of [undefined, false, "true", 1]) assert.deepEqual(await agirSurLeCloser(reglages, servi, "lancer", oui), { refus: SANS_OUI, detail: "" });
    assert.equal(appels(), "");
  });

  test("avec lui, une demande, et une seule : `closing write --json --confirm`", { skip: SANS_POSIX }, async (t) => {
    const demandee = { outcome: "requested", waits: null, text: "closing pass requested — start condition met" };
    const { reglages, servi, appels } = station(t, dit(ligne(demandee)));
    assert.deepEqual(await agirSurLeCloser(reglages, servi, "lancer", true), { demandee });
    assert.equal(appels(), `parade closing write --json --confirm\n`);
  });

  test("refusée ou impossible, le runtime sort en 1 et le dit sur sa sortie : c'est rendu, pas une panne", { skip: SANS_POSIX }, async (t) => {
    const refusee = { outcome: "refused", reason: { reason: "nothing", observed: null, limit: null, detail: "no candidate" }, text: "closing pass refused, nothing is started — nothing to tidy up — no candidate" };
    assert.deepEqual(await agir(station(t, dit(ligne(refusee), 1)), "lancer", true), { demandee: refusee });
    const partie = { outcome: "refused", run: "closing-1", text: "closing run closing-1 has left: it cannot be recalled" };
    const { reglages, servi, appels } = station(t, dit(ligne(partie), 1));
    assert.deepEqual(await agirSurLeCloser(reglages, servi, "annuler"), { retiree: partie });
    assert.equal(appels(), `parade closing cancel --json\n`);
  });

  test("un nom de geste que l'app ne connaît pas ne lance rien", async (t) => {
    const { reglages, servi, appels } = station(t, dit(ligne(APERCU)));
    for (const action of ["write", "toString", "", undefined, 3]) assert.equal(await agirSurLeCloser(reglages, servi, action, true), undefined);
    assert.equal(appels(), "");
  });

  test("un node de la station qui ne se lance pas, un runtime qui ne connaît pas le geste, une sortie sans réponse : une ligne, et ce qui a été obtenu à part", { skip: SANS_POSIX }, async (t) => {
    const sansNode = station(t, "");
    const injoignable = await agirSurLeCloser(sansNode.reglages, lu({ ...sansNode.locale, node: join(sansNode.locale.racine, "absent") }), "apercu");
    assert.ok(injoignable !== undefined && "refus" in injoignable);
    assert.equal(injoignable.refus, "the station could not be asked — not reached");
    assert.match(injoignable.detail, /ENOENT/);
    assert.doesNotMatch(injoignable.refus, /code/);

    const ancien = await agir(station(t, `echo "brigade : usage: closing" >&2\nexit 2`), "apercu");
    assert.ok(ancien !== undefined && "refus" in ancien);
    assert.match(ancien.refus, /does not know this gesture yet — update brigade on the station$/);

    const muet = await agir(station(t, dit('{"etapes":[]}\nsomething else')), "annuler");
    assert.ok(muet !== undefined && "refus" in muet);
    assert.match(muet.refus, /did not return the answer of `closing cancel --json`/);
    assert.match(muet.detail, /something else/);
  });
});
