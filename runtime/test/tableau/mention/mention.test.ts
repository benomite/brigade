// La mention du chef sous le tableau de la cuisine : une décision qui entre dans
// sa file est mentionnée une fois — pas à chaque rafraîchissement, pas après un
// redémarrage —, et un rafraîchissement du corps ne mentionne jamais. GitHub est
// ici un faux client, le journal un vrai, l'horloge une fausse.
import assert from "node:assert/strict";
import { describe, test, type TestContext } from "node:test";
import { ouvrirJournal } from "../../../src/journal.ts";
import { demarrer } from "../../../src/runtime.ts";
import { lireEtat } from "../../../src/etat.ts";
import type { ClientDesGestes } from "../../../src/tableau/gestes/client.ts";
import { cleDeLaDecision, direLaMention, mentionsDuTableau } from "../../../src/tableau/mention/mention.ts";
import type { ClientDuTableau, IssueDuTableau } from "../../../src/tableau/publication/client.ts";
import { brancherLeTableau } from "../../../src/tableau/publication/publier.ts";
import type { LigneDeLaFile } from "../../../src/tableau/rendu/bloc.ts";
import { tableauDeLaCuisine } from "../../../src/tableau/rendu/donnees.ts";
import { montre } from "../../aides/cuisine.ts";
import { aArreter, DEPOT, jusqua, repertoireTemporaire } from "../../outils.ts";

const PROJET = "brigade";
const TABLEAU = 1;
const CHEF = "acme";

const ligne = (ticket: number, quoi = "merge", depuis = "2026-10-08T10:00:00.000Z"): LigneDeLaFile => ({
  nom: `#${ticket}`,
  ticket,
  titre: `Ticket ${ticket}`,
  quoi,
  depuis,
  ligne: `green, waiting for you — to do: \`brigade ${PROJET} rail merge ${ticket}\``,
  decision: null,
  carte: null,
});

function fauxClient() {
  const postes: Array<{ numero: number; corps: string }> = [];
  const pannes = { poste: false };
  const client: Pick<ClientDesGestes, "repondre" | "compteDuChef"> = {
    async repondre(numero, corps) {
      if (pannes.poste) throw new Error("HTTP 502");
      postes.push({ numero, corps });
    },
    compteDuChef: async () => CHEF,
  };
  return { client, postes, pannes };
}

function atelier(t: TestContext, repertoire = repertoireTemporaire(t)) {
  const heure = montre();
  const journal = ouvrirJournal(repertoire, { maintenant: heure.maintenant });
  const etat = { ferme: false };
  aArreter(t, () => (etat.ferme ? undefined : journal.fermer()));
  const faux = fauxClient();
  const avertis: string[] = [];
  const mentions = mentionsDuTableau({ client: faux.client, journal, projet: PROJET, avertir: (texte) => avertis.push(texte) });
  return { repertoire, heure, etat, journal, mentions, avertis, ...faux };
}

