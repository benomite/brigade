// WAITING : un ticket qui attend un tiers, et non le chef. Le chef l'y met
// (quoi, de qui, relance), l'en sort par « reprendre » (vers TODO) ou par
// « c'est arrivé » (en cuisine, sans repasser par TODO) ; la cuisine ne le
// prend jamais ; son issue le dit, et cesse de le dire quand il en sort.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { principal } from "../src/attente-cli.ts";
import { cestArrive, LABEL_WAITING, lireRelance, marquerAttentes, mettreEnAttente, PRIX_DE_L_ARRIVEE, ramenerSurNouveau, RELANCE_PAR_DEFAUT_MS, renvoyerEnCuisine, reprendre } from "../src/attente.ts";
import { attentesDuChef, decrireAttentes } from "../src/attend.ts";
import { decrireEtat, faits, lireEtat } from "../src/etat.ts";
import { ATTEND_UN_TIERS, REVENU_D_ATTENTE } from "../src/events/rail.ts";
import { ouvrirJournal, type Journal } from "../src/journal.ts";
import { lireRail, ticketDuRail } from "../src/projections/rail.ts";
import { etatLu, GesteRefuse, ouvrirRail } from "../src/rail.ts";
import { fauxGitHub, issue } from "./aides/cuisine.ts";
import { repertoireTemporaire } from "./outils.ts";

const MAINTENANT = new Date("2026-10-14T12:00:00.000Z");
const PROJET = "brigade";

function cuisine(t: TestContext) {
  const repertoire = repertoireTemporaire(t);
  const journal = ouvrirJournal(repertoire);
  t.after(() => journal.fermer());
  const rail = ouvrirRail(journal, { projet: PROJET, dureeBailMs: 600_000, maintenant: () => MAINTENANT });
  return { repertoire, journal, rail };
}

function poser(journal: Journal, ticket: number, zone: string[] = [`zone/${ticket}`]) {
  journal.ajouter({
    project: PROJET,
    ticket,
    author: "github",
    type: "ticket.arrived",
    payload: {
      title: `Ticket ${ticket}`,
      priority: null,
      createdAt: new Date(Date.parse("2026-10-01T00:00:00.000Z") + journal.dernierSeq() * 1000).toISOString(),
      url: `https://github.com/acme/brigade/issues/${ticket}`,
      card: { waitsFor: [], zone, problems: [] },
    },
  });
}

const attendre = (journal: Journal, ticket: number, relance?: Date) =>
  mettreEnAttente(journal, PROJET, ticket, { quoi: "sa validation écrite du devis", qui: "le client", ...(relance ? { relance } : {}) }, MAINTENANT);

const todo = (journal: Journal) => attentesDuChef(journal.base, lireRail(journal.base), MAINTENANT);
const revenu = (journal: Journal, ticket: number) => faits(lireEtat(journal, MAINTENANT), MAINTENANT).rail.find((r) => r.ticket === ticket)?.revenu;
const ligne = (journal: Journal, ticket: number) => decrireEtat(lireEtat(journal, MAINTENANT), MAINTENANT).find((l) => l.startsWith(`  #${ticket}  `)) ?? "";

