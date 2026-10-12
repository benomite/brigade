// La mise en service d'un projet, après l'ajout : amorcer son dépôt, merger,
// vérifier, démarrer — dans cet ordre, et l'app n'en saute aucun.
//
// `/brigade:init` est une session Claude Code, pas une commande : l'app ne la joue
// pas à la place du chef, elle l'ouvre dans le second de l'espace. Que son résultat
// soit mergé, elle ne le sait pas : elle dit qu'il doit l'être, et c'est le chef qui
// le dit fait. Elle vérifie alors en lançant la commande qui existe — `installation`,
// par le geste de la box, comme la veille lance `status` — et montre ce qu'elle a
// rendu, en entier : c'est `installation` qui nomme chaque manque et son geste, l'app
// n'en redit aucun. Seul son code de sortie fait un « prêt », avec sa ligne de verdict.
//
// Démarrer est un geste `root` (`systemctl`), qu'aucun geste de la box ne donne
// sans mot de passe : l'app ne le lance pas. Elle l'écrit dans un shell de l'espace,
// sans l'envoyer — et refuse de l'écrire tant qu'`installation` n'a pas dit le projet
// prêt. Rien n'est gardé d'un lancement de l'app à l'autre : une mise en service
// reprise repart de son premier état, et la box redit le reste.
import { echecDe, lancerGeste, type Echec, type Reglages, type Servi } from "./box.ts";
import type { Projet } from "./config.ts";
import { titreDEchec } from "./faits.ts";
import { FORME_ATTENDUE, refusDeForme } from "./nom.ts";
import type { Terminal } from "./terminaux.ts";

// La session qui amorce le dépôt (docs/installer.md, « Amorcer le dépôt »).
export const INIT = "/brigade:init";
// La commande du runtime qui dit si le projet est prêt, et tout ce qui manque d'un coup.
export const VERIFICATION = "installation";
const DOC = "docs/installer.md";

// Ce qu'`installation` a rendu, lancée une fois. `a` : l'instant où elle a fini.
//   `pret`         sortie en 0, avec sa ligne de verdict : rien ne manque
//   `incomplete`   elle a été lancée, et le projet n'est pas prêt (1), ou elle a refusé son environnement (2)
//   `illisible`    un 0 sans sa ligne de verdict : ce n'est pas elle qui a répondu
//   `sans-verdict` elle n'a rien rendu d'elle-même — la box pas jointe, le geste qui refuse, `ssh` arrêté
// `obtenu` : la ligne lancée, ce que la box a écrit, le code de sortie — tel quel.
export type Verifiee = { a: string } & ({ etat: "pret" | "incomplete" | "illisible"; obtenu: string } | ({ etat: "sans-verdict" } & Echec));

// La ligne par laquelle `installation` dit un projet prêt (runtime/src/installation-cli.ts).
const verdict = (nom: string) => `brigade : projet « ${nom} » : prêt`;

// Lance `installation` sur la box du projet, et dit ce qu'il en est advenu. Jamais
// d'exception. Les codes sont ceux de docs/installer.md, « Vérifier que le projet est
// prêt » : 0, 1 ou 2, la commande a été lancée ; tout autre vient du geste, ou de `ssh`.
export async function verifier(reglages: Reglages, servi: Servi): Promise<Verifiee> {
  const rendu = await lancerGeste(reglages, servi, VERIFICATION);
  const a = new Date().toISOString();
  const { erreur } = rendu;
  const obtenu = (code: number) => `${rendu.lance}\n${rendu.erreurs}${rendu.sortie}\n→ code de sortie ${code}`;
  if (erreur === null) {
    // Un compte enfermé dans une commande forcée rend 0, lui aussi, et autre chose que le verdict.
    const dit = rendu.sortie.split("\n").some((ligne) => ligne.startsWith(verdict(servi.nom)));
    return { a, etat: dit ? "pret" : "illisible", obtenu: obtenu(0) };
  }
  if (erreur.killed !== true && (erreur.code === 1 || erreur.code === 2)) return { a, etat: "incomplete", obtenu: obtenu(erreur.code) };
  return { a, etat: "sans-verdict", ...echecDe({ ...rendu, erreur }, reglages.delaiMs) };
}

