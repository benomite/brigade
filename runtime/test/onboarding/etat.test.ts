// L'onboarding d'un projet neuf, calculé de ses faits : les quatre étapes dans
// l'ordre, la courante, le geste attendu du chef, le ticket de préparation.
import assert from "node:assert/strict";
import { test } from "node:test";
import { etatDOnboarding, type Entrees, type FaitsDePreparation, type Onboarding } from "../../src/onboarding/etat.ts";

const URL_433 = "https://github.com/BOBL-tech/mirrorlab/issues/433";

const servi: Entrees = {
  projet: "mirrorlab",
  depot: "BOBL-tech/mirrorlab",
  station: "macbook",
  suivi: { etat: "servi", dit: "served by macbook", autoriser: [] },
  clone: true,
  sansBacASable: false,
  decision: null,
  preparation: null,
  premierTicket: null,
  dejaServi: false,
};

const preparation = (faits: Partial<FaitsDePreparation>): FaitsDePreparation => ({ ticket: 433, rail: null, sort: null, pass: null, ...faits });
const surLeRail = (rail: Partial<NonNullable<FaitsDePreparation["rail"]>>): FaitsDePreparation =>
  preparation({ rail: { etat: "waiting", station: null, raison: null, retour: null, url: URL_433, ...rail } });

const etats = (onboarding: Onboarding) => Object.fromEntries(onboarding.etapes.map(({ etape, etat }) => [etape, etat]));
const etape = (onboarding: Onboarding, nom: string) => onboarding.etapes.find(({ etape }) => etape === nom);

test("quatre étapes, toujours dans le même ordre, chacune avec son titre et une phrase", () => {
  const onboarding = etatDOnboarding({ ...servi, preparation: surLeRail({ etat: "taken", station: "macbook" }) });
  assert.deepEqual(
    onboarding.etapes.map(({ etape, titre }) => [etape, titre]),
    [
      ["depot", "Repository"],
      ["machine", "Cooking machine"],
      ["preparation", "Repository preparation"],
      ["premier-ticket", "First ticket"],
    ],
  );
  // Une phrase chacune : un nom de station ou de projet garde sa casse.
  for (const { dit } of onboarding.etapes) assert.match(dit, /^\S[^\n]*\.$/, dit);
});

test("aucune station choisie : le dépôt est ajouté, la machine est l'étape courante, et le geste dit de choisir une station dans l'app", () => {
  const onboarding = etatDOnboarding({ ...servi, station: null, suivi: null, clone: false, sansBacASable: null });
  assert.equal(onboarding.courante, "machine");
  assert.deepEqual(etats(onboarding), { depot: "faite", machine: "courante", preparation: "a-venir", "premier-ticket": "a-venir" });
  assert.equal(etape(onboarding, "machine")?.dit, "No station cooks mirrorlab yet.");
  assert.deepEqual(etape(onboarding, "machine")?.geste, { quoi: "Choose the station that cooks mirrorlab.", ou: "In the app, on the project's page.", liens: [] });
  assert.equal(onboarding.etat, "en-cours");
  assert.equal(onboarding.termine, false);
  assert.equal(onboarding.preparation, null);
  assert.equal(onboarding.sansBacASable, null);
});

test("l'accès au dépôt bloqué, le clone fait : le dépôt reste l'étape courante, sa raison et son geste sur la station ; la machine attend sans le redire", () => {
  const acces = { bloque: "fetch" as const, raison: "macbook cannot fetch from BOBL-tech/mirrorlab: git has no credentials for https://github.com and no credential helper to ask for them (git: could not read Username).", geste: "Run `gh auth setup-git` on macbook, under the account that runs it: git then takes its credentials from gh." };
  const onboarding = etatDOnboarding({ ...servi, suivi: { etat: "refuse", dit: `${acces.raison} ${acces.geste}`, autoriser: [], acces }, clone: true });
  assert.equal(onboarding.courante, "depot");
  assert.equal(etape(onboarding, "depot")?.dit, acces.raison);
  assert.deepEqual(etape(onboarding, "depot")?.geste, { quoi: acces.geste, ou: "On macbook, under the account that runs it.", liens: [] });
  assert.equal(etape(onboarding, "machine")?.dit, "macbook opens the kitchen of mirrorlab once it may fetch from and push to its repository.");
});