test("mettre en WAITING : ce qu'il attend, de qui, la relance à +7 jours par défaut ; relu, il porte en plus depuis quand et ce qui se passera à l'arrivée", (t) => {
  const { journal } = cuisine(t);
  poser(journal, 8);
  const lu = attendre(journal, 8);

  assert.equal(lu.state, "86");
  assert.equal(lu.reason, ATTEND_UN_TIERS);
  assert.equal(lu.until, null);
  assert.equal(etatLu(lu), "WAITING");
  assert.deepEqual(
    { ...lu.waitingFor, onArrival: undefined },
    { what: "sa validation écrite du devis", who: "le client", since: journal.tout().at(-1)?.at, followUp: new Date(MAINTENANT.getTime() + RELANCE_PAR_DEFAUT_MS).toISOString(), onArrival: undefined },
  );
  assert.equal(lu.waitingFor?.followUp, "2026-10-21T12:00:00.000Z");
  assert.match(lu.waitingFor?.onArrival ?? "", /repart en cuisine, sans repasser par TODO/);
  const fait = journal.tout().at(-1);
  assert.deepEqual([fait?.type, fait?.author], ["ticket.waiting", "chef"]);

  // L'état du chef le dit, sur la ligne du ticket, et les faits le donnent à l'app.
  assert.match(ligne(journal, 8), /WAITING.*awaiting le client: “sa validation écrite du devis” — since .*, follow-up on 21 Oct 12:00 UTC — on arrival, it goes back to the kitchen/);
  const surLeRail = faits(lireEtat(journal, MAINTENANT), MAINTENANT).rail.find((r) => r.ticket === 8);
  assert.equal(surLeRail?.etat, "WAITING");
  assert.equal(surLeRail?.revenu, null);
  assert.deepEqual({ ...surLeRail?.tiers, depuis: undefined, aLArrivee: undefined }, { quoi: "sa validation écrite du devis", qui: "le client", relance: "2026-10-21T12:00:00.000Z", depuis: undefined, aLArrivee: undefined });

  // Le journal rejoué redonne la même attente.
  journal.reconstruire();
  assert.deepEqual(ticketDuRail(journal.base, 8)?.waitingFor, lu.waitingFor);
});

test("une relance donnée est tenue ; redire l'attente la met à jour sans changer depuis quand", (t) => {
  const { journal } = cuisine(t);
  poser(journal, 8);
  const premiere = attendre(journal, 8, lireRelance("2026-10-28", MAINTENANT));
  assert.equal(new Date(premiere.waitingFor?.followUp ?? "").getTime(), new Date(2026, 9, 28).getTime());

  const seconde = mettreEnAttente(journal, PROJET, 8, { quoi: "sa signature", qui: "le juriste", relance: lireRelance("3j", MAINTENANT) }, MAINTENANT);
  assert.deepEqual([seconde.waitingFor?.what, seconde.waitingFor?.who, seconde.waitingFor?.since], ["sa signature", "le juriste", premiere.waitingFor?.since]);
  assert.equal(seconde.waitingFor?.followUp, "2026-10-17T12:00:00.000Z");
});

test("une attente sans quoi, sans qui, à relance passée, ou d'un ticket que la cuisine tient, est refusée", (t) => {
  const { journal, rail } = cuisine(t);
  poser(journal, 8);
  poser(journal, 9);
  poser(journal, 10);
  const avant = journal.dernierSeq();
  assert.throws(() => mettreEnAttente(journal, PROJET, 8, { quoi: "  ", qui: "le client" }, MAINTENANT), GesteRefuse);
  assert.throws(() => mettreEnAttente(journal, PROJET, 8, { quoi: "un devis", qui: "" }, MAINTENANT), GesteRefuse);
  assert.throws(() => attendre(journal, 8, new Date("2026-10-14T11:00:00.000Z")), /has already passed/);
  assert.throws(() => lireRelance("2026-10-01", MAINTENANT), /has already passed/);
  assert.throws(() => lireRelance("mardi", MAINTENANT), /cannot be read/);
  assert.throws(() => attendre(journal, 404), /not on the rail/);

  assert.equal(rail.prendre("box/claude")?.ticket, 8);
  assert.throws(() => attendre(journal, 8), /a cook is working on it/);
  assert.equal(rail.prendre("box/claude")?.ticket, 9);
  rail.envoyerEnPass(9, "box/claude");
  assert.throws(() => attendre(journal, 9), /its delivery is being judged/);
  assert.equal(journal.dernierSeq(), avant + 3);
  assert.throws(() => reprendre(journal, PROJET, 10), /not waiting for a third party/);
  assert.throws(() => cestArrive(journal, PROJET, 10), /not waiting for a third party/);
});

