// Les trois gestes de la partie closer, côté process principal (app/src/closer-lancement.ts, #991) :
// l'aperçu, la demande — qui ne part qu'avec le « oui » du chef —, son annulation. Chacun lance, une
// fois, la commande que le runtime offre à l'app (runtime/src/fermeture-action/action.ts) sur la box
// du projet, par un faux `ssh` écrit par chaque test ; ce que le runtime répond, en 0 comme en 1, est
// rendu tel quel. Les formes rendues sont tenues contre celles du runtime par le contrôle de types.
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { ACTIONS, agirSurLeCloser, SANS_OUI } from "../../../src/closer-lancement.ts";
import { SANS_POSIX } from "../../aides/posix.ts";
import { APERCU } from "./donnees.ts";

const SERVI = { nom: "parade", box: { hote: "box" } };
const OPTIONS = "-o BatchMode=yes -o ConnectTimeout=10";

function repertoire(t: TestContext): string {
  const racine = mkdtempSync(join(tmpdir(), "closer-geste-"));
  t.after(() => rmSync(racine, { recursive: true, force: true }));
  return racine;
}

// Un faux `ssh` : il note chaque appel, puis joue `corps`.
function box(t: TestContext, corps: string) {
  const racine = repertoire(t);
  const ssh = join(racine, "ssh");
  writeFileSync(ssh, `#!/bin/sh\nD='${racine}'\necho "$*" >>"$D/appels"\n${corps}\n`);
  chmodSync(ssh, 0o755);
  const appels = () => (existsSync(join(racine, "appels")) ? readFileSync(join(racine, "appels"), "utf8") : "");
  return { reglages: { ssh, delaiMs: 60_000, connexionS: 10 }, appels };
}
// Ce que le faux ssh écrit sur sa sortie, puis son code.
const dit = (texte: string, code = 0) => `cat <<'FIN'\n${texte}\nFIN\nexit ${code}`;
const ligne = (objet: unknown) => JSON.stringify(objet);

describe("les gestes de la partie closer, sur la box", () => {
  test("les trois commandes sont celles que le runtime offre à l'app — la demande seule porte `--confirm`", () => {
    assert.deepEqual(ACTIONS, { apercu: "closing preview --json", lancer: "closing write --json --confirm", annuler: "closing cancel --json" });
  });

  test("l'aperçu lance `closing preview --json`, une fois, et rend ce qu'il dit", { skip: SANS_POSIX }, async (t) => {
    const { reglages, appels } = box(t, dit(ligne(APERCU)));
    assert.deepEqual(await agirSurLeCloser(reglages, SERVI, "apercu"), { apercu: APERCU });
    assert.equal(appels(), `${OPTIONS} -- box brigade parade closing preview --json\n`);
  });

  test("sans le « oui » du chef, la demande ne part pas : rien n'est lancé", async (t) => {
    const { reglages, appels } = box(t, dit(ligne({ outcome: "requested", waits: null, text: "closing pass requested" })));
    for (const oui of [undefined, false, "true", 1]) assert.deepEqual(await agirSurLeCloser(reglages, SERVI, "lancer", oui), { refus: SANS_OUI, detail: "" });
    assert.equal(appels(), "");
  });

  test("avec lui, une demande, et une seule : `closing write --json --confirm`", { skip: SANS_POSIX }, async (t) => {
    const demandee = { outcome: "requested", waits: null, text: "closing pass requested — start condition met" };
    const { reglages, appels } = box(t, dit(ligne(demandee)));
    assert.deepEqual(await agirSurLeCloser(reglages, SERVI, "lancer", true), { demandee });
    assert.equal(appels(), `${OPTIONS} -- box brigade parade closing write --json --confirm\n`);
  });

  test("refusée ou impossible, le runtime sort en 1 et le dit sur sa sortie : c'est rendu, pas une panne", { skip: SANS_POSIX }, async (t) => {
    const refusee = { outcome: "refused", reason: { reason: "nothing", observed: null, limit: null, detail: "no candidate" }, text: "closing pass refused, nothing is started — nothing to tidy up — no candidate" };
    assert.deepEqual(await agirSurLeCloser(box(t, dit(ligne(refusee), 1)).reglages, SERVI, "lancer", true), { demandee: refusee });
    const partie = { outcome: "refused", run: "closing-1", text: "closing run closing-1 has left: it cannot be recalled" };
    const { reglages, appels } = box(t, dit(ligne(partie), 1));
    assert.deepEqual(await agirSurLeCloser(reglages, SERVI, "annuler"), { retiree: partie });
    assert.equal(appels(), `${OPTIONS} -- box brigade parade closing cancel --json\n`);
  });

  test("un nom de geste que l'app ne connaît pas ne lance rien", async (t) => {
    const { reglages, appels } = box(t, dit(ligne(APERCU)));
    for (const action of ["write", "toString", "", undefined, 3]) assert.equal(await agirSurLeCloser(reglages, SERVI, action, true), undefined);
    assert.equal(appels(), "");
  });

  test("une box pas jointe, un runtime qui ne connaît pas le geste, une sortie sans réponse : une ligne, et ce qui a été obtenu à part", { skip: SANS_POSIX }, async (t) => {
    const injoignable = await agirSurLeCloser(box(t, `echo "ssh: connect to host box port 22: Connection refused" >&2\nexit 255`).reglages, SERVI, "apercu");
    assert.ok(injoignable !== undefined && "refus" in injoignable);
    assert.equal(injoignable.refus, "the station could not be asked — not reached");
    assert.match(injoignable.detail, /Connection refused/);
    assert.doesNotMatch(injoignable.refus, /ssh|code/);

    const ancien = await agirSurLeCloser(box(t, `echo "brigade : usage: closing" >&2\nexit 2`).reglages, SERVI, "apercu");
    assert.ok(ancien !== undefined && "refus" in ancien);
    assert.match(ancien.refus, /does not know this gesture yet — update brigade on the station$/);

    const muet = await agirSurLeCloser(box(t, dit('{"etapes":[]}\nsomething else')).reglages, SERVI, "annuler");
    assert.ok(muet !== undefined && "refus" in muet);
    assert.match(muet.refus, /did not return the answer of `closing cancel --json`/);
    assert.match(muet.detail, /something else/);
  });
});
