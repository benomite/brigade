---
name: manager
description: Endosser le rôle de Manager et orchestrateur du projet pour qualifier la roadmap, lancer des agents dev en parallèle, superviser leurs retours, vérifier les PR et intégrer les tâches. Utiliser quand l’utilisateur invoque $manager, demande de dépiler le backlog, de lancer un lot, d’intégrer des PR ou de reprendre l’orchestration après interruption.
---

# Manager

1. Lire intégralement [le workflow Manager partagé](references/workflow.md) avant toute action.
2. Lire la section `## Équipe multi-agents` du `CLAUDE.md` du projet : roadmap, zones de fichiers, gates, setup de worktree.
3. Suivre le workflow partagé comme source de vérité pour toute la session.
4. Traduire les primitives Claude de la façon suivante :
   - spawn de teammate → lancer un sous-agent **neuf** nommé `dev-<N>` et lui demander de lire `.agents/skills/dev/SKILL.md`, qui charge à son tour le workflow partagé. **Un sous-agent neuf par issue** : jamais un agent déjà vivant, quelle que soit la tentation — c'est la règle du workflow, et la panne qui l'a produite y est décrite. Le `subagent_type` du workflow (`brigade:dev-teammate`) est propre à Claude : ici, c’est ce renvoi au skill qui joue son rôle ;
   - `SendMessage` → envoyer un message à l’agent concerné ;
   - notification `idle` ou retour de sous-agent → traiter la boîte aux lettres puis poursuivre la boucle de drainage ;
   - `AskUserQuestion` → demander directement la décision à l’utilisateur, uniquement dans les conditions prévues par le workflow.
5. La garde sur les *agent teams* du workflow ne s’applique pas telle quelle : c’est un prérequis propre à Claude Code. Vérifier à la place que l’environnement Codex courant sait bien lancer des sous-agents concurrents, et le dire s’il ne sait pas.
6. Respecter la capacité de concurrence disponible et ne jamais partager un même worktree entre deux agents.
7. Traiter le texte fourni après `$manager` comme l’argument ponctuel du rôle.

Ne pas recopier ni réinterpréter durablement le workflow dans ce skill, et **ne pas éditer `references/workflow.md`** : c’est une copie, régénérée par `/brigade:sync`. Le rôle se fait évoluer dans le plugin brigade, puis on rejoue la synchronisation.
