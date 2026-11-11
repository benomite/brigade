// Le premier ticket du premier projet du chef, raconté pas à pas (#3302). D'abord ses morceaux : les lignes que chaque
// lecture du rail ajoute — pris, PR ouverte, en pass, renvoyé et pourquoi, repris, servi —, le récit gardé dans le
// stockage de la vue — seulement pour le premier projet, rangé pour de bon, jamais écrit par-dessus une trace illisible —,
// et ce que la page en dit. Puis la vue jouée entière (vue.js tel qu'il est, un faux pont) : un projet ajouté par « Add a
// project » sur un ordinateur sans projet, les lectures de son rail qui arrivent l'une après l'autre, le geste qui range ;
// et un chef qui avait déjà un projet, à qui rien n'est raconté.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ALLUMAGE } from "../../src/allumage.ts";
import { pourLaBarre } from "../../src/barre.ts";
import { EXEMPLE, type Projet } from "../../src/config.ts";
import { PALETTE } from "../../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../../src/cuisine.ts";
import { BANNIERE, comprendre, etapesDesTickets, tenirFaits, type EtapeDuTicket, type Faits } from "../../src/faits.ts";
import { CONFIRMES, DIRECTS } from "../../src/gestes.ts";
import { ONGLETS, RUBRIQUES } from "../../src/onglets.ts";
import { EFFORTS, MODELES } from "../../src/projets/projets.ts";
import type { Terminal } from "../../src/terminaux.ts";
import {
  avancer,
  CLE_DU_PREMIER_TICKET,
  EN_PASS,
  MOTS,
  OUVRIR_LA_PR,
  poserPremierTicket,
  premierPris,
  PR_OUVERTE,
  PRIS,
  RANGER,
  RENVOYE,
  REPRIS,
  SERVI,
  tenirLePremierTicket,
  TITRE,
  type Ligne,
} from "../../src/vue/premier-ticket/premier-ticket.js";
import { DEPOT_DE_LA_VISITE } from "../../src/vue/visite/visite.js";
import { Faux, FauxStockage, jouerLaVue, type Jouee, type Reponses, repos } from "../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) };
const A = "2026-11-11T10:04:12.000Z";
const PR = { numero: 6, url: "https://github.com/chef/cantine/pull/6" };
const RAISON = "the review requested changes on `3f2a9c1` (PR #6):\n\nThe price of a dish shows `NaN €`.";
const etape = (etat: string, plus: Partial<EtapeDuTicket> = {}): EtapeDuTicket => ({ ticket: 5, etat, pr: null, renvoi: null, ...plus });
const PRIS_LU = etape("pris");
const EN_PASS_LU = etape("en pass", { pr: PR });
const RENVOYE_LU = etape("pris", { pr: PR, renvoi: { n: 1, raison: RAISON } });
const DE_NOUVEAU = etape("en pass", { pr: PR, renvoi: { n: 1, raison: RAISON } });
const SERVI_LU = etape("servi", { pr: PR });
const suivre = (lectures: EtapeDuTicket[], depart: Ligne[] = []) => lectures.reduce<Ligne[]>((lignes, lue) => avancer(lignes, lue, A), depart);
const cles = (lignes: readonly Ligne[]) => lignes.map(({ cle }) => cle);

