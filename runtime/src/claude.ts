// L'adaptateur moteur de la station : ce qu'il faut pour lancer le binaire
// `claude` officiel sur un ticket, et pour lire dans son flux comment le cook a
// fini. Rien d'autre que le binaire : ni SDK, ni API, ni lecture des
// identifiants — c'est `claude` qui porte la connexion Max de la machine.
import { execFile } from "node:child_process";
import type { Calibrage } from "./calibrage.ts";
import type { FinDeCook } from "./evenements/station.ts";
import { CONSIGNE_DU_LIVRABLE } from "./livrable.ts";

// Ce qu'un cook ne doit pas faire lui-même : seule la pass merge, et c'est la
// station qui pousse. Garde-fou de bonne foi, pas une clôture — la clôture est
// la protection de branche du dépôt.
const INTERDITS = ["Bash(gh pr merge:*)", "Bash(git push:*)", "Bash(git merge:*)"];

// Les variables par lesquelles `claude` s'authentifierait autrement que par la
// connexion Max de la machine. Aucune ne doit exister, ni pour le runtime ni
// pour un cook.
export const VARIABLES_DE_JETON = ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "CLAUDE_CODE_OAUTH_TOKEN"];

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
export function argumentsClaude(texte: string, calibrage: Calibrage): string[] {
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

// Le profil du cook, en dur au jalon 1.
export function consigne(mission: { ticket: number; titre: string; depot: string; base: string }): string {
  const { ticket, titre, depot, base } = mission;
  return [
    `Tu es un cook de la brigade : tu exécutes un seul ticket, le ticket #${ticket} du dépôt ${depot} — « ${titre} ».`,
    "",
    `1. Lis le ticket en entier : \`gh issue view ${ticket} --repo ${depot} --comments\`.`,
    `2. Tu es dans un worktree qui t'est propre, sur une branche neuve partie de \`${base}\`. Travaille ici et nulle part ailleurs. Les conventions du dépôt ne te sont pas chargées d'office : lis son \`CLAUDE.md\`, s'il en a un à la racine, avant d'écrire quoi que ce soit, et suis-le.`,
    "3. Vérifie ton travail comme le dépôt le demande (tests, gates), puis commite-le sur cette branche.",
    "4. Si le ticket porte une fiche (un commentaire « Fiche du ticket »), sa ligne `zone` nomme les fichiers et dossiers qu'il possède. N'écris ailleurs que si le ticket l'exige, et dis-le dans ton compte-rendu : tout fichier livré hors de la zone est signalé au chef. Tu ne modifies pas la fiche.",
    "5. Tu ne pousses rien, tu n'ouvres pas de PR, tu ne merges jamais et tu ne commentes pas le ticket : la station s'en charge quand tu as fini.",
    `6. Termine par ton compte-rendu, en clair : ce que tu as fait, ce que tu as vérifié et comment, ce qui reste à faire ou ce qui t'a bloqué. ${CONSIGNE_DU_LIVRABLE}`,
    "",
    "Personne ne te répondra. S'il te manque une décision, ne la devine pas : arrête-toi et dis laquelle dans ton compte-rendu.",
  ].join("\n");
}

export type Lecture = {
  // L'événement `result` final : absent si le cook est mort avant de conclure.
  resultat: { erreur: boolean } | null;
  // Le dernier message du cook : son compte-rendu, ou l'erreur qui l'a arrêté.
  message: string | null;
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
  const lecture: Lecture = { resultat: null, message: null, quota: null, deconnecte: false, refus: null };
  let categorie: string | null = null;
  let rejete: EtatQuota | null = null;
  let dernierEtat: EtatQuota | null = null;
  let quotaDitParErreur = false;
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
      if (evenement.parent_tool_use_id == null) lecture.message = texteDe(evenement.message?.content) ?? lecture.message;
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
