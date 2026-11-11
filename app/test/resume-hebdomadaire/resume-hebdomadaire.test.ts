// La page des résumés hebdomadaires (#3263) : un résumé par projet, ses thèmes en intertitres et chaque ligne le lien de
// son ticket ; l'autonomie quand elle a été comptée, puis ce qui attend le chef, dans cet ordre ; le jour du résumé, lundi
// sans réglage, et un autre jour choisi qui se propose ; « Publish as release notes », qui demande un tag puis publie une
// fois. Les résumés sont ceux qu'écrit le runtime (runtime/src/resume-hebdomadaire/resume.ts), joués devant un faux
// document ; puis la vue entière, la page ouverte par sa ligne parmi celles de tous les projets.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { JOURS_DU_RESUME } from "../../../runtime/src/resume-hebdomadaire/jour.ts";
import { resumeDeLaSemaine, TITRE_ATTENTE, TITRE_AUTONOMIE } from "../../../runtime/src/resume-hebdomadaire/resume.ts";
import { ALLUMAGE } from "../../src/allumage.ts";
import { pourLaBarre } from "../../src/barre.ts";
import { EXEMPLE, type Projet } from "../../src/config.ts";
import { PALETTE } from "../../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../../src/cuisine.ts";
import { BANNIERE } from "../../src/faits.ts";
import { CONFIRMES, DIRECTS } from "../../src/gestes.ts";
import { ONGLETS, RUBRIQUES } from "../../src/onglets.ts";
import { EFFORTS, MODELES } from "../../src/projets/projets.ts";
import type { RenduDeLaPublication, RenduDuJour, ResumeHebdomadaire, ResumesDuProjet } from "../../src/vue/resume-hebdomadaire/resume-cuisine.ts";
import { ATTENTE, AUTONOMIE, ENVOYER, JOURS, PUBLIER, TAG, tenirLesResumesHebdomadaires } from "../../src/vue/resume-hebdomadaire/resume-hebdomadaire.js";
import { Faux, jouerLaVue, ouvrirLecture, repos } from "../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) };
const url = (depot: string, n: number) => `https://github.com/${depot}/issues/${n}`;

// « parade » : deux épiques et une correction, ses chiffres d'autonomie comptés, une carte qui attend le chef.
const PARADE = resumeDeLaSemaine({
  project: "parade",
  weekStart: "2026-11-02",
  weekEnd: "2026-11-08",
  servis: [
    { number: 12, title: "feat(#12): show the rail age on the tile", url: url("chef/parade", 12), labels: [], epic: { number: 3, title: "The rail at a glance" } },
    { number: 14, title: "Keep the tile colours", url: url("chef/parade", 14), labels: [], epic: { number: 3, title: "The rail at a glance" } },
    { number: 15, title: "fix: the log no longer stops at 200 events", url: url("chef/parade", 15), labels: ["bug"], epic: null },
  ],
  autonomie: { tickets: 3, sansHumain: 2, partSansHumain: 2 / 3, delaiMedianMs: 5 * 3600_000, renvoyes: 1, partRenvoyee: 1 / 3, avecHumain: [] } as never,
  attentes: [{ ticket: 21, ligne: "Keep or drop the old route?", url: url("chef/parade", 21) }],
});
// « cantine » : sans chiffres d'autonomie, rien n'attend le chef.
const CANTINE = resumeDeLaSemaine({
  project: "cantine",
  weekStart: "2026-11-02",
  weekEnd: "2026-11-08",
  servis: [{ number: 6, title: "Menu of the week", url: url("chef/cantine", 6), labels: [], epic: null }],
  attentes: [],
});
const LUS: Record<string, ResumesDuProjet> = {
  parade: { projet: "parade", jour: { jour: "monday", pose: false }, resumes: { resumes: [PARADE], illisibles: [] } },
  cantine: { projet: "cantine", jour: { jour: "monday", pose: false }, resumes: { resumes: [CANTINE], illisibles: [] } },
};

type Options = { changerJour?: (projet: string, jour: string) => Promise<RenduDuJour>; publier?: (projet: string, resume: ResumeHebdomadaire, tag: string) => Promise<RenduDeLaPublication> };
function tenir({ changerJour = async () => ({ fait: "unchanged" }), publier = async () => ({ refus: "not here" }) }: Options = {}) {
  const ouverts: string[] = [];
  const tenu = tenirLesResumesHebdomadaires(doc, { lire: async (projet) => LUS[projet] as ResumesDuProjet, changerJour, publier, ouvrir: (adresse) => ouverts.push(adresse) });
  return { ouverts, poser: (projets: string[]) => tenu.poser(projets) as Faux };
}
const duProjet = (bloc: Faux, projet: string) => bloc.dessous("section").find(({ dataset }) => dataset.projet === projet) as Faux;
const intertitres = (section: Faux) => section.dessous("h4").map(({ textContent }) => textContent);
const boutonNomme = (bloc: Faux, libelle: string) => bloc.dessous("button").find(({ textContent }) => textContent === libelle);