describe("les lignes que chaque lecture du rail ajoute", () => {
  test("pris, PR ouverte, en pass, renvoyé et pourquoi, repris, de nouveau en pass, servi avec sa PR", () => {
    const lignes = suivre([PRIS_LU, EN_PASS_LU, RENVOYE_LU, DE_NOUVEAU, SERVI_LU]);
    assert.deepEqual(cles(lignes), ["pris", "pr", "pass", "renvoi", "repris", "pass", "servi"]);
    assert.deepEqual(lignes[1]?.pr, PR);
    assert.deepEqual([lignes[3]?.n, lignes[3]?.raison], [1, RAISON]);
    assert.deepEqual(lignes[6]?.pr, PR);
  });

  test("une lecture qui ne change rien n'ajoute rien ; servi, le récit est fini", () => {
    const lignes = suivre([PRIS_LU, PRIS_LU, EN_PASS_LU, EN_PASS_LU]);
    assert.deepEqual(cles(lignes), ["pris", "pr", "pass"]);
    const servi = suivre([SERVI_LU, PRIS_LU, RENVOYE_LU], lignes);
    assert.deepEqual(cles(servi), ["pris", "pr", "pass", "servi"]);
  });

  test("vu d'abord en pass, déjà renvoyé une fois : la prise, le renvoi et sa raison, la PR, la pass", () => {
    assert.deepEqual(cles(suivre([DE_NOUVEAU])), ["pris", "renvoi", "pr", "pass"]);
  });

  test("un renvoi vu seulement à la pass suivante se dit quand même, une seule fois par rang ; un second renvoi se dit aussi", () => {
    const lignes = suivre([PRIS_LU, EN_PASS_LU, DE_NOUVEAU, DE_NOUVEAU, etape("pris", { pr: PR, renvoi: { n: 2, raison: "the CI is red" } })]);
    assert.deepEqual(cles(lignes), ["pris", "pr", "pass", "renvoi", "pass", "renvoi", "repris"]);
    assert.equal(lignes[5]?.raison, "the CI is red");
  });

  test("une autre PR après un renvoi se dit ; la même ne se redit pas", () => {
    const autre = { numero: 9, url: "https://github.com/chef/cantine/pull/9" };
    const lignes = suivre([PRIS_LU, EN_PASS_LU, RENVOYE_LU, etape("en pass", { pr: autre, renvoi: { n: 1, raison: RAISON } })]);
    assert.deepEqual(cles(lignes), ["pris", "pr", "pass", "renvoi", "repris", "pr", "pass"]);
    assert.deepEqual(lignes[5]?.pr, autre);
  });

  test("un ticket en attente, WAITING ou mis de côté n'ajoute rien", () => {
    assert.deepEqual(suivre([etape("en attente"), etape("WAITING"), etape("86")]), []);
  });

  test("le premier ticket : le plus petit qu'une lecture montre pris ou en pass — jamais un ticket en attente ni un servi", () => {
    assert.equal(premierPris([etape("en attente", { ticket: 2 }), etape("servi", { ticket: 1 }), etape("en pass", { ticket: 7 }), etape("pris", { ticket: 4 })]), 4);
    assert.equal(premierPris([etape("en attente"), etape("servi")]), undefined);
  });
});

describe("le récit gardé dans le stockage de la vue", () => {
  test("le premier projet ajouté est raconté, ligne à ligne ; un autre projet ne l'est pas ; un second ajout ne décide plus rien", () => {
    const stockage = new FauxStockage();
    let rendus = 0;
    const recit = tenirLePremierTicket({ stockage, rendre: () => void rendus++, maintenant: () => A });
    recit.projetAjoute("cantine", false);
    recit.projetAjoute("parade", false);
    // Rien n'est encore pris : rien à montrer.
    recit.observer("cantine", [etape("en attente")]);
    assert.equal(recit.de("cantine"), undefined);
    recit.observer("parade", [PRIS_LU]);
    assert.equal(recit.de("parade"), undefined);
    recit.observer("cantine", [PRIS_LU]);
    recit.observer("cantine", [EN_PASS_LU]);
    assert.deepEqual(cles(recit.de("cantine")?.lignes ?? []), ["pris", "pr", "pass"]);
    assert.equal(recit.de("cantine")?.ticket, 5);
    // Un ticket pris plus tard n'est pas le premier : le récit reste sur #5.
    recit.observer("cantine", [etape("pris", { ticket: 3 }), EN_PASS_LU]);
    assert.equal(recit.de("cantine")?.ticket, 5);
    // Gardé : l'app rouverte reprend le récit là où il en était.
    const rouvert = tenirLePremierTicket({ stockage, rendre: () => {}, maintenant: () => A });
    assert.deepEqual(rouvert.de("cantine"), recit.de("cantine"));
    assert.ok(rendus >= 3);
  });

  test("un chef qui avait déjà un projet : rien n'est raconté, même au projet suivant", () => {
    const stockage = new FauxStockage();
    const recit = tenirLePremierTicket({ stockage, rendre: () => {}, maintenant: () => A });
    recit.projetAjoute("cantine", true);
    recit.observer("cantine", [PRIS_LU]);
    recit.projetAjoute("escale", false);
    recit.observer("escale", [PRIS_LU]);
    assert.equal(recit.de("cantine"), undefined);
    assert.equal(recit.de("escale"), undefined);
  });

  test("rangé : il ne revient plus, ni à la lecture suivante, ni l'app rouverte", () => {
    const stockage = new FauxStockage();
    const recit = tenirLePremierTicket({ stockage, rendre: () => {}, maintenant: () => A });
    recit.projetAjoute("cantine", false);
    recit.observer("cantine", [PRIS_LU]);
    recit.ranger();
    recit.observer("cantine", [EN_PASS_LU]);
    assert.equal(recit.de("cantine"), undefined);
    assert.equal(tenirLePremierTicket({ stockage, rendre: () => {}, maintenant: () => A }).de("cantine"), undefined);
    assert.equal(JSON.parse(stockage.getItem(CLE_DU_PREMIER_TICKET) ?? "{}").range, true);
  });

  test("une trace illisible ne décide rien : rien n'est raconté, et rien n'est écrit par-dessus", () => {
    for (const illisible of ["{pas du json", JSON.stringify({ projet: 3, lignes: [] }), JSON.stringify({ projet: "cantine", lignes: [{ cle: "autre", le: A }] })]) {
      const stockage = new FauxStockage();
      stockage.setItem(CLE_DU_PREMIER_TICKET, illisible);
      const recit = tenirLePremierTicket({ stockage, rendre: () => assert.fail("rien ne se redessine"), maintenant: () => A });
      recit.projetAjoute("cantine", false);
      recit.observer("cantine", [PRIS_LU]);
      recit.ranger();
      assert.equal(recit.de("cantine"), undefined);
      assert.equal(stockage.getItem(CLE_DU_PREMIER_TICKET), illisible);
    }
  });

  test("un stockage qui refuse la lecture ne décide rien ; un stockage plein garde le récit le temps que l'app tourne", () => {
    const refuse = { getItem: () => { throw new Error("denied"); }, setItem: () => assert.fail("rien ne s'écrit") };
    const muet = tenirLePremierTicket({ stockage: refuse, rendre: () => {}, maintenant: () => A });
    muet.projetAjoute("cantine", false);
    muet.observer("cantine", [PRIS_LU]);
    assert.equal(muet.de("cantine"), undefined);

    const plein = { getItem: () => null, setItem: () => { throw new Error("quota"); } };
    const tenu = tenirLePremierTicket({ stockage: plein, rendre: () => {}, maintenant: () => A });
    tenu.projetAjoute("cantine", false);
    tenu.observer("cantine", [PRIS_LU]);
    assert.deepEqual(cles(tenu.de("cantine")?.lignes ?? []), ["pris"]);
  });
});

