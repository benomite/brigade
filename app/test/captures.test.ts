// Les captures d'une livraison d'interface sur la carte de son ticket (#842) : l'écran avant et
// après, côte à côte, posés sans un clic ; une livraison qui ne les porte pas toutes le dit ; un
// ticket qui n'est pas d'interface n'en dit rien. L'image est lue par le `gh` du poste, et rendue à
// la vue en `data:` — la page ne demande rien au réseau.
import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { POWER_UP } from "../src/power-up.ts";
import { forTheBar } from "../src/bar.ts";
import { capturesOfCard, readAddress, readCapture } from "../src/captures.ts";
import { EXAMPLE } from "../src/config.ts";
import { PALETTE } from "../src/colors.ts";
import { KITCHEN_ACTIONS } from "../src/kitchen.ts";
import { BANNER, understand, holdFacts, type Card, type Drawable, type Facts } from "../src/facts.ts";
import { CONFIRMED, DIRECT } from "../src/actions.ts";
import { EFFORTS, MODELS } from "../src/projects/projects.ts";
import { TABS, HEADINGS } from "../src/tabs.ts";
import { type Fake, type Played, playTheVue, type Answers, repos } from "./helpers/false-vue.ts";
import { WITHOUT_POSIX } from "./helpers/posix.ts";

const A = "2026-10-16T10:04:12.000Z";
const PARADE = "parade";
const SHA = "0123abcd";
const address = (file: string) => `https://github.com/benomite/brigade/blob/${SHA}/docs/captures/30/${file}?raw=true`;
const COMPLETE = { complet: true, ecrans: [{ ecran: "fiche", avant: address("fiche-avant.png"), apres: address("fiche-apres.png") }] };

// Ce que la box rend : #30 d'interface en pass, ses deux captures livrées ; #31 d'interface en pass,
// sans aucune ; #32 en pass, pas d'interface ; #40, d'interface, servi, sa capture après manquante.
const FACTS: Facts = {
  etat: "ouverte",
  lu: "2026-10-16T10:04:11.000Z",
  dernierTick: "2026-10-16T10:04:02.000Z",
  compteurs: { rail: 0, auTravail: 0, aLaPass: 3, attend: 0, livres24h: 1 },
  dernierEvenement: null,
  rail: [
    { ticket: 30, etat: "en pass", titre: "La fiche montre ses gestes", url: "https://github.com/benomite/brigade/issues/30", activite: null, captures: COMPLETE },
    { ticket: 31, etat: "en pass", titre: "Le rail vide", url: "https://github.com/benomite/brigade/issues/31", activite: null, captures: { complet: false, ecrans: [] } },
    { ticket: 32, etat: "en pass", titre: "Le journal en ajout seul", url: "https://github.com/benomite/brigade/issues/32", activite: null },
  ],
  cooks: [],
  attend: [],
  livres: [
    {
      ticket: 40,
      titre: "Le bandeau",
      url: "https://github.com/benomite/brigade/issues/40",
      livre: "2026-10-16T09:00:00.000Z",
      station: "box/claude",
      pr: "https://github.com/benomite/brigade/pull/41",
      relecture: null,
      captures: { complet: false, ecrans: [{ ecran: "bandeau", avant: address("bandeau-avant.png"), apres: null }] },
    },
  ],
};

const hold = (facts: Facts = FACTS) => {
  const heldOnes = holdFacts();
  const receivedOne = heldOnes.recevoir({ projet: PARADE, demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(facts) }] });
  return { tenus: heldOnes, recue: receivedOne };
};
const cards = (receivedOne: Drawable): Card[] => ("tableau" in receivedOne ? receivedOne.tableau.rail.colonnes.flatMap(({ cartes: cards }) => cards) : assert.fail("pas de tableau"));
const cardOf = (number: number, receivedOne = hold().recue) => cards(receivedOne).find(({ ticket }) => ticket === number) ?? assert.fail(`pas de carte #${number}`);

