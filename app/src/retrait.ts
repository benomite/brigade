// Retirer un projet : deux gestes, qui ne se confondent jamais.
//
// « Retirer de l'app » enlève sa ligne du fichier des projets — donc de la barre —, et
// rien d'autre : rien ne part vers sa box, où il reste installé, son journal intact.
//
// « Désinstaller de la box » lance à la place du chef le geste de désinstallation de la
// box (`sudo brigade-installer uninstall …`, runtime/deploy/brigade-installer), par
// `ssh`, en deux temps. Le plan d'abord (`--plan`) : la box dit ce qu'elle retirerait,
// et ne retire rien. Puis l'exécution (`--confirmer <projet>`), refusée ici tant que la
// box n'a pas rendu son plan pour le même réglage, et tant que le chef n'a pas écrit le
// nom du projet. Le journal ne part que s'il a coché l'option : sans elle,
// `--supprimer-le-journal` n'est jamais envoyé.
//
// L'app n'a aucune règle de suppression : ce qui serait retiré, ce qui l'a été et ce
// qui est gardé, c'est la box qui le dit, et ses phrases sont montrées mot pour mot. De
// son objet, l'app ne lit que deux choses : que c'est la réponse à ce qu'elle a demandé,
// et où est le journal — gardé, ou retiré.
//
// Désinstallé, un projet reste dans l'app — l'en retirer est l'autre geste —, mais n'y
// est plus pilotable : elle le montre sans sa box, ne lit plus rien d'elle, et le dit.
// Rien n'est gardé d'un lancement de l'app à l'autre : relancée, elle relit la box, qui
// dit elle-même ne plus connaître le projet.
import { execFile, type ExecFileException } from "node:child_process";
import { cite, type Reglages, type Servi } from "./box.ts";
import type { Projet } from "./config.ts";
import { GESTE, objetDuGeste } from "./installation.ts";

// Les deux gestes, par le libellé qui les sépare — et celui du plan, qui ne retire rien.
export const RETIRER = "Retirer de l'app";
export const DESINSTALLER = "Désinstaller de la box";
export const PLANIFIER = "Voir ce que la box retirerait";
const DOC = "docs/installer.md";
// Ce que `ssh` a pour répondre. Le plan inventorie le clone du projet ; l'exécution
// arrête son runtime et retire, journal compris s'il est demandé (runtime/src/desinstallateur.ts).
export const DELAIS = { planMs: 180_000, executionMs: 900_000 } as const;
// Le code d'une désinstallation commencée qui s'est arrêtée en chemin (runtime/deploy/brigade-installer).
const INACHEVEE = 79;

// Ce qui est demandé à la box : son plan, ou la désinstallation, confirmée par le nom du projet.
// `journal` : l'option que le chef a cochée — fausse, `--supprimer-le-journal` ne part pas.
export type Demande = { plan: true; journal: boolean } | { plan: false; confirmation: string; journal: boolean };

// Ce que le geste reçoit, argument par argument. Aucun chemin : il compose lui-même ce qu'il retire.
export function argumentsDuRetrait(nom: string, demande: Demande): string[] {
  return ["uninstall", nom, ...(demande.plan ? ["--plan"] : ["--confirmer", demande.confirmation]), ...(demande.journal ? ["--supprimer-le-journal"] : [])];
}

// La ligne que `ssh` porte à la box. `sudo -n` : sans terminal, il échoue plutôt que
// d'attendre un mot de passe.
export const gesteDeRetrait = (nom: string, demande: Demande) => `sudo -n ${GESTE} ${argumentsDuRetrait(nom, demande).map(cite).join(" ")}`;

// Où la box dit le journal du projet : là où elle le garde, ou là d'où elle le retire.
export type Journal = { garde: string | null; retire: string | null };
// `plan`, `desinstalle` : le geste a rendu `ok` pour ce qui lui était demandé. `refuse` :
// il a répondu, et dit non — son code, et sa phrase dans `obtenu`. `injoignable` : `ssh`
// a échoué de lui-même (255), ou n'a pas pu être lancé — session jamais ouverte, ou perdue
// en route : son code ne les sépare pas. `geste-absent` : la box a été jointe, et ce n'est
// pas la réponse du geste à cette demande. `sans-reponse` : `ssh` a été arrêté au délai.
// `obtenu` : ce que l'app a reçu, tel quel.
export type Rendu =
  | { etat: "plan" | "desinstalle"; journal: Journal; obtenu: string }
  | { etat: "refuse"; motif: string; code: number | null; obtenu: string }
  | { etat: "injoignable" | "geste-absent" | "sans-reponse"; obtenu: string };

