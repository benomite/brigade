// Parked sur un projet GitHub (#4129, d'abord WAITING, #3074) : le parking d'une carte nommée par son dépôt et son
// numéro, que la cuisine pose (`mettreEnAttenteGitHub`, le geste `park` du superviseur), GitHub simulé. Le chef et le
// second parquent et déparquent depuis l'app, sans commande de la box (#4262).
import assert from "node:assert/strict";
import { test } from "node:test";
import { attenteDeLIssue, cartesDesIssues, corpsDuParking, lireCible, mettreEnAttenteGitHub } from "../../src/attente-github/attente-github.ts";
import { corpsDeCarte, carteBloque } from "../../src/github-seul/carte-todo/carte-todo.ts";
import { LABELS_D_AVANT_PARKED } from "../../src/github-etat/etats.ts";
import { fauxGitHub, issue } from "../aides/cuisine.ts";

const MAINTENANT = new Date("2026-11-09T15:05:00.000Z");
const CARTE = 614;
// Le ticket que les gestes parquent : sur le rail, rien ne l'attend.
const TICKET = 615;

// Un projet GitHub seul : l'issue 614, une carte de TODO (`chef-todo` et son commentaire marqué), parquée pour le chef ;
// l'issue 615, sur le rail.
function projet() {
  const faux = fauxGitHub(issue(CARTE, ["fire", "model:opus", "effort:medium", "chef-todo"]), issue(TICKET, ["fire", "model:opus", "effort:medium"]));
  faux.repondre(CARTE, corpsDeCarte(carteBloque(CARTE, "which payment provider to use")));
  // Le parking de `cible` : ce qu'il a posé, ou l'erreur qu'il lève.
  const poser = async (cible: string, quoi: string, qui: string) => {
    try {
      const attente = await mettreEnAttenteGitHub(faux.github, lireCible(cible) ?? assert.fail(cible), { quoi, qui }, MAINTENANT);
      return { attente, erreur: "" };
    } catch (erreur) {
      return { attente: null, erreur: erreur instanceof Error ? erreur.message : String(erreur) };
    }
  };
  const cartes = async () => {
    const sondage = await faux.github.ouvertes();
    return cartesDesIssues(faux.github, sondage.inchange ? assert.fail("GitHub did not return the open issues") : sondage.issues);
  };
  const labels = (numero = TICKET) => faux.lire(numero)?.labels ?? [];
  const commentes = (numero = TICKET) => faux.commentaires.filter(([n]) => n === numero).map(([, corps]) => corps);
  return { faux, poser, cartes, labels, commentes };
}

test("un ticket GitHub seul se nomme par son dépôt et son numéro", () => {
  assert.deepEqual(lireCible("BOBL-tech/mirrorlab#614"), { depot: "BOBL-tech/mirrorlab", numero: 614 });
  assert.deepEqual([lireCible("614"), lireCible("BOBL-tech/mirrorlab"), lireCible("BOBL-tech/mirrorlab#0"), lireCible("mirrorlab#614")], [null, null, null, null]);
});

test("parquer : le label `parked` et un commentaire qui dit qui, pour quoi, jusqu'à quand — dans sept jours ; le ticket rejoint les parqués, la carte du chef reste dans TODO", async () => {
  const { faux, poser, cartes, labels, commentes } = projet();
  const pose = await poser("BOBL-tech/mirrorlab#615", "the signed quote", "the client");
  assert.deepEqual(pose, { attente: { what: "the signed quote", who: "the client", followUp: "2026-11-16T15:05:00.000Z" }, erreur: "" });
  assert.deepEqual(faux.labellisations, [[TICKET, ["parked"]]]);
  // Il reprendra où il était : ses labels restent, `parked` s'y ajoute.
  assert.deepEqual(labels().sort(), ["effort:medium", "fire", "model:opus", "parked"]);
  assert.equal(commentes().length, 1);
  const [commentaire = ""] = commentes();
  assert.ok(commentaire.startsWith("<!-- brigade:parked "), commentaire);
  for (const mot of ["- **who**: the client", "- **for what**: the signed quote", "- **until**: 2026-11-16 15:05 UTC"]) assert.ok(commentaire.includes(mot), commentaire);

  const lues = await cartes();
  assert.deepEqual(lues.todo.map(({ numero }) => numero), [CARTE]);
  assert.deepEqual(
    lues.parked.map(({ numero, attente }) => ({ numero, attente })),
    [{ numero: TICKET, attente: { what: "the signed quote", who: "the client", followUp: "2026-11-16T15:05:00.000Z" } }],
  );
});