describe("ce que la page en dit", () => {
  test("son titre et « dismiss » ; une ligne par étape, son mot puis ce qu'il veut dire ; la raison d'un renvoi ; le lien de la PR", () => {
    const faits: string[] = [];
    const lignes = suivre([PRIS_LU, EN_PASS_LU, RENVOYE_LU, DE_NOUVEAU, SERVI_LU]);
    const pose = poserPremierTicket(doc, { ticket: 5, lignes }, { ouvrir: () => void faits.push("ouvrir"), ranger: () => void faits.push("ranger") }) as unknown as Faux;
    assert.equal(pose.dessous("strong")[0]?.textContent, TITRE(5));
    const etapes = pose.dessous("li");
    assert.deepEqual(etapes.map(({ dataset }) => dataset.etape), ["pris", "pr", "pass", "renvoi", "repris", "pass", "servi"]);
    assert.deepEqual(
      etapes.map((li) => [li.dessous("strong")[0]?.textContent, li.dessous("span").find(({ className }) => className === "dit")?.textContent]),
      [
        [MOTS.pris, PRIS(5)],
        [MOTS.pr, PR_OUVERTE(6)],
        [MOTS.pass, EN_PASS],
        [MOTS.renvoi, RENVOYE],
        [MOTS.repris, REPRIS(5)],
        [MOTS.pass, EN_PASS],
        [MOTS.servi, SERVI(5, 6)],
      ],
    );
    assert.equal(etapes[3]?.dessous("p").find(({ className }) => className === "raison")?.textContent, RAISON);
    // Le mot de la cuisine, et ce qu'il veut dire en clair : une copie à lui, les gates, la CI, la relecture.
    assert.match(PRIS(5), /its own copy of the repository/);
    assert.match(EN_PASS, /gates.*CI.*review/);
    // Le lien de la PR : sur sa ligne ouverte et sur le service — pas ailleurs.
    assert.deepEqual(
      etapes.map((li) => li.dessous("button").map(({ textContent }) => textContent)),
      [[], [OUVRIR_LA_PR(6)], [], [], [], [], [OUVRIR_LA_PR(6)]],
    );
    etapes[6]?.dessous("button")[0]?.click();
    (pose.dessous("button").find(({ textContent }) => textContent === RANGER) ?? assert.fail("pas de « dismiss »")).click();
    assert.deepEqual(faits, ["ouvrir", "ranger"]);
  });
});