test("la cuisine ne prend jamais un ticket en WAITING : la sélection passe à celui d'après, puis ne rend rien", (t) => {
  const { journal, rail } = cuisine(t);
  poser(journal, 8);
  poser(journal, 9);
  attendre(journal, 8);

  assert.equal(rail.servables(), 1);
  assert.equal(rail.servables(undefined, [{ station: "box/claude", fournit: [] }]), 1);
  assert.equal(rail.prendre([{ station: "box/claude", fournit: [] }])?.ticket, 9);
  assert.equal(rail.prendre("box/claude"), null);
  // Seul ce ticket-là, ou rien : il reste rien.
  assert.equal(rail.prendre("box/claude", undefined, 8), null);
  // Le relevé ne le rend pas : il n'a pas d'heure de retour.
  assert.equal(rail.relever(), 0);
  assert.equal(ticketDuRail(journal.base, 8)?.state, "86");
});

test("un ticket en WAITING n'est pas dans TODO, et ne tient pas sa zone", (t) => {
  const { journal, rail } = cuisine(t);
  poser(journal, 8, ["runtime/src"]);
  poser(journal, 9, ["runtime/src/rail.ts"]);
  // Mis de côté faute de calibrage, il attend le chef ; mis en WAITING, il ne l'attend plus.
  rail.quatreVingtSix(8, { motif: "no-calibration" });
  assert.deepEqual(todo(journal).map((a) => [a.ticket, a.quoi]), [[8, "86"]]);
  attendre(journal, 8);
  assert.deepEqual(todo(journal), []);
  assert.deepEqual(decrireAttentes(todo(journal), () => "1 min")[0], `${"awaiting".padEnd(11)}nothing awaits the chef`);
  // Sa zone ne retient pas celui qui la recouvre.
  assert.deepEqual(ticketDuRail(journal.base, 9)?.held, []);
  assert.equal(rail.prendre("box/claude")?.ticket, 9);
});

test("« reprendre » : un ticket mis de côté revient tout de suite dans TODO, dans l'état d'avant l'attente", (t) => {
  const { journal, rail } = cuisine(t);
  poser(journal, 8);
  rail.quatreVingtSix(8, { motif: "no-calibration" });
  attendre(journal, 8);

  const lu = reprendre(journal, PROJET, 8);
  assert.deepEqual([lu.state, lu.reason, lu.until, lu.waitingFor], ["86", "no-calibration", null, null]);
  assert.deepEqual(todo(journal).map((a) => [a.ticket, a.quoi]), [[8, "86"]]);
  assert.deepEqual(journal.tout().at(-1)?.payload, { to: "todo", why: "chef" });
  assert.equal(rail.prendre("box/claude"), null);
});