test("parquer pour le chef : `chef-todo` seul, la marque puis sa carte ; le ticket est dans son TODO", async () => {
  const { faux, poser, cartes, labels, commentes } = projet();
  assert.equal((await poser("BOBL-tech/mirrorlab#615", "which provider", "chef")).erreur, "");
  // Parqué pour le chef, il ne porte que `chef-todo` : `parked` dit qu'il attend quelqu'un d'autre.
  assert.deepEqual(faux.labellisations, [[TICKET, ["chef-todo"]]]);
  assert.deepEqual(labels().sort(), ["chef-todo", "effort:medium", "fire", "model:opus"]);
  // La marque du parking, puis la carte de TODO que l'app lit, avec son champ de réponse.
  const [marque = "", carte = "", ...autres] = commentes();
  assert.deepEqual(autres, []);
  assert.match(marque, /^<!-- brigade:parked \{"what":"which provider","who":"the chef","followUp":"2026-11-16T15:05:00\.000Z"\} -->/);
  assert.equal(carte, "<!-- brigade:todo kind=product-question -->\n#615 is parked for the chef: which provider\n\nAnswer on this issue, and the ticket resumes exactly where it was.");
  const lues = await cartes();
  assert.deepEqual(lues.todo.map(({ numero, ligne, manque }) => ({ numero, ligne, manque })), [
    { numero: CARTE, ligne: "The cook of #614 is blocked: which payment provider to use.", manque: null },
    { numero: TICKET, ligne: "#615 is parked for the chef: which provider", manque: null },
  ]);
  assert.deepEqual(lues.parked, []);
});

test("parqué pour le chef sans sa carte — une station arrêtée entre les deux : sa marque dit ce qu'il attend de lui", async () => {
  const { faux, cartes } = projet();
  faux.poser(issue(616, ["fire", "chef-todo"]));
  faux.repondre(616, corpsDuParking({ what: "which provider", who: "the chef", followUp: "2026-11-16T15:05:00.000Z", fact: "the chef answers" }));
  assert.deepEqual((await cartes()).todo.map(({ numero, ligne, manque }) => ({ numero, ligne, manque })).at(-1), { numero: 616, ligne: "waits for the chef: “which provider”", manque: null });
});

test("un ticket parqué par un label d'avant parked est lu parqué, et la ligne nomme ce label", async () => {
  const { faux, cartes } = projet();
  const [ancien = ""] = LABELS_D_AVANT_PARKED.filter((label) => label !== "waiting");
  faux.poser(issue(616, ["fire", ancien]));
  assert.deepEqual((await cartes()).todo.map(({ numero, ligne }) => ({ numero, ligne })).at(-1), { numero: 616, ligne: `parked by a waiting label of before parked: \`${ancien}\`` });
});

