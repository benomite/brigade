// Le parcours d'un projet neuf sur sa page (#1111, épique 1108) : ses quatre étapes telles que sa
// station principale les publie (#1110), la courante marquée, celles à venir dites à venir, une phrase
// par étape et le geste attendu en bouton ; le ticket de préparation, son état et son lien ; en échec,
// la raison et l'heure du prochain essai ; prêt, la phrase qui invite au premier ticket, puis plus
// rien une fois écartée ou à la visite suivante. Les onboardings sont écrits dans la forme même du
// runtime (`Onboarding`), et relus par `lireOnboarding` comme l'app relit le suivi d'une station.
import { DIT_MODE_RESTREINT } from "../../../runtime/src/onboarding/mode-restreint.ts";
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { Onboarding as DuRuntime } from "../../../runtime/src/onboarding/etat.ts";
import { ALLUMAGE } from "../../src/allumage.ts";
import { pourLaBar } from "../../src/bar.ts";
import { EXEMPLE, type Project } from "../../src/config.ts";
import { PALETTE } from "../../src/couleurs.ts";
import { KITCHEN_ACTIONS } from "../../src/kitchen.ts";
import { BANNIERE } from "../../src/facts.ts";
import { CONFIRMES, DIRECTS } from "../../src/actions.ts";
import { ONGLETS, RUBRIQUES } from "../../src/onglets.ts";
import type { Outage } from "../../src/outages/outages.ts";
import { lireOnboarding, type Onboarding } from "../../src/projects/request.ts";
import { calibrationRecommande, EFFORTS, machineProposee, MODELES, type VuDesProjects } from "../../src/projects/projects.ts";
import type { VuDesStations } from "../../src/stations/stations.ts";
import { AUTRE_STATION, CONTINUER_SANS_BAC, ECARTER, STATES_DE_PREPARATION, OUVRIR_LA_PR, POSER_LE_FIRST, poserJourney, prochainTrialDit } from "../../src/vue/onboarding/journey.js";
import { Faux, jouerLaVue, repos } from "../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) };
const MAINTENANT = Date.parse("2026-10-13T10:04:00.000Z");
const REPOSITORY = "BOBL-tech/mirrorlab";
const TICKET = `https://github.com/${REPOSITORY}/issues/433`;
const PR = `https://github.com/${REPOSITORY}/pull/440`;
const NOUVELLE = `https://github.com/${REPOSITORY}/issues/new`;

// Les étapes telles que le runtime les écrit (runtime/src/onboarding/etat.ts), la préparation courante.
const AVANT: DuRuntime["etapes"] = [
  { etape: "depot", titre: "Repository", etat: "faite", dit: `${REPOSITORY} is authorized and cloned on box.`, geste: null },
  { etape: "machine", titre: "Cooking machine", etat: "faite", dit: "box cooks mirrorlab.", geste: null },
];
const A_VENIR: DuRuntime["etapes"][number] = { etape: "premier-ticket", titre: "First ticket", etat: "a-venir", dit: `Once ${REPOSITORY} is prepared, post your first ticket with the \`fire\` label.`, geste: null };
const EN_COURS: DuRuntime = {
  etat: "en-cours",
  termine: false,
  courante: "preparation",
  etapes: [...AVANT, { etape: "preparation", titre: "Repository preparation", etat: "courante", dit: `A cook on box prepares ${REPOSITORY} (#433).`, geste: null }, A_VENIR],
  preparation: { ticket: 433, url: TICKET, etat: "en-cours", raison: null, prochainEssai: null, pr: null },
  sansBacASable: false,
  decisionAttendue: false,
};
const EN_FAILURE: DuRuntime = {
  ...EN_COURS,
  etapes: [...AVANT, { etape: "preparation", titre: "Repository preparation", etat: "courante", dit: "The cook of #433 failed — the worktree setup of the project fails; it is retried by itself.", geste: null }, A_VENIR],
  preparation: { ticket: 433, url: TICKET, etat: "en-echec", raison: "The worktree setup of the project fails.", prochainEssai: "2026-10-13T10:14:00.000Z", pr: null },
};
const A_RELIRE: DuRuntime = {
  ...EN_COURS,
  etapes: [
    ...AVANT,
    { etape: "preparation", titre: "Repository preparation", etat: "courante", dit: "The preparation PR awaits you: no other ticket leaves before its merge.", geste: { quoi: "Review and merge the preparation PR.", ou: "On GitHub.", liens: [PR] } },
    A_VENIR,
  ],
  preparation: { ticket: 433, url: TICKET, etat: "a-relire", raison: null, prochainEssai: null, pr: PR },
};
const A_LA_PASS: DuRuntime = {
  ...A_RELIRE,
  etapes: [...AVANT, { etape: "preparation", titre: "Repository preparation", etat: "courante", dit: "The pass judges the preparation PR of #433.", geste: null }, A_VENIR],
};
const PRET: DuRuntime = {
  etat: "pret",
  termine: true,
  courante: "premier-ticket",
  etapes: [
    ...AVANT,
    { etape: "preparation", titre: "Repository preparation", etat: "faite", dit: `#433 is merged: ${REPOSITORY} is prepared.`, geste: null },
    { etape: "premier-ticket", titre: "First ticket", etat: "courante", dit: "mirrorlab is ready: post your first ticket with the `fire` label.", geste: { quoi: "Post your first ticket with the `fire` label.", ou: `On GitHub, in the issues of ${REPOSITORY}.`, liens: [NOUVELLE] } },
  ],
  preparation: { ticket: 433, url: TICKET, etat: "faite", raison: null, prochainEssai: null, pr: PR },
  sansBacASable: false,
  decisionAttendue: false,
};