test("les Apps de brigade à autoriser : le dépôt est l'étape courante, le geste porte les pages GitHub où les autoriser", () => {
  const pages = ["https://github.com/apps/brigade-cook/installations/new"];
  const onboarding = etatDOnboarding({ ...servi, suivi: { etat: "a-autoriser", dit: "authorize brigade", autoriser: pages }, clone: false });
  assert.equal(onboarding.courante, "depot");
  assert.deepEqual(etape(onboarding, "depot")?.geste, { quoi: "Authorize brigade's GitHub Apps on BOBL-tech/mirrorlab.", ou: "On GitHub, one click per page.", liens: pages });
  // Une étape à venir n'attend aucun geste.
  assert.ok(onboarding.etapes.filter(({ etat }) => etat !== "courante").every(({ geste }) => geste === null));
});

test("préparation en cours : le ticket est sur le rail, en attente ou entre les mains d'un cook — son lien et son état sont exposés", () => {
  const attend = etatDOnboarding({ ...servi, preparation: surLeRail({ etat: "waiting" }) });
  assert.equal(attend.courante, "preparation");
  assert.deepEqual(etats(attend), { depot: "faite", machine: "faite", preparation: "courante", "premier-ticket": "a-venir" });
  assert.deepEqual(attend.preparation, { ticket: 433, url: URL_433, etat: "en-cours", raison: null, prochainEssai: null, pr: null });
  assert.equal(etape(attend, "preparation")?.geste, null);

  const prise = etatDOnboarding({ ...servi, preparation: surLeRail({ etat: "taken", station: "macbook" }) });
  assert.equal(prise.preparation?.etat, "en-cours");
  assert.equal(etape(prise, "preparation")?.dit, "A cook on macbook prepares BOBL-tech/mirrorlab (#433).");

  // Ouvert, pas encore lu par la cuisine : son lien se fait de son dépôt.
  const ouvert = etatDOnboarding({ ...servi, preparation: preparation({}) });
  assert.deepEqual(ouvert.preparation, { ticket: 433, url: URL_433, etat: "en-cours", raison: null, prochainEssai: null, pr: null });

  // Pas encore ouvert : l'étape le dit, sans ticket.
  const aOuvrir = etatDOnboarding(servi);
  assert.equal(aOuvrir.courante, "preparation");
  assert.equal(aOuvrir.preparation, null);
  assert.match(etape(aOuvrir, "preparation")?.dit ?? "", /^macbook opens the ticket that prepares BOBL-tech\/mirrorlab/);
});

test("préparation en échec : la raison en une phrase et l'heure du prochain essai — un échec du projet dit le geste et où le faire", () => {
  const onboarding = etatDOnboarding({ ...servi, preparation: surLeRail({ etat: "86", station: "macbook", raison: "worktree-failed", retour: "2026-10-20T10:59:00.000Z" }) });
  assert.equal(onboarding.courante, "preparation");
  assert.deepEqual(onboarding.preparation, {
    ticket: 433,
    url: URL_433,
    etat: "en-echec",
    raison: "The worktree cannot be prepared.",
    prochainEssai: "2026-10-20T10:59:00.000Z",
    pr: null,
  });
  assert.equal(etape(onboarding, "preparation")?.dit, "The cook of #433 failed — the worktree cannot be prepared; it is retried by itself.");
  assert.deepEqual(etape(onboarding, "preparation")?.geste, {
    quoi: "Look at the box's repository (disk, permissions, remote, integration branch).",
    ou: "On macbook.",
    liens: [],
  });

  // Une cause qui n'est pas celle du projet : sa raison, sans geste ; sans heure de retour, il ne repart pas seul.
  const gele = etatDOnboarding({ ...servi, preparation: surLeRail({ etat: "86", raison: "pass:unjudged", retour: null }) });
  assert.equal(gele.preparation?.raison, "The pass could not judge its delivery.");
  assert.equal(gele.preparation?.prochainEssai, null);
  assert.match(etape(gele, "preparation")?.dit ?? "", /it is not retried by itself\.$/);
  assert.equal(etape(gele, "preparation")?.geste, null);
});

