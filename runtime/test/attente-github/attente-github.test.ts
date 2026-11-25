// Parked sur un projet GitHub (#4129, d'abord WAITING, #3074) : les gestes qui parquent un ticket et l'en sortent, sur
// une carte nommée par son dépôt et son numéro, joués par la commande `parked` (attente-cli.ts), GitHub simulé.
import assert from "node:assert/strict";
import { test } from "node:test";
import { principal } from "../../src/attente-cli.ts";
import { attenteDeLIssue, corpsDuParking, direRelance, lireCartesGitHub, lireCible } from "../../src/attente-github/attente-github.ts";
import { corpsDeCarte, carteBloque } from "../../src/github-seul/carte-todo/carte-todo.ts";
import { LABELS_D_AVANT_PARKED } from "../../src/github-etat/etats.ts";
import { fauxGitHub, issue } from "../aides/cuisine.ts";

const MAINTENANT = new Date("2026-11-09T15:05:00.000Z");
const CARTE = 614;
// Le ticket que les gestes parquent : sur le rail, rien ne l'attend.
const TICKET = 615;
// `--until 2026-11-20` : ce jour-là à minuit, heure de la box.
const LE_20 = new Date(2026, 10, 20).toISOString();
const DIT_LE_20 = direRelance(LE_20);
const ech = (texte: string) => texte.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Un projet GitHub seul : l'issue 614, une carte de TODO (`chef-todo` et son commentaire marqué), parquée pour le chef ;
// l'issue 615, sur le rail.
function projet() {
  const faux = fauxGitHub(issue(CARTE, ["fire", "model:opus", "effort:medium", "chef-todo"]), issue(TICKET, ["fire", "model:opus", "effort:medium"]));
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
  const labels = (numero = TICKET) => faux.lire(numero)?.labels ?? [];
  const commentes = (numero = TICKET) => faux.commentaires.filter(([n]) => n === numero).map(([, corps]) => corps);
  return { faux, lancer, labels, commentes, depots };
}

test("un ticket GitHub seul se nomme par son dépôt et son numéro", () => {
  assert.deepEqual(lireCible("BOBL-tech/mirrorlab#614"), { depot: "BOBL-tech/mirrorlab", numero: 614 });
  assert.deepEqual([lireCible("614"), lireCible("BOBL-tech/mirrorlab"), lireCible("BOBL-tech/mirrorlab#0"), lireCible("mirrorlab#614")], [null, null, null, null]);
});

