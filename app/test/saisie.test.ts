// Ce que l'app sait de la saisie du second : ses tours, dits par ses crochets ;
// son titre ; ce que le chef y a tapé ; et la preuve du mode shell. Les signes
// sont ceux du vrai `claude` (2.1.296), relevés dans un pty le 2026-10-13 — ce
// fichier les rejoue, il ne lance aucun `claude`.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { DIT, ouvrirTours, PREUVE, reglages, suivreSaisie } from "../src/saisie.ts";

// Les titres que `claude` donne à son terminal : au repos, et au travail (deux images d'une même roue).
const REPOS = "\x1b]0;✳ Claude Code\x07";
const TRAVAIL = ["\x1b]0;◐ Claude Code\x07", "\x1b]0;◑ Claude Code\x07"];

// Une saisie suivie, et ce que le second a dit de ses tours.
function suivie(dits = "") {
  const tours = { dits };
  return { tours, saisie: suivreSaisie(() => tours.dits) };
}

// Un second à son invite, saisie vide : un tour fini, le titre du repos.
function libre() {
  const { tours, saisie } = suivie("tour\nfin\n");
  saisie.sortie(REPOS);
  assert.deepEqual(saisie.etat(), { libre: true });
  return { tours, saisie };
}

describe("les tours du second, dits par ses crochets", () => {
  function dossier(t: TestContext, nom: string): string {
    const racine = mkdtempSync(join(tmpdir(), nom));
    t.after(() => rmSync(racine, { recursive: true, force: true }));
    return racine;
  }

  test("les réglages donnés à `claude` posent trois crochets : un tour commence à `UserPromptSubmit` ou `PreToolUse`, finit à `Stop`", () => {
    const { hooks } = JSON.parse(reglages("/tmp/essai/second-1.tours")) as { hooks: Record<string, { hooks: { type: string; command: string }[] }[]> };

    assert.deepEqual(hooks, {
      UserPromptSubmit: [{ hooks: [{ type: "command", command: "printf 'tour\\n' >> '/tmp/essai/second-1.tours'" }] }],
      PreToolUse: [{ hooks: [{ type: "command", command: "printf 'tour\\n' >> '/tmp/essai/second-1.tours'" }] }],
      Stop: [{ hooks: [{ type: "command", command: "printf 'fin\\n' >> '/tmp/essai/second-1.tours'" }] }],
    });
  });

  test("joués par un vrai `sh`, les crochets écrivent ce que l'app relit — dans un dossier dont le nom porte une espace et une apostrophe, sans rien sur leur sortie", (t) => {
    const tours = ouvrirTours(dossier(t, "brigade l'app "));
    t.after(tours.fermer);
    const fichier = tours.de(7);
    const { hooks } = JSON.parse(reglages(fichier.chemin)) as { hooks: Record<string, { hooks: { command: string }[] }[]> };
    const jouer = (crochet: string) => execFileSync("sh", ["-c", hooks[crochet]?.[0]?.hooks[0]?.command ?? assert.fail(crochet)], { encoding: "utf8" });
    const { saisie } = { saisie: suivreSaisie(fichier.lire) };
    saisie.sortie(REPOS);

    // Rien n'est encore écrit : le fichier n'existe pas, et ce n'est pas « libre ».
    assert.equal(fichier.lire(), "");
    assert.deepEqual(saisie.etat(), { libre: false, dit: DIT.demarre });

    // `claude` lirait la sortie d'un crochet : celle de `UserPromptSubmit` entrerait dans le contexte du second.
    assert.deepEqual(["UserPromptSubmit", "PreToolUse"].map(jouer), ["", ""]);
    assert.equal(fichier.lire(), "tour\ntour\n");
    assert.deepEqual(saisie.etat(), { libre: false, dit: DIT.attend });

    assert.equal(jouer("Stop"), "");
    assert.equal(fichier.lire(), "tour\ntour\nfin\n");
    assert.deepEqual(saisie.etat(), { libre: true });

    // Relancé, le second repart d'un fichier vide : les tours d'avant ne valent plus.
    fichier.vider();
    assert.deepEqual(saisie.etat(), { libre: false, dit: DIT.demarre });
  });

  test("chaque second a son fichier, et l'app retire le dossier en fermant", (t) => {
    const racine = dossier(t, "brigade-tours-");
    const tours = ouvrirTours(racine);

    const [un, deux] = [tours.de(1), tours.de(2)];
    assert.notEqual(un.chemin, deux.chemin);
    assert.ok(un.chemin.startsWith(racine));
    un.vider();
    assert.ok(existsSync(un.chemin));

    tours.fermer();
    assert.ok(!existsSync(un.chemin));
    assert.equal(un.lire(), "");
  });
});

