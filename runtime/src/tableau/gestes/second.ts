// Le second du projet, joint par la box pour le geste `ask` du tableau de la
// cuisine (gestes.ts) : la demande composée part dans sa conversation, et sa
// réponse revient, pour être publiée sous le geste.
//
// C'est le second du desktop, pas un autre — comme pour le téléphone
// (telephone/second.ts) : la conversation que `claude --continue` reprend dans
// le dossier où il tourne (`BRIGADE_SECOND_DIR`, sur la ligne du projet ou dans
// l'environnement du runtime). La demande part par `claude --continue -p`,
// lancée dans ce dossier comme le desktop lance son second
// (`second/lancement.ts`, `planDuSecond`), le texte sur son entrée : elle
// s'ajoute à la même session, et sa réponse avec elle — le desktop les lit au
// même transcript. Sans session dans ce dossier, la demande en ouvre une. La
// réponse est ce que `claude -p` écrit sur sa sortie : le dernier texte du
// second.
//
// Une demande à la fois : la suivante attend que le second ait répondu. Rien ne
// lève : un second qu'on ne joint pas, qui échoue ou qui ne répond pas à temps
// le dit en une phrase.
import { configurationDeClaude, ConversationIllisible, lireLaConversation } from "../../second/conversation.ts";
import { planDuSecond } from "../../second/lancement.ts";
import { programmesDe } from "../../second/outils.ts";
import { spawn } from "../../sans-invite.ts";

export type ReponseDuSecond = { repondu: true; texte: string } | { repondu: false; raison: string };

export type SecondDuTableau = {
  demander(texte: string): Promise<ReponseDuSecond>;
};

// Le réglage qui nomme le dossier où tourne le second du projet.
export const DOSSIER_DU_SECOND = "BRIGADE_SECOND_DIR";

// Passé ce délai, la réponse est arrêtée — celui du téléphone.
export const DELAI_DU_SECOND_MS = 15 * 60_000;

// Ce qu'on garde de ce que `claude` écrit.
const GARDE = 256 * 1024;

const premiereLigne = (texte: string): string | null =>
  texte
    .split("\n")
    .map((ligne) => ligne.trim())
    .find(Boolean)
    ?.replace(/^error:\s*/i, "")
    .replace(/[.\s]+$/, "") ?? null;

// Le second de l'environnement `env`, ou null s'il n'y nomme pas son dossier :
// cette box ne tient pas le second du projet.
export function secondDuProjet(env: Record<string, string | undefined>, delaiMs = DELAI_DU_SECOND_MS): SecondDuTableau | null {
  const dossier = env[DOSSIER_DU_SECOND];
  if (dossier === undefined || dossier === "") return null;
  let file: Promise<unknown> = Promise.resolve();

  const jouer = (texte: string): Promise<ReponseDuSecond> => {
    let session: string | null;
    try {
      session = lireLaConversation({ dossier, claude: configurationDeClaude(env) }).session;
    } catch (erreur) {
      if (!(erreur instanceof ConversationIllisible)) throw erreur;
      return Promise.resolve({ repondu: false, raison: `the conversation with the second cannot be read: ${erreur.message}` });
    }
    const args = session === null ? ["-p"] : ["--continue", "-p"];
    const plan = planDuSecond({ folder: dossier, args, env, programmes: programmesDe(env) });
    if (plan.state !== "ready") return Promise.resolve({ repondu: false, raison: plan.reason.replace(/\.$/, "") });
    return new Promise((resoudre) => {
      const enfant = spawn(plan.launch.command, plan.launch.args, {
        cwd: plan.launch.folder,
        env: { ...env, ...plan.launch.env },
        stdio: ["pipe", "pipe", "pipe"],
        timeout: delaiMs,
        windowsHide: true,
        windowsVerbatimArguments: plan.launch.verbatim,
      });
      let sortie = "";
      let erreurs = "";
      enfant.stdout?.on("data", (morceau: Buffer) => {
        sortie = (sortie + morceau.toString("utf8")).slice(0, GARDE);
      });
      enfant.stderr?.on("data", (morceau: Buffer) => {
        erreurs = (erreurs + morceau.toString("utf8")).slice(-4096);
      });
      enfant.stdin?.on("error", () => {});
      enfant.stdin?.end(texte);
      let rendu = false;
      const rendre = (reponse: ReponseDuSecond) => {
        if (rendu) return;
        rendu = true;
        resoudre(reponse);
      };
      enfant.on("error", (erreur: NodeJS.ErrnoException) => {
        rendre({ repondu: false, raison: `the second could not be started — ${erreur.code === "ENOENT" ? `${plan.launch.command} was not found` : erreur.message}` });
      });
      enfant.on("close", (code, signal) => {
        if (code === 0) {
          const reponse = sortie.trim();
          return rendre(reponse === "" ? { repondu: false, raison: "the second answered nothing" } : { repondu: true, texte: reponse });
        }
        if (signal !== null) {
          return rendre({ repondu: false, raison: enfant.killed && signal === "SIGTERM" ? `the second did not answer within ${Math.round(delaiMs / 60_000)} min and was stopped` : `the second stopped (${signal}) before answering` });
        }
        const dit = premiereLigne(erreurs) ?? premiereLigne(sortie);
        rendre({ repondu: false, raison: `the second failed${dit === null ? ` with exit code ${code}` : ` — ${dit}`}` });
      });
    });
  };

  return {
    demander(texte) {
      const tour = file.then(() => jouer(texte));
      file = tour.catch(() => {});
      return tour.catch((erreur: unknown) => ({ repondu: false as const, raison: `the second could not be asked — ${erreur instanceof Error ? erreur.message : String(erreur)}` }));
    },
  };
}
