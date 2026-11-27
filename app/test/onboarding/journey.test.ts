// Le parcours d'un projet neuf sur sa page (#1111, épique 1108) : ses quatre étapes telles que sa
// station principale les publie (#1110), la courante marquée, celles à venir dites à venir, une phrase
// par étape et le geste attendu en bouton ; le ticket de préparation, son état et son lien ; en échec,
// la raison et l'heure du prochain essai ; prêt, la phrase qui invite au premier ticket, puis plus
// rien une fois écartée ou à la visite suivante. Les onboardings sont écrits dans la forme même du
// runtime (`Onboarding`), et relus par `lireOnboarding` comme l'app relit le suivi d'une station.
import { DIT_MODE_RESTREINT } from "../../../runtime/src/onboarding/mode-restreint.ts";
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { Onboarding as OfRuntime } from "../../../runtime/src/onboarding/etat.ts";
import { forTheBar } from "../../src/bar.ts";
import { EXAMPLE, type Project } from "../../src/config.ts";
import { PALETTE } from "../../src/colors.ts";
import { BANNER } from "../../src/facts.ts";
import { TABS, HEADINGS } from "../../src/tabs.ts";
import type { Outage } from "../../src/outages/outages.ts";
import { readOnboarding, type Onboarding } from "../../src/projects/request.ts";
import { calibrationRecommended, EFFORTS, machineProposed, MODELS, type SeenOfProjects } from "../../src/projects/projects.ts";
import type { SeenOfStations } from "../../src/stations/stations.ts";
import { OTHER_STATION, CONTINUE_WITHOUT_SANDBOX, SET_ASIDE, STATES_OF_PREPARATION, OPEN_THE_PR, SET_THE_FIRST, setJourney, nextTrialSays } from "../../src/vue/onboarding/journey.js";
import { Fake, playTheVue, repos } from "../helpers/false-vue.ts";

const doc = { createElement: (balise: string) => new Fake(balise) };
const NOW = Date.parse("2026-10-13T10:04:00.000Z");
const REPOSITORY = "BOBL-tech/mirrorlab";
const TICKET = `https://github.com/${REPOSITORY}/issues/433`;
const PR = `https://github.com/${REPOSITORY}/pull/440`;
const NEW = `https://github.com/${REPOSITORY}/issues/new`;

// Les étapes telles que le runtime les écrit (runtime/src/onboarding/etat.ts), la préparation courante.
const BEFORE: OfRuntime["etapes"] = [
  { etape: "depot", titre: "Repository", etat: "faite", dit: `${REPOSITORY} is authorized and cloned on box.`, geste: null },
  { etape: "machine", titre: "Cooking machine", etat: "faite", dit: "box cooks mirrorlab.", geste: null },
];
const A_COME: OfRuntime["etapes"][number] = { etape: "premier-ticket", titre: "First ticket", etat: "a-venir", dit: `Once ${REPOSITORY} is prepared, post your first ticket with the \`fire\` label.`, geste: null };
const IN_PROGRESS: OfRuntime = {
  etat: "en-cours",
  termine: false,
  courante: "preparation",
  etapes: [...BEFORE, { etape: "preparation", titre: "Repository preparation", etat: "courante", dit: `A cook on box prepares ${REPOSITORY} (#433).`, geste: null }, A_COME],
  preparation: { ticket: 433, url: TICKET, etat: "en-cours", raison: null, prochainEssai: null, pr: null },
  sansBacASable: false,
  decisionAttendue: false,
};
const IN_FAILURE: OfRuntime = {
  ...IN_PROGRESS,
  etapes: [...BEFORE, { etape: "preparation", titre: "Repository preparation", etat: "courante", dit: "The cook of #433 failed — the worktree setup of the project fails; it is retried by itself.", geste: null }, A_COME],
  preparation: { ticket: 433, url: TICKET, etat: "en-echec", raison: "The worktree setup of the project fails.", prochainEssai: "2026-10-13T10:14:00.000Z", pr: null },
};
const A_REREAD: OfRuntime = {
  ...IN_PROGRESS,
  etapes: [
    ...BEFORE,
    { etape: "preparation", titre: "Repository preparation", etat: "courante", dit: "The preparation PR awaits you: no other ticket leaves before its merge.", geste: { quoi: "Review and merge the preparation PR.", ou: "On GitHub.", liens: [PR] } },
    A_COME,
  ],
  preparation: { ticket: 433, url: TICKET, etat: "a-relire", raison: null, prochainEssai: null, pr: PR },
};
const AT_THE_PASS: OfRuntime = {
  ...A_REREAD,
  etapes: [...BEFORE, { etape: "preparation", titre: "Repository preparation", etat: "courante", dit: "The pass judges the preparation PR of #433.", geste: null }, A_COME],
};
const READY: OfRuntime = {
  etat: "pret",
  termine: true,
  courante: "premier-ticket",
  etapes: [
    ...BEFORE,
    { etape: "preparation", titre: "Repository preparation", etat: "faite", dit: `#433 is merged: ${REPOSITORY} is prepared.`, geste: null },
    { etape: "premier-ticket", titre: "First ticket", etat: "courante", dit: "mirrorlab is ready: post your first ticket with the `fire` label.", geste: { quoi: "Post your first ticket with the `fire` label.", ou: `On GitHub, in the issues of ${REPOSITORY}.`, liens: [NEW] } },
  ],
  preparation: { ticket: 433, url: TICKET, etat: "faite", raison: null, prochainEssai: null, pr: PR },
  sansBacASable: false,
  decisionAttendue: false,
};

