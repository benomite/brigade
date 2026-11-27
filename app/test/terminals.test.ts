// Le registre des terminaux, contre de faux pty : ce qu'il lance, ce qu'il
// garde, ce qu'il dit. Le vrai pty est éprouvé dans pty.test.ts.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { SAYS, settingsFile } from "../src/input.ts";
import { openTerminals, type Launch, type Terminal } from "../src/terminals.ts";
import { HERE } from "../src/platform.ts";
import { ROLE_OF_SECOND } from "../src/second/launch.ts";

const THREAD_RESUMED = "thread resumed: `claude --continue`, the latest conversation in this folder — whichever it is, not necessarily a second's; it runs with the second's role in its system prompt";
// Ce que `claude` reçoit pour être le second (second/lancement.ts) : le rôle livré avec l'app, et des réglages vides
// quand l'app ne suit pas ses tours.
const ROLE = ["--append-system-prompt-file", ROLE_OF_SECOND, "--settings", "{}"];
const THE_ROLE = ROLE.join(" ");
const BRIGADE = { nom: "brigade", dossier: "/projets/brigade" };
const PARADE = { nom: "parade", dossier: "/projets/parade" };

type FakePty = Launch & { ecrits: string[]; tailles: [number, number][]; tue: boolean };

function registry() {
  const launched: FakePty[] = [];
  const outputs: [number, string][] = [];
  const states: Terminal[] = [];
  const terminals = openTerminals({
    claude: "claude",
    shell: "/bin/zsh",
    ouvrirPty(launch) {
      const fake: FakePty = { ...launch, ecrits: [], tailles: [], tue: false };
      launched.push(fake);
      return {
        ecrire: (data) => void fake.ecrits.push(data),
        redimensionner: (columns, lines) => void fake.tailles.push([columns, lines]),
        tuer: () => void (fake.tue = true),
      };
    },
    surSortie: (id, data) => void outputs.push([id, data]),
    surEtat: (terminal) => void states.push(terminal),
  });
  // Le pty lancé au rang donné : le test échoue net s'il n'existe pas.
  const launches = (rank: number): FakePty => {
    const fake = launched.at(rank);
    assert.ok(fake, `aucun pty lancé au rang ${rank}`);
    return fake;
  };
  const commands = () => launched.map(({ commande: command, args, dossier: folder }) => [command, ...args, folder].join(" "));
  return { terminaux: terminals, lance: launches, commandes: commands, sorties: outputs, etats: states };
}

const oneOf = <T>(list: T[]): T => {
  assert.equal(list.length, 1);
  return list[0] as T;
};

