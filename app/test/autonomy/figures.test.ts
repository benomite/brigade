// Les chiffres d'autonomie (#3222) : trois chiffres et le choix de la période, un état vide dit en clair, une lecture qui
// échoue en une ligne, et « served with a human » qui déplie les tickets, chacun avec sa question et son lien. La vue est
// jouée devant un faux document ; ses lectures sont celles du vrai calcul du runtime sur des données de GitHub figées. Puis
// la vue entière : le bloc de tous les projets sur la page de leur coût, celui du projet dans sa section de Settings.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { PERIODES as PERIODES_DU_RUNTIME, chiffresDAutonomie, type DonneesDuDepot } from "../../../runtime/src/autonomie/chiffres/chiffres.ts";
import { ALLUMAGE } from "../../src/allumage.ts";
import { pourLaBar } from "../../src/bar.ts";
import { EXEMPLE, type Project } from "../../src/config.ts";
import { PALETTE } from "../../src/couleurs.ts";
import { KITCHEN_ACTIONS } from "../../src/kitchen.ts";
import { BANNIERE } from "../../src/facts.ts";
import { CONFIRMES, DIRECTS } from "../../src/actions.ts";
import { ONGLETS, RUBRIQUES } from "../../src/onglets.ts";
import { EFFORTS, MODELES } from "../../src/projects/projects.ts";
import { nommerLesProjects, SANS_READ as SANS_READ_DU_PROCESS, type ReadDAutonomy } from "../../src/vue/autonomy/autonomy-github.ts";
import { AUCUN, AVEC_HUMAN, PERIODES, periodeDite, SANS_READ, SANS_QUESTION, holdLesFiguresDAutonomy } from "../../src/vue/autonomy/figures.js";
import { Faux, jouerLaVue, ouvrirRead, ouvrirLesCouts, repos } from "../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) };
const MAINTENANT = new Date("2026-11-11T12:00:00.000Z");
const HEURE = 3600 * 1000;
const DAY = 24 * HEURE;
const il = (ms: number) => new Date(MAINTENANT.getTime() - ms).toISOString();
const pose = (label: string, le: string) => ({ event: "labeled", label: { name: label }, created_at: le });
const dit = (body: string, le: string) => ({ body, created_at: le, author_association: "OWNER" });

// Trois tickets de « parade » : #1 servi seul il y a deux jours ; #2 renvoyé puis servi il y a trois jours ; #3 bloqué sur le
// chef, servi il y a vingt jours.
const PARADE: DonneesDuDepot = {
  depot: "chef/parade",
  servis: [
    { ticket: 1, titre: "Badge colours", url: "https://github.com/chef/parade/issues/1", livre: il(2 * DAY) },
    { ticket: 2, titre: "Faster rail", url: "https://github.com/chef/parade/issues/2", livre: il(3 * DAY) },
    { ticket: 3, titre: "New route", url: "https://github.com/chef/parade/issues/3", livre: il(20 * DAY) },
  ],
  issues: {
    1: { evenements: [pose("fire", il(2 * DAY + 2 * HEURE))], commentaires: [] },
    2: { evenements: [pose("fire", il(3 * DAY + 4 * HEURE))], commentaires: [dit("<!-- brigade:renvoi n=1 sha=a -->\nsent back", il(3 * DAY + 2 * HEURE))] },
    3: {
      evenements: [pose("fire", il(21 * DAY)), pose("blocked-on-human", il(20 * DAY + 6 * HEURE))],
      commentaires: [dit("**Question for the chef (product):** keep the old route?", il(20 * DAY + 6 * HEURE + 1))],
    },
  },
};
const lu = (jours: number, donnees = [PARADE]): ReadDAutonomy => {
  const figures = chiffresDAutonomie(donnees, jours, MAINTENANT);
  return { jours, chiffres: nommerLesProjects(figures, () => "parade"), manquants: [], partiels: [] };
};

// Les valeurs des trois chiffres d'autonomie ; celles des défauts échappés (#3515), à part.
const valeursDe = (bloc: Faux, classe: string) =>
  bloc
    .dessous("div")
    .filter(({ className }) => className === classe)
    .flatMap((cadre) => cadre.dessous("p").filter(({ className }) => className === "valeur").map(({ textContent }) => textContent));
const valeurs = (bloc: Faux) => valeursDe(bloc, "figure");
const buttonNomme = (bloc: Faux, debut: string) => bloc.dessous("button").find(({ textContent }) => textContent.startsWith(debut));

