---
description: Synchronise le miroir Codex (`.agents/`) depuis le plugin brigade — à rejouer après chaque mise à jour du plugin
---

Tu synchronises le **miroir Codex** de ce projet avec le plugin **brigade**. Les rôles ont une seule définition — les commandes du plugin — et Codex les lit à travers une **copie** déposée dans `.agents/`.

**Pourquoi une copie et pas un lien.** Le plugin vit dans un cache dont le chemin porte son **numéro de version** (`…/cache/<marketplace>/brigade/<version>/`). Un symlink vers ce chemin casserait à la première mise à jour, silencieusement. La copie, elle, ne ment jamais sur ce qu'elle contient — au prix d'une resynchronisation explicite, qui est le rôle de cette commande.

**Cette commande est rejouable.** Tu constates avant d'écrire, et tu ne fais que l'écart. Un fichier déjà identique n'est pas réécrit : « inchangé » est un résultat.

## 1. Trouve le plugin

Aucune variable d'environnement ne te donne son chemin (`CLAUDE_PLUGIN_ROOT` est vide dans une commande) : tu le résous, et tu vérifies ta trouvaille.

```bash
ROOT="$(git rev-parse --show-toplevel)"
PLUGIN="$(ls -d "$HOME"/.claude/plugins/cache/*/brigade/*/ 2>/dev/null | sort -V | tail -1)"
[ -z "$PLUGIN" ] && [ -d "$HOME/.claude/skills/brigade" ] && PLUGIN="$HOME/.claude/skills/brigade/"
[ -f "${PLUGIN}commands/sync.md" ] || { echo "plugin brigade introuvable" >&2; }
```

`sort -V` prend la version la plus haute, pas la première par ordre alphabétique — sans quoi `0.10.0` perdrait contre `0.9.0`. Si la sonde échoue (installation par `--plugin-dir`, chemin inhabituel), **demande le chemin** au lieu de deviner : écrire un workflow faux est pire que ne rien écrire.

Relève au passage la version trouvée : elle va dans ton résumé, et c'est la seule trace de ce que le miroir contient.

## 2. Détermine les rôles à synchroniser

Le binding **Rôles actifs** de la section `## Équipe multi-agents` du `CLAUDE.md` — déjà en contexte. Absente ? Propose `/brigade:init` et arrête-toi.

Tu ne synchronises **que les rôles actifs**. Un rôle présent dans `.agents/` mais absent des rôles actifs : ne le supprime pas de ta propre initiative — **signale-le** et laisse l'humain trancher. Un rôle actif absent de `.agents/` : tu le crées.

## 3. Écris le miroir

Pour chaque rôle actif, trois fichiers, tous des **fichiers réguliers** :

```bash
for r in <les rôles actifs>; do
  mkdir -p "$ROOT/.agents/skills/$r/agents" "$ROOT/.agents/skills/$r/references"
  cp "${PLUGIN}codex/skills/$r/SKILL.md"          "$ROOT/.agents/skills/$r/SKILL.md"
  cp "${PLUGIN}codex/skills/$r/agents/openai.yaml" "$ROOT/.agents/skills/$r/agents/openai.yaml"
  cp "${PLUGIN}commands/$r.md"                     "$ROOT/.agents/skills/$r/references/workflow.md"
done
```

Le `references/workflow.md` est la **copie de la commande Claude du rôle** : c'est lui qui porte le protocole. Un `references/workflow.md` qui serait encore un symlink (miroir d'avant le plugin) doit être **supprimé avant** la copie — sinon tu écrirais à travers le lien, dans la cible.

```bash
[ -L "$ROOT/.agents/skills/$r/references/workflow.md" ] && rm "$ROOT/.agents/skills/$r/references/workflow.md"
```

C'est le seul geste destructif de cette commande, et il est sûr : le contenu vit dans le plugin.

## 4. `AGENTS.md`

Codex lit ses conventions de projet dans `AGENTS.md`, Claude dans `CLAUDE.md`. Un **symlink** est ici le bon outil — les deux fichiers sont dans le même dépôt, aucune version dans le chemin :

```bash
[ -e "$ROOT/AGENTS.md" ] || ln -s CLAUDE.md "$ROOT/AGENTS.md"
```

Déjà un fichier régulier avec du contenu propre ? **N'y touche pas**, signale-le : quelqu'un a voulu deux fichiers distincts, et c'est son droit.

## 5. Vérifie

```bash
for f in "$ROOT"/.agents/skills/*/references/workflow.md; do
  [ -L "$f" ] && echo "ENCORE UN LIEN $f"
  [ -s "$f" ] || echo "VIDE $f"
done
diff -r "${PLUGIN}codex/skills" "$ROOT/.agents/skills" --exclude=references
```

Attendu : aucune sortie sur la boucle, et le `diff` ne signale que les répertoires `references` exclus. Un lien restant ou un fichier vide, c'est un rôle que Codex ne saura pas tenir.

## 6. Résume

- **Créé** / **Mis à jour** / **Inchangé**, par rôle.
- **Signalé sans agir** : rôle présent dans `.agents/` mais inactif, `AGENTS.md` régulier, plugin introuvable.
- La **version du plugin** d'où vient ce miroir.

Termine par le rappel qui évite la dérive : **cette commande est à rejouer après chaque mise à jour du plugin**. Une mise à jour de brigade ne descend nulle part toute seule — il faut avoir bumpé sa version, joué `claude plugin update`, puis rejoué `/brigade:sync`. Un miroir périmé ne se voit pas : il donne à Codex un protocole d'hier, sans erreur ni avertissement.