// Un mot tel que le shell du poste le rendra à `ssh` : entier, sans rien en exécuter.
const mot = (texte: string) => (/^[A-Za-z0-9@._:-]+$/.test(texte) ? texte : `'${texte.replaceAll("'", `'\\''`)}'`);

const sansBox = (nom: string) => `« ${nom} » ne dit pas où est sa box : il n'y a rien à y vérifier ni à y démarrer.`;

// Ce que « Démarrer » écrit pour ce projet — ou pourquoi il n'écrit rien. C'est le geste
// de docs/installer.md, « Servir le premier ticket », celui que la box nomme en fin
// d'installation ; `ssh -t` lui donne un terminal, où `sudo` demande son mot de passe.
export function commandeDeDemarrage(projet: Projet): { commande: string } | { refus: string } {
  if (projet.box === undefined) return { refus: sansBox(projet.nom) };
  const { hote } = projet.box;
  // Un retour à la ligne enverrait la commande ; et dans cette forme, un tiret en tête est une option de `ssh`.
  if (/[\x00-\x1f\x7f]/.test(hote)) return { refus: "rien n'est écrit : « hote » porte un caractère de contrôle, et un retour à la ligne aurait envoyé la commande — corrige-le dans le fichier des projets" };
  if (hote.startsWith("-")) return { refus: `rien n'est écrit : « hote » commence par un tiret (${hote}), et \`ssh\` le lirait comme une option dans la commande — corrige-le dans le fichier des projets` };
  // L'unité porte le nom du projet : seul un nom que la box accepte en nomme une — au caractère près.
  const { nom } = projet;
  if (nom === "" || nom !== nom.trim() || refusDeForme(nom) !== undefined) return { refus: `rien n'est écrit : le « nom » de ce projet n'est celui d'aucune instance sur la box — attendu : ${FORME_ATTENDUE}` };
  return { commande: `ssh -t ${mot(hote)} sudo systemctl enable --now brigade@${nom}.service` };
}

// Les trois états : l'init n'est pas dit mergé ; il l'est, et `installation` ne dit
// pas — ou pas encore — le projet prêt ; elle le dit.
export type Etape = "init" | "verification" | "pret";

// Ce que la vue pose d'une vérification : son titre, ce que l'app a obtenu, ce qu'elle
// en dit. Sans verdict, c'est l'échec de la veille, que la vue sait déjà rendre.
export type Montree =
  | { etat: "en-cours"; titre: string }
  | { etat: "pret" | "incomplete" | "illisible"; a: string; titre: string; obtenu: string; suite: string[] }
  | { etat: "sans-verdict"; a: string; titre: string; echec: Echec };

// La mise en service d'un projet, prête à poser : la vue n'y décide rien.
// `suivi` : le chef l'a entamée — par l'écran d'ajout, ou par un de ses gestes —, et
// elle s'ouvre d'elle-même dans l'espace du projet.
// `verifierRefuse`, `demarrerRefuse` : pourquoi le bouton est inactif — absent, il se clique.
export type Parcours = {
  projet: string;
  etape: Etape;
  suivi: boolean;
  titre: string;
  init: string;
  amorce: string[];
  consigne: string[];
  merge: boolean;
  verifie: string[];
  verifierRefuse?: string;
  verification?: Montree;
  demarre: string[];
  demarrerRefuse?: string;
};

const TITRES: Readonly<Record<Etape, string>> = {
  init: "amorcer le dépôt, et merger",
  verification: "vérifier que le projet est prêt",
  pret: "prêt — le runtime peut démarrer",
};

type Tenu = { hote: string; suivi: boolean; merge: boolean; verification?: Verifiee; enCours?: Promise<void> };

export type Services = ReturnType<typeof tenirServices>;

// Les mises en service, tenues tant que l'app est ouverte. Ce par quoi elles passent
// leur est donné : la vérification sur la box, et les deux terminaux — le second, où
// s'ouvre la session d'init, et un shell, où s'écrit le démarrage.
export function tenirServices(options: {
  verifier(servi: Servi): Promise<Verifiee>;
  session(projet: Projet, commande: string): Terminal;
  shell(projet: Projet, ecrit: string): Terminal;
}) {
  const tenus = new Map<string, Tenu>();

  // La mise en service d'un projet sur sa box d'aujourd'hui : un « prêt » obtenu d'une autre ne vaut rien ici.
  function tenir(nom: string, hote: string): Tenu {
    const tenu = tenus.get(nom);
    if (tenu !== undefined && tenu.hote === hote) return tenu;
    const neuf: Tenu = { hote, suivi: false, merge: false };
    tenus.set(nom, neuf);
    return neuf;
  }

  const etape = ({ merge, verification, enCours }: Tenu): Etape => (!merge ? "init" : enCours === undefined && verification?.etat === "pret" ? "pret" : "verification");

  function montrer(servi: Servi, verifiee: Verifiee): Montree {
    const { a } = verifiee;
    const commande = `ssh ${mot(servi.box.hote)} brigade ${mot(servi.nom)} ${VERIFICATION}`;
    if (verifiee.etat === "sans-verdict") {
      const { erreur, atteinte, cas } = verifiee;
      return { etat: "sans-verdict", a, titre: titreDEchec({ erreur, atteinte, cas }, `JOINT, MAIS \`${VERIFICATION}\` N'A PAS RENDU SON VERDICT`), echec: { erreur, atteinte, cas } };
    }
    const { etat, obtenu } = verifiee;
    if (etat === "pret") {
      return { etat, a, titre: "PRÊT", obtenu, suite: [`\`${VERIFICATION}\` dit le projet prêt : rien ne manque pour lancer un cook.`, "Une ligne `à savoir` ne retient rien — lis-la quand même : c'est ce que la box veut que tu saches avant de démarrer."] };
    }
    if (etat === "incomplete") {
      return {
        etat,
        a,
        titre: "PAS PRÊT",
        obtenu,
        suite: [
          `\`${VERIFICATION}\` a répondu, et le projet n'est pas prêt : ce qu'elle a rendu est ci-dessus, en entier.`,
          "Chaque ligne `MANQUE` nomme un point qui n'est pas prêt, et la flèche (`→`) dessous ce qui reste à faire pour lui. Une ligne `à savoir` ne retient rien.",
          `Là où la flèche dit « la même commande », elle se tape ainsi depuis ce poste : \`${commande}\`, suivie de ce qu'elle nomme.`,
          `Un manque « Dans le dépôt » : le résultat de \`${INIT}\` n'est pas — ou pas en entier — sur la branche d'intégration, telle que l'origine la porte.`,
          "Règle ce qui manque, puis vérifie de nouveau : la vérification se rejoue autant qu'on veut.",
        ],
      };
    }
    return {
      etat,
      a,
      titre: "PAS DE VERDICT",
      obtenu,
      suite: [
        `La box a rendu un code 0 sans la ligne par laquelle \`${VERIFICATION}\` dit ce projet prêt (\`${verdict(servi.nom)}…\`) : ce qu'elle a rendu est ci-dessus, et ce n'est pas un « prêt ».`,
        `Le cas attendu : ton compte sur la box est enfermé dans une commande forcée, qui remplace celle que l'app envoie — ${DOC}, « Ajouter un humain ».`,
      ],
    };
  }

  function parcours(projet: Projet): Parcours | undefined {
    if (projet.box === undefined) return undefined;
    const servi = { nom: projet.nom, box: projet.box };
    const tenu = tenir(projet.nom, projet.box.hote);
    const ou = etape(tenu);
    const { merge, verification, enCours } = tenu;
    const demarrage = commandeDeDemarrage(projet);
    const verifierRefuse = !merge
      ? `Pas de vérification : le résultat de \`${INIT}\` n'est pas dit mergé — merge-le sur la branche d'intégration, puis coche la case ci-dessus.`
      : enCours !== undefined
        ? "La vérification est en cours : elle répond d'elle-même."
        : undefined;
    const demarrerRefuse = !merge
      ? `Pas de démarrage : le résultat de \`${INIT}\` n'est pas dit mergé.`
      : enCours !== undefined
        ? "Pas de démarrage : la vérification est en cours."
        : verification === undefined
          ? `Pas de démarrage : la box n'a pas encore vérifié ce projet — « Vérifier » y lance \`${VERIFICATION}\`.`
          : verification.etat === "incomplete"
            ? `Pas de démarrage : \`${VERIFICATION}\` ne dit pas le projet prêt — ce qui manque est nommé ci-dessus, point par point, avec ce qui reste à faire.`
            : verification.etat !== "pret"
              ? `Pas de démarrage : \`${VERIFICATION}\` n'a pas rendu son verdict — ce que l'app a obtenu est ci-dessus.`
              : "refus" in demarrage
                ? demarrage.refus
                : undefined;
    return {
      projet: projet.nom,
      etape: ou,
      suivi: tenu.suivi,
      titre: `Mise en service — ${tenu.suivi ? TITRES[ou] : "amorcer le dépôt, merger, vérifier, démarrer"}`,
      init: INIT,
      amorce: [
        `\`${INIT}\` est une session Claude Code, pas une commande : l'app ne la joue pas à ta place, elle l'ouvre dans le second de cet espace — une conversation neuve, dans le dossier du projet.`,
        `Elle pose dans le dépôt ce que la box attend de lui — le bloc de bindings, les gates, le setup — et le prouve (${DOC}, « Amorcer le dépôt »). Elle se rejoue sans dégât.`,
      ],
      consigne: [
        `Le résultat de \`${INIT}\` doit être mergé sur la branche d'intégration avant de continuer : la box ne voit du dépôt que ce que son origine porte.`,
        "L'app ne sait pas s'il l'est : c'est toi qui le dis. Tant que tu ne l'as pas dit, elle ne vérifie rien et ne propose pas le démarrage.",
      ],
      merge,
      verifie: [`« Vérifier » lance \`${VERIFICATION}\` sur la box du projet, à ta place : elle dit si un cook peut partir, et nomme tout ce qui manque d'un coup. Elle ne lance ni cook ni setup, et se rejoue autant qu'on veut.`],
      ...(verifierRefuse === undefined ? {} : { verifierRefuse }),
      ...(enCours !== undefined
        ? { verification: { etat: "en-cours", titre: `vérification en cours… \`${VERIFICATION}\` joint l'origine du dépôt et GitHub : quelques secondes, deux minutes au plus` } }
        : verification === undefined
          ? {}
          : { verification: montrer(servi, verification) }),
      demarre: [
        ...("commande" in demarrage ? [`« Démarrer » ouvre un shell dans cet espace et y écrit, sans l'envoyer : \`${demarrage.commande}\`.`] : []),
        "C'est ton Entrée qui démarre le runtime : démarrer un service est un geste `root`, que l'app ne fait pas à ta place. Sur la box, `sudo` te demande ton mot de passe dans ce shell, s'il en veut un.",
        `Le premier ticket se sert sans grant \`merge\`, et une première sauvegarde se lance à la main : ${DOC}, « Servir le premier ticket ».`,
      ],
      ...(demarrerRefuse === undefined ? {} : { demarrerRefuse }),
    };
  }

  function suivre(projet: Projet): void {
    if (projet.box !== undefined) tenir(projet.nom, projet.box.hote).suivi = true;
  }

  // Ce qui réclame un terminal : la raison, pour un projet qui n'en a pas.
  const sansTerminal = (projet: Projet) => (projet.box === undefined ? sansBox(projet.nom) : projet.refus === undefined ? undefined : `« ${projet.nom} » ne s'ouvre pas : ${projet.refus}`);

  return {
    // Rien, pour un projet sans box : il n'y a rien à y vérifier ni à y démarrer.
    parcours,

    // Le projet vient d'être ajouté par l'écran : sa mise en service est entamée.
    suivre,

    // La session `/brigade:init`, dans le second du projet. Rien n'en est déduit :
    // qu'elle ait abouti, et que son résultat soit mergé, c'est le chef qui le dit.
    amorcer(projet: Projet): Terminal | { refus: string } {
      const refus = sansTerminal(projet);
      if (refus !== undefined) return { refus };
      suivre(projet);
      return options.session(projet, INIT);
    },

    // Le chef dit le résultat de l'init mergé — ou s'en dédit : le verdict d'avant est alors lâché.
    direMerge(projet: Projet, merge: boolean): Parcours | undefined {
      if (projet.box === undefined) return undefined;
      const tenu = tenir(projet.nom, projet.box.hote);
      tenu.suivi = true;
      tenu.merge = merge;
      if (!merge) {
        tenu.verification = undefined;
        tenu.enCours = undefined;
      }
      return parcours(projet);
    },

    // Lance `installation`, et rend la mise en service telle qu'elle en sort. Refusée tant
    // que l'init n'est pas dit mergé : rien ne part vers la box. Une vérification en route
    // ne se double pas, et le verdict d'avant ne vaut plus dès qu'elle part.
    async verifier(projet: Projet): Promise<Parcours | undefined> {
      if (projet.box === undefined) return undefined;
      const tenu = tenir(projet.nom, projet.box.hote);
      if (!tenu.merge) return parcours(projet);
      if (tenu.enCours === undefined) {
        tenu.suivi = true;
        tenu.verification = undefined;
        const lancee = options.verifier({ nom: projet.nom, box: projet.box }).then((verifiee) => {
          // Le chef s'est dédit, ou le projet a changé de box : ce verdict n'est plus à personne.
          if (tenu.enCours !== lancee) return;
          tenu.enCours = undefined;
          tenu.verification = verifiee;
        });
        tenu.enCours = lancee;
      }
      await tenu.enCours;
      return parcours(projet);
    },

    // Écrit le démarrage dans un shell de l'espace, sans l'envoyer — ou dit pourquoi
    // rien n'est écrit : tant qu'`installation` ne dit pas le projet prêt, rien ne l'est.
    demarrer(projet: Projet): Terminal | { refus: string } {
      const refus = sansTerminal(projet) ?? parcours(projet)?.demarrerRefuse;
      if (refus !== undefined) return { refus };
      const demarrage = commandeDeDemarrage(projet);
      return "refus" in demarrage ? demarrage : options.shell(projet, demarrage.commande);
    },

    // Le projet a quitté la liste : rien n'est gardé de sa mise en service.
    oublier(nom: string): void {
      tenus.delete(nom);
    },
  };
}
