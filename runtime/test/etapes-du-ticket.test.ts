// Les étapes d'un ticket (#4278) : déclarées dans la fiche du projet pour une
// sorte de tickets, chacune passe par la pass avant la suivante, sous une
// seule PR ; la marque d'étape de l'issue suit ; un refus compte dans les
// trois essais du ticket, toutes étapes confondues.
//
// La pass est celle de la station GitHub, sur le faux GitHub (`faux-github.ts`) :
// la relecture, la CI et le merge sont les vrais modules.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { stationDuDepot, type Lancer } from "../src/brigade-github.ts";
import { blocDeLEtape, consigne } from "../src/claude.ts";
import { etapeDuCook, etapesALaBase, MARQUE_D_ETAPE, passerALEtapeSuivante } from "../src/etapes/sur-le-ticket.ts";
import { faitsDeLaFiche, ficheParDefaut, FicheInvalide, validerFiche } from "../src/fiche-projet/index.ts";
import { LABEL_IN_PASS } from "../src/github-etat/etats.ts";
import { CALIBRE, depotNeuf, FauxGitHub, fauxClient, STATION_DU_DEPOT } from "./faux-github.ts";
import { git, repertoireTemporaire } from "./outils.ts";

const GATES = [".claude/brigade/gates.sh"];
const ficheAEtapes = (stages: unknown[]) => ({ ...ficheParDefaut("main"), stages });
const VIDEO = [
  { name: "code", gates: GATES },
  { name: "script", gates: GATES, kind: "video" },
  { name: "storyboard", gates: GATES, kind: "video" },
];

// Un clone dont `origin/main` porte la fiche `fiche` — aucune si null.
function cloneAvecLaFiche(t: TestContext, fiche: unknown): string {
  const clone = repertoireTemporaire(t);
  git(clone, "init", "-q", "-b", "main");
  if (fiche !== null) {
    mkdirSync(join(clone, ".brigade"));
    writeFileSync(join(clone, ".brigade/fiche-projet.json"), typeof fiche === "string" ? fiche : JSON.stringify(fiche));
    git(clone, "add", ".");
  }
  git(clone, "commit", "-q", "--allow-empty", "-m", "base");
  git(clone, "update-ref", "refs/remotes/origin/main", "HEAD");
  return clone;
}

const corps = (faux: FauxGitHub, numero: number) => (faux.commentaires.get(numero) ?? []).map((c) => c.body);
const marques = (faux: FauxGitHub, numero: number) => corps(faux, numero).filter((b) => b.startsWith(MARQUE_D_ETAPE));
const verdicts = (faux: FauxGitHub, pr: number) => corps(faux, pr).flatMap((b) => /^<!-- brigade:verdict station=\S+ verdict=(\S+) /.exec(b)?.[1] ?? []);

test("the sheet declares stages for a kind with `kind`: the cook's stages stay those without one, and a sheet with only kinds is refused", () => {
  const fiche = validerFiche(ficheAEtapes(VIDEO));
  assert.deepEqual(fiche.stages, VIDEO);
  assert.deepEqual(faitsDeLaFiche(fiche).cook.stages, ["code"]);
  // La fiche sans `kind` se lit comme avant : aucune clé de plus.
  assert.deepEqual(Object.keys(validerFiche(ficheParDefaut("main")).stages[0] ?? {}), ["name", "gates"]);
  assert.throws(() => validerFiche(ficheAEtapes(VIDEO.slice(1))), (erreur) => erreur instanceof FicheInvalide && erreur.item === "stages" && /at least one stage without `kind`/.test(erreur.message));
  assert.throws(() => validerFiche(ficheAEtapes([...VIDEO, { name: "voice", gates: GATES, kind: 3 }])), (erreur) => erreur instanceof FicheInvalide && erreur.item === "stages.3.kind");
});

test("the stages at the base: those of the ticket's kind, read from the sheet the chef merged; one with no clone or no sheet; a refused sheet throws", (t) => {
  const clone = cloneAvecLaFiche(t, ficheAEtapes(VIDEO));
  assert.deepEqual(etapesALaBase(clone, "main", ["fire", "video"]), ["script", "storyboard"]);
  assert.equal(etapesALaBase(clone, "main", ["fire", "bug"]).length, 1);
  assert.equal(etapesALaBase(cloneAvecLaFiche(t, null), "main", ["video"]).length, 1);
  assert.equal(etapesALaBase(undefined, "main", ["video"]).length, 1);
  assert.throws(() => etapesALaBase(cloneAvecLaFiche(t, "{"), "main", ["video"]), FicheInvalide);
});

