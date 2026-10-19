// Ce qu'une correction acceptée des consignes du projet a fait de sa cause, sur la page Reliability (#1001,
// épique 994) : la lecture du champ `reculs` de `facts`, la section telle que la vue la pose — avant et
// après le merge côte à côte, le verdict du runtime, un état d'attente dit en mots et jamais par un
// chiffre —, et la page entière, dans l'espace du projet. Les reculs sont écrits dans la forme même du
// runtime (`ReculDeCorrection`) : l'app lit ce que la box écrit, pas une copie de sa forme.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { ReculDeCorrection } from "../../runtime/src/correctif/recul.ts";
import { ALLUMAGE } from "../src/allumage.ts";
import { pourLaBarre } from "../src/barre.ts";
import { BOUTONS } from "../src/boutons.ts";
import { EXEMPLE } from "../src/config.ts";
import { PALETTE } from "../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../src/cuisine.ts";
import { BANNIERE, comprendre, tableau, type Dessinable, type Faits } from "../src/faits.ts";
import { CONFIRMES, DIRECTS, GRANTS } from "../src/gestes.ts";
import { GESTES_DES_GRANTS } from "../src/grants.ts";
import { GESTES_DU_MANAGER } from "../src/manager.ts";
import { ONGLETS, RUBRIQUES } from "../src/onglets.ts";
import { EFFORTS, MODELES } from "../src/projets/projets.ts";
import { reculDe, reculsLus, type Recul } from "../src/recul.ts";
import { APRES, AVANT, NE_RECULE_PAS, NON_MERGEE, PAS_ENCORE, PAS_ENCORE_MERGEE, poserReculs, RECULE, RIEN_A_COMPARER, TITRE } from "../src/vue/recul.js";
import { Faux, jouerLaVue, ouvrirLecture, repos } from "./aides/fausse-vue.ts";

const A = "2026-10-19T10:00:00.000Z";
const doc = { createElement: (balise: string) => new Faux(balise) };
const PR = (numero: number) => `https://github.com/chef/parade/pull/${numero}`;
const releve = (tickets: number, atteints: number[]) => ({ tickets, atteints, essais: atteints.length, part: atteints.length / tickets });

// Une correction de chaque état, dans la forme que `facts` écrit (runtime/src/correctif/recul.ts).
const RECULE_MESURE: ReculDeCorrection = { proposition: 412, cause: "gates-app", titre: "red gates: app tests", pr: PR(41), etat: "mesuree", mergee: "2026-10-08T15:20:00.000Z", avant: releve(20, [3, 5, 8, 11, 14, 17]), apres: releve(8, [29]), recule: true };
const NE_RECULE: ReculDeCorrection = { proposition: 431, cause: "relecture", titre: "blocking review", pr: PR(44), etat: "mesuree", mergee: "2026-10-10T09:02:00.000Z", avant: releve(20, [9, 12, 16]), apres: releve(9, [22, 33]), recule: false };
const RIEN: ReculDeCorrection = { proposition: 455, cause: "plafond", titre: "cap on turns or duration", pr: PR(47), etat: "rien-a-comparer", mergee: "2026-10-13T08:41:00.000Z", avant: releve(20, [18, 24]) };
const RIEN_AVANT: ReculDeCorrection = { ...RIEN, proposition: 456, avant: null };
const EN_COURS: ReculDeCorrection = { proposition: 470, cause: "conflit", titre: "conflict with the base", pr: PR(49), etat: "en-cours" };
const NON: ReculDeCorrection = { proposition: 471, cause: "autre", titre: "other", pr: null, etat: "non-mergee" };

const FAITS = { etat: "ouverte", lu: A, dernierTick: A, compteurs: { rail: 0, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 }, dernierEvenement: null, rail: [], cooks: [] };
const lus = (reculs: unknown) => comprendre(JSON.stringify({ ...FAITS, reculs }));
const sections = (...reculs: ReculDeCorrection[]): Recul[] => reculsLus(JSON.parse(JSON.stringify(reculs))).map(reculDe);
const textes = (poses: Faux[]) => poses.map(({ textContent }) => textContent);