const texte = (recu: unknown) => (typeof recu === "string" ? recu.trim() : "");
const chemin = (lu: unknown) => (typeof lu === "string" && lu !== "" ? lu : null);

// Lance le geste de désinstallation sur la box du projet, et dit ce qu'il en est advenu.
// Jamais d'exception : tout ce qui arrive est un rendu.
export function lancerRetrait(reglages: Reglages, { nom, box }: Servi, demande: Demande): Promise<Rendu> {
  // Comme la veille : sans terminal, `ssh` ne peut rien demander.
  const args = ["-o", "BatchMode=yes", "-o", `ConnectTimeout=${reglages.connexionS}`, "--", box.hote, gesteDeRetrait(nom, demande)];
  const attendu = demande.plan ? "plan" : "desinstalle";
  const lance = `$ ${reglages.ssh} ${args.join(" ")}`;
  return new Promise((resoudre) => {
    const rendre = (erreur: ExecFileException | null, sortie: string, erreurs: string) => {
      const code = erreur === null ? 0 : typeof erreur.code === "number" ? erreur.code : null;
      const arrete = erreur?.killed === true;
      const suite = arrete ? `aucune réponse en ${(reglages.delaiMs / 1000).toLocaleString("fr-FR")} s : ssh arrêté` : code !== null ? `code de sortie ${code}` : (erreur?.message ?? "");
      const objet = objetDuGeste(sortie);
      // Un `ok` ne vaut que s'il répond à cette demande : une désinstallation, de ce projet, à ce temps-là.
      if (objet?.ok === true && objet.action === "uninstall" && objet.projet === nom && objet.fait === attendu) {
        const { retire, garde } = objet as { retire?: { journal?: unknown } | null; garde?: { journal?: unknown } | null };
        // Ce que le geste dit à un humain est sur sa sortie d'erreur : c'est ce qui se lit. Son objet le redit, pour l'app.
        return resoudre({ etat: attendu, journal: { garde: chemin(garde?.journal), retire: chemin(retire?.journal) }, obtenu: `${lance}\n${erreurs.trim() || sortie.trim()}\n\n→ ${suite}` });
      }
      if (objet?.ok === false) {
        return resoudre({ etat: "refuse", motif: texte(objet.motif) || "sans motif", code, obtenu: `${lance}\n${erreurs.trim() || `brigade-installer : ${texte(objet.message)}`}\n\n→ ${suite}` });
      }
      const obtenu = `${lance}\n${erreurs}${sortie}\n→ ${suite}`;
      if (arrete) return resoudre({ etat: "sans-reponse", obtenu });
      // 255 est le code de `ssh` ; sans code, il n'a pas pu être lancé — sauf une sortie
      // trop longue pour être gardée, qui vient bien de la box.
      const jointe = code === null ? erreur?.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER" : code !== 255;
      resoudre({ etat: jointe ? "geste-absent" : "injoignable", obtenu });
    };
    try {
      execFile(reglages.ssh, args, { timeout: reglages.delaiMs, maxBuffer: 16 * 1024 * 1024 }, rendre);
    } catch (erreur) {
      // Un argument que le système refuse — un nom qui porte un caractère nul — : `ssh` n'est pas lancé, et rien n'est parti.
      resoudre({ etat: "injoignable", obtenu: `${lance}\n→ ${erreur instanceof Error ? erreur.message : String(erreur)}` });
    }
  });
}

// Ce que la vue pose d'une demande faite à la box : son titre, ce que l'app a obtenu, ce
// qu'elle en dit. `pas-parti` : rien n'est parti vers la box, et `suite` dit pourquoi.
// `inachevee` : la désinstallation avait commencé, et la box dit où elle s'est arrêtée.
export type Montre =
  | { etat: "en-cours"; titre: string }
  | { etat: "pas-parti"; titre: string; suite: string[] }
  | { etat: Rendu["etat"] | "inachevee"; a: string; titre: string; obtenu: string; suite: string[] };

