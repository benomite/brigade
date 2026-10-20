// Le point d'entrée des remèdes, contre une station doublée : il joue le remède
// que le refus offre, fait réévaluer le refus, et rend ce qu'il en est — ou
// refuse, sans rien jouer, un remède inconnu ou que le refus n'offre pas.
import assert from "node:assert/strict";
import { test } from "node:test";
import { refus, type CodeDeRefus, type Refus } from "../../src/projets/refus.ts";
import { executerRemede, type StationDesRemedes } from "../../src/remedes/executer.ts";
import { creerRegistre, type ContexteDuRemede, type Remede } from "../../src/remedes/registre.ts";

const unePhrase = (texte: string) => /^[A-Z][^\n]*\.$/.test(texte) && !/[.!?] [A-Z]/.test(texte.slice(0, -1));

// Une station qui refuse `parade` pour `refuse`, et dont la réévaluation rend `apres`.
function uneStation(options: { refuse: CodeDeRefus | null; apres?: () => CodeDeRefus | null; remede?: Partial<Remede>; autres?: Remede[] }) {
  const joues: ContexteDuRemede[] = [];
  const reevaluations: string[] = [];
  const registre = creerRegistre([
    {
      id: "remove-hand-written-line",
      leve: ["hand-written-line"],
      description: "Removes the hand-written line for this project from the station's configuration.",
      destructif: true,
      executer: (contexte) => void joues.push(contexte),
      ...options.remede,
    },
    ...(options.autres ?? []),
  ]);
  let actuel: CodeDeRefus | null = options.refuse;
  const servi = (): Refus | null => (actuel === null ? null : refus(actuel, registre));
  const station: StationDesRemedes = {
    refusDe: async (projet) => (projet === "parade" ? servi() : null),
    reevaluer: async (projet) => {
      reevaluations.push(projet);
      actuel = options.apres === undefined ? null : options.apres();
      return servi();
    },
    contexte: (projet) => ({ projet, racine: "/station", env: {}, dire: () => {}, relireLaConfiguration: () => {} }),
  };
  return { station, registre, joues, reevaluations };
}

const DEMANDE = { project: "parade", refusal: "hand-written-line", remedy: "remove-hand-written-line" };

test("le remède inscrit est joué, avec ce que la station lui donne, puis le refus réévalué : levé", async () => {
  const { station, registre, joues, reevaluations } = uneStation({ refuse: "hand-written-line" });
  assert.deepEqual(await executerRemede(DEMANDE, station, registre), { outcome: "lifted" });
  assert.deepEqual(joues.map(({ projet, racine }) => [projet, racine]), [["parade", "/station"]]);
  assert.deepEqual(reevaluations, ["parade"]);
});

test("le remède joué, le refus tient encore : il le dit en une phrase, avec le refus tel qu'il est maintenant", async () => {
  const { station, registre, joues } = uneStation({ refuse: "hand-written-line", apres: () => "hand-written-line" });
  const issue = await executerRemede(DEMANDE, station, registre);
  assert.equal(joues.length, 1);
  assert.equal(issue.outcome, "holds");
  if (issue.outcome !== "holds") return;
  assert.ok(unePhrase(issue.reason), issue.reason);
  assert.match(issue.reason, /^The action was done, but the station still refuses this project: this project is already set up by hand/);
  assert.deepEqual(issue.refusal, refus("hand-written-line", registre));
});

