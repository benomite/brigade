// Le bouton du refus, côté process principal (#1205) : l'app demande le remède à la principale du projet par
// son gist, avec l'opération du runtime (runtime/src/remedes/distant.ts), et la station le joue par son point
// d'entrée (runtime/src/remedes/executer.ts). Les gists sont en mémoire, et la station qui répond est celle du
// runtime : son répondeur et son point d'entrée, avec un registre qui ne porte qu'un remède de test. Le même
// chemin sert l'ordinateur du chef et une station distante : chaque test se joue contre l'une, puis l'autre.
import assert from "node:assert/strict";
import { test } from "node:test";
import { refus as refusDuRuntime, type Refus as RefusDuRuntime } from "../../../runtime/src/projets/refus.ts";
import { demanderLeRemede, FICHIER_REMEDES, repondeurDeRemedes } from "../../../runtime/src/remedes/distant.ts";
import { executerRemede } from "../../../runtime/src/remedes/executer.ts";
import { creerRegistre } from "../../../runtime/src/remedes/registre.ts";
import { documentDeDemande, FICHIER_PROJETS, FICHIER_SUIVI, type ProjetDemande } from "../../src/projets/demande.ts";
import { tenirProjets, type VuDesProjets } from "../../src/projets/projets.ts";
import { canalDesGists, type DemanderLeRemede } from "../../src/projets/remede.ts";
import type { Fichiers, GitHubDesStations } from "../../src/stations/github.ts";
import type { StationVue } from "../../src/stations/stations.ts";

const BOX: StationVue = { id: "g1", nom: "parade-box", machine: "Linux 6.1.0", etat: "en-ligne", ligne: "online", pannes: [], dit: "online", version: "1.4.0", projets: [], max: null };
const MAC: StationVue = { id: "g2", nom: "macbook", machine: "macOS 25.0.0", etat: "en-ligne", ligne: "online", pannes: [], dit: "online", version: "1.4.0", projets: [], max: null };
const PARADE: ProjetDemande = { nom: "parade", depot: "benomite/parade", base: "main", principale: true, cooks: 2, manager: { modele: "sonnet", effort: "medium" }, reviewer: { modele: "opus", effort: "high" }, ouvertLe: null, demandeLe: null };
const MAINTENANT = Date.parse("2026-10-21T12:00:00Z");

// Une station et son remède de test : il retire la ligne de port, et la réévaluation dit si le refus tient.
function uneCuisine(principale: StationVue, { leve = true }: { leve?: boolean } = {}) {
  const gists = new Map<string, Fichiers>([BOX, MAC].map(({ id }) => [id, {}]));
  const github: GitHubDesStations = {
    lister: async () => [],
    lire: async (id) => (gists.has(id) ? { ...gists.get(id) } : null),
    ecrire: async (id, fichiers) => {
      const avant = gists.get(id);
      if (avant === undefined) throw new Error("this station's gist is no longer on GitHub");
      gists.set(id, { ...avant, ...fichiers });
    },
    supprimer: async () => {},
  };
  const joues: string[] = [];
  const registre = creerRegistre([{ id: "remove-port", leve: ["proxy-port-set"], description: "Removes the network port setting from this project's line.", destructif: true, executer: () => void joues.push("remove-port") }]);
  let refus: RefusDuRuntime | null = refusDuRuntime("proxy-port-set", registre);
  // Ce que la station publie de « parade » : servi, ou refusé avec son refus.
  const publier = () => {
    const suivi = { nom: "parade", etat: refus === null ? "servi" : "refuse", dit: "", autoriser: [], serviLe: null, cuitSur: principale.nom, ici: principale === MAC, bascule: null, ...(refus === null ? {} : { refus }) };
    gists.set(principale.id, { ...gists.get(principale.id), [FICHIER_SUIVI]: JSON.stringify({ brigade: "projets-suivi", format: 1, a: new Date(MAINTENANT).toISOString(), projets: [suivi] }) });
  };
  gists.set(principale.id, { [FICHIER_PROJETS]: documentDeDemande([PARADE]) });
  publier();
  const repondeur = repondeurDeRemedes({
    executer: (demande) =>
      executerRemede(demande, {
        refusDe: () => refus,
        reevaluer: () => {
          if (leve) refus = null;
          publier();
          return refus;
        },
        contexte: (projet) => ({ projet, racine: "/nulle-part", env: {}, dire: () => {}, relireLaConfiguration: () => {} }),
      }, registre),
    maintenant: () => MAINTENANT,
  });
  // L'app attend entre deux lectures du gist : la station le lit, joue les demandes, et répond.
  const demander: DemanderLeRemede = (options) =>
    demanderLeRemede({
      ...options,
      maintenant: () => MAINTENANT,
      attendre: async () => {
        const fichiers = await repondeur.repondre(gists.get(principale.id) ?? {});
        if (fichiers !== null) await github.ecrire(principale.id, fichiers);
      },
    });
  const lectures: VuDesProjets[] = [];
  const projets = tenirProjets({ github, stations: () => [BOX, MAC], depots: async () => [], surLecture: (vu) => lectures.push(vu), maintenant: () => MAINTENANT, locale: () => MAC.id, demanderLeRemede: demander });
  return { projets, gists, joues, lectures };
}