describe("le champ `reculs` de `facts`", () => {
  test("chaque état du runtime se lit tel quel", () => {
    const tous = [RECULE_MESURE, NE_RECULE, RIEN, RIEN_AVANT, EN_COURS, NON];
    const faits = lus(tous);
    assert.ok(!("informe" in faits), JSON.stringify(faits));
    assert.deepEqual(faits.reculs, tous);
  });

  test("absent — aucune correction acceptée, ou un runtime d'avant ce champ —, il n'est pas inventé ; le tableau n'en porte rien", () => {
    const faits = comprendre(JSON.stringify(FAITS));
    assert.ok(!("informe" in faits));
    assert.equal("reculs" in faits, false);
    assert.equal("reculs" in tableau(faits), false);
    assert.equal("reculs" in tableau({ ...faits, reculs: [] }), false);
  });

  test("une forme qui n'est pas la sienne refuse les faits, et dit quel champ", () => {
    assert.deepEqual(lus([{ ...EN_COURS, etat: "inventee" }]), { informe: "reculs[0].etat: expected en-cours, non-mergee, rien-a-comparer or mesuree" });
    assert.deepEqual(lus([{ ...RECULE_MESURE, apres: { ...releve(8, [29]), part: 3 } }]), { informe: "reculs[0].apres.part: expected a share between 0 and 1" });
    assert.deepEqual(lus([{ ...RECULE_MESURE, recule: "oui" }]), { informe: "reculs[0].recule: expected a boolean" });
    assert.deepEqual(lus([{ ...RIEN, mergee: "hier" }]), { informe: "reculs[0].mergee: expected a time" });
    assert.deepEqual(lus({}), { informe: "reculs: expected a list" });
  });

  test("la section : chaque côté en pourcents entiers, ses trois derniers tickets atteints les plus récents d'abord, le numéro de la PR", () => {
    const [mesuree, rien, rienAvant, enCours, non] = sections(RECULE_MESURE, RIEN, RIEN_AVANT, EN_COURS, NON);
    assert.deepEqual(mesuree, {
      proposition: 412,
      titre: "red gates: app tests",
      pr: 41,
      etat: "mesuree",
      mergee: "2026-10-08T15:20:00.000Z",
      avant: { tickets: 20, atteints: 6, pourcent: 30, derniers: [17, 14, 11] },
      apres: { tickets: 8, atteints: 1, pourcent: 13, derniers: [29] },
      recule: true,
    });
    assert.deepEqual(rien, { proposition: 455, titre: "cap on turns or duration", pr: 47, etat: "rien-a-comparer", mergee: "2026-10-13T08:41:00.000Z", avant: { tickets: 20, atteints: 2, pourcent: 10, derniers: [24, 18] } });
    assert.equal(rienAvant?.etat === "rien-a-comparer" && rienAvant.avant, null);
    assert.deepEqual(enCours, { proposition: 470, titre: "conflict with the base", pr: 49, etat: "en-cours" });
    assert.deepEqual(non, { proposition: 471, titre: "other", pr: null, etat: "non-mergee" });
  });

  test("le tableau porte les sections, dans l'ordre de `facts`", () => {
    const faits = lus([RECULE_MESURE, EN_COURS]);
    assert.ok(!("informe" in faits));
    assert.deepEqual(tableau(faits).reculs?.map(({ proposition }) => proposition), [412, 470]);
  });
});