test("le remède joué, un autre refus vient : il le dit, et rend ce refus, avec ce qu'il offre à son tour", async () => {
  const { station, registre } = uneStation({ refuse: "hand-written-line", apres: () => "door-not-open" });
  const issue = await executerRemede(DEMANDE, station, registre);
  assert.equal(issue.outcome, "holds");
  if (issue.outcome !== "holds") return;
  assert.match(issue.reason, /^The action was done, but the station now refuses this project for another reason: the station's network door/);
  assert.ok(unePhrase(issue.reason), issue.reason);
  assert.equal(issue.refusal.code, "door-not-open");
  assert.equal("noRemedy" in issue.refusal, true);
});

test("le remède qui échoue : le refus est quand même réévalué, et tient — la raison, en une phrase, dit l'échec", async () => {
  const { station, registre, reevaluations } = uneStation({
    refuse: "hand-written-line",
    apres: () => "hand-written-line",
    remede: {
      executer: () => {
        throw new Error("the configuration is read-only.\nEACCES: permission denied. Again.");
      },
    },
  });
  const issue = await executerRemede(DEMANDE, station, registre);
  assert.deepEqual(reevaluations, ["parade"]);
  assert.equal(issue.outcome, "holds");
  if (issue.outcome !== "holds") return;
  assert.equal(issue.reason, "The action did not go through, so the station still refuses this project: the configuration is read-only.");
});

test("la réévaluation en panne : le refus d'avant tient, et la raison le dit", async () => {
  const { station, registre } = uneStation({ refuse: "hand-written-line" });
  station.reevaluer = async () => {
    throw new Error("GitHub does not answer");
  };
  const issue = await executerRemede(DEMANDE, station, registre);
  assert.equal(issue.outcome, "holds");
  if (issue.outcome !== "holds") return;
  assert.equal(issue.reason, "The action was done, and the station could not check again whether it still refuses this project: GitHub does not answer.");
  assert.equal(issue.refusal.code, "hand-written-line");
});

test("un remède inconnu : une erreur explicite, rien n'est joué ni réévalué", async () => {
  const { station, registre, joues, reevaluations } = uneStation({ refuse: "hand-written-line" });
  assert.deepEqual(await executerRemede({ ...DEMANDE, remedy: "no-such-remedy" }, station, registre), { outcome: "error", error: "the station knows no remedy called no-such-remedy: nothing was done" });
  assert.deepEqual([joues, reevaluations], [[], []]);
});

test("un remède inscrit que le refus courant n'offre pas : une erreur explicite, rien n'est joué ni réévalué", async () => {
  const autre: Remede = { id: "open-the-door", leve: ["door-not-open"], description: "Opens the station's door for this project.", destructif: false, executer: () => assert.fail("jamais joué") };
  const { station, registre, joues, reevaluations } = uneStation({ refuse: "hand-written-line", autres: [autre] });
  // Un remède qui existe, pour un autre refus que celui servi.
  assert.deepEqual(await executerRemede({ ...DEMANDE, remedy: "open-the-door" }, station, registre), { outcome: "error", error: "this refusal does not offer the remedy open-the-door: nothing was done" });
  // Le refus a changé depuis que l'app l'a lu.
  assert.deepEqual(await executerRemede({ ...DEMANDE, refusal: "door-not-open", remedy: "open-the-door" }, station, registre), {
    outcome: "error",
    error: "the station now refuses parade for another reason (hand-written-line, not door-not-open): nothing was done",
  });
  // Un projet qu'elle ne refuse pas.
  assert.deepEqual(await executerRemede({ ...DEMANDE, project: "autre" }, station, registre), { outcome: "error", error: "the station no longer refuses autre: nothing was done" });
  assert.deepEqual([joues, reevaluations], [[], []]);
});

test("un refus sans remède, demandé quand même : une erreur explicite, rien n'est joué", async () => {
  const { station, registre, joues } = uneStation({ refuse: "door-not-open", autres: [{ id: "open-the-door", leve: ["clone-missing"], description: "Fetches the repository again.", destructif: false, executer: () => assert.fail("jamais joué") }] });
  assert.deepEqual(await executerRemede({ project: "parade", refusal: "door-not-open", remedy: "open-the-door" }, station, registre), { outcome: "error", error: "this refusal does not offer the remedy open-the-door: nothing was done" });
  assert.deepEqual(joues, []);
});