test("préparation à relire : sa PR est exposée ; quand la pass s'arrête sur elle, le geste est de la relire et la merger", () => {
  const pr = "https://github.com/BOBL-tech/mirrorlab/pull/434";
  const jugee = etatDOnboarding({ ...servi, preparation: { ...surLeRail({ etat: "pass" }), pass: { phase: "judging", pr } } });
  assert.equal(jugee.courante, "preparation");
  assert.equal(jugee.preparation?.etat, "a-relire");
  assert.equal(jugee.preparation?.pr, pr);
  assert.equal(etape(jugee, "preparation")?.geste, null);

  const arretee = etatDOnboarding({ ...servi, preparation: { ...surLeRail({ etat: "pass" }), pass: { phase: "held", pr } } });
  assert.equal(arretee.preparation?.etat, "a-relire");
  assert.deepEqual(etape(arretee, "preparation")?.geste, { quoi: "Review and merge the preparation PR.", ou: "On GitHub.", liens: [pr] });
});

test("une station dont les cooks tournent sans bac à sable, décision prise : l'état l'expose, et l'étape de la machine le dit", () => {
  const decide = { ...servi, sansBacASable: true, decision: { station: "macbook" } };
  const onboarding = etatDOnboarding({ ...decide, preparation: surLeRail({ etat: "waiting" }) });
  assert.equal(onboarding.sansBacASable, true);
  assert.equal(onboarding.decisionAttendue, false);
  assert.match(etape(onboarding, "machine")?.dit ?? "", /^macbook cooks mirrorlab: its cooks run without a sandbox/);
  assert.equal(etatDOnboarding({ ...servi, sansBacASable: false }).sansBacASable, false);
});

test("sans bac à sable et sans décision : la décision est attendue, la machine est l'étape courante, le geste offre les deux choix", () => {
  const onboarding = etatDOnboarding({ ...servi, sansBacASable: true });
  assert.equal(onboarding.decisionAttendue, true);
  assert.equal(onboarding.courante, "machine");
  assert.equal(onboarding.termine, false);
  assert.match(etape(onboarding, "machine")?.dit ?? "", /^macbook has no sandbox.*Nothing is launched for mirrorlab until you choose\.$/);
  assert.equal(etape(onboarding, "machine")?.geste?.quoi, "Continue without a sandbox on macbook, or choose another station for mirrorlab.");
});

test("la décision se lève par l'acceptation, ou par une autre station — elle ne se reprend pas pour la nouvelle", () => {
  const sans = { ...servi, sansBacASable: true };
  assert.equal(etatDOnboarding({ ...sans, decision: { station: "macbook" } }).decisionAttendue, false);
  // Une autre station : la décision prise pour macbook ne vaut pas pour elle.
  assert.equal(etatDOnboarding({ ...sans, station: "mini", decision: { station: "macbook" } }).decisionAttendue, true);
  assert.equal(etatDOnboarding({ ...sans, station: "mini", decision: { station: "mini" } }).decisionAttendue, false);
  // Un bac à sable configuré, ou inconnu, ne retient jamais ; pas de station, rien à décider.
  assert.equal(etatDOnboarding({ ...servi, sansBacASable: false }).decisionAttendue, false);
  assert.equal(etatDOnboarding({ ...servi, sansBacASable: null }).decisionAttendue, false);
  assert.equal(etatDOnboarding({ ...sans, station: null, suivi: null }).decisionAttendue, false);
});