// La machine sans bac à sable : le runtime attend le chef (runtime/src/onboarding/etat.ts, `etapeMachine`).
const SANS_BAC: DuRuntime = {
  etat: "en-cours",
  termine: false,
  courante: "machine",
  etapes: [
    AVANT[0] as DuRuntime["etapes"][number],
    { etape: "machine", titre: "Cooking machine", etat: "courante", dit: `box has no sandbox: if you continue, its cooks run in ${DIT_MODE_RESTREINT} Nothing is launched for mirrorlab until you choose.`, geste: { quoi: "Continue without a sandbox on box, or choose another station for mirrorlab.", ou: "In the app, on the project's page.", liens: [] } },
    { etape: "preparation", titre: "Repository preparation", etat: "a-venir", dit: `box opens the ticket that prepares ${REPOSITORY}.`, geste: null },
    A_VENIR,
  ],
  preparation: null,
  sansBacASable: true,
  decisionAttendue: true,
};

// L'onboarding tel que l'app le lit dans le suivi que la station écrit (runtime/src/projets/demande.ts).
const suivi = (onboarding: Record<string, unknown>) => JSON.stringify({ brigade: "projets-suivi", format: 1, a: "2026-10-13T10:00:00.000Z", projets: [], onboarding });
const lu = (onboarding: DuRuntime): Onboarding => lireOnboarding(suivi({ mirrorlab: onboarding })).mirrorlab ?? assert.fail("onboarding illisible");

function pose(onboarding: Onboarding | null, maintenant = MAINTENANT) {
  const ouverts: string[] = [];
  let ecarte = 0;
  const section = poserJourney(doc, { projet: "mirrorlab", onboarding, maintenant, ouvrir: (url: string) => ouverts.push(url), ecarter: () => ecarte++ }) as Faux | null;
  return { section, ouverts, ecartes: () => ecarte };
}
const classe = (ou: Faux, name: string) => [...ou.descendants()].filter((element) => element.className.split(" ").includes(name));
const une = (ou: Faux, name: string) => classe(ou, name)[0] ?? assert.fail(`pas de « .${name} »`);
const button = (ou: Faux, texte: string) => ou.dessous("button").find((candidat) => candidat.textContent === texte) ?? assert.fail(`pas de bouton « ${texte} »`);
// Chaque étape : son nom, son état, et sa ligne de titre — le titre, puis ce que dit son état.
const steps = (section: Faux) => section.dessous("li").map((li) => ({ etape: li.dataset.etape, etat: li.dataset.etat, ligne: une(li, "titre").textContent }));

