// Le canal des propositions du second (#1519) : des choix et des gestes publiés
// au chef, reçus par l'app sans rien lire du terminal, remplacés par la suivante,
// effacés par la réponse du chef — et jamais une commande lancée.
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { effacer, fichierDeProposition, principal, propositionActuelle, publier, repondre, suivreLaProposition, type Suivi } from "../../src/second-propositions/canal.ts";
import { aProposer, propositionLue, Refus, type Proposition } from "../../src/second-propositions/proposition.ts";
import { appeler, jusqua, repertoireTemporaire } from "../outils.ts";

const canal = (t: TestContext) => join(repertoireTemporaire(t), "second", "proposition.json");

// Un abonné : tout ce qu'il a reçu, dans l'ordre, et le suivi à arrêter en fin de test.
function abonne(t: TestContext, chemin: string): { recus: (Proposition | null)[]; suivi: Suivi } {
  const recus: (Proposition | null)[] = [];
  const suivi = suivreLaProposition(chemin, (proposition) => recus.push(proposition));
  t.after(() => suivi.arreter());
  return { recus, suivi };
}

const CHOIX = {
  kind: "choices",
  choices: [
    { value: "A", label: "Split the ticket in two" },
    { value: "B", label: "Keep it whole, raise its effort" },
    { value: "C", label: "Close it: #1281 already covers it" },
  ],
};

test("des choix publiés : l'abonné reçoit chaque choix avec son libellé d'une ligne, et rien d'autre", async (t) => {
  const chemin = canal(t);
  const { recus, suivi } = abonne(t, chemin);
  assert.deepEqual([...recus], [null]);
  const publiee = publier(chemin, CHOIX, () => new Date("2026-10-23T10:00:00.000Z"));
  await jusqua(() => recus.length === 2);
  const recue = recus[1];
  assert.ok(recue !== null && recue !== undefined && recue.kind === "choices");
  assert.deepEqual(recue, { ...CHOIX, id: publiee.id, at: "2026-10-23T10:00:00.000Z" });
  assert.deepEqual(
    recue.choices.map(({ label }) => label),
    ["Split the ticket in two", "Keep it whole, raise its effort", "Close it: #1281 already covers it"],
  );
  assert.deepEqual(suivi.actuelle(), recue);
  // Ce que l'abonné reçoit est ce que le second a publié, tel quel : aucun texte de terminal n'y entre.
  assert.deepEqual(JSON.parse(readFileSync(chemin, "utf8")), publiee);
});

test("un geste publié : l'abonné reçoit la commande exacte, ni coupée, ni rognée, ni citée", async (t) => {
  const chemin = canal(t);
  const { recus } = abonne(t, chemin);
  const longue = `ssh -o BatchMode=yes -- box.example brigade gadgets rail answer 433 '${"un texte qui ne doit pas être coupé ".repeat(200)}'  `;
  for (const command of ["! gh pr merge 1480 --merge", "  ! gh pr merge 1480 --squash --delete-branch", longue, `! echo "$HOME" && printf '%s\\n' \`date\` ; rm -rf "/tmp/x y"`]) {
    const avant = recus.length;
    publier(chemin, { kind: "gesture", command });
    await jusqua(() => recus.length === avant + 1);
    const recue = recus.at(-1);
    assert.ok(recue !== null && recue !== undefined && recue.kind === "gesture");
    assert.equal(recue.command, command);
    assert.equal(recue.command.length, command.length);
  }
});