describe("ce que les faits en donnent", () => {
  test("le rail avec sa PR et son dernier renvoi, puis les servis et leur PR mergée — rien d'illisible, aucune adresse qui ne s'ouvre pas", () => {
    const brut = {
      etat: "ouverte",
      lu: A,
      dernierTick: A,
      compteurs: { rail: 2, auTravail: 1, aLaPass: 0, attend: 0, livres24h: 2 },
      dernierEvenement: null,
      rail: [
        { ticket: 5, etat: "pris", titre: "La carte", url: "https://github.com/chef/cantine/issues/5", pr: PR, renvoi: { n: 1, raison: RAISON } },
        { ticket: 7, etat: "en attente", titre: "Le menu", url: "https://github.com/chef/cantine/issues/7" },
      ],
      livres: [
        { ticket: 3, titre: "Les allergènes", url: null, livre: A, station: null, pr: "https://github.com/chef/cantine/pull/4" },
        { ticket: 2, titre: "Le pain", url: null, livre: A, station: null, pr: "file:///etc/passwd" },
      ],
    };
    const lus = comprendre(JSON.stringify(brut));
    assert.ok(!("informe" in lus), "informe" in lus ? lus.informe : "");
    assert.deepEqual(etapesDesTickets(lus as Faits), [
      { ticket: 5, etat: "pris", pr: PR, renvoi: { n: 1, raison: RAISON } },
      { ticket: 7, etat: "en attente", pr: null, renvoi: null },
      { ticket: 3, etat: "servi", pr: { numero: 4, url: "https://github.com/chef/cantine/pull/4" }, renvoi: null },
      { ticket: 2, etat: "servi", pr: null, renvoi: null },
    ]);
    // Une PR qui n'a pas la forme rend sa carte illisible, comme tout champ du rail : rien n'y est deviné.
    const informe = comprendre(JSON.stringify({ ...brut, rail: [{ ...brut.rail[0], pr: { numero: "six", url: PR.url } }] }));
    assert.ok(!("informe" in informe));
    assert.deepEqual(etapesDesTickets(informe as Faits).filter(({ etat }) => etat !== "servi"), []);
  });
});

// La vue jouée entière.
const CHEMIN = "/home/chef/.config/brigade/app.json";
const DEPOT = "chef/cantine";
const SECOND: Terminal = { id: 1, projet: "cantine", genre: "second", titre: "second · claude", note: "", arrete: false };
const demarrage = (projets: Projet[]) => () => ({
  configuration: pourLaBarre({ chemin: CHEMIN, projets }),
  poste: { nom: "this computer", mac: false },
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS,
  rubriques: RUBRIQUES,
  gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, directs: DIRECTS, confirmes: CONFIRMES },
  banniere: BANNIERE,
  calibrage: { modeles: MODELES, efforts: EFFORTS },
  code: undefined,
});
const PARADE: Projet = { nom: "parade", dossier: "/home/chef/Brigade/parade", depot: "chef/parade", base: "main" };
const VISITE: Projet = { nom: "brigade", dossier: "/home/chef/Brigade/brigade", depot: DEPOT_DE_LA_VISITE, base: "main" };
type Entree = Faits["rail"][number];
const entree = (etat: string, plus: Partial<Entree> = {}): Entree => ({ ticket: 5, etat, titre: "La carte du midi", url: `https://github.com/${DEPOT}/issues/5`, ...plus });
const lecture = (rail: Entree[], livres: NonNullable<Faits["livres"]> = []): Faits => ({
  etat: "ouverte",
  lu: A,
  dernierTick: A,
  compteurs: { rail: rail.length, auTravail: 0, aLaPass: 0, attend: 0, livres24h: livres.length },
  dernierEvenement: null,
  rail,
  cooks: [],
  attend: [],
  livres,
});