describe("lire l'onboarding dans le suivi d'une station", () => {
  test("tel que le runtime l'écrit, il se relit à l'identique ; absent, illisible ou d'une station d'avant, rien", () => {
    for (const onboarding of [EN_COURS, EN_FAILURE, A_RELIRE, PRET]) assert.deepEqual(lu(onboarding), onboarding);
    assert.deepEqual(lireOnboarding(undefined), {});
    assert.deepEqual(lireOnboarding("{"), {});
    assert.deepEqual(lireOnboarding(JSON.stringify({ brigade: "projets-suivi", format: 1, projets: [] })), {});
    assert.deepEqual(lireOnboarding(suivi({ mirrorlab: { etat: "bizarre", etapes: [] } })), {});
  });

  test("seules des pages de GitHub en sortent : un lien d'ailleurs est écarté", () => {
    const piege = "https://ailleurs.example/piege";
    const relu = lu({ ...A_RELIRE, etapes: A_RELIRE.etapes.map((step) => (step.geste === null ? step : { ...step, geste: { ...step.geste, liens: [piege, PR] } })), preparation: { ...(A_RELIRE.preparation ?? assert.fail()), url: piege, pr: piege } });
    assert.deepEqual(relu.etapes[2]?.geste?.liens, [PR]);
    assert.equal(relu.preparation, null, "un ticket sans lien GitHub ne se montre pas");
  });
});