describe("les captures d'une livraison d'interface, telles que la carte les reçoit", () => {
  test("`facts` les donne par écran : la forme se lit, et un champ de travers ne gâte que sa carte", () => {
    const readOnes = understand(JSON.stringify(FACTS));
    assert.ok(!("informe" in readOnes));
    assert.deepEqual(readOnes.rail[0]?.captures, COMPLETE);
    assert.equal("captures" in (readOnes.rail[2] ?? {}), false);
    assert.deepEqual(readOnes.livres?.[0]?.captures?.ecrans[0]?.apres, null);
    const ofThrough = { ...FACTS, rail: [{ ...FACTS.rail[0], captures: { complet: "oui", ecrans: [] } }] };
    const badly = understand(JSON.stringify(ofThrough));
    assert.ok(!("informe" in badly) && badly.rail[0]?.illisible === "“rail[0].captures.complet” is not a boolean");
  });

  test("une livraison qui les porte toutes : chaque écran, avant puis après, sous sa légende — et rien ne la dit incomplète", () => {
    assert.deepEqual(cardOf(30).captures, {
      ecrans: [
        {
          ecran: "fiche",
          avant: { moment: "avant", legende: "fiche — before", livree: true, version: SHA },
          apres: { moment: "apres", legende: "fiche — after", livree: true, version: SHA },
        },
      ],
    });
  });

  test("une livraison d'interface sans captures, ou à qui il en manque une, est dite incomplète — sur le rail comme dans Served", () => {
    assert.equal(cardOf(31).captures?.incomplete?.ligne, "incomplete delivery: screenshots missing — no screenshot");
    assert.deepEqual(cardOf(31).captures?.ecrans, []);
    const served = cardOf(40).captures;
    assert.equal(served?.incomplete?.ligne, "incomplete delivery: screenshots missing — the after screenshot of bandeau");
    assert.match(served?.incomplete?.detail ?? "", /docs\/captures\/<ticket>\/<screen>-avant\.png and <screen>-apres\.png/);
    assert.deepEqual([served?.ecrans[0]?.avant.livree, served?.ecrans[0]?.apres.livree], [true, false]);
  });

  test("un ticket qui n'est pas d'interface n'a pas de captures : aucune zone, pas même vide", () => {
    assert.equal("captures" in cardOf(32), false);
  });

  test("l'adresse d'une capture reste au process principal : il la donne par ticket, écran et moment, et aucune autre", () => {
    const { tenus: heldOnes } = hold();
    assert.equal(heldOnes.capture(PARADE, 30, "fiche", "avant"), address("fiche-avant.png"));
    assert.equal(heldOnes.capture(PARADE, 40, "bandeau", "avant"), address("bandeau-avant.png"));
    for (const [ticket, screen, moment] of [[40, "bandeau", "apres"], [30, "rail", "avant"], [32, "fiche", "avant"], [30, "fiche", "pendant"]] as const) {
      assert.equal(heldOnes.capture(PARADE, ticket, screen, moment), undefined, `${ticket} ${screen} ${moment}`);
    }
    assert.equal(heldOnes.capture("ailleurs", 30, "fiche", "avant"), undefined);
  });

  test("une adresse qui n'est pas celle d'un fichier de GitHub à un commit ne se lit pas", () => {
    assert.deepEqual(readAddress(address("fiche%20avant.png")), { depot: "benomite/brigade", sha: SHA, chemin: "docs/captures/30/fiche avant.png" });
    for (const other of ["https://exemple.test/x.png", `https://github.com/benomite/brigade/blob/${SHA}/docs/x.png`, `https://github.com/benomite/brigade/blob/main/x.png?raw=true`, `https://github.com/benomite/brigade/blob/${SHA}/docs/%2E%2E/x.png?raw=true`]) {
      assert.equal(readAddress(other), undefined, other);
    }
    assert.deepEqual(capturesOfCard({ complet: true, ecrans: [{ ecran: "", avant: "https://exemple.test/x.png", apres: address("apres.png") }] }).ecrans[0]?.avant, { moment: "avant", legende: "before", livree: true, version: "" });
  });
});

