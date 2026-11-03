// La limite que GitHub pose au compte, sur chaque projet qu'elle tient (ticket 2147) : `facts` porte l'entrée `github`
// `{ limit, since, backAt }` (le contrat du runtime, ticket 2144), et la bande de chaque projet dit une ligne — quelle
// limite en clair, depuis quand, retour vers quand — qui tombe d'elle-même au premier `facts` qui ne la porte plus.
// Les payloads sont ceux du runtime (runtime/src/etat.ts, `faits`), l'entrée `github` ajoutée telle que le contrat la dit.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { faits as faitsDuRuntime, lireEtat } from "../../runtime/src/etat.ts";
import { ouvrirJournal } from "../../runtime/src/journal.ts";
import { tenirBandes, type Alerte } from "../src/alertes.ts";
import { ALLUMAGE } from "../src/allumage.ts";
import { pourLaBarre } from "../src/barre.ts";
import type { Lecture } from "../src/box.ts";
import { EXEMPLE, type Projet } from "../src/config.ts";
import { PALETTE } from "../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../src/cuisine.ts";
import { BANNIERE, comprendre } from "../src/faits.ts";
import { CONFIRMES, DIRECTS, GRANTS } from "../src/gestes.ts";
import { GESTES_DES_GRANTS } from "../src/grants.ts";
import { ONGLETS, RUBRIQUES } from "../src/onglets.ts";
import { EFFORTS, MODELES } from "../src/projets/projets.ts";
import { limiteLue, ligneDeLaLimite } from "../src/vue/bandeau-limite-github.ts";
import { jouerLaVue, repos } from "./aides/fausse-vue.ts";

const JOUR = "2026-11-03";
const DEPUIS = `${JOUR}T15:22:00.000Z`;
const RETOUR = `${JOUR}T15:54:00.000Z`;
// L'heure locale du chef, comme la bande la dit.
const hm = (instant: string) => {
  const d = new Date(instant);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};
const LIGNE = `GitHub is rate-limiting calls: too many writes per minute, since ${hm(DEPUIS)}, back around ${hm(RETOUR)}`;
const PROJETS = ["brigade", "mirrorlab"];

// Le `facts` d'une cuisine saine, écrit par le runtime — puis le même, l'entrée `github` posée.
function payload(t: TestContext): string {
  const repertoire = mkdtempSync(join(tmpdir(), "brigade-app-limite-github-"));
  const maintenant = new Date(`${JOUR}T15:30:00.000Z`);
  const journal = ouvrirJournal(repertoire, { maintenant: () => maintenant });
  t.after(() => {
    journal.fermer();
    rmSync(repertoire, { recursive: true, force: true });
  });
  journal.ajouter({ project: "brigade", ticket: null, author: "runtime", type: "runtime.started", payload: { pid: 1, host: "box", node: "v26" } });
  return JSON.stringify(faitsDuRuntime(lireEtat(journal, maintenant), maintenant));
}
const limite = (sain: string, github: unknown = { limit: "secondary-writes", since: DEPUIS, backAt: RETOUR }) => JSON.stringify({ ...JSON.parse(sain), github });
const lecture = (projet: string, texte: string, a: string): Lecture => ({ projet, demande: 1, a, sorties: [{ commande: "facts", texte: `${texte}\n` }] });
const github = (alertes: readonly Alerte[]) => alertes.filter(({ sujet }) => sujet === "github");

describe("la ligne de la limite", () => {
  test("chaque limite en clair, depuis quand, retour vers quand — jamais le nom brut", () => {
    const dit = (limit: string) => ligneDeLaLimite({ limit, since: DEPUIS, backAt: RETOUR }).dit;
    assert.equal(dit("secondary-writes"), LIGNE);
    assert.equal(dit("secondary-concurrency"), `GitHub is rate-limiting calls: too many requests at once, since ${hm(DEPUIS)}, back around ${hm(RETOUR)}`);
    assert.equal(dit("primary"), `GitHub is rate-limiting calls: the hourly quota is spent, since ${hm(DEPUIS)}, back around ${hm(RETOUR)}`);
    for (const limit of ["primary", "secondary-writes", "secondary-concurrency"]) assert.doesNotMatch(dit(limit), /primary|secondary-|backAt|since: /);
    assert.match(ligneDeLaLimite({ limit: "secondary-writes", since: DEPUIS, backAt: RETOUR }).pourquoi, /every project of this account/);
  });

  test("une limite inconnue, ou une heure illisible, ne font pas taire la ligne : elle dit ce qui se lit", () => {
    assert.deepEqual(limiteLue({ limit: "secondary-search", since: DEPUIS, backAt: "soon" }), { github: { limit: "secondary-search", since: DEPUIS } });
    const { github: lue } = limiteLue({ limit: "secondary-search", since: DEPUIS, backAt: "soon" });
    assert.equal(ligneDeLaLimite(lue ?? assert.fail("rien lu")).dit, `GitHub is rate-limiting calls since ${hm(DEPUIS)}, back around a time GitHub does not give`);
    for (const pas of [undefined, null, "secondary-writes", [], 3]) assert.deepEqual(limiteLue(pas), {});
  });

  test("`facts` la porte telle que le contrat la dit ; une entrée d'une autre forme ne refuse pas le payload", (t) => {
    const sain = payload(t);
    const lu = comprendre(limite(sain));
    assert.ok(!("informe" in lu), JSON.stringify(lu));
    assert.deepEqual(lu.github, { limit: "secondary-writes", since: DEPUIS, backAt: RETOUR });
    const sans = comprendre(sain);
    assert.ok(!("informe" in sans) && sans.github === undefined);
    const autre = comprendre(limite(sain, "limited"));
    assert.ok(!("informe" in autre) && autre.github === undefined);
  });
});

