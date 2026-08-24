# WORKFLOW.md — Travail multi-agents orchestré (PO / Designer / Orchestrateur / Dev-teammates)

Protocole de travail multi-agents sur ce projet. Quatre rôles, sessions indépendantes : le **PO** (`/po`) alimente le backlog en issues produit priorisées, le **Designer** (`/designer`) traite l'interface (boucle Claude Design + implémentation de la peau), l'**orchestrateur** (`/manager`) qualifie/spawne/intègre, les **dev-teammates** (`/dev`) implémentent. Isolation : **un worktree git par issue**, que le dev/designer crée et gère lui-même — hors du répertoire racine du repo. Backlog : **issues GitHub** (`<org>/<projet>`). Ordre de priorité : **issue #7 « Roadmap V1 »**.

> Toute la coordination vit dans des **artefacts durables** (issues, branches, PR, #7) — jamais dans la mémoire d'une session. C'est ce qui rend le système résilient : même si l'orchestrateur (et ses teammates in-process) meurt, le travail commité+poussé survit et une nouvelle session reconstruit l'état.

## Rôles

| Rôle | Activation | Fait | Ne fait PAS |
|---|---|---|---|
| **PO** | `/po` (une session) | Brainstorme le produit, digère les retours de tests utilisateurs, **écrit les issues `product`** (Contexte + Critères d'acceptation observables), **priorise** (labels `prio:`), tient la doc produit | N'écrit aucun code applicatif (sauf copy/wording UI), ne touche pas à #7, ne qualifie pas techniquement, ne merge pas, ne spawne pas |
| **Designer** | `/designer` (une session) | Traite l'**interface** : boucle **Claude Design / DesignSync** (push previews → itération pixels avec l'humain → pull CSS+rendu), implémente la **peau** (CSS/<design system>, JSX de rendu, layout, état d'UI local), **fait tester** activement à l'humain, livre 1 PR | Ne touche pas à la logique métier/API (→ dev), ne merge pas (→ Manager), ne touche pas à #7, n'est jamais spawné par le Manager |
| **Orchestrateur** | `/manager` (une session) | Qualifie/priorise (**applique l'ordre `prio:` du PO** dans #7), **writer unique de #7**, **spawne les dev-teammates**, supervise (idle + `SendMessage`), relaie les questions de spec, **intègre full-auto** (gates → merge → push → close) — PR des devs ET du designer | Ne code aucune feature lui-même ; **ne spawne jamais de dev sur une issue `design`** |
| **Dev-teammate** | `/dev <n°>` | Implémente UNE issue dans SON worktree, communique via `SendMessage to:"main"`, ouvre 1 PR | Ne touche jamais `main` ni #7, ne merge pas, n'appelle jamais `AskUserQuestion` |

Le flux va dans un sens : **PO → backlog → Manager → devs/designer → merge**. Le PO alimente l'amont (le « quoi » produit) ; le Designer prend les issues `design` (le visuel) en parallèle des devs ; l'orchestrateur n'est pas un process continu figé, il **draine en boucle event-driven** (les notifications *idle* et les signaux des devs le réveillent) tant qu'il a du travail non bloqué. Le dev `/dev <n>` est à **double usage** : spawné comme teammate par l'orchestrateur, ou lancé à la main par un humain (mode autonome, fallback). Le Designer, lui, est **toujours** humain-piloté (jamais spawné).

## Handoff PO → Manager (artefacts durables)

Le PO et le Manager sont deux sessions indépendantes : ils ne se parlent **que via les labels GitHub**.

- **`product`** sur une issue = « née du PO, à qualifier en priorité » (distinct du `triage` « hors-scope » créé par un dev). Le PO pose `product` + `triage` ; le Manager la qualifie et retire `triage`.
- **`prio:1` / `prio:2` / `prio:3`** = ordre voulu par le PO (sa décision produit). Le Manager **trie le corps de #7 selon ces labels** à chaque réveil. #7 garde son **writer unique (le Manager)**, mais son **ordre est dicté par le PO**. Le PO change un `prio:` → le Manager réordonne #7.

Frontière d'écriture : le PO remplit le **quoi** produit (Contexte + Critères d'acceptation observables) ; le Manager ajoute le **comment** technique (pointeurs fichiers, pièges, qualification, place dans #7). Le PO ne touche jamais à #7.

## Handoff Designer ↔ Manager (artefacts durables)

Le Designer et le Manager sont deux sessions indépendantes : ils ne se parlent **que via le label `design`, les issues et les PR**.

- **`design`** sur une issue = « forte composante visuelle, chasse gardée du Designer ». **Le Manager ne spawne JAMAIS de dev dessus** ; il la laisse pour `/designer`. Le Designer peut **créer** des issues `design` ; le PO/Manager taggent `design` ce qui relève du visuel.
- **Boucle visuelle** : le Designer pousse des **previews** dans le projet Claude Design « <projet UI> » (design system <design system>) via **DesignSync**, itère les pixels avec l'humain, puis **rapatrie le CSS + JSX de rendu** (la logique reste au repo). Détails et pièges : mémoire `<mémoire design du projet>`.
- **Périmètre variable** : une issue `design` est « pure peau » (Designer seul) ou « peau + logique » (Designer pour le visuel **+** un dev pour la logique, **séquencés** sur des zones de fichiers disjointes — le Manager partitionne).
- **Livraison** : le Designer ouvre une **PR `Closes #N`** (branche `design/<n>-slug`) ; le Manager la **découvre à son « fais le point » (`gh pr list`)** et l'intègre avec les mêmes gates que les PR de dev. Le Designer **fait tester à l'humain avant `prêt`** (il s'assure que `pnpm dev:web` tourne et sollicite activement la vérification d'écrans précis).

## Le cycle d'une issue

1. **Qualification** (Orchestrateur) — issue `triage` (`product` du PO ou hors-scope d'un dev) → label `feature`/`fix`/`tech` (+ `design` si visuel → pour le Designer, pas de dev) + critères + pointeurs + place dans #7 (ordre = labels `prio:`).
2. **Assignation** (Orchestrateur) — forme le lot, partitionne par zone de fichiers, **spawne les `dev-<N>` du lot parallèle en un seul message** (pool 2-3).
3. **Implémentation** (Dev-teammate) — crée son worktree isolé (install + base `moderation_test_<N>`), TDD API. `feature` → questions de spec **groupées** remontées par `question-spec #N` (jamais de devinette produit).
4. **Livraison** (Dev-teammate) — commit/push tôt, 1 PR, signal `prêt #N (PR <url>)` via `SendMessage to:"main"`.
5. **Intégration** (Orchestrateur) — gates (`pnpm test` + `pnpm build` + `/code-review`). **Vert → merge + push origin + close + #7 en full-auto.** Rouge → findings renvoyés au dev. Puis spawne la prochaine issue prête.

## Communication & drainage autonome

- Le **texte brut d'un teammate est invisible** : toute remontée passe par `SendMessage to:"main"`. Signaux : `question-spec #N`, `prêt #N (PR …)`, `bloqué #N`, `hors-scope #N`.
- **Questions de spec non bloquantes** : une `question-spec` est déposée en commentaire d'issue + label `blocked-on-human` ; l'orchestrateur **continue de drainer le reste** et ne sollicite l'utilisateur (`AskUserQuestion`, groupé) que s'il n'a plus aucun travail non bloqué.
- **Boucle de drainage** : à chaque *idle*/signal, l'orchestrateur intègre puis spawne la prochaine issue prête, jusqu'à backlog vide ou tout bloqué.
- **Résilience** : teammates éphémères, mais worktree+branche+commits+PR+issues+#7 survivent. Après crash, un nouveau `/manager` reconstruit l'état et re-spawne les devs inachevés.

## Règles non négociables (apprises à la dure)

- **Un fichier, un seul propriétaire** entre worktrees concurrents. L'orchestrateur partitionne par **zone touchée**, pas par indépendance logique.
  _Exemple : #9 (`apps/api/.../invitations`) ∥ #40 (`apps/web/.../Player`) = sûr ; #29 & #38 touchent tous deux `flow`/`questionnaire` = à séquencer._
- **#7 a un writer unique : l'orchestrateur.** Deux écrivains = divergence garantie.
- **Un dev-teammate ne merge jamais et n'appelle jamais `AskUserQuestion`** — il signale, l'orchestrateur arbitre.
- **Discipline de sync** : le dev fait `git pull --rebase main` **au début ET avant d'ouvrir la PR**. L'orchestrateur **pousse `origin` aussitôt après chaque merge** (jamais laisser `main` local dériver de `origin`).
- **Merge en ordre de dépendance, jamais deux simultanés.**
- **Gates de merge** : `pnpm test` + `pnpm build` + `/code-review` verts. Pas de merge sur la foi d'une affirmation — preuve par sortie de commande.
- **Découverte hors scope** → le dev crée une issue `triage` (brute), signale `hors-scope #N`, et **continue** sa tâche. Jamais d'extension silencieuse du scope. L'orchestrateur re-qualifie.

### Trois pannes réelles que ce protocole prévient
- **Doublon** : deux worktrees ont implémenté la même issue (#35) en parallèle → règle « assignation explicite par l'orchestrateur + un fichier/un owner ».
- **Dérive** : `main` local a avancé de 6 commits non poussés sur `origin` → règle « push immédiat après merge ».
- **Phagocytose** (2026-06-22) : deux devs (#38 et #50) ont travaillé dans le **même répertoire racine** ; leurs commits se sont mélangés sur une seule branche (spec/plan de #38 échoués sur la branche de #50, branche #38 vide) → règle « **un worktree isolé par issue, créé par le dev `/dev`**, jamais le répertoire racine ni celui d'un autre ». `git status` avant chaque commit : uniquement les fichiers de ton issue.

## Miroir Codex/OpenAI (`.agents/` + `AGENTS.md`)

Le projet maintient un **second outillage multi-agents pour Codex/OpenAI**, en parallèle du dispositif Claude. Il **ne redéfinit rien** : c'est un **miroir dérivé** des rôles Claude, pas une seconde gouvernance.

- **Source de vérité unique = Claude.** Les rôles PO/Dev/Manager/Designer sont définis **une seule fois**, dans `.claude/commands/{po,dev,manager,designer}.md` (procédure) + ce `docs/WORKFLOW.md` (gouvernance) + `CLAUDE.md` (conventions de code). Ce sont les **seuls fichiers canoniques**.
- **Le miroir Codex n'édite aucun contenu propre.** Il ne fait que **pointer** vers les fichiers Claude :
  - `AGENTS.md` (racine) = **symlink vers `CLAUDE.md`** (Codex lit ses conventions au même endroit que Claude).
  - `.agents/skills/<rôle>/references/workflow.md` = **symlink vers `../../../../.claude/commands/<rôle>.md`** (le workflow du rôle reste le fichier Claude).
  - `.agents/skills/<rôle>/SKILL.md` = fine couche d'adaptation Codex : « lis le workflow partagé, traite le premier argument comme `$ARGUMENTS`, traduis les primitives Claude (`SendMessage`, spawn de teammate, `AskUserQuestion`) vers leurs équivalents Codex ». **Aucune règle métier n'y est recopiée.**
  - `.agents/skills/<rôle>/agents/openai.yaml` = métadonnées d'interface Codex (nom affiché, prompt par défaut) — purement cosmétique.

### Procédure de synchro (à appliquer à CHAQUE évolution d'un rôle Claude)

Faire évoluer un rôle = **modifier uniquement le fichier Claude canonique** (`.claude/commands/<rôle>.md`, ou `docs/WORKFLOW.md`, ou `CLAUDE.md`). Grâce aux symlinks, le miroir Codex suit **automatiquement** — rien à recopier.

Il ne faut retoucher `.agents/` **que** dans ces cas :

1. **Nouveau rôle Claude** (`.claude/commands/<x>.md` créé) → créer le dossier miroir :
   ```bash
   mkdir -p .agents/skills/<x>/agents .agents/skills/<x>/references
   ln -s ../../../../.claude/commands/<x>.md .agents/skills/<x>/references/workflow.md
   # + SKILL.md (couche d'adaptation, sur le modèle des rôles existants) + agents/openai.yaml
   ```
2. **Rôle supprimé/renommé** → supprimer/renommer le dossier miroir correspondant et son symlink.
3. **Changement de la façon dont Codex traduit une primitive Claude** (ex. nouveau mécanisme de spawn) → mettre à jour la **couche d'adaptation** du `SKILL.md` concerné, jamais le workflow.

**Interdit** : recopier le contenu d'un `.claude/commands/*.md` ou de `CLAUDE.md` dans un fichier `.agents/` (ce serait une 2ᵉ vérité qui divergerait à la première évolution). Les `SKILL.md` le rappellent explicitement.

### Vérification (aucun symlink cassé)

```bash
for f in AGENTS.md .agents/skills/*/references/workflow.md; do
  test -e "$f" && echo "OK  $f -> $(readlink "$f")" || echo "CASSÉ $f"
done
```

## Conventions

- **Branche** : `feat/<n>-slug`, `fix/<n>-slug`, `tech/<n>-slug`, `design/<n>-slug` (`<n>` = n° d'issue) → l'orchestrateur mappe branche ↔ issue ↔ PR.
- **PR** : titre en français, corps qui référence `Closes #<n>`.
- **Labels** : `feature`/`fix`/`tech` (type, posé par le Manager) ; `triage` (brute, à qualifier) ; `product` (née du PO) ; `design` (composante visuelle → Designer, jamais de dev) ; `prio:1`/`prio:2`/`prio:3` (priorité produit, posée par le PO) ; `blocked-on-human` (question de spec en attente).
- Le reste des conventions de code : `CLAUDE.md`.