describe("le second est dit libre quand ses tours, son titre et sa saisie s'accordent", () => {
  test("aucun tour fini depuis son lancement : il démarre — même si son titre est déjà celui du repos", () => {
    const { tours, saisie } = suivie();
    saisie.sortie(REPOS);
    assert.deepEqual(saisie.etat(), { libre: false, dit: DIT.demarre });

    // Des crochets qui écriraient autre chose ne disent rien non plus.
    tours.dits = "n'importe quoi\n";
    assert.deepEqual(saisie.etat(), { libre: false, dit: DIT.demarre });
  });

  test("un tour en cours, le titre au travail : il est occupé", () => {
    const { saisie } = suivie("tour\nfin\ntour\n");
    for (const image of TRAVAIL) {
      saisie.sortie(image);
      assert.deepEqual(saisie.etat(), { libre: false, dit: DIT.occupe });
    }
  });

  test("le titre au travail sans tour annoncé — une commande `!`, un tour qu'il lance de lui-même : occupé aussi", () => {
    const { saisie } = libre();
    saisie.sortie(TRAVAIL[0] ?? "");
    assert.deepEqual(saisie.etat(), { libre: false, dit: DIT.occupe });
    saisie.sortie(REPOS);
    assert.deepEqual(saisie.etat(), { libre: true });
  });

  test("un tour en cours, le titre au repos : il attend une réponse du chef — c'est ce que `claude` montre devant un dialogue de permission", () => {
    const { tours, saisie } = libre();
    tours.dits += "tour\ntour\n";
    assert.deepEqual(saisie.etat(), { libre: false, dit: DIT.attend });

    // Le dialogue validé, le tour reprend, puis finit.
    saisie.sortie(TRAVAIL[1] ?? "");
    assert.deepEqual(saisie.etat(), { libre: false, dit: DIT.occupe });
    tours.dits += "fin\n";
    saisie.sortie(REPOS);
    // Le chef a validé d'une Entrée : rien n'est resté dans sa saisie.
    saisie.frappe("\r");
    assert.deepEqual(saisie.etat(), { libre: true });
  });

  test("aucun titre, ou un titre que l'app ne connaît pas : elle ne sait pas, et le dit avec ce titre", () => {
    const { saisie } = suivie("tour\nfin\n");
    assert.deepEqual(saisie.etat(), { libre: false, dit: DIT.sansTitre });

    saisie.sortie("\x1b]0;claude — brigade\x07");
    assert.deepEqual(saisie.etat(), { libre: false, dit: DIT.titre("claude — brigade") });
    assert.match(DIT.titre("claude — brigade"), /“claude — brigade”/);
  });

  test("le titre se lit dans la sortie telle que le pty la coupe, fermé par BEL ou par ST — et rien d'autre n'en est un", () => {
    const { saisie } = suivie("tour\nfin\n");

    // Coupé en plein milieu, à chaque endroit possible.
    const titre = "\x1b]0;◐ Comptage de 1 à 600\x07";
    for (let coupe = 1; coupe < titre.length; coupe++) {
      saisie.sortie(`du texte${REPOS}`);
      assert.deepEqual(saisie.etat(), { libre: true }, `avant la coupe ${coupe}`);
      saisie.sortie(`encore${titre.slice(0, coupe)}`);
      assert.deepEqual(saisie.etat(), { libre: true }, `titre ouvert, coupe ${coupe}`);
      saisie.sortie(`${titre.slice(coupe)}la suite`);
      assert.deepEqual(saisie.etat(), { libre: false, dit: DIT.occupe }, `titre fermé, coupe ${coupe}`);
    }

    // `OSC 2`, fermé par ST, coupé dans le ST.
    saisie.sortie("\x1b]2;✳ Brouillon horodaté\x1b");
    assert.deepEqual(saisie.etat(), { libre: false, dit: DIT.occupe });
    saisie.sortie("\\");
    assert.deepEqual(saisie.etat(), { libre: true });

    // Une autre séquence OSC — un lien, une couleur — n'est pas un titre ; ni un « ◐ » dans le texte.
    saisie.sortie("\x1b]8;;https://exemple.test\x07◐ lien\x1b]8;;\x07\x1b]11;rgb:0000/0000/0000\x07 ◐ au travail");
    assert.deepEqual(saisie.etat(), { libre: true });
  });
});