// La machine sans bac à sable : le runtime attend le chef (runtime/src/onboarding/etat.ts, `etapeMachine`).
const WITHOUT_SANDBOX: OfRuntime = {
  etat: "en-cours",
  termine: false,
  courante: "machine",
  etapes: [
    BEFORE[0] as OfRuntime["etapes"][number],
    { etape: "machine", titre: "Cooking machine", etat: "courante", dit: `box has no sandbox: if you continue, its cooks run in ${DIT_MODE_RESTREINT} Nothing is launched for mirrorlab until you choose.`, geste: { quoi: "Continue without a sandbox on box, or choose another station for mirrorlab.", ou: "In the app, on the project's page.", liens: [] } },
    { etape: "preparation", titre: "Repository preparation", etat: "a-venir", dit: `box opens the ticket that prepares ${REPOSITORY}.`, geste: null },
    A_COME,
  ],
  preparation: null,
  sansBacASable: true,
  decisionAttendue: true,
};

// L'onboarding tel que l'app le lit dans le suivi que la station écrit (runtime/src/projets/demande.ts).
const tracking = (onboarding: Record<string, unknown>) => JSON.stringify({ brigade: "projets-suivi", format: 1, a: "2026-10-13T10:00:00.000Z", projets: [], onboarding });
const readOne = (onboarding: OfRuntime): Onboarding => readOnboarding(tracking({ mirrorlab: onboarding })).mirrorlab ?? assert.fail("onboarding illisible");

function pose(onboarding: Onboarding | null, now = NOW) {
  const openOnes: string[] = [];
  let ecarte = 0;
  const section = setJourney(doc, { projet: "mirrorlab", onboarding, maintenant: now, ouvrir: (url: string) => openOnes.push(url), ecarter: () => ecarte++ }) as Fake | null;
  return { section, ouverts: openOnes, ecartes: () => ecarte };
}
const classe = (or: Fake, name: string) => [...or.descendants()].filter((element) => element.className.split(" ").includes(name));
const one = (or: Fake, name: string) => classe(or, name)[0] ?? assert.fail(`pas de « .${name} »`);
const button = (or: Fake, text: string) => or.dessous("button").find((candidate) => candidate.textContent === text) ?? assert.fail(`pas de bouton « ${text} »`);
// Chaque étape : son nom, son état, et sa ligne de titre — le titre, puis ce que dit son état.
const steps = (section: Fake) => section.dessous("li").map((li) => ({ etape: li.dataset.etape, etat: li.dataset.etat, ligne: one(li, "titre").textContent }));

