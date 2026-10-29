// Le plafond de cooks et la retenue d'une station, lus dans le `status` que le runtime écrit (plafond.ts), posés sur
// la ligne de sa station par l'accueil, et réglés par le geste `/brigade cooks <N>` posté sur le tableau de chaque
// projet qui le dit (#1845).
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "node:test";
import { decrireEtat, lireEtat } from "../../runtime/src/etat.ts";
import { ouvrirJournal } from "../../runtime/src/journal.ts";
import type { EtatStation } from "../../runtime/src/projections/stations.ts";
import { tenirAccueil } from "../src/accueil.ts";
import { plafondsDe, reglerLePlafond, retenuesDe } from "../src/plafond.ts";
import type { StationVue } from "../src/stations/stations.ts";
import type { DecisionDuChef, EtatDuGeste } from "../src/tableau-gestes/gestes.ts";

const A = "2026-10-16T12:00:00.000Z";

const station = (nom: string, champs: Partial<EtatStation> = {}): EtatStation => ({
  station: nom, engine: "claude", provides: ["code"], maxCooks: 0, cores: 8, cap: null, announcedAt: "2026-10-16T08:00:00.000Z",
  quotaUntil: null, quotaReason: null, disconnectedAt: null, disconnectedReason: null,
  saturatedAt: null, saturatedResource: null, saturatedObserved: null, saturatedLimit: null, saturatedCauses: [],
  heldAt: null, heldReason: null, unarbitratedAt: null, unarbitratedReason: null,
  remote: false, seenAt: null, presentSince: null, ordinary: false, sandbox: null,
  ...champs,
});

// Le `status` tel que le runtime l'écrit pour ces stations.
function statusDe(stations: EtatStation[]): string {
  const repertoire = mkdtempSync(join(tmpdir(), "brigade-app-plafond-"));
  const journal = ouvrirJournal(repertoire);
  try {
    const maintenant = new Date(A);
    return decrireEtat({ ...lireEtat(journal, maintenant), stations }, maintenant).join("\n");
  } finally {
    journal.fermer();
    rmSync(repertoire, { recursive: true, force: true });
  }
}

const SATUREE = {
  saturatedAt: "2026-10-16T11:56:00.000Z", saturatedResource: "memory", saturatedObserved: 812, saturatedLimit: 3205,
  saturatedCauses: [{ resource: "cpu", observed: 18.4, limit: 12 }, { resource: "memory", observed: 812, limit: 3205, limitFrom: { totalMb: 32050 } }],
} as Partial<EtatStation>;

describe("le plafond d'une station, tel que `status` le dit", () => {
  test("le défaut dit d'où il vient, le réglage du chef dit ce qu'il remplace", () => {
    const plafonds = plafondsDe(statusDe([station("box"), station("mac/claude", { cap: 5 }), station("vieille", { cores: null, maxCooks: 2 }), station("libre", { cap: 0 })]));
    assert.deepEqual(plafonds.get("box"), { dit: "3 at most — 8 cores", nombre: 3, parLeChef: false });
    assert.deepEqual(plafonds.get("mac/claude"), { dit: "5 at most — set by you, replaces 3 (8 cores)", nombre: 5, parLeChef: true, remplace: "3" });
    assert.deepEqual(plafonds.get("vieille"), { dit: "2 at most — declared", nombre: 2, parLeChef: false });
    assert.deepEqual(plafonds.get("libre"), { dit: "no limit — set by you, replaces 3 (8 cores)", nombre: null, parLeChef: true, remplace: "3" });
  });

  test("avec des cooks en cours et des cooks coincés, les plafonds se lisent encore", () => {
    const texte = "cooks      2 running — box: 3 at most — 8 cores, mac: 5 at most — set by you, replaces 3 (8 cores) — 1 STUCK: #12\n\nrail";
    assert.deepEqual([...plafondsDe(texte).keys()], ["box", "mac"]);
    assert.equal(plafondsDe(texte).get("mac")?.dit, "5 at most — set by you, replaces 3 (8 cores)");
  });

  test("un `status` sans la ligne `cooks` ne dit aucun plafond", () => {
    assert.equal(plafondsDe("cuisine    ouverte").size, 0);
  });
});