test("une nouvelle proposition remplace la précédente : l'abonné n'en tient jamais deux", async (t) => {
  const chemin = canal(t);
  const { recus, suivi } = abonne(t, chemin);
  const premiere = publier(chemin, CHOIX);
  const seconde = publier(chemin, { kind: "gesture", command: "! gh pr merge 1480 --merge" });
  await jusqua(() => suivi.actuelle()?.id === seconde.id);
  // Chaque réception est une proposition, ou rien — jamais une liste — et la dernière est la plus récente.
  for (const recue of recus) assert.ok(recue === null || (typeof recue === "object" && !Array.isArray(recue) && typeof recue.id === "string"));
  assert.equal(recus.at(-1)?.id, seconde.id);
  assert.notEqual(premiere.id, seconde.id);
  assert.deepEqual(propositionActuelle(chemin), seconde);
  // Le canal ne porte qu'un fichier : rien de la précédente ne reste à côté.
  assert.deepEqual(readdirSync(join(chemin, "..")), ["proposition.json"]);
  // Un second abonné, venu après, ne reçoit que la dernière.
  const { recus: tard } = abonne(t, chemin);
  assert.deepEqual(tard, [seconde]);
});

test("le chef répond d'un clic : la proposition s'efface, et les abonnés le reçoivent", async (t) => {
  const chemin = canal(t);
  const { recus, suivi } = abonne(t, chemin);
  const publiee = publier(chemin, CHOIX);
  await jusqua(() => suivi.actuelle()?.id === publiee.id);
  assert.deepEqual(repondre(chemin, { id: publiee.id, by: "click", value: "B" }), { state: "answered", proposal: publiee });
  await jusqua(() => recus.at(-1) === null);
  assert.equal(suivi.actuelle(), null);
  assert.equal(propositionActuelle(chemin), null);
  assert.equal(existsSync(chemin), false);
});

test("le chef répond en tapant sa réponse : la proposition s'efface aussi, choix comme geste", async (t) => {
  const chemin = canal(t);
  const { recus, suivi } = abonne(t, chemin);
  for (const brute of [CHOIX, { kind: "gesture", command: "! gh pr merge 1480 --merge" }]) {
    const publiee = publier(chemin, brute);
    await jusqua(() => suivi.actuelle()?.id === publiee.id);
    assert.equal(repondre(chemin, { id: publiee.id, by: "text" }).state, "answered");
    await jusqua(() => recus.at(-1) === null);
  }
});

test("un geste se répond d'un clic, sans valeur", async (t) => {
  const chemin = canal(t);
  const geste = publier(chemin, { kind: "gesture", command: "! gh pr merge 1480 --merge" });
  assert.equal(repondre(chemin, { id: geste.id, by: "click", value: "A" }).state, "refused");
  assert.deepEqual(repondre(chemin, { id: geste.id, by: "click" }), { state: "answered", proposal: geste });
});

test("une réponse à une proposition qui a changé n'efface pas la nouvelle", (t) => {
  const chemin = canal(t);
  const vue = publier(chemin, CHOIX);
  const nouvelle = publier(chemin, { kind: "gesture", command: "! gh pr merge 1480 --merge" });
  assert.deepEqual(repondre(chemin, { id: vue.id, by: "click", value: "A" }), {
    state: "refused",
    reason: "nothing to answer: the second's proposal changed since it was read",
    current: nouvelle,
  });
  assert.deepEqual(propositionActuelle(chemin), nouvelle);
});

test("une réponse refusée laisse la proposition en place : un choix qu'elle n'offre pas, rien à répondre", (t) => {
  const chemin = canal(t);
  assert.deepEqual(repondre(chemin, { id: "x", by: "text" }), { state: "refused", reason: "nothing to answer: the second has no proposal", current: null });
  const publiee = publier(chemin, CHOIX);
  assert.deepEqual(repondre(chemin, { id: publiee.id, by: "click", value: "D" }), { state: "refused", reason: "the proposal offers A, B, C", current: publiee });
  assert.equal(repondre(chemin, { id: publiee.id, by: "voice" }).state, "refused");
  assert.equal(repondre(chemin, { by: "text" }).state, "refused");
  assert.deepEqual(propositionActuelle(chemin), publiee);
});