describe("le parcours, posé", () => {
  test("en cours : les quatre étapes dans l'ordre, la courante marquée, celles à venir dites à venir ; le ticket de préparation, son état, son lien", () => {
    const { section, ouverts } = pose(lu(EN_COURS));
    assert.ok(section);
    assert.equal(section.className, "parcours");
    assert.equal(une(section, "attendu").textContent, "Nothing to do: mirrorlab is being set up — step 3 of 4, repository preparation.");
    assert.deepEqual(
      steps(section).map(({ etape: step, etat: state, ligne: line }) => [step, state, line]),
      [
        ["depot", "faite", "Repositorydone"],
        ["machine", "faite", "Cooking machinedone"],
        ["preparation", "courante", "Repository preparationnow"],
        ["premier-ticket", "a-venir", "First ticketto come"],
      ],
    );
    const lis = section.dessous("li");
    assert.deepEqual(lis.map(({ ariaCurrent }) => ariaCurrent), ["", "", "step", ""]);
    // Une phrase par étape, ce qui s'y passe.
    assert.deepEqual(
      lis.map((li) => une(li, "dit").textContent),
      [`${REPOSITORY} is authorized and cloned on box.`, "box cooks mirrorlab.", `A cook on box prepares ${REPOSITORY} (#433).`, `Once ${REPOSITORY} is prepared, post your first ticket with the fire label.`],
    );
    // Le label `fire` est posé en code, pas entre accents graves.
    assert.equal(lis[3]?.dessous("code")[0]?.textContent, "fire");
    const preparation = lis[2] ?? assert.fail();
    assert.equal(une(preparation, "etat-de-preparation").textContent, "in progress");
    button(preparation, "#433").click();
    assert.deepEqual(ouverts, [TICKET]);
    assert.equal(classe(section, "echec").length, 0);
    assert.doesNotMatch(section.textContent, /within a minute/);
  });

  test("en échec : l'échec prend la place du vide — la raison en une phrase, l'heure du prochain essai — et l'en-tête le dit", () => {
    const { section } = pose(lu(EN_FAILURE));
    assert.ok(section);
    assert.equal(une(section, "attendu").textContent, "The preparation of mirrorlab failed: nothing to do, it is retried by itself.");
    const preparation = section.dessous("li")[2] ?? assert.fail();
    assert.equal(une(preparation, "etat-de-preparation").textContent, STATES_DE_PREPARATION["en-echec"]);
    const failure = une(preparation, "echec");
    const heure = new Date("2026-10-13T10:14:00.000Z").toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    // Une ligne d'erreur : la raison en une phrase, l'heure du prochain essai au survol.
    assert.equal(failure.dataset.ligne, "erreur");
    assert.equal(failure.children[0]?.textContent, "The worktree setup of the project fails.");
    assert.equal(failure.dessous("button")[0]?.ariaLabel, `Next retry at ${heure}, in 10 min.`);
    // La phrase de l'étape ne redit pas l'échec au-dessus de lui.
    assert.equal(classe(preparation, "dit").length, 0);
    button(preparation, "#433");
  });

  test("aucun délai ne s'annonce passé son heure : l'essai est dû, et sans essai prévu, la ligne le dit", () => {
    assert.equal(prochainTrialDit("2026-10-13T10:14:00.000Z", Date.parse("2026-10-13T10:15:00.000Z")), "Its retry is due now.");
    assert.equal(prochainTrialDit("2026-10-13T10:14:00.000Z", Date.parse("2026-10-13T10:13:30.000Z")).endsWith(", in 1 min."), true);
    assert.equal(prochainTrialDit(null, MAINTENANT), "It is not retried by itself.");
    const pass = pose(lu(EN_FAILURE), Date.parse("2026-10-13T11:00:00.000Z")).section ?? assert.fail();
    assert.equal(une(pass, "echec").dessous("button")[0]?.ariaLabel, "Its retry is due now.");
    assert.doesNotMatch(pass.textContent, /Next retry|in \d+ min/);
    const sansTrial = pose(lu({ ...EN_FAILURE, preparation: { ...(EN_FAILURE.preparation ?? assert.fail()), prochainEssai: null } })).section ?? assert.fail();
    assert.equal(une(sansTrial, "attendu").textContent, "The preparation of mirrorlab failed: it is not retried by itself.");
  });

  test("à relire : le geste attendu en tête, son bouton — recommandé — et où le faire ; le ticket, son état, et sa PR une seule fois", () => {
    const { section, ouverts } = pose(lu(A_RELIRE));
    assert.ok(section);
    assert.equal(une(section, "attendu").textContent, "Review and merge the preparation PR.");
    const preparation = section.dessous("li")[2] ?? assert.fail();
    const action = une(preparation, "geste");
    const merger = button(action, "Review and merge the preparation PR");
    assert.equal(merger.className, "recommande");
    assert.equal(une(action, "ou").textContent, "On GitHub.");
    assert.equal(une(preparation, "etat-de-preparation").textContent, "to review");
    assert.equal(preparation.dessous("button").filter(({ textContent }) => textContent === OUVRIR_LA_PR).length, 0, "le geste ouvre déjà la PR");
    merger.click();
    button(preparation, "#433").click();
    assert.deepEqual(ouverts, [PR, TICKET]);

    // À la pass, rien n'attend le chef : la PR s'ouvre depuis la ligne du ticket.
    const pass = pose(lu(A_LA_PASS));
    const line = (pass.section ?? assert.fail()).dessous("li")[2] ?? assert.fail();
    assert.equal(une(line, "etat-de-preparation").textContent, "to review");
    button(line, OUVRIR_LA_PR).click();
    assert.deepEqual(pass.ouverts, [PR]);
    assert.equal(classe(line, "geste").length, 0);
  });

  test("prêt : la phrase avec le nom du projet, le premier ticket à poser d'un bouton, et « dismiss » ; son premier ticket posé, ou sans onboarding, rien", () => {
    const { section, ouverts, ecartes } = pose(lu(PRET));
    assert.ok(section);
    assert.equal(section.className, "parcours pret");
    const tete = une(section, "attendu");
    assert.equal(tete.textContent, "mirrorlab is ready: post your first ticket with the fire label");
    assert.equal(tete.dessous("code")[0]?.textContent, "fire");
    assert.equal(section.dessous("li").length, 0, "prêt, les étapes ne se montrent plus");
    const poser = button(section, POSER_LE_FIRST);
    assert.equal(poser.className, "recommande");
    poser.click();
    assert.deepEqual(ouverts, [NOUVELLE]);
    button(section, ECARTER).click();
    assert.equal(ecartes(), 1);

    const served: DuRuntime = { ...PRET, courante: null, etapes: PRET.etapes.map((step): DuRuntime["etapes"][number] => (step.etape === "premier-ticket" ? { ...step, etat: "faite", dit: "#434 is on the rail: the kitchen serves it.", geste: null } : step)) };
    assert.equal(pose(lu(served)).section, null);
    assert.equal(pose(null).section, null);
  });
});

