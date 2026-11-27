// Le registre des terminaux, contre de faux pty : ce qu'il lance, ce qu'il
// garde, ce qu'il dit. Le vrai pty est éprouvé dans pty.test.ts.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { DIT, reglages } from "../src/saisie.ts";
import { ouvrirTerminaux, type Lancement, type Terminal } from "../src/terminaux.ts";
import { ICI } from "../src/plateforme.ts";
import { ROLE_DU_SECOND } from "../src/second/lancement.ts";

const FIL_REPRIS = "thread resumed: `claude --continue`, the latest conversation in this folder — whichever it is, not necessarily a second's; it runs with the second's role in its system prompt";
// Ce que `claude` reçoit pour être le second (second/lancement.ts) : le rôle livré avec l'app, et des réglages vides
// quand l'app ne suit pas ses tours.
const ROLE = ["--append-system-prompt-file", ROLE_DU_SECOND, "--settings", "{}"];
const LE_ROLE = ROLE.join(" ");
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

    assert.deepEqual(commandes(), [`claude --continue ${LE_ROLE} /projets/brigade`]);
    assert.deepEqual(second, {
      id: second.id,
      projet: "brigade",
      genre: "second",
      titre: "Second",
      note: FIL_REPRIS,
      arrete: false,
    });
  });

  test("le second est lancé avec le rôle, pas en `claude` nu : le rôle suit `--continue`, et une session neuve le porte aussi", () => {
    const { terminaux, lance, commandes } = registre();
    terminaux.espace(BRIGADE);

    assert.deepEqual(lance(0).args, ["--continue", ...ROLE]);
    lance(0).surFin(1);
    assert.deepEqual(lance(1).args, ROLE);
    assert.deepEqual(commandes().length, 2);
  });

  test("un `claude --continue` qui sort en erreur n'a rien repris : une session neuve part, et la note le dit au lieu de se taire", () => {
    const { terminaux, lance, commandes, etats } = registre();
    const second = un(terminaux.espace(BRIGADE));

    lance(0).surFin(1);

    assert.deepEqual(commandes(), [`claude --continue ${LE_ROLE} /projets/brigade`, `claude ${LE_ROLE} /projets/brigade`]);
    const dit = un(etats);
    assert.deepEqual([dit.id, dit.arrete, dit.note], [second.id, false, "new session: `claude --continue` exited with code 1, the thread was not resumed — `claude`, with the second's role in its system prompt"]);
    // L'espace rouvert dit la même chose.
    assert.deepEqual(terminaux.espace(BRIGADE), [dit]);
  });

  test("une session neuve qui s'arrête n'est pas relancée d'office : le second est dit arrêté, et une touche le relance en reprenant le fil", () => {
    const { terminaux, lance, commandes, etats } = registre();
    const second = un(terminaux.espace(BRIGADE));
    lance(0).surFin(1);

    lance(1).surFin(1);

    assert.equal(commandes().length, 2);
    assert.deepEqual([etats.at(-1)?.arrete, etats.at(-1)?.note], [true, "the second stopped (code 1) — a keypress restarts it"]);

    terminaux.ecrire(second.id, "\r");

    assert.deepEqual(commandes().at(-1), `claude --continue ${LE_ROLE} /projets/brigade`);
    // La touche a relancé : elle n'est pas tapée dans la session qui revient.
    assert.deepEqual(lance(2).ecrits, []);
    assert.deepEqual([etats.at(-1)?.arrete, etats.at(-1)?.note], [false, FIL_REPRIS]);
  });

  test("une commande inscrite dans le second y est écrite telle quelle, sans rien qui l'envoie — et la note ne promet que ce qui est tenu", () => {
    const { terminaux, lance, etats } = registre();
    const second = un(terminaux.espace(BRIGADE));
    terminaux.shell(BRIGADE);

    const dit = terminaux.inscrire(BRIGADE, "!station brigade garde-fous stop");

    // Dans le second, pas dans le shell ouvert à côté — et ni `\r` ni `\n` : c'est le chef qui fait Entrée.
    assert.deepEqual([lance(0).ecrits, lance(1).ecrits], [["!station brigade garde-fous stop"], []]);
    assert.deepEqual([dit.id, dit.arrete], [second.id, false]);
    assert.equal(dit.note, "written into the second, without Enter: `!station brigade garde-fous stop` — at `claude`'s prompt, it waits for yours, after your typing if you were typing. On any other screen (a choice to make, vim mode), these characters are keystrokes: look at the second before confirming");
    // L'espace rouvert dit la même chose ; rien n'est annoncé à part, la vue a reçu la réponse.
    assert.deepEqual(terminaux.espace(BRIGADE)[0], dit);
    assert.deepEqual(etats, []);
  });

  test("le second arrêté est lancé d'abord, et la commande n'y est pas écrite à l'aveugle : la note dit de recliquer", () => {
    const { terminaux, lance, commandes } = registre();
    const second = un(terminaux.espace(BRIGADE));
    lance(0).surFin(0);

    const dit = terminaux.inscrire(BRIGADE, "!station brigade garde-fous stop");

    assert.deepEqual(commandes(), [`claude --continue ${LE_ROLE} /projets/brigade`, `claude --continue ${LE_ROLE} /projets/brigade`]);
    assert.deepEqual(lance(1).ecrits, []);
    assert.deepEqual([dit.id, dit.arrete], [second.id, false]);
    assert.equal(dit.note, "the second was not running: launched (`claude --continue`, with the second's role in its system prompt) — the command is not written into a second that is starting, click again when it is ready");

    // Le second clic, lui, écrit.
    terminaux.inscrire(BRIGADE, "!station brigade garde-fous stop");
    assert.deepEqual(lance(1).ecrits, ["!station brigade garde-fous stop"]);
  });

  test("un espace jamais ouvert n'a pas de second : le bouton l'ouvre d'abord, de la même façon", () => {
    const { terminaux, lance, commandes } = registre();

    const dit = terminaux.inscrire(BRIGADE, "!station brigade garde-fous stop");

    assert.deepEqual(commandes(), [`claude --continue ${LE_ROLE} /projets/brigade`]);
    assert.deepEqual(lance(0).ecrits, []);
    assert.match(dit.note, /^the second was not running: launched /);
    assert.deepEqual(terminaux.espace(BRIGADE), [dit]);
  });

  test("une commande qui porterait de quoi partir seule — un retour à la ligne dans un nom, un hôte — n'est pas écrite, et la note le dit", () => {
    const { terminaux, lance } = registre();
    terminaux.espace(BRIGADE);

    for (const piege of ["!station\rbrigade status", "!station 'bo\nx' brigade status", "!station\x03 brigade"]) {
      const dit = terminaux.inscrire(BRIGADE, piege);
      assert.equal(dit.note, "nothing is written: the command carries a control character, and a line break would have sent it — check “nom” of this project in the projects file");
    }
    assert.deepEqual(lance(0).ecrits, []);
  });

  test("un fil repris que le chef quitte est dit arrêté, sans session neuve", () => {
    const { terminaux, lance, commandes, etats } = registre();
    terminaux.espace(BRIGADE);

    lance(0).surFin(0);

    assert.equal(commandes().length, 1);
    assert.deepEqual([un(etats).arrete, un(etats).note], [true, "the second stopped (code 0) — a keypress restarts it"]);
  });

  test("d'autres shells s'ouvrent dans l'espace, dans le dossier du projet, et le second est retrouvé tel qu'il était", () => {
    const { terminaux, lance, commandes } = registre();
    const second = un(terminaux.espace(BRIGADE));

    const shell = terminaux.shell(BRIGADE);
    terminaux.shell(BRIGADE);

    assert.deepEqual(commandes().slice(1), ["/bin/zsh -l /projets/brigade", "/bin/zsh -l /projets/brigade"]);
    assert.deepEqual([shell.genre, shell.titre, shell.note], ["shell", "shell 1", `shell on ${ICI}, in /projets/brigade`]);
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

    assert.deepEqual(commandes(), [`claude --continue ${LE_ROLE} /projets/brigade`, `claude --continue ${LE_ROLE} /projets/parade`]);
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
    assert.equal(commandes().at(-1), `claude --continue ${LE_ROLE} /ailleurs`);
  });
});


