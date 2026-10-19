# rename-code — the glossary terms of the code, renamed by a tool (#1003)

The identifiers and file names of `runtime/` and `app/` that hold a term of
`docs/glossary.md` are renamed to English **by this tool**, never by hand: it
renames everywhere at once by following the references the TypeScript
language service finds, so that the runtime and the app — which imports
`runtime/src` — move together.

## What it does

1. **One program.** `runtime/{src,test}`, `app/{src,test}` and
   `scripts/capture-ecran` (which imports the app) are loaded in a single
   TypeScript language service (TypeScript 5.9, the last one that ships the
   JavaScript API; the repository's own `tsc` is TypeScript 7, native).
2. **Names.** Every declared name of `runtime/` and `app/` is cut into words
   (`lireJournalDuProjet` → lire journal du projet). If it holds a glossary
   term, its new name is the whole-name entry of `names.ts` when there is one,
   else its word-by-word translation through `WORDS` (`table.ts`). The rename
   itself is the language service's: the declaration, every reference, every
   import and export, shorthand properties (`{ journal }` becomes
   `{ journal: log }` where the property keeps its name).
3. **Members** (properties, methods) are renamed like the rest **unless their
   name is a format**: a member is kept when it can be reached, through the
   types, from what leaves the process or comes into it (`exchanged.ts`):
   `JSON.stringify` / `JSON.parse … as T`, the log's payloads, `console.*`,
   child process options, SQLite statements, the app's IPC bridge
   (`app/src/vue/pont.d.ts`), `Object.keys`, `"name" in value`, type guards.
   A constant-case member (`BRIGADE_*`) is kept too: it is an environment
   variable or a key of a format.
4. **Files and folders** of `runtime/{src,test}` and `app/{src,test}` are
   renamed the same way (`garde-fous-cli.ts` → `guardrails-cli.ts`, `PATHS`
   for the whole-name ones), with `git mv`. Every path written in text that
   names a moved file — imports, `node src/…` in `package.json` and in the
   systemd units, a file named in a test, a doc — is rewritten, but only if it
   resolves to a file that exists and moves (`docs/superpowers/` and the
   `CHANGELOG.md` are history: left as written).
5. **The proof.** After writing, the tool loads the renamed tree again and
   checks that **every identifier resolves to the same declaration as
   before** — moved, renamed, but the same one. A rename that would capture
   or shadow another name fails here, not in a test.

What it does **not** touch: strings and values (states such as `ouverte`,
`retenue`, the words written to the log, to `status`, to the box's output),
comments, test messages. Comments and test messages stay French for this
delivery (#1003, criterion 5); values are formats.

## The table

`table.ts`:

- `WORDS` — the glossary's French → English words, as they are written in a
  name (no accents, lower case). Word sequences are matched longest first
  (`en attente` → queued before anything else).
- `NAMES` (`names.ts`) — whole names, when the word-by-word translation would
  leave French words around the glossary term (`ouvrirLEcran` →
  `openTheScreen`, not `ouvrirLScreen`), or when a word means something else
  there (`porte` the verb « carries », `tirer` « draw »). A key is a name, or
  `<file>#<name>` for that file only.
- `PATHS` — whole names of files and folders, by path.
- `KEPT_FILES`, `KEPT_NAMES`, `KEPT_MEMBERS` — the exceptions, each with why.
- `FIXUPS` — text edits the references cannot carry, applied with the rest.

## Replay

From the commit that adds the tool, on a clean tree:

```sh
npm --prefix scripts/rename-code ci
node scripts/rename-code/rename.ts --plan   # what it would do, nothing written
node scripts/rename-code/rename.ts          # rename, move, then prove
```

The result is the next commit: `git diff <that commit>` after a replay is
empty. The run takes a few minutes (the proof loads the program twice).

## Check

```sh
node scripts/rename-code/rename.ts --check
```

lists every identifier and path part of `runtime/` and `app/` that still holds
a glossary term and is not an exception of the table — exit 1 if there is
one. Members kept because they are a format are listed with the reason the
rename gave.
