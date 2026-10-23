// L'adaptateur moteur de la station : ce qu'il faut pour lancer le binaire
// `claude` officiel sur un ticket, et pour lire dans son flux comment le cook a
// fini. Rien d'autre que le binaire : ni SDK, ni API, ni lecture des
// identifiants — c'est `claude` qui porte la connexion Max de la machine, ou le
// jeton longue durée que `claude setup-token` a créé pour elle (`jeton-claude.ts`).
import { execFile } from "./sans-invite.ts";
import type { Calibrage } from "./calibrage.ts";
import type { FinDeCook } from "./events/station.ts";
import { blocDesLecons, type LeconRecue } from "./apprentissage/injection.ts";
import { blocDuCarnet, type CarnetRecu } from "./profils/preference.ts";
import { CONSIGNE_DE_RETRO } from "./apprentissage/retro.ts";
import { CONSIGNE_DE_FIN_DE_TOUR, CONSIGNE_DU_LIVRABLE } from "./livrable.ts";

// Ce qu'un cook ne doit pas faire lui-même : seule la pass merge, et c'est la
// station qui pousse. Garde-fou de bonne foi, pas une clôture — la clôture est
// qu'il ne reçoit aucun jeton GitHub, et que la protection de branche du dépôt
// ne laisse merger que l'identité de la pass (voir `identites.ts`).
const INTERDITS = ["Bash(gh pr merge:*)", "Bash(git push:*)", "Bash(git merge:*)"];

// Les variables par lesquelles `claude` facturerait la cuisine au jeton, hors
// du forfait Max : le runtime refuse de démarrer si l'une existe.
export const VARIABLES_DE_CLE = ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN"];

// Celles qu'aucun lancement n'hérite — ni du runtime, ni d'un setup : les clés,
// et le jeton de la connexion Max, que seul `jeton-claude.ts` remet, et aux
// seuls `claude`.
export const VARIABLES_DE_JETON = [...VARIABLES_DE_CLE, "CLAUDE_CODE_OAUTH_TOKEN"];

// Les sources de réglages qu'un cook charge, parmi `user`, `project` et
// `local` : aucune au jalon 1. Sans cette liste, `claude` les charge toutes, et
// le cook hérite du compte qui fait tourner le service — ses plugins, leurs
// skills, leurs hooks — sans que rien ici ne les nomme. `project` n'y est pas
// non plus : les réglages du dépôt servi peuvent activer un plugin installé
// sous le compte, et portent des hooks écrits pour une session tenue par
// quelqu'un. Avec `project` part aussi le chargement d'office du `CLAUDE.md` :
// c'est la consigne qui envoie le cook le lire.
export const SOURCES_DE_REGLAGES: string[] = [];

// Il n'y a pas de calibrage par défaut : qui lance fournit modèle et effort.
// `--disallowedTools` vient en dernier, il avale tout ce qui le suit.
// `session` : celle que ce lancement reprend — le cook d'un renvoi repart de
// la conversation du cook précédent (`reprise-de-session.ts`). Elle est
// bifurquée : le lancement écrit la sienne, sous un identifiant neuf, et celle
// du cook précédent reste telle qu'il l'a laissée.
export function argumentsClaude(texte: string, calibrage: Calibrage, session?: string): string[] {
  return [
    "-p",
    texte,
    "--output-format",
    "stream-json",
    "--verbose",
    "--model",
    calibrage.model,
    "--effort",
    calibrage.effort,
    // Personne n'est là pour répondre à une demande de permission.
    "--permission-mode",
    "bypassPermissions",
    // Une liste vide se passe quand même : c'est elle qui coupe les sources.
    "--setting-sources",
    SOURCES_DE_REGLAGES.join(","),
    // Ce que les sources ne tiennent pas : les skills livrées avec le binaire
    // ou posées dans le répertoire du compte, et les serveurs MCP — ceux du
    // compte claude.ai compris, qui suivent la connexion Max.
    "--disable-slash-commands",
    "--strict-mcp-config",
    ...(session === undefined ? [] : ["--resume", session, "--fork-session"]),
    "--disallowedTools",
    ...INTERDITS,
  ];
}