describe("la mention du chef", () => {
  test("une décision nouvelle dans la file donne un commentaire, qui mentionne le chef, nomme la décision et dit son geste", async (t) => {
    const a = atelier(t);
    assert.equal(await a.mentions.traiter(TABLEAU, [ligne(12)]), 1);
    assert.equal(a.postes.length, 1);
    const [{ numero, corps } = { numero: 0, corps: "" }] = a.postes;
    assert.equal(numero, TABLEAU);
    assert.ok(corps.startsWith(`@${CHEF} `), corps);
    assert.match(corps, /\*\*#12\*\* — Ticket 12/);
    assert.match(corps, /`brigade brigade rail merge 12`|rail merge 12/);
    assert.match(corps, /`\/brigade merge #12`/);
    assert.ok(!corps.startsWith("/brigade"), "la mention n'est pas un geste");
  });

  test("dix rafraîchissements, la décision toujours en attente, ne donnent aucun autre commentaire (fausse horloge)", async (t) => {
    const a = atelier(t);
    for (let rang = 0; rang < 10; rang += 1) {
      a.heure.avancer(60_000);
      await a.mentions.traiter(TABLEAU, [ligne(12)]);
    }
    assert.equal(a.postes.length, 1);
  });

  test("après un redémarrage, l'état relu du disque, la même décision n'est pas mentionnée de nouveau", async (t) => {
    const a = atelier(t);
    await a.mentions.traiter(TABLEAU, [ligne(12)]);
    a.journal.fermer();
    a.etat.ferme = true;
    const journal = ouvrirJournal(a.repertoire, { maintenant: a.heure.maintenant });
    aArreter(t, () => journal.fermer());
    const apres = fauxClient();
    const relancee = mentionsDuTableau({ client: apres.client, journal, projet: PROJET });
    assert.equal(await relancee.traiter(TABLEAU, [ligne(12)]), 0);
    assert.deepEqual(apres.postes, []);
  });

  test("une décision résolue qui attend de nouveau, pour une autre raison, est une nouvelle décision", async (t) => {
    const a = atelier(t);
    await a.mentions.traiter(TABLEAU, [ligne(12)]);
    await a.mentions.traiter(TABLEAU, []);
    await a.mentions.traiter(TABLEAU, [ligne(12, "remontee", "2026-10-08T11:00:00.000Z")]);
    await a.mentions.traiter(TABLEAU, [ligne(12, "remontee", "2026-10-08T11:00:00.000Z"), ligne(13)]);
    assert.equal(a.postes.length, 3);
    assert.notEqual(cleDeLaDecision(ligne(12)), cleDeLaDecision(ligne(12, "remontee")));
  });

  test("un commentaire refusé par GitHub n'est pas compté : il repart au passage suivant, une fois", async (t) => {
    const a = atelier(t);
    a.pannes.poste = true;
    assert.equal(await a.mentions.traiter(TABLEAU, [ligne(12)]), 0);
    assert.equal(a.avertis.length, 1);
    a.pannes.poste = false;
    assert.equal(await a.mentions.traiter(TABLEAU, [ligne(12)]), 1);
    assert.equal(await a.mentions.traiter(TABLEAU, [ligne(12)]), 0);
    assert.equal(a.postes.length, 1);
  });

  test("le texte d'une décision n'ouvre pas de mention d'un autre compte", () => {
    const corps = direLaMention(CHEF, { ...ligne(12), titre: "ping @someone", ligne: "ask @other" });
    assert.ok(!/@(?!⁠)(?!acme)\w/.test(corps), corps);
  });
});

describe("branchée au tableau publié", () => {
  test("au tick, la décision est mentionnée une fois ; réécrire le corps du tableau ne mentionne pas", async (t) => {
    t.mock.timers.enable({ apis: ["setInterval"] });
    let instant = Date.parse("2026-10-08T10:00:00.000Z");
    const maintenant = () => new Date(instant);
    const runtime = demarrer({ repertoireEtat: repertoireTemporaire(t), projet: PROJET, maintenant });
    aArreter(t, () => runtime.arreter("SIGTERM"));
    let corps = "";
    const ecrits: string[] = [];
    const issue = (): IssueDuTableau => ({ numero: TABLEAU, ouverte: true, titre: "Kitchen board", corps, labels: ["kitchen-board", "hors-cuisine"] });
    const client: ClientDuTableau = {
      auLabel: async () => (corps === "" ? [] : [issue()]),
      issue: async () => (corps === "" ? null : issue()),
      async creer({ corps: premier }) {
        corps = premier;
        ecrits.push("creer");
        return TABLEAU;
      },
      async ecrireCorps(_numero, nouveau) {
        corps = nouveau;
        ecrits.push("ecrire");
      },
      rouvrir: async () => {},
      epingler: async () => false,
    };
    const faux = fauxClient();
    let file: LigneDeLaFile[] = [];
    const lire = (heure: Date) => ({ ...tableauDeLaCuisine(lireEtat(runtime.journal, heure), heure), file });
    const tick = async () => {
      const avant = ecrits.length;
      instant += 60_000;
      t.mock.timers.tick(60_000);
      await jusqua(() => ecrits.length > avant || true);
    };
    brancherLeTableau(runtime, { client, depot: DEPOT, maintenant, lire, dire: () => {}, avertir: () => {}, mentions: mentionsDuTableau({ client: faux.client, journal: runtime.journal, projet: PROJET }) });
    await jusqua(() => ecrits.length === 1);
    assert.deepEqual(faux.postes, [], "un tableau vide ne mentionne personne");

    file = [ligne(12)];
    await tick();
    await jusqua(() => faux.postes.length === 1);
    // Dix ticks de plus : le corps se réécrit (l'heure de lecture change la file), aucun commentaire ne part.
    for (let rang = 0; rang < 10; rang += 1) await tick();
    await jusqua(() => ecrits.length >= 2);
    assert.equal(faux.postes.length, 1);
  });
});