describe("la saisie du second n'est dite vide qu'après l'Entrée du chef", () => {
  test("une touche qui n'est pas Entrée entame la saisie : une lettre, une flèche, Échap, un collage — même s'il finit par un retour", () => {
    for (const touche of ["a", "é", "\x1b[A", "\x1b", "\x7f", "\x03", "\t", "\x1b[200~du texte\r\x1b[201~", "abc\r", "/"]) {
      const { saisie } = libre();
      saisie.frappe(touche);
      assert.deepEqual(saisie.etat(), { libre: false, dit: DIT.frappe }, JSON.stringify(touche));
    }
  });

  test("une Entrée seule la dit vide : elle a envoyé la frappe, ou n'a rien fait d'une saisie vide", () => {
    const { saisie } = libre();
    for (const touche of ["l", "s", "\r"]) saisie.frappe(touche);
    assert.deepEqual(saisie.etat(), { libre: true });
  });

  test("ce que le terminal de la vue répond de lui-même à `claude` n'est pas une frappe : focus, curseur, couleurs, ce qu'il est", () => {
    const reponses = ["\x1b[I", "\x1b[O", "\x1b[24;80R", "\x1b[?1;2c", "\x1b[>0;276;0c", "\x1b[0n", "\x1b[?2026;2$y", "\x1b[?0u", "\x1b[8;24;80t", "\x1b]11;rgb:1212/1414/1818\x07", "\x1b]10;rgb:ffff/ffff/ffff\x1b\\", "\x1bP>|xterm.js(6.0.0)\x1b\\", "\x1b[I\x1b[24;80R"];
    for (const reponse of reponses) {
      const { saisie } = libre();
      saisie.frappe(reponse);
      assert.deepEqual(saisie.etat(), { libre: true }, JSON.stringify(reponse));
    }
    // Mais une réponse suivie d'une touche en est une.
    const { saisie } = libre();
    saisie.frappe("\x1b[Ia");
    assert.deepEqual(saisie.etat(), { libre: false, dit: DIT.frappe });
  });

  test("un texte que l'app y écrit sans l'envoyer l'entame aussi, et le refus le dit — jusqu'à l'Entrée du chef", () => {
    const { saisie } = libre();
    saisie.entamer();
    assert.deepEqual(saisie.etat(), { libre: false, dit: DIT.ecrit });
    saisie.frappe("\r");
    assert.deepEqual(saisie.etat(), { libre: true });
  });
});

describe("l'Entrée de l'app attend la preuve du mode shell", () => {
  test("`claude` se montre en mode shell : la preuve est rendue une fois, où que le pty coupe sa sortie", () => {
    for (let coupe = 0; coupe <= PREUVE.length; coupe++) {
      const { saisie } = libre();
      const issues: boolean[] = [];
      saisie.ecrit((preuve) => void issues.push(preuve));

      // Tant qu'elle n'est pas venue, une commande est en route.
      assert.deepEqual(saisie.etat(), { libre: false, dit: DIT.route });
      saisie.sortie(`\x1b[2C\x1b[1B${PREUVE.slice(0, coupe)}`);
      saisie.sortie(`${PREUVE.slice(coupe)}\x1b[39m\x1b[K`);
      saisie.sortie(PREUVE);

      assert.deepEqual(issues, [true], `coupe ${coupe}`);
    }
  });

  test("ce que le second affichait avant l'écriture ne prouve rien", () => {
    const { saisie } = libre();
    saisie.sortie(PREUVE);
    const issues: boolean[] = [];
    saisie.ecrit((preuve) => void issues.push(preuve));
    saisie.sortie("autre chose");
    assert.deepEqual(issues, []);
  });

  test("l'app renonce : sans preuve, sa commande est quelque part dans ce que le second montre — sa saisie n'est plus dite vide", () => {
    const { saisie } = libre();
    const issues: boolean[] = [];
    saisie.ecrit((preuve) => void issues.push(preuve));

    saisie.renoncer();
    saisie.renoncer();
    saisie.sortie(PREUVE);

    assert.deepEqual(issues, [false]);
    assert.deepEqual(saisie.etat(), { libre: false, dit: DIT.ecrit });
  });

  test("le chef tape avant la preuve : l'app renonce à son Entrée — et si c'est la sienne qu'il a faite, la saisie est vide", () => {
    const { saisie } = libre();
    const issues: boolean[] = [];
    saisie.ecrit((preuve) => void issues.push(preuve));
    saisie.frappe("x");
    assert.deepEqual(issues, [false]);
    assert.deepEqual(saisie.etat(), { libre: false, dit: DIT.frappe });

    saisie.ecrit((preuve) => void issues.push(preuve));
    saisie.frappe("\r");
    assert.deepEqual(issues, [false, false]);
    assert.deepEqual(saisie.etat(), { libre: true });
  });

  test("partie, la commande est en route jusqu'à ce que `claude` se montre au travail — puis il est occupé, puis libre", () => {
    const { tours, saisie } = libre();
    saisie.parti();
    assert.deepEqual(saisie.etat(), { libre: false, dit: DIT.route });

    saisie.sortie(TRAVAIL[0] ?? "");
    assert.deepEqual(saisie.etat(), { libre: false, dit: DIT.occupe });
    // Le second tire un tour de la sortie de la commande, que `Stop` ferme.
    tours.dits += "fin\n";
    saisie.sortie(REPOS);
    assert.deepEqual(saisie.etat(), { libre: true });
  });

  test("une commande si brève que le travail et le repos arrivent d'un bloc — ou que le titre n'en montre rien : elle n'est pas dite en route pour toujours", () => {
    const bref = libre();
    bref.saisie.parti();
    bref.saisie.sortie(`${TRAVAIL[0]}! echo ok${REPOS}`);
    assert.deepEqual(bref.saisie.etat(), { libre: true });

    const muet = libre();
    muet.saisie.parti();
    assert.deepEqual(muet.saisie.etat(), { libre: false, dit: DIT.route });
    muet.tours.dits += "fin\n";
    assert.deepEqual(muet.saisie.etat(), { libre: true });
  });
});
