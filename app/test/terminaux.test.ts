// Le registre des terminaux, contre de faux pty : ce qu'il lance, ce qu'il
// garde, ce qu'il dit. Le vrai pty est éprouvé dans pty.test.ts.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ouvrirTerminaux, type Lancement, type Terminal } from "../src/terminaux.ts";

const BRIGADE = { nom: "brigade", dossier: "/projets/brigade" };
const PARADE = { nom: "parade", dossier: "/projets/parade" };

type FauxPty = Lancement & { ecrits: string[]; tailles: [number, number][]; tue: boolean };

function registre() {
  const lances: FauxPty[] = [];
  const sorties: [number, string][] = [];
  const etats: Terminal[] = [];
  const terminaux = ouvrirTerminaux({
    claude: "claude",
    shell: "/bin/zsh",
    ouvrirPty(lancement) {
      const faux: FauxPty = { ...lancement, ecrits: [], tailles: [], tue: false };
      lances.push(faux);
      return {
        ecrire: (donnees) => void faux.ecrits.push(donnees),
        redimensionner: (colonnes, lignes) => void faux.tailles.push([colonnes, lignes]),
        tuer: () => void (faux.tue = true),
      };
    },
    surSortie: (id, donnees) => void sorties.push([id, donnees]),
    surEtat: (terminal) => void etats.push(terminal),
  });
  // Le pty lancé au rang donné : le test échoue net s'il n'existe pas.
  const lance = (rang: number): FauxPty => {
    const faux = lances.at(rang);
    assert.ok(faux, `aucun pty lancé au rang ${rang}`);
    return faux;
  };
  const commandes = () => lances.map(({ commande, args, dossier }) => [commande, ...args, dossier].join(" "));
  return { terminaux, lance, commandes, sorties, etats };
}

const un = <T>(liste: T[]): T => {
  assert.equal(liste.length, 1);
  return liste[0] as T;
};

