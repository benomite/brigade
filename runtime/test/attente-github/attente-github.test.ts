// WAITING sur un projet GitHub seul (#3074) : la mise en attente d'une carte
// nommée par son dépôt et son numéro, que la cuisine pose (`mettreEnAttenteGitHub`),
// GitHub simulé. Le chef et le second parquent depuis l'app, sans commande de la box (#4262) : les cas qui nomment
// `waiting set` ou « la commande » jouent le geste qu'elle jouait, `mettreEnAttenteGitHub`, que la cuisine joue encore.
import assert from "node:assert/strict";
import { test } from "node:test";
import { attenteDeLIssue, cartesDesIssues, corpsDeLAttente, direRelance, lireCible, mettreEnAttenteGitHub } from "../../src/attente-github/attente-github.ts";
import { corpsDeCarte, carteBloque } from "../../src/github-seul/carte-todo/carte-todo.ts";
import { fauxGitHub, issue } from "../aides/cuisine.ts";

const MAINTENANT = new Date("2026-11-09T15:05:00.000Z");
const CARTE = 614;
// `2026-11-20` : ce jour-là à minuit, heure de la box.
const LE_20 = new Date(2026, 10, 20).toISOString();
const DIT_LE_20 = direRelance(LE_20);

// Un projet GitHub seul : l'issue 614, une carte de TODO (`chef-todo` et son commentaire marqué).
function projet() {
  const faux = fauxGitHub(issue(CARTE, ["fire", "model:opus", "effort:medium", "chef-todo"]), issue(615, ["fire", "model:opus", "effort:medium"]));
  faux.repondre(CARTE, corpsDeCarte(carteBloque(CARTE, "which payment provider to use")));
  // La mise en attente de `cible` : ce qu'elle a posé, ou l'erreur qu'elle lève.
  const poser = async (cible: string, quoi: string, qui: string, relance?: string) => {
    try {
      const attente = await mettreEnAttenteGitHub(faux.github, lireCible(cible) ?? assert.fail(cible), { quoi, qui, ...(relance === undefined ? {} : { relance }) }, MAINTENANT);
      return { attente, erreur: "" };
    } catch (erreur) {
      return { attente: null, erreur: erreur instanceof Error ? erreur.message : String(erreur) };
    }
  };
  const cartes = async () => {
    const sondage = await faux.github.ouvertes();
    return cartesDesIssues(faux.github, sondage.inchange ? assert.fail("GitHub did not return the open issues") : sondage.issues);
  };
  const labels = () => faux.lire(CARTE)?.labels ?? [];
  const commentes = () => faux.commentaires.filter(([numero]) => numero === CARTE).map(([, corps]) => corps);
  return { faux, poser, cartes, labels, commentes };
}

test("un ticket GitHub seul se nomme par son dépôt et son numéro", () => {
  assert.deepEqual(lireCible("BOBL-tech/mirrorlab#614"), { depot: "BOBL-tech/mirrorlab", numero: 614 });
  assert.deepEqual([lireCible("614"), lireCible("BOBL-tech/mirrorlab"), lireCible("BOBL-tech/mirrorlab#0"), lireCible("mirrorlab#614")], [null, null, null, null]);
});

test("`waiting set` : le label `waiting` et un commentaire qui dit quoi, de qui, jusqu'à quand ; la carte quitte TODO pour WAITING", async () => {
  const { faux, poser, cartes, labels, commentes } = projet();
  assert.deepEqual((await cartes()).todo.map(({ numero }) => numero), [CARTE]);

  const pose = await poser("BOBL-tech/mirrorlab#614", "the signed quote", "the client", "2026-11-20");
  assert.deepEqual(pose, { attente: { what: "the signed quote", who: "the client", followUp: LE_20 }, erreur: "" });
  assert.deepEqual(faux.labellisations, [[CARTE, ["waiting"]]]);
  assert.ok(labels().includes("waiting"));
  assert.equal(commentes().length, 1);
  const [commentaire = ""] = commentes();
  for (const mot of ["**what**: the signed quote", "**from whom**: the client", `**follow-up**: ${DIT_LE_20}`]) assert.ok(commentaire.includes(mot), commentaire);

  const lues = await cartes();
  assert.deepEqual(lues.todo, []);
  assert.deepEqual(
    lues.waiting.map(({ numero, attente }) => ({ numero, attente })),
    [{ numero: CARTE, attente: { what: "the signed quote", who: "the client", followUp: LE_20 } }],
  );
});

