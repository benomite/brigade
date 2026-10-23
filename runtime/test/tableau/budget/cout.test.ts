// Ce que le rafraîchissement du tableau coûte à GitHub, dans le budget : le client
// du tableau compte ses appels sous « board », et `status` les dit par heure, tous
// projets confondus, à zéro quand rien n'a tourné.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { decrireEtat, lireEtat } from "../../../src/etat.ts";
import { ouvrirJournal } from "../../../src/journal.ts";
import { appelsDeLaStation, FENETRE_MS, limiteDeLaStation } from "../../../src/limite-github.ts";
import { clientGitHubDuTableau, type ClientDuTableau } from "../../../src/tableau/publication/client.ts";
import { publierLeTableau } from "../../../src/tableau/publication/publier.ts";
import { coutDuTableau } from "../../../src/tableau/budget/cout.ts";
import { rendreLeTableau } from "../../../src/tableau/rendu/rendre.ts";
import type { Tableau } from "../../../src/tableau/rendu/bloc.ts";
import { tableauDeLaCuisine } from "../../../src/tableau/rendu/donnees.ts";
import { LU_LE } from "../../aides/haut-de-status.ts";
import { copieDeLExempleDuBas } from "../../aides/opt-A-etat.ts";
import { aArreter, DEPOT, fauxGh, repertoireTemporaire } from "../../outils.ts";

const MINUTE = 60_000;
const SANS_WINDOWS = { skip: process.platform === "win32" && "le faux `gh` est un script bash" };

const ligneDuTableau = (lignes: string[]) => lignes.find((l) => l.startsWith("board cost"));

function etatDExemple(t: TestContext) {
  const journal = ouvrirJournal(copieDeLExempleDuBas(t), { lectureSeule: true });
  aArreter(t, () => journal.fermer());
  return lireEtat(journal, LU_LE);
}

test("N rafraîchissements dont M changent le contenu, sur une heure : `status` dit exactement les appels faits par le client", SANS_WINDOWS, async (t) => {
  const gh = fauxGh(t);
  const station = repertoireTemporaire(t);
  let instant = LU_LE.getTime();
  const limite = limiteDeLaStation(station, { maintenant: () => instant });
  aArreter(t, () => limite.fermer());

  // Le tableau est déjà dans le dépôt, épinglé ; le faux GitHub garde le corps qu'on y écrit.
  const issue = (body: string) => ({ number: 1, title: "Kitchen board", body, state: "open", labels: [{ name: "kitchen-board" }, { name: "hors-cuisine" }], repository_url: `https://api.github.com/repos/${DEPOT}` });
  let corpsDuDepot = "";
  const dicter = () => {
    gh.repondre(`repos/${DEPOT}/issues/1`, { corps: issue(corpsDuDepot) });
    gh.repondre(`repos/${DEPOT}/issues?labels=kitchen-board&state=all&per_page=100`, { corps: [issue(corpsDuDepot)] });
    gh.repondre(`repos/${DEPOT}/issues/1`, { corps: issue(corpsDuDepot) });
    gh.repondre("graphql", { corps: { data: { repository: { issue: { id: "I_1", isPinned: true } } } } });
  };
  const reel = clientGitHubDuTableau({ depot: DEPOT, bin: gh.bin, limite, projet: "alpha", maintenant: () => instant });
  const client: ClientDuTableau = {
    ...reel,
    async ecrireCorps(numero, corps) {
      await reel.ecrireCorps(numero, corps);
      corpsDuDepot = corps;
      dicter();
    },
  };
  const exemple = etatDExemple(t);
  let bilans: string[] = [];
  const lire = (maintenant: Date): Tableau => ({ ...tableauDeLaCuisine(exemple, maintenant), bilans: [...tableauDeLaCuisine(exemple, maintenant).bilans, ...bilans] });
  // Le dépôt part du tableau tel qu'il se rend maintenant : le premier rafraîchissement ne change rien.
  corpsDuDepot = rendreLeTableau(lire(LU_LE), LU_LE);
  dicter();
  const publication = publierLeTableau({ client, depot: DEPOT, lire, dire: () => {}, avertir: () => {} });

  const N = 12;
  const M = 3;
  const changements = new Set([2, 5, 9]);
  assert.equal(changements.size, M);
  for (let i = 0; i < N; i++) {
    instant = LU_LE.getTime() + i * 5 * MINUTE;
    if (changements.has(i)) bilans = [...bilans, `bilan ${i}`];
    await publication.rafraichir(new Date(instant));
  }
  // Un autre projet, d'une autre sorte d'appel, ne change pas le coût du tableau.
  limite.prendre("cuisine", undefined, { projet: "beta", lecture: "issues" });

  const faits = gh.appels().length;
  // Une première lecture (l'issue + l'épinglage), puis une par rafraîchissement, et une écriture par changement.
  assert.ok(faits >= N + M, `${faits} appels`);
  const appels = appelsDeLaStation(station, instant);
  assert.ok(appels);
  assert.equal(coutDuTableau(appels), faits);
  assert.equal(appels.total, faits + 1);

  const lignes = decrireEtat(exemple, new Date(instant), undefined, null, appels);
  assert.ok(ligneDuTableau(lignes)?.endsWith(`${faits} calls per hour, all projects`), lignes.join("\n"));
  // Dans l'unité du budget : la ligne « gh calls » dit les mêmes appels, et le tableau en est une part.
  assert.ok(lignes.some((l) => l.includes(`${faits + 1} calls in the last hour`)));

  // L'heure passée, le tableau ne coûte plus rien — et la ligne reste, à zéro.
  instant += FENETRE_MS + 1;
  const plus = appelsDeLaStation(station, instant);
  assert.ok(plus);
  assert.equal(coutDuTableau(plus), 0);
});

test("sans activité du tableau, la ligne reste et dit zéro tant que le compteur existe ; sans compteur, `status` n'a pas de ligne d'appels du tout", (t) => {
  const etat = etatDExemple(t);
  assert.equal(ligneDuTableau(decrireEtat(etat, LU_LE)), undefined);
  const limite = limiteDeLaStation(repertoireTemporaire(t), { maintenant: () => LU_LE.getTime() });
  limite.prendre("cuisine", undefined, { projet: "alpha", lecture: "issues" });
  const avec = decrireEtat(etat, LU_LE, undefined, null, limite.repartition());
  aArreter(t, () => limite.fermer());
  assert.ok(ligneDuTableau(avec)?.endsWith("0 calls per hour, all projects"));
});