test("prêt : la préparation mergée, le premier ticket peut être posé — l'onboarding est fini, et la dernière étape dit le geste", () => {
  const onboarding = etatDOnboarding({ ...servi, preparation: { ...surLeRail({ etat: "served" }), sort: { issue: "served", raison: null } } });
  assert.equal(onboarding.etat, "pret");
  assert.equal(onboarding.termine, true);
  assert.equal(onboarding.courante, "premier-ticket");
  assert.deepEqual(etats(onboarding), { depot: "faite", machine: "faite", preparation: "faite", "premier-ticket": "courante" });
  assert.equal(onboarding.preparation?.etat, "faite");
  assert.equal(etape(onboarding, "premier-ticket")?.dit, "mirrorlab is ready: post your first ticket with the `fire` label.");
  assert.deepEqual(etape(onboarding, "premier-ticket")?.geste, {
    quoi: "Post your first ticket with the `fire` label.",
    ou: "On GitHub, in the issues of BOBL-tech/mirrorlab.",
    liens: ["https://github.com/BOBL-tech/mirrorlab/issues/new"],
  });

  // Le premier ticket posé : toutes les étapes sont faites, aucune n'est courante.
  const pose = etatDOnboarding({ ...servi, preparation: preparation({ sort: { issue: "served", raison: null } }), premierTicket: { ticket: 440, url: "https://github.com/BOBL-tech/mirrorlab/issues/440" } });
  assert.equal(pose.courante, null);
  assert.equal(pose.termine, true);
  assert.ok(pose.etapes.every(({ etat, geste }) => etat === "faite" && geste === null));
});

test("la préparation fermée sans merge libère le rail : prêt ; son label `fire` retiré la suspend : le geste est de le remettre", () => {
  const fermee = etatDOnboarding({ ...servi, preparation: preparation({ sort: { issue: "left", raison: "closed" } }) });
  assert.equal(fermee.etat, "pret");
  assert.equal(fermee.preparation?.etat, "abandonne");

  const suspendue = etatDOnboarding({ ...servi, preparation: preparation({ sort: { issue: "left", raison: "unfired" } }) });
  assert.equal(suspendue.etat, "en-cours");
  assert.equal(suspendue.preparation?.etat, "suspendu");
  assert.deepEqual(etape(suspendue, "preparation")?.geste, { quoi: "Put the `fire` label back on #433.", ou: "On GitHub, on #433.", liens: [URL_433] });
});

test("un projet qui servait déjà avant tout ticket de préparation n'a rien à préparer : prêt", () => {
  const onboarding = etatDOnboarding({ ...servi, dejaServi: true, premierTicket: { ticket: 12, url: "https://github.com/BOBL-tech/mirrorlab/issues/12" } });
  assert.equal(onboarding.etat, "pret");
  assert.equal(onboarding.courante, null);
});

test("ce que la station dit d'un refus ou d'un clone qui échoue devient la phrase de l'étape où le projet attend", () => {
  const clone = etatDOnboarding({ ...servi, suivi: { etat: "refuse", dit: "the station could not clone BOBL-tech/mirrorlab; it retries — disk full", autoriser: [] }, clone: false });
  assert.equal(clone.courante, "depot");
  assert.equal(etape(clone, "depot")?.dit, "The station could not clone BOBL-tech/mirrorlab; it retries — disk full.");

  const refus = etatDOnboarding({ ...servi, suivi: { etat: "refuse", dit: "the station refuses to serve it — no sandbox", autoriser: [] } });
  assert.equal(refus.courante, "machine");
  assert.equal(etape(refus, "machine")?.dit, "The station refuses to serve it — no sandbox.");
});
