// La limite que GitHub pose au compte, sur chaque projet qu'elle tient (ticket 2147) : `facts` porte l'entrée `github`
// `{ limit, since, backAt }` (le contrat du runtime, ticket 2144), et la bande de chaque projet dit une ligne — quelle
// limite en clair, depuis quand, retour vers quand — qui tombe d'elle-même au premier `facts` qui ne la porte plus.
// Les payloads sont ceux du runtime (runtime/src/etat.ts, `faits`), l'entrée `github` ajoutée telle que le contrat la dit.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { faits as runtimeFacts, lireEtat } from "../../runtime/src/etat.ts";
import { ouvrirJournal } from "../../runtime/src/journal.ts";
import { holdBandes, type Alert } from "../src/alerts.ts";
import { ALLUMAGE } from "../src/allumage.ts";
import { pourLaBar } from "../src/bar.ts";
import type { Read } from "../src/box.ts";
import { EXEMPLE, type Project } from "../src/config.ts";
import { PALETTE } from "../src/couleurs.ts";
import { KITCHEN_ACTIONS } from "../src/kitchen.ts";
import { BANNIERE, comprendre } from "../src/facts.ts";
import { CONFIRMES, DIRECTS } from "../src/actions.ts";
import { ONGLETS, RUBRIQUES } from "../src/onglets.ts";
import { EFFORTS, MODELES } from "../src/projects/projects.ts";
import { limitLue, lineDeLaLimit } from "../src/vue/banner-limit-github.ts";
import { jouerLaVue, repos } from "./aides/fausse-vue.ts";

const DAY = "2026-11-03";
const DEPUIS = `${DAY}T15:22:00.000Z`;
const RETOUR = `${DAY}T15:54:00.000Z`;
// L'heure locale du chef, comme la bande la dit.
const hm = (instant: string) => {
  const d = new Date(instant);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};
const LINE = `GitHub is rate-limiting calls: too many writes per minute, since ${hm(DEPUIS)}, back around ${hm(RETOUR)}`;
const PROJECTS = ["brigade", "mirrorlab"];

// Le `facts` d'une cuisine saine, écrit par le runtime — puis le même, l'entrée `github` posée.
function payload(t: TestContext): string {
  const repertoire = mkdtempSync(join(tmpdir(), "brigade-app-limite-github-"));
  const maintenant = new Date(`${DAY}T15:30:00.000Z`);
  const log = ouvrirJournal(repertoire, { maintenant: () => maintenant });
  t.after(() => {
    log.fermer();
    rmSync(repertoire, { recursive: true, force: true });
  });
  log.ajouter({ project: "brigade", ticket: null, author: "runtime", type: "runtime.started", payload: { pid: 1, host: "box", node: "v26" } });
  return JSON.stringify(runtimeFacts(lireEtat(log, maintenant), maintenant));
}
const limit = (sain: string, github: unknown = { limit: "secondary-writes", since: DEPUIS, backAt: RETOUR }) => JSON.stringify({ ...JSON.parse(sain), github });
const read = (project: string, texte: string, a: string): Read => ({ projet: project, demande: 1, a, sorties: [{ commande: "facts", texte: `${texte}\n` }] });
const github = (alerts: readonly Alert[]) => alerts.filter(({ sujet }) => sujet === "github");

describe("la ligne de la limite", () => {
  test("chaque limite en clair, depuis quand, retour vers quand — jamais le nom brut", () => {
    const dit = (limit: string) => lineDeLaLimit({ limit, since: DEPUIS, backAt: RETOUR }).dit;
    assert.equal(dit("secondary-writes"), LINE);
    assert.equal(dit("secondary-concurrency"), `GitHub is rate-limiting calls: too many requests at once, since ${hm(DEPUIS)}, back around ${hm(RETOUR)}`);
    assert.equal(dit("primary"), `GitHub is rate-limiting calls: the hourly quota is spent, since ${hm(DEPUIS)}, back around ${hm(RETOUR)}`);
    for (const limit of ["primary", "secondary-writes", "secondary-concurrency"]) assert.doesNotMatch(dit(limit), /primary|secondary-|backAt|since: /);
    assert.match(lineDeLaLimit({ limit: "secondary-writes", since: DEPUIS, backAt: RETOUR }).pourquoi, /every project of this account/);
  });

  test("une limite inconnue, ou une heure illisible, ne font pas taire la ligne : elle dit ce qui se lit", () => {
    assert.deepEqual(limitLue({ limit: "secondary-search", since: DEPUIS, backAt: "soon" }), { github: { limit: "secondary-search", since: DEPUIS } });
    const { github: lue } = limitLue({ limit: "secondary-search", since: DEPUIS, backAt: "soon" });
    assert.equal(lineDeLaLimit(lue ?? assert.fail("rien lu")).dit, `GitHub is rate-limiting calls since ${hm(DEPUIS)}, back around a time GitHub does not give`);
    for (const pas of [undefined, null, "secondary-writes", [], 3]) assert.deepEqual(limitLue(pas), {});
  });

  test("`facts` la porte telle que le contrat la dit ; une entrée d'une autre forme ne refuse pas le payload", (t) => {
    const sain = payload(t);
    const lu = comprendre(limit(sain));
    assert.ok(!("informe" in lu), JSON.stringify(lu));
    assert.deepEqual(lu.github, { limit: "secondary-writes", since: DEPUIS, backAt: RETOUR });
    const sans = comprendre(sain);
    assert.ok(!("informe" in sans) && sans.github === undefined);
    const autre = comprendre(limit(sain, "limited"));
    assert.ok(!("informe" in autre) && autre.github === undefined);
  });
});

