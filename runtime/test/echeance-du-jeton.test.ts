// L'échéance du jeton longue durée de la connexion Max, annoncée des semaines
// à l'avance. L'étape de connexion Max range la date de création à côté du
// jeton (`<fichier>.cree`) ; le runtime la relit au démarrage puis à chaque
// tick, n'écrit au journal que ce qui change, et la file du chef en tire une
// ligne, une seule : l'échéance approche, elle est passée, ou la date ne se lit
// pas — avec le seul geste à faire, refaire le jeton. Jamais sa valeur.
import assert from "node:assert/strict";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { decrireEtat, lireEtat } from "../src/etat.ts";
import { PREAVIS_DU_JETON_JOURS, VIE_DU_JETON_JOURS } from "../src/evenements/jeton.ts";
import { brancherJeton, fichierDeCreation, lireCreation } from "../src/jeton-claude.ts";
import { demarrer, type CauseReveil } from "../src/runtime.ts";
import { repertoireTemporaire } from "./outils.ts";

const JOUR_MS = 24 * 3600 * 1000;
const RIEN = ["attend     rien n'attend le chef"];
// Assemblé à l'exécution : un jeton en clair dans un fichier du dépôt serait refusé.
const VALEUR = ["sk-ant-oat01", "x".repeat(60)].join("-");

// Un jeton rangé comme l'étape de connexion Max le range, une cuisine dont le
// test tient les ticks, et le bloc `attend` de `status` tel que le chef le lit.
function cuisine(t: TestContext) {
  const etc = repertoireTemporaire(t);
  const jeton = join(etc, "claude-token");
  writeFileSync(jeton, `${VALEUR}\n`, { mode: 0o600 });
  const etat = join(repertoireTemporaire(t), "brigade");
  let runtime = demarrer({ repertoireEtat: etat, projet: "brigade", intervalleVeilleMs: 5, intervalleTickMs: 3_600_000 });
  t.after(() => runtime.arreter("test"));
  let tick: (cause: CauseReveil) => void = () => {};
  const brancher = (fichier: string | null = jeton) => brancherJeton({ ...runtime, surReveil: (ecouter: (cause: CauseReveil) => void) => ((tick = ecouter), () => {}) }, fichier);
  const redemarrer = () => {
    runtime.arreter("test");
    runtime = demarrer({ repertoireEtat: etat, projet: "brigade", intervalleVeilleMs: 5, intervalleTickMs: 3_600_000 });
  };
  const creeIlYA = (jours: number, maintenant = new Date()) => {
    const cree = new Date(maintenant.getTime() - jours * JOUR_MS).toISOString();
    writeFileSync(fichierDeCreation(jeton), `${cree}\n`);
    return cree;
  };
  const bloc = (maintenant = new Date()) => {
    const lignes = decrireEtat(lireEtat(runtime.journal, maintenant), maintenant);
    return lignes.slice(lignes.findIndex((ligne) => ligne.startsWith("attend")), lignes.indexOf("fin attend"));
  };
  const observees = () => runtime.journal.tout().filter((e) => e.type === "token.observed");
  return { jeton, brancher, tick: () => tick("tick"), creeIlYA, bloc, observees, redemarrer, journal: () => runtime.journal };
}

const GESTE = (jeton: string) =>
  `refaire le jeton — \`claude setup-token\` sous le compte du service : supprimer ${jeton}, puis relancer l'étape de connexion Max (docs/installation-station.md, « 5. Le jeton de la connexion Max ») ; la station relit le jeton neuf et sa date`;

test("la vie d'un jeton est d'un an, et l'échéance s'annonce des semaines avant", () => {
  assert.equal(VIE_DU_JETON_JOURS, 365);
  assert.ok(PREAVIS_DU_JETON_JOURS >= 14 && PREAVIS_DU_JETON_JOURS < VIE_DU_JETON_JOURS, `préavis de ${PREAVIS_DU_JETON_JOURS} jours`);
});

