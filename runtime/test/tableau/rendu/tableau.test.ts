// Le corps du tableau de la cuisine (« Kitchen board »), rendu de l'état
// d'exemple de `status` (test/aides/bas-de-status.ts) : sa file et son état
// sont ceux que `status` écrit, son bloc machine se relit tel quel, il ne
// mentionne personne, et il ne change d'un rendu à l'autre que par son heure.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { decrireEtat, dureeEn, lireEtat } from "../../../src/etat.ts";
import { ouvrirJournal } from "../../../src/journal.ts";
import { FERMETURE_DU_BLOC, lireLeTableau, OUVERTURE_DU_BLOC, VERSION_DU_TABLEAU, type Tableau } from "../../../src/tableau/rendu/bloc.ts";
import { tableauDeLaCuisine } from "../../../src/tableau/rendu/donnees.ts";
import { enMarkdown, LONGUEUR_MAX_DU_CORPS, rendreLeTableau } from "../../../src/tableau/rendu/rendre.ts";
import { LU_LE } from "../../aides/haut-de-status.ts";
import { copieDeLExempleDuBas } from "../../aides/opt-A-etat.ts";
import { aArreter } from "../../outils.ts";

const GENERE_LE = new Date("2026-10-12T10:04:30.000Z");

// L'état d'exemple, lu à l'heure de l'exemple, et ce que `status` en écrit.
function exemple(t: TestContext) {
  const journal = ouvrirJournal(copieDeLExempleDuBas(t), { lectureSeule: true });
  aArreter(t, () => journal.fermer());
  const etat = lireEtat(journal, LU_LE);
  return { etat, status: decrireEtat(etat, LU_LE), tableau: tableauDeLaCuisine(etat, LU_LE) };
}