describe("le registre des terminaux", () => {
  test("ouvrir un espace y lance le second, dans le dossier du projet, en reprenant le fil — et il le dit", () => {
    const { terminaux: terminals, commandes: commands } = registry();

    const second = oneOf(terminals.espace(BRIGADE));

    assert.deepEqual(commands(), [`claude --continue ${THE_ROLE} /projets/brigade`]);
    assert.deepEqual(second, {
      id: second.id,
      projet: "brigade",
      genre: "second",
      titre: "Second",
      note: THREAD_RESUMED,
      arrete: false,
    });
  });

  test("le second est lancé avec le rôle, pas en `claude` nu : le rôle suit `--continue`, et une session neuve le porte aussi", () => {
    const { terminaux: terminals, lance: launches, commandes: commands } = registry();
    terminals.espace(BRIGADE);

    assert.deepEqual(launches(0).args, ["--continue", ...ROLE]);
    launches(0).surFin(1);
    assert.deepEqual(launches(1).args, ROLE);
    assert.deepEqual(commands().length, 2);
  });

  test("un `claude --continue` qui sort en erreur n'a rien repris : une session neuve part, et la note le dit au lieu de se taire", () => {
    const { terminaux: terminals, lance: launches, commandes: commands, etats: states } = registry();
    const second = oneOf(terminals.espace(BRIGADE));

    launches(0).surFin(1);

    assert.deepEqual(commands(), [`claude --continue ${THE_ROLE} /projets/brigade`, `claude ${THE_ROLE} /projets/brigade`]);
    const said = oneOf(states);
    assert.deepEqual([said.id, said.arrete, said.note], [second.id, false, "new session: `claude --continue` exited with code 1, the thread was not resumed — `claude`, with the second's role in its system prompt"]);
    // L'espace rouvert dit la même chose.
    assert.deepEqual(terminals.espace(BRIGADE), [said]);
  });

  test("une session neuve qui s'arrête n'est pas relancée d'office : le second est dit arrêté, et une touche le relance en reprenant le fil", () => {
    const { terminaux: terminals, lance: launches, commandes: commands, etats: states } = registry();
    const second = oneOf(terminals.espace(BRIGADE));
    launches(0).surFin(1);

    launches(1).surFin(1);

    assert.equal(commands().length, 2);
    assert.deepEqual([states.at(-1)?.arrete, states.at(-1)?.note], [true, "the second stopped (code 1) — a keypress restarts it"]);

    terminals.ecrire(second.id, "\r");

    assert.deepEqual(commands().at(-1), `claude --continue ${THE_ROLE} /projets/brigade`);
    // La touche a relancé : elle n'est pas tapée dans la session qui revient.
    assert.deepEqual(launches(2).ecrits, []);
    assert.deepEqual([states.at(-1)?.arrete, states.at(-1)?.note], [false, THREAD_RESUMED]);
  });

  test("une commande inscrite dans le second y est écrite telle quelle, sans rien qui l'envoie — et la note ne promet que ce qui est tenu", () => {
    const { terminaux: terminals, lance: launches, etats: states } = registry();
    const second = oneOf(terminals.espace(BRIGADE));
    terminals.shell(BRIGADE);

    const said = terminals.inscrire(BRIGADE, "!station brigade garde-fous stop");

    // Dans le second, pas dans le shell ouvert à côté — et ni `\r` ni `\n` : c'est le chef qui fait Entrée.
    assert.deepEqual([launches(0).ecrits, launches(1).ecrits], [["!station brigade garde-fous stop"], []]);
    assert.deepEqual([said.id, said.arrete], [second.id, false]);
    assert.equal(said.note, "written into the second, without Enter: `!station brigade garde-fous stop` — at `claude`'s prompt, it waits for yours, after your typing if you were typing. On any other screen (a choice to make, vim mode), these characters are keystrokes: look at the second before confirming");
    // L'espace rouvert dit la même chose ; rien n'est annoncé à part, la vue a reçu la réponse.
    assert.deepEqual(terminals.espace(BRIGADE)[0], said);
    assert.deepEqual(states, []);
  });

  test("le second arrêté est lancé d'abord, et la commande n'y est pas écrite à l'aveugle : la note dit de recliquer", () => {
    const { terminaux: terminals, lance: launches, commandes: commands } = registry();
    const second = oneOf(terminals.espace(BRIGADE));
    launches(0).surFin(0);

    const said = terminals.inscrire(BRIGADE, "!station brigade garde-fous stop");

    assert.deepEqual(commands(), [`claude --continue ${THE_ROLE} /projets/brigade`, `claude --continue ${THE_ROLE} /projets/brigade`]);
    assert.deepEqual(launches(1).ecrits, []);
    assert.deepEqual([said.id, said.arrete], [second.id, false]);
    assert.equal(said.note, "the second was not running: launched (`claude --continue`, with the second's role in its system prompt) — the command is not written into a second that is starting, click again when it is ready");

    // Le second clic, lui, écrit.
    terminals.inscrire(BRIGADE, "!station brigade garde-fous stop");
    assert.deepEqual(launches(1).ecrits, ["!station brigade garde-fous stop"]);
  });

  test("un espace jamais ouvert n'a pas de second : le bouton l'ouvre d'abord, de la même façon", () => {
    const { terminaux: terminals, lance: launches, commandes: commands } = registry();

    const said = terminals.inscrire(BRIGADE, "!station brigade garde-fous stop");

    assert.deepEqual(commands(), [`claude --continue ${THE_ROLE} /projets/brigade`]);
    assert.deepEqual(launches(0).ecrits, []);
    assert.match(said.note, /^the second was not running: launched /);
    assert.deepEqual(terminals.espace(BRIGADE), [said]);
  });

  test("une commande qui porterait de quoi partir seule — un retour à la ligne dans un nom, un hôte — n'est pas écrite, et la note le dit", () => {
    const { terminaux: terminals, lance: launches } = registry();
    terminals.espace(BRIGADE);

    for (const trap of ["!station\rbrigade status", "!station 'bo\nx' brigade status", "!station\x03 brigade"]) {
      const said = terminals.inscrire(BRIGADE, trap);
      assert.equal(said.note, "nothing is written: the command carries a control character, and a line break would have sent it — check “nom” of this project in the projects file");
    }
    assert.deepEqual(launches(0).ecrits, []);
  });

  test("un fil repris que le chef quitte est dit arrêté, sans session neuve", () => {
    const { terminaux: terminals, lance: launches, commandes: commands, etats: states } = registry();
    terminals.espace(BRIGADE);

    launches(0).surFin(0);

    assert.equal(commands().length, 1);
    assert.deepEqual([oneOf(states).arrete, oneOf(states).note], [true, "the second stopped (code 0) — a keypress restarts it"]);
  });

  test("d'autres shells s'ouvrent dans l'espace, dans le dossier du projet, et le second est retrouvé tel qu'il était", () => {
    const { terminaux: terminals, lance: launches, commandes: commands } = registry();
    const second = oneOf(terminals.espace(BRIGADE));

    const shell = terminals.shell(BRIGADE);
    terminals.shell(BRIGADE);

    assert.deepEqual(commands().slice(1), ["/bin/zsh -l /projets/brigade", "/bin/zsh -l /projets/brigade"]);
    assert.deepEqual([shell.genre, shell.titre, shell.note], ["shell", "shell 1", `shell on ${HERE}, in /projets/brigade`]);
    // Rouvrir l'espace ne relance rien : le même second, les mêmes shells.
    assert.deepEqual(terminals.espace(BRIGADE).map(({ id, titre: title }) => [id, title]), [[second.id, "Second"], [shell.id, "shell 1"], [shell.id + 1, "shell 2"]]);
    assert.equal(commands().length, 3);
    assert.equal(launches(0).tue, false);
  });

  test("chaque projet a son second : ce qui est tapé, et ce qui sort, ne se croise pas", () => {
    const { terminaux: terminals, lance: launches, commandes: commands, sorties: outputs } = registry();
    const brigade = oneOf(terminals.espace(BRIGADE));
    const parade = oneOf(terminals.espace(PARADE));

    terminals.ecrire(brigade.id, "!ls\r");
    launches(1).surSortie("parade parle");
    launches(0).surSortie("brigade répond");

    assert.deepEqual(commands(), [`claude --continue ${THE_ROLE} /projets/brigade`, `claude --continue ${THE_ROLE} /projets/parade`]);
    assert.deepEqual([launches(0).ecrits, launches(1).ecrits], [["!ls\r"], []]);
    assert.deepEqual(outputs, [[parade.id, "parade parle"], [brigade.id, "brigade répond"]]);
  });

  test("un shell qui sort quitte l'espace ; le second et les autres projets n'en savent rien", () => {
    const { terminaux: terminals, lance: launches, etats: states } = registry();
    const second = oneOf(terminals.espace(BRIGADE));
    const shell = terminals.shell(BRIGADE);
    terminals.espace(PARADE);

    launches(1).surFin(0);

    assert.deepEqual([oneOf(states).id, oneOf(states).arrete], [shell.id, true]);
    assert.deepEqual(terminals.espace(BRIGADE).map(({ id }) => id), [second.id]);
    assert.deepEqual([launches(0).tue, launches(2).tue], [false, false]);
    // Écrire dans un shell disparu ne relance rien.
    terminals.ecrire(shell.id, "ls\r");
    assert.deepEqual(launches(1).ecrits, []);
  });

  test("la taille de la vue va au pty, et un second relancé repart à cette taille", () => {
    const { terminaux: terminals, lance: launches } = registry();
    const second = oneOf(terminals.espace(BRIGADE));
    assert.deepEqual([launches(0).colonnes, launches(0).lignes], [80, 24]);

    terminals.redimensionner(second.id, 132, 43);
    launches(0).surFin(0);
    terminals.redimensionner(second.id, 100, 30);
    terminals.ecrire(second.id, " ");

    assert.deepEqual(launches(0).tailles, [[132, 43]]);
    assert.deepEqual([launches(1).colonnes, launches(1).lignes], [100, 30]);
  });

  test("fermer tue tous les pty, et leur mort ne relance ni ne dit plus rien", () => {
    const { terminaux: terminals, lance: launches, commandes: commands, etats: states } = registry();
    terminals.espace(BRIGADE);
    terminals.shell(BRIGADE);
    terminals.espace(PARADE);

    terminals.fermer();
    for (const rank of [0, 1, 2]) launches(rank).surFin(129);

    assert.deepEqual([launches(0).tue, launches(1).tue, launches(2).tue], [true, true, true]);
    assert.equal(commands().length, 3);
    assert.deepEqual(states, []);
  });

  test("un projet qui quitte la liste perd ses terminaux, et eux seuls : tués, ils ne disent plus rien et ne relancent rien", () => {
    const { terminaux: terminals, lance: launches, commandes: commands, etats: states } = registry();
    const second = oneOf(terminals.espace(BRIGADE));
    const shell = terminals.shell(BRIGADE);
    const other = oneOf(terminals.espace(PARADE));

    assert.deepEqual(terminals.quitter("brigade"), [second.id, shell.id]);

    assert.deepEqual([launches(0).tue, launches(1).tue, launches(2).tue], [true, true, false]);
    launches(0).surFin(1);
    launches(1).surFin(0);
    assert.deepEqual(states, []);
    assert.equal(commands().length, 3);
    terminals.ecrire(second.id, "x");
    assert.equal(commands().length, 3);
    assert.deepEqual(terminals.espace(PARADE), [other]);
  });

  test("un projet revenu dans la liste retrouve un second neuf, au premier clic", () => {
    const { terminaux: terminals, commandes: commands } = registry();
    const before = oneOf(terminals.espace(BRIGADE));
    terminals.quitter("brigade");

    const after = oneOf(terminals.espace({ nom: "brigade", dossier: "/ailleurs" }));

    assert.notEqual(after.id, before.id);
    assert.equal(commands().at(-1), `claude --continue ${THE_ROLE} /ailleurs`);
  });
});