describe("ce que la mise en service demande au registre", () => {
  test("une session s'ouvre dans le second sur sa commande — `claude /brigade:init`, une conversation neuve dans le dossier du projet —, et la note le dit", () => {
    const { terminaux, commandes, lance } = registre();

    const second = terminaux.session(BRIGADE, "/brigade:init");

    assert.deepEqual(commandes(), ["claude /brigade:init /projets/brigade"]);
    assert.deepEqual(lance(0).ecrits, []);
    assert.deepEqual([second.genre, second.titre, second.arrete], ["second", "Claude", false]);
    assert.equal(second.note, "session launched on `/brigade:init`: `claude /brigade:init`, a new conversation in this folder — it is not the second: it runs without the second's role");
    // C'est le second de l'espace : l'ouvrir le retrouve, sans rien relancer.
    assert.deepEqual(terminaux.espace(BRIGADE), [second]);
    assert.equal(commandes().length, 1);
  });

  test("la session quittée est dite arrêtée, sans rien relancer d'office ; une touche reprend son fil, comme pour tout second", () => {
    const { terminaux, lance, commandes, etats } = registre();
    const second = terminaux.session(BRIGADE, "/brigade:init");

    lance(0).surFin(1);

    assert.equal(commandes().length, 1);
    assert.deepEqual([un(etats).arrete, un(etats).note], [true, "the second stopped (code 1) — a keypress restarts it"]);
    terminaux.ecrire(second.id, "x");
    assert.equal(commandes().at(-1), `claude --continue ${LE_ROLE} /projets/brigade`);
    // Le rôle est de nouveau établi : l'onglet peut reprendre son nom.
    assert.equal(terminaux.espace(BRIGADE)[0]?.titre, "Second");
  });

  test("un second qui tourne déjà n'est pas remplacé : la commande y est écrite, sans rien qui l'envoie", () => {
    const { terminaux, lance, commandes } = registre();
    const second = un(terminaux.espace(BRIGADE));

    const dit = terminaux.session(BRIGADE, "/brigade:init");

    assert.deepEqual(commandes(), [`claude --continue ${LE_ROLE} /projets/brigade`]);
    assert.deepEqual(lance(0).ecrits, ["/brigade:init"]);
    assert.equal(dit.id, second.id);
    assert.match(dit.note, /^written into the second, without Enter: `\/brigade:init` — /);
  });

  test("un second arrêté repart sur la session, au lieu de reprendre son fil", () => {
    const { terminaux, lance, commandes } = registre();
    const second = un(terminaux.espace(BRIGADE));
    lance(0).surFin(0);

    const dit = terminaux.session(BRIGADE, "/brigade:init");

    assert.equal(commandes().at(-1), "claude /brigade:init /projets/brigade");
    assert.deepEqual([dit.id, dit.arrete], [second.id, false]);
  });

  test("une session dont la commande porterait un caractère de contrôle n'est ni lancée ni écrite", () => {
    const { terminaux, commandes } = registre();

    const dit = terminaux.session(BRIGADE, "/brigade:init\r");

    assert.deepEqual(commandes(), []);
    assert.match(dit.note, /^nothing is written: the command carries a control character/);
  });

  test("un shell peut s'ouvrir sur une commande : elle y est écrite telle quelle, sans rien qui l'envoie — c'est le chef qui fait Entrée", () => {
    const { terminaux, lance, commandes } = registre();
    terminaux.espace(BRIGADE);

    const shell = terminaux.shell(BRIGADE, "sudo systemctl enable --now brigade@brigade.service");

    assert.equal(commandes().at(-1), "/bin/zsh -l /projets/brigade");
    // Dans ce shell, pas dans le second — et ni `\r` ni `\n`.
    assert.deepEqual([lance(0).ecrits, lance(1).ecrits], [[], ["sudo systemctl enable --now brigade@brigade.service"]]);
    assert.deepEqual([shell.genre, shell.titre], ["shell", "shell 1"]);
    assert.equal(shell.note, "written into this shell, without Enter: `sudo systemctl enable --now brigade@brigade.service` — yours is what sends it. A real terminal: what the command asks for — a password — is typed here");
  });

  test("une commande qui porterait de quoi partir seule n'est pas écrite dans le shell, et sa note le dit", () => {
    const { terminaux, lance } = registre();

    for (const piege of ["sudo\rreboot", "sudo 'bo\nx'", "sudo\x03"]) {
      const shell = terminaux.shell(BRIGADE, piege);
      assert.equal(shell.note, "nothing is written: the command carries a control character, and a line break would have sent it — check “nom” of this project in the projects file");
    }
    assert.deepEqual([lance(0).ecrits, lance(1).ecrits, lance(2).ecrits], [[], [], []]);
  });
});