// La page de « mirrorlab », confiée à sa box, telle que la vue la joue.
const A = "2026-10-13T10:04:00.000Z";
const BOX = { id: "g1", nom: "box", machine: "Linux 6.1.0", coeurs: 8, etat: "en-ligne", ligne: "online · version 1.4.0 · 1 project: mirrorlab", pannes: [] as Outage[], dit: "online", version: "1.4.0", projets: [] as string[], max: null } as const;
const STATIONS: VuDesStations = { a: A, stations: [BOX] };
const MIRRORLAB: Project = { nom: "mirrorlab", dossier: "/tmp/mirrorlab", depot: REPOSITORY, base: "main" };
const CANTINE: Project = { nom: "cantine", dossier: "/tmp/cantine", depot: "benomite/cantine", base: "main" };
const vuAvec = (onboarding: DuRuntime | null): VuDesProjects => ({
  a: A,
  projets: [{ nom: "mirrorlab", depot: REPOSITORY, base: "main", suiviPar: { id: "g1", nom: "box" }, stations: [{ id: "g1", nom: "box", etat: "servi", dit: "served by box", autoriser: [] }], servi: null, ...(onboarding === null ? {} : { onboarding: lu(onboarding) }) }],
  recommandee: "g1",
  avertissements: {},
  machines: { g1: machineProposee(BOX) },
  calibrage: calibrationRecommande([]),
});
const demarrage = (projectsDesStations: VuDesProjects) => ({
  configuration: pourLaBar({ chemin: "/tmp/app.json", projets: [MIRRORLAB, CANTINE] }),
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS,
  rubriques: RUBRIQUES,
  gestes: { allumage: ALLUMAGE, cuisine: KITCHEN_ACTIONS, directs: DIRECTS, confirmes: CONFIRMES },
  banniere: BANNIERE,
  calibrage: { modeles: MODELES, efforts: EFFORTS },
  code: undefined,
  stations: STATIONS,
  projetsDesStations: projectsDesStations,
});

async function laPage(onboarding: DuRuntime | null, answers: Record<string, () => unknown> = {}) {
  const jouee = await jouerLaVue({ ...answers, demarrage: () => demarrage(vuAvec(onboarding)), espace: () => [], autoriserSurGitHub: () => true, confierAUneStation: () => ({ ajoute: "mirrorlab" }) });
  const ouvrir = async (rang: number) => {
    (jouee.element("projets").children.at(rang) ?? assert.fail(`pas de case n° ${rang}`)).click();
    await repos();
  };
  await ouvrir(1);
  assert.equal(jouee.element("espace").textContent, "mirrorlab");
  const bloc = jouee.element("stations-du-projet");
  const journey = () => classe(bloc, "parcours").filter((section) => !(section.parentElement?.hidden ?? false))[0];
  return { jouee, bloc, parcours: journey, ouvrir };
}

describe("la décision devant une station sans bac à sable", () => {
  test("l'avertissement dit que les cooks tournent sans bac à sable et que rien ne part avant le choix ; deux boutons, chacun son geste", () => {
    let continues = 0;
    let autres = 0;
    const section = poserJourney(doc, { projet: "mirrorlab", onboarding: lu(SANS_BAC), maintenant: MAINTENANT, ouvrir: () => {}, ecarter: () => {}, continuerSansBac: () => continues++, autreStation: () => autres++ }) as Faux;
    assert.match(une(section, "avertissement").textContent, /no sandbox.*Nothing is launched for mirrorlab until you choose/);
    assert.equal(une(section, "avertissement").role, "alert");
    assert.match(une(section, "attendu").textContent, /Continue without a sandbox on box, or choose another station/);
    assert.deepEqual(section.dessous("button").map((b) => b.textContent), [AUTRE_STATION, CONTINUER_SANS_BAC]);
    assert.ok(button(section, AUTRE_STATION).className.split(" ").includes("recommande"));
    button(section, CONTINUER_SANS_BAC).click();
    assert.deepEqual([continues, autres], [1, 0]);
    button(section, AUTRE_STATION).click();
    assert.deepEqual([continues, autres], [1, 1]);
  });

  test("sans décision attendue, ni avertissement ni ces boutons", () => {
    const { section } = pose(lu({ ...SANS_BAC, decisionAttendue: false }));
    assert.equal(classe(section ?? assert.fail(), "avertissement").length, 0);
    assert.equal((section as Faux).dessous("button").length, 0);
  });

  test("sur la page : « continue without sandbox » part au process principal, puis l'avertissement et les boutons s'en vont et la préparation devient la courante", async () => {
    const { jouee, bloc, parcours: journey } = await laPage(SANS_BAC, { continuerSansBacASable: () => ({ fait: "continuing without a sandbox on box: mirrorlab starts on its next turn" }) });
    assert.equal(classe(journey() ?? assert.fail(), "avertissement").length, 1);
    button(bloc, CONTINUER_SANS_BAC).click();
    await repos();
    assert.deepEqual(jouee.dernier("continuerSansBacASable"), ["mirrorlab"]);
    const section = journey() ?? assert.fail();
    assert.equal(classe(section, "avertissement").length, 0);
    assert.equal(section.dessous("button").some((b) => [AUTRE_STATION, CONTINUER_SANS_BAC].includes(b.textContent)), false);
    assert.equal(une(section, "courante").dataset.etape, "preparation");
    assert.equal(section.dessous("li").find((li) => li.dataset.etape === "machine")?.dataset.etat, "faite");
    assert.match(bloc.textContent, /continuing without a sandbox on box/);
  });

  test("sur la page : refusé, l'avertissement et les deux boutons restent, et la raison se lit sous la ligne", async () => {
    const { bloc, parcours: journey } = await laPage(SANS_BAC, { continuerSansBacASable: () => ({ refus: "the choice could not be recorded: nothing was changed" }) });
    button(bloc, CONTINUER_SANS_BAC).click();
    await repos();
    const section = journey() ?? assert.fail();
    assert.equal(classe(section, "avertissement").length, 1);
    assert.equal(une(section, "courante").dataset.etape, "machine");
    assert.match(bloc.textContent, /nothing was changed/);
  });

  test("sur la page : « choose another station » ouvre le choix des machines", async () => {
    const { bloc } = await laPage(SANS_BAC);
    button(bloc, AUTRE_STATION).click();
    await repos();
    assert.equal(bloc.dessous("button").some((b) => b.textContent === "Cancel"), true);
  });

  test("la station publie la décision prise : l'avertissement s'en va et le parcours passe à la préparation", async () => {
    const { jouee, parcours: journey } = await laPage(SANS_BAC);
    jouee.dire("surProjetsDesStations", vuAvec(EN_COURS));
    await repos();
    const section = journey() ?? assert.fail();
    assert.equal(classe(section, "avertissement").length, 0);
    assert.equal(une(section, "courante").dataset.etape, "preparation");
  });
});

