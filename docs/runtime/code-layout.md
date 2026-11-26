# Runtime code layout

`runtime/src/` holds the runtime's code, one directory per subsystem. This page lists each directory,
the page of [`docs/runtime/`](README.md) that describes its subsystem, and what belongs in it. The
words are those of [`docs/glossary.md`](../glossary.md).

Until the move lands, the files are still flat in `runtime/src/`: the layout below is where they go.

## The directories

| Directory | Page | What belongs in it |
|---|---|---|
| `station/` | [station.md](station.md) | The station that takes a ticket and runs a cook on it: its start and stop, its several cooks, its worktree setup and its gates. |
| `rail/` | [journal-et-rail.md](journal-et-rail.md) | The log, the append-only record of events, and the rail of tickets to serve, with what is awaiting and the rail display. |
| `github/` | [quota-github.md](quota-github.md) | The calls to GitHub, their rate limit, and the identity each role uses to call it (see [identites-et-secrets.md](identites-et-secrets.md)). |
| `pass/` | [pass.md](pass.md) | The pass that judges a delivery: its gates, its review decisions, and the verdict it hands back. |
| `manager/` | [manager.md](manager.md) | The manager's judgement on the rail, and the epics it splits into tickets. |
| `bac-a-sable/` | [bac-a-sable.md](bac-a-sable.md) | The cook's sandbox, the model the other directories follow, with its partition (`cloison`) that walls off what a cook may reach. |
| `second/` | [role-produit.md](role-produit.md) | The second, the product assistant the chef wakes to write and file tickets. |
| `cli/` | [exploitation.md](exploitation.md) | The box commands: each `*-cli.ts` entrypoint is kept short, and runs one command of `npm --prefix runtime run`. |

At the top of `runtime/src/` stay `main.ts`, which starts the runtime, and `status.ts`, which shows the
status of a project.

## Where does a new file go?

1. **Find your part.** Take the subsystem the file serves from the table above, and read its page in
   `docs/runtime/`.
2. **Write it in that part's directory**, `runtime/src/<directory>/`, and nowhere else.
3. **Never add a file at the top of `runtime/src/`**, except `main.ts`, `status.ts` and the entrypoints
   named by npm scripts in `runtime/package.json`.

If no directory fits the file, the part is missing from this page: add it to the table, with its page,
before you write the file.
