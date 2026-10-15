// L'urgence à l'écran : plus rien ne cuit, et c'est le chef que toute la cuisine attend. Sa ligne
// passe en tête de la bande, au-dessus de tout, marquée à part, avec ce qui est attendu, son geste et
// depuis combien de temps tout est à l'arrêt ; la case du projet la dit, autrement qu'une alerte
// (alertes.ts, « L'urgence »). Une décision qui ne retient qu'une partie du rail ne change rien.
// Ce que la box rend est écrit ici par le runtime lui-même — `faits`, `status` et `manager`, joués
// dans ce process sur un vrai journal (runtime/src/etat.ts, runtime/src/urgence.ts) : la forme que
// la bande lit est tenue contre celle que le runtime écrit.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { decrireEtat, faits as faitsDuRuntime, lireEtat } from "../../runtime/src/etat.ts";
import type { Fait } from "../../runtime/src/evenements.ts";
import { ouvrirJournal } from "../../runtime/src/journal.ts";
import { principal as manager } from "../../runtime/src/manager-cli.ts";
import { alertes, MANAGER_PAS_DIT, signalDe, tenirBandes, type Alerte, type Bande } from "../src/alertes.ts";
import { ALLUMAGE } from "../src/allumage.ts";
import { mettreAPart } from "../src/attend.ts";
import { pourLaBarre } from "../src/barre.ts";
import type { Lecture } from "../src/box.ts";
import { BOUTONS } from "../src/boutons.ts";
import { EXEMPLE, type Projet } from "../src/config.ts";
import { PALETTE } from "../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../src/cuisine.ts";
import { BANNIERE, comprendre, type Faits } from "../src/faits.ts";
import { CONFIRMES, DIRECTS, GRANTS } from "../src/gestes.ts";
import { GESTES_DES_GRANTS } from "../src/grants.ts";
import { EFFORTS, MODELES } from "../src/installation.ts";
import { GESTES_DU_MANAGER } from "../src/manager.ts";
import { ONGLETS, RUBRIQUES } from "../src/onglets.ts";
import { jouerLaVue, repos } from "./aides/fausse-vue.ts";

const JOUR = "2026-10-15";
const STATION = "box/claude";
const LIMITES = { turns: 100, durationMs: 3_600_000, tokens: 2_000_000, idleMs: 600_000 };
const pr = (ticket: number) => `https://exemple.test/pull/${ticket}`;
const heure = (h: string) => `${JOUR}T${h}.000Z`;
const lecture = (commande: string, texte: string, a: string): Lecture => ({ projet: "parade", demande: 1, a, sorties: [{ commande, texte }] });