// Le second tel que le vrai `claude` (2.1.296) se montre, relevé dans un pty le 2026-10-13 :
// le titre qu'il donne à son terminal au repos et au travail, et ce qu'il redessine quand une
// commande `!…` arrive dans sa saisie vide — la saisie en mode shell, avec sa légende (les
// filets raccourcis). Ses tours, eux, sont dits par ses crochets, dans un fichier : ici, un faux.
const REPOS = "\x1b]0;✳ Claude Code\x07";
const TRAVAIL = "\x1b]0;◐ Claude Code\x07";
const MODE_SHELL =
  "\x1b[?25l\x1b[H\r\x1b[36B\x1b[38;5;211m────────\r\x1b[1B!\xa0\x1b[39mstation\x1b[11Gbrigade\x1b[19Ginstallation\r\x1b[1B\x1b[38;5;211m────────\r\x1b[2C\x1b[1B! for shell mode\x1b[39m\x1b[K\x1b[40;1H\x1b[38;51H\x1b[?25h";
const INSTALLATION = "!station brigade installation";
const PAS_PARTIE = ` — the command did not go, and nothing is written: \`${INSTALLATION}\``;

// Un registre dont chaque second dit ses tours à l'app. `tours` : ce que le second du rang donné a dit.
function registreSuivi(delaiPreuveMs?: number) {
  const lances: FauxPty[] = [];
  const dits = new Map<number, string>();
  const terminaux = ouvrirTerminaux({
    claude: "claude",
    shell: "/bin/zsh",
    ouvrirPty(lancement) {
      const faux: FauxPty = { ...lancement, ecrits: [], tailles: [], tue: false };
      lances.push(faux);
      return {
        ecrire: (donnees) => void faux.ecrits.push(donnees),
        redimensionner: () => {},
        tuer: () => void (faux.tue = true),
      };
    },
    surSortie: () => {},
    surEtat: () => {},
    tours: (id) => ({ chemin: `/tmp/brigade-app-essai/second-${id}.tours`, lire: () => dits.get(id) ?? "", vider: () => void dits.set(id, "") }),
    ...(delaiPreuveMs === undefined ? {} : { delaiPreuveMs }),
  });
  const lance = (rang: number): FauxPty => {
    const faux = lances.at(rang);
    assert.ok(faux, `aucun pty lancé au rang ${rang}`);
    return faux;
  };
  return { terminaux, lance, dire: (id: number, tours: string) => void dits.set(id, (dits.get(id) ?? "") + tours), dits };
}

