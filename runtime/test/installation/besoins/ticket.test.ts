// Le ticket qu'ouvre le choix « le setup du projet l'apporte lui-même »
// (#1534) : tenu dans un vrai journal, ouvert sur un GitHub doublé — un seul
// par choix, même quand la réponse de GitHub se perd.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { choisir, choixDuJournal, choixPour, ICI, PROJET, TESTS, tenirLesChoix } from "../../../src/installation/besoins/besoins.ts";
import { besoinNomme } from "../../../src/installation/besoins/catalogue.ts";
import { annonceDuBesoin, ouvrirLesTicketsDans, ouvrirLesTicketsDesBesoins } from "../../../src/installation/besoins/ticket.ts";
import type { IssueOuverte } from "../../../src/github.ts";
import { ouvrirJournal } from "../../../src/journal.ts";
import { aArreter, repertoireTemporaire, temporaireDuFichier } from "../../outils.ts";

const rienNeReste = temporaireDuFichier();

const QUI = { projet: "mirrorlab", auteur: "station:box" };

const choixDe = (id: string) => choixPour({ besoin: besoinNomme(id)!, preuves: [`\`apps/api/package.json\` depends on \`${id}\``] }, { projet: "mirrorlab", station: "box", ailleurs: [] });

function unProjet(t: TestContext) {
  const repertoireEtat = repertoireTemporaire(t);
  const journal = ouvrirJournal(repertoireEtat);
  aArreter(t, () => journal.fermer());
  return { repertoireEtat, journal };
}

// Un GitHub doublé : les issues créées, celles qu'il rend depuis un instant, et
// une panne au besoin — après avoir créé l'issue, sa réponse perdue.
function unGitHub(recentes: IssueOuverte[] = []) {
  const creees: Array<{ titre: string; corps: string; labels: string[] }> = [];
  let perdre = false;
  return {
    creees,
    recentes,
    perdreLaReponse: () => void (perdre = true),
    async creerIssue(issue: { titre: string; corps: string; labels: string[] }) {
      creees.push(issue);
      const numero = 100 + creees.length;
      recentes.push({ number: numero, title: issue.titre, body: issue.corps, association: "OWNER" } as IssueOuverte);
      if (perdre) {
        perdre = false;
        throw new Error("socket hang up");
      }
      return numero;
    },
    issuesDepuis: async () => [...recentes],
  };
}

test("seul un choix laissé au projet ouvre un ticket, un seul ; un autre choix, ou un choix en attente, n'en ouvre aucun", async (t) => {
  const { journal } = unProjet(t);
  tenirLesChoix(journal, QUI, [choixDe("postgres"), choixDe("redis")]);
  const github = unGitHub();
  assert.deepEqual(await ouvrirLesTicketsDesBesoins({ journal, github, auteur: QUI }), []);
  choisir(journal, QUI, "need:redis", ICI);
  choisir(journal, QUI, "need:postgres", PROJET);
  assert.deepEqual(await ouvrirLesTicketsDesBesoins({ journal, github, auteur: QUI }), [{ id: "need:postgres", ticket: 101, ouvert: true }]);
  assert.deepEqual(await ouvrirLesTicketsDesBesoins({ journal, github, auteur: QUI }), []);
  assert.deepEqual(
    github.creees.map(({ titre }) => titre),
    ["Make the worktree setup of mirrorlab bring a Postgres database itself"],
  );
  assert.match(github.creees[0]!.corps, /must provide a Postgres database to the tests on its own/);
  assert.match(github.creees[0]!.corps, /For instance, it starts a throwaway Postgres server of its own/);

  // Le chef change d'avis, puis revient au projet : son ticket est déjà ouvert.
  choisir(journal, QUI, "need:postgres", TESTS);
  const change = choixDuJournal(journal.base).find(({ id }) => id === "need:postgres")!;
  assert.equal("ticket" in change, false);
  choisir(journal, QUI, "need:postgres", PROJET);
  assert.deepEqual(await ouvrirLesTicketsDesBesoins({ journal, github, auteur: QUI }), []);
  assert.equal(github.creees.length, 1);
  const repris = choixDuJournal(journal.base).find(({ id }) => id === "need:postgres")!;
  assert.equal(repris.status === "chosen" ? repris.ticket : null, 101);
});

