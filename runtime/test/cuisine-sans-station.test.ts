// La cuisine au repos parce que le reste du rail attend une capacité qu'aucune station ne fournit (#1751) : rien de pris
// ni en pass, aucun ticket en attente qui puisse partir, des tickets mis de côté `no-station` que le manager allumé
// reprend avant le chef — le bloc `awaiting` de `status` disait « nothing awaits the chef », sans plus. Il le dit
// toujours, et une ligne sous sa tête nomme ce qui manque, les tickets qui le demandent, ceux qui attendent derrière eux,
// et le geste. Le tableau de la cuisine la porte dans ses `bilans`, d'où l'app refait le bloc. Ce n'est pas une
// décision : la file ne change pas. Bâti d'un vrai journal et d'un vrai rail, lu par `lireEtat` et `decrireEtat`.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { decrireEtat, faits, lireEtat } from "../src/etat.ts";
import { ouvrirJournal } from "../src/journal.ts";
import { ouvrirRail } from "../src/rail.ts";
import { tableauDeLaCuisine } from "../src/tableau/rendu/donnees.ts";
import { aArreter, horloge, JOUR_HORLOGE, repertoireTemporaire } from "./outils.ts";

const MAINTENANT = new Date(`${JOUR_HORLOGE}T11:00:00.000Z`);

// Un projet dont le manager suit l'interrupteur, allumé ou non ; ses tickets arrivent avec leur fiche.
function cuisine(t: TestContext, { manager = true }: { manager?: boolean } = {}) {
  const journal = ouvrirJournal(repertoireTemporaire(t), { maintenant: horloge() });
  aArreter(t, () => journal.fermer());
  journal.ajouter({ project: "brigade", ticket: null, author: "runtime", type: manager ? "project.switched-on" : "project.switched-off", payload: { cause: "default" } });
  const rail = ouvrirRail(journal, { projet: "brigade", dureeBailMs: 600_000, maintenant: () => MAINTENANT });
  const arriver = (ticket: number, { waitsFor = [], requires = [] }: { waitsFor?: number[]; requires?: string[] } = {}) =>
    journal.ajouter({
      project: "brigade",
      ticket,
      author: "github",
      type: "ticket.arrived",
      payload: {
        title: `Ticket ${ticket}`,
        priority: null,
        createdAt: `2026-10-01T00:00:${ticket}Z`,
        url: `https://exemple.test/${ticket}`,
        card: { waitsFor, zone: [`zone/${ticket}/`], problems: [], ...(requires.length === 0 ? {} : { requires }) },
      },
    });
  // Le bloc `awaiting` de `status`, de sa tête à son bord ; et le tableau du même état.
  const lire = () => {
    const etat = lireEtat(journal, MAINTENANT);
    const lignes = decrireEtat(etat, MAINTENANT);
    const debut = lignes.findIndex((ligne) => ligne.startsWith("awaiting "));
    return { etat, bloc: lignes.slice(debut, lignes.indexOf("end awaiting") + 1), tableau: tableauDeLaCuisine(etat, MAINTENANT) };
  };
  return { journal, rail, arriver, lire };
}

// Le cas du chef : #12 et #13 mis de côté faute de station, #15 qui attend #12, #16 qui attend #15 et #13 — et #17,
// qui attend #20, un ticket qui n'est pas sur le rail : rien ne le lie à une capacité.
function railDuChef(t: TestContext, options?: { manager?: boolean }) {
  const c = cuisine(t, options);
  c.arriver(12, { requires: ["macos"] });
  c.arriver(13, { requires: ["enregistrement-ecran"] });
  c.arriver(15, { waitsFor: [12] });
  c.arriver(16, { waitsFor: [15, 13] });
  c.arriver(17, { waitsFor: [20] });
  c.rail.quatreVingtSix(12, { motif: "no-station: macos" });
  c.rail.quatreVingtSix(13, { motif: "no-station: enregistrement-ecran" });
  return c;
}

const LIGNE_DU_CHEF =
  "kitchen idle — the rest of the rail needs a human: no station provides `macos` (#12); `enregistrement-ecran` (#13) — waiting behind them: #15, #16 — to unblock: attach a station that provides them, or lower those tickets — remove them from the `requiert` line of their cards — or close them";