// Un espace ouvert sur un second libre : son premier tour est fini, il est à son invite.
function secondLibre(delaiPreuveMs?: number) {
  const suivi = registreSuivi(delaiPreuveMs);
  const second = un(suivi.terminaux.espace(BRIGADE));
  suivi.lance(0).surSortie(TRAVAIL);
  suivi.dire(second.id, "tour\nfin\n");
  suivi.lance(0).surSortie(REPOS);
  return { ...suivi, second, pty: suivi.lance(0) };
}

describe("un geste direct part vraiment dans le second, et dit quand il ne peut pas", () => {
  test("second libre : la commande est écrite, `claude` se montre en mode shell, l'app fait Entrée — et la note dit ce qui est parti, et où lire sa sortie", async () => {
    const { terminaux, second, pty } = secondLibre();

    const rendu = terminaux.envoyer(BRIGADE, INSTALLATION);

    // Écrite, sans Entrée : celle de l'app attend la preuve.
    assert.deepEqual(pty.ecrits, [INSTALLATION]);
    pty.surSortie(MODE_SHELL);
    const dit = await rendu;

    assert.deepEqual(pty.ecrits, [INSTALLATION, "\r"]);
    assert.deepEqual(dit, {
      id: second.id,
      projet: "brigade",
      genre: "second",
      titre: "Second",
      note: `sent to the second: \`${INSTALLATION}\` — \`claude\` went into shell mode, the app pressed Enter. Its output is read in its thread, and the second reads it too`,
      arrete: false,
    });
    // L'espace rouvert dit la même chose.
    assert.deepEqual(terminaux.espace(BRIGADE), [dit]);
  });

  test("second occupé : rien n'est écrit dans sa saisie, et le refus dit en clair qu'il est occupé et que la commande n'est pas partie", async () => {
    const { terminaux, second, pty, dire } = secondLibre();
    const note = second.note;
    // Le chef lui a parlé : un tour est en cours, son titre tourne.
    dire(second.id, "tour\n");
    pty.surSortie(TRAVAIL);

    const dit = await terminaux.envoyer(BRIGADE, INSTALLATION);

    assert.deepEqual(dit, { refus: `the second is busy: it is mid-turn${PAS_PARTIE}` });
    assert.deepEqual(pty.ecrits, []);
    // Le second n'est pas touché : sa note reste la sienne.
    assert.equal(un(terminaux.espace(BRIGADE)).note, note);

    // Le tour fini, il est libre : le même clic part.
    dire(second.id, "fin\n");
    pty.surSortie(REPOS);
    const rendu = terminaux.envoyer(BRIGADE, INSTALLATION);
    pty.surSortie(MODE_SHELL);
    assert.match((await rendu as Terminal).note, /^sent to the second: /);
    assert.deepEqual(pty.ecrits, [INSTALLATION, "\r"]);
  });

  test("prompt rempli non envoyé : un geste avec jugement écrit sa demande dans la saisie, et rien ne la transmet — ni Entrée de l'app, ni mode shell, ni geste direct à sa suite ; seule l'Entrée du chef l'envoie", async () => {
    const { terminaux, second, pty, dire } = secondLibre();
    const demande = "Le ticket #492 de brigade m'attend, et je ne sais pas quoi en faire. Lis l'issue #492, explique-moi ce qu'on attend de moi.";

    const dit = terminaux.inscrire(BRIGADE, demande, () => "demande écrite dans le second, sans Entrée");

    assert.deepEqual(pty.ecrits, [demande]);
    assert.equal(dit.note, "demande écrite dans le second, sans Entrée");
    // Quoi que le second affiche ensuite — jusqu'à la légende du mode shell —, l'app ne fait pas Entrée.
    for (const sortie of [REPOS, "❯ Le ticket #492 de brigade m'attend", MODE_SHELL, TRAVAIL, REPOS]) pty.surSortie(sortie);
    assert.deepEqual(pty.ecrits, [demande]);
    assert.ok(pty.ecrits.every((ecrit) => !/[\r\n]/.test(ecrit)));

    // Un geste direct ne s'écrit pas à la suite du prompt : il partirait avec lui, comme un message.
    assert.deepEqual(await terminaux.envoyer(BRIGADE, INSTALLATION), { refus: `${DIT.ecrit}${PAS_PARTIE}` });
    assert.deepEqual(pty.ecrits, [demande]);

    // C'est l'Entrée du chef qui transmet — et elle seule a été écrite après la demande.
    terminaux.ecrire(second.id, "\r");
    assert.deepEqual(pty.ecrits, [demande, "\r"]);
    dire(second.id, "tour\n");
    pty.surSortie(TRAVAIL);
    assert.deepEqual(await terminaux.envoyer(BRIGADE, INSTALLATION), { refus: `${DIT.occupe}${PAS_PARTIE}` });
  });

  test("une commande partie est en route, puis le second est occupé par elle : un second clic ne s'écrit pas derrière — une fois son tour fini, il repart", async () => {
    const { terminaux, second, pty, dire } = secondLibre();
    const premier = terminaux.envoyer(BRIGADE, INSTALLATION);
    pty.surSortie(MODE_SHELL);
    await premier;

    assert.deepEqual(await terminaux.envoyer(BRIGADE, INSTALLATION), { refus: `${DIT.route}${PAS_PARTIE}` });
    pty.surSortie(TRAVAIL);
    assert.deepEqual(await terminaux.envoyer(BRIGADE, INSTALLATION), { refus: `${DIT.occupe}${PAS_PARTIE}` });
    assert.deepEqual(pty.ecrits, [INSTALLATION, "\r"]);

    // La commande rendue, le second en tire un tour, que `Stop` ferme.
    dire(second.id, "fin\n");
    pty.surSortie(REPOS);
    const suivant = terminaux.envoyer(BRIGADE, INSTALLATION);
    pty.surSortie(MODE_SHELL);
    await suivant;
    assert.deepEqual(pty.ecrits, [INSTALLATION, "\r", INSTALLATION, "\r"]);
  });

  test("devant un dialogue — une permission en plein tour —, le titre est celui du repos mais le tour n'est pas fini : rien n'est écrit, une Entrée y validerait un choix", async () => {
    const { terminaux, second, pty, dire } = secondLibre();
    dire(second.id, "tour\ntour\n");
    pty.surSortie(TRAVAIL);
    pty.surSortie(REPOS);

    assert.deepEqual(await terminaux.envoyer(BRIGADE, INSTALLATION), { refus: `${DIT.attend}${PAS_PARTIE}` });
    assert.deepEqual(pty.ecrits, []);
  });

  test("le chef a une frappe en cours dans le second : rien n'est écrit à sa suite — après son Entrée et son tour, le geste part", async () => {
    const { terminaux, second, pty, dire } = secondLibre();
    // Le focus que le terminal de la vue rapporte n'est pas une frappe ; une lettre, si.
    terminaux.ecrire(second.id, "\x1b[I");
    terminaux.ecrire(second.id, "b");

    assert.deepEqual(await terminaux.envoyer(BRIGADE, INSTALLATION), { refus: `${DIT.frappe}${PAS_PARTIE}` });
    assert.deepEqual(pty.ecrits, ["\x1b[I", "b"]);

    terminaux.ecrire(second.id, "\r");
    dire(second.id, "tour\n");
    pty.surSortie(TRAVAIL);
    dire(second.id, "fin\n");
    pty.surSortie(REPOS);
    const rendu = terminaux.envoyer(BRIGADE, INSTALLATION);
    pty.surSortie(MODE_SHELL);
    await rendu;
    assert.deepEqual(pty.ecrits, ["\x1b[I", "b", "\r", INSTALLATION, "\r"]);
  });

  test("un second qui démarre n'a fini aucun tour : rien ne part — et sans fichier des tours, aucun second n'est jamais dit libre", async () => {
    const { terminaux, lance } = registreSuivi();
    terminaux.espace(BRIGADE);
    lance(0).surSortie(REPOS);

    assert.deepEqual(await terminaux.envoyer(BRIGADE, INSTALLATION), { refus: `${DIT.demarre}${PAS_PARTIE}` });
    assert.deepEqual(lance(0).ecrits, []);

    const sans = registre();
    sans.terminaux.espace(BRIGADE);
    sans.lance(0).surSortie(REPOS);
    assert.deepEqual(await sans.terminaux.envoyer(BRIGADE, INSTALLATION), { refus: `${DIT.demarre}${PAS_PARTIE}` });
    assert.deepEqual(sans.lance(0).ecrits, []);
  });

  test("`claude` ne se montre pas en mode shell : l'app ne fait pas Entrée, et la note dit que la commande est écrite mais pas partie — puis sa saisie n'est plus dite vide", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const { terminaux, pty } = secondLibre(5_000);

    const rendu = terminaux.envoyer(BRIGADE, INSTALLATION);
    // Il redessine sa saisie sans passer en mode shell : la commande s'est écrite à la suite d'autre chose.
    pty.surSortie("\x1b[?25l❯\xa0!station\x1b[12Gbrigade\x1b[?25h");
    t.mock.timers.tick(4_999);
    assert.deepEqual(pty.ecrits, [INSTALLATION]);
    t.mock.timers.tick(1);
    const dit = await rendu;

    assert.deepEqual(pty.ecrits, [INSTALLATION]);
    assert.ok(!("refus" in dit));
    assert.equal(dit.note, `written into the second, but not sent: \`${INSTALLATION}\` — \`claude\` did not show itself in shell mode (“! for shell mode”), so the app did not press Enter. Its input was not empty, or it was showing something other than its prompt: look at the second, and erase what is written there`);
    // La preuve arrivée trop tard n'envoie rien, et un second clic ne s'écrit pas derrière.
    pty.surSortie(MODE_SHELL);
    assert.deepEqual(await terminaux.envoyer(BRIGADE, INSTALLATION), { refus: `${DIT.ecrit}${PAS_PARTIE}` });
    assert.deepEqual(pty.ecrits, [INSTALLATION]);
  });

  test("le chef tape avant la preuve : l'app renonce à son Entrée, sans attendre sa garde", async () => {
    const { terminaux, second, pty } = secondLibre();

    const rendu = terminaux.envoyer(BRIGADE, INSTALLATION);
    terminaux.ecrire(second.id, "x");
    pty.surSortie(MODE_SHELL);
    const dit = await rendu;

    assert.deepEqual(pty.ecrits, [INSTALLATION, "x"]);
    assert.ok(!("refus" in dit));
    assert.match(dit.note, /^written into the second, but not sent: /);
  });

  test("le second s'arrête avant la preuve : rien n'est envoyé, et c'est son arrêt que la note dit", async () => {
    const { terminaux, pty } = secondLibre();

    const rendu = terminaux.envoyer(BRIGADE, INSTALLATION);
    pty.surFin(0);
    await rendu;

    assert.deepEqual(pty.ecrits, [INSTALLATION]);
    assert.equal(un(terminaux.espace(BRIGADE)).note, "the second stopped (code 0) — a keypress restarts it");
  });

  test("le second ne tournait pas : il est lancé, rien n'est écrit dans un second qui démarre, et la note dit que la commande n'est pas partie", async () => {
    const { terminaux, lance } = registreSuivi();

    const dit = await terminaux.envoyer(BRIGADE, INSTALLATION);

    assert.deepEqual(lance(0).ecrits, []);
    assert.ok(!("refus" in dit));
    assert.equal(dit.note, "the second was not running: launched (`claude --continue`, with the second's role in its system prompt) — the command did not go: a second that is starting takes nothing, click again when it has finished its first turn");
    assert.equal(dit.nonParti, true);
    assert.deepEqual(terminaux.espace(BRIGADE), [dit]);
  });

  test("une commande qui porterait de quoi partir seule n'est ni écrite ni envoyée", async () => {
    const { terminaux, pty } = secondLibre();

    for (const piege of ["!station\rreboot", "!station 'bo\nx'", "!station\x03", `${INSTALLATION}\r`]) {
      assert.deepEqual(await terminaux.envoyer(BRIGADE, piege), { refus: "nothing is written: the command carries a control character, and a line break would have sent it — check “nom” of this project in the projects file" });
    }
    assert.deepEqual(pty.ecrits, []);
  });

  test("le second est lancé avec les crochets qui disent ses tours, dans ses réglages à la suite du rôle — et repart d'un fichier vide ; un shell n'en reçoit pas", () => {
    const { terminaux, lance, dire, dits } = registreSuivi();
    const second = un(terminaux.espace(BRIGADE));
    const settings = reglages(`/tmp/brigade-app-essai/second-${second.id}.tours`);

    assert.deepEqual(lance(0).args, ["--continue", "--append-system-prompt-file", ROLE_DU_SECOND, "--settings", settings]);
    dire(second.id, "tour\nfin\n");

    // `claude --continue` n'a rien repris : la session neuve porte les mêmes crochets, et ses tours repartent de rien.
    lance(0).surFin(1);
    assert.deepEqual(lance(1).args, ["--append-system-prompt-file", ROLE_DU_SECOND, "--settings", settings]);
    assert.equal(dits.get(second.id), "");

    terminaux.shell(BRIGADE);
    assert.deepEqual(lance(2).args, ["-l"]);

    // Une session ouverte sur une commande de `claude` les porte aussi.
    const autre = registreSuivi();
    autre.terminaux.session(PARADE, "/brigade:init");
    assert.deepEqual(autre.lance(0).args.slice(0, 2), ["/brigade:init", "--settings"]);
  });
});

