// Le second de chaque projet, tel que le guichet de la station le rend au
// téléphone appairé (#1413) : lire sa conversation, et lui écrire.
//
// C'est la conversation du second du desktop, pas une autre : celle que
// `claude --continue` reprend dans le dossier où il tourne — la ligne du projet
// le nomme, `BRIGADE_SECOND_DIR` —, lue par le même module que le desktop
// (`second/conversation.ts`), sous le répertoire de configuration de `claude`
// de l'environnement du projet. Un message du téléphone y part par
// `claude --continue -p`, lancé dans ce dossier comme le desktop lance son
// second (`second/lancement.ts`, `planDuSecond`), le texte sur son entrée :
// il s'ajoute à la même session, et la réponse du second avec lui. Ce que le
// chef tape au desktop s'y lit à la lecture suivante du téléphone ; ce qu'il
// écrit du téléphone, le desktop le lit au même transcript — son terminal, déjà
// ouvert, ne le redessine pas : il le montre quand il reprend la session.
//
// Un seul message à la fois par projet : le second répond à l'un avant de lire
// le suivant. L'envoi rend la main dès que le message est dans la conversation
// — la réponse peut prendre des minutes —, et la lecture dit alors que le
// second répond (`answering`). Un second qui échoue après, en cours de
// réponse, le dit à la lecture (`failed`), jusqu'au message suivant.
import { statSync } from "node:fs";
import { join } from "node:path";
import { configurationDeClaude, ConversationIllisible, lireLaConversation, transcriptDuSecond, type ConversationDuSecond } from "../second/conversation.ts";
import { planDuSecond } from "../second/lancement.ts";
import { programmesDe } from "../second/outils.ts";
import { spawn, type ChildProcess } from "../sans-invite.ts";
import { CONFIGURATION, environnementDuProjet, lireFichierDeConfiguration } from "../station/configuration.ts";

// Le réglage de la ligne d'un projet qui nomme le dossier où tourne son second.
export const VARIABLE_DU_SECOND = "BRIGADE_SECOND_DIR";

// `said` : une phrase, à montrer telle quelle ; `detail` : ce qui a été lancé
// et ce qu'il a écrit.
export type EchecDuSecond = { said: string; detail: string };

// La conversation rendue au téléphone : `answering`, le second écrit sa
// réponse au dernier message envoyé d'ici ; `failed`, il a échoué en y
// répondant.
export type ConversationAuTelephone = ConversationDuSecond & { project: string; answering?: true; failed?: EchecDuSecond };

export type LectureDuSecond = { etat: "lue"; conversation: ConversationAuTelephone } | { etat: "indisponible"; said: string } | { etat: "inconnu" };

// `parti` : le message est dans la conversation — sa réponse aussi, quand le
// second a fini avant qu'on le voie entrer ; `occupe` : il répond encore au
// précédent, rien n'est parti ; `en-echec` : le second n'a pas pris le message.
export type EnvoiAuSecond =
  | { etat: "parti"; conversation: ConversationAuTelephone }
  | { etat: "occupe"; said: string }
  | ({ etat: "en-echec" } & EchecDuSecond)
  | { etat: "indisponible"; said: string }
  | { etat: "inconnu" };

export type SecondsDuTelephone = {
  lire(projet: string): LectureDuSecond;
  envoyer(projet: string, texte: string): Promise<EnvoiAuSecond>;
  // Arrête les réponses en cours : la station s'arrête.
  arreter(): void;
};

export type OptionsSeconds = {
  // Le répertoire de la station (`BRIGADE_STATION_DIR`).
  racine: string;
  // L'environnement de la station, que chaque projet hérite.
  env: Record<string, string | undefined>;
  // Passé ce délai, une réponse est arrêtée.
  delaiMs?: number;
  // Le pas auquel l'envoi regarde si le message est entré dans la conversation.
  pasMs?: number;
};

export const DELAI_DU_SECOND_MS = 15 * 60_000;

// Ce qu'on garde de ce que `claude` écrit, pour le dire.
const GARDE = 4_096;

const premiereLigne = (texte: string): string | null =>
  texte
    .split("\n")
    .map((ligne) => ligne.trim())
    .find(Boolean)
    ?.replace(/^error:\s*/i, "")
    .replace(/[.\s]+$/, "") ?? null;