test("the cook of a staged ticket puts the first stage mark on the issue once, and is told the stage the mark says", async () => {
  const faux = new FauxGitHub();
  const github = faux.pour("A");
  assert.equal(await etapeDuCook(github, 1, ["main"]), null);
  assert.deepEqual(corps(faux, 1), []);
  assert.equal(await etapeDuCook(github, 1, ["script", "storyboard", "render"]), "stage 1 of 3: script");
  assert.equal(await etapeDuCook(github, 1, ["script", "storyboard", "render"]), "stage 1 of 3: script");
  assert.deepEqual(marques(faux, 1), [`${MARQUE_D_ETAPE}n=1 -->\n**Stage mark: stage 1 of 3: script**`]);
  faux.poster(1, "A", `${MARQUE_D_ETAPE}n=2 sha=abc -->\n**Stage mark: stage 2 of 3: storyboard**`);
  assert.equal(await etapeDuCook(github, 1, ["script", "storyboard", "render"]), "stage 2 of 3: storyboard");
  // Une marque que le dépôt n'a pas posée ne fait pas avancer le ticket.
  (faux.commentaires.get(1) ?? []).push({ id: 99_999, body: `${MARQUE_D_ETAPE}n=3 sha=abd -->`, association: "NONE", createdAt: new Date().toISOString(), station: "x" });
  assert.equal(await etapeDuCook(github, 1, ["script", "storyboard", "render"]), "stage 2 of 3: storyboard");
  // Le cook le lit dans sa consigne ; un ticket à une étape n'en dit rien.
  assert.match(consigne({ ticket: 1, titre: "t", depot: "o/r", base: "main", etape: "stage 2 of 3: storyboard" }), /tu fais la courante, elle seule : stage 2 of 3: storyboard\./);
  assert.deepEqual(blocDeLEtape(null), []);
  assert.deepEqual(blocDeLEtape(undefined), []);
});

// Le cook d'un ticket `video`, lancé par la station du dépôt sur le clone `clone` : ses consignes, ce que la station dit.
async function cuire(t: TestContext, clone: string) {
  const faux = new FauxGitHub();
  faux.feu(77, [...CALIBRE, "video"]);
  const consignes: string[] = [];
  const lancer: Lancer = ({ entree, flux }) => {
    consignes.push(entree ?? "");
    writeFileSync(flux, `${JSON.stringify({ type: "result", is_error: false, result: "Done." })}\n`);
    return { fin: Promise.resolve({ code: 0, signal: null, turns: 3, tokens: 1, durationMs: 1, arret: null, erreur: null }) };
  };
  const avertis: string[] = [];
  const repertoire = repertoireTemporaire(t);
  const station = stationDuDepot({ ...STATION_DU_DEPOT, github: fauxClient(faux), depot: depotNeuf(repertoire), flux: repertoire, lancer, clone, avertir: (texte) => void avertis.push(texte) });
  if ("refus" in station) throw new Error(station.refus);
  await station.tour();
  await station.calme();
  return { consignes, marques: marques(faux, 77), avertis: avertis.join("\n") };
}

test("the cook, through the station: a staged ticket's cook is told its stage, and the issue shows the first mark; a sheet refused at the base starts no cook", { timeout: 60_000 }, async (t) => {
  const { consignes, marques: posees } = await cuire(t, cloneAvecLaFiche(t, ficheAEtapes(VIDEO)));
  assert.equal(consignes.length, 1);
  assert.match(consignes[0] ?? "", /tu fais la courante, elle seule : stage 1 of 2: script\./);
  assert.deepEqual(posees, [`${MARQUE_D_ETAPE}n=1 -->\n**Stage mark: stage 1 of 2: script**`]);
  const refusee = await cuire(t, cloneAvecLaFiche(t, "{"));
  assert.equal(refusee.consignes.length, 0);
  assert.deepEqual(refusee.marques, []);
  assert.match(refusee.avertis, /the project sheet is refused, no cook starts: .*not JSON/);
});

test("the pass: a stage it accepts is not merged while a stage remains — the mark moves, the next cook's delivery is reviewed, the last one is merged; a ticket of another kind is merged at once with no mark", { timeout: 60_000 }, async (t) => {
  const faux = new FauxGitHub();
  faux.feu(1, [...CALIBRE, "video"]);
  faux.feu(2, [...CALIBRE, "bug"]);
  const avertis: string[] = [];
  const clone = cloneAvecLaFiche(t, ficheAEtapes(VIDEO));
  assert.deepEqual(etapesALaBase(clone, "main", ["video"]), ["script", "storyboard"]);
  const a = faux.station("A", { clone, places: 2, avertir: (texte) => void avertis.push(texte) });
  const vues: string[] = [];
  for (let tour = 0; tour < 12 && faux.mergee(1) === undefined; tour += 1) {
    await a.tour();
    await a.calme();
    const derniere = marques(faux, 1).at(-1);
    if (derniere !== undefined && vues.at(-1) !== derniere) vues.push(derniere);
  }
  const pr = faux.mergee(1);
  assert.ok(pr !== undefined, "the last stage, accepted, is merged");
  assert.equal(vues.length, 1);
  assert.match(vues[0] ?? "", new RegExp(`^${MARQUE_D_ETAPE}n=2 sha=[0-9a-f]+ -->\\n\\*\\*Stage mark: stage 2 of 2: storyboard\\*\\*$`));
  // Deux relectures sur la même PR, une par étape ; entre elles, le verdict qui demande l'étape suivante.
  assert.equal(faux.relectures.filter((r) => r.pr === pr.number).length, 2);
  assert.deepEqual(verdicts(faux, pr.number), ["approve", "request-changes", "approve"]);
  assert.match(corps(faux, pr.number).find((b) => b.includes("verdict=request-changes")) ?? "", /accepted stage 1 of 2: script\. Next: stage 2 of 2: storyboard/);
  // Passer à l'étape suivante n'est pas un renvoi : aucun essai n'est compté.
  assert.equal(corps(faux, 1).filter((b) => b.startsWith("<!-- brigade:renvoi")).length, 0);
  assert.equal(faux.cuissons.filter((c) => c.issue === 1).length, 2);
  // L'autre sorte : une étape, mergée à sa première acceptation, sans marque.
  assert.ok(faux.mergee(2) !== undefined);
  assert.deepEqual(marques(faux, 2), []);
  assert.equal(faux.cuissons.filter((c) => c.issue === 2).length, 1);
  // Le passage n'est pas un merge que GitHub refuse : la station ne le dit pas comme tel.
  assert.deepEqual(avertis.filter((texte) => /refused by GitHub/.test(texte)), []);
});

