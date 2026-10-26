// Une station d'un projet, lue et changée seule (épique 1506) : son plafond et
// ses capacités, la retirer, la dire jouée par un poste — et les autres
// stations restent écrites comme elles l'étaient. Côté poste, `app.json`
// gagne la station que ce poste joue, sans que personne n'y touche à la main.
// Tout vaut pour un poste Windows (`pc/claude`) comme pour un Mac.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { decisionsPosees } from "../src/decisions.ts";
import { principal } from "../src/declarer-stations.ts";
import { ouvrirJournal } from "../src/journal.ts";
import { ConfigInvalide } from "../src/runtime.ts";
import { changerDansLaDeclaration, changerUneStation, jouerIci, nePlusJouerIci, stationsDuProjet, tenirDansLaDeclaration, tenirUneStation } from "../src/une-station.ts";
import { appeler, FAUX_CLAUDE, repertoireTemporaire } from "./outils.ts";

const PROJET = "espace";
const POSTES = ["mac/claude", "pc/claude"] as const;

// Les entrées d'une déclaration, telles qu'elles sont écrites.
const entrees = (declaration: string) => declaration.split(",").map((entree) => entree.trim());
const env = (etat: string) => ({ BRIGADE_STATE_DIR: etat, BRIGADE_PROJECT: PROJET, BRIGADE_CLAUDE_BIN: FAUX_CLAUDE });

function declarationAuJournal(etat: string): string | undefined {
  const journal = ouvrirJournal(etat, { lectureSeule: true });
  try {
    return decisionsPosees(journal.base).BRIGADE_STATIONS;
  } finally {
    journal.fermer();
  }
}

async function installer(etat: string, args: string[]) {
  const appel = appeler(principal, args, env(etat));
  return { code: await appel.fin, sortie: appel.sortie() };
}

