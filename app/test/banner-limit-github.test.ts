// La limite que GitHub pose au compte, sur chaque projet qu'elle tient (ticket 2147) : `facts` porte l'entrée `github`
// `{ limit, since, backAt }` (le contrat du runtime, ticket 2144), et la bande de chaque projet dit une ligne — quelle
// limite en clair, depuis quand, retour vers quand — qui tombe d'elle-même au premier `facts` qui ne la porte plus.
// Les payloads sont ceux de l'ancien runtime (runtime/src/etat.ts, `faits`), l'entrée `github` ajoutée telle que le contrat la dit.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import { holdBands, type Alert } from "../src/alerts.ts";
import { forTheBar } from "../src/bar.ts";
import type { Reading } from "../src/box.ts";
import { EXAMPLE, type Project } from "../src/config.ts";
import { PALETTE } from "../src/colors.ts";
import { BANNER, understand } from "../src/facts.ts";
import { TABS, HEADINGS } from "../src/tabs.ts";
import { EFFORTS, MODELS } from "../src/projects/projects.ts";
import { limitRead, lineOfTheLimit } from "../src/vue/banner-limit-github.ts";
import { playTheVue, repos } from "./helpers/false-vue.ts";

const DAY = "2026-11-03";
const SINCE = `${DAY}T15:22:00.000Z`;
const RETURN = `${DAY}T15:54:00.000Z`;
// L'heure locale du chef, comme la bande la dit.
const hm = (instant: string) => {
  const d = new Date(instant);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};
const LINE = `GitHub is rate-limiting calls: too many writes per minute, since ${hm(SINCE)}, back around ${hm(RETURN)}`;
const PROJECTS = ["brigade", "mirrorlab"];

// Le `facts` d'une cuisine saine, tel que l'ancien runtime l'écrivait (runtime/src/etat.ts, `faits`, runtime en marche, à
// 15:30), figé dans fixtures/old-runtime-banner-limit-github.json — puis le même, l'entrée `github` posée.
const payload = (): string => JSON.stringify(JSON.parse(readFileSync(new URL("./fixtures/old-runtime-banner-limit-github.json", import.meta.url), "utf8")));
const limit = (healthy: string, github: unknown = { limit: "secondary-writes", since: SINCE, backAt: RETURN }) => JSON.stringify({ ...JSON.parse(healthy), github });
const reading = (project: string, text: string, a: string): Reading => ({ projet: project, demande: 1, a, sorties: [{ commande: "facts", texte: `${text}\n` }] });
const github = (alerts: readonly Alert[]) => alerts.filter(({ sujet: subject }) => subject === "github");

describe("la ligne de la limite", () => {
  test("chaque limite en clair, depuis quand, retour vers quand — jamais le nom brut", () => {
    const said = (limit: string) => lineOfTheLimit({ limit, since: SINCE, backAt: RETURN }).dit;
    assert.equal(said("secondary-writes"), LINE);
    assert.equal(said("secondary-concurrency"), `GitHub is rate-limiting calls: too many requests at once, since ${hm(SINCE)}, back around ${hm(RETURN)}`);
    assert.equal(said("primary"), `GitHub is rate-limiting calls: the hourly quota is spent, since ${hm(SINCE)}, back around ${hm(RETURN)}`);
    for (const limit of ["primary", "secondary-writes", "secondary-concurrency"]) assert.doesNotMatch(said(limit), /primary|secondary-|backAt|since: /);
    assert.match(lineOfTheLimit({ limit: "secondary-writes", since: SINCE, backAt: RETURN }).pourquoi, /every project of this account/);
  });

  test("une limite inconnue, ou une heure illisible, ne font pas taire la ligne : elle dit ce qui se lit", () => {
    assert.deepEqual(limitRead({ limit: "secondary-search", since: SINCE, backAt: "soon" }), { github: { limit: "secondary-search", since: SINCE } });
    const { github: readEntry } = limitRead({ limit: "secondary-search", since: SINCE, backAt: "soon" });
    assert.equal(lineOfTheLimit(readEntry ?? assert.fail("rien lu")).dit, `GitHub is rate-limiting calls since ${hm(SINCE)}, back around a time GitHub does not give`);
    for (const not of [undefined, null, "secondary-writes", [], 3]) assert.deepEqual(limitRead(not), {});
  });

  test("`facts` la porte telle que le contrat la dit ; une entrée d'une autre forme ne refuse pas le payload", () => {
    const healthy = payload();
    const readOne = understand(limit(healthy));
    assert.ok(!("informe" in readOne), JSON.stringify(readOne));
    assert.deepEqual(readOne.github, { limit: "secondary-writes", since: SINCE, backAt: RETURN });
    const without = understand(healthy);
    assert.ok(!("informe" in without) && without.github === undefined);
    const other = understand(limit(healthy, "limited"));
    assert.ok(!("informe" in other) && other.github === undefined);
  });
});