describe("ce que la mise en service demande au registre", () => {
  test("une session s'ouvre dans le second sur sa commande — `claude /brigade:init`, une conversation neuve dans le dossier du projet —, et la note le dit", () => {
    const { terminaux: terminals, commandes: commands, lance: launches } = registry();

    const second = terminals.session(BRIGADE, "/brigade:init");

    assert.deepEqual(commands(), ["claude /brigade:init /projets/brigade"]);
    assert.deepEqual(launches(0).ecrits, []);
    assert.deepEqual([second.genre, second.titre, second.arrete], ["second", "Claude", false]);
    assert.equal(second.note, "session launched on `/brigade:init`: `claude /brigade:init`, a new conversation in this folder — it is not the second: it runs without the second's role");
    // C'est le second de l'espace : l'ouvrir le retrouve, sans rien relancer.
    assert.deepEqual(terminals.espace(BRIGADE), [second]);
    assert.equal(commands().length, 1);
  });

  test("la session quittée est dite arrêtée, sans rien relancer d'office ; une touche reprend son fil, comme pour tout second", () => {
    const { terminaux: terminals, lance: launches, commandes: commands, etats: states } = registry();
    const second = terminals.session(BRIGADE, "/brigade:init");

    launches(0).surFin(1);

    assert.equal(commands().length, 1);
    assert.deepEqual([oneOf(states).arrete, oneOf(states).note], [true, "the second stopped (code 1) — a keypress restarts it"]);
    terminals.ecrire(second.id, "x");
    assert.equal(commands().at(-1), `claude --continue ${THE_ROLE} /projets/brigade`);
    // Le rôle est de nouveau établi : l'onglet peut reprendre son nom.
    assert.equal(terminals.espace(BRIGADE)[0]?.titre, "Second");
  });

  test("un second qui tourne déjà n'est pas remplacé : la commande y est écrite, sans rien qui l'envoie", () => {
    const { terminaux: terminals, lance: launches, commandes: commands } = registry();
    const second = oneOf(terminals.espace(BRIGADE));

    const said = terminals.session(BRIGADE, "/brigade:init");

    assert.deepEqual(commands(), [`claude --continue ${THE_ROLE} /projets/brigade`]);
    assert.deepEqual(launches(0).ecrits, ["/brigade:init"]);
    assert.equal(said.id, second.id);
    assert.match(said.note, /^written into the second, without Enter: `\/brigade:init` — /);
  });

  test("un second arrêté repart sur la session, au lieu de reprendre son fil", () => {
    const { terminaux: terminals, lance: launches, commandes: commands } = registry();
    const second = oneOf(terminals.espace(BRIGADE));
    launches(0).surFin(0);

    const said = terminals.session(BRIGADE, "/brigade:init");

    assert.equal(commands().at(-1), "claude /brigade:init /projets/brigade");
    assert.deepEqual([said.id, said.arrete], [second.id, false]);
  });

  test("une session dont la commande porterait un caractère de contrôle n'est ni lancée ni écrite", () => {
    const { terminaux: terminals, commandes: commands } = registry();

    const said = terminals.session(BRIGADE, "/brigade:init\r");

    assert.deepEqual(commands(), []);
    assert.match(said.note, /^nothing is written: the command carries a control character/);
  });

  test("un shell peut s'ouvrir sur une commande : elle y est écrite telle quelle, sans rien qui l'envoie — c'est le chef qui fait Entrée", () => {
    const { terminaux: terminals, lance: launches, commandes: commands } = registry();
    terminals.espace(BRIGADE);

    const shell = terminals.shell(BRIGADE, "sudo systemctl enable --now brigade@brigade.service");

    assert.equal(commands().at(-1), "/bin/zsh -l /projets/brigade");
    // Dans ce shell, pas dans le second — et ni `\r` ni `\n`.
    assert.deepEqual([launches(0).ecrits, launches(1).ecrits], [[], ["sudo systemctl enable --now brigade@brigade.service"]]);
    assert.deepEqual([shell.genre, shell.titre], ["shell", "shell 1"]);
    assert.equal(shell.note, "written into this shell, without Enter: `sudo systemctl enable --now brigade@brigade.service` — yours is what sends it. A real terminal: what the command asks for — a password — is typed here");
  });

  test("une commande qui porterait de quoi partir seule n'est pas écrite dans le shell, et sa note le dit", () => {
    const { terminaux: terminals, lance: launches } = registry();

    for (const trap of ["sudo\rreboot", "sudo 'bo\nx'", "sudo\x03"]) {
      const shell = terminals.shell(BRIGADE, trap);
      assert.equal(shell.note, "nothing is written: the command carries a control character, and a line break would have sent it — check “nom” of this project in the projects file");
    }
    assert.deepEqual([launches(0).ecrits, launches(1).ecrits, launches(2).ecrits], [[], [], []]);
  });
});