describe("les chiffres d'autonomie (#3222)", () => {
  test("ses périodes et sa ligne d'échec sont celles du runtime et du process principal", () => {
    assert.deepEqual([...PERIODES], [...PERIODES_DU_RUNTIME]);
    assert.equal(SANS_READ, SANS_READ_DU_PROCESS);
  });

  test("trois chiffres sur la période choisie ; une autre période se lit, et les change", async () => {
    const demandes: number[] = [];
    const { poser } = holdLesFiguresDAutonomy(doc, { lire: (jours) => (demandes.push(jours), Promise.resolve(lu(jours))), ouvrir: () => undefined, maintenant: () => MAINTENANT.getTime() });
    const bloc = poser() as Faux;
    assert.match(bloc.textContent, /Reading GitHub/);
    await repos();
    assert.deepEqual(valeurs(bloc), ["100 %", "3 h", "50 %"]);
    assert.match(bloc.textContent, /2 of 2 merged tickets/);
    assert.equal(buttonNomme(bloc, periodeDite(7))?.ariaPressed, "true");
    buttonNomme(bloc, periodeDite(30))?.click();
    await repos();
    assert.deepEqual(demandes, [7, 30]);
    assert.equal(buttonNomme(bloc, periodeDite(30))?.ariaPressed, "true");
    assert.deepEqual(valeurs(bloc), ["67 %", "4 h", "33 %"]);
    // Revenue à 7 jours, la période déjà lue ne se relit pas.
    buttonNomme(bloc, periodeDite(7))?.click();
    await repos();
    assert.deepEqual(demandes, [7, 30]);
  });

  test("un clic sur « served with a human » déplie les tickets, chacun avec sa question et son lien", async () => {
    const ouverts: string[] = [];
    const sansTexte = lu(30);
    if ("chiffres" in sansTexte) sansTexte.chiffres.avecHumain[0]?.questions.push(null);
    const { poser } = holdLesFiguresDAutonomy(doc, { lire: () => Promise.resolve(sansTexte), ouvrir: (url) => ouverts.push(url), maintenant: () => MAINTENANT.getTime() });
    const bloc = poser() as Faux;
    await repos();
    const deplier = buttonNomme(bloc, AVEC_HUMAN);
    assert.equal(deplier?.textContent, `${AVEC_HUMAN} · 1`);
    assert.equal(bloc.dessous("ul").length, 0);
    deplier?.click();
    const [liste] = bloc.dessous("ul");
    assert.ok(liste !== undefined);
    assert.deepEqual(liste.dessous("p").map(({ textContent }) => textContent), ["Question for the chef (product): keep the old route?", SANS_QUESTION]);
    buttonNomme(liste, "#3 New route")?.click();
    assert.deepEqual(ouverts, ["https://github.com/chef/parade/issues/3"]);
  });

  test("une période sans ticket mergé le dit en une ligne, sans aucun chiffre", async () => {
    const { poser } = holdLesFiguresDAutonomy(doc, { lire: (jours) => Promise.resolve(lu(jours, [])), ouvrir: () => undefined });
    const bloc = poser() as Faux;
    await repos();
    assert.deepEqual(valeurs(bloc), []);
    assert.match(bloc.textContent, new RegExp(AUCUN(7)));
    assert.doesNotMatch(bloc.textContent, /NaN|Infinity/);
  });

  test("une lecture qui échoue, ou qui ne rend rien, se dit en une ligne, le détail au survol ; un projet non lu est nommé", async () => {
    for (const lire of [() => Promise.reject(new Error("GitHub answered HTTP 502")), () => Promise.resolve(undefined as unknown as ReadDAutonomy)]) {
      const bloc = holdLesFiguresDAutonomy(doc, { lire, ouvrir: () => undefined }).poser() as Faux;
      await repos();
      const line = bloc.dessous("p").find(({ dataset }) => dataset.ligne === "erreur");
      assert.equal(line?.dessous("span")[0]?.textContent, SANS_READ);
      assert.deepEqual(valeurs(bloc), []);
    }
    const partielle = lu(7);
    if ("chiffres" in partielle) partielle.manquants.push({ projet: "cantine", raison: "GitHub answered HTTP 404" });
    const bloc = holdLesFiguresDAutonomy(doc, { lire: () => Promise.resolve(partielle), ouvrir: () => undefined }).poser() as Faux;
    await repos();
    assert.match(bloc.textContent, /not read: cantine/);
    assert.equal(valeurs(bloc).length, 3);
  });

  test("une période lue en partie le dit avant les chiffres, avec le projet et l'instant depuis lequel il est compté", async () => {
    const partielle = lu(7);
    if ("chiffres" in partielle) partielle.partiels.push({ projet: "parade", depuis: "2026-11-01T10:30:00.000Z", raison: "GitHub answered HTTP 403" });
    const bloc = holdLesFiguresDAutonomy(doc, { lire: () => Promise.resolve(partielle), ouvrir: () => undefined }).poser() as Faux;
    await repos();
    assert.match(bloc.textContent, /not read over the whole last 7 days: parade counted only from 2026-11-01 10:30 UTC/);
    assert.equal(valeurs(bloc).length, 3);
  });

  // Les défauts échappés de « parade » (#3515) : le bug #9 cite #1 après son merge, le commit abcdef1… revert un commit de #2.
  const AVEC_DEFAUTS: DonneesDuDepot = {
    ...PARADE,
    defauts: {
      bugs: [{ number: 9, title: "Badge grey", body: "Since #1.", created_at: il(DAY), labels: [{ name: "bug" }], html_url: "https://github.com/chef/parade/issues/9" }],
      reverts: [{ sha: "abcdef1".padEnd(40, "0"), commit: { message: `Revert "x"\n\nThis reverts commit ${"c".repeat(40)}.`, committer: { date: il(HEURE) } } }],
      ticketsDesCommits: { ["c".repeat(40)]: [2] },
    },
  };
  // Les mots de la vue, tels que le ticket les nomme.
  const BUGS_ECHAPPES = "escaped bugs";
  const REVERTS = "reverts";
  const DEFAUTS_NON_LUS = "not read";
  const textesDe = (bloc: Faux, name: string) => {
    const cadre = bloc.dessous("div").find(({ className, textContent }) => className === "figure defauts" && textContent.startsWith(name));
    return cadre?.dessous("p").map(({ textContent }) => textContent);
  };

  test("les bugs échappés et les reverts suivent les trois chiffres, chacun avec les tickets et les commits qui font son nombre (#3515)", async () => {
    const bloc = holdLesFiguresDAutonomy(doc, { lire: (jours) => Promise.resolve(lu(jours, [AVEC_DEFAUTS])), ouvrir: () => undefined }).poser() as Faux;
    await repos();
    assert.deepEqual(valeurs(bloc), ["100 %", "3 h", "50 %"]);
    assert.deepEqual(textesDe(bloc, BUGS_ECHAPPES), ["1", "#1 (bug #9)"]);
    assert.deepEqual(textesDe(bloc, REVERTS), ["1", "abcdef1 (#2)"]);
    // Ceux de tous les projets nomment le projet de chacun.
    const tous = holdLesFiguresDAutonomy(doc, { lire: (jours) => Promise.resolve(lu(jours, [AVEC_DEFAUTS])), ouvrir: () => undefined, tous: true }).poser() as Faux;
    await repos();
    assert.deepEqual(textesDe(tous, BUGS_ECHAPPES), ["1", "parade #1 (bug #9)"]);
    assert.deepEqual(textesDe(tous, REVERTS), ["1", "parade abcdef1 (#2)"]);
  });

  test("aucun défaut échappé se dit 0 ; des défauts non lus ne se disent pas 0, mais non lus et pourquoi (#3515)", async () => {
    const sans = holdLesFiguresDAutonomy(doc, { lire: (jours) => Promise.resolve(lu(jours, [{ ...PARADE, defauts: { bugs: [], reverts: [], ticketsDesCommits: {} } }])), ouvrir: () => undefined }).poser() as Faux;
    await repos();
    assert.deepEqual(textesDe(sans, BUGS_ECHAPPES), ["0", "none"]);
    assert.deepEqual(textesDe(sans, REVERTS), ["0", "none"]);
    const nonLus = holdLesFiguresDAutonomy(doc, { lire: (jours) => Promise.resolve(lu(jours, [{ ...PARADE, defauts: { illisible: "GitHub answered HTTP 403 on /search/commits" } }])), ouvrir: () => undefined }).poser() as Faux;
    await repos();
    assert.deepEqual(textesDe(nonLus, BUGS_ECHAPPES), [DEFAUTS_NON_LUS, "parade: GitHub answered HTTP 403 on /search/commits"]);
    assert.deepEqual(textesDe(nonLus, REVERTS), [DEFAUTS_NON_LUS, "parade: GitHub answered HTTP 403 on /search/commits"]);
  });

  test("dix minutes après sa lecture, la période se relit à la pose suivante", async () => {
    let instant = MAINTENANT.getTime();
    const demandes: number[] = [];
    const { poser } = holdLesFiguresDAutonomy(doc, { lire: (jours) => (demandes.push(jours), Promise.resolve(lu(jours))), ouvrir: () => undefined, maintenant: () => instant });
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
  const PROJECT: Project = { nom: "parade", dossier: "/tmp/parade" };
  const jouer = (demandes: unknown[][]) =>
    jouerLaVue({
      demarrage: () => ({
        configuration: pourLaBar({ chemin: "/tmp/app.json", projets: [PROJECT] }, () => true),
        palette: PALETTE,
        exemple: EXEMPLE,
        onglets: ONGLETS,
        rubriques: RUBRIQUES,
        gestes: { allumage: ALLUMAGE, cuisine: KITCHEN_ACTIONS, directs: DIRECTS, confirmes: CONFIRMES },
        banniere: BANNIERE,
        calibrage: { modeles: MODELES, efforts: EFFORTS },
        code: undefined,
      }),
      espace: () => [],
      lireAutonomie: (projects, jours) => (demandes.push([projects, jours]), lu(jours)),
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
    await ouvrirRead(vue, "Settings");
    await repos();
    const bloc = vue.element("bandeau-sante").children.find(({ dataset }) => dataset.bloc === "chiffres-autonomie");
    assert.ok(bloc !== undefined);
    assert.equal(bloc.ariaLabel, "Autonomy");
    assert.deepEqual(valeurs(bloc), ["100 %", "3 h", "50 %"]);
    assert.deepEqual(demandes, [[["parade"], 7]]);
  });
});
