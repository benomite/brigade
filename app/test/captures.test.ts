// Les captures d'une livraison d'interface sur la carte de son ticket (#842) : l'écran avant et
// après, côte à côte, posés sans un clic ; une livraison qui ne les porte pas toutes le dit ; un
// ticket qui n'est pas d'interface n'en dit rien. L'image est lue par le `gh` du poste, et rendue à
// la vue en `data:` — la page ne demande rien au réseau.
import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { ALLUMAGE } from "../src/allumage.ts";
import { pourLaBarre } from "../src/barre.ts";
import { BOUTONS } from "../src/boutons.ts";
import { capturesDeCarte, lireAdresse, lireCapture } from "../src/captures.ts";
import { EXEMPLE } from "../src/config.ts";
import { PALETTE } from "../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../src/cuisine.ts";
import { BANNIERE, comprendre, tenirFaits, type Carte, type Dessinable, type Faits } from "../src/faits.ts";
import { CONFIRMES, DIRECTS, GRANTS } from "../src/gestes.ts";
import { GESTES_DES_GRANTS } from "../src/grants.ts";
import { EFFORTS, MODELES } from "../src/projets/projets.ts";
import { ONGLETS, RUBRIQUES } from "../src/onglets.ts";
import { type Faux, type Jouee, jouerLaVue, type Reponses, repos } from "./aides/fausse-vue.ts";
import { SANS_POSIX } from "./aides/posix.ts";

const A = "2026-10-16T10:04:12.000Z";
const PARADE = "parade";
const SHA = "0123abcd";
const adresse = (fichier: string) => `https://github.com/benomite/brigade/blob/${SHA}/docs/captures/30/${fichier}?raw=true`;
const COMPLETES = { complet: true, ecrans: [{ ecran: "fiche", avant: adresse("fiche-avant.png"), apres: adresse("fiche-apres.png") }] };

// Ce que la box rend : #30 d'interface en pass, ses deux captures livrées ; #31 d'interface en pass,
// sans aucune ; #32 en pass, pas d'interface ; #40, d'interface, servi, sa capture après manquante.
const FAITS: Faits = {
  etat: "ouverte",
  lu: "2026-10-16T10:04:11.000Z",
  dernierTick: "2026-10-16T10:04:02.000Z",
  compteurs: { rail: 0, auTravail: 0, aLaPass: 3, attend: 0, livres24h: 1 },
  dernierEvenement: null,
  rail: [
    { ticket: 30, etat: "en pass", titre: "La fiche montre ses gestes", url: "https://github.com/benomite/brigade/issues/30", activite: null, captures: COMPLETES },
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
      captures: { complet: false, ecrans: [{ ecran: "bandeau", avant: adresse("bandeau-avant.png"), apres: null }] },
    },
  ],
};

const tenir = (faits: Faits = FAITS) => {
  const tenus = tenirFaits();
  const recue = tenus.recevoir({ projet: PARADE, demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(faits) }] });
  return { tenus, recue };
};
const cartes = (recue: Dessinable): Carte[] => ("tableau" in recue ? recue.tableau.rail.colonnes.flatMap(({ cartes }) => cartes) : assert.fail("pas de tableau"));
const carteDe = (numero: number, recue = tenir().recue) => cartes(recue).find(({ ticket }) => ticket === numero) ?? assert.fail(`pas de carte #${numero}`);

