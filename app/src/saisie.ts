// Ce que l'app sait de la saisie du second, sans lire son écran : de quoi dire
// s'il est libre — à son invite, saisie vide — avant d'y faire partir un geste
// direct (terminaux.ts, `envoyer`). Relevé sur le vrai `claude` (2.1.296), dans
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
import { join } from "node:path";

// Ce que `claude` affiche sous sa saisie quand elle est en mode shell.
export const PREUVE = "! for shell mode";

// Le fichier où le second écrit ses tours, une ligne par crochet.
export type Tours = { chemin: string; lire(): string; vider(): void };

const TOUR = "tour";
const FIN = "fin";

// Les réglages donnés à `claude` (`--settings`) : trois crochets, qui n'écrivent
// qu'un mot dans le fichier des tours — rien sur leur sortie, que `claude` lirait.
export function reglages(chemin: string): string {
  const crochet = (mot: string) => [{ hooks: [{ type: "command", command: `printf '${mot}\\n' >> '${chemin.replaceAll("'", `'\\''`)}'` }] }];
  return JSON.stringify({ hooks: { UserPromptSubmit: crochet(TOUR), PreToolUse: crochet(TOUR), Stop: crochet(FIN) } });
}

// Les fichiers des tours, un par second, dans un dossier temporaire que l'app retire en fermant.
export function ouvrirTours(racine: string = tmpdir()) {
  const dossier = mkdtempSync(join(racine, "brigade-app-"));
  return {
    de(id: number): Tours {
      const chemin = join(dossier, `second-${id}.tours`);
      return {
        chemin,
        // Pas encore écrit, ou retiré : le second n'a rien dit.
        lire: () => {
          try {
            return readFileSync(chemin, "utf8");
          } catch {
            return "";
          }
        },
        vider: () => writeFileSync(chemin, ""),
      };
    },
    fermer: () => rmSync(dossier, { recursive: true, force: true }),
  };
}

// Ce que le geste direct dit quand il ne part pas : pourquoi le second n'est pas dit libre.
export const DIT = {
  demarre: "the second has not finished any turn since it launched: it is starting up — or its hooks tell the app nothing, so the app cannot know it is free",
  occupe: "the second is busy: it is mid-turn",
  attend: "the second is not at its prompt: it is waiting for your answer — a permission, a question — or its last turn was interrupted, and the app will only know it is free at the end of the next one",
  sansTitre: "the app does not know whether the second is free: `claude` has given its terminal no title",
  titre: (titre: string) => `the app does not know whether the second is free: the title \`claude\` gives its terminal (“${titre}”) is neither the idle one (“✳ …”) nor the working one (“◐ …”)`,
  route: "an app command is already on its way in the second",
  frappe: "your input in the second is not reported empty: your last key there was not Enter, and the command, written after what you typed, would go out as a message — send or clear what you typed; with empty input, an Enter in the second tells the app",
  ecrit: "the second's input is not reported empty: the app wrote into it without sending, and does not know whether it went out or was cleared — send or clear what is there; with empty input, an Enter in the second tells the app",
} as const;

export type Etat = { libre: true } | { libre: false; dit: string };

export type Saisie = ReturnType<typeof suivreSaisie>;

// Un titre de terminal : `OSC 0` ou `OSC 2`, fermé par BEL ou par ST.
const TITRE = /\x1b\][02];([^\x07\x1b]*)(?:\x07|\x1b\\)/g;
// Le début d'un titre que la suite de la sortie fermera.
const TITRE_OUVERT = /\x1b(?:\](?:[02](?:;[^\x07\x1b]*\x1b?)?)?)?$/;
const REPOS = "✳";
const TRAVAIL = ["◐", "◑", "◒", "◓"];
const auTravail = (titre: string | undefined) => titre !== undefined && TRAVAIL.some((glyphe) => titre.startsWith(glyphe));

// Ce que le terminal de la vue répond à `claude` de lui-même, par le même chemin que les touches :
// le focus pris ou rendu, la place du curseur, ce qu'il est, ses couleurs. Le chef n'a rien tapé.
const REPONSES = /^(?:\x1b\[[IO]|\x1b\[[?>]?[\d;]*(?:[Rcnt]|\$y)|\x1b\[\?[\d;]*u|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1bP[^\x1b]*\x1b\\)+$/;

// `lireTours` : ce que le second a écrit de ses tours depuis son lancement.
export function suivreSaisie(lireTours: () => string) {
  let titre: string | undefined;
  let reste = "";
  // Qui a laissé la saisie entamée : le chef, par une touche qui n'est pas Entrée ; l'app, par un texte écrit sans l'envoyer.
  let entamee: "chef" | "app" | undefined;
  // L'app a fait Entrée, et `claude` ne s'est pas encore montré au travail : les tours qu'il avait dits jusque-là.
  let route: number | undefined;
  // L'app a écrit une commande, et attend la preuve du mode shell : ce qui est sorti depuis, et qui prévenir.
  let attente: { vu: string; surIssue(preuve: boolean): void } | undefined;

  const tours = () => lireTours().trimEnd().split("\n");

  function conclure(preuve: boolean): void {
    const attendue = attente;
    if (attendue === undefined) return;
    attente = undefined;
    // Sans preuve, la commande est quelque part dans ce que le second montre : sa saisie n'est plus dite vide.
    if (!preuve) entamee ??= "app";
    attendue.surIssue(preuve);
  }

  return {
    // Ce que le second affiche, tel que le pty le rend.
    sortie(donnees: string): void {
      const lu = reste + donnees;
      for (const [, dernier = ""] of lu.matchAll(TITRE)) {
        titre = dernier;
        // Il s'est montré au travail, ne serait-ce qu'un instant : la commande de l'app n'est plus en route, elle tourne.
        if (auTravail(titre)) route = undefined;
      }
      reste = TITRE_OUVERT.exec(lu.slice(-512))?.[0] ?? "";
      if (attente === undefined) return;
      attente.vu = (attente.vu + donnees).slice(-4096);
      if (attente.vu.includes(PREUVE)) conclure(true);
    },

    // Ce que la vue écrit dans le second : les touches du chef — et les réponses de son terminal, qui n'en sont pas.
    frappe(donnees: string): void {
      if (REPONSES.test(donnees)) return;
      // Le chef a repris la main avant la preuve : l'Entrée de l'app n'est plus à faire.
      conclure(false);
      // Une Entrée seule envoie la saisie, ou ne fait rien d'une saisie vide : elle est vide après.
      entamee = donnees === "\r" ? undefined : "chef";
    },

    // L'app vient d'écrire un texte dans la saisie, sans l'envoyer (terminaux.ts, `inscrire`).
    entamer(): void {
      entamee ??= "app";
    },

    // L'app va écrire une commande `!…`, sans Entrée : `surIssue` dit si `claude` s'est montré en mode shell.
    ecrit(surIssue: (preuve: boolean) => void): void {
      attente = { vu: "", surIssue };
    },

    // La preuve n'est pas venue : l'app renonce à son Entrée.
    renoncer: () => conclure(false),

    // L'app a fait Entrée sur sa commande.
    parti(): void {
      route = tours().length;
    },

    etat(): Etat {
      const dits = tours();
      const dernier = dits.at(-1);
      // Un tour s'est dit depuis l'Entrée de l'app : sa commande a tourné, même si le titre n'en a rien montré.
      if (route !== undefined && dits.length > route) route = undefined;
      const refus = (dit: string): Etat => ({ libre: false, dit });
      if (dernier !== TOUR && dernier !== FIN) return refus(DIT.demarre);
      if (auTravail(titre)) return refus(DIT.occupe);
      if (titre === undefined) return refus(DIT.sansTitre);
      if (!titre.startsWith(REPOS)) return refus(DIT.titre(titre));
      if (dernier === TOUR) return refus(DIT.attend);
      if (route !== undefined || attente !== undefined) return refus(DIT.route);
      if (entamee !== undefined) return refus(entamee === "chef" ? DIT.frappe : DIT.ecrit);
      return { libre: true };
    },
  };
}