// Le geste de box d'un projet, prêt à poser : la vue n'y décide rien.
// `journal.refus`, `planifierRefuse`, `desinstallerRefuse` : pourquoi la case ou le bouton
// est inactif — absent, il se clique.
export type Desinstallation = {
  hote: string;
  journal: { coche: boolean; libelle: string; avertissement: string[]; refus?: string };
  planifier: string;
  planifierRefuse?: string;
  plan?: Montre;
  consigne: string;
  desinstallerRefuse?: string;
  issue?: Montre;
};

// Ce que le panneau montre pour retirer un projet : ses deux gestes, chacun sous son
// libellé, avec ce qu'il fait et ce qu'il ne fait pas. `geste` : absent pour un projet
// sans box — il n'y a rien à y désinstaller, et `lignes` le dit.
export type Retrait = {
  projet: string;
  titre: string;
  retirer: { libelle: string; lignes: string[] };
  desinstaller: { libelle: string; lignes: string[]; geste?: Desinstallation };
};

// Ce que l'app dit d'un projet qu'elle vient de retirer de sa liste.
export type Avis = { titre: string; lignes: string[] };

type Lue = { a: string; rendu: Rendu };
type Tenu = {
  hote: string;
  journal: boolean;
  // Ce que la box a rendu de son plan, pour ce réglage : seul un plan rendu ouvre la désinstallation.
  plan?: Lue;
  planEnCours?: Promise<void>;
  // Ce qu'il est advenu de la dernière désinstallation demandée — ou pourquoi rien n'est parti.
  issue?: Lue | { pasParti: string };
  enCours?: Promise<void>;
  // `journal` : nul quand une désinstallation rejouée depuis n'a pas abouti — l'app ne sait plus où il en est.
  desinstalle?: { a: string; journal: Journal | null };
};

// Une désinstallation commencée, qui s'est arrêtée en chemin : son code — ou son motif, si le code s'est perdu.
const inachevee = (rendu: Extract<Rendu, { etat: "refuse" }>) => rendu.code === INACHEVEE || rendu.motif === "echec";

// Ce que la box dit du journal, redit en une phrase : avant, puis après.
function duJournal(journal: Journal | null, fait: boolean): string {
  if (journal === null) return "L'app ne sait plus où en est son journal : une désinstallation rejouée depuis n'a pas abouti — le plan de la box dira ce qu'il en reste.";
  const { garde, retire } = journal;
  if (retire !== null) return fait ? `Le journal du projet a été supprimé avec son état (${retire}) : c'est sans retour.` : `Le journal est dans ce que la box retirerait (${retire}) : sa suppression est sans retour.`;
  if (garde !== null) return fait ? `Le journal du projet existe encore sur la box : ${garde}. La désinstallation ne l'a pas supprimé.` : `Le journal n'est pas dans ce que la box retirerait : elle le garde (${garde}).`;
  return `La box ne nomme aucun journal pour ce projet : ni gardé, ni ${fait ? "retiré" : "à retirer"}.`;
}

// Ce que l'app dit d'un refus du geste, selon son code (runtime/deploy/brigade-installer).
// La phrase de la box est au-dessus, mot pour mot : elle n'est pas redite.
function suiteDuRefus(code: number | null): string[] {
  if (code === 64) return ["Ce que la box refuse est nommé ci-dessus : elle n'a rien retiré."];
  if (code === 65) return [`La box ne connaît pas ce projet : il n'y a rien à y désinstaller. S'il ne doit plus figurer dans l'app, c'est l'autre geste : « ${RETIRER} ».`];
  if (code === 75) return ["Un autre geste d'installation est en cours sur cette box : rejoue quand il a fini."];
  if (code === 76 || code === 77) return [`La box n'est pas prête pour ce geste, et l'app ne la prépare pas : ce qui lui manque se pose sur elle, par quelqu'un qui y a \`sudo\` — ${DOC}, « Préparer la box ».`];
  if (code === 81) return ["La box est retenue par ce que la désinstallation emporterait : elle le nomme ci-dessus. Règle-le sur elle, puis rejoue."];
  return [];
}