for (const poste of POSTES) {
  test(`${poste} : la lecture dit, pour chaque station, son nom, son plafond, ses capacités, et si un poste la joue ou si elle tourne sur la box`, async (t) => {
    const declaration = `box/claude:3:code+raisonnement,${poste}:1:navigateur-headless+chrome-connecte:distante`;

    assert.deepEqual(stationsDuProjet(declaration), [
      { nom: "box/claude", cooks: 3, fournit: ["code", "raisonnement"], distante: false },
      { nom: poste, cooks: 1, fournit: ["navigateur-headless", "chrome-connecte"], distante: true },
    ]);

    // La même lecture, par la commande que l'app lance sur la box.
    const etat = repertoireTemporaire(t);
    assert.equal((await installer(etat, [declaration])).code, 0);
    const appel = appeler(principal, ["--json"], env(etat));
    assert.equal(await appel.fin, 0, appel.sortie());
    const lue = JSON.parse(appel.sortie()) as { declarees: Array<{ nom: string; cooks: number; fournit: string[]; distante: boolean }> };
    assert.deepEqual(
      lue.declarees.map(({ nom, cooks, fournit, distante }) => ({ nom, cooks, fournit, distante })),
      stationsDuProjet(declaration),
    );
  });

  test(`${poste} : régler le plafond et les capacités d'une station laisse les deux autres écrites à l'identique`, async (t) => {
    // Des espaces et des marques que la réécriture d'une entrée normaliserait :
    // celles qu'on ne change pas ne sont pas réécrites.
    const declaration = ` box/claude:3:code+raisonnement , ${poste}:1:code:distante+ordinaires,box/playwright:2:navigateur-headless`;
    const avant = stationsDuProjet(declaration);

    const neuve = changerDansLaDeclaration(declaration, poste, { reglee: { cooks: 2, fournit: ["code", "navigateur-headless"] } });

    assert.deepEqual(entrees(neuve)[0], entrees(declaration)[0]);
    assert.deepEqual(entrees(neuve)[2], entrees(declaration)[2]);
    const apres = stationsDuProjet(neuve);
    assert.deepEqual([apres[0], apres[2]], [avant[0], avant[2]]);
    assert.deepEqual(apres[1], { nom: poste, cooks: 2, fournit: ["code", "navigateur-headless"], distante: true });
    // Ce qu'elle prenait en plus des tickets qui demandent ses capacités reste.
    assert.equal(entrees(neuve)[1], `${poste}:2:code+navigateur-headless:distante+ordinaires`);

    // Au journal, par la commande : une seule décision posée, la nouvelle déclaration.
    const etat = repertoireTemporaire(t);
    assert.equal((await installer(etat, [declaration])).code, 0);
    const { code, sortie } = await installer(etat, ["set", poste, "2", "code+navigateur-headless"]);
    assert.equal(code, 0, sortie);
    assert.match(sortie, new RegExp(`${poste.replace("/", "\\/")} réglée, les autres stations inchangées`));
    assert.equal(declarationAuJournal(etat), neuve);
  });

  test(`${poste} : retirer une station ne retire qu'elle`, async (t) => {
    const declaration = `box/claude:3:code+raisonnement,${poste}:1:navigateur-headless:distante,box/playwright:2:navigateur-headless`;

    const neuve = changerDansLaDeclaration(declaration, poste, { retiree: true });

    assert.deepEqual(entrees(neuve), [entrees(declaration)[0], entrees(declaration)[2]]);
    assert.deepEqual(stationsDuProjet(neuve), [stationsDuProjet(declaration)[0], stationsDuProjet(declaration)[2]]);

    const etat = repertoireTemporaire(t);
    assert.equal((await installer(etat, [declaration])).code, 0);
    const { code, sortie } = await installer(etat, ["remove", poste]);
    assert.equal(code, 0, sortie);
    assert.equal(declarationAuJournal(etat), neuve);
  });

  test(`${poste} : une station de la box dite jouée par un poste devient distante, et rien d'autre ne change`, async (t) => {
    const declaration = `box/claude:3:code+raisonnement,${poste}:1:navigateur-headless`;

    const neuve = changerDansLaDeclaration(declaration, poste, { distante: true });

    assert.deepEqual(entrees(neuve), [entrees(declaration)[0], `${poste}:1:navigateur-headless:distante`]);

    const etat = repertoireTemporaire(t);
    assert.equal((await installer(etat, [declaration])).code, 0);
    assert.equal((await installer(etat, ["remote", poste])).code, 0);
    assert.equal(declarationAuJournal(etat), neuve);
    // La redire ne réécrit rien.
    const { code, sortie } = await installer(etat, ["remote", poste]);
    assert.equal(code, 0, sortie);
    assert.match(sortie, /est déjà ainsi — rien n'est réécrit/);
  });

  test(`${poste} : marquer la station jouée par ce poste l'ajoute aux « stations » du projet dans app.json, le reste du fichier inchangé`, (t) => {
    const chemin = join(repertoireTemporaire(t), "app.json");
    const ecrit = {
      hotes: ["shop-box"],
      projets: [
        { nom: "autre", dossier: "~/autre", hote: "shop-box", stations: ["mac/claude"] },
        { nom: PROJET, dossier: "~/espace", hote: "shop-box", couleurs: { onglet: "#123456" } },
      ],
    };
    writeFileSync(chemin, `${JSON.stringify(ecrit, null, 2)}\n`);

    assert.deepEqual(jouerIci(chemin, PROJET, poste), { ecrit: true, stations: [poste] });

    const relu = JSON.parse(readFileSync(chemin, "utf8")) as typeof ecrit & { projets: Array<{ stations?: string[] }> };
    assert.deepEqual(relu.projets[1]?.stations, [poste]);
    assert.deepEqual(relu, { ...ecrit, projets: [ecrit.projets[0], { ...ecrit.projets[1], stations: [poste] }] });
    // Déjà jouée : rien n'est réécrit.
    assert.deepEqual(jouerIci(chemin, PROJET, poste), { ecrit: false, stations: [poste] });

    // Ne plus la jouer la retire, et la liste vide avec elle.
    assert.deepEqual(nePlusJouerIci(chemin, PROJET, poste), { ecrit: true, stations: [] });
    assert.deepEqual(JSON.parse(readFileSync(chemin, "utf8")), ecrit);
  });

  test(`${poste} : changer une station au journal la relit et pose la déclaration neuve, avec celle qu'elle remplace`, (t) => {
    const journal = ouvrirJournal(repertoireTemporaire(t));
    try {
      assert.throws(() => changerUneStation(journal, { projet: PROJET, nom: poste, changement: { retiree: true }, auteur: "chef" }), (erreur) => erreur instanceof ConfigInvalide && /the project declares none/.test(erreur.message));
      const declaration = `box/claude:3:code,${poste}:1:code:distante`;
      journal.ajouter({ project: PROJET, ticket: null, author: "chef", type: "decision.set", payload: { name: "BRIGADE_STATIONS", value: declaration, previous: null } });

      const fait = changerUneStation(journal, { projet: PROJET, nom: poste, changement: { reglee: { cooks: 4, fournit: ["code"] } }, auteur: "chef" });

      assert.deepEqual(fait?.payload, { name: "BRIGADE_STATIONS", value: `box/claude:3:code,${poste}:4:code:distante`, previous: declaration });
      assert.equal(changerUneStation(journal, { projet: PROJET, nom: poste, changement: { reglee: { cooks: 4, fournit: ["code"] } }, auteur: "chef" }), null);
    } finally {
      journal.fermer();
    }
  });
}

test("une station que le projet ne déclare pas, un plafond ou une capacité illisible, la dernière station : refusés, rien n'est écrit", async (t) => {
  const declaration = "box/claude:3:code,mac/claude:1:code:distante";
  assert.throws(() => changerDansLaDeclaration(declaration, "pc/claude", { retiree: true }), /unknown station: “pc\/claude” — the project's stations: box\/claude, mac\/claude/);
  assert.throws(() => changerDansLaDeclaration(declaration, "mac/claude", { reglee: { cooks: 0, fournit: ["code"] } }), /cap: “0” is not an integer greater than zero/);
  assert.throws(() => changerDansLaDeclaration(declaration, "mac/claude", { reglee: { cooks: 1, fournit: [] } }), /provides: it is missing/);
  assert.throws(() => changerDansLaDeclaration("box/claude:3:code", "box/claude", { retiree: true }), /box\/claude is the project's only station/);

  const etat = repertoireTemporaire(t);
  assert.equal((await installer(etat, [declaration])).code, 0);
  for (const args of [["set", "mac/claude", "beaucoup", "code"], ["set", "mac/claude", "1", "Code Rapide"], ["remove", "pc/claude"], ["set", "mac/claude"]]) {
    const { code, sortie } = await installer(etat, args);
    assert.equal(code, 2, `${args.join(" ")} : ${sortie}`);
  }
  assert.equal(declarationAuJournal(etat), declaration);
});

test("sans journal, changer une station est refusé sans en créer un", async (t) => {
  const etat = repertoireTemporaire(t);
  const { code, sortie } = await installer(etat, ["remove", "box/claude"]);
  assert.equal(code, 1, sortie);
  assert.match(sortie, /aucun journal dans .* rien n'est écrit/);
});

test("app.json : un projet sans box, un projet absent, un autre moteur ou un fichier illisible — refusés, le fichier n'est pas réécrit", (t) => {
  const chemin = join(repertoireTemporaire(t), "app.json");
  const texte = `${JSON.stringify({ projets: [{ nom: PROJET, dossier: "~/espace" }, { nom: "servi", dossier: "~/servi", hote: "box" }] }, null, 2)}\n`;
  writeFileSync(chemin, texte);

  assert.match((jouerIci(chemin, PROJET, "pc/claude") as { refus: string }).refus, /espace has no box .* \(“hote”\)/);
  assert.match((jouerIci(chemin, "inconnu", "mac/claude") as { refus: string }).refus, /declares no project named “inconnu”/);
  assert.match((jouerIci(chemin, "servi", "mac/playwright") as { refus: string }).refus, /runs an engine this workstation does not run/);
  assert.match((jouerIci(chemin, "servi", "Mac/Claude") as { refus: string }).refus, /is not a station name/);
  assert.equal(readFileSync(chemin, "utf8"), texte);

  writeFileSync(chemin, "{ pas du json");
  assert.match((jouerIci(chemin, "servi", "mac/claude") as { refus: string }).refus, /is not JSON/);
  assert.equal(readFileSync(chemin, "utf8"), "{ pas du json");
});

test("tenir une station : ajoutée à la fin si la déclaration ne l'a pas, réécrite à sa place sinon, les autres écrites à l'identique ; rien de réécrit quand elle dit déjà la même chose", (t) => {
  const mac = { nom: "mac/claude", moteur: "claude", fournit: ["code", "macos"], cooks: 1, distante: true as const, ordinaires: true as const, ensemble: true as const };
  assert.equal(tenirDansLaDeclaration("", mac), "mac/claude:1:code+macos:distante+ensemble");
  const declaration = "box/claude:3:code+raisonnement , box/playwright : 1 : navigateur-headless";
  assert.equal(tenirDansLaDeclaration(declaration, mac), "box/claude:3:code+raisonnement,box/playwright : 1 : navigateur-headless,mac/claude:1:code+macos:distante+ensemble");
  assert.equal(tenirDansLaDeclaration("mac/claude : 1 : code+macos : distante+ensemble,box/claude:3:code", mac), "mac/claude : 1 : code+macos : distante+ensemble,box/claude:3:code");
  assert.equal(tenirDansLaDeclaration("mac/claude:2:chrome:distante,box/claude:3:code", mac), "mac/claude:1:code+macos:distante+ensemble,box/claude:3:code");
  assert.throws(() => tenirDansLaDeclaration(declaration, { ...mac, fournit: ["Code Rapide"] }), ConfigInvalide);

  const etat = repertoireTemporaire(t);
  const journal = ouvrirJournal(etat);
  try {
    assert.notEqual(tenirUneStation(journal, { projet: PROJET, station: mac, auteur: "chef" }), null);
    assert.equal(tenirUneStation(journal, { projet: PROJET, station: mac, auteur: "chef" }), null);
  } finally {
    journal.fermer();
  }
  assert.equal(declarationAuJournal(etat), "mac/claude:1:code+macos:distante+ensemble");
});