describe("la page des résumés hebdomadaires (#3263)", () => {
  test("ses jours et ses titres sont ceux du runtime", () => {
    assert.deepEqual([...JOURS], [...JOURS_DU_RESUME]);
    assert.equal(ATTENTE, TITRE_ATTENTE);
    assert.equal(AUTONOMIE, TITRE_AUTONOMIE);
  });

  test("deux projets : un résumé chacun, ses thèmes en intertitres, chaque ligne le lien de son ticket", async () => {
    const { ouverts, poser } = tenir();
    const bloc = poser(["parade", "cantine"]);
    assert.match(bloc.textContent, /Reading the weekly summaries/);
    await repos();
    const parade = duProjet(bloc, "parade");
    const cantine = duProjet(bloc, "cantine");
    assert.equal(parade.dessous("article").length, 1);
    assert.equal(cantine.dessous("article").length, 1);
    assert.match(parade.textContent, /Week of 2026-11-02 to 2026-11-08/);
    assert.deepEqual(intertitres(parade).slice(0, 2), ["The rail at a glance", "Fixes"]);
    assert.deepEqual(intertitres(cantine)[0], "Improvements");
    const lignes = parade.dessous("ul").find(({ className }) => className === "lignes")?.dessous("li") ?? [];
    assert.deepEqual(
      lignes.map((li) => li.textContent),
      ["Show the rail age on the tile#12", "Keep the tile colours#14"],
    );
    for (const [rang, numero] of [12, 14].entries()) {
      lignes[rang]?.dessous("button")[0]?.click();
      assert.equal(ouverts.at(-1), url("chef/parade", numero));
    }
    // Ce qui attend le chef, de même.
    parade.dessous("button").find(({ dataset }) => dataset.ticket === "21")?.click();
    assert.equal(ouverts.at(-1), url("chef/parade", 21));
  });

  test("sans chiffres d'autonomie, pas de section ; avec, l'autonomie puis ce qui attend le chef, en dernier", async () => {
    const { poser } = tenir();
    const bloc = poser(["parade", "cantine"]);
    await repos();
    const cantine = intertitres(duProjet(bloc, "cantine"));
    assert.ok(!cantine.includes(AUTONOMIE));
    assert.equal(cantine.at(-1), ATTENTE);
    assert.match(duProjet(bloc, "cantine").textContent, /Nothing is waiting for you\./);
    const parade = intertitres(duProjet(bloc, "parade"));
    assert.deepEqual(parade.slice(-2), [AUTONOMIE, ATTENTE]);
    const autonomie = duProjet(bloc, "parade").dessous("ul").find(({ className }) => className === "autonomie");
    assert.deepEqual(
      autonomie?.dessous("li").map(({ textContent }) => textContent),
      ["served without a human2 of 3 (67 %)", "lead time5 h (median)", "send-back rate1 of 3 (33 %)"],
    );
  });

  test("le jour dit lundi sans réglage ; jeudi choisi propose weeklySummaryDay = thursday, et la PR se dit", async () => {
    const demandes: [string, string][] = [];
    const { poser } = tenir({ changerJour: async (projet, jour) => (demandes.push([projet, jour]), { pr: "https://github.com/chef/parade/pull/40", numero: 40, jour: "thursday" }) });
    const bloc = poser(["parade"]);
    await repos();
    const liste = bloc.dessous("select")[0] as Faux;
    assert.equal(liste.value, "monday");
    const rangee = bloc.dessous("div").find(({ className }) => className.includes("jour-du-resume")) as Faux;
    assert.match(rangee.textContent, /Monday \(default\)/);
    liste.value = "thursday";
    liste.declencher("change");
    assert.match(bloc.textContent, /proposing…/);
    await repos();
    assert.deepEqual(demandes, [["parade", "thursday"]]);
    assert.match(bloc.textContent, /Thursday proposed in.*pull request #40/);
  });

  test("un jour qui ne se lit pas ne vaut pas lundi : la ligne le dit, la liste ne choisit rien", async () => {
    const tenu = tenirLesResumesHebdomadaires(doc, {
      lire: async () => ({ projet: "parade", jour: { sans: "summary day unavailable", detail: "HTTP 500" }, resumes: { sans: "weekly summaries unavailable: the summary day was not read" } }),
      changerJour: async () => ({ fait: "" }),
      publier: async () => ({ refus: "" }),
      ouvrir: () => undefined,
    });
    const bloc = tenu.poser(["parade"]) as Faux;
    await repos();
    assert.equal((bloc.dessous("select")[0] as Faux).value, "");
    assert.match(bloc.textContent, /summary day unavailable/);
    assert.doesNotMatch(bloc.textContent, /Monday \(default\)/);
  });

  // La publication, jusqu'à ce que le faux geste rende `rendu`. Rend le bloc, et les appels du geste.
  async function publier(rendu: RenduDeLaPublication) {
    const appels: [string, ResumeHebdomadaire, string][] = [];
    const { poser } = tenir({ publier: async (projet, resume, tag) => (appels.push([projet, resume, tag]), rendu) });
    const bloc = poser(["parade"]);
    await repos();
    boutonNomme(bloc, PUBLIER)?.click();
    const champ = bloc.dessous("input").find(({ ariaLabel }) => ariaLabel === TAG) as Faux;
    assert.ok(champ !== undefined, "le tag est demandé");
    assert.equal(appels.length, 0);
    champ.value = "v1.4.0";
    champ.declencher("input");
    boutonNomme(bloc, ENVOYER)?.click();
    assert.match(bloc.textContent, /Publishing…/);
    await repos();
    return { bloc, appels };
  }

  test("« Publish as release notes » demande un tag, publie une fois le markdown du résumé, puis dit la release", async () => {
    const { bloc, appels } = await publier({ publiee: "published as the release notes of v1.4.0", url: "https://github.com/chef/parade/releases/tag/v1.4.0" });
    assert.equal(appels.length, 1);
    const [projet, resume, tag] = appels[0] as [string, ResumeHebdomadaire, string];
    assert.deepEqual([projet, tag, resume.markdown], ["parade", "v1.4.0", PARADE.markdown]);
    const dit = bloc.dessous("p").find(({ className }) => className === "publiee");
    assert.match(dit?.textContent ?? "", /published as the release notes of v1\.4\.0/);
    assert.ok(boutonNomme(bloc, "open the release") !== undefined);
    assert.equal(boutonNomme(bloc, PUBLIER), undefined);
  });

  test("déjà publiée : la phrase le dit, pas de succès", async () => {
    const { bloc, appels } = await publier({ dejaPubliee: "v1.4.0 already has its release notes — nothing was changed", url: "https://github.com/chef/parade/releases/tag/v1.4.0" });
    assert.equal(appels.length, 1);
    assert.equal(bloc.dessous("p").find(({ className }) => className === "publiee"), undefined);
    assert.match(bloc.dessous("p").find(({ className }) => className === "deja-publiee")?.textContent ?? "", /already has its release notes/);
  });

  test("refusée : la phrase du refus, son détail au survol, et le bouton pour réessayer", async () => {
    const { bloc, appels } = await publier({ refus: "The tag v1.4.0 does not exist on the repository: nothing was published.", detail: "$ node … release-notes v1.4.0" });
    assert.equal(appels.length, 1);
    const refus = bloc.dessous("p").find(({ className }) => className === "refus");
    assert.match(refus?.textContent ?? "", /does not exist on the repository/);
    assert.equal(bloc.dessous("p").find(({ className }) => className === "publiee"), undefined);
    assert.ok(boutonNomme(bloc, PUBLIER) !== undefined);
  });

  test("un geste qui lève se dit comme un refus", async () => {
    const { poser } = tenir({ publier: async () => Promise.reject(new Error("the bridge broke")) });
    const bloc = poser(["parade"]);
    await repos();
    boutonNomme(bloc, PUBLIER)?.click();
    const champ = bloc.dessous("input")[0] as Faux;
    champ.value = "v2";
    champ.declencher("keydown", { key: "Enter" });
    await repos();
    assert.match(bloc.dessous("p").find(({ className }) => className === "refus")?.textContent ?? "", /nothing was published/);
  });
});

describe("la page des résumés dans la vue (#3263)", () => {
  const PROJET: Projet = { nom: "parade", dossier: "/tmp/parade" };

  test("la ligne « Weekly summary » de tous les projets ouvre la page, qui lit chaque projet", async () => {
    const lus: string[] = [];
    const vue = await jouerLaVue({
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
      lireLesResumesHebdomadaires: (projet) => (lus.push(projet), LUS.parade as ResumesDuProjet),
    });
    vue.element("projets").children[1]?.click();
    await repos();
    await ouvrirLecture(vue, "Settings");
    const ligne = vue.element("de-tous-les-projets").dessous("button").find(({ ariaLabel }) => ariaLabel === "the weekly summaries of all projects");
    assert.ok(ligne !== undefined, "la ligne est parmi celles de tous les projets");
    ligne.click();
    await repos();
    const page = vue.element("resumes");
    assert.deepEqual(lus, ["parade"]);
    assert.match(page.textContent, /Weekly summary/);
    assert.deepEqual(intertitres(page), ["The rail at a glance", "Fixes", AUTONOMIE, ATTENTE]);
  });
});