describe("le parcours, sur la page du projet", () => {
  test("il remplace le vide sous la ligne de ses stations : ses étapes, et le ticket de préparation s'ouvre sur GitHub", async () => {
    const { jouee, parcours: journey } = await laPage(EN_FAILURE);
    const section = journey() ?? assert.fail("pas de parcours");
    assert.equal(section.dessous("li").length, 4);
    assert.match(une(section, "echec").textContent, /^The worktree setup of the project fails\./);
    button(section, "#433").click();
    await repos();
    assert.deepEqual(jouee.dernier("autoriserSurGitHub"), [TICKET]);
  });

  test("la station le relit : la page suit son état, sans rien redemander", async () => {
    const { jouee, parcours: journey } = await laPage(EN_COURS);
    assert.equal(une(journey() ?? assert.fail(), "etat-de-preparation").textContent, "in progress");
    jouee.dire("surProjetsDesStations", vuAvec(A_RELIRE));
    await repos();
    assert.equal(une(journey() ?? assert.fail(), "etat-de-preparation").textContent, "to review");
  });

  test("sans onboarding publié, aucun parcours ne se pose", async () => {
    const { parcours: journey } = await laPage(null);
    assert.equal(journey(), undefined);
  });

  test("« within a minute » ne se dit plus une fois le parcours publié : c'est lui qui dit où en est le projet", async () => {
    const { jouee, bloc } = await laPage(null);
    jouee.dire("surProjetsDesStations", { ...vuAvec(null), projets: [] });
    await repos();
    button(bloc, "choose its machine").click();
    await repos();
    const formulaire = bloc.dessous("form")[0] ?? assert.fail("pas de formulaire");
    await Promise.all(formulaire.declencher("submit"));
    await repos();
    assert.match(bloc.textContent, /within a minute/);
    jouee.dire("surProjetsDesStations", vuAvec(EN_COURS));
    await repos();
    assert.doesNotMatch(bloc.textContent, /within a minute/);
  });

  test("prêt : la phrase se montre, puis plus jamais une fois écartée", async () => {
    const { parcours: journey } = await laPage(PRET);
    const section = journey() ?? assert.fail("pas de parcours prêt");
    assert.equal(une(section, "attendu").textContent, "mirrorlab is ready: post your first ticket with the fire label");
    button(section, ECARTER).click();
    await repos();
    assert.equal(journey(), undefined);
  });

  test("prêt : vu, puis la page quittée, il ne revient pas à la visite suivante", async () => {
    const { parcours: journey, ouvrir } = await laPage(PRET);
    assert.ok(journey());
    await ouvrir(2);
    await ouvrir(1);
    assert.equal(journey(), undefined);
  });
});
