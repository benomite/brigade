## Viewing an interface delivery in my browser

A delivery that touches a project's interface can be viewed in the workstation's browser
before saying yes or no. The path takes four gestures and a stop: declare, serve, open,
say, and the server stops by itself. It is only for looking: **the verdict is given on
the ticket's issue, and this path does not block the merge** (see #399, T3).

### Declaring how the project is served

Next to its `worktree-setup.sh`, the project's repo carries a `.claude/brigade/service` file
(`runtime/src/service.ts`). "key: value" lines; an empty line or one starting with `#` does not
count, any other line is a stated problem:

```
commande : python3 -m http.server "$BRIGADE_PORT" --bind 127.0.0.1 --directory app
interface : app/src/vue
```

- **`commande`**: only one. A shell line, launched at the worktree root, in the
  environment the setup returns. It listens on `$BRIGADE_PORT` and on the loopback, and
  runs until stopped. No port is written in the file.
- **`interface`**: one line per repo path, relative to its root: a file, or a folder and
  everything in it. No pattern (`*`, `?`). A delivery whose diff touches one of these
  paths touches the interface: that is what gets served. `.` is not an interface path.

Without this file, the runtime says so ("this project does not declare how it is served") and serves
nothing: no command is guessed. A project that declares nothing has nothing broken; the reason is
read in `station` and `status`.

### Serving

When a cook delivers a pushed commit that touches an `interface` path, the runtime launches the command
**in that cook's worktree**, on **that worktree's port**: `BRIGADE_PORT`, which the setup sets
to `20000 + <issue number>`. Two worktrees have two ports and do not cross; the runtime never
picks another. The command starts in the same partition as the cook, and in its own
process group.

- `station` and `status` list each server: its ticket, its worktree, its port, `starting`
  (the port does not answer yet) or `listening`, and the page of the screen to look at:
  `http://127.0.0.1:<port><route>`, never the root, or why there is none.
- Under each server, further indented, `status` gives the screen and who said it, then the cook's sentence:

  ```
    #591  worktrees/591-ab12cd34  port 20591  listening since 3 min  cook/591-ab12cd34  http://127.0.0.1:20591/rail
      screen: /rail (declared by the cook)
      to look at: #591 : le rail a maintenant deux colonnes, TODO et WAITING
  ```

  A screen the cook did not declare, deduced from the touched files, says so:
  `screen: /rail (screen deduced from the touched files, not declared by the cook)`. With no screen, nothing
  below. Deliveries of an app that does not open in a browser, under `to launch`, carry
  the same lines. (`status` has written them in English since #940: `écran :`, `à regarder :`, `à lancer`
  before; `station` still writes them in French.)
- A delivery without interface launches nothing. What prevents serving (undeclared project,
  worktree without a port, unreadable declaration) is stated instead, once, and is read in the
  same two commands.

### Opening

On the ticket's card, the app puts what `status` says about its delivery: the screen to look at, the
cook's sentence (it is what you are shown), and, when the screen is deduced, the mention "screen
deduced from the touched files, not declared by the cook". Never a list of files. Then one gesture,
**only if there is a page to see** and the server is **listening**: **see it in my browser**. The app
opens a port forward to your box through the `ssh` it already has (`ssh -N -L`, to the same host,
with no command after the host), then opens, with the workstation's open command, the local address
followed by the screen's route, **never the worktree root**, which a file server
renders as a folder listing. Nothing is launched on the box for this: the server already runs from the
worktree.

Without a screen, or without a page for it (a screen that is not a route, a line that writes only the
root or nothing): no button at all, and what `status` writes in its place is read on the card.
For an app that does not open in a browser (`lancement`, like `brigade`): no button,
and the card says how to see the screen: the command that launches the app on the delivery's worktree,
and the screen to open in it. Without a server, undeclared project, server starting, dead runtime or
unread `status`: no gesture, and the reason is written in its place. The forward closes as soon as a read of `status` no longer
shows its server, when its project leaves the app, and when the app closes.

Next to the gesture, the app reminds you: it opens the page, it does not show it and collects no
opinion. **Your yes or no is said on the ticket's issue**; its number opens it, on the rail.

### Saying

The verdict is placed on the ticket's issue, and it is the issue that counts, not the browser. Neither the app
nor the runtime records a yes or a no for this page: do not expect an app gesture
to validate or refuse the delivery.

### Stopping

Nobody has to stop the server. It stops by itself, and its worktree is cleaned up with it, as soon as:

- the ticket is **served**, or has **left the rail**;
- a cook **takes back** the ticket, in a fresh worktree (the old one's server stops first);
- its worktree is cleaned up otherwise, or no longer exists;
- its command **exits by itself** (a taken port, a command that serves nothing): the log keeps
  what it said;
- the runtime goes away: no server outlives its runtime, and a life that begins inherits none.

A server that holds its worktree prevents it from being cleaned up: it is cleaned up only once stopped. Each
stop is written to the log, with its reason (`service.stopped`).

### What this path does not do

Three exclusions, not to be expected from it:

- **It is not a staging environment.** Nothing is deployed: the server is a worktree's, launched
  from the delivery, and it stops with it.
- **The cook does not drive a connected browser.** It does not look at the page and takes no
  screenshot of it: you are the one who looks.
- **No validation is done in the app.** No yes or no button, no recorded verdict: the
  verdict is said on the issue.