describe("lire l'onboarding dans le suivi d'une station", () => {
  test("tel que le runtime l'écrit, il se relit à l'identique ; absent, illisible ou d'une station d'avant, rien", () => {
    for (const onboarding of [IN_PROGRESS, IN_FAILURE, A_REREAD, READY]) assert.deepEqual(readOne(onboarding), onboarding);
    assert.deepEqual(readOnboarding(undefined), {});
    assert.deepEqual(readOnboarding("{"), {});
    assert.deepEqual(readOnboarding(JSON.stringify({ brigade: "projets-suivi", format: 1, projets: [] })), {});
    assert.deepEqual(readOnboarding(tracking({ mirrorlab: { etat: "bizarre", etapes: [] } })), {});
  });

  test("seules des pages de GitHub en sortent : un lien d'ailleurs est écarté", () => {
    const trap = "https://ailleurs.example/piege";
    const reread = readOne({ ...A_REREAD, etapes: A_REREAD.etapes.map((step) => (step.geste === null ? step : { ...step, geste: { ...step.geste, liens: [trap, PR] } })), preparation: { ...(A_REREAD.preparation ?? assert.fail()), url: trap, pr: trap } });
    assert.deepEqual(reread.etapes[2]?.geste?.liens, [PR]);
    assert.equal(reread.preparation, null, "un ticket sans lien GitHub ne se montre pas");
  });
});

describe("le parcours, posé", () => {
  test("en cours : les quatre étapes dans l'ordre, la courante marquée, celles à venir dites à venir ; le ticket de préparation, son état, son lien", () => {
    const { section, ouverts: openOnes } = pose(readOne(IN_PROGRESS));
    assert.ok(section);
    assert.equal(section.className, "parcours");
    assert.equal(one(section, "attendu").textContent, "Nothing to do: mirrorlab is being set up — step 3 of 4, repository preparation.");
    assert.deepEqual(
      steps(section).map(({ etape: step, etat: state, ligne: line }) => [step, state, line]),
      [
        ["depot", "faite", "Repositorydone"],
        ["machine", "faite", "Cooking machinedone"],
        ["preparation", "courante", "Repository preparationnow"],
        ["premier-ticket", "a-venir", "First ticketto come"],
      ],
    );
    const reads = section.dessous("li");
    assert.deepEqual(reads.map(({ ariaCurrent }) => ariaCurrent), ["", "", "step", ""]);
    // Une phrase par étape, ce qui s'y passe.
    assert.deepEqual(
      reads.map((li) => one(li, "dit").textContent),
      [`${REPOSITORY} is authorized and cloned on box.`, "box cooks mirrorlab.", `A cook on box prepares ${REPOSITORY} (#433).`, `Once ${REPOSITORY} is prepared, post your first ticket with the fire label.`],
    );
    // Le label `fire` est posé en code, pas entre accents graves.
    assert.equal(reads[3]?.dessous("code")[0]?.textContent, "fire");
    const preparation = reads[2] ?? assert.fail();
    assert.equal(one(preparation, "etat-de-preparation").textContent, "in progress");
    button(preparation, "#433").click();
    assert.deepEqual(openOnes, [TICKET]);
    assert.equal(classe(section, "echec").length, 0);
    assert.doesNotMatch(section.textContent, /within a minute/);
  });

  test("en échec : l'échec prend la place du vide — la raison en une phrase, l'heure du prochain essai — et l'en-tête le dit", () => {
    const { section } = pose(readOne(IN_FAILURE));
    assert.ok(section);
    assert.equal(one(section, "attendu").textContent, "The preparation of mirrorlab failed: nothing to do, it is retried by itself.");
    const preparation = section.dessous("li")[2] ?? assert.fail();
    assert.equal(one(preparation, "etat-de-preparation").textContent, STATES_OF_PREPARATION["en-echec"]);
    const failure = one(preparation, "echec");
    const hour = new Date("2026-10-13T10:14:00.000Z").toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    // Une ligne d'erreur : la raison en une phrase, l'heure du prochain essai au survol.
    assert.equal(failure.dataset.ligne, "erreur");
    assert.equal(failure.children[0]?.textContent, "The worktree setup of the project fails.");
    assert.equal(failure.dessous("button")[0]?.ariaLabel, `Next retry at ${hour}, in 10 min.`);
    // La phrase de l'étape ne redit pas l'échec au-dessus de lui.
    assert.equal(classe(preparation, "dit").length, 0);
    button(preparation, "#433");
  });

  test("aucun délai ne s'annonce passé son heure : l'essai est dû, et sans essai prévu, la ligne le dit", () => {
    assert.equal(nextTrialSays("2026-10-13T10:14:00.000Z", Date.parse("2026-10-13T10:15:00.000Z")), "Its retry is due now.");
    assert.equal(nextTrialSays("2026-10-13T10:14:00.000Z", Date.parse("2026-10-13T10:13:30.000Z")).endsWith(", in 1 min."), true);
    assert.equal(nextTrialSays(null, NOW), "It is not retried by itself.");
    const pass = pose(readOne(IN_FAILURE), Date.parse("2026-10-13T11:00:00.000Z")).section ?? assert.fail();
    assert.equal(one(pass, "echec").dessous("button")[0]?.ariaLabel, "Its retry is due now.");
    assert.doesNotMatch(pass.textContent, /Next retry|in \d+ min/);
    const withoutTrial = pose(readOne({ ...IN_FAILURE, preparation: { ...(IN_FAILURE.preparation ?? assert.fail()), prochainEssai: null } })).section ?? assert.fail();
    assert.equal(one(withoutTrial, "attendu").textContent, "The preparation of mirrorlab failed: it is not retried by itself.");
  });

  test("à relire : le geste attendu en tête, son bouton — recommandé — et où le faire ; le ticket, son état, et sa PR une seule fois", () => {
    const { section, ouverts: openOnes } = pose(readOne(A_REREAD));
    assert.ok(section);
    assert.equal(one(section, "attendu").textContent, "Review and merge the preparation PR.");
    const preparation = section.dessous("li")[2] ?? assert.fail();
    const action = one(preparation, "geste");
    const merger = button(action, "Review and merge the preparation PR");
    assert.equal(merger.className, "recommande");
    assert.equal(one(action, "ou").textContent, "On GitHub.");
    assert.equal(one(preparation, "etat-de-preparation").textContent, "to review");
    assert.equal(preparation.dessous("button").filter(({ textContent }) => textContent === OPEN_THE_PR).length, 0, "le geste ouvre déjà la PR");
    merger.click();
    button(preparation, "#433").click();
    assert.deepEqual(openOnes, [PR, TICKET]);

    // À la pass, rien n'attend le chef : la PR s'ouvre depuis la ligne du ticket.
    const pass = pose(readOne(AT_THE_PASS));
    const line = (pass.section ?? assert.fail()).dessous("li")[2] ?? assert.fail();
    assert.equal(one(line, "etat-de-preparation").textContent, "to review");
    button(line, OPEN_THE_PR).click();
    assert.deepEqual(pass.ouverts, [PR]);
    assert.equal(classe(line, "geste").length, 0);
  });

  test("prêt : la phrase avec le nom du projet, le premier ticket à poser d'un bouton, et « dismiss » ; son premier ticket posé, ou sans onboarding, rien", () => {
    const { section, ouverts: openOnes, ecartes } = pose(readOne(READY));
    assert.ok(section);
    assert.equal(section.className, "parcours pret");
    const head = one(section, "attendu");
    assert.equal(head.textContent, "mirrorlab is ready: post your first ticket with the fire label");
    assert.equal(head.dessous("code")[0]?.textContent, "fire");
    assert.equal(section.dessous("li").length, 0, "prêt, les étapes ne se montrent plus");
    const set = button(section, SET_THE_FIRST);
    assert.equal(set.className, "recommande");
    set.click();
    assert.deepEqual(openOnes, [NEW]);
    button(section, SET_ASIDE).click();
    assert.equal(ecartes(), 1);

    const served: OfRuntime = { ...READY, courante: null, etapes: READY.etapes.map((step): OfRuntime["etapes"][number] => (step.etape === "premier-ticket" ? { ...step, etat: "faite", dit: "#434 is on the rail: the kitchen serves it.", geste: null } : step)) };
    assert.equal(pose(readOne(served)).section, null);
    assert.equal(pose(null).section, null);
  });
});

