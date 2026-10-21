## Looking at an interface delivery in my browser

A delivery that touches a project's interface can be looked at in the workstation's browser before
saying yes or no. The flow takes four gestures and a stop: declare, serve, open, say, and the server
stops by itself. It only serves to look: **the verdict is given on the ticket's issue, and this flow
does not block the merge** (see #399, T3).

### Declaring how the project is served

The project's repository carries, next to its `worktree-setup.sh`, a file `.claude/brigade/service`
(`runtime/src/service.ts`). "key: value" lines; an empty line or one that starts with `#` does not
count, any other line is a problem that gets reported. The keys (`commande`, `interface`,
`lancement`) are read by the runtime in French, so they stay French until it is translated:

```
commande : python3 -m http.server "$BRIGADE_PORT" --bind 127.0.0.1 --directory app
interface : app/src/vue
```

- **`commande`** — only one. A shell line, launched at the root of the worktree, in the
  environment the setup returns. It listens on `$BRIGADE_PORT` and on the loopback, and runs until it
  is stopped. No port is written in the file.
- **`interface`** — one line per path of the repository, relative to its root: a file, or a folder
  and everything it contains. No pattern (`*`, `?`). A delivery whose diff touches one of these
  paths touches the interface: that is what gets served. `.` is not an interface path.

Without this file, the runtime says so — "this project does not declare how it is served: its
repository has no `.claude/brigade/service` — a "commande: …" line (or "lancement: …" for an app
that does not open in a browser), and one "interface: <path>" line per path whose change touches the
interface" — and serves nothing: no command is guessed. A project that declares nothing has nothing
broken; the reason is read in `station` and `status`.

### Serving

When a cook delivers a pushed commit that touches an `interface` path, the runtime launches the
command **in that cook's worktree**, on **that worktree's port**: `BRIGADE_PORT`, which the setup
sets to `20000 + <issue number>`. Two worktrees have two ports and do not cross; the runtime never
chooses another. The command starts in the same partition as the cook, and in its own process group.

- `station` and `status` list each server: its ticket, its worktree, its port, `starting` (the port
  does not answer yet) or `listening`, and the page of the screen to look at —
  `http://127.0.0.1:<port><route>`, never the root — or why there is none.
- Under each server, set further in, `status` says the screen and who said it, then the cook's
  sentence:

  ```
    #591  worktrees/591-ab12cd34  port 20591  listening since 3 min  cook/591-ab12cd34  http://127.0.0.1:20591/rail
      screen: /rail (declared by the cook)
      to look at: #591 : le rail a maintenant deux colonnes, TODO et WAITING
  ```

  The sentence after `to look at:` is the cook's own, in whatever language it wrote it. A screen the
  cook did not declare, deduced from the touched files, says so:
  `screen: /rail (screen deduced from the touched files, not declared by the cook)`. Without a
  screen, nothing underneath. The deliveries of an app that does not open in a browser, under
  `to launch`, carry the same lines. (`status` writes these words in English; they were French before
  #940 — `écran :`, `à regarder :`, `à lancer`.)
- A delivery without an interface launches nothing. What prevents serving — undeclared project,
  worktree without a port, unreadable declaration — is said instead, once, and is read in the same
  two commands.

### Opening

On the ticket's card, the app puts what `status` says of its delivery: the screen to look at, the
cook's sentence — that is what you are shown —, and, when the screen is deduced, the mention "screen
deduced from the touched files, not declared by the cook". Never a list of files. Then one gesture,
**only if there is a page to see** and the server is **listening**: **see it in my browser**. The
app opens a port forward to your box through the `ssh` it already has (`ssh -N -L`, to the same
host, with no command after the host), then opens, with the workstation's open command, the local
address followed by the screen's route — **never the root of the worktree**, which a file server
renders as a folder listing. Nothing is launched on the box for this: the server already runs from
the worktree.

Without a screen, or without a page for it (a screen that is not a route, a line that writes only
the root or nothing): no button at all, and what `status` writes in its place is read on the card.
For an app that does not open in a browser (`lancement`, like `brigade`): no button, and the card
says how to see the screen — the command that launches the app on the delivery's worktree, and the
screen to open there. Without a server, undeclared project, a server that is starting, a dead
runtime or an unread `status`: no gesture, and the reason is written in its place. The forward
closes as soon as a read of `status` no longer shows its server, when its project leaves the app,
and when the app closes.

The app reminds you, next to the gesture: it opens the page, it does not show it and collects no
opinion. **Your yes or your no is said on the ticket's issue** — its number opens it, on the rail.

### Saying

The verdict is put on the ticket's issue, and it is the issue that counts, not the browser. Neither
the app nor the runtime records a yes or a no for this page: do not expect a gesture of the app to
validate or refuse the delivery.

### Stopping

Nobody has to stop the server. It stops by itself, and its worktree is tidied away with it, as
soon as:

- the ticket is **served**, or has **left the rail**;
- a cook **takes** the ticket again, in a fresh worktree (the old one's server stops first);
- its worktree is tidied away otherwise, or no longer exists;
- its command **exits on its own** (a taken port, a command that serves nothing): the log keeps what
  it said;
- the runtime goes away: no server survives its runtime, and a life that begins inherits none.

A server that holds its worktree prevents tidying it away: it is tidied only once stopped. Each stop
is written to the log, with its reason (`service.stopped`).

### What this flow does not do

Three exclusions, not to be expected from it:

- **It is not a preproduction.** Nothing is deployed: the server is a worktree's, launched from the
  delivery, and it stops with it.
- **The cook does not drive a connected browser.** It does not look at the page and takes no
  capture of it: you are the one who looks.
- **No validation is done in the app.** Neither a yes or no button, nor a recorded verdict: the
  verdict is said on the issue.
