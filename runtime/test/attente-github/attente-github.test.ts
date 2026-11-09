// WAITING sur un projet GitHub seul (#3074) : les trois gestes de #591 sur une
// carte nommée par son dépôt et son numéro, joués par la commande `waiting`
// (attente-cli.ts), GitHub simulé.
import assert from "node:assert/strict";
import { test } from "node:test";
import { principal } from "../../src/attente-cli.ts";
import { attenteDeLIssue, corpsDeLAttente, direRelance, lireCartesGitHub, lireCible } from "../../src/attente-github/attente-github.ts";
import { corpsDeCarte, carteBloque } from "../../src/github-seul/carte-todo/carte-todo.ts";
import { fauxGitHub, issue } from "../aides/cuisine.ts";

const MAINTENANT = new Date("2026-11-09T15:05:00.000Z");
const CARTE = 614;
// `--remind 2026-11-20` : ce jour-là à minuit, heure de la box.
const LE_20 = new Date(2026, 10, 20).toISOString();
const DIT_LE_20 = direRelance(LE_20);
const ech = (texte: string) => texte.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Un projet GitHub seul : l'issue 614, une carte de TODO (`chef-todo` et son commentaire marqué).
function projet() {
  const faux = fauxGitHub(issue(CARTE, ["fire", "model:opus", "effort:medium", "chef-todo"]), issue(615, ["fire", "model:opus", "effort:medium"]));
  faux.repondre(CARTE, corpsDeCarte(carteBloque(CARTE, "which payment provider to use")));
  const depots: string[] = [];
  const lancer = async (...args: string[]) => {
    const [sortie, erreur]: [string[], string[]] = [[], []];
    let code = 0;
    try {
      // Aucun BRIGADE_STATE_DIR : un geste GitHub seul ne passe pas par la box.
      await principal({ args, env: {}, dire: (l) => void sortie.push(l), redire: (l) => void erreur.push(l) }, () => MAINTENANT, (depot) => {
        depots.push(depot);
        return faux.github;
      });
    } catch (levee) {
      code = (levee as { code: number }).code;
    }
    return { code, sortie: sortie.join("\n"), erreur: erreur.join("\n") };
  };
  const labels = () => faux.lire(CARTE)?.labels ?? [];
  const commentes = () => faux.commentaires.filter(([numero]) => numero === CARTE).map(([, corps]) => corps);
  return { faux, lancer, labels, commentes, depots };
}

test("un ticket GitHub seul se nomme par son dépôt et son numéro", () => {
  assert.deepEqual(lireCible("BOBL-tech/mirrorlab#614"), { depot: "BOBL-tech/mirrorlab", numero: 614 });
  assert.deepEqual([lireCible("614"), lireCible("BOBL-tech/mirrorlab"), lireCible("BOBL-tech/mirrorlab#0"), lireCible("mirrorlab#614")], [null, null, null, null]);
});