// La page de « mirrorlab », confiée à sa box, telle que la vue la joue.
const A = "2026-10-13T10:04:00.000Z";
const BOX = { id: "g1", nom: "box", machine: "Linux 6.1.0", coeurs: 8, etat: "en-ligne", ligne: "online · version 1.4.0 · 1 project: mirrorlab", pannes: [] as Outage[], dit: "online", version: "1.4.0", projets: [] as string[], max: null } as const;
const STATIONS: SeenOfStations = { a: A, stations: [BOX] };
const MIRRORLAB: Project = { nom: "mirrorlab", dossier: "/tmp/mirrorlab", depot: REPOSITORY, base: "main" };
const CANTINE: Project = { nom: "cantine", dossier: "/tmp/cantine", depot: "benomite/cantine", base: "main" };
const seenWith = (onboarding: OfRuntime | null): SeenOfProjects => ({
  a: A,
  projets: [{ nom: "mirrorlab", depot: REPOSITORY, base: "main", suiviPar: { id: "g1", nom: "box" }, stations: [{ id: "g1", nom: "box", etat: "servi", dit: "served by box", autoriser: [] }], servi: null, ...(onboarding === null ? {} : { onboarding: readOne(onboarding) }) }],
  recommandee: "g1",
  avertissements: {},
  machines: { g1: machineProposed(BOX) },
  calibrage: calibrationRecommended([]),
});
const startup = (projectsOfStations: SeenOfProjects) => ({
  configuration: forTheBar({ chemin: "/tmp/app.json", projets: [MIRRORLAB, CANTINE] }),
  palette: PALETTE,
  exemple: EXAMPLE,
  onglets: TABS,
  rubriques: HEADINGS,
  gestes: {},
  banniere: BANNER,
  calibrage: { modeles: MODELS, efforts: EFFORTS },
  code: undefined,
  stations: STATIONS,
  projetsDesStations: projectsOfStations,
});