test("créé il y a 340 jours, sur 365 : la file porte l'échéance du jeton, sa date, et le seul geste à faire — jamais sa valeur", (t) => {
  const { jeton, brancher, creeIlYA, bloc, journal } = cuisine(t);
  const maintenant = new Date();
  const cree = creeIlYA(340, maintenant);
  brancher();

  const echeance = new Date(Date.parse(cree) + 365 * JOUR_MS).toISOString();
  const lignes = bloc(maintenant);
  assert.equal(lignes.length, 2, lignes.join("\n"));
  // Annoncée depuis l'ouverture du préavis : 30 jours avant l'échéance, il y a 5 jours.
  assert.equal(lignes[0], "attend     1 décision attend le chef depuis 5 j");
  const ligne = lignes[1] ?? "";
  assert.match(ligne, /^ {2}jeton {2}depuis 5 j {2}/);
  assert.ok(ligne.endsWith(`jeton de la connexion Max près de son échéance — il échoit le ${echeance}, 365 jours après sa création (${cree}) — à faire avant : ${GESTE(jeton)}`), ligne);
  // Le geste nomme le fichier, jamais ce qu'il porte : ni la file ni le journal.
  assert.ok(!ligne.includes(VALEUR));
  assert.ok(!JSON.stringify(journal().tout()).includes(VALEUR));
});

test("créé récemment, ou juste avant le préavis : aucune alerte", (t) => {
  const { brancher, creeIlYA, bloc, observees } = cuisine(t);
  const maintenant = new Date();
  creeIlYA(2, maintenant);
  brancher();
  assert.deepEqual(bloc(maintenant), RIEN);
  // Le fait est écrit — la date est lue —, mais rien n'attend le chef.
  assert.deepEqual(observees().map((e) => e.payload.state), ["read"]);

  // La veille du préavis, rien ; le jour où il s'ouvre, la ligne.
  const cree = Date.parse(observees()[0]?.payload.created ?? "");
  const ouverture = cree + (VIE_DU_JETON_JOURS - PREAVIS_DU_JETON_JOURS) * JOUR_MS;
  assert.deepEqual(bloc(new Date(ouverture - 1000)), RIEN);
  assert.equal(bloc(new Date(ouverture)).length, 2);
});

test("l'alerte n'est pas dupliquée : des passages successifs et un redémarrage n'écrivent rien de neuf, la file garde une ligne et sa date ; un jeton refait la fait sortir", (t) => {
  const { brancher, tick, creeIlYA, bloc, observees, redemarrer } = cuisine(t);
  const maintenant = new Date();
  creeIlYA(340, maintenant);
  brancher();
  const premiere = bloc(maintenant);
  for (let i = 0; i < 5; i++) tick();
  assert.equal(observees().length, 1);
  assert.deepEqual(bloc(maintenant), premiere);
  // Plus tard, toujours une seule ligne, qui date de l'ouverture du préavis.
  const plusTard = new Date(maintenant.getTime() + 3 * JOUR_MS);
  const ensuite = bloc(plusTard);
  assert.equal(ensuite.filter((ligne) => ligne.startsWith("  jeton")).length, 1);
  assert.equal(ensuite[1]?.replace(/depuis [^ ]+( [^ ]+)?  /, ""), premiere[1]?.replace(/depuis [^ ]+( [^ ]+)?  /, ""));

  redemarrer();
  brancher();
  tick();
  assert.equal(observees().length, 1);

  // Le jeton refait porte une date neuve : la ligne sort au tick suivant.
  creeIlYA(0, maintenant);
  tick();
  assert.equal(observees().length, 2);
  assert.deepEqual(bloc(maintenant), RIEN);
});