// Le markdown tel qu'il se lit : sans ses échappements, sans gluon, les blancs ramenés à un.
const enClair = (corps: string) => corps.replaceAll("**", "").replace(/\\([\\`*_[\]<>~&])/g, "$1").replaceAll("⁠", "").replace(/\s+/g, " ");
const resserre = (ligne: string) => ligne.trim().replace(/\s+/g, " ");
// Une ligne de `status`, sans son titre de onze colonnes.
const sansTitre = (ligne: string) => (!ligne.startsWith(" ") && ligne.length > 11 && ligne[10] === " " && ligne[11] !== " " ? ligne.slice(11) : ligne);
const partieLisible = (corps: string) => corps.slice(0, corps.indexOf(OUVERTURE_DU_BLOC));

test("le tableau montre chaque ligne de la file avec son geste, telle que `status` l'écrit dans son bloc `awaiting`", (t) => {
  const { etat, status, tableau } = exemple(t);
  const lu = enClair(rendreLeTableau(tableau, GENERE_LE));
  const awaiting = status.slice(status.findIndex((ligne) => ligne.startsWith("awaiting ")) + 1, status.indexOf("end awaiting"));
  // #19, qui attend #21 fermé sans avoir été servi, n'attend plus le chef (#1834).
  assert.equal(etat.attend.length, 3);
  assert.equal(tableau.file.length, etat.attend.length);
  for (const [rang, ligne] of tableau.file.entries()) {
    const deStatus = awaiting[rang] ?? "";
    // La ligne de `status` : son nom, depuis quand, ce qui attend et son geste, son titre.
    const depuis = `for ${dureeEn(LU_LE.getTime() - Date.parse(ligne.depuis))}`;
    assert.equal(resserre(deStatus), resserre(`${ligne.nom}  ${depuis}  ${ligne.ligne}${ligne.titre === null ? "" : `  ${ligne.titre}`}`));
    assert.ok(lu.includes(resserre(`${ligne.nom} · ${depuis}${ligne.titre === null ? "" : ` · ${ligne.titre}`}`)), `${ligne.nom} : sa tête`);
    assert.ok(lu.includes(resserre(ligne.ligne)), `${ligne.nom} : ce qui attend et son geste`);
  }
  // Les gestes, dans leur code : le disjoncteur à refermer. La remontée technique de #18 n'en porte plus : elle est
  // à la cuisine (#1826).
  assert.ok(!lu.includes("`brigade <projet> pass 18`"));
  assert.ok(lu.includes("`brigade <projet> guardrails resume`"));
  // Le bilan sans grant, qui n'est pas une décision, et la tête du bloc.
  assert.ok(lu.includes("without a grant, 1 green delivery stopped"));
  assert.ok(lu.includes("Awaiting the chef — 3 decisions, the oldest for 4 min"));
});

test("le tableau montre l'état de la cuisine comme `status` l'écrit : cooks, machine, quota, base, alertes, plafonds", (t) => {
  const { status, tableau } = exemple(t);
  const lu = enClair(rendreLeTableau(tableau, GENERE_LE));
  const cherche = (debut: string) => {
    const ligne = status.find((dite) => sansTitre(dite).trimStart().startsWith(debut));
    assert.ok(ligne !== undefined, `status écrit une ligne qui commence par « ${debut} »`);
    assert.ok(lu.includes(resserre(sansTitre(ligne))), `le tableau la montre : ${ligne}`);
  };
  // Les alertes, en tête : rien ne cuit, la connexion Max tombée, le setup bloqué, la mise de côté.
  cherche("nothing cooks: base red");
  cherche("Max EXPIRED for 4 min on box/claude");
  cherche("BLOCKED for 4 min on ba5e000");
  // La base, rouge, et son geste.
  cherche("RED since 4 min ago on abc1234");
  cherche("replay its gates without waiting for a commit");
  // Le runtime, la cuisine et son disjoncteur, le grant, la sauvegarde.
  cherche("running according to the log");
  cherche("open · breaker OPEN");
  cherche("merge ACTIVE");
  cherche("2 min ago (2026-10-09T10-00-00Z");
  // Les cooks et le plafond de la station, la machine qui sature, la station qui se retient, l'arbitre.
  cherche("3 running — box/claude: 2 at most");
  cherche("#23  STUCK  23-bb");
  cherche("#31  31-aa  opus / high");
  cherche("manager  juge-9-cc");
  cherche("MACHINE SATURATED for 2 min on CPU");
  cherche("box/claude WITHHOLDING");
  cherche("ARBITER UNREACHABLE");
  // Le quota : ce que les cooks ont consommé, par fenêtre — celle de 5 h est celle du quota Max.
  cherche("in flight: 3 launches");
  cherche("5 h: 8 launches");
  cherche("what this project has launched");
  cherche("tests 622 for a threshold of 500");
  // Le rail, par son décompte.
  cherche("3 taken · 2 in pass");
  // Ce qui ne se lit que sur la box n'y est pas : les serveurs locaux, les worktrees, les derniers événements.
  assert.ok(!lu.includes("127.0.0.1"));
  assert.ok(!lu.includes("not cleaned up after their cook"));
  // Les derniers événements ne sont ni dans la partie lisible ni dans l'état du bloc : seuls les
  // faits nomment le dernier, comme `facts` (`dernierEvenement`), que la vue du rail date.
  assert.ok(!enClair(partieLisible(rendreLeTableau(tableau, GENERE_LE))).includes("guard.configured"));
  assert.ok(!JSON.stringify(tableau.cuisine).includes("guard.configured"));
  // Les champs, pour un programme.
  const { cuisine } = tableau;
  assert.equal(cuisine.etat, "retenue");
  assert.equal(cuisine.cooks.length, 3);
  assert.equal(cuisine.cooks.find(({ run }) => run === "23-bb")?.coince, true);
  assert.equal(cuisine.cooks.find(({ run }) => run === "31-aa")?.tokens, 184_000);
  assert.deepEqual(cuisine.stations.map(({ station, plafond, saturation }) => ({ station, plafond, saturation })), [{ station: "box/claude", plafond: 2, saturation: ["cpu"] }]);
  assert.ok(cuisine.stations[0]?.deconnecteeDepuis !== null);
  assert.deepEqual([cuisine.base?.resultat, cuisine.base?.sha, cuisine.base?.reparation], ["red", "abc1234def", 30]);
  assert.deepEqual(cuisine.plafonds, { tokens: 2_000_000, dureeMs: 3_600_000, inactiviteMs: 600_000 });
  assert.equal(cuisine.disjoncteur.seuil, 3);
  assert.equal(cuisine.consommation.fenetres[0]?.heures, 5);
  assert.equal(cuisine.consommation.enCours.tokens, 184_000);
});

test("le corps finit par son bloc machine, versionné et daté, et le relire rend la file et l'état de l'exemple", (t) => {
  const { etat, tableau } = exemple(t);
  const corps = rendreLeTableau(tableau, GENERE_LE);
  assert.ok(corps.trimEnd().endsWith(FERMETURE_DU_BLOC));
  const lu = lireLeTableau(corps);
  assert.ok(lu.lu, lu.lu ? "" : lu.raison);
  assert.equal(lu.version, VERSION_DU_TABLEAU);
  assert.equal(lu.genereLe, GENERE_LE.toISOString());
  assert.deepEqual(lu.tableau, tableau);
  // La file relue est celle de l'état : chaque attente, dans son ordre, avec sa décision.
  assert.deepEqual(
    lu.tableau.file.map(({ nom, quoi, depuis }) => ({ nom, quoi, depuis })),
    etat.attend.map((attente) => ({ nom: attente.ticket === null ? lu.tableau.file.find(({ quoi }) => quoi === attente.quoi)?.nom : `#${attente.ticket}`, quoi: attente.quoi, depuis: attente.since })),
  );
  // Le disjoncteur, en tête, ne porte pas de ticket : aucune décision de ticket.
  assert.deepEqual(lu.tableau.file.map(({ quoi, decision }) => [quoi, decision]), [["disjoncteur", null], ["setup", null], ["connexion", null]]);
});