test("refusals at different stages share the ticket's three tries: the third one, at stage 2, spends them as for a single-stage ticket", { timeout: 60_000 }, async (t) => {
  const faux = new FauxGitHub();
  faux.feu(8, [...CALIBRE, "video"]);
  const suite: Array<"approve" | "request-changes"> = ["request-changes", "approve", "request-changes", "request-changes", "approve"];
  let n = 0;
  const clone = cloneAvecLaFiche(t, ficheAEtapes(VIDEO));
  assert.deepEqual(etapesALaBase(clone, "main", ["video"]), ["script", "storyboard"]);
  const a = faux.station("A", { clone, avertir: () => {}, juger: async () => ({ verdict: suite[n++] ?? "approve", motif: `Remark ${n}: the page is wrong.` }) });
  for (let tour = 0; tour < 20; tour += 1) {
    await a.tour();
    await a.calme();
  }
  assert.equal(faux.mergee(8), undefined);
  assert.equal(marques(faux, 8).length, 1);
  const renvois = corps(faux, 8).filter((b) => b.startsWith("<!-- brigade:renvoi"));
  assert.equal(renvois.length, 3);
  assert.match(renvois[0] ?? "", /sent back to a cook \(1\/2\)/);
  assert.match(renvois[1] ?? "", /sent back to a cook \(2\/2\)/);
  assert.match(renvois[2] ?? "", /^<!-- brigade:renvoi n=3 sha=[\s\S]*still not mergeable after 2 sends back — /);
});

test("a stage step left half done is finished on the next turn without a second step: the mark says it on this head", async () => {
  const faux = new FauxGitHub();
  faux.feu(3, [...CALIBRE, "video"]);
  faux.prs.push({ number: 1000, issue: 3, branche: "cook/3-github", sha: "c".repeat(40), state: "open", merged: false, enRetard: false, mergeePar: null, fichiers: [] });
  faux.ticket(3).labels.add(LABEL_IN_PASS);
  const github = faux.pour("A");
  const etapes = ["script", "storyboard", "render"];
  const pr = { number: 1000, sha: "c".repeat(40) };
  // Pas encore acceptée : rien ne bouge, à une étape non plus.
  assert.equal(await passerALEtapeSuivante(github, { ticket: 3, pr, etapes, station: "A", acceptee: false }), false);
  assert.equal(await passerALEtapeSuivante(github, { ticket: 3, pr, etapes: ["main"], station: "A", acceptee: true }), false);
  assert.deepEqual(corps(faux, 3), []);
  // Un tour arrêté après la marque : la PR est encore approuvée, le ticket en pass.
  faux.poster(1000, "A", `<!-- brigade:verdict station=A verdict=approve sha=${pr.sha} -->\nApproved by station \`A\`.`);
  faux.poster(3, "A", `${MARQUE_D_ETAPE}n=2 sha=${pr.sha} -->\n**Stage mark: stage 2 of 3: storyboard**`);
  assert.equal(await passerALEtapeSuivante(github, { ticket: 3, pr, etapes, station: "A", acceptee: false }), true);
  assert.equal(marques(faux, 3).length, 1);
  assert.equal(faux.ticket(3).labels.has(LABEL_IN_PASS), false);
  assert.deepEqual(verdicts(faux, 1000), ["approve", "request-changes"]);
  // Le verdict posé, un tour de plus n'en pose pas un second.
  faux.ticket(3).labels.add(LABEL_IN_PASS);
  assert.equal(await passerALEtapeSuivante(github, { ticket: 3, pr, etapes, station: "A", acceptee: true }), true);
  assert.deepEqual(verdicts(faux, 1000), ["approve", "request-changes"]);
  assert.equal(faux.ticket(3).labels.has(LABEL_IN_PASS), false);
  // À la dernière étape, acceptée, elle se merge : pas de passage.
  faux.poster(3, "A", `${MARQUE_D_ETAPE}n=3 sha=${"d".repeat(40)} -->\n**Stage mark: stage 3 of 3: render**`);
  assert.equal(await passerALEtapeSuivante(github, { ticket: 3, pr, etapes, station: "A", acceptee: true }), false);
});