// Ce qu'une demande faite à la box donne à voir. `execution` : c'est la désinstallation, pas son plan.
// `deja` : le projet était déjà dit désinstallé — une désinstallation rejouée qui n'aboutit pas ne l'en dédit pas.
function montrer({ nom, box: { hote } }: Servi, { a, rendu }: Lue, execution: boolean, deja: boolean): Montre {
  const { obtenu } = rendu;
  const redemander = "Redemande son plan à la box : il dira ce qui reste du projet sur elle.";
  const pasDit = deja ? "Ce projet reste dit désinstallé — il l'était déjà : c'est ce qui restait de lui sur la box qui est en doute." : "L'app ne dit pas ce projet désinstallé : ce que sa box en dit se lit toujours, à côté.";
  const ssh = [
    `Ce que chacune des phrases de \`ssh\` veut dire, et le geste qui y répond : ${DOC}, « Joindre la box ».`,
    `S'il dit ta clé refusée (\`Permission denied\`), la box répond et c'est l'accès qui te manque : ${DOC}, « Ajouter un humain ».`,
  ];
  if (rendu.etat === "plan") {
    return {
      etat: "plan",
      a,
      titre: `CE QUE LA BOX « ${hote} » RETIRERAIT — rien n'est retiré`,
      obtenu,
      suite: ["C'est le plan de la box, tel qu'elle l'a rendu : l'app n'y ajoute rien, et n'en décide rien.", duJournal(rendu.journal, false), `Pour le faire : écris le nom du projet ci-dessous, puis « ${DESINSTALLER} ».`],
    };
  }
  if (rendu.etat === "desinstalle") {
    return {
      etat: "desinstalle",
      a,
      titre: `DÉSINSTALLÉ DE LA BOX « ${hote} »`,
      obtenu,
      suite: [
        "Ce que la box a retiré, et ce qu'elle garde, est ci-dessus, tel qu'elle l'a dit.",
        duJournal(rendu.journal, true),
        `« ${nom} » n'est plus pilotable depuis l'app : elle ne lit plus sa box, et n'y écrit plus rien.`,
        `Il est toujours dans l'app : « ${RETIRER} » l'en retire — c'est l'autre geste.`,
        ...(rendu.journal.garde === null ? [] : ["Pour supprimer aussi son journal, la désinstallation se rejoue avec l'option cochée : le plan d'abord, puis la confirmation."]),
      ],
    };
  }
  if (rendu.etat === "refuse") {
    if (execution && inachevee(rendu)) {
      return {
        etat: "inachevee",
        a,
        titre: `LA DÉSINSTALLATION S'EST ARRÊTÉE EN CHEMIN SUR LA BOX « ${hote} »`,
        obtenu,
        suite: ["La box dit ci-dessus ce qui est fait, et ce qui reste.", "La désinstallation se rejoue — redemande son plan à la box : il dira ce qui reste à retirer.", pasDit],
      };
    }
    return { etat: "refuse", a, titre: `LA BOX « ${hote} » A REFUSÉ (${rendu.motif}) — rien n'est retiré`, obtenu, suite: suiteDuRefus(rendu.code) };
  }
  if (rendu.etat === "injoignable") {
    // Un plan ne retire rien, joint ou pas. Une désinstallation, elle, a pu commencer avant que `ssh` ne perde sa session.
    if (!execution) {
      return { etat: "injoignable", a, titre: `LA BOX « ${hote} » N'A PAS ÉTÉ JOINTE — rien n'est retiré`, obtenu, suite: ["`ssh` n'a pas rendu le plan de la box, et il a dit pourquoi : son message est ci-dessus, l'app ne le lit pas.", ...ssh] };
    }
    return {
      etat: "injoignable",
      a,
      titre: `\`ssh\` A ÉCHOUÉ SANS LA RÉPONSE DE LA BOX « ${hote} »`,
      obtenu,
      suite: [
        "`ssh` est sorti en erreur, et son message est ci-dessus : l'app ne le lit pas. S'il n'a pas ouvert de session, rien n'est parti vers la box ; s'il l'a perdue en route, la désinstallation avait pu commencer.",
        `L'app ne sait donc pas ce que la box a fait. ${pasDit}`,
        redemander,
        ...ssh,
      ],
    };
  }
  if (rendu.etat === "geste-absent") {
    return {
      etat: "geste-absent",
      a,
      titre: `LA BOX « ${hote} » A ÉTÉ JOINTE, ET SON GESTE N'A PAS RENDU ${execution ? "SA RÉPONSE" : "SON PLAN"}`,
      obtenu,
      suite: [
        "Ce que la box a rendu est ci-dessus, tel quel. Le cas attendu : `brigade-installer` n'y est pas posé — ou pas dans une version qui désinstalle —, ou sa règle sudoers ne le donne pas à ton compte.",
        `L'app ne prépare pas une box. Ce geste se pose sur elle, une fois, par quelqu'un qui y a \`sudo\` : ${DOC}, « Préparer la box » — « Le geste d'installation ».`,
        ...(execution ? [`L'app ne sait pas ce que la box a fait. ${pasDit}`, redemander] : []),
      ],
    };
  }
  return {
    etat: "sans-reponse",
    a,
    titre: `LA BOX « ${hote} » N'A PAS FINI DE RÉPONDRE`,
    obtenu,
    suite: execution
      ? ["`ssh` a été arrêté au délai, sans que la box ait rendu sa réponse : l'app ne sait pas où la box en était.", pasDit, redemander]
      : ["`ssh` a été arrêté au délai, sans que la box ait rendu son plan. Un plan ne retire rien : redemande-le."],
  };
}