test("`waiting set` sans date : la relance est dans sept jours, et le commentaire la dit", async () => {
  const { poser, commentes } = projet();
  assert.equal((await poser("BOBL-tech/mirrorlab#614", "the signed quote", "the client")).erreur, "");
  assert.ok(commentes()[0]?.includes("**follow-up**: 2026-11-16 15:05 UTC"), commentes()[0] ?? "");
});

test("`waiting set` sur une issue qui attend déjà : ni second label ni commentaire, et la commande dit ce qu'elle a trouvé", async () => {
  const { faux, poser, commentes } = projet();
  await poser("BOBL-tech/mirrorlab#614", "the signed quote", "the client");
  const encore = await poser("BOBL-tech/mirrorlab#614", "something else", "someone");
  assert.match(encore.erreur, /BOBL-tech\/mirrorlab#614 is already waiting — awaiting the client: “the signed quote” — follow-up on 2026-11-16 15:05 UTC: nothing was written/);
  assert.deepEqual([faux.labellisations.length, commentes().length], [1, 1]);

  // Un `waiting` posé à la main, sans commentaire : le refus le dit, sans rien inventer.
  faux.poser(issue(616, ["fire", "waiting"]));
  assert.match((await poser("BOBL-tech/mirrorlab#616", "x", "y")).erreur, /#616 is already waiting — carries `waiting`, but no comment of the repository says what it waits for/);
});

test("ce que la commande refuse sur un ticket GitHub seul, sans rien écrire", async () => {
  const { faux, poser } = projet();
  faux.poser(issue(617, ["fire", "taken"]));
  faux.poser(issue(618, ["fire"], { state: "closed" }));
  assert.match((await poser("BOBL-tech/mirrorlab#617", "x", "y")).erreur, /carries `taken`: the kitchen holds it/);
  assert.match((await poser("BOBL-tech/mirrorlab#618", "x", "y")).erreur, /#618 is closed/);
  assert.match((await poser("BOBL-tech/mirrorlab#999", "x", "y")).erreur, /#999 is not an issue/);
  assert.match((await poser("BOBL-tech/mirrorlab#614", "x", "y", "hier")).erreur, /--remind: “hier” cannot be read/);
  assert.deepEqual([faux.labellisations, faux.commentaires], [[], []]);
});

test("une lecture ou une écriture de GitHub qui échoue est dite, et rien n'attend sans dire quoi", async () => {
  const { faux, poser, labels } = projet();
  faux.pannes.commentaire = true;
  assert.match((await poser("BOBL-tech/mirrorlab#614", "the signed quote", "the client")).erreur, /^the comment was not posted on BOBL-tech\/mirrorlab#614 \(gh api : HTTP 502\): `waiting` was removed, nothing waits/);
  assert.ok(!labels().includes("waiting"));

  faux.pannes.commentaire = false;
  faux.pannes.label = true;
  assert.equal((await poser("BOBL-tech/mirrorlab#614", "the signed quote", "the client")).erreur, "gh api : HTTP 502");
});

test("ce qu'attend une issue se relit de son dernier commentaire marqué d'un auteur du dépôt, même avec `-->` dans les mots du chef", () => {
  const attente = { what: "the --> arrow", who: "a <team>", followUp: "2026-11-16T15:05:00.000Z" };
  const corps = corpsDeLAttente(attente);
  assert.deepEqual(attenteDeLIssue([{ body: corps, association: "OWNER" }]), attente);
  assert.equal(attenteDeLIssue([{ body: corps, association: "NONE" }]), null);
  assert.equal(attenteDeLIssue([{ body: "<!-- brigade:waiting {nope} -->", association: "OWNER" }]), null);
});