export function secondsDeLaStation(options: OptionsSeconds): SecondsDuTelephone {
  const { racine, env } = options;
  const delaiMs = options.delaiMs ?? DELAI_DU_SECOND_MS;
  const pasMs = options.pasMs ?? 100;
  // Les réponses en cours, et le dernier échec de chaque projet.
  const enCours = new Map<string, ChildProcess>();
  const echecs = new Map<string, EchecDuSecond>();

  // Le second du projet de ce nom : son dossier, le répertoire de
  // configuration de son `claude`, et l'environnement où il part.
  type Lieux = { dossier: string; claude: string; env: Record<string, string | undefined> };
  const lieux = (nom: string): Lieux | { etat: "indisponible"; said: string } | { etat: "inconnu" } => {
    const projet = lireFichierDeConfiguration(join(racine, CONFIGURATION)).projets.find((candidat) => candidat.nom === nom);
    if (projet === undefined) return { etat: "inconnu" };
    const sien = environnementDuProjet(racine, projet, env);
    const dossier = sien[VARIABLE_DU_SECOND];
    if (dossier === undefined || dossier === "") {
      return { etat: "indisponible", said: `this station does not hold the second of ${nom}: its line names no folder where the second runs (${VARIABLE_DU_SECOND})` };
    }
    return { dossier, claude: configurationDeClaude(sien), env: sien };
  };

  const conversation = (nom: string, lu: Lieux): ConversationAuTelephone => {
    const echec = echecs.get(nom);
    return { project: nom, ...lireLaConversation(lu), ...(enCours.has(nom) ? { answering: true as const } : {}), ...(echec === undefined ? {} : { failed: echec }) };
  };

  const indisponible = (nom: string, erreur: unknown) => {
    if (!(erreur instanceof ConversationIllisible)) throw erreur;
    return { etat: "indisponible" as const, said: `the conversation with the second of ${nom} cannot be read: ${erreur.message}` };
  };

  return {
    lire(nom) {
      const lu = lieux(nom);
      if ("etat" in lu) return lu;
      try {
        return { etat: "lue", conversation: conversation(nom, lu) };
      } catch (erreur) {
        return indisponible(nom, erreur);
      }
    },

    envoyer(nom, texte) {
      const lu = lieux(nom);
      if ("etat" in lu) return Promise.resolve(lu);
      if (enCours.has(nom)) return Promise.resolve({ etat: "occupe", said: `the second of ${nom} is still answering your previous message: wait for its answer, then send this one` });
      let avant: ConversationDuSecond;
      try {
        avant = lireLaConversation(lu);
      } catch (erreur) {
        return Promise.resolve(indisponible(nom, erreur));
      }
      // Sans session dans ce dossier, le message en ouvre une : celle que le
      // desktop reprendra.
      const args = avant.session === null ? ["-p"] : ["--continue", "-p"];
      const plan = planDuSecond({ folder: lu.dossier, args, env: lu.env, programmes: programmesDe(lu.env) });
      const lance = `$ claude ${args.join(" ")}   (in ${lu.dossier})`;
      if (plan.state !== "ready") return Promise.resolve({ etat: "en-echec", said: plan.reason.replace(/\.$/, ""), detail: [lance, plan.detail ?? plan.reason].join("\n") });

      const chefsAvant = avant.messages.filter((message) => message.from === "chef").length + (avant.omitted ?? 0);
      const enfant = spawn(plan.launch.command, plan.launch.args, {
        cwd: plan.launch.folder,
        env: { ...lu.env, ...plan.launch.env },
        stdio: ["pipe", "pipe", "pipe"],
        timeout: delaiMs,
        windowsHide: true,
        windowsVerbatimArguments: plan.launch.verbatim,
      });
      enCours.set(nom, enfant);
      echecs.delete(nom);
      let ecrit = "";
      const garder = (morceau: Buffer) => {
        ecrit = (ecrit + morceau.toString("utf8")).slice(-GARDE);
      };
      enfant.stdout?.on("data", garder);
      enfant.stderr?.on("data", garder);
      enfant.stdin?.on("error", () => {});
      enfant.stdin?.end(texte);

      return new Promise((resoudre) => {
        let rendu = false;
        const rendre = (envoi: EnvoiAuSecond) => {
          if (rendu) return;
          rendu = true;
          clearInterval(regard);
          resoudre(envoi);
        };
        // Le message est entré quand la conversation porte un message du chef
        // de plus — ou une session neuve. Le transcript n'est relu que quand il
        // a bougé.
        let vu = "";
        const regard = setInterval(() => {
          try {
            const transcript = transcriptDuSecond(lu.claude, lu.dossier);
            if (transcript === null) return;
            const { mtimeMs, size } = statSync(transcript);
            if (`${transcript}:${mtimeMs}:${size}` === vu) return;
            vu = `${transcript}:${mtimeMs}:${size}`;
            const maintenant = conversation(nom, lu);
            const chefs = maintenant.messages.filter((message) => message.from === "chef").length + (maintenant.omitted ?? 0);
            if (maintenant.session !== avant.session || chefs > chefsAvant) rendre({ etat: "parti", conversation: maintenant });
          } catch {
            // Un transcript qui bouge pendant qu'on le lit : au pas suivant.
          }
        }, pasMs);

        const echouer = (echec: EchecDuSecond) => {
          enCours.delete(nom);
          if (rendu) echecs.set(nom, echec);
          rendre({ etat: "en-echec", ...echec });
        };
        const detail = (fin: string) => [lance, ...(ecrit.trim() === "" ? [] : [ecrit.trim()]), `→ ${fin}`].join("\n");
        enfant.on("error", (erreur: NodeJS.ErrnoException) => {
          if (enfant.pid !== undefined) return;
          echouer({ said: `the station could not start the second of ${nom} — ${erreur.code === "ENOENT" ? `${plan.launch.command} was not found` : erreur.message}`, detail: detail(erreur.message) });
        });
        enfant.on("close", (code, signal) => {
          if (enfant.pid === undefined) return;
          if (code === 0) {
            enCours.delete(nom);
            try {
              return rendre({ etat: "parti", conversation: conversation(nom, lu) });
            } catch (erreur) {
              const lecture = indisponible(nom, erreur);
              return rendre({ etat: "en-echec", said: lecture.said, detail: detail("exit code 0") });
            }
          }
          if (signal !== null) {
            const arrete = enfant.killed && signal === "SIGTERM";
            return echouer({
              said: arrete ? `the second of ${nom} did not answer within ${Math.round(delaiMs / 60_000)} min and was stopped` : `the second of ${nom} stopped (${signal}) before answering`,
              detail: detail(String(signal)),
            });
          }
          const dit = premiereLigne(ecrit);
          echouer({ said: `the second of ${nom} failed${dit === null ? ` with exit code ${code}` : ` — ${dit}`}`, detail: detail(`exit code ${code}`) });
        });
      });
    },

    arreter() {
      for (const enfant of enCours.values()) enfant.kill();
      enCours.clear();
    },
  };
}
