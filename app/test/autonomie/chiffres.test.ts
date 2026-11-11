// Les chiffres d'autonomie (#3222) : trois chiffres et le choix de la période, un état vide dit en clair, une lecture qui
// échoue en une ligne, et « served with a human » qui déplie les tickets, chacun avec sa question et son lien. La vue est
// jouée devant un faux document ; ses lectures sont celles du vrai calcul du runtime sur des données de GitHub figées. Puis
// la vue entière : le bloc de tous les projets sur la page de leur coût, celui du projet dans sa section de Settings.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { PERIODES as PERIODES_DU_RUNTIME, chiffresDAutonomie, type DonneesDuDepot } from "../../../runtime/src/autonomie/chiffres/chiffres.ts";
import { ALLUMAGE } from "../../src/allumage.ts";
import { pourLaBarre } from "../../src/barre.ts";
import { EXEMPLE, type Projet } from "../../src/config.ts";
import { PALETTE } from "../../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../../src/cuisine.ts";
import { BANNIERE } from "../../src/faits.ts";
import { CONFIRMES, DIRECTS } from "../../src/gestes.ts";
import { ONGLETS, RUBRIQUES } from "../../src/onglets.ts";
import { EFFORTS, MODELES } from "../../src/projets/projets.ts";
import { SANS_LECTURE as SANS_LECTURE_DU_PROCESS, type LectureDAutonomie } from "../../src/vue/autonomie/autonomie-github.ts";
import { AUCUN, AVEC_HUMAIN, PERIODES, periodeDite, SANS_LECTURE, SANS_QUESTION, tenirLesChiffresDAutonomie } from "../../src/vue/autonomie/chiffres.js";
import { Faux, jouerLaVue, ouvrirLecture, ouvrirLesCouts, repos } from "../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) };
const MAINTENANT = new Date("2026-11-11T12:00:00.000Z");
const HEURE = 3600 * 1000;
const JOUR = 24 * HEURE;
const il = (ms: number) => new Date(MAINTENANT.getTime() - ms).toISOString();
const pose = (label: string, le: string) => ({ event: "labeled", label: { name: label }, created_at: le });
const dit = (body: string, le: string) => ({ body, created_at: le, author_association: "OWNER" });

// Trois tickets de « parade » : #1 servi seul il y a deux jours ; #2 renvoyé puis servi il y a trois jours ; #3 bloqué sur le
// chef, servi il y a vingt jours.
const PARADE: DonneesDuDepot = {
  depot: "chef/parade",
  servis: [
    { ticket: 1, titre: "Badge colours", url: "https://github.com/chef/parade/issues/1", livre: il(2 * JOUR) },
    { ticket: 2, titre: "Faster rail", url: "https://github.com/chef/parade/issues/2", livre: il(3 * JOUR) },
    { ticket: 3, titre: "New route", url: "https://github.com/chef/parade/issues/3", livre: il(20 * JOUR) },
  ],
  issues: {
    1: { evenements: [pose("fire", il(2 * JOUR + 2 * HEURE))], commentaires: [] },
    2: { evenements: [pose("fire", il(3 * JOUR + 4 * HEURE))], commentaires: [dit("<!-- brigade:renvoi n=1 sha=a -->\nsent back", il(3 * JOUR + 2 * HEURE))] },
    3: {
      evenements: [pose("fire", il(21 * JOUR)), pose("blocked-on-human", il(20 * JOUR + 6 * HEURE))],
      commentaires: [dit("**Question for the chef (product):** keep the old route?", il(20 * JOUR + 6 * HEURE + 1))],
    },
  },
};
const lu = (jours: number, donnees = [PARADE]): LectureDAutonomie => {
  const chiffres = chiffresDAutonomie(donnees, jours, MAINTENANT);
  return { jours, chiffres: { ...chiffres, avecHumain: chiffres.avecHumain.map((servi) => ({ ...servi, projet: "parade" })) }, manquants: [] };
};

const valeurs = (bloc: Faux) => bloc.dessous("p").filter(({ className }) => className === "valeur").map(({ textContent }) => textContent);
const boutonNomme = (bloc: Faux, debut: string) => bloc.dessous("button").find(({ textContent }) => textContent.startsWith(debut));