// Le second tel que le vrai `claude` (2.1.296) se montre, relevé dans un pty le 2026-10-13 :
// le titre qu'il donne à son terminal au repos et au travail, et ce qu'il redessine quand une
// commande `!…` arrive dans sa saisie vide — la saisie en mode shell, avec sa légende (les
// filets raccourcis). Ses tours, eux, sont dits par ses crochets, dans un fichier : ici, un faux.
const REPOS = "\x1b]0;✳ Claude Code\x07";
const WORK = "\x1b]0;◐ Claude Code\x07";
const MODE_SHELL =
  "\x1b[?25l\x1b[H\r\x1b[36B\x1b[38;5;211m────────\r\x1b[1B!\xa0\x1b[39mstation\x1b[11Gbrigade\x1b[19Ginstallation\r\x1b[1B\x1b[38;5;211m────────\r\x1b[2C\x1b[1B! for shell mode\x1b[39m\x1b[K\x1b[40;1H\x1b[38;51H\x1b[?25h";
const INSTALLATION = "!station brigade installation";
const NOT_PART = ` — the command did not go, and nothing is written: \`${INSTALLATION}\``;

// Un registre dont chaque second dit ses tours à l'app. `tours` : ce que le second du rang donné a dit.
function registryTracking(proofDelayMs?: number) {
  const launched: FakePty[] = [];
  const saidOnes = new Map<number, string>();
  const terminals = openTerminals({
    claude: "claude",
    shell: "/bin/zsh",
    ouvrirPty(launch) {
      const fake: FakePty = { ...launch, ecrits: [], tailles: [], tue: false };
      launched.push(fake);
      return {
        ecrire: (data) => void fake.ecrits.push(data),
        redimensionner: () => {},
        tuer: () => void (fake.tue = true),
      };
    },
    surSortie: () => {},
    surEtat: () => {},
    tours: (id) => ({ chemin: `/tmp/brigade-app-essai/second-${id}.tours`, lire: () => saidOnes.get(id) ?? "", vider: () => void saidOnes.set(id, "") }),
    ...(proofDelayMs === undefined ? {} : { delaiPreuveMs: proofDelayMs }),
  });
  const launches = (rank: number): FakePty => {
    const fake = launched.at(rank);
    assert.ok(fake, `aucun pty lancé au rang ${rank}`);
    return fake;
  };
  return { terminaux: terminals, lance: launches, dire: (id: number, turns: string) => void saidOnes.set(id, (saidOnes.get(id) ?? "") + turns), dits: saidOnes };
}