// Une cuisine dont le test tient l'horloge, où tout va bien hors du rail — runtime en marche,
// version à jour, manager allumé —, et ce que l'app en dessine : `faits`, `status` et `manager`
// écrits par le runtime, lus comme le process principal les lit.
function cuisine(t: TestContext) {
  const repertoire = mkdtempSync(join(tmpdir(), "brigade-app-urgence-"));
  let instant = heure("08:00:00");
  const journal = ouvrirJournal(repertoire, { maintenant: () => new Date(instant) });
  t.after(() => {
    journal.fermer();
    rmSync(repertoire, { recursive: true, force: true });
  });
  const noter = (fait: Fait, ticket: number | null = null, author = "runtime") => void journal.ajouter({ project: "parade", ticket, author, ...fait });
  const a = (h: string) => void (instant = heure(h));
  const arriver = (ticket: number, zone: string[]) =>
    noter(
      { type: "ticket.arrived", payload: { title: `Ticket ${ticket}`, priority: null, createdAt: `2026-10-01T00:00:${ticket % 60}Z`, url: `https://exemple.test/${ticket}`, card: { waitsFor: [], zone, problems: [] } } },
      ticket,
      "github",
    );
  // Le ticket déjà sur le rail, pris, cuisiné, livré avec sa PR.
  const cuisiner = (ticket: number) => {
    noter({ type: "ticket.taken", payload: { station: STATION, leaseUntil: "2026-11-30T00:00:00.000Z" } }, ticket, `station:${STATION}`);
    noter({ type: "cook.launched", payload: { run: `${ticket}-aa`, limits: LIMITES, stream: `runs/${ticket}-aa.jsonl`, branch: `cook/${ticket}-aa`, worktree: `worktrees/${ticket}-aa` } }, ticket);
    noter({ type: "cook.exited", payload: { run: `${ticket}-aa`, outcome: "ok", code: 0, signal: null, turns: 3, tokens: 1000, durationMs: 1000 } }, ticket);
    noter({ type: "ticket.passing", payload: { station: STATION } }, ticket, `station:${STATION}`);
    noter({ type: "pass.started", payload: { run: `${ticket}-aa`, pr: pr(ticket), number: ticket, sha: `sha-${ticket}` } }, ticket, "pass");
  };
  // Verte, et laissée au chef : à merger à la main.
  const retenir = (ticket: number) => noter({ type: "pass.held", payload: { reason: "review-required" } } as never, ticket, "pass");
  const rendre = (h: string) => {
    const maintenant = new Date(heure(h));
    const etat = lireEtat(journal, maintenant);
    const lignes: string[] = [];
    void manager({ args: [], env: { BRIGADE_STATE_DIR: repertoire }, dire: (ligne) => void lignes.push(ligne), redire: (ligne) => assert.fail(ligne) });
    return { faits: faitsDuRuntime(etat, maintenant), status: `${decrireEtat(etat, maintenant).join("\n")}\n`, manager: `${lignes.join("\n")}\n` };
  };
  // La bande, d'après `faits` tel que la box l'a rendu — ou tel qu'un `retoucher` le donne.
  const bande = (h: string, retoucher: (faits: Record<string, unknown>) => Record<string, unknown> = (faits) => faits): Bande => {
    const rendu = rendre(h);
    const lu = heure(h);
    const bandes = tenirBandes({ etablir: 1, minimum: 0 });
    bandes.ouvrir(["parade"]);
    bandes.veiller(["parade"]);
    bandes.faits(lecture("facts", `${JSON.stringify(retoucher({ ...rendu.faits }))}\n`, lu));
    bandes.status(mettreAPart(lecture("status", rendu.status, lu)));
    return bandes.manager(lecture("manager", rendu.manager, lu));
  };
  noter({ type: "runtime.started", payload: { pid: 1, host: "box", node: "v26" } } as Fait);
  noter({ type: "manager.enabled", payload: {} }, null, "chef");
  noter({ type: "station.announced", payload: { station: STATION, engine: "claude", provides: ["opus"], maxCooks: 2 } });
  return { noter, a, arriver, cuisiner, retenir, rendre, bande };
}

// Ce que `faits` rendait avant l'urgence : la même forme, sans le champ.
const sansUrgence = ({ urgence: _, ...reste }: Record<string, unknown>) => reste;

// L'exemple du ticket : une livraison à merger à la main qui tient toutes les zones du rail.
function toutRetenu(t: TestContext) {
  const servie = cuisine(t);
  const { a, arriver, cuisiner, retenir } = servie;
  arriver(535, ["runtime", "app"]);
  arriver(536, ["runtime/src"]);
  arriver(537, ["app/src"]);
  cuisiner(535);
  a("08:30:00");
  retenir(535);
  return servie;
}

