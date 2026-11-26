// La cuisine des tests de la décision du manager (#4219) : le runtime d'un projet avec son manager, sur le GitHub de
// test ; la carte de TODO telle que l'app la lit ; la réponse du chef jouée par l'app elle-même (son client REST branché
// sur ce GitHub) ; et le tick de la station — sa guérison, qui répare les limbes.
import type { TestContext } from "node:test";
import { repondreSurGithub, type ClientDeLaReponse } from "../../../app/src/tableau-gestes/reponse-github.ts";
import { formeDuChef } from "../../../app/src/tableau/todo-github.ts";
import { lireCarte } from "../../src/github-seul/carte-todo/carte-todo.ts";
import { ouvrirGuerison } from "../../src/guerison/index.ts";
import { ouvrirJournal } from "../../src/journal.ts";
import { MARQUEUR_MANAGER } from "../../src/juger.ts";
import { chef, cuisine, type Options } from "../aides/cuisine.ts";
import { aArreter, DEPOT, jusqua } from "../outils.ts";

export function decision(t: TestContext, options: Options & { eteint?: boolean } = {}) {
  const c = cuisine(t, { ...options, manager: options.manager ?? {} });
  if (!options.eteint) chef(c.repertoire, "manager.enabled");
  // Un battement, écrit au journal comme le tick du runtime l'écrit, par une autre connexion : il réveille le manager
  // aussitôt (manager.test.ts, `battre`).
  let autre: ReturnType<typeof ouvrirJournal> | undefined;
  const battre = () => {
    if (autre === undefined) {
      const ouvert = ouvrirJournal(c.repertoire);
      aArreter(t, () => ouvert.fermer());
      autre = ouvert;
    }
    autre.ajouter({ project: c.runtime.projet, ticket: null, author: "runtime", type: "runtime.ticked", payload: { intervalMs: 100 } });
  };
  const gh = c.gh.github;
  const labels = (numero: number) => c.gh.lire(numero)?.labels ?? [];
  // La carte de TODO de l'issue, telle que l'app la lit : une issue ouverte, `chef-todo`, sa question et ses boutons.
  const carte = async (numero: number) => {
    if (c.gh.lire(numero)?.state !== "open") return null;
    const lue = await lireCarte(numero, gh);
    if (lue === null) return null;
    return { ...lue, ...formeDuChef(lue.texte) };
  };
  const aLaCarte = async (numero: number) => (await carte(numero)) !== null;
  // Ce que le manager a dit sur l'issue.
  const dits = (numero: number) => c.gh.commentaires.filter(([n, corps]) => n === numero && corps.includes(MARQUEUR_MANAGER)).map(([, corps]) => corps);
  // Un tour du manager : trois sondages des issues ouvertes, chacun sur un battement.
  const passeDuManager = async () => {
    for (let i = 0; i < 3; i++) {
      const depart = c.gh.sondages.ouvertes;
      battre();
      try {
        await jusqua(() => c.gh.sondages.ouvertes > depart);
      } catch {
        throw new Error(`the manager made no new pass over the open issues (poll ${i + 1} of 3 never came): it skipped the issue's pass`);
      }
    }
  };
  // Le chef change l'issue sur GitHub : le manager le lit à son tour suivant.
  const changer = (numero: number, change: { labels?: string[]; state?: "open" | "closed" }, updatedAt: string) => {
    const connue = c.gh.lire(numero);
    if (connue === undefined) throw new Error(`#${numero} unknown`);
    c.gh.poser({ ...connue, ...change, updatedAt });
    battre();
  };

  // L'app répond à la carte : son client REST, branché sur le GitHub de test.
  const client: ClientDeLaReponse = {
    lire: async () => ({ status: 404, data: null }),
    ecrire: async (methode, chemin, corps) => {
      const [, n, suite = ""] = /^\/repos\/[^/]+\/[^/]+\/issues\/(\d+)(.*)$/.exec(chemin) ?? [];
      const numero = Number(n);
      const charge = (corps ?? {}) as { body?: string; labels?: string[]; state?: string };
      let reponse = { status: 404, data: null as unknown };
      if (methode === "POST" && suite === "/comments") {
        await gh.commenter(numero, charge.body ?? "");
        reponse = { status: 201, data: { id: c.gh.commentaires.length } };
      } else if (methode === "POST" && suite === "/labels") {
        await gh.labelliser(numero, charge.labels ?? []);
        reponse = { status: 200, data: [] };
      } else if (methode === "DELETE" && suite.startsWith("/labels/")) {
        const label = decodeURIComponent(suite.slice("/labels/".length));
        if (labels(numero).includes(label)) {
          await gh.delabelliser(numero, label);
          reponse = { status: 200, data: [] };
        }
      } else if (methode === "PATCH" && suite === "" && charge.state === "closed") {
        await gh.fermerIssue(numero);
        reponse = { status: 200, data: {} };
      }
      battre();
      return reponse;
    },
  };
  // Le chef clique le bouton de la carte dont le libellé est celui-ci.
  const repondre = async (numero: number, libelle: string) => {
    const lue = await carte(numero);
    if (lue === null) throw new Error(`#${numero} has no card`);
    const rang = lue.choix.findIndex((choix) => choix.texte === libelle) + 1;
    if (rang === 0) throw new Error(`the card of #${numero} has no button "${libelle}"`);
    return repondreSurGithub({ depot: DEPOT, ticket: numero, chef: { sorte: lue.sorte, texte: lue.texte }, reponse: { question: lue.question, choix: rang }, client, maintenant: new Date("2026-10-08T10:00:00Z") });
  };

  return { ...c, battre, labels, carte, aLaCarte, dits, passeDuManager, changer, repondre };
}

// Le tick de la station d'un projet : sa guérison, sur les issues ouvertes qui portent `fire` (brigade-github.ts).
export function tickDeLaStation(c: ReturnType<typeof decision>) {
  const gh = c.gh.github;
  const avertis: string[] = [];
  const { guerir } = ouvrirGuerison({
    github: {
      commentaires: async (numero) => (await gh.commentaires(numero)).map((commentaire, i) => ({ id: i + 1, ...commentaire })),
      commenter: (numero, corps) => gh.commenter(numero, corps),
      labelliser: (numero, labels) => gh.labelliser(numero, labels),
      delabelliser: (numero, label) => gh.delabelliser(numero, label),
      prDuTicket: async () => null,
      ci: async () => [],
      fermerIssue: (numero) => gh.fermerIssue(numero),
      retraitsDeLabels: async () => [],
      issue: (numero) => gh.issue(numero),
    },
    station: "box/claude",
    base: "main",
    avertir: (m) => void avertis.push(m),
  });
  const tick = async () => {
    const { issues } = (await gh.tickets()) as { issues: { number: number; title: string; labels: string[]; state: string }[] };
    return guerir(
      issues.map(({ number, title, labels, state }) => ({ number, title, labels: [...labels], state: state as "open" })),
      new Set(),
    );
  };
  return { tick, avertis };
}