// Un `gh` de test : il note ses appels, et rend ce que le test lui donne — ou échoue.
function trial(t: TestContext, output: string, code = 0) {
  const root = mkdtempSync(join(tmpdir(), "captures-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const gh = join(root, "gh");
  writeFileSync(join(root, "sortie"), output);
  writeFileSync(gh, ["#!/bin/sh", `D='${root}'`, 'printf "%s\\n" "$*" >> "$D/appels"', 'cat "$D/sortie"', `exit ${code}`].join("\n"));
  chmodSync(gh, 0o755);
  return { reglages: { gh, delaiMs: 60_000 }, appels: () => readFileSync(join(root, "appels"), "utf8").split("\n").filter(Boolean) };
}

describe("l'image d'une capture, lue par le `gh` du poste", () => {
  test("le contenu du fichier au commit livré, par l'API de GitHub, rendu en `data:`", { skip: WITHOUT_POSIX }, async (t) => {
    const { reglages: settings, appels: calls } = trial(t, "iVBORw0KGgo\nAAAANSUhEUg==\n");
    assert.deepEqual(await readCapture(settings, address("fiche-avant.png")), { image: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==" });
    assert.deepEqual(calls(), [`api repos/benomite/brigade/contents/docs/captures/30/fiche-avant.png?ref=${SHA} --jq .content`]);
  });

  test("un `gh` en échec, une sortie qui n'est pas un contenu, une adresse étrangère : rien n'est montré, et pourquoi est dit", { skip: WITHOUT_POSIX }, async (t) => {
    const enFailure = await readCapture(trial(t, "HTTP 404: Not Found", 1).reglages, address("fiche-avant.png"));
    assert.ok("sans" in enFailure && /HTTP 404/.test(enFailure.sans) && /exit code 1/.test(enFailure.sans));
    assert.equal("sans" in enFailure && enFailure.lien, `https://github.com/benomite/brigade/blob/${SHA}/docs/captures/30/fiche-avant.png`);
    const empty = await readCapture(trial(t, "").reglages, address("fiche-avant.png"));
    assert.ok("sans" in empty && /not the file's content/.test(empty.sans));
    const { reglages: settings } = trial(t, "iVBORw0KGgo=");
    assert.ok("sans" in (await readCapture(settings, "https://exemple.test/x.png")));
  });
});

describe("une capture de plus d'un mégaoctet, que l'API des fichiers rend sans contenu", () => {
  const BLOB = "b".repeat(40);
  const gh = (t: TestContext, answers: Record<string, string>, code = 0) => {
    const root = mkdtempSync(join(tmpdir(), "captures-"));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const bin = join(root, "gh");
    const theCase = Object.entries(answers).map(([motive, output]) => `*${motive}*) printf '%s' '${output}'; exit ${motive.includes("blobs") ? code : 0};;`);
    writeFileSync(bin, ["#!/bin/sh", 'printf "%s\\n" "$*" >> "' + root + '/appels"', 'case "$*" in', ...theCase, "esac"].join("\n"));
    chmodSync(bin, 0o755);
    return { reglages: { gh: bin, delaiMs: 60_000 }, appels: () => readFileSync(join(root, "appels"), "utf8").split("\n").filter(Boolean) };
  };

  test("le contenu vide, la capture se lit par son blob", { skip: WITHOUT_POSIX }, async (t) => {
    const { reglages: settings, appels: calls } = gh(t, { ".sha": BLOB, "git/blobs": "iVBORw0KGgo=", ".content": "" });
    assert.deepEqual(await readCapture(settings, address("fiche-avant.png")), { image: "data:image/png;base64,iVBORw0KGgo=" });
    assert.equal(calls().length, 3);
    assert.match(calls()[2] ?? "", new RegExp(`^api repos/benomite/brigade/git/blobs/${BLOB} `));
  });

  test("un blob refusé dit son refus et donne le fichier", { skip: WITHOUT_POSIX }, async (t) => {
    const { reglages: settings } = gh(t, { ".sha": BLOB, "git/blobs": "HTTP 403: rate limit exceeded", ".content": "" }, 1);
    const rendered = await readCapture(settings, address("fiche-avant.png"));
    assert.ok("sans" in rendered && /HTTP 403/.test(rendered.sans) && rendered.lien !== undefined);
  });
});

const startup = () => ({
  configuration: forTheBar({ chemin: "/tmp/app.json", projets: [{ nom: PARADE, dossier: "/tmp/parade" }] }, () => true),
  palette: PALETTE,
  exemple: EXAMPLE,
  onglets: TABS,
  rubriques: HEADINGS,
  gestes: { allumage: POWER_UP, cuisine: KITCHEN_ACTIONS, directs: DIRECT, confirmes: CONFIRMED },
  banniere: BANNER,
  calibrage: { modeles: MODELS, efforts: EFFORTS },
  code: undefined,
});

async function open(answers: Answers = {}): Promise<Played> {
  const vue = await playTheVue({ demarrage: startup, espace: () => [], machines: () => [{ id: "poste", titre: "this computer" }], ...answers });
  (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
  await repos();
  vue.dire("surFaits", { ...hold().recue, demande: vue.dernier("faits")[0] as number });
  await repos();
  return vue;
}
const slipOf = (vue: Played, number: number): Fake =>
  vue.element("rail").dessous("li").find((li) => li.className === "bon" && li.children[0]?.children[0]?.textContent === `#${number}`) ?? assert.fail(`pas de bon #${number}`);
// Chaque paire d'un bon : ses deux figures, chacune son image (ou ce qui en tient la place) et sa légende.
const pairs = (slip: Fake) =>
  slip.dessous("div").filter((pose) => pose.className === "captures").map((pair) =>
    pair.children.map((figure) => {
      const [image, legend] = figure.children;
      return [figure.dataset.moment, image?.balise === "img" ? (image as unknown as { src: string }).src : image?.textContent, legend?.textContent];
    }),
  );
const missing = (slip: Fake) => slip.dessous("p").filter((pose) => pose.className === "captures-manquantes");

// Les cartes de Pass (#30, #31, #32) et celle de Served (#40) sont toutes sur Rail.
describe("la carte d'un ticket d'interface, dans la vue", () => {
  test("ses deux captures se posent côte à côte, lues dès que la carte se pose, sans un clic", async () => {
    const images: Record<string, string> = { avant: "data:image/png;base64,QVZBTlQ=", apres: "data:image/png;base64,QVBSRVM=" };
    const vue = await open({ lireCapture: (_, __, ___, moment) => ({ image: images[moment] as string }) });

    assert.deepEqual(pairs(slipOf(vue, 30)), [[["avant", images.avant, "fiche — before"], ["apres", images.apres, "fiche — after"]]]);
    assert.deepEqual(missing(slipOf(vue, 30)), []);
    assert.deepEqual(
      vue.appels.filter(({ geste: action }) => action === "lireCapture").map(({ args }) => args),
      [[PARADE, 30, "fiche", "avant"], [PARADE, 30, "fiche", "apres"], [PARADE, 40, "bandeau", "avant"]],
    );
  });

  test("une livraison incomplète le dit en tête de ses captures, où les poser au survol ; une capture absente garde sa place", async () => {
    const vue = await open({ lireCapture: () => ({ image: "data:image/png;base64,QVZBTlQ=" }) });

    assert.equal(missing(slipOf(vue, 40))[0]?.textContent, "incomplete delivery: screenshots missing — the after screenshot of bandeau");
    assert.deepEqual(pairs(slipOf(vue, 40)), [[["avant", "data:image/png;base64,QVZBTlQ=", "bandeau — before"], ["apres", "missing", "bandeau — after"]]]);
    const [line] = missing(slipOf(vue, 31));
    assert.equal(line?.textContent, "incomplete delivery: screenshots missing — no screenshot");
    assert.match(line?.title ?? "", /docs\/captures\/<ticket>/);
    assert.deepEqual(pairs(slipOf(vue, 31)), []);
  });

  test("une image qui ne se lit pas le dit à sa place, son pourquoi au survol", async () => {
    const vue = await open({ lireCapture: () => ({ sans: "gh: HTTP 404" }) });
    const [figure] = slipOf(vue, 30).dessous("figure");
    assert.equal(figure?.children[0]?.textContent, "not available — gh: HTTP 404");
    assert.equal(figure?.children[0]?.title, "gh: HTTP 404");
  });

  test("une image qui ne se lit pas donne aussi le fichier à ouvrir sur GitHub, par une adresse que le process principal a rendue", async () => {
    const link = `https://github.com/benomite/brigade/blob/${SHA}/docs/captures/30/fiche-avant.png`;
    const vue = await open({ lireCapture: () => ({ sans: "$ gh api x\nHTTP 404: Not Found\n→ exit code 1", lien: link }) });
    const [figure] = slipOf(vue, 30).dessous("figure");
    const place = figure?.children[0];
    assert.equal(place?.textContent, "not available — HTTP 404: Not Found open the file on GitHub");
    assert.equal((place?.children[0] as unknown as { href: string }).href, link);
  });

  test("un ticket qui n'est pas d'interface n'a aucune zone de captures, pas même vide", async () => {
    const vue = await open();
    const slip = slipOf(vue, 32);
    assert.deepEqual([slip.dessous("figure"), missing(slip), pairs(slip)], [[], [], []]);
  });
});
