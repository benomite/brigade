// #3895 : un ticket de boucle ne s'ouvre pas une boucle, la boucle d'un check rouge
// dit le pas et sa ligne de journal, et un même pas rouge sur deux tickets coupe la relance.
import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import type { CommentaireDeVerdict } from "../../src/github-etat/fusion.ts";
import { HORS_CUISINE, LABEL } from "../../src/github.ts";
import { disjoncteurs, marqueDeRelance, oublierLesVues, relancer, type ContexteDeLaGuerison, type TicketDeCote } from "../../src/guerison/relance.ts";

const ETAPE = "Exiger le label ready";
const LIGNE = "label ready absent : ajoutez le label ready";

// Un faux GitHub : une PR rouge par ticket (ticket n → PR 1000 + n), le journal de chacune.
function cuisine(journal: (pr: number) => string | null | Error = () => `2026-11-20T01:00:00.0000000Z ##[error]${LIGNE}\n`) {
  const commentaires = new Map<number, CommentaireDeVerdict[]>();
  const creees: { titre: string; corps: string }[] = [];
  let id = 0;
  const poster = (numero: number, body: string) => {
    commentaires.set(numero, [...(commentaires.get(numero) ?? []), { id: ++id, body, association: "OWNER", createdAt: new Date(Date.parse("2026-11-20T00:00:00Z") + id * 1000).toISOString() }]);
  };
  const contexte = (coupes?: ContexteDeLaGuerison["coupes"]): ContexteDeLaGuerison => ({
    station: "box/claude",
    base: "main",
    ...(coupes === undefined ? {} : { coupes }),
    github: {
      commentaires: async (numero) => commentaires.get(numero) ?? [],
      commenter: async (numero, corps) => poster(numero, corps),
      labelliser: async () => {},
      delabelliser: async () => {},
      prDuTicket: async (issue) => ({ number: 1000 + issue, sha: `sha${issue}`, state: "open", merged: false, enRetard: false }),
      ci: async (sha) => [{ name: "pr-check", outcome: "red", conclusion: "failure", url: `https://github.test/${sha}` }],
      etapesEnEchec: async () => [ETAPE],
      journalDuCheck: async (check) => {
        const pr = Number(/sha(\d+)/.exec(check.url ?? "")?.[1] ?? 0);
        const lu = journal(pr);
        if (lu instanceof Error) throw lu;
        return lu;
      },
      creerIssue: async (issue) => {
        creees.push(issue);
        return 900 + creees.length;
      },
    },
  });
  return { poster, creees, contexte, commentairesDu: (n: number) => (commentaires.get(n) ?? []).map(({ body }) => body) };
}

// Les PR rouges déjà vues sont tenues par le process : chaque cas repart de zéro.
beforeEach(() => oublierLesVues());

const ticket = (number: number, title = "Heal the rail"): TicketDeCote => ({ number, title, labels: [LABEL, HORS_CUISINE] });
const deuxRelances = (c: ReturnType<typeof cuisine>, n: number) => [1, 2].forEach((i) => c.poster(n, `${marqueDeRelance("red-check", i)}\nRelaunched.`));

test("un ticket qui boucle pour un check rouge : le ticket de boucle dit le pas en échec et sa ligne de journal", async () => {
  const c = cuisine();
  deuxRelances(c, 40);
  assert.deepEqual(await relancer(ticket(40), c.contexte()), { fait: "boucle", cause: "red-check", bug: 901 });
  const [bug] = c.creees;
  assert.match(bug?.titre ?? "", new RegExp(`\\(red-check: step ${ETAPE} — ${LIGNE}\\)`));
  assert.ok(bug?.corps.includes(`\`${ETAPE}\``) && bug.corps.includes(`\`${LIGNE}\``));
});

test("un journal illisible : la ligne n'est pas inventée, le ticket de boucle le dit", async () => {
  const c = cuisine(() => new Error("no logs"));
  deuxRelances(c, 40);
  await relancer(ticket(40), c.contexte());
  assert.match(c.creees[0]?.corps ?? "", /its log line could not be read/);
});

test("un ticket de boucle qui boucle à son tour n'ouvre aucun ticket : une ligne pour le chef avec le pas et sa ligne, une seule fois", async () => {
  const c = cuisine();
  const boucle = ticket(41, "#40 loops: set aside again after 2 relaunches for the same reason (red-check)");
  deuxRelances(c, 41);
  assert.deepEqual(await relancer(boucle, c.contexte()), { fait: "arret", cause: "red-check" });
  assert.equal(c.creees.length, 0);
  const dits = c.commentairesDu(41).filter((corps) => corps.includes("no new loop ticket"));
  assert.equal(dits.length, 1);
  assert.ok(dits[0]?.includes(ETAPE) && dits[0].includes(LIGNE));
  assert.equal((await relancer(boucle, c.contexte())).fait, "rien");
  assert.equal(c.commentairesDu(41).filter((corps) => corps.includes("no new loop ticket")).length, 1);
});

test("un ticket de boucle qui n'a pas encore bouclé est relancé comme un autre", async () => {
  const c = cuisine();
  assert.equal((await relancer(ticket(41, "#40 loops: set aside again after 2 relaunches for the same reason (red-check)"), c.contexte())).fait, "relance");
});

test("le même pas, de la même ligne, rouge sur les PR de deux tickets : plus aucune relance, une ligne au chef avec le pas, la ligne et les PR", async () => {
  const c = cuisine();
  const tickets = [ticket(40), ticket(41)];
  const coupes = await disjoncteurs(tickets, c.contexte());
  assert.deepEqual([...coupes.values()], [{ etape: ETAPE, ligne: LIGNE, prs: [1040, 1041] }]);
  for (const t of tickets) assert.equal((await relancer(t, c.contexte(coupes))).fait, "rien");
  const [dit] = c.commentairesDu(40);
  assert.ok(dit?.includes(ETAPE) && dit.includes(LIGNE) && dit.includes("#1040") && dit.includes("#1041"));
  await relancer(tickets[0] as TicketDeCote, c.contexte(coupes));
  assert.equal(c.commentairesDu(40).length, 1);
  assert.ok(!c.commentairesDu(40).some((corps) => corps.includes("put back on the rail")));
});

test("un seul ticket rouge, ou deux lignes différentes, ou une ligne illisible : pas de coupe, la relance a lieu", async () => {
  const seul = cuisine();
  assert.equal((await disjoncteurs([ticket(40)], seul.contexte())).size, 0);
  const differentes = cuisine((pr) => `##[error]line of ${pr}\n`);
  assert.equal((await disjoncteurs([ticket(40), ticket(41)], differentes.contexte())).size, 0);
  const illisibles = cuisine(() => null);
  const coupes = await disjoncteurs([ticket(40), ticket(41)], illisibles.contexte());
  assert.equal(coupes.size, 0);
  assert.equal((await relancer(ticket(40), illisibles.contexte(coupes))).fait, "relance");
});