// « Add a project », puis le dépôt chef/cantine : la page de cantine s'ouvre, déjà prête pour Brigade.
async function ajouterCantine(stockage: FauxStockage, projets: Projet[] = [], reponses: Reponses = {}) {
  let vue: Jouee | undefined;
  vue = await jouerLaVue(
    {
      demarrage: demarrage(projets),
      stationsDuChef: () => ({ state: "listed", stations: [], unreadable: [] }),
      compteGitHub: () => ({ login: "octo-chef" }),
      stationsDuCompte: () => ({ state: "listed", stations: [], unreadable: [] }),
      depotsDuChef: () => ({ depots: [{ depot: DEPOT, base: "main" }] }),
      ouvrirDUneStation: (nom, depot, base) => {
        vue?.dire("surConfiguration", pourLaBarre({ chemin: CHEMIN, projets: [...projets, { nom, dossier: `/home/chef/Brigade/${nom}`, depot, base: base ?? "main" } satisfies Projet] }), []);
        return { state: "open", project: nom, repository: depot, folder: `/home/chef/Brigade/${nom}`, cloned: true };
      },
      projetsServis: () => ({ depots: [DEPOT] }),
      checkRepoSetup: () => ({ ready: true, missingBindings: [], missingLabels: [] }),
      espace: () => [SECOND],
      departDuProjet: () => ({ aucune: true }),
      ...reponses,
    },
    { stockage },
  );
  (vue.poses().find((pose) => pose.id === "entree-ajout") ?? assert.fail("pas de « + »")).click();
  await repos();
  (vue.element("ajout").dessous("button").find(({ textContent }) => textContent === DEPOT) ?? assert.fail("pas de dépôt")).click();
  await repos();
  assert.equal(vue.element("espace").textContent, "cantine");
  return vue;
}
async function lire(vue: Jouee, faits: Faits) {
  vue.dire("surFaits", { ...tenirFaits(() => new Map()).recevoir({ projet: "cantine", demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(faits) }] }), demande: vue.dernier("faits")[0] as number });
  await repos();
}
const section = (vue: Jouee) => vue.element("premier-ticket");
const etapesDites = (vue: Jouee) => section(vue).dessous("li").map(({ dataset }) => dataset.etape);

describe("la vue jouée : le premier ticket du premier projet, raconté à mesure qu'il se passe", () => {
  test("ajouté sur un ordinateur sans projet : chaque lecture de son rail ajoute sa ligne ; servi, le lien ouvre sa PR ; rangé, il ne revient plus", async () => {
    const stockage = new FauxStockage();
    const ouvertes: string[] = [];
    const vue = await ajouterCantine(stockage, [VISITE], {
      ouvrirPrDuCook: (projet, ticket) => (ouvertes.push(`cook ${projet}#${ticket}`), false),
      ouvrirPr: (projet, ticket) => (ouvertes.push(`servi ${projet}#${ticket}`), true),
    });
    await lire(vue, lecture([entree("en attente")]));
    assert.equal(section(vue).hidden, true);
    await lire(vue, lecture([entree("pris", { station: "box/claude" })]));
    assert.equal(section(vue).hidden, false);
    assert.deepEqual(etapesDites(vue), ["pris"]);
    await lire(vue, lecture([entree("en pass", { pr: PR })]));
    await lire(vue, lecture([entree("pris", { pr: PR, renvoi: { n: 1, raison: RAISON } })]));
    await lire(vue, lecture([entree("en pass", { pr: PR, renvoi: { n: 1, raison: RAISON } })]));
    await lire(vue, lecture([], [{ ticket: 5, titre: "La carte du midi", url: null, livre: A, station: "box/claude", pr: PR.url }]));
    assert.deepEqual(etapesDites(vue), ["pris", "pr", "pass", "renvoi", "repris", "pass", "servi"]);
    assert.ok(section(vue).dessous("p").some(({ textContent }) => textContent === RAISON));
    const servi = section(vue).dessous("li").at(-1) ?? assert.fail("pas de ligne servie");
    (servi.dessous("button")[0] ?? assert.fail("pas de lien")).click();
    await repos();
    assert.deepEqual(ouvertes, ["cook cantine#5", "servi cantine#5"]);
    (section(vue).dessous("button").find(({ textContent }) => textContent === RANGER) ?? assert.fail("pas de « dismiss »")).click();
    await repos();
    assert.equal(section(vue).hidden, true);
    await lire(vue, lecture([entree("pris", { ticket: 8 })]));
    assert.equal(section(vue).hidden, true);
    // L'app rouverte : rien ne revient.
    const rouverte = await jouerLaVue({ demarrage: demarrage([VISITE, { nom: "cantine", dossier: "/home/chef/Brigade/cantine", depot: DEPOT, base: "main" }]) }, { stockage });
    await repos();
    assert.equal(rouverte.element("premier-ticket").hidden, true);
  });

  test("un chef qui avait déjà un projet : son nouveau projet n'a rien de raconté", async () => {
    const stockage = new FauxStockage();
    const vue = await ajouterCantine(stockage, [PARADE]);
    await lire(vue, lecture([entree("pris")]));
    await lire(vue, lecture([entree("en pass", { pr: PR })]));
    assert.equal(section(vue).hidden, true);
    assert.deepEqual(JSON.parse(stockage.getItem(CLE_DU_PREMIER_TICKET) ?? "{}"), { projet: null, lignes: [] });
  });
});
