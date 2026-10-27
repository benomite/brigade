// La porte de TODO : deux sortes de cartes y entrent — un choix de produit, une
// validation de design —, chacune avec une seule question et au moins un
// choix ; une carte design montre ses captures avant et après, celles que la
// livraison du ticket porte. Le refus s'écrit au journal avec sa raison, et la
// carte refusée n'est pas dans la file du chef : elle est renvoyée au triage.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { attentesDuChef } from "../src/attend.ts";
import type { Captures } from "../src/captures.ts";
import { cartesEnTodo, cartesRetenues, entreesParType, entrerDansTodo, jugerCarte, sortirDeTodo, type Proposition } from "../src/carte-todo.ts";
import { decrireEtat, faits, lireEtat } from "../src/etat.ts";
import type { Fait } from "../src/evenements.ts";
import { ouvrirJournal } from "../src/journal.ts";
import { lireRail } from "../src/projections/rail.ts";
import { principal as status } from "../src/status.ts";
import { aArreter, appeler, DEPOT, JOUR_HORLOGE, repertoireTemporaire } from "./outils.ts";

const PROJET = "brigade";
const MAINTENANT = new Date(`${JOUR_HORLOGE}T12:00:00.000Z`);

const PRODUIT: Proposition = {
  type: "product",
  resume: "The ticket adds a saved list. It can be kept per project or shared by all of them.",
  enonce: "One list per project, or one for all projects?",
  choix: [{ texte: "One list per project." }, { texte: "One list for all projects.", suite: "resume" }],
};
const DESIGN: Proposition = {
  type: "design",
  resume: "The empty rail now says what to do next.",
  enonce: "Is the empty rail screen right?",
  choix: [
    { texte: "Yes, merge it.", suite: "merge" },
    { texte: "No, the empty state says too little.", suite: "resume" },
  ],
};
const CAPTURES: Captures = { sha: "c0ffee", screens: [{ screen: "rail-vide", before: "docs/captures/2/rail-vide-avant.png", after: "docs/captures/2/rail-vide-apres.png" }] };

function cuisine(t: TestContext) {
  const journal = ouvrirJournal(repertoireTemporaire(t), { maintenant: () => new Date(`${JOUR_HORLOGE}T10:00:00.000Z`) });
  aArreter(t, () => journal.fermer());
  const noter = (fait: Fait, ticket: number, author = "runtime") => journal.ajouter({ project: PROJET, ticket, author, ...fait });
  const arriver = (ticket: number) =>
    noter(
      {
        type: "ticket.arrived",
        payload: { title: `Ticket ${ticket}`, priority: null, createdAt: "2026-10-01T00:00:00Z", url: `https://exemple.test/${ticket}`, card: { waitsFor: [], zone: [], problems: [] } },
      },
      ticket,
      "github",
    );
  // La livraison du ticket, avec les captures que la station y a lues.
  const livrer = (ticket: number, captures: Captures) =>
    noter({ type: "cook.reported", payload: { run: `cook-${ticket}`, ending: "done", reason: null, summary: null, branch: `cook/${ticket}-x`, pr: null, captures } }, ticket, "station:box/claude");
  const todo = () => attentesDuChef(journal.base, lireRail(journal.base), MAINTENANT);
  // Les lignes du bloc `awaiting` de `status` : ce que le chef lit de TODO.
  const bloc = () => {
    const lignes = decrireEtat(lireEtat(journal, MAINTENANT), MAINTENANT);
    return lignes.slice(lignes.findIndex((ligne) => ligne.startsWith("awaiting")), lignes.indexOf("end awaiting"));
  };
  const refus = () => journal.base.lire<{ ticket: number; payload: string }>("SELECT ticket, payload FROM events WHERE type = 'todo.refused' ORDER BY seq").map(({ ticket, payload }) => ({ ticket, ...JSON.parse(payload) }));
  return { journal, noter, arriver, livrer, todo, bloc, refus };
}