describe("les chiffres d'autonomie (#3222)", () => {
  test("ses périodes et sa ligne d'échec sont celles du runtime et du process principal", () => {
    assert.deepEqual([...PERIODES], [...PERIODES_DU_RUNTIME]);
    assert.equal(SANS_LECTURE, SANS_LECTURE_DU_PROCESS);
  });

  test("trois chiffres sur la période choisie ; une autre période se lit, et les change", async () => {
    const demandes: number[] = [];
    const { poser } = tenirLesChiffresDAutonomie(doc, { lire: (jours) => (demandes.push(jours), Promise.resolve(lu(jours))), ouvrir: () => undefined, maintenant: () => MAINTENANT.getTime() });
    const bloc = poser() as Faux;
    assert.match(bloc.textContent, /Reading GitHub/);
    await repos();
    assert.deepEqual(valeurs(bloc), ["100 %", "3 h", "50 %"]);
    assert.match(bloc.textContent, /2 of 2 merged tickets/);
    assert.equal(boutonNomme(bloc, periodeDite(7))?.ariaPressed, "true");
    boutonNomme(bloc, periodeDite(30))?.click();
    await repos();
    assert.deepEqual(demandes, [7, 30]);
    assert.equal(boutonNomme(bloc, periodeDite(30))?.ariaPressed, "true");
    assert.deepEqual(valeurs(bloc), ["67 %", "4 h", "33 %"]);
    // Revenue à 7 jours, la période déjà lue ne se relit pas.
    boutonNomme(bloc, periodeDite(7))?.click();
    await repos();
    assert.deepEqual(demandes, [7, 30]);
  });

  test("un clic sur « served with a human » déplie les tickets, chacun avec sa question et son lien", async () => {
    const ouverts: string[] = [];
    const sansTexte = lu(30);
    if ("chiffres" in sansTexte) sansTexte.chiffres.avecHumain[0]?.questions.push(null);
    const { poser } = tenirLesChiffresDAutonomie(doc, { lire: () => Promise.resolve(sansTexte), ouvrir: (url) => ouverts.push(url), maintenant: () => MAINTENANT.getTime() });
    const bloc = poser() as Faux;
    await repos();
    const deplier = boutonNomme(bloc, AVEC_HUMAIN);
    assert.equal(deplier?.textContent, `${AVEC_HUMAIN} · 1`);
    assert.equal(bloc.dessous("ul").length, 0);
    deplier?.click();
    const [liste] = bloc.dessous("ul");
    assert.ok(liste !== undefined);
    assert.deepEqual(liste.dessous("p").map(({ textContent }) => textContent), ["Question for the chef (product): keep the old route?", SANS_QUESTION]);
    boutonNomme(liste, "#3 New route")?.click();
    assert.deepEqual(ouverts, ["https://github.com/chef/parade/issues/3"]);
  });

  test("une période sans ticket mergé le dit en une ligne, sans aucun chiffre", async () => {
    const { poser } = tenirLesChiffresDAutonomie(doc, { lire: (jours) => Promise.resolve(lu(jours, [])), ouvrir: () => undefined });
    const bloc = poser() as Faux;
    await repos();
    assert.deepEqual(valeurs(bloc), []);
    assert.match(bloc.textContent, new RegExp(AUCUN(7)));
    assert.doesNotMatch(bloc.textContent, /NaN|Infinity/);
  });

  test("une lecture qui échoue, ou qui ne rend rien, se dit en une ligne, le détail au survol ; un projet non lu est nommé", async () => {
    for (const lire of [() => Promise.reject(new Error("GitHub answered HTTP 502")), () => Promise.resolve(undefined as unknown as LectureDAutonomie)]) {
      const bloc = tenirLesChiffresDAutonomie(doc, { lire, ouvrir: () => undefined }).poser() as Faux;
      await repos();
      const ligne = bloc.dessous("p").find(({ dataset }) => dataset.ligne === "erreur");
      assert.equal(ligne?.dessous("span")[0]?.textContent, SANS_LECTURE);
      assert.deepEqual(valeurs(bloc), []);
    }
    const partielle = lu(7);
    if ("chiffres" in partielle) partielle.manquants.push({ projet: "cantine", raison: "GitHub answered HTTP 404" });
    const bloc = tenirLesChiffresDAutonomie(doc, { lire: () => Promise.resolve(partielle), ouvrir: () => undefined }).poser() as Faux;
    await repos();
    assert.match(bloc.textContent, /not read: cantine/);
    assert.equal(valeurs(bloc).length, 3);
  });

  test("dix minutes après sa lecture, la période se relit à la pose suivante", async () => {
    let instant = MAINTENANT.getTime();
    const demandes: number[] = [];
    const { poser } = tenirLesChiffresDAutonomie(doc, { lire: (jours) => (demandes.push(jours), Promise.resolve(lu(jours))), ouvrir: () => undefined, maintenant: () => instant });
    poser();
    await repos();
    poser();
    await repos();
    assert.deepEqual(demandes, [7]);
    instant += 10 * 60_000;
    poser();
    await repos();
    assert.deepEqual(demandes, [7, 7]);
  });
});

describe("les chiffres d'autonomie dans la vue (#3222)", () => {
  const PROJET: Projet = { nom: "parade", dossier: "/tmp/parade" };
  const jouer = (demandes: unknown[][]) =>
    jouerLaVue({
      demarrage: () => ({
        configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [PROJET] }, () => true),
        palette: PALETTE,
        exemple: EXEMPLE,
        onglets: ONGLETS,
        rubriques: RUBRIQUES,
        gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, directs: DIRECTS, confirmes: CONFIRMES },
        banniere: BANNIERE,
        calibrage: { modeles: MODELES, efforts: EFFORTS },
        code: undefined,
      }),
      espace: () => [],
      lireAutonomie: (projets, jours) => (demandes.push([projets, jours]), lu(jours)),
    });

  test("ceux de tous les projets sont sur la page de leur coût, juste après les tokens", async () => {
    const demandes: unknown[][] = [];
    const vue = await jouer(demandes);
    const page = await ouvrirLesCouts(vue);
    await repos();
    const corps = page.children[1];
    assert.deepEqual(corps?.children.slice(0, 2).map(({ className }) => className), ["tete-cout", "chiffres-autonomie"]);
    assert.equal(corps?.children[1]?.ariaLabel, "Autonomy of all projects");
    assert.deepEqual(valeurs(corps?.children[1] as Faux), ["100 %", "3 h", "50 %"]);
    assert.deepEqual(demandes.at(-1), [["parade"], 7]);
  });

  test("ceux d'un projet sont dans sa section de Settings, lus pour lui seul", async () => {
    const demandes: unknown[][] = [];
    const vue = await jouer(demandes);
    vue.element("projets").children[1]?.click();
    await repos();
    await ouvrirLecture(vue, "Settings");
    await repos();
    const bloc = vue.element("bandeau-sante").children.find(({ dataset }) => dataset.bloc === "chiffres-autonomie");
    assert.ok(bloc !== undefined);
    assert.equal(bloc.ariaLabel, "Autonomy");
    assert.deepEqual(valeurs(bloc), ["100 %", "3 h", "50 %"]);
    assert.deepEqual(demandes, [[["parade"], 7]]);
  });
});