describe("l'urgence dans la bande", () => {
  test("toute la cuisine attend le merge du chef : la première ligne est l'urgence — ce qui est attendu, depuis quand tout est à l'arrêt, et le geste de la box mot pour mot", (t) => {
    const { rendre, bande } = toutRetenu(t);
    const urgence = rendre("13:58:00").faits.urgence ?? assert.fail("le runtime ne donne pas d'urgence");

    const lue = bande("13:58:00");
    const [premiere, ...reste] = lue.alertes;
    assert.equal(premiere?.sujet, "urgence");
    assert.equal(premiere.verifie, true);
    assert.equal(premiere.ton, "rouge");
    assert.equal(premiere.dit, "the whole kitchen is waiting for your merge of #535 — at a standstill for 5 h 28");
    assert.equal(premiere.pourquoi, "2 tickets held, none can cook until you act: #536, #537");
    // Ce qui attend, puis le geste du chef : la ligne du bloc `attend` que la box écrit, mot pour mot.
    assert.equal(premiere.releve, `#535  ${urgence.geste}`);
    assert.match(premiere.releve ?? "", /à relire et merger à la main : https:\/\/exemple\.test\/pull\/535$/);
    assert.equal(premiere.geste, "do what #535 waits for, as the box writes it");
    assert.deepEqual(premiere.appel, { demande: true });
    assert.match(premiere.prix, /the held tickets start again/);
    // Aucune autre ligne ne la redit.
    assert.ok(!reste.some(({ sujet }) => sujet === "urgence"));

    // La case du projet : l'urgence, pas une alerte ordinaire.
    assert.equal(lue.signal?.etat, "urgence");
    assert.match(lue.signal?.dit ?? "", /^the whole kitchen is waiting for your merge of #535/);
  });

  test("la durée d'arrêt se compte d'une lecture à l'autre, depuis le même début", (t) => {
    const { bande } = toutRetenu(t);
    assert.match(bande("09:00:00").alertes[0]?.dit ?? "", / — at a standstill for 30 min$/);
    assert.match(bande("10:15:00").alertes[0]?.dit ?? "", / — at a standstill for 1 h 45$/);
  });

  test("au-dessus de tout le reste : même devant un manager éteint et un grant éteint seul, rouges, ou des états non vérifiés", (t) => {
    const { noter, rendre, bande } = toutRetenu(t);
    noter({ type: "manager.disabled", payload: {} }, null, "chef");
    noter({ type: "grant.activated", payload: { action: "merge", until: heure("08:40:00") } }, null, "chef");

    const lue = bande("10:00:00").alertes;
    assert.deepEqual(
      lue.map(({ sujet, ton }) => [sujet, ton]),
      [
        ["urgence", "rouge"],
        ["manager", "rouge"],
        ["grant", "rouge"],
      ],
    );
    // Ni `status` ni `manager` lus : les lignes « non vérifié » restent dessous.
    const faits = comprendre(JSON.stringify(rendre("10:00:00").faits)) as Faits;
    const seuls = alertes({ projet: "parade", faits, status: { sans: "pas lu" }, manager: { sans: MANAGER_PAS_DIT } });
    assert.deepEqual(
      seuls.map(({ sujet, verifie }) => [sujet, verifie]),
      [
        ["urgence", true],
        ["manager", false],
        ["grant", false],
      ],
    );
  });

  test("deux décisions qui retiennent tout : la ligne nomme celle qui retient le plus, puis l'autre, chacune avec sa ligne de la box", (t) => {
    const { a, arriver, cuisiner, retenir, rendre, bande } = cuisine(t);
    arriver(535, ["runtime"]);
    arriver(540, ["app"]);
    arriver(536, ["runtime/src"]);
    arriver(541, ["app/src"]);
    arriver(542, ["app/test"]);
    cuisiner(535);
    cuisiner(540);
    a("08:30:00");
    retenir(535);
    a("08:40:00");
    retenir(540);

    const urgence = rendre("10:00:00").faits.urgence ?? assert.fail("pas d'urgence");
    const [premiere] = bande("10:00:00").alertes;
    assert.equal(premiere?.dit, "the whole kitchen is waiting for your merge of #540 — at a standstill for 1 h 20");
    // Les tickets à l'arrêt dans l'ordre du rail, tel que la box le donne.
    assert.deepEqual([...urgence.retenus].sort(), [536, 541, 542]);
    assert.equal(premiere.pourquoi, `3 tickets held, none can cook until you act: ${urgence.retenus.map((ticket) => `#${ticket}`).join(", ")} — also held by #535`);
    assert.equal(premiere.releve, [`#540  ${urgence.geste}`, `#535  ${urgence.autres[0]?.geste}`].join("\n"));
  });

  test("une connexion Max expirée sur la seule station : la ligne dit d'attendre la reconnexion, et le geste de la box", (t) => {
    const { a, arriver, noter, bande } = cuisine(t);
    arriver(14, ["runtime"]);
    arriver(15, ["app"]);
    a("09:00:00");
    noter({ type: "station.disconnected", payload: { station: STATION, reason: "authentication_failed", run: null } }, null, `station:${STATION}`);

    const [premiere] = bande("10:00:00").alertes;
    assert.equal(premiere?.sujet, "urgence");
    assert.equal(premiere.dit, `the whole kitchen is waiting for you to reconnect Max on ${STATION} — at a standstill for 1 h 00`);
    assert.match(premiere.releve ?? "", new RegExp(`^${STATION.replace("/", "\\/")} {2}connexion Max expirée \\(authentication_failed\\) — à rétablir : `));
  });

  test("une cause que l'app ne nomme pas se dit avec le mot de la box, sans rien inventer", () => {
    const faits = comprendre(
      JSON.stringify({
        etat: "ouverte",
        lu: heure("10:00:00"),
        dernierTick: null,
        compteurs: { rail: 1, auTravail: 0, aLaPass: 0, attend: 1, livres24h: 0 },
        dernierEvenement: null,
        rail: [],
        urgence: { decision: "#9", ticket: 9, cause: "question", geste: "une question t'attend sur l'issue", url: null, depuis: heure("09:59:00"), retenus: [10], autres: [] },
      }),
    );
    if ("informe" in faits) assert.fail(faits.informe);
    const [premiere] = alertes({ projet: "parade", faits, status: { sans: "pas lu" }, manager: { sans: MANAGER_PAS_DIT } });
    assert.equal(premiere?.dit, "the whole kitchen is waiting for you on #9 (question) — at a standstill for 1 min");
    assert.equal(premiere.pourquoi, "1 ticket held, none can cook until you act: #10");
  });
});

describe("sans urgence, rien ne change", () => {
  test("une décision qui ne retient qu'une partie du rail : pas de ligne d'urgence, la bande et la case sont celles d'avant l'urgence", (t) => {
    const { a, arriver, cuisiner, retenir, rendre, bande } = cuisine(t);
    arriver(535, ["runtime"]);
    arriver(536, ["runtime/src"]);
    arriver(540, ["app"]);
    cuisiner(535);
    a("08:30:00");
    retenir(535);

    const rendu = rendre("10:00:00").faits;
    assert.equal(rendu.urgence, null);
    assert.deepEqual(rendu.attend.map(({ ticket }) => ticket), [535]);
    const lue = bande("10:00:00");
    assert.ok(!lue.alertes.some(({ sujet }) => sujet === "urgence"));
    assert.notEqual(lue.signal?.etat, "urgence");
    assert.deepEqual(lue, bande("10:00:00", sansUrgence));
  });

  test("une cuisine qui va bien : la bande reste vide, la case sans signal", (t) => {
    const { bande } = cuisine(t);
    assert.deepEqual(bande("10:00:00"), { projet: "parade", alertes: [], signal: undefined });
  });

  test("un runtime d'avant le champ `urgence` : rien n'en est dit, et la forme reste lue", (t) => {
    const { rendre, bande } = toutRetenu(t);
    assert.notEqual(rendre("10:00:00").faits.urgence, null);
    const lue = bande("10:00:00", sansUrgence);
    assert.ok(!lue.alertes.some(({ sujet }) => sujet === "urgence"));
    assert.notEqual(lue.signal?.etat, "urgence");
  });

  test("le « stop » du chef retient la cuisine lui-même : sa ligne, pas celle de l'urgence", (t) => {
    const { noter, bande } = toutRetenu(t);
    noter({ type: "kitchen.stopped", payload: {} }, null, "chef");
    const lue = bande("10:00:00");
    assert.deepEqual(
      lue.alertes.map(({ sujet }) => sujet),
      ["cuisine"],
    );
    assert.equal(lue.signal?.etat, "alerte");
  });

  test("une urgence qui n'a pas la forme refuse `faits` entier, comme tout autre champ", () => {
    const lu = comprendre(
      JSON.stringify({ etat: "ouverte", lu: heure("10:00:00"), dernierTick: null, compteurs: { rail: 0, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 }, dernierEvenement: null, rail: [], urgence: { decision: "#9" } }),
    );
    assert.ok("informe" in lu);
    assert.match(lu.informe, /urgence\.ticket/);
  });
});

describe("l'urgence à l'écran", () => {
  const PARADE: Projet = { nom: "parade", dossier: "/tmp/parade", box: { hote: "box" } };
  const BALOO: Projet = { nom: "baloo", dossier: "/tmp/baloo", box: { hote: "box" } };
  const ouvrir = () =>
    jouerLaVue({
      demarrage: () => ({
        configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [PARADE, BALOO], hotes: ["box"] }),
        palette: PALETTE,
        exemple: EXEMPLE,
        onglets: ONGLETS,
        rubriques: RUBRIQUES,
        boutons: BOUTONS,
        gestes: { manager: GESTES_DU_MANAGER, allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, grants: { gestes: GESTES_DES_GRANTS, nommes: GRANTS }, directs: DIRECTS, confirmes: CONFIRMES },
        banniere: BANNIERE,
        calibrage: { modeles: MODELES, efforts: EFFORTS },
        code: undefined,
      }),
      espace: () => [],
    });
  const URGENTE: Alerte = { sujet: "urgence", verifie: true, ton: "rouge", dit: "the whole kitchen is waiting for your merge of #535 — at a standstill for 5 h 28", releve: "#535  livraison verte — à merger à la main", geste: "do what #535 waits for, as the box writes it", appel: { demande: true }, prix: "none" };
  const ORDINAIRE: Alerte = { sujet: "manager", verifie: true, ton: "rouge", dit: "manager off: no issue is judged, nothing new enters the rail", geste: "turn the manager on", appel: { geste: "manager-allumer" }, prix: "—" };

  test("la ligne d'urgence est posée la première, marquée « URGENT », et dit ce que la box écrit", async () => {
    const vue = await ouvrir();
    vue.element("projets").children[1]?.click();
    await repos();
    const lues = [URGENTE, ORDINAIRE];
    vue.dire("surAlertes", { projet: "parade", alertes: lues, signal: signalDe(lues) });

    const [premiere, seconde] = vue.element("alertes").children;
    assert.equal(premiere?.dataset.sujet, "urgence");
    const marque = premiere.dessous("span").find((pose) => pose.className === "urgent") ?? assert.fail("pas de marque d'urgence");
    assert.equal(marque.textContent, "URGENT");
    assert.match(premiere.textContent, /URGENTthe whole kitchen is waiting for your merge of #535 — at a standstill for 5 h 28/);
    assert.match(premiere.textContent, /#535 {2}livraison verte — à merger à la main/);
    // Une ligne ordinaire n'a pas la marque.
    assert.equal(seconde?.dataset.sujet, "manager");
    assert.equal(seconde.dessous("span").find((pose) => pose.className === "urgent"), undefined);
  });

  test("la case d'un projet dont toute la cuisine attend porte le signe de l'urgence, pas celui d'une alerte", async () => {
    const vue = await ouvrir();
    const signalDeLaCase = (rang: number) => vue.element("projets").children[rang]?.children.find((pose) => pose.className === "signal");
    vue.dire("surAlertes", { projet: "parade", alertes: [URGENTE, ORDINAIRE], signal: signalDe([ORDINAIRE, URGENTE]) });
    vue.dire("surAlertes", { projet: "baloo", alertes: [ORDINAIRE], signal: signalDe([ORDINAIRE]) });

    const urgente = signalDeLaCase(1) ?? assert.fail("pas de signal sur parade");
    assert.equal(urgente.dataset.etat, "urgence");
    assert.equal(urgente.textContent, "!!");
    assert.match(urgente.title, /^parade: the whole kitchen is waiting for your merge of #535 — at a standstill for 5 h 28 ; manager off.* — urgent: the whole kitchen is waiting for you/);
    const ordinaire = signalDeLaCase(2) ?? assert.fail("pas de signal sur baloo");
    assert.equal(ordinaire.dataset.etat, "alerte");
    assert.equal(ordinaire.textContent, "!");

    // L'urgence levée, la case reprend le signal d'une alerte.
    vue.dire("surAlertes", { projet: "parade", alertes: [ORDINAIRE], signal: signalDe([ORDINAIRE]) });
    assert.equal(signalDeLaCase(1)?.dataset.etat, "alerte");
    assert.equal(signalDeLaCase(1)?.textContent, "!");
  });
});

// La forme lue de `faits` garde l'urgence telle que le runtime la donne.
test("`faits` lu par l'app porte l'urgence du runtime, champ pour champ", (t) => {
  const { rendre } = toutRetenu(t);
  const rendu = rendre("10:00:00").faits;
  const lu = comprendre(JSON.stringify(rendu)) as Faits;
  assert.deepEqual(lu.urgence, rendu.urgence);
});