test("le second passé à autre chose efface sa proposition : les abonnés reçoivent null", async (t) => {
  const chemin = canal(t);
  const { recus, suivi } = abonne(t, chemin);
  const publiee = publier(chemin, CHOIX);
  await jusqua(() => suivi.actuelle()?.id === publiee.id);
  assert.deepEqual(effacer(chemin), publiee);
  await jusqua(() => recus.at(-1) === null);
  assert.equal(effacer(chemin), null);
});

test("ce qui n'a pas la forme d'une proposition est refusé avant d'être publié, sans rien réécrire", (t) => {
  const refuse = (brute: unknown, raison: RegExp) => assert.throws(() => aProposer(brute), (erreur: unknown) => erreur instanceof Refus && raison.test(erreur.message));
  refuse(null, /an object/);
  refuse({ kind: "question" }, /choices or gesture/);
  refuse({ kind: "choices", choices: [] }, /at least one choice/);
  refuse({ kind: "choices", choices: [{ value: "A" }] }, /choice 1 has no label/);
  refuse({ kind: "choices", choices: [{ value: "A", label: "  " }] }, /empty label/);
  refuse({ kind: "choices", choices: [{ value: "A", label: "Split it\nin two" }] }, /not on one line/);
  refuse({ kind: "choices", choices: [{ value: "", label: "Split" }] }, /empty value/);
  refuse({ kind: "choices", choices: [{ value: "A", label: "x" }, { value: "A", label: "y" }] }, /two choices have the value A/);
  refuse({ kind: "gesture", command: " " }, /carries the command/);
  refuse({ kind: "gesture", command: "! gh pr merge 1480\nrm -rf ~" }, /one line/);
  // Un libellé long n'est pas coupé.
  const long = "x".repeat(500);
  assert.equal((aProposer({ kind: "choices", choices: [{ value: "A", label: long }] }) as { choices: { label: string }[] }).choices[0]?.label, long);
  // Rien d'autre que le contrat n'est gardé de ce qui est publié.
  assert.deepEqual(aProposer({ ...CHOIX, text: "A) Split…", extra: 1 }), CHOIX);
  // Refusée, une proposition ne remplace pas celle en cours.
  const chemin = canal(t);
  const tenue = publier(chemin, CHOIX);
  assert.throws(() => publier(chemin, { kind: "gesture", command: "" }), Refus);
  assert.deepEqual(propositionActuelle(chemin), tenue);
});

test("un fichier abîmé ne se lit pas comme une proposition", async (t) => {
  const chemin = canal(t);
  const { recus } = abonne(t, chemin);
  writeFileSync(chemin, '{"kind":"gesture","command":"! gh pr m');
  assert.equal(propositionActuelle(chemin), null);
  assert.equal(propositionLue({ kind: "gesture", command: "! gh pr merge 1" }), null);
  const publiee = publier(chemin, CHOIX);
  await jusqua(() => recus.at(-1)?.id === publiee.id);
  assert.ok(recus.every((recue) => recue === null || recue.id === publiee.id));
});