// Un espace ouvert sur un second libre : son premier tour est fini, il est à son invite.
function secondFree(proofDelayMs?: number) {
  const tracking = registryTracking(proofDelayMs);
  const second = oneOf(tracking.terminaux.espace(BRIGADE));
  tracking.lance(0).surSortie(WORK);
  tracking.dire(second.id, "tour\nfin\n");
  tracking.lance(0).surSortie(REPOS);
  return { ...tracking, second, pty: tracking.lance(0) };
}

describe("un geste direct part vraiment dans le second, et dit quand il ne peut pas", () => {
  test("second libre : la commande est écrite, `claude` se montre en mode shell, l'app fait Entrée — et la note dit ce qui est parti, et où lire sa sortie", async () => {
    const { terminaux: terminals, second, pty } = secondFree();

    const rendered = terminals.envoyer(BRIGADE, INSTALLATION);

    // Écrite, sans Entrée : celle de l'app attend la preuve.
    assert.deepEqual(pty.ecrits, [INSTALLATION]);
    pty.surSortie(MODE_SHELL);
    const said = await rendered;

    assert.deepEqual(pty.ecrits, [INSTALLATION, "\r"]);
    assert.deepEqual(said, {
      id: second.id,
      projet: "brigade",
      genre: "second",
      titre: "Second",
      note: `sent to the second: \`${INSTALLATION}\` — \`claude\` went into shell mode, the app pressed Enter. Its output is read in its thread, and the second reads it too`,
      arrete: false,
    });
    // L'espace rouvert dit la même chose.
    assert.deepEqual(terminals.espace(BRIGADE), [said]);
  });

  test("second occupé : rien n'est écrit dans sa saisie, et le refus dit en clair qu'il est occupé et que la commande n'est pas partie", async () => {
    const { terminaux: terminals, second, pty, dire: tell } = secondFree();
    const note = second.note;
    // Le chef lui a parlé : un tour est en cours, son titre tourne.
    tell(second.id, "tour\n");
    pty.surSortie(WORK);

    const said = await terminals.envoyer(BRIGADE, INSTALLATION);

    assert.deepEqual(said, { refus: `the second is busy: it is mid-turn${NOT_PART}` });
    assert.deepEqual(pty.ecrits, []);
    // Le second n'est pas touché : sa note reste la sienne.
    assert.equal(oneOf(terminals.espace(BRIGADE)).note, note);

    // Le tour fini, il est libre : le même clic part.
    tell(second.id, "fin\n");
    pty.surSortie(REPOS);
    const rendered = terminals.envoyer(BRIGADE, INSTALLATION);
    pty.surSortie(MODE_SHELL);
    assert.match((await rendered as Terminal).note, /^sent to the second: /);
    assert.deepEqual(pty.ecrits, [INSTALLATION, "\r"]);
  });

  test("prompt rempli non envoyé : un geste avec jugement écrit sa demande dans la saisie, et rien ne la transmet — ni Entrée de l'app, ni mode shell, ni geste direct à sa suite ; seule l'Entrée du chef l'envoie", async () => {
    const { terminaux: terminals, second, pty, dire: tell } = secondFree();
    const request = "Le ticket #492 de brigade m'attend, et je ne sais pas quoi en faire. Lis l'issue #492, explique-moi ce qu'on attend de moi.";

    const said = terminals.inscrire(BRIGADE, request, () => "demande écrite dans le second, sans Entrée");

    assert.deepEqual(pty.ecrits, [request]);
    assert.equal(said.note, "demande écrite dans le second, sans Entrée");
    // Quoi que le second affiche ensuite — jusqu'à la légende du mode shell —, l'app ne fait pas Entrée.
    for (const output of [REPOS, "❯ Le ticket #492 de brigade m'attend", MODE_SHELL, WORK, REPOS]) pty.surSortie(output);
    assert.deepEqual(pty.ecrits, [request]);
    assert.ok(pty.ecrits.every((written) => !/[\r\n]/.test(written)));

    // Un geste direct ne s'écrit pas à la suite du prompt : il partirait avec lui, comme un message.
    assert.deepEqual(await terminals.envoyer(BRIGADE, INSTALLATION), { refus: `${SAYS.ecrit}${NOT_PART}` });
    assert.deepEqual(pty.ecrits, [request]);

    // C'est l'Entrée du chef qui transmet — et elle seule a été écrite après la demande.
    terminals.ecrire(second.id, "\r");
    assert.deepEqual(pty.ecrits, [request, "\r"]);
    tell(second.id, "tour\n");
    pty.surSortie(WORK);
    assert.deepEqual(await terminals.envoyer(BRIGADE, INSTALLATION), { refus: `${SAYS.occupe}${NOT_PART}` });
  });

  test("une commande partie est en route, puis le second est occupé par elle : un second clic ne s'écrit pas derrière — une fois son tour fini, il repart", async () => {
    const { terminaux: terminals, second, pty, dire: tell } = secondFree();
    const first = terminals.envoyer(BRIGADE, INSTALLATION);
    pty.surSortie(MODE_SHELL);
    await first;

    assert.deepEqual(await terminals.envoyer(BRIGADE, INSTALLATION), { refus: `${SAYS.route}${NOT_PART}` });
    pty.surSortie(WORK);
    assert.deepEqual(await terminals.envoyer(BRIGADE, INSTALLATION), { refus: `${SAYS.occupe}${NOT_PART}` });
    assert.deepEqual(pty.ecrits, [INSTALLATION, "\r"]);

    // La commande rendue, le second en tire un tour, que `Stop` ferme.
    tell(second.id, "fin\n");
    pty.surSortie(REPOS);
    const next = terminals.envoyer(BRIGADE, INSTALLATION);
    pty.surSortie(MODE_SHELL);
    await next;
    assert.deepEqual(pty.ecrits, [INSTALLATION, "\r", INSTALLATION, "\r"]);
  });

  test("devant un dialogue — une permission en plein tour —, le titre est celui du repos mais le tour n'est pas fini : rien n'est écrit, une Entrée y validerait un choix", async () => {
    const { terminaux: terminals, second, pty, dire: tell } = secondFree();
    tell(second.id, "tour\ntour\n");
    pty.surSortie(WORK);
    pty.surSortie(REPOS);

    assert.deepEqual(await terminals.envoyer(BRIGADE, INSTALLATION), { refus: `${SAYS.attend}${NOT_PART}` });
    assert.deepEqual(pty.ecrits, []);
  });

  test("le chef a une frappe en cours dans le second : rien n'est écrit à sa suite — après son Entrée et son tour, le geste part", async () => {
    const { terminaux: terminals, second, pty, dire: tell } = secondFree();
    // Le focus que le terminal de la vue rapporte n'est pas une frappe ; une lettre, si.
    terminals.ecrire(second.id, "\x1b[I");
    terminals.ecrire(second.id, "b");

    assert.deepEqual(await terminals.envoyer(BRIGADE, INSTALLATION), { refus: `${SAYS.frappe}${NOT_PART}` });
    assert.deepEqual(pty.ecrits, ["\x1b[I", "b"]);

    terminals.ecrire(second.id, "\r");
    tell(second.id, "tour\n");
    pty.surSortie(WORK);
    tell(second.id, "fin\n");
    pty.surSortie(REPOS);
    const rendered = terminals.envoyer(BRIGADE, INSTALLATION);
    pty.surSortie(MODE_SHELL);
    await rendered;
    assert.deepEqual(pty.ecrits, ["\x1b[I", "b", "\r", INSTALLATION, "\r"]);
  });

  test("un second qui démarre n'a fini aucun tour : rien ne part — et sans fichier des tours, aucun second n'est jamais dit libre", async () => {
    const { terminaux: terminals, lance: launches } = registryTracking();
    terminals.espace(BRIGADE);
    launches(0).surSortie(REPOS);

    assert.deepEqual(await terminals.envoyer(BRIGADE, INSTALLATION), { refus: `${SAYS.demarre}${NOT_PART}` });
    assert.deepEqual(launches(0).ecrits, []);

    const without = registry();
    without.terminaux.espace(BRIGADE);
    without.lance(0).surSortie(REPOS);
    assert.deepEqual(await without.terminaux.envoyer(BRIGADE, INSTALLATION), { refus: `${SAYS.demarre}${NOT_PART}` });
    assert.deepEqual(without.lance(0).ecrits, []);
  });

  test("`claude` ne se montre pas en mode shell : l'app ne fait pas Entrée, et la note dit que la commande est écrite mais pas partie — puis sa saisie n'est plus dite vide", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const { terminaux: terminals, pty } = secondFree(5_000);

    const rendered = terminals.envoyer(BRIGADE, INSTALLATION);
    // Il redessine sa saisie sans passer en mode shell : la commande s'est écrite à la suite d'autre chose.
    pty.surSortie("\x1b[?25l❯\xa0!station\x1b[12Gbrigade\x1b[?25h");
    t.mock.timers.tick(4_999);
    assert.deepEqual(pty.ecrits, [INSTALLATION]);
    t.mock.timers.tick(1);
    const said = await rendered;

    assert.deepEqual(pty.ecrits, [INSTALLATION]);
    assert.ok(!("refus" in said));
    assert.equal(said.note, `written into the second, but not sent: \`${INSTALLATION}\` — \`claude\` did not show itself in shell mode (“! for shell mode”), so the app did not press Enter. Its input was not empty, or it was showing something other than its prompt: look at the second, and erase what is written there`);
    // La preuve arrivée trop tard n'envoie rien, et un second clic ne s'écrit pas derrière.
    pty.surSortie(MODE_SHELL);
    assert.deepEqual(await terminals.envoyer(BRIGADE, INSTALLATION), { refus: `${SAYS.ecrit}${NOT_PART}` });
    assert.deepEqual(pty.ecrits, [INSTALLATION]);
  });

  test("le chef tape avant la preuve : l'app renonce à son Entrée, sans attendre sa garde", async () => {
    const { terminaux: terminals, second, pty } = secondFree();

    const rendered = terminals.envoyer(BRIGADE, INSTALLATION);
    terminals.ecrire(second.id, "x");
    pty.surSortie(MODE_SHELL);
    const said = await rendered;

    assert.deepEqual(pty.ecrits, [INSTALLATION, "x"]);
    assert.ok(!("refus" in said));
    assert.match(said.note, /^written into the second, but not sent: /);
  });

  test("le second s'arrête avant la preuve : rien n'est envoyé, et c'est son arrêt que la note dit", async () => {
    const { terminaux: terminals, pty } = secondFree();

    const rendered = terminals.envoyer(BRIGADE, INSTALLATION);
    pty.surFin(0);
    await rendered;

    assert.deepEqual(pty.ecrits, [INSTALLATION]);
    assert.equal(oneOf(terminals.espace(BRIGADE)).note, "the second stopped (code 0) — a keypress restarts it");
  });

  test("le second ne tournait pas : il est lancé, rien n'est écrit dans un second qui démarre, et la note dit que la commande n'est pas partie", async () => {
    const { terminaux: terminals, lance: launches } = registryTracking();

    const said = await terminals.envoyer(BRIGADE, INSTALLATION);

    assert.deepEqual(launches(0).ecrits, []);
    assert.ok(!("refus" in said));
    assert.equal(said.note, "the second was not running: launched (`claude --continue`, with the second's role in its system prompt) — the command did not go: a second that is starting takes nothing, click again when it has finished its first turn");
    assert.equal(said.nonParti, true);
    assert.deepEqual(terminals.espace(BRIGADE), [said]);
  });

  test("une commande qui porterait de quoi partir seule n'est ni écrite ni envoyée", async () => {
    const { terminaux: terminals, pty } = secondFree();

    for (const trap of ["!station\rreboot", "!station 'bo\nx'", "!station\x03", `${INSTALLATION}\r`]) {
      assert.deepEqual(await terminals.envoyer(BRIGADE, trap), { refus: "nothing is written: the command carries a control character, and a line break would have sent it — check “nom” of this project in the projects file" });
    }
    assert.deepEqual(pty.ecrits, []);
  });

  test("le second est lancé avec les crochets qui disent ses tours, dans ses réglages à la suite du rôle — et repart d'un fichier vide ; un shell n'en reçoit pas", () => {
    const { terminaux: terminals, lance: launches, dire: tell, dits: saidOnes } = registryTracking();
    const second = oneOf(terminals.espace(BRIGADE));
    const settings = settingsFile(`/tmp/brigade-app-essai/second-${second.id}.tours`);

    assert.deepEqual(launches(0).args, ["--continue", "--append-system-prompt-file", ROLE_OF_SECOND, "--settings", settings]);
    tell(second.id, "tour\nfin\n");

    // `claude --continue` n'a rien repris : la session neuve porte les mêmes crochets, et ses tours repartent de rien.
    launches(0).surFin(1);
    assert.deepEqual(launches(1).args, ["--append-system-prompt-file", ROLE_OF_SECOND, "--settings", settings]);
    assert.equal(saidOnes.get(second.id), "");

    terminals.shell(BRIGADE);
    assert.deepEqual(launches(2).args, ["-l"]);

    // Une session ouverte sur une commande de `claude` les porte aussi.
    const other = registryTracking();
    other.terminaux.session(PARADE, "/brigade:init");
    assert.deepEqual(other.lance(0).args.slice(0, 2), ["/brigade:init", "--settings"]);
  });
});