async function thePage(onboarding: OfRuntime | null, answers: Record<string, () => unknown> = {}) {
  const played = await playTheVue({ ...answers, demarrage: () => startup(seenWith(onboarding)), espace: () => [], autoriserSurGitHub: () => true, confierAUneStation: () => ({ ajoute: "mirrorlab" }) });
  const open = async (rank: number) => {
    (played.element("projets").children.at(rank) ?? assert.fail(`pas de case n° ${rank}`)).click();
    await repos();
  };
  await open(1);
  assert.equal(played.element("espace").textContent, "mirrorlab");
  const block = played.element("stations-du-projet");
  const journey = () => classe(block, "parcours").filter((section) => !(section.parentElement?.hidden ?? false))[0];
  return { jouee: played, bloc: block, parcours: journey, ouvrir: open };
}

describe("la décision devant une station sans bac à sable", () => {
  test("l'avertissement dit que les cooks tournent sans bac à sable et que rien ne part avant le choix ; deux boutons, chacun son geste", () => {
    let continues = 0;
    let others = 0;
    const section = setJourney(doc, { projet: "mirrorlab", onboarding: readOne(WITHOUT_SANDBOX), maintenant: NOW, ouvrir: () => {}, ecarter: () => {}, continuerSansBac: () => continues++, autreStation: () => others++ }) as Fake;
    assert.match(one(section, "avertissement").textContent, /no sandbox.*Nothing is launched for mirrorlab until you choose/);
    assert.equal(one(section, "avertissement").role, "alert");
    assert.match(one(section, "attendu").textContent, /Continue without a sandbox on box, or choose another station/);
    assert.deepEqual(section.dessous("button").map((b) => b.textContent), [OTHER_STATION, CONTINUE_WITHOUT_SANDBOX]);
    assert.ok(button(section, OTHER_STATION).className.split(" ").includes("recommande"));
    button(section, CONTINUE_WITHOUT_SANDBOX).click();
    assert.deepEqual([continues, others], [1, 0]);
    button(section, OTHER_STATION).click();
    assert.deepEqual([continues, others], [1, 1]);
  });

  test("sans décision attendue, ni avertissement ni ces boutons", () => {
    const { section } = pose(readOne({ ...WITHOUT_SANDBOX, decisionAttendue: false }));
    assert.equal(classe(section ?? assert.fail(), "avertissement").length, 0);
    assert.equal((section as Fake).dessous("button").length, 0);
  });

  test("sur la page : « continue without sandbox » part au process principal, puis l'avertissement et les boutons s'en vont et la préparation devient la courante", async () => {
    const { jouee: played, bloc: block, parcours: journey } = await thePage(WITHOUT_SANDBOX, { continuerSansBacASable: () => ({ fait: "continuing without a sandbox on box: mirrorlab starts on its next turn" }) });
    assert.equal(classe(journey() ?? assert.fail(), "avertissement").length, 1);
    button(block, CONTINUE_WITHOUT_SANDBOX).click();
    await repos();
    assert.deepEqual(played.dernier("continuerSansBacASable"), ["mirrorlab"]);
    const section = journey() ?? assert.fail();
    assert.equal(classe(section, "avertissement").length, 0);
    assert.equal(section.dessous("button").some((b) => [OTHER_STATION, CONTINUE_WITHOUT_SANDBOX].includes(b.textContent)), false);
    assert.equal(one(section, "courante").dataset.etape, "preparation");
    assert.equal(section.dessous("li").find((li) => li.dataset.etape === "machine")?.dataset.etat, "faite");
    assert.match(block.textContent, /continuing without a sandbox on box/);
  });

  test("sur la page : refusé, l'avertissement et les deux boutons restent, et la raison se lit sous la ligne", async () => {
    const { bloc: block, parcours: journey } = await thePage(WITHOUT_SANDBOX, { continuerSansBacASable: () => ({ refus: "the choice could not be recorded: nothing was changed" }) });
    button(block, CONTINUE_WITHOUT_SANDBOX).click();
    await repos();
    const section = journey() ?? assert.fail();
    assert.equal(classe(section, "avertissement").length, 1);
    assert.equal(one(section, "courante").dataset.etape, "machine");
    assert.match(block.textContent, /nothing was changed/);
  });

  test("sur la page : « choose another station » ouvre le choix des machines", async () => {
    const { bloc: block } = await thePage(WITHOUT_SANDBOX);
    button(block, OTHER_STATION).click();
    await repos();
    assert.equal(block.dessous("button").some((b) => b.textContent === "Cancel"), true);
  });

  test("la station publie la décision prise : l'avertissement s'en va et le parcours passe à la préparation", async () => {
    const { jouee: played, parcours: journey } = await thePage(WITHOUT_SANDBOX);
    played.dire("surProjetsDesStations", seenWith(IN_PROGRESS));
    await repos();
    const section = journey() ?? assert.fail();
    assert.equal(classe(section, "avertissement").length, 0);
    assert.equal(one(section, "courante").dataset.etape, "preparation");
  });
});

