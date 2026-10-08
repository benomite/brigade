// L'adaptateur moteur de la station : ce qu'il faut pour lancer le binaire
// `claude` officiel sur un ticket, et pour lire dans son flux comment le cook a
// fini. Rien d'autre que le binaire : ni SDK, ni API, ni lecture des
// identifiants — c'est `claude` qui porte la connexion Max de la machine.
import { execFile } from "node:child_process";
import type { Calibrage } from "./calibrage.ts";
import type { FinDeCook } from "./evenements/station.ts";

// Ce qu'un cook ne doit pas faire lui-même : seule la pass merge, et c'est la
// station qui pousse. Garde-fou de bonne foi, pas une clôture — la clôture est
// la protection de branche du dépôt.
const INTERDITS = ["Bash(gh pr merge:*)", "Bash(git push:*)", "Bash(git merge:*)"];

// Les variables par lesquelles `claude` s'authentifierait autrement que par la
// connexion Max de la machine. Aucune ne doit exister, ni pour le runtime ni
// pour un cook.
export const VARIABLES_DE_JETON = ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "CLAUDE_CODE_OAUTH_TOKEN"];

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
    "--disallowedTools",
    ...INTERDITS,
  ];
}

// L'environnement d'un cook : celui du runtime, sans son état (un cook qui
// travaille sur brigade lancerait sinon un runtime sur le journal qui le fait
// tourner) et sans rien qui détourne `claude` de la connexion Max.
export function environnementCook(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(env).filter(([nom]) => !nom.startsWith("BRIGADE_") && !VARIABLES_DE_JETON.includes(nom)));
}

// Le profil du cook, en dur au jalon 1.
export function consigne(mission: { ticket: number; titre: string; depot: string; base: string }): string {
  const { ticket, titre, depot, base } = mission;
  return [
    `Tu es un cook de la brigade : tu exécutes un seul ticket, le ticket #${ticket} du dépôt ${depot} — « ${titre} ».`,
    "",
    `1. Lis le ticket en entier : \`gh issue view ${ticket} --repo ${depot} --comments\`.`,
    `2. Tu es dans un worktree qui t'est propre, sur une branche neuve partie de \`${base}\`. Travaille ici et nulle part ailleurs, en suivant les conventions du dépôt (son CLAUDE.md).`,
    "3. Vérifie ton travail comme le dépôt le demande (tests, gates), puis commite-le sur cette branche.",
    "4. Tu ne pousses rien, tu n'ouvres pas de PR, tu ne merges jamais et tu ne commentes pas le ticket : la station s'en charge quand tu as fini.",
    "5. Termine par ton compte-rendu, en clair : ce que tu as fait, ce que tu as vérifié et comment, ce qui reste à faire ou ce qui t'a bloqué. Ce dernier message est publié tel quel sur le ticket.",
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
  const lecture: Lecture = { resultat: null, message: null, quota: null, deconnecte: false };
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
    } else if (evenement.type === "result") {
      lecture.resultat = { erreur: evenement.is_error !== false };
      if (typeof evenement.result === "string" && evenement.result !== "") lecture.message = evenement.result;
    }
  }
  if (rejete) lecture.quota = rejete;
  else if (quotaDitParErreur) lecture.quota = dernierEtat ?? { retour: null, fenetre: null };
  return lecture;
}

// La fin d'un cook que rien n'a arrêté. `subtype` n'entre pas en compte : il
// vaut « success » même quand la session n'a jamais pu parler au modèle.
export function verdict(lecture: Lecture, code: number | null): FinDeCook {
  if (lecture.deconnecte) return "disconnected";
  if (code === 0 && lecture.resultat !== null && !lecture.resultat.erreur) return "done";
  if (lecture.quota) return "86";
  return "failed";
}

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