describe("le second reste local, sans multiplexeur, et sa conversation reprend à la réouverture", () => {
  // Un registre comme l'app en ouvre un à chaque lancement : des shells persistants
  // dont l'app se souvient — tout ce qui pourrait attirer le second ailleurs.
  const MEMORIES = { parade: { dernier: 1, shells: [{ rang: 1, session: "brigade-parade-1", cible: { lieu: "poste" } as const }] } };
  function launch() {
    const launched: Launch[] = [];
    const terminals = openTerminals({
      claude: "claude",
      shell: "/bin/zsh",
      souvenirs: { lire: () => MEMORIES, ecrire: () => undefined },
      ouvrirPty(l) {
        launched.push(l);
        return { ecrire: () => undefined, redimensionner: () => undefined, tuer: () => undefined };
      },
      surSortie: () => undefined,
      surEtat: () => undefined,
    });
    return { terminaux: terminals, lances: launched };
  }
  const WORDS_OF_MULTIPLEXER = /tmux|screen|attach-session|new-session/;

  test("la commande de lancement du second est `claude --continue` sur le rôle, dans le dossier du projet : ni tmux, ni screen", () => {
    const { terminaux: terminals, lances: launched } = launch();

    terminals.espace(PARADE);

    const [second, ...shells] = launched;
    assert.ok(second);
    assert.deepEqual([second.commande, ...second.args], ["claude", "--continue", ...ROLE]);
    assert.equal(second.dossier, "/projets/parade");
    assert.doesNotMatch([second.commande, ...second.args].join(" "), WORDS_OF_MULTIPLEXER);
    // Le shell persistant dont l'app se souvient, lui, se rattache par un shell : la différence est voulue.
    assert.equal(shells[0]?.commande, "/bin/sh");
  });

  test("son relancement — touche après un arrêt, ou session neuve faute de fil — reste local lui aussi, sans multiplexeur", () => {
    const { terminaux: terminals, lances: launched } = launch();
    terminals.espace(PARADE);
    const claudes = () => launched.filter(({ commande: command }) => command === "claude");
    claudes()[0]?.surFin(1);
    claudes()[1]?.surFin(0);
    const [second] = terminals.espace(PARADE);
    assert.ok(second);
    terminals.ecrire(second.id, "x");

    const seconds = launched.filter(({ commande: command }) => command === "claude");
    assert.deepEqual(seconds.map(({ args }) => args), [["--continue", ...ROLE], ROLE, ["--continue", ...ROLE]]);
    for (const { commande: command, args } of seconds) assert.doesNotMatch([command, ...args].join(" "), WORDS_OF_MULTIPLEXER);
  });

  test("fermer l'app puis la rouvrir : un registre neuf relance `claude --continue` — il reprend la conversation, il ne se rattache à aucune session", () => {
    const before = launch();
    before.terminaux.espace(PARADE);
    before.terminaux.fermer();

    const after = launch();
    after.terminaux.espace(PARADE);

    assert.deepEqual([after.lances[0]?.commande, ...(after.lances[0]?.args ?? [])], ["claude", "--continue", ...ROLE]);
  });

  test("le second n'est pas une machine de « + shell » : seules les cibles de shells y sont proposées", async () => {
    const { machinesOf } = await import("../src/machines.ts");
    const machines = machinesOf();

    assert.ok(machines.length > 0);
    for (const { id, titre: title } of machines) assert.doesNotMatch(`${id} ${title}`, /second/i);
  });
});