describe("les captures d'une livraison d'interface, telles que la carte les reçoit", () => {
  test("`facts` les donne par écran : la forme se lit, et un champ de travers ne gâte que sa carte", () => {
    const lus = comprendre(JSON.stringify(FAITS));
    assert.ok(!("informe" in lus));
    assert.deepEqual(lus.rail[0]?.captures, COMPLETES);
    assert.equal("captures" in (lus.rail[2] ?? {}), false);
    assert.deepEqual(lus.livres?.[0]?.captures?.ecrans[0]?.apres, null);
    const deTravers = { ...FAITS, rail: [{ ...FAITS.rail[0], captures: { complet: "oui", ecrans: [] } }] };
    const mal = comprendre(JSON.stringify(deTravers));
    assert.ok(!("informe" in mal) && mal.rail[0]?.illisible === "“rail[0].captures.complet” is not a boolean");
  });

  test("une livraison qui les porte toutes : chaque écran, avant puis après, sous sa légende — et rien ne la dit incomplète", () => {
    assert.deepEqual(carteDe(30).captures, {
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
    assert.equal(carteDe(31).captures?.incomplete?.ligne, "incomplete delivery: screenshots missing — no screenshot");
    assert.deepEqual(carteDe(31).captures?.ecrans, []);
    const servie = carteDe(40).captures;
    assert.equal(servie?.incomplete?.ligne, "incomplete delivery: screenshots missing — the after screenshot of bandeau");
    assert.match(servie?.incomplete?.detail ?? "", /docs\/captures\/<ticket>\/<screen>-avant\.png and <screen>-apres\.png/);
    assert.deepEqual([servie?.ecrans[0]?.avant.livree, servie?.ecrans[0]?.apres.livree], [true, false]);
  });

  test("un ticket qui n'est pas d'interface n'a pas de captures : aucune zone, pas même vide", () => {
    assert.equal("captures" in carteDe(32), false);
  });

  test("l'adresse d'une capture reste au process principal : il la donne par ticket, écran et moment, et aucune autre", () => {
    const { tenus } = tenir();
    assert.equal(tenus.capture(PARADE, 30, "fiche", "avant"), adresse("fiche-avant.png"));
    assert.equal(tenus.capture(PARADE, 40, "bandeau", "avant"), adresse("bandeau-avant.png"));
    for (const [ticket, ecran, moment] of [[40, "bandeau", "apres"], [30, "rail", "avant"], [32, "fiche", "avant"], [30, "fiche", "pendant"]] as const) {
      assert.equal(tenus.capture(PARADE, ticket, ecran, moment), undefined, `${ticket} ${ecran} ${moment}`);
    }
    assert.equal(tenus.capture("ailleurs", 30, "fiche", "avant"), undefined);
  });

  test("une adresse qui n'est pas celle d'un fichier de GitHub à un commit ne se lit pas", () => {
    assert.deepEqual(lireAdresse(adresse("fiche%20avant.png")), { depot: "benomite/brigade", sha: SHA, chemin: "docs/captures/30/fiche avant.png" });
    for (const autre of ["https://exemple.test/x.png", `https://github.com/benomite/brigade/blob/${SHA}/docs/x.png`, `https://github.com/benomite/brigade/blob/main/x.png?raw=true`, `https://github.com/benomite/brigade/blob/${SHA}/docs/%2E%2E/x.png?raw=true`]) {
      assert.equal(lireAdresse(autre), undefined, autre);
    }
    assert.deepEqual(capturesDeCarte({ complet: true, ecrans: [{ ecran: "", avant: "https://exemple.test/x.png", apres: adresse("apres.png") }] }).ecrans[0]?.avant, { moment: "avant", legende: "before", livree: true, version: "" });
  });
});

// Un `gh` de test : il note ses appels, et rend ce que le test lui donne — ou échoue.
function essai(t: TestContext, sortie: string, code = 0) {
  const racine = mkdtempSync(join(tmpdir(), "captures-"));
  t.after(() => rmSync(racine, { recursive: true, force: true }));
  const gh = join(racine, "gh");
  writeFileSync(join(racine, "sortie"), sortie);
  writeFileSync(gh, ["#!/bin/sh", `D='${racine}'`, 'printf "%s\\n" "$*" >> "$D/appels"', 'cat "$D/sortie"', `exit ${code}`].join("\n"));
  chmodSync(gh, 0o755);
  return { reglages: { gh, delaiMs: 60_000 }, appels: () => readFileSync(join(racine, "appels"), "utf8").split("\n").filter(Boolean) };
}

describe("l'image d'une capture, lue par le `gh` du poste", () => {
  test("le contenu du fichier au commit livré, par l'API de GitHub, rendu en `data:`", { skip: SANS_POSIX }, async (t) => {
    const { reglages, appels } = essai(t, "iVBORw0KGgo\nAAAANSUhEUg==\n");
    assert.deepEqual(await lireCapture(reglages, adresse("fiche-avant.png")), { image: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==" });
    assert.deepEqual(appels(), [`api repos/benomite/brigade/contents/docs/captures/30/fiche-avant.png?ref=${SHA} --jq .content`]);
  });

  test("un `gh` en échec, une sortie qui n'est pas un contenu, une adresse étrangère : rien n'est montré, et pourquoi est dit", { skip: SANS_POSIX }, async (t) => {
    const enEchec = await lireCapture(essai(t, "HTTP 404: Not Found", 1).reglages, adresse("fiche-avant.png"));
    assert.ok("sans" in enEchec && /HTTP 404/.test(enEchec.sans) && /exit code 1/.test(enEchec.sans));
    const vide = await lireCapture(essai(t, "").reglages, adresse("fiche-avant.png"));
    assert.ok("sans" in vide && /not the file's content/.test(vide.sans));
    const { reglages } = essai(t, "iVBORw0KGgo=");
    assert.ok("sans" in (await lireCapture(reglages, "https://exemple.test/x.png")));
  });
});

const demarrage = () => ({
  configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [{ nom: PARADE, dossier: "/tmp/parade", box: { hote: "box" } }], hotes: ["box"] }),
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS,
  rubriques: RUBRIQUES,
  boutons: BOUTONS,
  gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, grants: { gestes: GESTES_DES_GRANTS, nommes: GRANTS }, directs: DIRECTS, confirmes: CONFIRMES },
  banniere: BANNIERE,
  calibrage: { modeles: MODELES, efforts: EFFORTS },
  code: undefined,
});

async function ouvrir(reponses: Reponses = {}): Promise<Jouee> {
  const vue = await jouerLaVue({ demarrage, espace: () => [], machines: () => [{ id: "poste", titre: "this Mac" }], ...reponses });
  (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
  await repos();
  vue.dire("surFaits", { ...tenir().recue, demande: vue.dernier("faits")[0] as number });
  await repos();
  return vue;
}
const bonDe = (vue: Jouee, numero: number): Faux =>
  vue.element("rail").dessous("li").find((li) => li.className === "bon" && li.children[0]?.children[0]?.textContent === `#${numero}`) ?? assert.fail(`pas de bon #${numero}`);
// Chaque paire d'un bon : ses deux figures, chacune son image (ou ce qui en tient la place) et sa légende.
const paires = (bon: Faux) =>
  bon.dessous("div").filter((pose) => pose.className === "captures").map((paire) =>
    paire.children.map((figure) => {
      const [image, legende] = figure.children;
      return [figure.dataset.moment, image?.balise === "img" ? (image as unknown as { src: string }).src : image?.textContent, legende?.textContent];
    }),
  );
const manquantes = (bon: Faux) => bon.dessous("p").filter((pose) => pose.className === "captures-manquantes");

// Les cartes de Pass (#30, #31, #32) et celle de Served (#40) sont toutes sur Rail.
describe("la carte d'un ticket d'interface, dans la vue", () => {
  test("ses deux captures se posent côte à côte, lues dès que la carte se pose, sans un clic", async () => {
    const images: Record<string, string> = { avant: "data:image/png;base64,QVZBTlQ=", apres: "data:image/png;base64,QVBSRVM=" };
    const vue = await ouvrir({ lireCapture: (_, __, ___, moment) => ({ image: images[moment] as string }) });

    assert.deepEqual(paires(bonDe(vue, 30)), [[["avant", images.avant, "fiche — before"], ["apres", images.apres, "fiche — after"]]]);
    assert.deepEqual(manquantes(bonDe(vue, 30)), []);
    assert.deepEqual(
      vue.appels.filter(({ geste }) => geste === "lireCapture").map(({ args }) => args),
      [[PARADE, 30, "fiche", "avant"], [PARADE, 30, "fiche", "apres"], [PARADE, 40, "bandeau", "avant"]],
    );
  });

  test("une livraison incomplète le dit en tête de ses captures, où les poser au survol ; une capture absente garde sa place", async () => {
    const vue = await ouvrir({ lireCapture: () => ({ image: "data:image/png;base64,QVZBTlQ=" }) });

    assert.equal(manquantes(bonDe(vue, 40))[0]?.textContent, "incomplete delivery: screenshots missing — the after screenshot of bandeau");
    assert.deepEqual(paires(bonDe(vue, 40)), [[["avant", "data:image/png;base64,QVZBTlQ=", "bandeau — before"], ["apres", "missing", "bandeau — after"]]]);
    const [ligne] = manquantes(bonDe(vue, 31));
    assert.equal(ligne?.textContent, "incomplete delivery: screenshots missing — no screenshot");
    assert.match(ligne?.title ?? "", /docs\/captures\/<ticket>/);
    assert.deepEqual(paires(bonDe(vue, 31)), []);
  });

  test("une image qui ne se lit pas le dit à sa place, son pourquoi au survol", async () => {
    const vue = await ouvrir({ lireCapture: () => ({ sans: "gh: HTTP 404" }) });
    const [figure] = bonDe(vue, 30).dessous("figure");
    assert.equal(figure?.children[0]?.textContent, "not available");
    assert.equal(figure?.children[0]?.title, "gh: HTTP 404");
  });

  test("un ticket qui n'est pas d'interface n'a aucune zone de captures, pas même vide", async () => {
    const vue = await ouvrir();
    const bon = bonDe(vue, 32);
    assert.deepEqual([bon.dessous("figure"), manquantes(bon), paires(bon)], [[], [], []]);
  });
});
