// Le bouton du refus, côté process principal (#1205) : l'app demande le remède à la principale du projet par
// son gist, avec l'opération du runtime (runtime/src/remedes/distant.ts), et la station le joue par son point
// d'entrée (runtime/src/remedes/executer.ts). Les gists sont en mémoire, et la station qui répond est celle du
// runtime : son répondeur et son point d'entrée, avec un registre qui ne porte qu'un remède de test. Le même
// chemin sert l'ordinateur du chef et une station distante : chaque test se joue contre l'une, puis l'autre.
import assert from "node:assert/strict";
import { test } from "node:test";
import { refus as refusalOfRuntime, type Refus as RefusalOfRuntime } from "../../../runtime/src/projets/refus.ts";
import { demanderLeRemede, FICHIER_REMEDES, repondeurDeRemedes } from "../../../runtime/src/remedes/distant.ts";
import { executerRemede } from "../../../runtime/src/remedes/executer.ts";
import { creerRegistre } from "../../../runtime/src/remedes/registre.ts";
import { documentOfRequest, FILE_PROJECTS, FILE_TRACKING, type ProjectRequest } from "../../src/projects/request.ts";
import { holdProjects, type SeenOfProjects } from "../../src/projects/projects.ts";
import { channelOfGists, type AskTheRemedy } from "../../src/projects/remedy.ts";
import type { Files, GitHubOfStations } from "../../src/stations/github.ts";
import type { StationVue } from "../../src/stations/stations.ts";

const BOX: StationVue = { id: "g1", nom: "parade-box", machine: "Linux 6.1.0", etat: "en-ligne", ligne: "online", pannes: [], dit: "online", version: "1.4.0", projets: [], max: null };
const MAC: StationVue = { id: "g2", nom: "macbook", machine: "macOS 25.0.0", etat: "en-ligne", ligne: "online", pannes: [], dit: "online", version: "1.4.0", projets: [], max: null };
const PARADE: ProjectRequest = { nom: "parade", depot: "benomite/parade", base: "main", principale: true, cooks: 2, manager: { modele: "sonnet", effort: "medium" }, reviewer: { modele: "opus", effort: "high" }, ouvertLe: null, demandeLe: null };
const NOW = Date.parse("2026-10-21T12:00:00Z");

// Une station et son remède de test : il retire la ligne de port, et la réévaluation dit si le refus tient.
function aKitchen(main: StationVue, { leve: lifted = true }: { leve?: boolean } = {}) {
  const gists = new Map<string, Files>([BOX, MAC].map(({ id }) => [id, {}]));
  const github: GitHubOfStations = {
    lister: async () => [],
    lire: async (id) => (gists.has(id) ? { ...gists.get(id) } : null),
    ecrire: async (id, files) => {
      const before = gists.get(id);
      if (before === undefined) throw new Error("this station's gist is no longer on GitHub");
      gists.set(id, { ...before, ...files });
    },
    supprimer: async () => {},
  };
  const played: string[] = [];
  const registry = creerRegistre([{ id: "remove-port", leve: ["proxy-port-set"], description: "Removes the network port setting from this project's line.", destructif: true, executer: () => void played.push("remove-port") }]);
  let refusal: RefusalOfRuntime | null = refusalOfRuntime("proxy-port-set", registry);
  // Ce que la station publie de « parade » : servi, ou refusé avec son refus.
  const publish = () => {
    const tracking = { nom: "parade", etat: refusal === null ? "servi" : "refuse", dit: "", autoriser: [], serviLe: null, cuitSur: main.nom, ici: main === MAC, bascule: null, ...(refusal === null ? {} : { refus: refusal }) };
    gists.set(main.id, { ...gists.get(main.id), [FILE_TRACKING]: JSON.stringify({ brigade: "projets-suivi", format: 1, a: new Date(NOW).toISOString(), projets: [tracking] }) });
  };
  gists.set(main.id, { [FILE_PROJECTS]: documentOfRequest([PARADE]) });
  publish();
  const responder = repondeurDeRemedes({
    executer: (request) =>
      executerRemede(request, {
        refusDe: () => refusal,
        reevaluer: () => {
          if (lifted) refusal = null;
          publish();
          return refusal;
        },
        contexte: (project) => ({ projet: project, racine: "/nulle-part", env: {}, dire: () => {}, relireLaConfiguration: () => {} }),
      }, registry),
    maintenant: () => NOW,
  });
  // L'app attend entre deux lectures du gist : la station le lit, joue les demandes, et répond.
  const ask: AskTheRemedy = (options) =>
    demanderLeRemede({
      ...options,
      maintenant: () => NOW,
      attendre: async () => {
        const files = await responder.repondre(gists.get(main.id) ?? {});
        if (files !== null) await github.ecrire(main.id, files);
      },
    });
  const readings: SeenOfProjects[] = [];
  const projects = holdProjects({ github, stations: () => [BOX, MAC], depots: async () => [], surLecture: (seenOne) => readings.push(seenOne), maintenant: () => NOW, locale: () => MAC.id, demanderLeRemede: ask });
  return { projets: projects, gists, joues: played, lectures: readings };
}

const refusalOf = (seenOne: SeenOfProjects) => seenOne.projets.find(({ nom: name }) => name === "parade")?.refus ?? null;