const refusDe = (vu: VuDesProjets) => vu.projets.find(({ nom }) => nom === "parade")?.refus ?? null;

for (const [ou, principale] of [["sur l'ordinateur du chef", MAC], ["sur une station distante", BOX]] as const) {
  test(`${ou} : le refus publie son remède ; le bouton le fait jouer par la station, et la page relue n'a plus de refus`, async () => {
    const { projets, gists, joues, lectures } = uneCuisine(principale);
    const avant = await projets.relire();
    assert.deepEqual(refusDe(avant)?.remedy, { id: "remove-port", description: "Removes the network port setting from this project's line.", destructive: true });
    const issue = await projets.remedier("parade", "proxy-port-set", "remove-port");
    assert.deepEqual(issue, { outcome: "lifted" });
    assert.deepEqual(joues, ["remove-port"]);
    // Les projets sont relus avant la réponse : le refus n'y est plus.
    assert.equal(refusDe(lectures.at(-1) ?? assert.fail("aucune relecture")), null);
    // La demande a quitté le gist de la principale, et elle seule l'a reçue.
    assert.deepEqual(JSON.parse(gists.get(principale.id)?.[FICHIER_REMEDES] ?? "{}").requests, []);
    const autre = principale === MAC ? BOX : MAC;
    assert.equal(gists.get(autre.id)?.[FICHIER_REMEDES], undefined);
  });

  test(`${ou} : le remède joué, la station refuse encore — l'issue dit pourquoi, en une phrase, et le refus reste`, async () => {
    const { projets, joues, lectures } = uneCuisine(principale, { leve: false });
    await projets.relire();
    const issue = await projets.remedier("parade", "proxy-port-set", "remove-port");
    assert.equal(issue.outcome, "holds");
    assert.match(issue.outcome === "holds" ? issue.reason : "", /^The action was done, but the station .+\.$/);
    assert.deepEqual(joues, ["remove-port"]);
    assert.equal(refusDe(lectures.at(-1) ?? assert.fail("aucune relecture"))?.code, "proxy-port-set");
  });

  test(`${ou} : un refus qui n'est plus celui de la page, ou un remède qu'il n'offre pas — rien ne part`, async () => {
    const { projets, gists, joues } = uneCuisine(principale);
    await projets.relire();
    for (const [refus, remede] of [["clone-missing", "remove-port"], ["proxy-port-set", "another-remedy"]]) {
      const issue = await projets.remedier("parade", refus, remede);
      assert.equal(issue.outcome, "error");
      assert.match(issue.outcome === "error" ? issue.error : "", /nothing was done$/);
    }
    assert.deepEqual(joues, []);
    assert.equal(gists.get(principale.id)?.[FICHIER_REMEDES], undefined);
  });
}

test("les deux stations rendent la même issue, par le même chemin", async () => {
  const issues = [];
  for (const principale of [MAC, BOX]) {
    const { projets } = uneCuisine(principale, { leve: false });
    await projets.relire();
    issues.push(await projets.remedier("parade", "proxy-port-set", "remove-port"));
  }
  assert.deepEqual(issues[0], issues[1]);
});

test("sans runtime à côté de l'app, ou quand GitHub ne répond pas : l'issue le dit, et rien n'est tenu pour fait", async () => {
  const gists = new Map<string, Fichiers>([[BOX.id, { [FICHIER_PROJETS]: documentDeDemande([PARADE]), [FICHIER_SUIVI]: JSON.stringify({ brigade: "projets-suivi", projets: [{ nom: "parade", etat: "refuse", dit: "", refus: refusDuRuntime("proxy-port-set", creerRegistre([{ id: "remove-port", leve: ["proxy-port-set"], description: "Removes it.", destructif: false, executer: () => {} }])) }] }) }]]);
  const github: GitHubDesStations = { lister: async () => [], lire: async (id) => gists.get(id) ?? null, ecrire: async () => {}, supprimer: async () => {} };
  const sans = tenirProjets({ github, stations: () => [BOX], depots: async () => [], surLecture: () => {} });
  await sans.relire();
  assert.deepEqual(await sans.remedier("parade", "proxy-port-set", "remove-port"), { outcome: "error", error: "this app has no runtime beside it to ask for this action: nothing was done" });
  const enPanne = tenirProjets({ github, stations: () => [BOX], depots: async () => [], surLecture: () => {}, demanderLeRemede: () => Promise.reject(new Error("gh: HTTP 502")) });
  await enPanne.relire();
  const issue = await enPanne.remedier("parade", "proxy-port-set", "remove-port");
  assert.deepEqual(issue, { outcome: "error", error: "GitHub could not be read or written, so nothing is known to have been done — gh: HTTP 502" });
});

test("le canal du runtime, sur les gists du poste : un gist disparu se dit `absent`, une autre panne remonte", async () => {
  const ecrire = async (id: string) => {
    if (id === "parti") throw new Error("this station's gist is no longer on GitHub");
    throw new Error("GitHub gave no answer within 30 s");
  };
  const canal = canalDesGists({ lister: async () => [], lire: async () => null, ecrire, supprimer: async () => {} });
  assert.equal(await canal.ecrire("parti", {}), "absent");
  await assert.rejects(canal.ecrire("g1", {}), /no answer within 30 s/);
  await assert.rejects(canal.creer("x", {}));
});