describe("la bande de chaque projet du compte", () => {
  test("le même payload sur brigade et mirrorlab : la même ligne sur chacun, aussitôt, et chacun signalé", (t) => {
    const limite_ = limite(payload(t));
    const bandes = tenirBandes();
    bandes.ouvrir(PROJETS);
    for (const projet of PROJETS) {
      const bande = bandes.faits(lecture(projet, limite_, `${JOUR}T15:30:01.000Z`));
      assert.deepEqual(github(bande.alertes).map(({ dit, ton }) => ({ dit, ton })), [{ dit: LIGNE, ton: "jaune" }], projet);
      assert.equal(bande.signal?.etat, "alerte", projet);
    }
  });

  test("le payload suivant sans `github` : la ligne est partie, sans rien relire d'autre", (t) => {
    const sain = payload(t);
    let instant = Date.parse(`${JOUR}T15:30:01.000Z`);
    const bandes = tenirBandes({ maintenant: () => instant });
    bandes.ouvrir(PROJETS);
    for (const projet of PROJETS) assert.equal(github(bandes.faits(lecture(projet, limite(sain), new Date(instant).toISOString())).alertes).length, 1, projet);
    // `facts` est relu toutes les 30 s.
    instant += 30_000;
    for (const projet of PROJETS) {
      const bande = bandes.faits(lecture(projet, sain, new Date(instant).toISOString()));
      assert.deepEqual(github(bande.alertes), [], projet);
      assert.equal(bande.signal, undefined, projet);
    }
  });

  test("une seule ligne quand la box dit aussi l'ancienne `limiteGithub` : celle qui nomme la limite", (t) => {
    const deux = JSON.stringify({ ...JSON.parse(limite(payload(t))), limiteGithub: RETOUR });
    const bandes = tenirBandes();
    bandes.ouvrir(["brigade"]);
    assert.deepEqual(github(bandes.faits(lecture("brigade", deux, `${JOUR}T15:30:01.000Z`)).alertes).map(({ dit }) => dit), [LIGNE]);
  });
});

describe("à l'écran", () => {
  test("l'espace de chaque projet montre la ligne en tête, et la perd au payload suivant", async (t) => {
    const sain = payload(t);
    const projets: Projet[] = PROJETS.map((nom) => ({ nom, dossier: `/tmp/${nom}` }));
    const vue = await jouerLaVue({
      demarrage: () => ({
        configuration: pourLaBarre({ chemin: "/tmp/app.json", projets }, () => true),
        palette: PALETTE,
        exemple: EXEMPLE,
        onglets: ONGLETS, rubriques: RUBRIQUES,
        gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, grants: { gestes: GESTES_DES_GRANTS, nommes: GRANTS }, directs: DIRECTS, confirmes: CONFIRMES },
        banniere: BANNIERE,
        calibrage: { modeles: MODELES, efforts: EFFORTS },
        code: undefined,
      }),
      espace: () => [],
    });
    let instant = Date.parse(`${JOUR}T15:30:01.000Z`);
    const bandes = tenirBandes({ maintenant: () => instant });
    bandes.ouvrir(PROJETS);
    const lire = (texte: string) => {
      for (const projet of PROJETS) vue.dire("surAlertes", bandes.faits(lecture(projet, texte, new Date(instant).toISOString())));
    };
    const bande = vue.element("alertes");

    lire(limite(sain));
    // La barre : « T », puis brigade, puis mirrorlab.
    for (const [rang, projet] of PROJETS.entries()) {
      vue.element("projets").children[rang + 1]?.click();
      await repos();
      assert.equal(bande.hidden, false, projet);
      assert.equal(bande.children.length, 1, projet);
      assert.equal(bande.children[0]?.dataset.sujet, "github", projet);
      assert.ok(bande.textContent.includes(LIGNE), `${projet}: ${bande.textContent}`);
    }

    instant += 30_000;
    lire(sain);
    await repos();
    assert.equal(bande.hidden, true);
    assert.doesNotMatch(bande.textContent, /rate-limiting/);
  });
});