test("échu : la file le dit, avec la date et le geste ; le runtime tourne", (t) => {
  const { jeton, brancher, creeIlYA, bloc } = cuisine(t);
  const maintenant = new Date();
  const cree = creeIlYA(400, maintenant);
  assert.doesNotThrow(() => brancher());
  const echeance = new Date(Date.parse(cree) + 365 * JOUR_MS).toISOString();
  const ligne = bloc(maintenant)[1] ?? "";
  assert.ok(
    ligne.endsWith(`jeton de la connexion Max ÉCHU depuis le ${echeance}, 365 jours après sa création (${cree}) — les \`claude\` lancés ne se connectent plus avec lui — à faire : ${GESTE(jeton)}`),
    ligne,
  );
  // Échu depuis l'échéance : c'est d'elle que la ligne se compte (35 jours).
  assert.match(ligne, /depuis 35 j/);
});

test("date absente, illisible ou qui n'en est pas une : la file le dit clairement, sans planter le runtime, et ne garde rien de ce que le fichier porte", (t) => {
  const { jeton, brancher, tick, bloc, observees, journal } = cuisine(t);
  const cree = fichierDeCreation(jeton);
  const dit = (pourquoi: string) => `date de création du jeton de la connexion Max ${pourquoi} (${cree}) — son échéance est inconnue : il vit 365 jours — à faire : ${GESTE(jeton)}`;
  const ligne = () => bloc()[1] ?? "";

  // Rangé sans sa date.
  assert.doesNotThrow(() => brancher());
  assert.ok(ligne().endsWith(dit("absente")), ligne());

  // Une date qui n'en est pas une — ou le jeton lui-même, recopié par erreur.
  writeFileSync(cree, "l'an prochain\n");
  tick();
  assert.ok(ligne().endsWith(dit("qui ne se lit pas comme une date")), ligne());
  writeFileSync(cree, `${VALEUR}\n`);
  assert.doesNotThrow(() => tick());
  assert.ok(ligne().endsWith(dit("qui ne se lit pas comme une date")), ligne());

  // Un fichier qui ne s'ouvre pas.
  rmSync(cree);
  mkdirSync(cree);
  assert.doesNotThrow(() => tick());
  assert.ok(ligne().endsWith(dit("illisible")), ligne());

  assert.deepEqual(observees().map((e) => e.payload.state), ["absent", "invalid", "unreadable"]);
  assert.equal(bloc().filter((l) => l.startsWith("  jeton")).length, 1);
  assert.ok(!JSON.stringify(journal().tout()).includes(VALEUR));
  assert.ok(!bloc().join("\n").includes(VALEUR));
});

test("sans jeton configuré, rien ne s'écrit ni ne s'annonce ; un jeton retiré efface l'annonce d'avant", (t) => {
  const { brancher, tick, creeIlYA, bloc, observees, redemarrer } = cuisine(t);
  brancher(null);
  tick();
  assert.equal(observees().length, 0);
  assert.deepEqual(bloc(), RIEN);

  creeIlYA(340);
  redemarrer();
  brancher();
  assert.equal(bloc().length, 2);
  redemarrer();
  brancher(null);
  assert.deepEqual(observees().map((e) => e.payload.state), ["read", "none"]);
  assert.deepEqual(bloc(), RIEN);
});

test("la date se lit telle que l'étape de connexion Max la range, et rien d'autre ne passe pour une date", (t) => {
  const etc = repertoireTemporaire(t);
  const jeton = join(etc, "claude-token");
  const ecrire = (texte: string) => writeFileSync(fichierDeCreation(jeton), texte);
  assert.equal(fichierDeCreation("/etc/brigade/claude-token"), "/etc/brigade/claude-token.cree");
  ecrire("2026-10-16T07:19:12.345Z\n");
  assert.deepEqual(lireCreation(jeton), { token: jeton, file: `${jeton}.cree`, state: "read", created: "2026-10-16T07:19:12.345Z", lifetimeDays: 365, warningDays: PREAVIS_DU_JETON_JOURS });
  for (const texte of ["", "16/10/2026", "1", "demain"]) {
    ecrire(texte);
    assert.equal(lireCreation(jeton).state, "invalid", texte);
  }
  assert.equal(lireCreation(null).state, "none");
});