test("un choix de produit et une validation de design entrent dans TODO, avec leur question et leurs choix, dans `status` comme dans `facts`", (t) => {
  const { journal, arriver, livrer, todo, bloc } = cuisine(t);
  for (const ticket of [1, 2]) arriver(ticket);
  livrer(2, CAPTURES);
  const entrees = [entrerDansTodo(journal, PROJET, 1, { ...PRODUIT, enonce: `  ${PRODUIT.enonce}  ` }, "manager"), entrerDansTodo(journal, PROJET, 2, { ...DESIGN, type: "Design" }, "pass")];
  assert.deepEqual(
    entrees.map((entree) => entree.porte),
    ["todo", "todo"],
  );

  assert.deepEqual(
    todo().map((attente) => (attente.quoi === "carte" ? { ticket: attente.ticket, ...attente.carte } : attente.quoi)),
    [
      {
        ticket: 1,
        type: "product",
        resume: PRODUIT.resume,
        question: "One list per project, or one for all projects?",
        choix: [
          { texte: "One list per project.", suite: "resume" },
          { texte: "One list for all projects.", suite: "resume" },
        ],
        captures: null,
      },
      {
        ticket: 2,
        type: "design",
        resume: DESIGN.resume,
        question: "Is the empty rail screen right?",
        choix: [
          { texte: "Yes, merge it.", suite: "merge" },
          { texte: "No, the empty state says too little.", suite: "resume" },
        ],
        captures: CAPTURES,
      },
    ],
  );
  const lignes = bloc();
  assert.match(lignes[0] ?? "", /^awaiting {3}2 decisions await the chef — the oldest for /);
  assert.match(lignes[1] ?? "", /^ {2}#1 {2}for .* {2}product: One list per project, or one for all projects\? — choices: 1\. One list per project\. · 2\. One list for all projects\. {2}Ticket 1$/);
  assert.match(lignes[2] ?? "", /^ {2}#2 {2}for .* {2}design: Is the empty rail screen right\? — choices: 1\. Yes, merge it\. · 2\. No, the empty state says too little\. — captures: 1 screen, before and after {2}Ticket 2$/);

  const attend = faits(lireEtat(journal, MAINTENANT), MAINTENANT, DEPOT).attend;
  assert.deepEqual(attend[0]?.decision, { quoi: "carte", motif: "product", cause: "One list per project, or one for all projects?", pr: null });
  // L'entrée est au journal, au nom de qui l'a posée.
  const entreesAuJournal = journal.base.lire<{ ticket: number; author: string; payload: string }>("SELECT ticket, author, payload FROM events WHERE type = 'todo.entered' ORDER BY seq");
  assert.deepEqual(
    entreesAuJournal.map(({ ticket, author, payload }) => [ticket, author, JSON.parse(payload).kind]),
    [
      [1, "manager", "product"],
      [2, "pass", "design"],
    ],
  );
});

test("une validation de design montre ses captures avant et après ; un choix de produit sans écran n'en montre aucune", (t) => {
  const { journal, arriver, livrer } = cuisine(t);
  for (const ticket of [2, 3]) arriver(ticket);
  livrer(2, CAPTURES);
  entrerDansTodo(journal, PROJET, 2, DESIGN, "pass");
  entrerDansTodo(journal, PROJET, 3, PRODUIT, "manager");

  const [design, produit] = cartesEnTodo(journal.base);
  assert.deepEqual(design?.captures?.screens, [{ screen: "rail-vide", before: "docs/captures/2/rail-vide-avant.png", after: "docs/captures/2/rail-vide-apres.png" }]);
  assert.equal(produit?.captures, null);

  // Dans `facts`, par leur adresse au commit qui les porte.
  const attend = faits(lireEtat(journal, MAINTENANT), MAINTENANT, DEPOT).attend;
  assert.deepEqual(attend.find(({ ticket }) => ticket === 2)?.carte?.captures, {
    complet: true,
    ecrans: [
      {
        ecran: "rail-vide",
        avant: `https://github.com/${DEPOT}/blob/c0ffee/docs/captures/2/rail-vide-avant.png?raw=true`,
        apres: `https://github.com/${DEPOT}/blob/c0ffee/docs/captures/2/rail-vide-apres.png?raw=true`,
      },
    ],
  });
  assert.equal(attend.find(({ ticket }) => ticket === 3)?.carte?.captures, null);
});

test("une carte qui n'est ni un choix de produit ni une validation de design est refusée, et renvoyée au triage", (t) => {
  const { journal, arriver, todo, refus } = cuisine(t);
  arriver(4);
  for (const type of ["gesture", "merge", "produit", undefined, null, "  "]) {
    const entree = entrerDansTodo(journal, PROJET, 4, { ...PRODUIT, type }, "pass");
    assert.equal(entree.porte, "triage", String(type));
    assert.match(entree.porte === "triage" ? (entree.raison ?? "") : "", /a TODO card is a product choice \(product\) or a design validation \(design\)|only a product choice \(product\) or a design validation \(design\) reaches the chef/);
  }
  assert.deepEqual(todo(), []);
  assert.deepEqual(
    refus().map(({ kind }) => kind),
    ["gesture", "merge", "produit", null, null, null],
  );
  assert.equal(refus()[0]?.reason, "“gesture” is not a TODO card: only a product choice (product) or a design validation (design) reaches the chef");
  // Renvoyée au triage : retenue, avec ce qui a été proposé et pourquoi la porte l'a refusée.
  const [retenue] = cartesRetenues(journal.base);
  assert.deepEqual([retenue?.ticket, retenue?.auteur, retenue?.enonce, retenue?.refus], [4, "pass", PRODUIT.enonce, refus().at(-1)?.reason]);
  assert.deepEqual(retenue?.choix, [
    { texte: "One list per project.", suite: null },
    { texte: "One list for all projects.", suite: "resume" },
  ]);
});

test("une carte sans exactement une question et au moins un choix est refusée", () => {
  const raison = (proposition: Proposition) => {
    const jugement = jugerCarte({ ...PRODUIT, ...proposition });
    return jugement.admise ? "admise" : jugement.raison;
  };
  for (const enonce of [undefined, null, "", "  "]) assert.equal(raison({ enonce }), "no question: a TODO card asks the chef exactly one question");
  for (const enonce of ["One list\nor several?", "One list\r\nor several?"]) assert.equal(raison({ enonce }), "question on several lines: a TODO card asks one question, on one line");
  for (const enonce of ["Choose the list layout.", "One list? Or several?", "One list or several? Answer quickly", "Which list?? Say it?"]) {
    assert.equal(raison({ enonce }), "not exactly one question: a TODO card asks one question, ending with its only “?”", enonce);
  }
  for (const choix of [undefined, null, []]) assert.equal(raison({ choix }), "no choice: a TODO card offers at least one choice to click");
  assert.equal(raison({ choix: [{ texte: "A." }, { texte: "  " }] }), "choice 2 is empty or on several lines: each choice is one line");
  assert.equal(raison({ choix: [{ texte: "A\nand B." }] }), "choice 1 is empty or on several lines: each choice is one line");
  assert.equal(raison({ choix: [{ texte: "A." }, { texte: " A. " }] }), "choice 2 repeats another: each choice is a different way");
  assert.equal(raison({ choix: [{ texte: "A.", suite: "close" }] }), "choice 1: unknown follow-up “close” — resume or merge or drop");
  // La forme unique (carte-todo/forme.ts) : un seul choix est un seul geste, qui ne pose pas de question —
  // une carte de la porte, qui en pose une, offre au moins deux choix.
  assert.equal(raison({ choix: [{ texte: "Keep it as is." }] }), "a single gesture with a question: a card with one choice shows its button and asks nothing");
  assert.deepEqual(jugerCarte({ ...PRODUIT, choix: [{ texte: "Keep it as is." }, { texte: "Drop it.", suite: "drop" }] }), {
    admise: true,
    carte: {
      type: "product",
      resume: PRODUIT.resume,
      question: PRODUIT.enonce,
      choix: [
        { texte: "Keep it as is.", suite: "resume" },
        { texte: "Drop it.", suite: "drop" },
      ],
      captures: null,
    },
  });
});

test("une validation de design sans ses captures avant et après est refusée", (t) => {
  assert.equal((jugerCarte(DESIGN) as { raison: string }).raison, "design card without its captures: a design validation shows each screen before and after, as its delivery carries them");
  assert.equal((jugerCarte(DESIGN, { sha: "c0ffee", screens: [] }) as { raison: string }).raison, "design card without its captures: a design validation shows each screen before and after, as its delivery carries them");
  const sansApres: Captures = { sha: "c0ffee", screens: [{ screen: "fiche", before: "docs/captures/6/fiche-avant.png", after: null }] };
  assert.match((jugerCarte(DESIGN, sansApres) as { raison: string }).raison, /^design card with incomplete captures \(missing: la capture après de `fiche`\)/);

  // Sur le journal : sans livraison qui les porte, renvoyée au triage ; livrées, elle entre.
  const { journal, arriver, livrer } = cuisine(t);
  arriver(6);
  assert.equal(entrerDansTodo(journal, PROJET, 6, DESIGN, "station:box/claude").porte, "triage");
  livrer(6, { sha: "beef", screens: [{ screen: "fiche", before: "docs/captures/6/fiche-avant.png", after: "docs/captures/6/fiche-apres.png" }] });
  assert.equal(entrerDansTodo(journal, PROJET, 6, DESIGN, "station:box/claude").porte, "todo");
  assert.deepEqual(cartesEnTodo(journal.base).map(({ ticket, captures }) => [ticket, captures?.sha]), [[6, "beef"]]);
  // Entrée, elle n'est plus retenue.
  assert.deepEqual(cartesRetenues(journal.base), []);
});

test("une carte sort de TODO par son geste, quand son ticket quitte le rail ou est servi ; une nouvelle carte remplace l'ancienne ; un refus ne touche pas la carte en place", (t) => {
  const { journal, noter, arriver, todo } = cuisine(t);
  for (const ticket of [7, 8, 9]) arriver(ticket);
  for (const ticket of [7, 8, 9]) entrerDansTodo(journal, PROJET, ticket, { ...PRODUIT, enonce: `Which choice for #${ticket}?` }, "manager");

  entrerDansTodo(journal, PROJET, 7, { ...PRODUIT, enonce: "Set the secret, or drop the ticket?" }, "manager");
  entrerDansTodo(journal, PROJET, 7, { type: "gesture", enonce: "ignored" }, "manager");
  assert.deepEqual(
    cartesEnTodo(journal.base).map(({ ticket, type, question }) => [ticket, type, question]),
    [
      [8, "product", "Which choice for #8?"],
      [9, "product", "Which choice for #9?"],
      [7, "product", "Set the secret, or drop the ticket?"],
    ],
  );

  assert.equal(sortirDeTodo(journal, PROJET, 8, "decided on the issue", "chef"), true);
  assert.equal(sortirDeTodo(journal, PROJET, 8, "again", "chef"), false);
  noter({ type: "ticket.left", payload: { reason: "closed" } }, 9, "github");
  assert.deepEqual(
    todo().map(({ ticket }) => ticket),
    [7],
  );
  noter({ type: "ticket.served", payload: {} }, 7);
  assert.deepEqual(todo(), []);
});

test("une carte entrée avant les deux sortes et leurs choix ne se lit plus comme une carte", (t) => {
  const { journal, noter, arriver, todo } = cuisine(t);
  arriver(11);
  noter({ type: "todo.entered", payload: { kind: "gesture", statement: "give access", capture: null } } as unknown as Fait, 11, "manager");
  assert.deepEqual(cartesEnTodo(journal.base), []);
  assert.deepEqual(todo(), []);
});

test("la carte d'un ticket qui attend un tiers n'est pas dans TODO", (t) => {
  const { journal, noter, arriver, todo } = cuisine(t);
  arriver(10);
  entrerDansTodo(journal, PROJET, 10, PRODUIT, "manager");
  noter({ type: "ticket.waiting", payload: { what: "the client's answer", who: "the client", followUp: "2026-12-01T00:00:00.000Z" } }, 10, "chef");
  assert.deepEqual(todo(), []);
});

// Un journal où des cartes entrent à des jours différents.
function entreesAuFil(t: TestContext) {
  const repertoire = repertoireTemporaire(t);
  const poser = (jour: string, ticket: number, proposition: Proposition, captures: Captures | null = null) => {
    const journal = ouvrirJournal(repertoire, { maintenant: () => new Date(`${jour}T10:00:00.000Z`) });
    if (captures !== null) journal.ajouter({ project: PROJET, ticket, author: "station:box/claude", type: "cook.reported", payload: { run: `cook-${ticket}`, ending: "done", reason: null, summary: null, branch: "b", pr: null, captures } });
    entrerDansTodo(journal, PROJET, ticket, proposition, "manager");
    journal.fermer();
  };
  poser("2026-10-01", 1, PRODUIT);
  poser("2026-10-15", 2, PRODUIT);
  poser("2026-10-16", 3, DESIGN, CAPTURES);
  poser("2026-10-17", 4, PRODUIT);
  poser("2026-10-17", 5, PRODUIT);
  poser("2026-10-17", 6, DESIGN);
  poser("2026-10-17", 7, { type: "gesture", enonce: "Give access?", choix: [{ texte: "Yes." }] });
  return repertoire;
}

test("les entrées de la période se comptent par sorte : hors période et refusées, nulle part", (t) => {
  const journal = ouvrirJournal(entreesAuFil(t));
  aArreter(t, () => journal.fermer());
  const jour = (j: string) => new Date(`${j}T00:00:00.000Z`);

  assert.deepEqual(entreesParType(journal.base, jour("2026-10-14"), jour("2026-10-20")), { product: 3, design: 1 });
  assert.deepEqual(entreesParType(journal.base, jour("2026-10-01"), jour("2026-10-20")), { product: 4, design: 1 });
  assert.deepEqual(entreesParType(journal.base, jour("2026-10-16"), jour("2026-10-17")), { product: 0, design: 1 });
  assert.deepEqual(entreesParType(journal.base, jour("2026-10-18"), jour("2026-10-20")), { product: 0, design: 0 });
});

test("`status` dit les cartes entrées dans TODO sur la période, par sorte, 7 jours par défaut, et zéro de chaque sans entrée", async (t) => {
  const repertoire = repertoireTemporaire(t);
  const vide = appeler(status, [], { BRIGADE_STATE_DIR: ouvrirEtFermer(repertoire) });
  assert.equal(await vide.fin, 0);
  assert.match(vide.sortie(), /^todo       last 7 d: 0 entered — product 0 · design 0$/m);

  const ancien = Math.ceil((Date.now() - Date.parse("2026-10-01T10:00:00Z")) / 86_400_000);
  const plein = entreesAuFil(t);
  const jours = Math.ceil((Date.now() - Date.parse("2026-10-17T00:00:00Z")) / 86_400_000) + 1;
  const long = appeler(status, ["--days", String(ancien + 1)], { BRIGADE_STATE_DIR: plein });
  assert.equal(await long.fin, 0);
  assert.match(long.sortie(), new RegExp(`^todo       last ${ancien + 1} d: 5 entered — product 4 · design 1$`, "m"));
  const court = appeler(status, ["--days", String(jours)], { BRIGADE_STATE_DIR: plein });
  assert.equal(await court.fin, 0);
  assert.match(court.sortie(), new RegExp(`^todo       last ${jours} d: \\d+ entered`, "m"));

  for (const mauvais of [["--days"], ["--days", "0"], ["--days", "beaucoup"]]) {
    const commande = appeler(status, mauvais, { BRIGADE_STATE_DIR: plein });
    assert.equal(await commande.fin, 2);
    assert.match(commande.sortie(), /usage/);
  }
});

function ouvrirEtFermer(repertoire: string): string {
  ouvrirJournal(repertoire).fermer();
  return repertoire;
}