test("parquer une issue déjà parquée : ni second label ni commentaire, et le refus dit ce qu'il a trouvé", async () => {
  const { faux, poser, commentes } = projet();
  await poser("BOBL-tech/mirrorlab#615", "the signed quote", "the client");
  const encore = await poser("BOBL-tech/mirrorlab#615", "something else", "someone");
  assert.match(encore.erreur, /BOBL-tech\/mirrorlab#615 is already parked — waits for the client: “the signed quote” — until 2026-11-16 15:05 UTC: nothing was written/);
  assert.deepEqual([faux.labellisations.length, commentes().length], [1, 1]);

  // Un `parked` posé à la main, sans commentaire : le refus le dit, sans rien inventer.
  faux.poser(issue(616, ["fire", "parked"]));
  assert.match((await poser("BOBL-tech/mirrorlab#616", "x", "y")).erreur, /#616 is already parked — carries `parked`, but no comment of the repository says who it waits for, for what, or until when/);

  // Une carte du chef est déjà parquée, pour lui : la reparquer pour lui est refusé.
  assert.match((await poser("BOBL-tech/mirrorlab#614", "x", "the chef")).erreur, /BOBL-tech\/mirrorlab#614 is already parked — .*: nothing was written/);
  assert.deepEqual([faux.labellisations.length, commentes(CARTE).length], [1, 0]);
});

test("parquer une carte du chef pour un autre : elle garde `chef-todo`, prend `parked` et sa marque, et quitte TODO pour les parqués", async () => {
  const { faux, poser, cartes, labels, commentes } = projet();
  assert.equal((await poser("BOBL-tech/mirrorlab#614", "the signed quote", "the client")).erreur, "");
  assert.deepEqual(faux.labellisations, [[CARTE, ["parked"]]]);
  assert.deepEqual(labels(CARTE), ["fire", "model:opus", "effort:medium", "chef-todo", "parked"]);
  assert.match(commentes(CARTE).at(-1) ?? "", /^<!-- brigade:parked \{"what":"the signed quote","who":"the client"/);
  const { todo, parked } = await cartes();
  assert.deepEqual([todo.map(({ numero }) => numero), parked.map(({ numero }) => numero)], [[], [CARTE]]);
});

test("le parking s'ouvre à toute étape : `taken` et `in-pass` restent, le ticket reprendra où il était", async () => {
  const { faux, poser, labels } = projet();
  faux.poser(issue(617, ["fire", "taken"]));
  faux.poser(issue(619, ["fire", "in-pass"]));
  for (const numero of [617, 619]) assert.equal((await poser(`BOBL-tech/mirrorlab#${numero}`, "x", "y")).erreur, "");
  assert.deepEqual([labels(617), labels(619)], [["fire", "taken", "parked"], ["fire", "in-pass", "parked"]]);
});

test("ce que le parking refuse sur un ticket GitHub seul, sans rien écrire", async () => {
  const { faux, poser } = projet();
  faux.poser(issue(618, ["fire"], { state: "closed" }));
  assert.match((await poser("BOBL-tech/mirrorlab#618", "x", "y")).erreur, /#618 is closed/);
  assert.match((await poser("BOBL-tech/mirrorlab#999", "x", "y")).erreur, /#999 is not an issue/);
  assert.match((await poser("BOBL-tech/mirrorlab#615", " ", "y")).erreur, /not parked without saying for what/);
  assert.match((await poser("BOBL-tech/mirrorlab#615", "x", " ")).erreur, /not parked without saying who it waits for/);
  assert.deepEqual([faux.labellisations, faux.commentaires], [[], []]);
});

test("une lecture ou une écriture de GitHub qui échoue est dite, et rien n'attend sans dire quoi", async () => {
  const { faux, poser, labels } = projet();
  faux.pannes.commentaire = true;
  assert.match((await poser("BOBL-tech/mirrorlab#615", "the signed quote", "the client")).erreur, /^the comment was not posted on BOBL-tech\/mirrorlab#615 \(gh api : HTTP 502\): `parked` was removed, nothing waits/);
  assert.ok(!labels().includes("parked"));

  faux.pannes.commentaire = false;
  faux.pannes.label = true;
  assert.equal((await poser("BOBL-tech/mirrorlab#615", "the signed quote", "the client")).erreur, "gh api : HTTP 502");
});

test("ce qu'attend une issue se relit de son dernier commentaire marqué d'un auteur du dépôt, même avec `-->` dans les mots du chef", () => {
  const attente = { what: "the --> arrow", who: "a <team>", followUp: "2026-11-16T15:05:00.000Z" };
  const corps = corpsDuParking(attente);
  assert.deepEqual(attenteDeLIssue([{ body: corps, association: "OWNER" }]), attente);
  assert.equal(attenteDeLIssue([{ body: corps, association: "NONE" }]), null);
  assert.equal(attenteDeLIssue([{ body: "<!-- brigade:waiting {nope} -->", association: "OWNER" }]), null);
  assert.equal(attenteDeLIssue([{ body: "<!-- brigade:parked {nope} -->", association: "OWNER" }]), null);
});