describe("le second reste local, sans multiplexeur, et sa conversation reprend à la réouverture", () => {
  // Un registre comme l'app en ouvre un à chaque lancement : des shells persistants
  // dont l'app se souvient — tout ce qui pourrait attirer le second ailleurs.
  const SOUVENIRS = { parade: { dernier: 1, shells: [{ rang: 1, session: "brigade-parade-1", cible: { lieu: "poste" } as const }] } };
  function lancement() {
    const lances: Lancement[] = [];
    const terminaux = ouvrirTerminaux({
      claude: "claude",
      shell: "/bin/zsh",
      souvenirs: { lire: () => SOUVENIRS, ecrire: () => undefined },
      ouvrirPty(l) {
        lances.push(l);
        return { ecrire: () => undefined, redimensionner: () => undefined, tuer: () => undefined };
      },
      surSortie: () => undefined,
      surEtat: () => undefined,
    });
    return { terminaux, lances };
  }
  const MOTS_DE_MULTIPLEXEUR = /tmux|screen|attach-session|new-session/;

  test("la commande de lancement du second est `claude --continue` sur le rôle, dans le dossier du projet : ni tmux, ni screen", () => {
    const { terminaux, lances } = lancement();

    terminaux.espace(PARADE);

    const [second, ...shells] = lances;
    assert.ok(second);
    assert.deepEqual([second.commande, ...second.args], ["claude", "--continue", ...ROLE]);
    assert.equal(second.dossier, "/projets/parade");
    assert.doesNotMatch([second.commande, ...second.args].join(" "), MOTS_DE_MULTIPLEXEUR);
    // Le shell persistant dont l'app se souvient, lui, se rattache par un shell : la différence est voulue.
    assert.equal(shells[0]?.commande, "/bin/sh");
  });

  test("son relancement — touche après un arrêt, ou session neuve faute de fil — reste local lui aussi, sans multiplexeur", () => {
    const { terminaux, lances } = lancement();
    terminaux.espace(PARADE);
    const claudes = () => lances.filter(({ commande }) => commande === "claude");
    claudes()[0]?.surFin(1);
    claudes()[1]?.surFin(0);
    const [second] = terminaux.espace(PARADE);
    assert.ok(second);
    terminaux.ecrire(second.id, "x");

    const seconds = lances.filter(({ commande }) => commande === "claude");
    assert.deepEqual(seconds.map(({ args }) => args), [["--continue", ...ROLE], ROLE, ["--continue", ...ROLE]]);
    for (const { commande, args } of seconds) assert.doesNotMatch([commande, ...args].join(" "), MOTS_DE_MULTIPLEXEUR);
  });

  test("fermer l'app puis la rouvrir : un registre neuf relance `claude --continue` — il reprend la conversation, il ne se rattache à aucune session", () => {
    const avant = lancement();
    avant.terminaux.espace(PARADE);
    avant.terminaux.fermer();

    const apres = lancement();
    apres.terminaux.espace(PARADE);

    assert.deepEqual([apres.lances[0]?.commande, ...(apres.lances[0]?.args ?? [])], ["claude", "--continue", ...ROLE]);
  });

  test("le second n'est pas une machine de « + shell » : seules les cibles de shells y sont proposées", async () => {
    const { machinesDe } = await import("../src/machines.ts");
    const machines = machinesDe();

    assert.ok(machines.length > 0);
    for (const { id, titre } of machines) assert.doesNotMatch(`${id} ${titre}`, /second/i);
  });
});
