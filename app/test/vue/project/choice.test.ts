// Ce qui manque à la station pour les tests d'un projet, sur sa page (#1400, épique 1393) : une carte par besoin
// que sa principale publie en attente — ce qui manque, pourquoi, et ses quatre issues, chacune un bouton avec ce qui
// en suit sous lui. Un clic écrit l'issue dans la demande de la principale, que la station relit (#1398) ; la carte
// part. Les choix sont écrits par le runtime lui-même (runtime/src/installation/besoins/), relus par `lireSuivi`
// comme l'app relit le suivi d'une station ; la demande écrite est relue par le runtime ; la vue est jouée contre
// le faux pont (helpers/false-vue.ts), l'écriture contre un faux GitHub qui tient les gists en mémoire.
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { type Choice, documentOfRequest, FILE_PROJECTS, FILE_TRACKING, readRequest, readTracking, type ProjectRequest } from "../../../src/projects/request.ts";
import { holdProjects } from "../../../src/projects/projects.ts";
import type { Files } from "../../../src/stations/github.ts";
import type { StationVue } from "../../../src/stations/stations.ts";
import { ACTION_OF_CHOICE as ACTION_DU_CHOIX, CHOICES_OF_NEEDS } from "../../helpers/choices-of-needs.ts";
import { Fake } from "../../helpers/false-vue.ts";

const doc = { createElement: (balise: string) => new Fake(balise) };

// Tels que le runtime les écrit : un Postgres et Docker qui manquent à la box, en attente du chef.
const queued = (id: keyof typeof CHOICES_OF_NEEDS) => ({ ...CHOICES_OF_NEEDS[id], status: "pending" as const });
const POSTGRES = queued("postgres");
const DOCKER = queued("docker");
// Le blocage qui attend chacun, sous la même clé, et un autre blocage, sans choix.
const blockageOf = ({ id, message, cause }: typeof POSTGRES) => ({ id, message, cause, action: ACTION_DU_CHOIX });
const CLONE = { id: "clone", message: "box cannot clone benomite/parade.", cause: "The token does not cover benomite/parade.", link: "https://github.com/settings/personal-access-tokens" };

// Ce que l'app relit du suivi d'une station qui les publie.
const rereadOnes = (choice: object[] | undefined, blockages: object[] = []) => readTracking(JSON.stringify({ brigade: "projets-suivi", projets: [{ nom: "parade", etat: "servi", ...(choice === undefined ? {} : { choix: choice }), ...(blockages.length === 0 ? {} : { blocages: blockages }) }] }))[0];
const choiceReread = (choice: object[] | undefined): Choice[] => rereadOnes(choice)?.choix ?? [];

const cards = (or: Fake) => or.dessous("section").filter((s) => s.className === "choix");
const buttons = (or: Fake) => or.dessous("button").filter((b) => b.className !== "aide");
const textOf = (or: Fake, classe: string) => or.dessous("p").find((p) => p.className === classe)?.textContent;

describe("les cartes, posées par le module", () => {







});

describe("le suivi relu par l'app", () => {
  test("chaque choix publié, tel quel ; un illisible, ou une issue illisible, n'est pas montré", () => {
    assert.deepEqual(choiceReread([POSTGRES, DOCKER]), [POSTGRES, DOCKER]);
    const withoutKey = { ...POSTGRES, id: "" };
    const withoutIssue = { ...DOCKER, options: [{ id: "x", label: "" }] };
    const unknown = { ...POSTGRES, id: "need:redis", status: "maybe" };
    const oneUnreadable = { ...POSTGRES, options: [...POSTGRES.options, { id: "y" }] };
    assert.deepEqual(choiceReread([withoutKey, withoutIssue, unknown, oneUnreadable]), [POSTGRES]);
    assert.equal(rereadOnes(undefined)?.choix, undefined, "rien ne manque, rien de publié");
  });
});

describe("l'issue retenue, écrite dans la demande de la principale", () => {
  const BOX: StationVue = { id: "g1", nom: "box", machine: "Linux 6.1.0", etat: "en-ligne", ligne: "online", dit: "online", version: "1.4.0", projets: ["parade"], max: null };
  const MAC: StationVue = { ...BOX, id: "g2", nom: "macbook", machine: "macOS 25.0.0" };
  const request = (main: boolean): ProjectRequest => ({ nom: "parade", depot: "benomite/parade", base: "main", principale: main, cooks: 2, manager: { modele: "sonnet", effort: "medium" }, reviewer: { modele: "opus", effort: "high" }, ouvertLe: null, demandeLe: "2026-10-22T11:00:00.000Z" });

  // GitHub, ses gists en mémoire : la box est la principale de parade et publie ses choix, le Mac la seconde.
  function oneGitHub(choice: object[]) {
    const gists = new Map<string, Files>([
      ["g1", { [FILE_PROJECTS]: documentOfRequest([request(true)]), [FILE_TRACKING]: JSON.stringify({ brigade: "projets-suivi", projets: [{ nom: "parade", etat: "servi", choix: choice }] }) }],
      ["g2", { [FILE_PROJECTS]: documentOfRequest([request(false)]) }],
    ]);
    const writtenOnes: string[] = [];
    let outage = false;
    const projects = holdProjects({
      github: {
        lister: async () => [],
        lire: async (id) => gists.get(id) ?? null,
        ecrire: async (id, files) => {
          if (outage) throw new Error("HTTP 502");
          writtenOnes.push(id);
          gists.set(id, { ...gists.get(id), ...files });
        },
        supprimer: async () => {},
      },
      stations: () => [BOX, MAC],
      depots: async () => [],
      surLecture: () => {},
    });
    const rereadOne = (id: string) => readRequest(gists.get(id)?.[FILE_PROJECTS]);
    return { projets: projects, ecrits: writtenOnes, relue: rereadOne, gists, enPanne: () => (outage = true) };
  }


});

