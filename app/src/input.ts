// Ce que l'app sait de la saisie du second, sans lire son écran : de quoi dire
// s'il est libre — à son invite, saisie vide — avant d'y faire partir un geste
// direct (terminals.ts, `envoyer`). Relevé sur le vrai `claude` (2.1.296), dans
// un pty, le 2026-10-13 — une commande `!…` écrite dans sa saisie :
// - libre, suivie d'Entrée : elle s'exécute aussitôt, sa sortie s'affiche dans
//   le fil, et le second en tire un court tour à lui (il la commente) ;
// - occupé : elle n'est ni perdue ni exécutée, elle est mise en file, et part
//   seule à la fin du tour — quand le chef ne regarde plus ;
// - devant un dialogue (une permission, `/model`) : ses caractères sont des
//   touches, et une Entrée y valide le choix montré ;
// - à la suite d'une frappe du chef : le tout part comme un message au second.
// Écrire à l'aveugle n'est donc pas envoyer. L'app ne lit toujours pas l'écran ;
// elle tient trois témoins, et ne dit le second libre que s'ils s'accordent :
// - ses tours, que `claude` annonce lui-même par ses crochets (`reglages`) : un
//   tour commence à `UserPromptSubmit` ou `PreToolUse`, finit à `Stop`. Devant un
//   dialogue de permission le tour n'est pas fini — c'est ce que le titre ne dit pas ;
// - le titre que `claude` donne à son terminal : « ✳ … » quand il attend le
//   chef, « ◐ … » ou « ◑ … » quand il tourne — y compris pour une commande `!`
//   ou un tour qu'il lance de lui-même, que les crochets n'annoncent pas ;
// - ce que le chef y a tapé, que l'app relaie : tant que sa dernière touche
//   n'est pas Entrée, sa saisie n'est pas dite vide.
// Et une preuve, avant l'Entrée : écrite à une invite vide, une commande `!…`
// fait passer `claude` en mode shell, et il l'affiche (`PREUVE`). Ni une frappe
// en cours, ni un dialogue ne la donnent : sans elle, l'app ne fait pas Entrée.
// Tout cela tient à ce que `claude` montre aujourd'hui. Qu'un de ces signes
// change, et plus rien ne part : le geste dit pourquoi, il ne devine pas.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";

// Ce que `claude` affiche sous sa saisie quand elle est en mode shell.
export const PROOF = "! for shell mode";

// Le fichier où le second écrit ses tours, une ligne par crochet.
export type Turns = { chemin: string; lire(): string; vider(): void };

const TOUR = "tour";
const END = "fin";

// Les réglages donnés à `claude` (`--settings`) : trois crochets, qui n'écrivent
// qu'un mot dans le fichier des tours — rien sur leur sortie, que `claude` lirait.
// Sous Windows, `claude` joue ses crochets par le `bash` de Git, qui lit `C:/…` : le chemin y part
// avec des barres obliques.
export function settingsFile(path: string, separator: string = sep): string {
  return JSON.stringify({ hooks: hooksOfTurns(path, separator) });
}