// L'environnement d'un cook : celui du runtime, sans son état (un cook qui
// travaille sur brigade lancerait sinon un runtime sur le journal qui le fait
// tourner) et sans rien qui détourne `claude` de la connexion Max. La mémoire
// automatique est coupée : elle vit sous le compte, par dépôt, et un cook y
// lirait ce qu'un autre y a laissé.
export function environnementCook(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const garde = Object.entries(env).filter(([nom]) => !nom.startsWith("BRIGADE_") && !VARIABLES_DE_JETON.includes(nom));
  return { ...Object.fromEntries(garde), CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1" };
}

// Où le cook lit son ticket. Par `gh`, sous l'identité de la machine ; ou dans
// le fichier que la station lui remet (`remis`), quand chaque rôle a son
// identité GitHub et que le cook n'en a aucune.
export function lectureDuTicket(mission: { ticket: number; depot: string; remis?: string }): string {
  return mission.remis === undefined
    ? `\`gh issue view ${mission.ticket} --repo ${mission.depot} --comments\``
    : `le fichier \`${mission.remis}\`, où la station te l'a remis avec ses commentaires (tu n'as aucun accès à GitHub : \`gh\` ne te répondra pas)`;
}

// Le cook qui n'a pas lu son ticket sur GitHub le lit dans un fichier que le
// relecteur n'ouvre pas : son compte-rendu doit montrer qu'il l'a lu.
export function preuveDeLecture(remis: string | undefined): string {
  return remis === undefined ? "" : " Cite ou reprends dans ce compte-rendu les termes du ticket (ses critères, sa fiche) auxquels ta livraison répond, pour que le relecteur voie que tu l'as lu.";
}

// Le ticket tel que la station le remet à un cook sans accès à GitHub : ce que
// `gh issue view --comments` lui aurait montré.
export function ticketRemis(ticket: { number: number; title: string; body: string; commentaires: Array<{ author: string; association: string; body: string }> }): string {
  return [
    `# #${ticket.number} — ${ticket.title}`,
    "",
    ticket.body.trim() || "(corps vide)",
    ...ticket.commentaires.flatMap((commentaire) => ["", "---", "", `**Commentaire de ${commentaire.author || "inconnu"} (${commentaire.association})**`, "", commentaire.body.trim()]),
    "",
  ].join("\n");
}

// Le lanceur des gates que la station a posé pour le cook
// (`gates-du-cook.ts`) : nommé, la consigne lui dit de jouer les gates par lui.
// Absent — le projet n'a pas de gates, ou une station distante —, rien.
export function blocDesGates(lanceur: string | undefined): string[] {
  if (lanceur === undefined) return [];
  return [
    `Les gates du dépôt, joue-les par \`${lanceur} <ton worktree>\` plutôt que par leur script : c'est le même script, joué tel quel — même sortie, même code de sortie —, et il laisse à la station un reçu de ce qu'elles ont jugé. Si ton dernier passage vert porte exactement sur ce que tu livres — rien changé depuis, ni commité ni à commiter, et ta branche à jour de la base —, la pass ne les rejoue pas.`,
    "",
  ];
}

// Le setup du projet a échoué sur la station, et ce ticket est celui qui doit
// le réparer (`preparation-depot/`) : son cook part quand même, et reçoit ce
// qui a échoué — la phrase, et la fin de ce que le setup a dit.
export type SetupEnEchec = { phrase: string; sortie: string };

const CLOTURE = "```";

export function blocDuSetup(setup: SetupEnEchec | undefined): string[] {
  if (setup === undefined) return [];
  return [
    `Le setup du worktree (\`.claude/brigade/worktree-setup.sh\`) a échoué sur cette station : ${setup.phrase}. Ton worktree n'est donc pas préparé, et la station t'a lancé quand même : c'est ce ticket qui doit rendre le setup jouable ici. Ce qu'il a dit, à la fin :`,
    "",
    CLOTURE,
    setup.sortie.replaceAll(CLOTURE, "'''") || "(rien)",
    CLOTURE,
    "",
  ];
}

// Le profil du cook, en dur au jalon 1. `lecons` : celles du projet qu'il
// reçoit (`apprentissage/injection.ts`). `carnet` : celui du profil sous
// lequel il part, s'il en a un (`profils/preference.ts`).
export function consigne(mission: { ticket: number; titre: string; depot: string; base: string; remis?: string; setup?: SetupEnEchec; lecons?: LeconRecue[]; carnet?: CarnetRecu | null; gates?: string }): string {
  const { ticket, titre, depot, base } = mission;
  return [
    `Tu es un cook de la brigade : tu exécutes un seul ticket, le ticket #${ticket} du dépôt ${depot} — « ${titre} ».`,
    "",
    ...blocDesLecons(mission.lecons),
    ...blocDuCarnet(mission.carnet),
    ...blocDesGates(mission.gates),
    ...blocDuSetup(mission.setup),
    `1. Lis le ticket en entier : ${lectureDuTicket(mission)}.`,
    `2. Tu es dans un worktree qui t'est propre, sur une branche neuve partie de \`${base}\`. Travaille ici et nulle part ailleurs. Les conventions du dépôt ne te sont pas chargées d'office : lis son \`CLAUDE.md\`, s'il en a un à la racine, avant d'écrire quoi que ce soit, et suis-le.`,
    "3. Vérifie ton travail comme le dépôt le demande (tests, gates), puis commite-le sur cette branche.",
    "4. Si le ticket porte une fiche (un commentaire « Fiche du ticket »), sa ligne `zone` nomme les fichiers et dossiers qu'il possède. N'écris ailleurs que si le ticket l'exige, et dis-le dans ton compte-rendu : tout fichier livré hors de la zone est signalé au chef. Tu ne modifies pas la fiche.",
    "5. Tu ne pousses rien, tu n'ouvres pas de PR, tu ne merges jamais et tu ne commentes pas le ticket : la station s'en charge quand tu as fini.",
    `6. Termine par ton compte-rendu, en clair : ce que tu as fait, ce que tu as vérifié et comment, ce qui reste à faire ou ce qui t'a bloqué.${preuveDeLecture(mission.remis)} ${CONSIGNE_DU_LIVRABLE} ${CONSIGNE_DE_RETRO}`,
    "",
    CONSIGNE_DE_FIN_DE_TOUR,
  ].join("\n");
}

// La consigne d'un cook qui reprend le travail conservé d'un autre : celui
// d'une station distante disparue en pleine cuisson — poste fermé, en veille —
// dont la branche était poussée (`travail-conserve.ts`). Il ne repart pas de
// zéro : il finit ce qui est commencé, sous les mêmes règles qu'un premier cook.
export function consigneDeSuite(mission: { ticket: number; titre: string; depot: string; base: string; branche: string; remis?: string; setup?: SetupEnEchec; lecons?: LeconRecue[]; carnet?: CarnetRecu | null; gates?: string }): string {
  const { ticket, titre, depot, base, branche } = mission;
  return [
    `Tu es un cook de la brigade : tu reprends un seul ticket, le ticket #${ticket} du dépôt ${depot} — « ${titre} ».`,
    "",
    `Un cook a commencé ce ticket sur la branche \`${branche}\`, partie de \`${base}\`, et sa station a disparu avant qu'il ne livre — son poste fermé, ou en veille. Ce qu'il avait poussé est conservé : tu es dans un worktree qui t'est propre, sur cette branche, avec ses commits. Ne repars pas de zéro : finis son travail.`,
    "",
    ...blocDesLecons(mission.lecons),
    ...blocDuCarnet(mission.carnet),
    ...blocDesGates(mission.gates),
    ...blocDuSetup(mission.setup),
    `1. Lis le ticket en entier : ${lectureDuTicket(mission)} ; puis ce qui est déjà fait : \`git log origin/${base}..HEAD\` et \`git diff origin/${base}...HEAD\`. Les conventions du dépôt ne te sont pas chargées d'office : lis son \`CLAUDE.md\`, s'il en a un à la racine, avant d'écrire quoi que ce soit, et suis-le.`,
    "2. Juge ce qui est fait et ce qui reste, puis finis le ticket sur cette branche. Ce qui est commité est un point de départ, pas une preuve : ce qui ne tient pas, corrige-le. Travaille ici et nulle part ailleurs.",
    `3. Vérifie ton travail comme le dépôt le demande (tests, gates), ta branche à jour de la base — \`git fetch origin ${base}\`, puis rebase sur \`origin/${base}\` —, puis commite-le sur cette branche.`,
    "4. Si le ticket porte une fiche (un commentaire « Fiche du ticket »), sa ligne `zone` nomme les fichiers et dossiers qu'il possède. N'écris ailleurs que si le ticket l'exige, et dis-le dans ton compte-rendu : tout fichier livré hors de la zone est signalé au chef. Tu ne modifies pas la fiche.",
    "5. Tu ne pousses rien, tu n'ouvres pas de PR, tu ne merges jamais et tu ne commentes pas le ticket : la station s'en charge quand tu as fini.",
    `6. Termine par ton compte-rendu, en clair : ce que tu as repris, ce que tu as fait, ce que tu as vérifié et comment, ce qui reste à faire ou ce qui t'a bloqué.${preuveDeLecture(mission.remis)} ${CONSIGNE_DU_LIVRABLE} ${CONSIGNE_DE_RETRO}`,
    "",
    CONSIGNE_DE_FIN_DE_TOUR,
  ].join("\n");
}

export type Lecture = {
  // L'événement `result` final : absent si le cook est mort avant de conclure.
  resultat: { erreur: boolean } | null;
  // Le dernier message du cook : son compte-rendu, ou l'erreur qui l'a arrêté.
  message: string | null;
  // Les tokens produits (`output_tokens`) par le message du fil principal qui a
  // porté ce texte : la part du cook qu'a coûtée son dernier message, rétro
  // comprise. Nul : le flux ne le dit pas.
  jetonsDuMessage: number | null;
  // Non nul : le flux dit que le quota est épuisé. `retour` : l'heure à
  // laquelle il revient, si le flux la donne.
  quota: { retour: Date | null; fenetre: string | null } | null;
  // Le flux dit que la machine n'a pas, ou plus, de session.
  deconnecte: boolean;
  // Non nul : le modèle a refusé de répondre, et la session s'est arrêtée
  // là-dessus (`stop_reason: refusal`). `categorie` : ce que l'API dit du
  // refus, si le flux le donne.
  refus: { categorie: string | null } | null;
};

type EtatQuota = { retour: Date | null; fenetre: string | null };

function etatQuota(info: unknown): EtatQuota {
  const { resetsAt, rateLimitType } = (info ?? {}) as { resetsAt?: unknown; rateLimitType?: unknown };
  return {
    // Secondes depuis l'époque.
    retour: typeof resetsAt === "number" && Number.isFinite(resetsAt) ? new Date(resetsAt * 1000) : null,
    fenetre: typeof rateLimitType === "string" ? rateLimitType : null,
  };
}

const texteDe = (contenu: unknown): string | null => {
  if (!Array.isArray(contenu)) return null;
  const textes = contenu.flatMap((bloc) => (bloc?.type === "text" && typeof bloc.text === "string" ? [bloc.text] : []));
  return textes.length === 0 ? null : textes.join("\n");
};

// Lit le flux brut d'un cook, ligne à ligne. Une ligne illisible est ignorée :
// le flux d'un process tué s'arrête n'importe où.
export function lireFlux(contenu: string): Lecture {
  const lecture: Lecture = { resultat: null, message: null, jetonsDuMessage: null, quota: null, deconnecte: false, refus: null };
  let categorie: string | null = null;
  let rejete: EtatQuota | null = null;
  let dernierEtat: EtatQuota | null = null;
  let quotaDitParErreur = false;
  // Un même message arrive en plusieurs lignes, une par bloc, qui répètent son
  // usage : seul le dernier compte.
  const produits = new Map<string, number>();
  let idDuMessage: string | null = null;
  for (const ligne of contenu.split("\n")) {
    let evenement;
    try {
      evenement = JSON.parse(ligne);
    } catch {
      continue;
    }
    if (evenement === null || typeof evenement !== "object") continue;
    if (evenement.type === "rate_limit_event") {
      dernierEtat = etatQuota(evenement.rate_limit_info);
      if (evenement.rate_limit_info?.status === "rejected") rejete = dernierEtat;
    } else if (evenement.type === "assistant") {
      // Seul le fil principal parle au nom du cook, pas ses sous-agents.
      if (evenement.parent_tool_use_id == null) {
        const sorti = evenement.message?.usage?.output_tokens;
        if (typeof evenement.message?.id === "string" && typeof sorti === "number") produits.set(evenement.message.id, sorti);
        const texte = texteDe(evenement.message?.content);
        if (texte !== null) {
          lecture.message = texte;
          idDuMessage = typeof evenement.message?.id === "string" ? evenement.message.id : null;
        }
      }
      if (evenement.error === "rate_limit") quotaDitParErreur = true;
      if (evenement.error === "authentication_failed") lecture.deconnecte = true;
      // La catégorie est celle du dernier message du fil principal : ni le
      // refus d'un sous-agent, ni un refus que la session a dépassé.
      if (evenement.parent_tool_use_id == null) {
        const details = evenement.message?.stop_details;
        categorie = details?.type === "refusal" && typeof details.category === "string" ? details.category : null;
      }
    } else if (evenement.type === "result") {
      lecture.resultat = { erreur: evenement.is_error !== false };
      // Seul le résultat tranche : un refus en cours de route, que la session
      // a surmonté, n'est pas la fin du lancement.
      lecture.refus = evenement.stop_reason === "refusal" ? { categorie } : null;
      if (typeof evenement.result === "string" && evenement.result !== "") lecture.message = evenement.result;
    }
  }
  lecture.jetonsDuMessage = idDuMessage === null ? null : (produits.get(idDuMessage) ?? null);
  if (rejete) lecture.quota = rejete;
  else if (quotaDitParErreur) lecture.quota = dernierEtat ?? { retour: null, fenetre: null };
  return lecture;
}

// La fin d'un cook que rien n'a arrêté. `subtype` n'entre pas en compte : il
// vaut « success » même quand la session n'a jamais pu parler au modèle, ou
// que le modèle a refusé de répondre.
export function verdict(lecture: Lecture, code: number | null): FinDeCook {
  if (lecture.deconnecte) return "disconnected";
  // Avant « done » : un refus ne livre rien, quoi qu'en disent `is_error` et
  // le code de sortie.
  if (lecture.refus) return "refused";
  if (code === 0 && lecture.resultat !== null && !lecture.resultat.erreur) return "done";
  if (lecture.quota) return "86";
  return "failed";
}

// Combien de refus d'affilée un même lancement — le cook d'un ticket, la
// relecture d'une livraison, un jugement du manager — essuie avant de remonter
// au chef : un refus ne tient pas toujours à la consigne, mais la relancer à
// l'identique sans fin ne la change pas.
export const REFUS_MAX = 3;

// Le refus tel qu'il se lit au journal et sur l'issue.
export const direRefus = (lecture: Lecture | null): string =>
  `refus du modèle${lecture?.refus?.categorie ? ` (${lecture.refus.categorie})` : ""}`;

// `inconnue` : le binaire n'a rien dit de lisible — ni oui, ni non.
export type Session = "connectee" | "absente" | "introuvable" | "inconnue";

// La session de la machine, demandée au binaire lui-même : aucun appel au
// modèle, et jamais d'ouverture de ses identifiants. Elle ne voit pas toujours
// une session expirée — c'est le flux du premier cook qui tranche alors.
export function sessionClaude(bin: string, env: NodeJS.ProcessEnv): Promise<Session> {
  return new Promise((resoudre) => {
    execFile(bin, ["auth", "status"], { env, timeout: 30_000 }, (erreur, stdout) => {
      if ((erreur as NodeJS.ErrnoException | null)?.code === "ENOENT") return resoudre("introuvable");
      let connecte: unknown;
      try {
        connecte = JSON.parse(stdout).loggedIn;
      } catch {}
      resoudre(connecte === true ? "connectee" : connecte === false ? "absente" : "inconnue");
    });
  });
}