test("rien ne peut plus cuire, le reste du rail mis de côté faute de station : sous « nothing awaits the chef », une ligne nomme ce qui manque, les tickets retenus et le geste — sans compter pour une décision", (t) => {
  const { lire } = railDuChef(t);
  const { etat, bloc, tableau } = lire();

  assert.deepEqual(bloc, ["awaiting   nothing awaits the chef", `  ${LIGNE_DU_CHEF}`, "end awaiting"]);
  // La file ne change pas : aucune décision, ni dans l'état, ni dans les faits, ni sur le tableau.
  assert.deepEqual(etat.attend, []);
  assert.equal(faits(etat, MAINTENANT).compteurs.attend, 0);
  assert.deepEqual(tableau.file, []);
  // Le tableau porte la même ligne, d'où l'app refait le bloc.
  assert.deepEqual(tableau.bilans, [LIGNE_DU_CHEF]);
});

test("un ticket qui en attend un autre sans lien avec une capacité manquante n'est pas nommé parmi les retenus", (t) => {
  const { lire } = railDuChef(t);
  const [, ligne] = lire().bloc;

  assert.match(ligne ?? "", /waiting behind them: #15, #16 —/);
  assert.doesNotMatch(ligne ?? "", /#17|#20/);
});

test("un seul ticket, à qui manque une réunion de capacités : la ligne la dit ensemble, et le geste au singulier du ticket", (t) => {
  const { arriver, rail, lire } = cuisine(t);
  arriver(12, { requires: ["macos", "enregistrement-ecran"] });
  rail.quatreVingtSix(12, { motif: "no-station: macos + enregistrement-ecran" });

  assert.deepEqual(lire().bloc, [
    "awaiting   nothing awaits the chef",
    "  kitchen idle — the rest of the rail needs a human: no station provides `macos` + `enregistrement-ecran` together (#12) — to unblock: attach a station that provides them, or lower this ticket — remove them from the `requiert` line of its card — or close it",
    "end awaiting",
  ]);
});

test("dès qu'un ticket peut encore cuire — en attente sans rien qui le retienne, pris, en pass — ni `status` ni le tableau ne disent la ligne", (t) => {
  const { arriver, rail, lire } = railDuChef(t);
  const sansLaLigne = (quand: string) => {
    const { bloc, tableau } = lire();
    assert.deepEqual(bloc, ["awaiting   nothing awaits the chef", "end awaiting"], quand);
    assert.deepEqual(tableau.bilans, [], quand);
  };

  arriver(18);
  sansLaLigne("#18 en attente, libre");
  assert.equal(rail.prendre("box/claude")?.ticket, 18);
  sansLaLigne("#18 pris");
  rail.envoyerEnPass(18, "box/claude");
  sansLaLigne("#18 en pass");
  // Servi, il ne cuit plus : la cuisine est de nouveau au repos.
  rail.servir(18);
  assert.deepEqual(lire().tableau.bilans, [LIGNE_DU_CHEF]);
});

test("un 86 qui revient seul à son heure peut encore cuire : pas de ligne", (t) => {
  const { arriver, rail, lire } = railDuChef(t);
  arriver(18);
  rail.quatreVingtSix(18, { motif: "quota", retour: new Date(`${JOUR_HORLOGE}T15:00:00.000Z`) });

  assert.deepEqual(lire().bloc, ["awaiting   nothing awaits the chef", "end awaiting"]);
});

test("le manager éteint, le ticket sans station est lui-même une décision du chef : la file le dit avec son geste, et la ligne ne le redit pas", (t) => {
  const { lire } = railDuChef(t, { manager: false });
  const { bloc, tableau } = lire();

  assert.equal(bloc[0], "awaiting   2 decisions await the chef — the oldest for 59 min");
  assert.deepEqual(
    bloc.slice(1, -1).map((ligne) => ligne.slice(0, 6)),
    ["  #12 ", "  #13 "],
  );
  assert.deepEqual(tableau.bilans, []);
});