test("`parked set` : le label `parked` et un commentaire qui dit qui, pour quoi, jusqu'à quand ; le ticket rejoint les parqués, la carte du chef reste dans TODO", async () => {
  const { faux, lancer, labels, commentes, depots } = projet();
  const avant = await lancer("BOBL-tech/mirrorlab");
  assert.equal(avant.code, 0, avant.erreur);
  assert.match(avant.sortie, /^TODO — parked for the chef, BOBL-tech\/mirrorlab, read from GitHub\n {2}#614 {2}The cook of #614 is blocked: which payment provider to use\. {2}Ticket 614\nPARKED — waiting for someone else, .*\n {2}no other ticket is parked$/);

  const pose = await lancer("set", "BOBL-tech/mirrorlab#615", "--what", "the signed quote", "--from", "the client", "--until", "2026-11-20");
  assert.equal(pose.code, 0, pose.erreur);
  assert.deepEqual(depots.at(-1), "BOBL-tech/mirrorlab");
  assert.equal(pose.sortie, `PARKED: BOBL-tech/mirrorlab#615  waits for the client: “the signed quote” — until ${DIT_LE_20} — the \`parked\` label and its comment are on the issue`);
  assert.deepEqual(faux.labellisations, [[TICKET, ["parked"]]]);
  // Il reprendra où il était : ses labels restent, `parked` s'y ajoute.
  assert.deepEqual(labels().sort(), ["effort:medium", "fire", "model:opus", "parked"]);
  assert.equal(commentes().length, 1);
  const [commentaire = ""] = commentes();
  assert.ok(commentaire.startsWith("<!-- brigade:parked "), commentaire);
  for (const mot of ["- **who**: the client", "- **for what**: the signed quote", `- **until**: ${DIT_LE_20}`]) assert.ok(commentaire.includes(mot), commentaire);

  const cartes = await lireCartesGitHub(faux.github);
  assert.deepEqual(cartes.todo.map(({ numero }) => numero), [CARTE]);
  assert.deepEqual(
    cartes.parked.map(({ numero, attente }) => ({ numero, attente })),
    [{ numero: TICKET, attente: { what: "the signed quote", who: "the client", followUp: LE_20 } }],
  );
  const apres = await lancer("BOBL-tech/mirrorlab");
  assert.match(apres.sortie, new RegExp(`TODO — .*\\n {2}#614 {2}.*\\nPARKED — .*\\n {2}#615 {2}waits for the client: “the signed quote” — until ${ech(DIT_LE_20)} {2}Ticket 615$`));
});

test("`parked set` sans date : il reprend dans sept jours, et le commentaire le dit ; jusqu'à un fait, le commentaire dit le fait", async () => {
  const { faux, lancer, commentes } = projet();
  const pose = await lancer("set", "BOBL-tech/mirrorlab#615", "--what", "the signed quote", "--from", "the client");
  assert.equal(pose.code, 0, pose.erreur);
  assert.ok(commentes()[0]?.includes("- **until**: 2026-11-16 15:05 UTC"), commentes()[0] ?? "");

  faux.poser(issue(616, ["fire"]));
  const fait = await lancer("set", "BOBL-tech/mirrorlab#616", "--what", "the signed quote", "--from", "the client", "--fact", "the client signs");
  assert.equal(fait.code, 0, fait.erreur);
  assert.equal(fait.sortie, "PARKED: BOBL-tech/mirrorlab#616  waits for the client: “the signed quote” — until the client signs — the `parked` label and its comment are on the issue");
  assert.ok(commentes(616)[0]?.includes("- **until**: the client signs"), commentes(616)[0] ?? "");
  assert.deepEqual(attenteDeLIssue(faux.commentaires.filter(([n]) => n === 616).map(([, body]) => ({ body, association: "OWNER" }))), { what: "the signed quote", who: "the client", followUp: "2026-11-16T15:05:00.000Z", fact: "the client signs" });
});

test("`parked set` pour le chef : `chef-todo` seul, la marque puis sa carte ; le ticket est dans son TODO", async () => {
  const { faux, lancer, labels, commentes } = projet();
  const pose = await lancer("set", "BOBL-tech/mirrorlab#615", "--what", "which provider", "--from", "chef", "--fact", "the chef answers");
  assert.equal(pose.code, 0, pose.erreur);
  // Parqué pour le chef, il ne porte que `chef-todo` : `parked` dit qu'il attend quelqu'un d'autre.
  assert.deepEqual(faux.labellisations, [[TICKET, ["chef-todo"]]]);
  assert.deepEqual(labels().sort(), ["chef-todo", "effort:medium", "fire", "model:opus"]);
  // La marque du parking, puis la carte de TODO que l'app lit, avec son champ de réponse.
  const [marque = "", carte = "", ...autres] = commentes();
  assert.deepEqual(autres, []);
  assert.match(marque, /^<!-- brigade:parked \{"what":"which provider","who":"the chef","followUp":"2026-11-16T15:05:00\.000Z","fact":"the chef answers"\} -->/);
  assert.equal(carte, "<!-- brigade:todo kind=product-question -->\n#615 is parked for the chef: which provider\n\nAnswer on this issue, and the ticket resumes exactly where it was.");
  const cartes = await lireCartesGitHub(faux.github);
  assert.deepEqual(cartes.todo.map(({ numero, ligne, manque }) => ({ numero, ligne, manque })), [
    { numero: CARTE, ligne: "The cook of #614 is blocked: which payment provider to use.", manque: null },
    { numero: TICKET, ligne: "#615 is parked for the chef: which provider", manque: null },
  ]);
  assert.deepEqual(cartes.parked, []);
  const liste = await lancer("BOBL-tech/mirrorlab");
  assert.match(liste.sortie, /\n {2}#615 {2}#615 is parked for the chef: which provider {2}Ticket 615\nPARKED — /);
});

test("parqué pour le chef sans sa carte — une station arrêtée entre les deux : sa marque dit ce qu'il attend de lui", async () => {
  const { faux } = projet();
  faux.poser(issue(616, ["fire", "chef-todo"]));
  faux.repondre(616, corpsDuParking({ what: "which provider", who: "the chef", followUp: "2026-11-16T15:05:00.000Z", fact: "the chef answers" }));
  const cartes = await lireCartesGitHub(faux.github);
  assert.deepEqual(cartes.todo.map(({ numero, ligne, manque }) => ({ numero, ligne, manque })).at(-1), { numero: 616, ligne: "waits for the chef: “which provider”", manque: null });
});

test("`parked set` sur une issue déjà parquée : ni second label ni commentaire, et la commande dit ce qu'elle a trouvé", async () => {
  const { faux, lancer, commentes } = projet();
  await lancer("set", "BOBL-tech/mirrorlab#615", "--what", "the signed quote", "--from", "the client");
  const encore = await lancer("set", "BOBL-tech/mirrorlab#615", "--what", "something else", "--from", "someone");
  assert.equal(encore.code, 1);
  assert.match(encore.erreur, /BOBL-tech\/mirrorlab#615 is already parked — waits for the client: “the signed quote” — until 2026-11-16 15:05 UTC: nothing was written/);
  assert.deepEqual([faux.labellisations.length, commentes().length], [1, 1]);

  // Un `parked` posé à la main, sans commentaire : la commande le dit, sans rien inventer.
  faux.poser(issue(616, ["fire", "parked"]));
  const aLaMain = await lancer("set", "BOBL-tech/mirrorlab#616", "--what", "x", "--from", "y");
  assert.equal(aLaMain.code, 1);
  assert.match(aLaMain.erreur, /#616 is already parked — carries `parked`, but no comment of the repository says who it waits for, for what, or until when/);

  // Une carte du chef est déjà parquée, pour lui : la reparquer pour lui est refusé.
  const carte = await lancer("set", "BOBL-tech/mirrorlab#614", "--what", "x", "--from", "the chef");
  assert.equal(carte.code, 1);
  assert.match(carte.erreur, /BOBL-tech\/mirrorlab#614 is already parked — .*: nothing was written/);
  assert.deepEqual([faux.labellisations.length, commentes(CARTE).length], [1, 0]);
});

test("`parked set` d'une carte du chef pour un autre : elle garde `chef-todo`, prend `parked` et sa marque, et quitte TODO pour les parqués", async () => {
  const { faux, lancer, labels, commentes } = projet();
  const pose = await lancer("set", "BOBL-tech/mirrorlab#614", "--what", "the signed quote", "--from", "the client");
  assert.equal(pose.code, 0, pose.erreur);
  assert.deepEqual(faux.labellisations, [[CARTE, ["parked"]]]);
  assert.deepEqual(labels(CARTE), ["fire", "model:opus", "effort:medium", "chef-todo", "parked"]);
  assert.match(commentes(CARTE).at(-1) ?? "", /^<!-- brigade:parked \{"what":"the signed quote","who":"the client"/);
  const { todo, parked } = await lireCartesGitHub(faux.github);
  assert.deepEqual([todo.map(({ numero }) => numero), parked.map(({ numero }) => numero)], [[], [CARTE]]);
});

test("`parked resume` d'une carte du chef parquée pour un autre : seul `parked` tombe, elle revient dans TODO, où elle était", async () => {
  const { faux, lancer, labels } = projet();
  await lancer("set", "BOBL-tech/mirrorlab#614", "--what", "the signed quote", "--from", "the client");
  const reprise = await lancer("resume", "BOBL-tech/mirrorlab#614");
  assert.equal(reprise.code, 0, reprise.erreur);
  assert.equal(reprise.sortie, "BOBL-tech/mirrorlab#614 unparked: `parked` removed — it resumes exactly where it was");
  assert.deepEqual(labels(CARTE), ["fire", "model:opus", "effort:medium", "chef-todo"]);
  const { todo, parked } = await lireCartesGitHub(faux.github);
  assert.deepEqual([todo.map(({ numero }) => numero), parked.map(({ numero }) => numero)], [[CARTE], []]);
});

test("`parked set` s'ouvre à toute étape : `taken` et `in-pass` restent, le ticket reprendra où il était", async () => {
  const { faux, lancer, labels } = projet();
  faux.poser(issue(617, ["fire", "taken"]));
  faux.poser(issue(619, ["fire", "in-pass"]));
  for (const numero of [617, 619]) {
    const pose = await lancer("set", `BOBL-tech/mirrorlab#${numero}`, "--what", "x", "--from", "y");
    assert.equal(pose.code, 0, pose.erreur);
  }
  assert.deepEqual([labels(617), labels(619)], [["fire", "taken", "parked"], ["fire", "in-pass", "parked"]]);
});

test("`parked resume` : `parked` retiré, et rien d'autre — le ticket reprend où il était", async () => {
  const { faux, lancer, labels, commentes } = projet();
  await lancer("set", "BOBL-tech/mirrorlab#615", "--what", "the signed quote", "--from", "the client");
  const reprise = await lancer("resume", "BOBL-tech/mirrorlab#615");
  assert.equal(reprise.code, 0, reprise.erreur);
  assert.equal(reprise.sortie, "BOBL-tech/mirrorlab#615 unparked: `parked` removed — it resumes exactly where it was");
  assert.deepEqual(labels().sort(), ["effort:medium", "fire", "model:opus"]);
  assert.equal(commentes().at(-1), "**Unparked** — answered: no longer waiting for the client (“the signed quote”). It resumes exactly where it was.");
  const cartes = await lireCartesGitHub(faux.github);
  assert.deepEqual([cartes.todo.map(({ numero }) => numero), cartes.parked], [[CARTE], []]);

  const refus = await lancer("resume", "BOBL-tech/mirrorlab#615");
  assert.equal(refus.code, 1);
  assert.match(refus.erreur, /BOBL-tech\/mirrorlab#615 is not parked — it does not carry `parked`; nothing was written/);
});

test("`parked arrived` : `chef-todo` retiré, un commentaire dit que c'est arrivé, et le ticket repart en cuisine sans passer par TODO", async () => {
  const { faux, lancer, labels, commentes } = projet();
  await lancer("set", "BOBL-tech/mirrorlab#615", "--what", "which provider", "--from", "the chef", "--fact", "the chef answers");
  const arrive = await lancer("arrived", "BOBL-tech/mirrorlab#615");
  assert.equal(arrive.code, 0, arrive.erreur);
  assert.equal(arrive.sortie, "BOBL-tech/mirrorlab#615 unparked: `chef-todo` removed — it resumes exactly where it was");
  assert.deepEqual(labels().sort(), ["effort:medium", "fire", "model:opus"]);
  assert.equal(commentes().at(-1), "**Unparked — it arrived**: what this ticket was waiting for the chef (“which provider”) has arrived. It resumes exactly where it was.");
  const cartes = await lireCartesGitHub(faux.github);
  assert.deepEqual([cartes.todo.map(({ numero }) => numero), cartes.parked], [[CARTE], []]);
  // Sur le rail : `fire`, calibré, ni pris, ni en pass, ni tenu hors de la cuisine — une station le prend.
  const { issues } = (await faux.github.tickets()) as { issues: { number: number }[] };
  assert.ok(issues.some(({ number }) => number === TICKET));
});

// #4260 : un ticket qu'un label d'attente d'avant parked parque (`estParque`) reprend par le même geste — ce label tombe aussi,
// sans quoi rien ne le prendrait plus jamais.
test("`parked resume` d'un ticket parqué par un label d'avant parked : ce label retiré, seul — le ticket reprend où il était", async () => {
  const { faux, lancer, labels, commentes } = projet();
  const [ancien] = LABELS_D_AVANT_PARKED.filter((label) => label !== "waiting");
  await faux.github.labelliser(TICKET, [ancien as string, "in-pass"]);
  const reprise = await lancer("resume", "BOBL-tech/mirrorlab#615");
  assert.equal(reprise.code, 0, reprise.erreur);
  assert.equal(reprise.sortie, `BOBL-tech/mirrorlab#615 unparked: \`${ancien}\` removed — it resumes exactly where it was`);
  assert.deepEqual(labels().sort(), ["effort:medium", "fire", "in-pass", "model:opus"]);
  assert.equal(commentes().at(-1), "**Unparked** — answered: no longer waiting. It resumes exactly where it was.");
});

test("ce que la commande refuse sur un ticket GitHub seul, sans rien écrire", async () => {
  const { faux, lancer } = projet();
  faux.poser(issue(618, ["fire"], { state: "closed" }));
  const refus = await Promise.all([
    lancer("set", "BOBL-tech/mirrorlab#615", "--what", "x"),
    lancer("bouger", "BOBL-tech/mirrorlab#615"),
    lancer("resume", "BOBL-tech/mirrorlab#615", "--from", "x"),
    lancer("set", "BOBL-tech/mirrorlab#615", "--what", "x", "--from", "y", "--remind", "2026-11-20"),
  ]);
  assert.deepEqual(refus.map(({ code }) => code), [2, 2, 2, 2]);
  // Un numéro seul ne nomme pas un ticket : son dépôt le nomme.
  const seul = await lancer("set", "615", "--what", "x", "--from", "y");
  assert.equal(seul.code, 2);
  assert.match(seul.erreur, /^brigade : a parked ticket is named by its repository, <owner>\/<repo>#<issue>\n/);
  assert.match((await lancer("set", "BOBL-tech/mirrorlab#618", "--what", "x", "--from", "y")).erreur, /#618 is closed/);
  assert.match((await lancer("set", "BOBL-tech/mirrorlab#999", "--what", "x", "--from", "y")).erreur, /#999 is not an issue/);
  assert.match((await lancer("set", "BOBL-tech/mirrorlab#615", "--what", "x", "--from", "y", "--until", "hier")).erreur, /--until: “hier” cannot be read/);
  assert.match((await lancer("set", "BOBL-tech/mirrorlab#615", "--what", "x", "--from", "y", "--until", "2026-11-20", "--fact", "z")).erreur, /parked until a date or until a fact, not both/);
  assert.match((await lancer("set", "BOBL-tech/mirrorlab#615", "--what", "x", "--from", "y", "--fact", " ")).erreur, /--fact: the fact it waits for/);
  assert.deepEqual([faux.labellisations, faux.commentaires], [[], []]);
});

test("une lecture ou une écriture de GitHub qui échoue est dite, et rien n'attend sans dire quoi", async () => {
  const { faux, lancer, labels } = projet();
  faux.pannes.commentaire = true;
  const pose = await lancer("set", "BOBL-tech/mirrorlab#615", "--what", "the signed quote", "--from", "the client");
  assert.equal(pose.code, 1);
  assert.match(pose.erreur, /GitHub: the comment was not posted on BOBL-tech\/mirrorlab#615 \(gh api : HTTP 502\): `parked` was removed, nothing waits/);
  assert.ok(!labels().includes("parked"));

  faux.pannes.commentaire = false;
  faux.pannes.label = true;
  const arrive = await lancer("set", "BOBL-tech/mirrorlab#615", "--what", "the signed quote", "--from", "the client");
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
  const corps = corpsDuParking(attente);
  assert.deepEqual(attenteDeLIssue([{ body: corps, association: "OWNER" }]), attente);
  assert.equal(attenteDeLIssue([{ body: corps, association: "NONE" }]), null);
  assert.equal(attenteDeLIssue([{ body: "<!-- brigade:waiting {nope} -->", association: "OWNER" }]), null);
  assert.equal(attenteDeLIssue([{ body: "<!-- brigade:parked {nope} -->", association: "OWNER" }]), null);
});