describe("la section, telle que la vue la pose", () => {
  const poser = (...reculs: ReculDeCorrection[]) => {
    const ouverts: number[] = [];
    const [bloc, ...reste] = poserReculs(doc, sections(...reculs), (ticket: number) => ouverts.push(ticket)) as Faux[];
    assert.deepEqual(reste, []);
    assert.ok(bloc !== undefined);
    return { bloc, ouverts, cartes: bloc.dessous("li").filter(({ className }) => className === "recul") };
  };
  const cotes = (carte: Faux) => carte.dessous("div").filter(({ className }) => className.split(" ").includes("cote"));
  const verdictDe = (carte: Faux) => carte.dessous("span").find(({ className }) => className.split(" ").includes("verdict"));

  test("sans correction acceptée, rien n'est posé", () => {
    assert.deepEqual(poserReculs(doc, undefined, () => {}), []);
    assert.deepEqual(poserReculs(doc, [], () => {}), []);
  });

  test("mesurée, la cause et ses deux parts côte à côte, et le mot du runtime : elle recule", () => {
    const { bloc, cartes } = poser(RECULE_MESURE);
    assert.equal(bloc.dessous("h2")[0]?.textContent, TITRE);
    const [carte] = cartes;
    assert.ok(carte !== undefined);
    assert.match(carte.textContent, /^red gates: app tests/);
    assert.equal(verdictDe(carte)?.textContent, RECULE);
    assert.equal(verdictDe(carte)?.className, "verdict recule");
    const [avant, apres] = cotes(carte);
    assert.equal(avant?.dessous("h4")[0]?.textContent.startsWith(AVANT), true);
    assert.equal(apres?.dessous("h4")[0]?.textContent.startsWith(APRES), true);
    assert.deepEqual(textes([avant, apres].map((cote) => cote?.dessous("p").find(({ className }) => className === "total") ?? assert.fail("pas de part"))), ["30%", "13%"]);
    assert.match(avant?.textContent ?? "", /6 of 20 tickets failed because of it/);
    assert.match(apres?.textContent ?? "", /1 of 8 tickets failed because of it/);
    // La PR et la date du merge, le numéro en monospace.
    const pr = carte.dessous("span").find(({ textContent }) => textContent === "#41");
    assert.equal(pr?.className, "mono");
    assert.match(carte.textContent, /PR #41, merged on 10\/8\/2026/);
  });

  test("une cause qui ne recule pas le dit, dans son ton", () => {
    const [carte] = poser(NE_RECULE).cartes;
    assert.ok(carte !== undefined);
    assert.equal(verdictDe(carte)?.textContent, NE_RECULE_PAS);
    assert.equal(verdictDe(carte)?.className, "verdict ne-recule-pas");
    assert.deepEqual(textes(cotes(carte).map((cote) => cote.dessous("p").find(({ className }) => className === "total") ?? assert.fail("pas de part"))), ["15%", "22%"]);
  });

  test("mergée sans ticket fini depuis : l'avant, et à la place de l'après une attente en mots — aucune part nulle", () => {
    const [carte] = poser(RIEN).cartes;
    assert.ok(carte !== undefined);
    assert.equal(verdictDe(carte)?.textContent, RIEN_A_COMPARER);
    const [avant, apres] = cotes(carte);
    assert.equal(avant?.className, "cote");
    assert.equal(apres?.className, "cote attente");
    assert.equal(apres?.dessous("p").find(({ className }) => className === "total")?.textContent, PAS_ENCORE);
    assert.match(apres?.textContent ?? "", /no ticket taken after the merge is finished yet/);
    assert.doesNotMatch(apres?.textContent ?? "", /\d+%|0 of/);
  });

  test("mergée sans ticket fini avant non plus : les deux côtés attendent, aucun chiffre", () => {
    const [carte] = poser(RIEN_AVANT).cartes;
    assert.ok(carte !== undefined);
    assert.deepEqual(cotes(carte).map(({ className }) => className), ["cote attente", "cote attente"]);
    assert.doesNotMatch(cotes(carte).map(({ textContent }) => textContent).join(" "), /%/);
  });

  test("pas encore mergée, ou qui ne le sera pas : une ligne, sans avant ni après", () => {
    const { cartes } = poser(EN_COURS, NON);
    const [enCours, non] = cartes;
    assert.ok(enCours !== undefined && non !== undefined);
    assert.equal(verdictDe(enCours)?.textContent, PAS_ENCORE_MERGEE);
    assert.match(enCours.textContent, /PR #49, is not merged yet: before and after are measured once it is/);
    assert.equal(verdictDe(non)?.textContent, NON_MERGEE);
    assert.match(non.textContent, /its correction will not be merged: nothing is measured/);
    for (const carte of cartes) {
      assert.deepEqual(cotes(carte), []);
      assert.doesNotMatch(carte.textContent, /%/);
    }
  });

  test("un ticket atteint ouvre sa fiche, et se pose en monospace", () => {
    const { bloc, ouverts } = poser(RECULE_MESURE);
    const boutons = bloc.dessous("button").filter(({ textContent }) => /^#\d+$/.test(textContent));
    assert.deepEqual(textes(boutons), ["#17", "#14", "#11", "#29"]);
    for (const bouton of boutons) assert.equal(bouton.className, "mono");
    boutons[3]?.click();
    assert.deepEqual(ouverts, [29]);
  });

  test("ce que chaque côté regarde est au survol de son nom, pas écrit à plat", () => {
    const [carte] = poser(RECULE_MESURE).cartes;
    const aides = carte?.dessous("button").filter(({ className }) => className === "aide") ?? [];
    assert.equal(aides.length, 2);
    assert.match(aides[0]?.ariaLabel ?? "", /before the merge/);
    assert.doesNotMatch(carte?.textContent ?? "", /20 at most/);
  });
});

describe("la page Reliability, dans l'espace du projet", () => {
  async function ouvrir() {
    const vue = await jouerLaVue({
      demarrage: () => ({
        configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [{ nom: "parade", dossier: "/tmp/parade", box: { hote: "box" } }], hotes: ["box"] }),
        palette: PALETTE,
        exemple: EXEMPLE,
        onglets: ONGLETS,
        rubriques: RUBRIQUES,
        boutons: BOUTONS,
        gestes: { manager: GESTES_DU_MANAGER, allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, grants: { gestes: GESTES_DES_GRANTS, nommes: GRANTS }, directs: DIRECTS, confirmes: CONFIRMES },
        banniere: BANNIERE,
        calibrage: { modeles: MODELES, efforts: EFFORTS },
        code: undefined,
      }),
      espace: () => [],
    });
    (vue.element("projets").children.at(1) ?? assert.fail("pas de case parade")).click();
    await repos();
    await ouvrirLecture(vue, "Reliability");
    return vue;
  }
  const faitsLus = (vue: Awaited<ReturnType<typeof ouvrir>>, reculs?: ReculDeCorrection[]): Dessinable => {
    const faits = comprendre(JSON.stringify(reculs === undefined ? FAITS : { ...FAITS, reculs })) as Faits;
    return { projet: "parade", demande: vue.dernier("faits")[0] as number, a: A, tableau: tableau(faits) };
  };

  test("les faits lus portent une correction mergée : la page pose sa cause, avant et après, et son verdict", async () => {
    const vue = await ouvrir();
    const page = vue.element("fiabilite");
    assert.equal(page.hidden, false);
    assert.doesNotMatch(page.textContent, /corrected causes/);
    vue.dire("surFaits", faitsLus(vue, [RECULE_MESURE, EN_COURS]));
    await repos();
    assert.match(page.textContent, new RegExp(TITRE));
    assert.match(page.textContent, /red gates: app testsrecedes/);
    assert.match(page.textContent, /30%.*13%/);
    assert.match(page.textContent, /conflict with the basenot merged yet/);
    // Un ticket atteint ouvre sa fiche, par-dessus la page.
    (page.dessous("button").find(({ textContent }) => textContent === "#29") ?? assert.fail("pas de #29")).click();
    await repos();
    assert.equal(vue.element("fiche").hidden, false);
  });

  test("un projet sans correction acceptée n'a pas de section", async () => {
    const vue = await ouvrir();
    vue.dire("surFaits", faitsLus(vue));
    await repos();
    assert.equal(vue.element("fiabilite").hidden, false);
    assert.equal(vue.element("fiabilite").dessous("div").some(({ className }) => className === "reculs-fiabilite"), false);
  });
});