describe("la bande de chaque projet du compte", () => {
  test("le même payload sur brigade et mirrorlab : la même ligne sur chacun, aussitôt, et chacun signalé", () => {
    const limit_ = limit(payload());
    const bands = holdBands();
    bands.ouvrir(PROJECTS);
    for (const project of PROJECTS) {
      const band = bands.faits(reading(project, limit_, `${DAY}T15:30:01.000Z`));
      assert.deepEqual(github(band.alertes).map(({ dit: said, ton: your }) => ({ dit: said, ton: your })), [{ dit: LINE, ton: "jaune" }], project);
      assert.equal(band.signal?.etat, "alerte", project);
    }
  });

  test("le payload suivant sans `github` : la ligne est partie, sans rien relire d'autre", () => {
    const healthy = payload();
    let instant = Date.parse(`${DAY}T15:30:01.000Z`);
    const bands = holdBands({ maintenant: () => instant });
    bands.ouvrir(PROJECTS);
    for (const project of PROJECTS) assert.equal(github(bands.faits(reading(project, limit(healthy), new Date(instant).toISOString())).alertes).length, 1, project);
    // `facts` est relu toutes les 30 s.
    instant += 30_000;
    for (const project of PROJECTS) {
      const band = bands.faits(reading(project, healthy, new Date(instant).toISOString()));
      assert.deepEqual(github(band.alertes), [], project);
      assert.equal(band.signal, undefined, project);
    }
  });

  test("une seule ligne quand la box dit aussi l'ancienne `limiteGithub` : celle qui nomme la limite", () => {
    const two = JSON.stringify({ ...JSON.parse(limit(payload())), limiteGithub: RETURN });
    const bands = holdBands();
    bands.ouvrir(["brigade"]);
    assert.deepEqual(github(bands.faits(reading("brigade", two, `${DAY}T15:30:01.000Z`)).alertes).map(({ dit: said }) => said), [LINE]);
  });
});

describe("à l'écran", () => {
  test("l'espace de chaque projet montre la ligne en tête, et la perd au payload suivant", async () => {
    const healthy = payload();
    const projects: Project[] = PROJECTS.map((name) => ({ nom: name, dossier: `/tmp/${name}` }));
    const vue = await playTheVue({
      demarrage: () => ({
        configuration: forTheBar({ chemin: "/tmp/app.json", projets: projects }, () => true),
        palette: PALETTE,
        exemple: EXAMPLE,
        onglets: TABS, rubriques: HEADINGS,
        gestes: {},
        banniere: BANNER,
        calibrage: { modeles: MODELS, efforts: EFFORTS },
        code: undefined,
      }),
      espace: () => [],
    });
    let instant = Date.parse(`${DAY}T15:30:01.000Z`);
    const bands = holdBands({ maintenant: () => instant });
    bands.ouvrir(PROJECTS);
    const read = (text: string) => {
      for (const project of PROJECTS) vue.dire("surAlertes", bands.faits(reading(project, text, new Date(instant).toISOString())));
    };
    const band = vue.element("alertes");

    read(limit(healthy));
    // La barre : « T », puis brigade, puis mirrorlab.
    for (const [rank, project] of PROJECTS.entries()) {
      vue.element("projets").children[rank + 1]?.click();
      await repos();
      assert.equal(band.hidden, false, project);
      assert.equal(band.children.length, 1, project);
      assert.equal(band.children[0]?.dataset.sujet, "github", project);
      assert.ok(band.textContent.includes(LINE), `${project}: ${band.textContent}`);
    }

    instant += 30_000;
    read(healthy);
    await repos();
    assert.equal(band.hidden, true);
    assert.doesNotMatch(band.textContent, /rate-limiting/);
  });
});
