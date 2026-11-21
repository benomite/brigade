// #3870, critère 1 : un ticket qu'une station ne peut pas cuire retourne aussitôt sur le rail pour les autres stations du projet ; il n'est retenu sur elle que si aucune autre ne peut le prendre.
// Test d'acceptation gelé (#3725) : deux stations d'un même projet sur un faux GitHub partagé. Le Mac ne déclare que
// lui-même (sa liste locale), comme en production ; la box se lit sur GitHub, où elle tient déjà un autre ticket du projet.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { stationDuDepot, type Lancer } from "../../src/brigade-github.ts";
import { LABEL_TAKEN } from "../../src/github-etat/etats.ts";
import { corpsDePrise } from "../../src/github-etat/prise.ts";
import { FauxGitHub, STATION_DU_DEPOT, depotNeuf, fauxClient } from "../faux-github.ts";

const N = 3869;
const CALIBRE = ["fire", "model:opus", "effort:medium", "prio:0"];
const MAC = "macbook-air-de-benoit/claude";
const BOX = "parade-box/claude";
const NPM_CI = "The gates cannot run on this station: the dependencies cannot be installed, `npm ci` is refused here.";

// `bloque` : ce que ses cooks déclarent (null : ils livrent un commit).
function station(t: TestContext, faux: FauxGitHub, nom: string, bloque: string | null) {
  const repertoire = mkdtempSync(join(tmpdir(), "acceptation-3870-"));
  t.after(() => rmSync(repertoire, { recursive: true, force: true }));
  let cooks = 0;
  const lancer: Lancer = ({ flux }) => {
    cooks += 1;
    const message = bloque !== null ? `I stopped.\n<livrable>\n<bloque>${bloque}</bloque>\n</livrable>` : "Done.\n<livrable>\nDelivered.\n</livrable>";
    writeFileSync(flux, `${JSON.stringify({ type: "result", is_error: false, result: message })}\n`);
    return { fin: Promise.resolve({ code: 0, signal: null, turns: 10, tokens: 1, durationMs: 1, arret: null, erreur: null }) };
  };
  const depot = depotNeuf(repertoire);
  const sauts = new Map<number, string>();
  const ouverte = stationDuDepot({
    ...STATION_DU_DEPOT,
    nom,
    github: fauxClient(faux, nom),
    depot: bloque === null ? { ...depot, commits: () => 1, changes: () => ["src/a.ts"], diff: () => "diff --git a/src/a.ts b/src/a.ts\n+x\n" } : depot,
    manager: () => ({ model: "opus", effort: "high" }),
    flux: repertoire,
    lancer,
    avertir: () => {},
    sauter: (ticket, ligne) => void sauts.set(ticket, ligne),
    stationsDuProjet: () => [nom],
  });
  if ("refus" in ouverte) throw new Error(ouverte.refus);
  const tour = async () => {
    sauts.clear();
    await ouverte.tour();
    await ouverte.calme();
    return sauts.get(N) ?? null;
  };
  return { tour, cooks: () => cooks };
}

// La box tient #3000, un autre ticket du projet : GitHub la dit station du projet.
function projetDeuxStations(faux: FauxGitHub) {
  faux.feu(3000, ["model:opus"]);
  faux.poster(3000, BOX, corpsDePrise(BOX));
  faux.feu(N, CALIBRE, "## Context\n\nRepair the red main.");
}
const commentaires = (faux: FauxGitHub) => (faux.commentaires.get(N) ?? []).map((c) => c.body);

test("the Mac cannot install the dependencies: the ticket goes back to the rail for the box, which takes and cooks it at once", async (t) => {
  const faux = new FauxGitHub();
  projetDeuxStations(faux);
  const mac = station(t, faux, MAC, NPM_CI);
  const box = station(t, faux, BOX, null);
  await mac.tour();
  assert.equal(mac.cooks(), 1);
  const dit = commentaires(faux).join("\n");
  assert.doesNotMatch(dit, /No other station of the project can take it/, "the box can take it");
  assert.equal(faux.ticket(N).labels.has(LABEL_TAKEN), false, "given back to the rail, not held on the Mac");
  await box.tour();
  assert.equal(box.cooks(), 1, "the box cooks it");
  assert.ok(faux.prs.some((pr) => pr.issue === N && pr.state === "open"), "the box's delivery is a PR");
});

// brigade:guard
test("no other station in the project: the ticket stays held on the Mac, which says so", async (t) => {
  const faux = new FauxGitHub();
  faux.feu(N, CALIBRE, "## Context\n\nRepair the red main.");
  const mac = station(t, faux, MAC, NPM_CI);
  await mac.tour();
  assert.match(commentaires(faux).join("\n"), /No other station of the project can take it: the ticket stays on the rail, held on `macbook-air-de-benoit\/claude`/);
});

// #3870, critère 2 : la station qui n'a pas pu cuire le ticket ne le reprend pas tant qu'une autre le peut.
// brigade:guard — moved unchanged from its own file by the closing pass #3993: it keeps guarding what main already does.
test("the Mac does not take the ticket again, turn after turn, while the box can", async (t) => {
  const faux = new FauxGitHub();
  projetDeuxStations(faux);
  const mac = station(t, faux, MAC, NPM_CI);
  await mac.tour();
  for (let tour = 0; tour < 3; tour += 1) {
    assert.match((await mac.tour()) ?? "", /cannot run its gates — it goes to parade-box\/claude/, "skipped for the box, not held for want of another station");
    assert.equal(faux.ticket(N).labels.has(LABEL_TAKEN), false, "still on the rail");
  }
  assert.equal(mac.cooks(), 1, "the Mac never cooks it again");
  // Une station redémarrée relit la marque sur l'issue.
  const relancee = station(t, faux, MAC, null);
  await relancee.tour();
  assert.equal(relancee.cooks(), 0);
});