describe("ce qui retient la station : la ressource, sa valeur et son seuil", () => {
  test("la mémoire et le processeur à la fois", () => {
    const retenues = retenuesDe(statusDe([station("box", SATUREE), station("mac")]));
    assert.deepEqual([...retenues.keys()], ["box"]);
    const { ressources, detail, depuis } = retenues.get("box")!;
    assert.equal(ressources, "CPU and memory");
    assert.equal(depuis, "4 min");
    assert.match(detail, /^load of 18\.4 for at most 12 · 812 MB of memory available for at least 3,205 MB \(default: 10% of the machine's 32,050 MB\)$/);
  });

  test("une station qui ne se retient pas n'est pas dite retenue", () => {
    assert.equal(retenuesDe(statusDe([station("box")])).size, 0);
  });
});

describe("l'accueil pose le plafond et la retenue sur la ligne de leur station", () => {
  const vue = (nom: string): StationVue => ({ id: "g1", nom, machine: "Linux", ton: "vert", dit: "online", pannes: [], etat: "en-ligne", version: "1.4.0", projets: ["brigade"], max: null, versionDit: "", ligne: "" }) as unknown as StationVue;

  test("la page peut régler une station dont un projet lu dit le plafond — et seulement celle-là", () => {
    const accueil = tenirAccueil({ projets: () => [{ nom: "brigade", box: true, desinstalle: false }], maintenant: () => Date.parse(A) });
    accueil.stations({ a: A, stations: [vue("box"), vue("autre")] });
    const vu = accueil.status({ projet: "brigade", demande: 1, a: A, attend: undefined, sorties: [{ commande: "status", texte: statusDe([station("box", SATUREE)]) }] });
    const [box, autre] = vu?.stations ?? [];
    assert.equal(box?.plafond?.dit, "3 at most — 8 cores");
    assert.equal(box?.reglable, true);
    assert.equal(box?.retenue?.ressources, "CPU and memory");
    assert.equal(autre?.plafond, undefined);
    assert.equal(autre?.reglable, undefined);
    assert.deepEqual(accueil.projetsDe("box"), ["brigade"]);
    assert.deepEqual(accueil.projetsDe("autre"), []);
  });
});

describe("régler le plafond : `/brigade cooks <valeur>` sur le tableau de chaque projet qui nomme la station", () => {
  const COMMENTAIRE = { id: 7001, url: "https://github.com/chef/a/issues/9#issuecomment-7001" };
  // Le tableau de chaque projet, doublé : la box y répond comme `etats` le dit pour ce projet — jouée par défaut.
  const tableaux = (etats: Record<string, "refused" | "pending" | "failed"> = {}) => {
    const postees: string[] = [];
    const auTableau = async (projet: string, decision: DecisionDuChef): Promise<EtatDuGeste> => {
      postees.push(`${projet}: ${decision.geste === "cooks" ? decision.plafond : "?"}`);
      const etat = etats[projet] ?? "taken";
      if (etat === "failed") return { etat, raison: "The Kitchen board of this project has not been read yet — read it again." };
      if (etat === "pending") return { etat, commentaire: COMMENTAIRE };
      const reponse = etat === "taken" ? "**Done** — [cooks 5](…): box/claude: 5 at most — set by you — cost: none: only the log is written" : "**Not done** — [cooks 5](…): boom";
      return { etat, commentaire: COMMENTAIRE, reponse, lu: { commentaire: COMMENTAIRE.id, url: COMMENTAIRE.url, le: A, geste: "cooks", ticket: null, etat: etat === "taken" ? "pris" : "refuse", traiteLe: A, reponse } };
    };
    return { postees, auTableau };
  };

  test("un nombre, zéro ou `auto` partent ; rien d'autre", async () => {
    const { postees, auTableau } = tableaux();
    assert.deepEqual(await reglerLePlafond(["a", "b"], "5", auTableau), { fait: "the cap is 5" });
    assert.deepEqual(await reglerLePlafond(["a"], "0", auTableau), { fait: "the cap is lifted: no limit" });
    assert.deepEqual(await reglerLePlafond(["a"], "auto", auTableau), { fait: "the cap is back to the default" });
    assert.deepEqual(postees, ["a: 5", "b: 5", "a: 0", "a: auto"]);
    for (const mauvais of ["-1", "3; rm -rf", "", "05", "1.5", 3, undefined]) {
      assert.ok("refus" in (await reglerLePlafond(["a"], mauvais, auTableau)), String(mauvais));
    }
    assert.equal(postees.length, 4, "une valeur refusée ne poste rien");
  });

  test("sans projet qui nomme la station, rien n'est posté", async () => {
    const auTableau = async () => assert.fail("rien ne devait partir");
    const rendu = await reglerLePlafond([], "5", auTableau);
    assert.match("refus" in rendu ? rendu.refus : "", /no project the app reads/);
  });

  test("une box qui refuse : une ligne, ce qu'elle a répondu et le geste dans le détail", async () => {
    const sorti = await reglerLePlafond(["a", "b"], "5", tableaux({ b: "refused" }).auTableau);
    assert.ok("refus" in sorti);
    assert.equal(sorti.refus, "the cap was not changed for b: its box did not take it; already changed for a");
    assert.equal(sorti.detail, `boom\n${COMMENTAIRE.url}`);
  });

  test("un tableau pas lu : rien n'est posté pour ce projet, et la phrase le dit", async () => {
    const sorti = await reglerLePlafond(["a"], "5", tableaux({ a: "failed" }).auTableau);
    assert.deepEqual(sorti, { refus: "the cap was not changed for a: the Kitchen board of this project has not been read yet — read it again" });
  });

  test("une box qui n'a pas encore lu le geste : il est posté, elle le joue à son tick, et la phrase le dit", async () => {
    const sorti = await reglerLePlafond(["a", "b"], "5", tableaux({ b: "pending" }).auTableau);
    assert.deepEqual(sorti, { fait: "the cap is 5 once played: posted on the Kitchen board, the box of b plays it at its next tick — already changed for a" });
  });
});