// Ces trois crochets, seuls : le second les reçoit dans ses réglages, avec les autres (second/launch.ts).
export function hooksOfTurns(path: string, separator: string = sep) {
  const readOne = separator === "\\" ? path.replaceAll("\\", "/") : path;
  const hook = (word: string) => [{ hooks: [{ type: "command" as const, command: `printf '${word}\\n' >> '${readOne.replaceAll("'", `'\\''`)}'` }] }];
  return { UserPromptSubmit: hook(TOUR), PreToolUse: hook(TOUR), Stop: hook(END) };
}

// Les fichiers des tours, un par second, dans un dossier temporaire que l'app retire en fermant.
export function openTurns(root: string = tmpdir()) {
  const folder = mkdtempSync(join(root, "brigade-app-"));
  return {
    de(id: number): Turns {
      const path = join(folder, `second-${id}.tours`);
      return {
        chemin: path,
        // Pas encore écrit, ou retiré : le second n'a rien dit.
        lire: () => {
          try {
            return readFileSync(path, "utf8");
          } catch {
            return "";
          }
        },
        vider: () => writeFileSync(path, ""),
      };
    },
    fermer: () => rmSync(folder, { recursive: true, force: true }),
  };
}

// Ce que le geste direct dit quand il ne part pas : pourquoi le second n'est pas dit libre.
export const SAYS = {
  demarre: "the second has not finished any turn since it launched: it is starting up — or its hooks tell the app nothing, so the app cannot know it is free",
  occupe: "the second is busy: it is mid-turn",
  attend: "the second is not at its prompt: it is waiting for your answer — a permission, a question — or its last turn was interrupted, and the app will only know it is free at the end of the next one",
  sansTitre: "the app does not know whether the second is free: `claude` has given its terminal no title",
  titre: (title: string) => `the app does not know whether the second is free: the title \`claude\` gives its terminal (“${title}”) is neither the idle one (“✳ …”) nor the working one (“◐ …”)`,
  route: "an app command is already on its way in the second",
  frappe: "your input in the second is not reported empty: your last key there was not Enter, and the command, written after what you typed, would go out as a message — send or clear what you typed; with empty input, an Enter in the second tells the app",
  ecrit: "the second's input is not reported empty: the app wrote into it without sending, and does not know whether it went out or was cleared — send or clear what is there; with empty input, an Enter in the second tells the app",
} as const;

export type State = { libre: true } | { libre: false; dit: string };

export type Input = ReturnType<typeof followInput>;

// Un titre de terminal : `OSC 0` ou `OSC 2`, fermé par BEL ou par ST.
const TITLE = /\x1b\][02];([^\x07\x1b]*)(?:\x07|\x1b\\)/g;
// Le début d'un titre que la suite de la sortie fermera.
const TITLE_OPEN = /\x1b(?:\](?:[02](?:;[^\x07\x1b]*\x1b?)?)?)?$/;
const REPOS = "✳";
const WORK = ["◐", "◑", "◒", "◓"];
const atWork = (title: string | undefined) => title !== undefined && WORK.some((glyphe) => title.startsWith(glyphe));

// Ce que le terminal de la vue répond à `claude` de lui-même, par le même chemin que les touches :
// le focus pris ou rendu, la place du curseur, ce qu'il est, ses couleurs. Le chef n'a rien tapé.
const ANSWERS = /^(?:\x1b\[[IO]|\x1b\[[?>]?[\d;]*(?:[Rcnt]|\$y)|\x1b\[\?[\d;]*u|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1bP[^\x1b]*\x1b\\)+$/;

// `lireTours` : ce que le second a écrit de ses tours depuis son lancement.
export function followInput(readTurns: () => string) {
  let title: string | undefined;
  let remains = "";
  // Qui a laissé la saisie entamée : le chef, par une touche qui n'est pas Entrée ; l'app, par un texte écrit sans l'envoyer.
  let started: "chef" | "app" | undefined;
  // L'app a fait Entrée, et `claude` ne s'est pas encore montré au travail : les tours qu'il avait dits jusque-là.
  let route: number | undefined;
  // L'app a écrit une commande, et attend la preuve du mode shell : ce qui est sorti depuis, et qui prévenir.
  let wait: { vu: string; surIssue(proof: boolean): void } | undefined;

  const turns = () => readTurns().trimEnd().split("\n");

  function conclude(proof: boolean): void {
    const expected = wait;
    if (expected === undefined) return;
    wait = undefined;
    // Sans preuve, la commande est quelque part dans ce que le second montre : sa saisie n'est plus dite vide.
    if (!proof) started ??= "app";
    expected.surIssue(proof);
  }

  return {
    // Ce que le second affiche, tel que le pty le rend.
    sortie(data: string): void {
      const readOne = remains + data;
      for (const [, last = ""] of readOne.matchAll(TITLE)) {
        title = last;
        // Il s'est montré au travail, ne serait-ce qu'un instant : la commande de l'app n'est plus en route, elle tourne.
        if (atWork(title)) route = undefined;
      }
      remains = TITLE_OPEN.exec(readOne.slice(-512))?.[0] ?? "";
      if (wait === undefined) return;
      wait.vu = (wait.vu + data).slice(-4096);
      if (wait.vu.includes(PROOF)) conclude(true);
    },

    // Ce que la vue écrit dans le second : les touches du chef — et les réponses de son terminal, qui n'en sont pas.
    frappe(data: string): void {
      if (ANSWERS.test(data)) return;
      // Le chef a repris la main avant la preuve : l'Entrée de l'app n'est plus à faire.
      conclude(false);
      // Une Entrée seule envoie la saisie, ou ne fait rien d'une saisie vide : elle est vide après.
      started = data === "\r" ? undefined : "chef";
    },

    // L'app vient d'écrire un texte dans la saisie, sans l'envoyer (terminals.ts, `inscrire`).
    entamer(): void {
      started ??= "app";
    },

    // L'app va écrire une commande `!…`, sans Entrée : `surIssue` dit si `claude` s'est montré en mode shell.
    ecrit(onIssue: (proof: boolean) => void): void {
      wait = { vu: "", surIssue: onIssue };
    },

    // La preuve n'est pas venue : l'app renonce à son Entrée.
    renoncer: () => conclude(false),

    // L'app a fait Entrée sur sa commande.
    parti(): void {
      route = turns().length;
    },

    etat(): State {
      const saidOnes = turns();
      const last = saidOnes.at(-1);
      // Un tour s'est dit depuis l'Entrée de l'app : sa commande a tourné, même si le titre n'en a rien montré.
      if (route !== undefined && saidOnes.length > route) route = undefined;
      const refusal = (said: string): State => ({ libre: false, dit: said });
      if (last !== TOUR && last !== END) return refusal(SAYS.demarre);
      if (atWork(title)) return refusal(SAYS.occupe);
      if (title === undefined) return refusal(SAYS.sansTitre);
      if (!title.startsWith(REPOS)) return refusal(SAYS.titre(title));
      if (last === TOUR) return refusal(SAYS.attend);
      if (route !== undefined || wait !== undefined) return refusal(SAYS.route);
      if (started !== undefined) return refusal(started === "chef" ? SAYS.frappe : SAYS.ecrit);
      return { libre: true };
    },
  };
}