describe("le parcours, sur la page du projet", () => {
  test("il remplace le vide sous la ligne de ses stations : ses étapes, et le ticket de préparation s'ouvre sur GitHub", async () => {
    const { jouee: played, parcours: journey } = await thePage(IN_FAILURE);
    const section = journey() ?? assert.fail("pas de parcours");
    assert.equal(section.dessous("li").length, 4);
    assert.match(one(section, "echec").textContent, /^The worktree setup of the project fails\./);
    button(section, "#433").click();
    await repos();
    assert.deepEqual(played.dernier("autoriserSurGitHub"), [TICKET]);
  });

  test("la station le relit : la page suit son état, sans rien redemander", async () => {
    const { jouee: played, parcours: journey } = await thePage(IN_PROGRESS);
    assert.equal(one(journey() ?? assert.fail(), "etat-de-preparation").textContent, "in progress");
    played.dire("surProjetsDesStations", seenWith(A_REREAD));
    await repos();
    assert.equal(one(journey() ?? assert.fail(), "etat-de-preparation").textContent, "to review");
  });

  test("sans onboarding publié, aucun parcours ne se pose", async () => {
    const { parcours: journey } = await thePage(null);
    assert.equal(journey(), undefined);
  });

  test("« within a minute » ne se dit plus une fois le parcours publié : c'est lui qui dit où en est le projet", async () => {
    const { jouee: played, bloc: block } = await thePage(null);
    played.dire("surProjetsDesStations", { ...seenWith(null), projets: [] });
    await repos();
    button(block, "choose its machine").click();
    await repos();
    const form = block.dessous("form")[0] ?? assert.fail("pas de formulaire");
    await Promise.all(form.declencher("submit"));
    await repos();
    assert.match(block.textContent, /within a minute/);
    played.dire("surProjetsDesStations", seenWith(IN_PROGRESS));
    await repos();
    assert.doesNotMatch(block.textContent, /within a minute/);
  });

  test("prêt : la phrase se montre, puis plus jamais une fois écartée", async () => {
    const { parcours: journey } = await thePage(READY);
    const section = journey() ?? assert.fail("pas de parcours prêt");
    assert.equal(one(section, "attendu").textContent, "mirrorlab is ready: post your first ticket with the fire label");
    button(section, SET_ASIDE).click();
    await repos();
    assert.equal(journey(), undefined);
  });

  test("prêt : vu, puis la page quittée, il ne revient pas à la visite suivante", async () => {
    const { parcours: journey, ouvrir: open } = await thePage(READY);
    assert.ok(journey());
    await open(2);
    await open(1);
    assert.equal(journey(), undefined);
  });
});