const minutes = (ms: number) => Math.round(ms / 60_000);

export type Retraits = ReturnType<typeof tenirRetraits>;

// Les retraits, tenus tant que l'app est ouverte. Ce par quoi ils passent leur est
// donné : le fichier des projets, pour le premier geste ; la box, pour le second.
export function tenirRetraits(options: {
  // Le fichier des projets : le premier geste n'écrit que là.
  chemin: string;
  // Retire le projet de ce fichier, et rien d'autre. Rend la raison, s'il ne l'a pas été.
  retirer(nom: string): string | undefined;
  // Les box que l'écran d'ajout propose, telles que le fichier les donne maintenant.
  boxes(): readonly string[];
  // Lance le geste de désinstallation sur la box du projet : son plan, ou l'exécution.
  lancer(servi: Servi, demande: Demande): Promise<Rendu>;
  // La box vient de dire le projet désinstallé — ou ce que l'app en disait a changé : il se
  // montre sans elle, tel que `vu` le rend maintenant.
  surDesinstalle(nom: string): void;
}) {
  const tenus = new Map<string, Tenu>();

  // Le retrait d'un projet sur sa box d'aujourd'hui : un plan obtenu d'une autre ne vaut rien ici.
  function tenir(nom: string, hote: string): Tenu {
    const tenu = tenus.get(nom);
    if (tenu !== undefined && tenu.hote === hote) return tenu;
    // Rien n'est coché d'avance : le journal survit, sauf demande.
    const neuf: Tenu = { hote, journal: false };
    tenus.set(nom, neuf);
    return neuf;
  }

  // Ce que l'app tient de désinstallé pour ce projet, sur la box que le fichier lui donne.
  function desinstalle(projet: Projet): Tenu["desinstalle"] {
    const tenu = tenus.get(projet.nom);
    return projet.box !== undefined && tenu?.hote === projet.box.hote ? tenu.desinstalle : undefined;
  }

  const enleve = (nom: string) => `« ${RETIRER} » enlève « ${nom} » de la barre et de ${options.chemin} — rien d'autre.`;
  const RESTE = "Ses terminaux ouverts ici sont arrêtés ; son dossier sur ce poste n'est pas touché.";

  function etat(projet: Projet): Retrait {
    const { nom, box } = projet;
    if (box !== undefined) return poser({ nom, box }, tenir(nom, box.hote));
    return {
      projet: nom,
      titre: "Retirer ce projet de l'app",
      retirer: { libelle: RETIRER, lignes: [enleve(nom), "Il n'a pas de box : il n'y a rien d'autre à retirer.", RESTE] },
      desinstaller: { libelle: DESINSTALLER, lignes: [`« ${nom} » ne dit pas où est sa box : l'app n'a rien à y désinstaller.`] },
    };
  }

  // Les deux gestes d'un projet servi par une box, d'après ce qui est tenu de lui. Rien n'y
  // est pris ni posé : une réponse arrivée après que le projet a changé de box, ou quitté la
  // liste, se pose d'après ce qui était tenu quand elle est partie.
  function poser(servi: Servi, tenu: Tenu): Retrait {
    const { nom, box } = servi;
    const { hote } = box;
    const parti = tenu.desinstalle;
    const { journal, plan, planEnCours, issue, enCours } = tenu;
    const occupee = "La désinstallation est en cours : la box répond d'elle-même.";
    const sansPlan = `Pas de désinstallation : la box n'a pas encore dit ce qu'elle retirerait${journal ? ", journal compris" : ""} — « ${PLANIFIER} » lui demande son plan, et ne retire rien.`;
    const planifierRefuse = enCours !== undefined ? occupee : planEnCours !== undefined ? "Le plan est demandé : la box répond d'elle-même." : undefined;
    const desinstallerRefuse = enCours !== undefined ? occupee : planEnCours !== undefined || plan?.rendu.etat !== "plan" ? sansPlan : undefined;
    const planMontre: Montre | undefined =
      planEnCours !== undefined
        ? { etat: "en-cours", titre: `plan demandé à la box… elle inventorie ce que le projet y a : quelques secondes, ${minutes(DELAIS.planMs)} minutes au plus` }
        : plan === undefined
          ? undefined
          : montrer(servi, plan, false, parti !== undefined);
    const issueMontree: Montre | undefined =
      enCours !== undefined
        ? { etat: "en-cours", titre: `désinstallation en cours sur la box… elle arrête le runtime du projet, puis retire ce que son plan disait : ${minutes(DELAIS.executionMs)} minutes au plus` }
        : issue === undefined
          ? undefined
          : "pasParti" in issue
            ? { etat: "pas-parti", titre: "RIEN N'EST PARTI VERS LA BOX — rien n'est retiré", suite: [issue.pasParti] }
            : montrer(servi, issue, true, parti !== undefined);
    return {
      projet: nom,
      titre: parti === undefined ? "Retirer ce projet — de l'app, ou de sa box : deux gestes" : "Retirer ce projet — désinstallé de sa box, encore dans l'app",
      retirer: {
        libelle: RETIRER,
        lignes: [
          enleve(nom),
          parti === undefined
            ? `Rien n'est envoyé à la box « ${hote} » : le projet y reste installé — et servi, s'il l'est —, son journal intact.`
            : `Il est désinstallé de la box « ${hote} » : le retirer de l'app est ce qu'il reste à faire, s'il ne doit plus y figurer.`,
          RESTE,
        ],
      },
      desinstaller: {
        libelle: DESINSTALLER,
        lignes: [
          parti === undefined
            ? `« ${DESINSTALLER} » retire « ${nom} » de la box « ${hote} », par son geste de désinstallation (\`sudo brigade-installer uninstall ${cite(nom)}\`), que l'app lance à ta place. Ce qui est retiré, c'est la box qui le décide et qui le dit : l'app n'en a aucune règle.`
            : `Il est désinstallé de la box « ${hote} » : elle dit ci-dessous ce qu'elle a retiré. Le geste se rejoue — pour supprimer aussi son journal, s'il est gardé —, par le même chemin.`,
          "En deux temps : la box dit d'abord son plan, sans rien retirer ; puis rien n'est retiré tant que tu n'as pas confirmé en écrivant le nom du projet.",
          "Il reste dans l'app : l'en retirer est l'autre geste.",
        ],
        geste: {
          hote,
          journal: {
            coche: journal,
            libelle: "Supprimer aussi le journal du projet sur la box",
            avertissement: [
              "Décochée — c'est le défaut : l'app ne demande pas la suppression du journal, et le plan de la box dit où il reste.",
              "Cochée : l'app ajoute `--supprimer-le-journal` au geste. Le journal est l'histoire de la cuisine, et sa suppression est sans retour : le plan de la box dit ce qui part avec lui — relis-le avant de confirmer.",
              "Changer cette case lâche le plan déjà rendu : il ne vaut que pour le réglage avec lequel il a été demandé.",
            ],
            ...(enCours === undefined ? {} : { refus: "La désinstallation est en cours : son réglage ne change plus." }),
          },
          planifier: PLANIFIER,
          ...(planifierRefuse === undefined ? {} : { planifierRefuse }),
          ...(planMontre === undefined ? {} : { plan: planMontre }),
          consigne: `Pour confirmer, écris le nom du projet — ${nom} :`,
          ...(desinstallerRefuse === undefined ? {} : { desinstallerRefuse }),
          ...(issueMontree === undefined ? {} : { issue: issueMontree }),
        },
      },
    };
  }

  return {
    // Les deux gestes d'un projet, tels que le panneau les pose.
    etat,

    // Le projet tel que l'app le montre : celui qu'elle a désinstallé de sa box n'en a plus
    // — rien n'y est lu, rien n'y est écrit —, et dit pourquoi à la place.
    vu(projet: Projet): Projet {
      const parti = desinstalle(projet);
      if (parti === undefined || projet.box === undefined) return projet;
      const { box, ...sansBox } = projet;
      return {
        ...sansBox,
        desinstalle: {
          hote: box.hote,
          a: parti.a,
          titre: `DÉSINSTALLÉ DE LA BOX « ${box.hote} » — plus pilotable depuis l'app`,
          lignes: [
            `L'app a désinstallé « ${projet.nom} » de la box « ${box.hote} » : il ne se pilote plus d'ici. L'app ne lit plus sa box, et n'y écrit plus rien.`,
            duJournal(parti.journal, true),
            "Ce que la box a retiré, mot pour mot, est dans son espace, sous « Retirer ce projet ».",
            `Il est toujours dans l'app : « ${RETIRER} », au même endroit, l'en retire — c'est l'autre geste.`,
            "Pour le servir de nouveau : retire-le de l'app, puis ajoute-le — l'ajout l'installe sur sa box.",
            "Rien de ceci n'est gardé d'un lancement de l'app à l'autre : relancée, elle relit la box, qui dira elle-même ne plus connaître ce projet.",
          ],
        },
      };
    },

    // Le premier geste : le projet quitte le fichier des projets, et rien d'autre n'a
    // lieu — rien n'est demandé à sa box. Rend l'avis à montrer, ou pourquoi il n'est pas retiré.
    retirerDeLApp(projet: Projet): { avis: Avis } | { refus: string } {
      const { nom, box } = projet;
      const parti = desinstalle(projet);
      // Retiré maintenant, il n'aurait plus d'espace où lire ce que la box répond de sa désinstallation.
      const tenu = tenus.get(nom);
      if (box !== undefined && tenu?.hote === box.hote && tenu.enCours !== undefined) {
        return { refus: `Pas retiré — sa désinstallation de la box « ${box.hote} » est en cours : attends ce que la box en dit, il se retire de l'app ensuite.` };
      }
      const refus = options.retirer(nom);
      if (refus !== undefined) return { refus: `Pas retiré — ${refus}` };
      tenus.delete(nom);
      const lignes =
        box === undefined
          ? ["Il n'avait pas de box : il n'y avait rien d'autre à retirer."]
          : [
              ...(parti === undefined
                ? [
                    `Rien n'a été envoyé à la box « ${box.hote} » : le projet y est toujours installé, et son journal n'a pas été touché.`,
                    `Le désinstaller de la box est un autre geste : déclare-le de nouveau dans l'app — le « + », qui le trouvera déjà installé et proposera de le déclarer tel qu'il est —, puis « ${DESINSTALLER} ». Ou sur la box, à la main (${DOC}, « Désinstaller »).`,
                  ]
                : [`Il avait été désinstallé de la box « ${box.hote} » : il n'y reste que ce qu'elle a dit garder.`]),
              ...(options.boxes().includes(box.hote) ? [] : [`La box « ${box.hote} » n'était nommée que par ce projet : elle n'est plus proposée à l'ajout — elle s'y déclare de nouveau, d'un mot.`]),
            ];
      return { avis: { titre: `« ${nom} » est retiré de l'app.`, lignes } };
    },

    // Le chef coche l'option qui supprime le journal, ou la décoche : le plan rendu pour
    // l'autre réglage ne vaut plus, et celui qui est en route n'est plus à personne.
    direJournal(projet: Projet, coche: boolean): Retrait {
      if (projet.box === undefined) return etat(projet);
      const tenu = tenir(projet.nom, projet.box.hote);
      if (tenu.enCours === undefined && tenu.journal !== coche) {
        tenu.journal = coche;
        tenu.plan = undefined;
        tenu.planEnCours = undefined;
      }
      return etat(projet);
    },

    // Demande son plan à la box, et rend le retrait tel qu'il en sort. Rien n'est retiré.
    // Un plan en route ne se double pas, et celui d'avant ne vaut plus dès qu'il part.
    async planifier(projet: Projet): Promise<Retrait> {
      if (projet.box === undefined) return etat(projet);
      const { nom, box } = projet;
      const tenu = tenir(nom, box.hote);
      if (tenu.enCours !== undefined) return etat(projet);
      if (tenu.planEnCours === undefined) {
        tenu.plan = undefined;
        const lancee = options.lancer({ nom, box }, { plan: true, journal: tenu.journal }).then((rendu) => {
          // La case a changé, ou le projet a quitté la liste : ce plan n'est plus à personne.
          if (tenu.planEnCours !== lancee) return;
          tenu.planEnCours = undefined;
          tenu.plan = { a: new Date().toISOString(), rendu };
        });
        tenu.planEnCours = lancee;
      }
      await tenu.planEnCours;
      return poser({ nom, box }, tenu);
    },

    // Le second geste : la désinstallation, sur la box. Refusée — rien ne part — tant que
    // la box n'a pas rendu son plan pour ce réglage, et tant que `saisi` n'est pas le nom
    // du projet. Une désinstallation en route ne se double pas.
    async desinstaller(projet: Projet, saisi: unknown): Promise<Retrait> {
      if (projet.box === undefined) return etat(projet);
      const { nom, box } = projet;
      const tenu = tenir(nom, box.hote);
      if (tenu.enCours === undefined) {
        const pasParti = (raison: string) => {
          tenu.issue = { pasParti: raison };
          return etat(projet);
        };
        if (tenu.planEnCours !== undefined || tenu.plan?.rendu.etat !== "plan") return pasParti(`La box n'a pas encore dit ce qu'elle retirerait : « ${PLANIFIER} » d'abord — la désinstallation ne part pas sans son plan.`);
        const confirmation = texte(saisi);
        if (confirmation === "") return pasParti(`Tu n'as pas écrit le nom du projet : désinstaller « ${nom} » se confirme en l'écrivant.`);
        if (confirmation !== nom) return pasParti(`Tu as écrit « ${confirmation} », et le projet s'appelle « ${nom} » : la désinstallation se confirme par son nom, au caractère près.`);
        tenu.issue = undefined;
        const lancee = options.lancer({ nom, box }, { plan: false, confirmation, journal: tenu.journal }).then((rendu) => {
          // Le projet a quitté la liste, ou changé de box : cette réponse n'est plus à personne.
          if (tenu.enCours !== lancee || tenus.get(nom) !== tenu) return;
          tenu.enCours = undefined;
          const a = new Date().toISOString();
          tenu.issue = { a, rendu };
          // Le plan ne vaut encore que si la box a répondu, et refusé avant son premier geste :
          // tout le reste — elle a retiré, commencé, ou n'a rien dit — en redemande un.
          const sansEffet = rendu.etat === "refuse" && !inachevee(rendu);
          if (!sansEffet) tenu.plan = undefined;
          if (rendu.etat === "desinstalle") {
            tenu.desinstalle = { a, journal: rendu.journal };
            options.surDesinstalle(nom);
          } else if (!sansEffet && tenu.desinstalle !== undefined) {
            // Rejouée sur un projet déjà désinstallé, sans aboutir : il le reste, et son journal n'est plus su.
            tenu.desinstalle = { ...tenu.desinstalle, journal: null };
            options.surDesinstalle(nom);
          }
        });
        tenu.enCours = lancee;
      }
      await tenu.enCours;
      return poser({ nom, box }, tenu);
    },

    // Le projet a quitté la liste : rien n'est gardé de son retrait.
    oublier(nom: string): void {
      tenus.delete(nom);
    },
  };
}