describe("le registre des terminaux", () => {
  test("ouvrir un espace y lance le second, dans le dossier du projet, en reprenant le fil — et il le dit", () => {
    const { terminaux, commandes } = registre();

    const second = un(terminaux.espace(BRIGADE));

    assert.deepEqual(commandes(), ["claude --continue /projets/brigade"]);
    assert.deepEqual(second, {
      id: second.id,
      projet: "brigade",
      genre: "second",
      titre: "Second",
      note: "fil repris : `claude --continue`, la dernière conversation de ce dossier",
      arrete: false,
    });
  });

  test("un `claude --continue` qui sort en erreur n'a rien repris : une session neuve part, et la note le dit au lieu de se taire", () => {
    const { terminaux, lance, commandes, etats } = registre();
    const second = un(terminaux.espace(BRIGADE));

    lance(0).surFin(1);

    assert.deepEqual(commandes(), ["claude --continue /projets/brigade", "claude /projets/brigade"]);
    const dit = un(etats);
    assert.deepEqual([dit.id, dit.arrete, dit.note], [second.id, false, "session neuve : `claude --continue` est sorti en code 1, le fil n'a pas été repris"]);
    // L'espace rouvert dit la même chose.
    assert.deepEqual(terminaux.espace(BRIGADE), [dit]);
  });

  test("une session neuve qui s'arrête n'est pas relancée d'office : le second est dit arrêté, et une touche le relance en reprenant le fil", () => {
    const { terminaux, lance, commandes, etats } = registre();
    const second = un(terminaux.espace(BRIGADE));
    lance(0).surFin(1);

    lance(1).surFin(1);

    assert.equal(commandes().length, 2);
    assert.deepEqual([etats.at(-1)?.arrete, etats.at(-1)?.note], [true, "le second s'est arrêté (code 1) — une touche le relance"]);

    terminaux.ecrire(second.id, "\r");

    assert.deepEqual(commandes().at(-1), "claude --continue /projets/brigade");
    // La touche a relancé : elle n'est pas tapée dans la session qui revient.
    assert.deepEqual(lance(2).ecrits, []);
    assert.deepEqual([etats.at(-1)?.arrete, etats.at(-1)?.note], [false, "fil repris : `claude --continue`, la dernière conversation de ce dossier"]);
  });

  test("un fil repris que le chef quitte est dit arrêté, sans session neuve", () => {
    const { terminaux, lance, commandes, etats } = registre();
    terminaux.espace(BRIGADE);

    lance(0).surFin(0);

    assert.equal(commandes().length, 1);
    assert.deepEqual([un(etats).arrete, un(etats).note], [true, "le second s'est arrêté (code 0) — une touche le relance"]);
  });

  test("d'autres shells s'ouvrent dans l'espace, dans le dossier du projet, et le second est retrouvé tel qu'il était", () => {
    const { terminaux, lance, commandes } = registre();
    const second = un(terminaux.espace(BRIGADE));

    const shell = terminaux.shell(BRIGADE);
    terminaux.shell(BRIGADE);

    assert.deepEqual(commandes().slice(1), ["/bin/zsh -l /projets/brigade", "/bin/zsh -l /projets/brigade"]);
    assert.deepEqual([shell.genre, shell.titre, shell.note], ["shell", "shell 1", "shell sur ce Mac, dans /projets/brigade"]);
    // Rouvrir l'espace ne relance rien : le même second, les mêmes shells.
    assert.deepEqual(terminaux.espace(BRIGADE).map(({ id, titre }) => [id, titre]), [[second.id, "Second"], [shell.id, "shell 1"], [shell.id + 1, "shell 2"]]);
    assert.equal(commandes().length, 3);
    assert.equal(lance(0).tue, false);
  });

  test("chaque projet a son second : ce qui est tapé, et ce qui sort, ne se croise pas", () => {
    const { terminaux, lance, commandes, sorties } = registre();
    const brigade = un(terminaux.espace(BRIGADE));
    const parade = un(terminaux.espace(PARADE));

    terminaux.ecrire(brigade.id, "!ls\r");
    lance(1).surSortie("parade parle");
    lance(0).surSortie("brigade répond");

    assert.deepEqual(commandes(), ["claude --continue /projets/brigade", "claude --continue /projets/parade"]);
    assert.deepEqual([lance(0).ecrits, lance(1).ecrits], [["!ls\r"], []]);
    assert.deepEqual(sorties, [[parade.id, "parade parle"], [brigade.id, "brigade répond"]]);
  });

  test("un shell qui sort quitte l'espace ; le second et les autres projets n'en savent rien", () => {
    const { terminaux, lance, etats } = registre();
    const second = un(terminaux.espace(BRIGADE));
    const shell = terminaux.shell(BRIGADE);
    terminaux.espace(PARADE);

    lance(1).surFin(0);

    assert.deepEqual([un(etats).id, un(etats).arrete], [shell.id, true]);
    assert.deepEqual(terminaux.espace(BRIGADE).map(({ id }) => id), [second.id]);
    assert.deepEqual([lance(0).tue, lance(2).tue], [false, false]);
    // Écrire dans un shell disparu ne relance rien.
    terminaux.ecrire(shell.id, "ls\r");
    assert.deepEqual(lance(1).ecrits, []);
  });

  test("la taille de la vue va au pty, et un second relancé repart à cette taille", () => {
    const { terminaux, lance } = registre();
    const second = un(terminaux.espace(BRIGADE));
    assert.deepEqual([lance(0).colonnes, lance(0).lignes], [80, 24]);

    terminaux.redimensionner(second.id, 132, 43);
    lance(0).surFin(0);
    terminaux.redimensionner(second.id, 100, 30);
    terminaux.ecrire(second.id, " ");

    assert.deepEqual(lance(0).tailles, [[132, 43]]);
    assert.deepEqual([lance(1).colonnes, lance(1).lignes], [100, 30]);
  });

  test("fermer tue tous les pty, et leur mort ne relance ni ne dit plus rien", () => {
    const { terminaux, lance, commandes, etats } = registre();
    terminaux.espace(BRIGADE);
    terminaux.shell(BRIGADE);
    terminaux.espace(PARADE);

    terminaux.fermer();
    for (const rang of [0, 1, 2]) lance(rang).surFin(129);

    assert.deepEqual([lance(0).tue, lance(1).tue, lance(2).tue], [true, true, true]);
    assert.equal(commandes().length, 3);
    assert.deepEqual(etats, []);
  });

  test("un projet qui quitte la liste perd ses terminaux, et eux seuls : tués, ils ne disent plus rien et ne relancent rien", () => {
    const { terminaux, lance, commandes, etats } = registre();
    const second = un(terminaux.espace(BRIGADE));
    const shell = terminaux.shell(BRIGADE);
    const autre = un(terminaux.espace(PARADE));

    assert.deepEqual(terminaux.quitter("brigade"), [second.id, shell.id]);

    assert.deepEqual([lance(0).tue, lance(1).tue, lance(2).tue], [true, true, false]);
    lance(0).surFin(1);
    lance(1).surFin(0);
    assert.deepEqual(etats, []);
    assert.equal(commandes().length, 3);
    terminaux.ecrire(second.id, "x");
    assert.equal(commandes().length, 3);
    assert.deepEqual(terminaux.espace(PARADE), [autre]);
  });

  test("un projet revenu dans la liste retrouve un second neuf, au premier clic", () => {
    const { terminaux, commandes } = registre();
    const avant = un(terminaux.espace(BRIGADE));
    terminaux.quitter("brigade");

    const apres = un(terminaux.espace({ nom: "brigade", dossier: "/ailleurs" }));

    assert.notEqual(apres.id, avant.id);
    assert.equal(commandes().at(-1), "claude --continue /ailleurs");
  });
});