test("`waiting set` : le label `waiting` et un commentaire qui dit quoi, de qui, jusqu'à quand ; la carte quitte TODO pour WAITING", async () => {
  const { faux, lancer, labels, commentes, depots } = projet();
  const avant = await lancer("BOBL-tech/mirrorlab");
  assert.equal(avant.code, 0, avant.erreur);
  assert.match(avant.sortie, /^TODO — BOBL-tech\/mirrorlab, read from GitHub\n {2}#614 {2}The cook of #614 is blocked: which payment provider to use\. {2}Ticket 614\nWAITING — .*\n {2}no ticket is waiting for a third party$/);

  const pose = await lancer("set", "BOBL-tech/mirrorlab#614", "--what", "the signed quote", "--from", "the client", "--remind", "2026-11-20");
  assert.equal(pose.code, 0, pose.erreur);
  assert.deepEqual(depots.at(-1), "BOBL-tech/mirrorlab");
  assert.match(pose.sortie, new RegExp(`^WAITING: BOBL-tech/mirrorlab#614 {2}awaiting the client: “the signed quote” — follow-up on ${ech(DIT_LE_20)}`));
  assert.deepEqual(faux.labellisations, [[CARTE, ["waiting"]]]);
  assert.ok(labels().includes("waiting"));
  assert.equal(commentes().length, 1);
  const [commentaire = ""] = commentes();
  for (const mot of ["**what**: the signed quote", "**from whom**: the client", `**follow-up**: ${DIT_LE_20}`]) assert.ok(commentaire.includes(mot), commentaire);

  const cartes = await lireCartesGitHub(faux.github);
  assert.deepEqual(cartes.todo, []);
  assert.deepEqual(
    cartes.waiting.map(({ numero, attente }) => ({ numero, attente })),
    [{ numero: CARTE, attente: { what: "the signed quote", who: "the client", followUp: LE_20 } }],
  );
  const apres = await lancer("BOBL-tech/mirrorlab");
  assert.match(apres.sortie, new RegExp(`TODO — .*\\n {2}nothing awaits the chef\\nWAITING — .*\\n {2}#614 {2}awaiting the client: “the signed quote” — follow-up on ${ech(DIT_LE_20)} {2}Ticket 614$`));
});

test("`waiting set` sans date : la relance est dans sept jours, et le commentaire la dit", async () => {
  const { lancer, commentes } = projet();
  const pose = await lancer("set", "BOBL-tech/mirrorlab#614", "--what", "the signed quote", "--from", "the client");
  assert.equal(pose.code, 0, pose.erreur);
  assert.ok(commentes()[0]?.includes("**follow-up**: 2026-11-16 15:05 UTC"), commentes()[0] ?? "");
});

test("`waiting set` sur une issue qui attend déjà : ni second label ni commentaire, et la commande dit ce qu'elle a trouvé", async () => {
  const { faux, lancer, commentes } = projet();
  await lancer("set", "BOBL-tech/mirrorlab#614", "--what", "the signed quote", "--from", "the client");
  const encore = await lancer("set", "BOBL-tech/mirrorlab#614", "--what", "something else", "--from", "someone");
  assert.equal(encore.code, 1);
  assert.match(encore.erreur, /BOBL-tech\/mirrorlab#614 is already waiting — awaiting the client: “the signed quote” — follow-up on 2026-11-16 15:05 UTC: nothing was written/);
  assert.deepEqual([faux.labellisations.length, commentes().length], [1, 1]);

  // Un `waiting` posé à la main, sans commentaire : la commande le dit, sans rien inventer.
  faux.poser(issue(616, ["fire", "waiting"]));
  const aLaMain = await lancer("set", "BOBL-tech/mirrorlab#616", "--what", "x", "--from", "y");
  assert.equal(aLaMain.code, 1);
  assert.match(aLaMain.erreur, /#616 is already waiting — carries `waiting`, but no comment of the repository says what it waits for/);
});

test("`waiting resume` : `waiting` retiré, la carte revient dans TODO", async () => {
  const { faux, lancer, labels } = projet();
  await lancer("set", "BOBL-tech/mirrorlab#614", "--what", "the signed quote", "--from", "the client");
  const reprise = await lancer("resume", "BOBL-tech/mirrorlab#614");
  assert.equal(reprise.code, 0, reprise.erreur);
  assert.ok(!labels().includes("waiting"));
  assert.ok(labels().includes("chef-todo"));
  const cartes = await lireCartesGitHub(faux.github);
  assert.deepEqual([cartes.todo.map(({ numero }) => numero), cartes.waiting], [[CARTE], []]);

  const refus = await lancer("resume", "BOBL-tech/mirrorlab#614");
  assert.deepEqual([refus.code, /is not waiting for a third party/.test(refus.erreur)], [1, true]);
});

test("`waiting arrived` : `waiting` retiré, un commentaire dit que c'est arrivé, et le ticket repart en cuisine sans passer par TODO", async () => {
  const { faux, lancer, labels, commentes } = projet();
  faux.poser({ ...(faux.lire(CARTE) ?? issue(CARTE)), labels: ["model:opus", "effort:medium", "chef-todo"] });
  await lancer("set", "BOBL-tech/mirrorlab#614", "--what", "the signed quote", "--from", "the client");
  const arrive = await lancer("arrived", "BOBL-tech/mirrorlab#614");
  assert.equal(arrive.code, 0, arrive.erreur);
  assert.match(arrive.sortie, /arrived: back to the kitchen — removed `chef-todo`, `waiting`/);
  assert.deepEqual(labels().sort(), ["effort:medium", "fire", "model:opus"]);
  assert.match(commentes().at(-1) ?? "", /it arrived\*\*: what this ticket was awaiting the client \(“the signed quote”\) has arrived\. It goes back to the kitchen/);
  const cartes = await lireCartesGitHub(faux.github);
  assert.deepEqual([cartes.todo, cartes.waiting], [[], []]);
  // Sur le rail : `fire`, calibré, ni pris, ni en pass, ni tenu hors de la cuisine — une station le prend.
  const { issues } = (await faux.github.tickets()) as { issues: { number: number }[] };
  assert.ok(issues.some(({ number }) => number === CARTE));
});

test("ce que la commande refuse sur un ticket GitHub seul, sans rien écrire", async () => {
  const { faux, lancer } = projet();
  faux.poser(issue(617, ["fire", "taken"]));
  faux.poser(issue(618, ["fire"], { state: "closed" }));
  const refus = await Promise.all([
    lancer("set", "BOBL-tech/mirrorlab#614", "--what", "x"),
    lancer("bouger", "BOBL-tech/mirrorlab#614"),
    lancer("resume", "BOBL-tech/mirrorlab#614", "--from", "x"),
  ]);
  assert.deepEqual(refus.map(({ code }) => code), [2, 2, 2]);
  assert.match((await lancer("set", "BOBL-tech/mirrorlab#617", "--what", "x", "--from", "y")).erreur, /carries `taken`: the kitchen holds it/);
  assert.match((await lancer("set", "BOBL-tech/mirrorlab#618", "--what", "x", "--from", "y")).erreur, /#618 is closed/);
  assert.match((await lancer("set", "BOBL-tech/mirrorlab#999", "--what", "x", "--from", "y")).erreur, /#999 is not an issue/);
  assert.match((await lancer("set", "BOBL-tech/mirrorlab#614", "--what", "x", "--from", "y", "--remind", "hier")).erreur, /--remind: “hier” cannot be read/);
  assert.deepEqual([faux.labellisations, faux.commentaires], [[], []]);
});

test("une lecture ou une écriture de GitHub qui échoue est dite, et rien n'attend sans dire quoi", async () => {
  const { faux, lancer, labels } = projet();
  faux.pannes.commentaire = true;
  const pose = await lancer("set", "BOBL-tech/mirrorlab#614", "--what", "the signed quote", "--from", "the client");
  assert.equal(pose.code, 1);
  assert.match(pose.erreur, /GitHub: the comment was not posted on BOBL-tech\/mirrorlab#614 \(gh api : HTTP 502\): `waiting` was removed, nothing waits/);
  assert.ok(!labels().includes("waiting"));

  faux.pannes.commentaire = false;
  faux.pannes.label = true;
  const arrive = await lancer("set", "BOBL-tech/mirrorlab#614", "--what", "the signed quote", "--from", "the client");
  assert.deepEqual([arrive.code, /^brigade : GitHub: gh api : HTTP 502$/.test(arrive.erreur)], [1, true]);

  const panne = fauxGitHub();
  const illisible = await principalDeLaListe(async () => {
    throw new Error("gh api : HTTP 503");
  }, panne.github);
  assert.deepEqual(illisible, { code: 1, erreur: "brigade : GitHub: gh api : HTTP 503" });
});

// La liste, quand GitHub ne rend pas les issues ouvertes.
async function principalDeLaListe(ouvertes: () => Promise<never>, github: ReturnType<typeof fauxGitHub>["github"]) {
  const erreur: string[] = [];
  try {
    await principal({ args: ["BOBL-tech/mirrorlab"], env: {}, dire: () => {}, redire: (l) => void erreur.push(l) }, () => MAINTENANT, () => ({ ...github, ouvertes }));
  } catch (levee) {
    return { code: (levee as { code: number }).code, erreur: erreur.join("\n") };
  }
  return { code: 0, erreur: erreur.join("\n") };
}

test("ce qu'attend une issue se relit de son dernier commentaire marqué d'un auteur du dépôt, même avec `-->` dans les mots du chef", () => {
  const attente = { what: "the --> arrow", who: "a <team>", followUp: "2026-11-16T15:05:00.000Z" };
  const corps = corpsDeLAttente(attente);
  assert.deepEqual(attenteDeLIssue([{ body: corps, association: "OWNER" }]), attente);
  assert.equal(attenteDeLIssue([{ body: corps, association: "NONE" }]), null);
  assert.equal(attenteDeLIssue([{ body: "<!-- brigade:waiting {nope} -->", association: "OWNER" }]), null);
});