test("ce que le bloc porte ne ferme pas le commentaire, et se relit tel quel", (t) => {
  const { tableau } = exemple(t);
  const piege: Tableau = { ...tableau, projet: "a --> b <!-- c & d", bilans: ["--!> et -->"] };
  const corps = rendreLeTableau(piege, GENERE_LE);
  // Un seul `-->` dans le corps : celui qui ferme le bloc.
  assert.equal(corps.split("-->").length - 1, 1);
  const lu = lireLeTableau(corps);
  assert.ok(lu.lu);
  assert.deepEqual(lu.tableau, piege);
});

test("le corps ne mentionne personne : aucun `@` collé à un nom hors du code, aucun dans le bloc", (t) => {
  const { tableau } = exemple(t);
  const [premiere] = tableau.file;
  assert.ok(premiere !== undefined);
  // Des `@` partout où le texte vient d'ailleurs : titre d'issue, ligne, carte, rubrique, bilan, projet.
  const mentions: Tableau = {
    ...tableau,
    projet: "@octo/brigade",
    file: [
      { ...premiere, titre: "Ask @octocat about it", ligne: "to decide: ping @acme, or run `npm i x@1`" },
      { ...premiere, nom: "#99", ticket: 99, carte: { type: "product", question: "Ask @hubot?", choix: [{ texte: "yes @someone", suite: "resume" }] } },
    ],
    bilans: ["seen by @someone-else"],
    cuisine: { ...tableau.cuisine, rubriques: [...tableau.cuisine.rubriques, { titre: "@x", lignes: ["by @y", "and @z"] }] },
  };
  for (const corps of [rendreLeTableau(tableau, GENERE_LE), rendreLeTableau(mentions, GENERE_LE)]) {
    const lisible = partieLisible(corps).replace(/`[^`\n]+`/g, "");
    assert.doesNotMatch(lisible, /@[A-Za-z0-9]/);
    assert.doesNotMatch(corps.slice(corps.indexOf(OUVERTURE_DU_BLOC)), /@/);
  }
  // Le texte se lit encore, et le bloc rend les `@` tels quels.
  const corps = rendreLeTableau(mentions, GENERE_LE);
  assert.ok(enClair(corps).includes("Ask @octocat about it"));
  assert.ok(corps.includes("`npm i x@1`"));
  const lu = lireLeTableau(corps);
  assert.ok(lu.lu);
  assert.deepEqual(lu.tableau, mentions);
});

test("le même état rendu deux fois donne le même corps, octet pour octet, à l'heure de génération près", (t) => {
  const { etat, tableau } = exemple(t);
  assert.deepEqual(tableauDeLaCuisine(etat, LU_LE), tableau);
  const un = rendreLeTableau(tableauDeLaCuisine(etat, LU_LE), GENERE_LE);
  const autreHeure = new Date("2026-10-12T11:30:00.000Z");
  const deux = rendreLeTableau(tableauDeLaCuisine(etat, LU_LE), autreHeure);
  assert.equal(un, rendreLeTableau(tableau, GENERE_LE));
  assert.notEqual(un, deux);
  assert.equal(deux.replaceAll(autreHeure.toISOString(), GENERE_LE.toISOString()), un);
});

test("une file vide le dit, et un corps trop long pour GitHub se resserre sans rien perdre de son bloc", (t) => {
  const { tableau } = exemple(t);
  const vide = rendreLeTableau({ ...tableau, file: [], bilans: [] }, GENERE_LE);
  assert.ok(vide.includes("## Awaiting the chef — nothing"));

  const [premiere] = tableau.file;
  assert.ok(premiere !== undefined);
  const longue: Tableau = { ...tableau, file: Array.from({ length: 60 }, (_, rang) => ({ ...premiere, nom: `#${1000 + rang}`, ticket: 1000 + rang, ligne: `${premiere.ligne} ${"x".repeat(200)}` })) };
  const corps = rendreLeTableau(longue, GENERE_LE);
  assert.ok(corps.length <= LONGUEUR_MAX_DU_CORPS, `${corps.length}`);
  assert.ok(corps.includes("**#1059**"));
  assert.ok(corps.includes("Shortened to fit in an issue"));
  const lu = lireLeTableau(corps);
  assert.ok(lu.lu);
  assert.deepEqual(lu.tableau, longue);
});

test("un corps sans bloc, d'une version plus récente, ou au JSON cassé ne se lit pas, et dit pourquoi en une phrase", (t) => {
  const { tableau } = exemple(t);
  const corps = rendreLeTableau(tableau, GENERE_LE);
  const raison = (texte: string) => {
    const lu = lireLeTableau(texte);
    assert.ok(!lu.lu);
    return lu.raison;
  };
  assert.match(raison("# Kitchen board\n\nedited by hand"), /no machine block/);
  assert.match(raison(corps.replace(`"version":${VERSION_DU_TABLEAU}`, `"version":${VERSION_DU_TABLEAU + 1}`)), /newer than this app reads/);
  assert.match(raison(corps.replace(`${OUVERTURE_DU_BLOC}\n{`, `${OUVERTURE_DU_BLOC}\n{{`)), /not readable JSON/);
  assert.match(raison(corps.slice(0, corps.lastIndexOf(FERMETURE_DU_BLOC))), /no end/);
  assert.match(raison(corps.replace(`"genereLe":"${GENERE_LE.toISOString()}"`, `"genereLe":"hier"`)), /no generation time/);
});

test("le markdown échappe ce que `status` écrit hors du code, et laisse le code tel quel", () => {
  assert.equal(enMarkdown("a <projet> *b* [c] `brigade <projet> pass 18` d_e"), "a \\<projet\\> \\*b\\* \\[c\\] `brigade <projet> pass 18` d\\_e");
  assert.equal(enMarkdown("un ` seul"), "un \\` seul");
});