for (const [or, main] of [["sur l'ordinateur du chef", MAC], ["sur une station distante", BOX]] as const) {
  test(`${or} : le refus publie son remède ; le bouton le fait jouer par la station, et la page relue n'a plus de refus`, async () => {
    const { projets: projects, gists, joues: played, lectures: readings } = aKitchen(main);
    const before = await projects.relire();
    assert.deepEqual(refusalOf(before)?.remedy, { id: "remove-port", description: "Removes the network port setting from this project's line.", destructive: true });
    const issue = await projects.remedier("parade", "proxy-port-set", "remove-port");
    assert.deepEqual(issue, { outcome: "lifted" });
    assert.deepEqual(played, ["remove-port"]);
    // Les projets sont relus avant la réponse : le refus n'y est plus.
    assert.equal(refusalOf(readings.at(-1) ?? assert.fail("aucune relecture")), null);
    // La demande a quitté le gist de la principale, et elle seule l'a reçue.
    assert.deepEqual(JSON.parse(gists.get(main.id)?.[FICHIER_REMEDES] ?? "{}").requests, []);
    const other = main === MAC ? BOX : MAC;
    assert.equal(gists.get(other.id)?.[FICHIER_REMEDES], undefined);
  });

  test(`${or} : le remède joué, la station refuse encore — l'issue dit pourquoi, en une phrase, et le refus reste`, async () => {
    const { projets: projects, joues: played, lectures: readings } = aKitchen(main, { leve: false });
    await projects.relire();
    const issue = await projects.remedier("parade", "proxy-port-set", "remove-port");
    assert.equal(issue.outcome, "holds");
    assert.match(issue.outcome === "holds" ? issue.reason : "", /^The action was done, but the station .+\.$/);
    assert.deepEqual(played, ["remove-port"]);
    assert.equal(refusalOf(readings.at(-1) ?? assert.fail("aucune relecture"))?.code, "proxy-port-set");
  });

  test(`${or} : un refus qui n'est plus celui de la page, ou un remède qu'il n'offre pas — rien ne part`, async () => {
    const { projets: projects, gists, joues: played } = aKitchen(main);
    await projects.relire();
    for (const [refusal, remedy] of [["clone-missing", "remove-port"], ["proxy-port-set", "another-remedy"]]) {
      const issue = await projects.remedier("parade", refusal, remedy);
      assert.equal(issue.outcome, "error");
      assert.match(issue.outcome === "error" ? issue.error : "", /nothing was done$/);
    }
    assert.deepEqual(played, []);
    assert.equal(gists.get(main.id)?.[FICHIER_REMEDES], undefined);
  });
}

test("les deux stations rendent la même issue, par le même chemin", async () => {
  const issues = [];
  for (const main of [MAC, BOX]) {
    const { projets: projects } = aKitchen(main, { leve: false });
    await projects.relire();
    issues.push(await projects.remedier("parade", "proxy-port-set", "remove-port"));
  }
  assert.deepEqual(issues[0], issues[1]);
});

test("sans runtime à côté de l'app, ou quand GitHub ne répond pas : l'issue le dit, et rien n'est tenu pour fait", async () => {
  const gists = new Map<string, Files>([[BOX.id, { [FILE_PROJECTS]: documentOfRequest([PARADE]), [FILE_TRACKING]: JSON.stringify({ brigade: "projets-suivi", projets: [{ nom: "parade", etat: "refuse", dit: "", refus: refusalOfRuntime("proxy-port-set", creerRegistre([{ id: "remove-port", leve: ["proxy-port-set"], description: "Removes it.", destructif: false, executer: () => {} }])) }] }) }]]);
  const github: GitHubOfStations = { lister: async () => [], lire: async (id) => gists.get(id) ?? null, ecrire: async () => {}, supprimer: async () => {} };
  const without = holdProjects({ github, stations: () => [BOX], depots: async () => [], surLecture: () => {} });
  await without.relire();
  assert.deepEqual(await without.remedier("parade", "proxy-port-set", "remove-port"), { outcome: "error", error: "this app has no runtime beside it to ask for this action: nothing was done" });
  const inOutage = holdProjects({ github, stations: () => [BOX], depots: async () => [], surLecture: () => {}, demanderLeRemede: () => Promise.reject(new Error("gh: HTTP 502")) });
  await inOutage.relire();
  const issue = await inOutage.remedier("parade", "proxy-port-set", "remove-port");
  assert.deepEqual(issue, { outcome: "error", error: "GitHub could not be read or written, so nothing is known to have been done — gh: HTTP 502" });
});

test("le canal du runtime, sur les gists du poste : un gist disparu se dit `absent`, une autre panne remonte", async () => {
  const write = async (id: string) => {
    if (id === "parti") throw new Error("this station's gist is no longer on GitHub");
    throw new Error("GitHub gave no answer within 30 s");
  };
  const channel = channelOfGists({ lister: async () => [], lire: async () => null, ecrire: write, supprimer: async () => {} });
  assert.equal(await channel.ecrire("parti", {}), "absent");
  await assert.rejects(channel.ecrire("g1", {}), /no answer within 30 s/);
  await assert.rejects(channel.creer("x", {}));
});