test("aucun chemin du module ne lance la commande d'un geste", async (t) => {
  // Ce que les sources du module importent : rien qui lance un process ou joue du code.
  const dossier = join(import.meta.dirname, "../../src/second-propositions");
  for (const nom of readdirSync(dossier)) {
    const code = readFileSync(join(dossier, nom), "utf8");
    assert.doesNotMatch(code, /child_process|sans-invite|node:vm|worker_threads|\bspawn\w*\(|\bexec\w*\(|\beval\(|new Function\(/, nom);
  }
  // Et de bout en bout : un geste publié, suivi, lu, répondu d'un clic — la commande n'a pas tourné.
  const repertoire = repertoireTemporaire(t);
  const temoin = join(repertoire, "lance");
  const chemin = join(repertoire, "second", "proposition.json");
  const { recus } = abonne(t, chemin);
  const geste = publier(chemin, { kind: "gesture", command: `touch ${temoin}` });
  await jusqua(() => recus.at(-1)?.id === geste.id);
  assert.deepEqual(propositionActuelle(chemin), geste);
  assert.equal((await appeler((appel) => principal(appel, repertoire), ["show"], { BRIGADE_SECOND_PROPOSAL: chemin }).fin), 0);
  assert.equal(repondre(chemin, { id: geste.id, by: "click" }).state, "answered");
  await jusqua(() => recus.at(-1) === null);
  assert.equal(existsSync(temoin), false);
});

test("le fichier du canal : un par dossier de projet, sous ~/.config/brigade/second, ou celui que nomme BRIGADE_SECOND_PROPOSAL", (t) => {
  const maison = repertoireTemporaire(t);
  const un = fichierDeProposition("/projets/gadgets", { HOME: maison });
  assert.equal(fichierDeProposition("/projets/gadgets/", { HOME: maison }), un);
  assert.match(un, /[\\/]\.config[\\/]brigade[\\/]second[\\/][0-9a-f]{16}\.json$/);
  assert.ok(un.startsWith(maison));
  assert.notEqual(fichierDeProposition("/projets/autre", { HOME: maison }), un);
  assert.equal(fichierDeProposition("/projets/gadgets", { HOME: maison, BRIGADE_SECOND_PROPOSAL: join(maison, "p.json") }), join(maison, "p.json"));
});

test("la commande : le second publie, l'app lit et signale la réponse, en une ligne JSON chacune", async (t) => {
  const dossier = repertoireTemporaire(t);
  const env = { HOME: repertoireTemporaire(t) };
  const jouer = async (...args: string[]) => {
    const appel = appeler((a) => principal(a, dossier), args, env);
    const code = await appel.fin;
    return { code, sortie: appel.sortie() };
  };
  const json = (sortie: string) => JSON.parse(sortie.trim());

  const choix = await jouer("choices", "A", "Split the ticket in two", "B", "Keep it whole");
  assert.equal(choix.code, 0);
  const publiee = json(choix.sortie);
  assert.equal(publiee.state, "published");
  assert.deepEqual(publiee.proposal.choices, [
    { label: "Split the ticket in two", value: "A" },
    { label: "Keep it whole", value: "B" },
  ]);
  assert.deepEqual(json((await jouer("show")).sortie), { state: "current", proposal: publiee.proposal });
  assert.deepEqual(propositionActuelle(fichierDeProposition(dossier, env)), publiee.proposal);

  const commande = `! gh pr merge 1480 --merge  # "tel quel"`;
  const geste = await jouer("gesture", commande);
  assert.equal(geste.code, 0);
  const gesteJson = json(geste.sortie);
  assert.equal(gesteJson.proposal.command, commande);

  // La réponse à la proposition remplacée est refusée ; celle à la proposition en cours l'efface.
  const tard = await jouer("answered", publiee.proposal.id, "click", "A");
  assert.equal(tard.code, 1);
  assert.equal(json(tard.sortie).state, "refused");
  const repondue = await jouer("answered", gesteJson.proposal.id, "click");
  assert.equal(repondue.code, 0);
  assert.deepEqual(json(repondue.sortie), { state: "answered", proposal: gesteJson.proposal });
  assert.deepEqual(json((await jouer("show")).sortie), { state: "current", proposal: null });

  await jouer("choices", "A", "x");
  assert.deepEqual(json((await jouer("clear")).sortie), { state: "cleared" });
  assert.deepEqual(json((await jouer("show")).sortie), { state: "current", proposal: null });

  const refus = await jouer("choices", "A", "two\nlines");
  assert.equal(refus.code, 1);
  assert.deepEqual(json(refus.sortie), { state: "refused", reason: "the label of choice 1 is not on one line" });

  for (const faux of [[], ["choices"], ["choices", "A"], ["gesture"], ["gesture", "!", "gh"], ["clear", "x"], ["answered"], ["answered", "id", "voice"], ["answered", "id", "text", "A"], ["merge"]]) {
    assert.equal((await jouer(...faux)).code, 2, faux.join(" "));
  }
});