test("« reprendre » : un ticket qui n'était pas mis de côté revient dans TODO, avec ce qu'il attendait et les gestes — pas en cuisine", (t) => {
  const { journal, rail } = cuisine(t);
  poser(journal, 8);
  attendre(journal, 8);

  const lu = reprendre(journal, PROJET, 8);
  assert.deepEqual([lu.state, lu.reason, lu.waitingFor, etatLu(lu)], ["86", REVENU_D_ATTENTE, null, "86"]);
  // Repris par le chef : la box ne donne aucun motif de plus.
  assert.equal(revenu(journal, 8), null);
  assert.equal(rail.prendre("box/claude"), null);
  const [entree, ...autres] = todo(journal);
  assert.deepEqual([entree?.ticket, entree?.quoi, autres], [8, "repris", []]);
  const bloc = decrireAttentes(todo(journal), () => "1 min").join("\n");
  assert.match(bloc, /#8  for 1 min  back from WAITING, picked up again by the chef \(it was waiting for le client: “sa validation écrite du devis”\) — to decide: `\/brigade arrived #8` on the Kitchen board sends it back to the kitchen/);

  // De TODO, « c'est arrivé » l'envoie en cuisine.
  assert.equal(cestArrive(journal, PROJET, 8).state, "waiting");
  assert.deepEqual(todo(journal), []);
  assert.equal(rail.prendre("box/claude")?.ticket, 8);
});

test("« c'est arrivé, on repart » : le ticket en WAITING repart en cuisine sans passer par TODO", (t) => {
  const { journal, rail } = cuisine(t);
  poser(journal, 8);
  rail.quatreVingtSix(8, { motif: "no-calibration" });
  attendre(journal, 8);

  const lu = cestArrive(journal, PROJET, 8);
  assert.deepEqual([lu.state, lu.reason, lu.waitingFor, etatLu(lu)], ["waiting", null, null, "en attente"]);
  assert.deepEqual(journal.tout().at(-1)?.payload, { to: "kitchen", why: "chef" });
  // Jamais devant le chef entre les deux : aucun fait ne l'y a mis.
  assert.deepEqual(todo(journal), []);
  assert.deepEqual(
    journal.duTicket(8).map((e) => e.type),
    ["ticket.arrived", "ticket.86", "ticket.waiting", "ticket.resumed"],
  );
  assert.equal(rail.prendre("box/claude")?.ticket, 8);
});

test("l'issue d'un ticket en WAITING dit qui est attendu, quoi et jusqu'à quand ; la marque est mise à jour, puis retirée quand il en sort", async (t) => {
  const { journal } = cuisine(t);
  const gh = fauxGitHub(issue(8), issue(9));
  poser(journal, 8);
  poser(journal, 9);
  assert.equal(await marquerAttentes(journal, gh.github, PROJET), 0);

  attendre(journal, 8);
  assert.equal(await marquerAttentes(journal, gh.github, PROJET), 1);
  assert.deepEqual(gh.labellisations, [[8, [LABEL_WAITING]]]);
  assert.equal(gh.commentaires.length, 1);
  const [numero, corps] = gh.commentaires[0] ?? [];
  assert.equal(numero, 8);
  assert.match(corps ?? "", /^\*\*WAITING : en attente de le client\.\*\* sa validation écrite du devis/);
  assert.match(corps ?? "", /\*\*de qui\*\* : le client/);
  assert.match(corps ?? "", /\*\*relance\*\* : 21 oct\. 12:00 UTC/);
  assert.match(corps ?? "", /waiting resume 8.*`\/brigade arrived #8`, posté sur le tableau de la cuisine, le renvoie en cuisine/);
  assert.deepEqual(gh.lire(8)?.labels.includes(LABEL_WAITING), true);
  // Rien de neuf : rien ne se redit.
  assert.equal(await marquerAttentes(journal, gh.github, PROJET), 0);

  // Ce qu'il attend change : un commentaire de mise à jour, le label reste.
  mettreEnAttente(journal, PROJET, 8, { quoi: "sa signature", qui: "le juriste", relance: new Date("2026-10-30T09:00:00.000Z") }, MAINTENANT);
  assert.equal(await marquerAttentes(journal, gh.github, PROJET), 1);
  assert.equal(gh.labellisations.length, 1);
  assert.match(gh.commentaires[1]?.[1] ?? "", /^\*\*WAITING — mis à jour : en attente de le juriste\.\*\* sa signature[\s\S]*30 oct\. 09:00 UTC/);

  // Repris : le label est retiré, l'issue dit où il est allé.
  reprendre(journal, PROJET, 8);
  assert.equal(await marquerAttentes(journal, gh.github, PROJET), 1);
  assert.deepEqual(gh.delabellisations, [[8, LABEL_WAITING]]);
  assert.equal(gh.lire(8)?.labels.includes(LABEL_WAITING), false);
  assert.match(gh.commentaires[2]?.[1] ?? "", /^\*\*WAITING levé\*\* — n'attend plus le juriste \(« sa signature »\) : repris : il revient dans TODO/);
  assert.equal(await marquerAttentes(journal, gh.github, PROJET), 0);

  // « C'est arrivé » : de même, en le disant.
  attendre(journal, 9);
  await marquerAttentes(journal, gh.github, PROJET);
  cestArrive(journal, PROJET, 9);
  assert.equal(await marquerAttentes(journal, gh.github, PROJET), 1);
  assert.deepEqual(gh.delabellisations.at(-1), [9, LABEL_WAITING]);
  assert.match(gh.commentaires.at(-1)?.[1] ?? "", /^\*\*WAITING levé\*\* — n'attend plus le client .* c'est arrivé : il repart en cuisine/);
  assert.deepEqual(
    journal.tout().filter((e) => e.type === "waiting.marked").map((e) => [e.ticket, e.payload.waiting === null ? null : "posée"]),
    [[8, "posée"], [8, "posée"], [8, null], [9, "posée"], [9, null]],
  );
});

test("une marque que GitHub refuse n'est pas retenue : elle est reposée au réveil suivant ; un ticket parti du rail perd son label sans commentaire", async (t) => {
  const { journal } = cuisine(t);
  const gh = fauxGitHub(issue(8));
  poser(journal, 8);
  attendre(journal, 8);
  gh.pannes.commentaire = true;
  assert.equal(await marquerAttentes(journal, gh.github, PROJET), 0);
  assert.equal(journal.tout().filter((e) => e.type === "waiting.marked").length, 0);
  gh.pannes.commentaire = false;
  assert.equal(await marquerAttentes(journal, gh.github, PROJET), 1);
  assert.equal(gh.commentaires.length, 1);

  journal.ajouter({ project: PROJET, ticket: 8, author: "github", type: "ticket.left", payload: { reason: "closed" } });
  assert.equal(await marquerAttentes(journal, gh.github, PROJET), 1);
  assert.deepEqual(gh.delabellisations, [[8, LABEL_WAITING]]);
  assert.equal(gh.commentaires.length, 1);
});

test("la relance atteinte ramène le ticket en TODO au prochain passage, avec « relance du JJ/MM : pas de réponse » ; avant, rien ne bouge", (t) => {
  const { journal } = cuisine(t);
  let horloge = MAINTENANT;
  const rail = ouvrirRail(journal, { projet: PROJET, dureeBailMs: 600_000, maintenant: () => horloge });
  poser(journal, 8);
  const relance = lireRelance("2026-10-21", MAINTENANT);
  attendre(journal, 8, relance);
  horloge = new Date(relance.getTime() - 1000);
  assert.equal(rail.relever(), 0);
  assert.equal(ticketDuRail(journal.base, 8)?.waitingFor?.what, "sa validation écrite du devis");
  horloge = relance;
  assert.equal(rail.relever(), 1);
  const lu = ticketDuRail(journal.base, 8);
  assert.equal(lu?.waitingFor, null);
  assert.equal(lu?.state, "86");
  assert.equal(lu?.reason, REVENU_D_ATTENTE);
  assert.equal(lu?.resumedBecause, "relance du 21/10 : pas de réponse");
  // Ce que la box rend à l'app, mot pour mot.
  assert.equal(revenu(journal, 8), "relance du 21/10 : pas de réponse");
  assert.equal(rail.relever(), 0);
});

test("un commentaire hors brigade avant la date ramène le ticket en TODO, « nouveau sur l'issue » ; ceux de la brigade, trace comprise, n'y font rien", async (t) => {
  const { journal } = cuisine(t);
  const gh = fauxGitHub(issue(8));
  poser(journal, 8);
  gh.repondre(8, "Une question d'avant l'attente");
  attendre(journal, 8);
  await marquerAttentes(journal, gh.github, PROJET);
  assert.equal(gh.commentaires.length, 1);
  assert.equal(await ramenerSurNouveau(journal, gh.github, PROJET), 0);

  await gh.github.commenter(8, "**Rail — ticket bloqué.** autre chose de la brigade");
  await gh.github.commenter(8, "<!-- brigade:manager -->\nnote");
  assert.equal(await ramenerSurNouveau(journal, gh.github, PROJET), 0);
  assert.notEqual(ticketDuRail(journal.base, 8)?.waitingFor, null);

  gh.repondre(8, "Voici la réponse du client : c'est validé.");
  assert.equal(await ramenerSurNouveau(journal, gh.github, PROJET), 1);
  const lu = ticketDuRail(journal.base, 8);
  assert.equal(lu?.waitingFor, null);
  assert.equal(lu?.reason, REVENU_D_ATTENTE);
  assert.match(lu?.resumedBecause ?? "", /^nouveau sur l'issue — de /);
  assert.equal(revenu(journal, 8), lu?.resumedBecause);
  assert.equal(await ramenerSurNouveau(journal, gh.github, PROJET), 0);
  // L'issue le dit à son tour : label retiré, trace, sans qu'elle ne relance rien.
  assert.equal(await marquerAttentes(journal, gh.github, PROJET), 1);
  assert.equal(await ramenerSurNouveau(journal, gh.github, PROJET), 0);
});

test("la commande `waiting` : set, lister, resume, c'est arrivé — et ce qu'elle refuse", (t) => {
  const { repertoire, journal } = cuisine(t);
  poser(journal, 8);
  const lancer = (...args: string[]) => {
    const [sortie, erreur]: [string[], string[]] = [[], []];
    let code = 0;
    try {
      principal({ args, env: { BRIGADE_STATE_DIR: repertoire }, dire: (l) => void sortie.push(l), redire: (l) => void erreur.push(l) }, () => MAINTENANT);
    } catch (levee) {
      code = (levee as { code: number }).code;
    }
    return { code, sortie: sortie.join("\n"), erreur: erreur.join("\n") };
  };

  assert.deepEqual(lancer(), { code: 0, sortie: "no ticket is waiting for a third party", erreur: "" });
  const pose = lancer("set", "8", "--what", "la réponse du client", "--from", "le client", "--remind", "3j");
  assert.equal(pose.code, 0, pose.erreur);
  assert.match(pose.sortie, /^WAITING: #8  awaiting le client: “la réponse du client” — since .* follow-up on 17 Oct 12:00 UTC/);
  assert.match(lancer().sortie, /^#8  awaiting le client/);
  assert.equal(ticketDuRail(journal.base, 8)?.waitingFor?.who, "le client");

  assert.deepEqual([lancer("set", "8", "--what", "x").code, lancer("bouger", "8").code, lancer("resume").code, lancer("resume", "8", "--from", "x").code], [2, 2, 2, 2]);
  assert.match(lancer("set", "8", "--what", "x", "--from", "y", "--remind", "hier").erreur, /--remind: “hier” cannot be read/);

  assert.equal(lancer("resume", "8").code, 0);
  assert.equal(ticketDuRail(journal.base, 8)?.reason, REVENU_D_ATTENTE);
  const refus = lancer("resume", "8");
  assert.deepEqual([refus.code, /not waiting for a third party/.test(refus.erreur)], [1, true]);
  // « C'est arrivé » n'est pas une commande de la box : il passe par le tableau de la cuisine (`/brigade arrived`).
  const arrive = lancer("arrived", "8");
  assert.deepEqual([arrive.code, /unknown gesture: “arrived”/.test(arrive.erreur)], [2, true]);
  assert.equal(ticketDuRail(journal.base, 8)?.reason, REVENU_D_ATTENTE);
});

test("`renvoyerEnCuisine` joue « c'est arrivé » comme un geste du rail : fait avec son prix, ou refusé sans rien changer", (t) => {
  const { journal, rail } = cuisine(t);
  poser(journal, 8);
  poser(journal, 9);
  attendre(journal, 8);

  const avant = journal.tout().length;
  assert.deepEqual(renvoyerEnCuisine(journal, PROJET, 9), { done: false, reason: "ticket 9 is not waiting for a third party — it is queued", price: "none: nothing was changed" });
  assert.deepEqual(renvoyerEnCuisine(journal, PROJET, 404), { done: false, reason: "ticket 404 is not on the rail", price: "none: nothing was changed" });
  assert.equal(journal.tout().length, avant);

  assert.deepEqual(renvoyerEnCuisine(journal, PROJET, 8), { done: true, price: PRIX_DE_L_ARRIVEE });
  assert.equal(ticketDuRail(journal.base, 8)?.waitingFor, null);
  assert.equal(rail.prendre("box/claude")?.ticket, 8);
});