describe("la bande de chaque projet du compte", () => {
  test("le même payload sur brigade et mirrorlab : la même ligne sur chacun, aussitôt, et chacun signalé", (t) => {
    const limit_ = limit(payload(t));
    const bandes = holdBandes();
    bandes.ouvrir(PROJECTS);
    for (const project of PROJECTS) {
      const bande = bandes.faits(read(project, limit_, `${DAY}T15:30:01.000Z`));
      assert.deepEqual(github(bande.alertes).map(({ dit, ton }) => ({ dit, ton })), [{ dit: LINE, ton: "jaune" }], project);
      assert.equal(bande.signal?.etat, "alerte", project);
    }
  });

  test("le payload suivant sans `github` : la ligne est partie, sans rien relire d'autre", (t) => {
    const sain = payload(t);
    let instant = Date.parse(`${DAY}T15:30:01.000Z`);
    const bandes = holdBandes({ maintenant: () => instant });
    bandes.ouvrir(PROJECTS);
    for (const project of PROJECTS) assert.equal(github(bandes.faits(read(project, limit(sain), new Date(instant).toISOString())).alertes).length, 1, project);
    // `facts` est relu toutes les 30 s.
    instant += 30_000;
    for (const project of PROJECTS) {
      const bande = bandes.faits(read(project, sain, new Date(instant).toISOString()));
      assert.deepEqual(github(bande.alertes), [], project);
      assert.equal(bande.signal, undefined, project);
    }
  });

  test("une seule ligne quand la box dit aussi l'ancienne `limiteGithub` : celle qui nomme la limite", (t) => {
    const deux = JSON.stringify({ ...JSON.parse(limit(payload(t))), limiteGithub: RETOUR });
    const bandes = holdBandes();
    bandes.ouvrir(["brigade"]);
    assert.deepEqual(github(bandes.faits(read("brigade", deux, `${DAY}T15:30:01.000Z`)).alertes).map(({ dit }) => dit), [LINE]);
  });
});

describe("à l'écran", () => {
  test("l'espace de chaque projet montre la ligne en tête, et la perd au payload suivant", async (t) => {
    const sain = payload(t);
    const projects: Project[] = PROJECTS.map((name) => ({ nom: name, dossier: `/tmp/${name}` }));
    const vue = await jouerLaVue({
      demarrage: () => ({
        configuration: pourLaBar({ chemin: "/tmp/app.json", projets: projects }, () => true),
        palette: PALETTE,
        exemple: EXEMPLE,
        onglets: ONGLETS, rubriques: RUBRIQUES,
        gestes: { allumage: ALLUMAGE, cuisine: KITCHEN_ACTIONS, directs: DIRECTS, confirmes: CONFIRMES },
        banniere: BANNIERE,
        calibrage: { modeles: MODELES, efforts: EFFORTS },
        code: undefined,
      }),
      espace: () => [],
    });
    let instant = Date.parse(`${DAY}T15:30:01.000Z`);
    const bandes = holdBandes({ maintenant: () => instant });
    bandes.ouvrir(PROJECTS);
    const lire = (texte: string) => {
      for (const project of PROJECTS) vue.dire("surAlertes", bandes.faits(read(project, texte, new Date(instant).toISOString())));
    };
    const bande = vue.element("alertes");

    lire(limit(sain));
    // La barre : « T », puis brigade, puis mirrorlab.
    for (const [rang, project] of PROJECTS.entries()) {
      vue.element("projets").children[rang + 1]?.click();
      await repos();
      assert.equal(bande.hidden, false, project);
      assert.equal(bande.children.length, 1, project);
      assert.equal(bande.children[0]?.dataset.sujet, "github", project);
      assert.ok(bande.textContent.includes(LINE), `${project}: ${bande.textContent}`);
    }

    instant += 30_000;
    lire(sain);
    await repos();
    assert.equal(bande.hidden, true);
    assert.doesNotMatch(bande.textContent, /rate-limiting/);
  });
});