test("la réponse de GitHub perdue, l'issue créée se retrouve par sa marque : aucune seconde ; une issue qui porte la marque sans être de confiance ne compte pas", async (t) => {
  const { journal } = unProjet(t);
  tenirLesChoix(journal, QUI, [choixDe("postgres")]);
  choisir(journal, QUI, "need:postgres", PROJET);

  const github = unGitHub();
  github.perdreLaReponse();
  await assert.rejects(ouvrirLesTicketsDesBesoins({ journal, github, auteur: QUI }), /socket hang up/);
  assert.equal(github.creees.length, 1);
  assert.equal(annonceDuBesoin(github.creees[0]!.corps, "mirrorlab", "postgres"), journal.tout().find(({ type }) => type === "need.ticket-opening")!.seq);
  assert.deepEqual(await ouvrirLesTicketsDesBesoins({ journal, github, auteur: QUI }), [{ id: "need:postgres", ticket: 101, ouvert: false }]);
  assert.equal(github.creees.length, 1);
  assert.deepEqual(journal.tout().at(-1)?.payload, { id: "need:postgres", need: "postgres", ticket: 101, reconciled: true });

  // Ailleurs : une issue d'un inconnu porte la marque de l'annonce — elle n'est pas la sienne.
  const autre = unProjet(t);
  tenirLesChoix(autre.journal, QUI, [choixDe("postgres")]);
  choisir(autre.journal, QUI, "need:postgres", PROJET);
  const panne = unGitHub();
  panne.perdreLaReponse();
  await assert.rejects(ouvrirLesTicketsDesBesoins({ journal: autre.journal, github: panne, auteur: QUI }));
  for (const issue of panne.recentes) issue.association = "NONE";
  assert.deepEqual(await ouvrirLesTicketsDesBesoins({ journal: autre.journal, github: panne, auteur: QUI }), [{ id: "need:postgres", ticket: 102, ouvert: true }]);
});

test("un choix abandonné — la station a désormais le besoin — oublie son ticket : le besoin revenu et laissé de nouveau au projet en ouvre un neuf", async (t) => {
  const { journal } = unProjet(t);
  const github = unGitHub();
  tenirLesChoix(journal, QUI, [choixDe("postgres")], { "need:postgres": PROJET });
  await ouvrirLesTicketsDesBesoins({ journal, github, auteur: QUI });
  tenirLesChoix(journal, QUI, []);
  assert.deepEqual(choixDuJournal(journal.base), []);
  tenirLesChoix(journal, QUI, [choixDe("postgres")], { "need:postgres": PROJET });
  assert.deepEqual(await ouvrirLesTicketsDesBesoins({ journal, github, auteur: QUI }), [{ id: "need:postgres", ticket: 102, ouvert: true }]);
});

test("sur un répertoire d'état, GitHub n'est ouvert que s'il y a un ticket à ouvrir, et refermé ensuite", async (t) => {
  const { repertoireEtat, journal } = unProjet(t);
  tenirLesChoix(journal, QUI, [choixDe("postgres")]);
  let ouverts = 0;
  let fermes = 0;
  const github = unGitHub();
  const ouvrir = () => {
    ouverts++;
    return { ...github, fermer: () => void fermes++ };
  };
  assert.deepEqual(await ouvrirLesTicketsDans(repertoireEtat, QUI, ouvrir), []);
  assert.equal(ouverts, 0);
  choisir(journal, QUI, "need:postgres", PROJET);
  assert.deepEqual(await ouvrirLesTicketsDans(repertoireEtat, QUI, ouvrir), [{ id: "need:postgres", ticket: 101, ouvert: true }]);
  assert.deepEqual([ouverts, fermes], [1, 1]);
});

test("ce fichier ne laisse rien dans le répertoire temporaire", () => rienNeReste());
