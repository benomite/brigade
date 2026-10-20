# Acceptance: adding a second project on the box, through the app only

Step-by-step scenario, to be played by the chef on a box where a first project is already served.
No terminal is opened by hand, except the cases called "terminal" below. The step and button names
are the ones the app displays (in English for the buttons, like the app); the doc is
`docs/installer.md`, "Per project: the path through the app".

**Prerequisites**: the box has an up-to-date installation command and service start command, a
logged-in `claude` account, `gh` logged in under your account; your workstation has the brigade
plugin; the second project has a GitHub repo and a cloned folder on your workstation; the box is
declared in the app.

**Do not**: no `sudo tee`, no drop-in, no `brigade <project> station …` by hand.

## The scenario

| # | Action in the app | Expected result | Passes if |
|---|---|---|---|
| 1 | Foot of the project bar: `Add a project` | the add screen opens | the form is displayed |
| 2 | `Choose…` the folder; check the proposed name and repo; pick the box; keep or change the manager and reviewer calibration; check where the backups go | the name, the repo (read from the origin) and the destination are prefilled, the calibration is suggested with its provenance | no field is flagged as refused |
| 3 | `Install on the box, and add` | "Request in progress" then the box's output, as is: ports allocated | the project appears in the bar; `It is not served yet: its installation goes on in its space, step by step.` |
| 4 | `Open the space of “<name>” — its installation goes on there` | Settings opens on the installation, **unfolded**: the seven steps are listed from the start, each with "What it is for:" and "If you skip it:"; the current one carries "← now" | the seven titles are read, in order: 1. Ajouter le projet sur la box · 2. Amorcer le dépôt · 3. Vérifier la box · 4. Déclarer les stations · 5. Protéger la branche d'intégration · 6. Poser les décisions que le démarrage réclame · 7. Démarrer la cuisine |
| 5 | Read the box "What the app cannot do for you — said before you meet it" | what the app will not do is said before any button: the init, what the box lacks (with its command), the service start | the box comes out of "The box is being verified" with its verdict |
| 6 | Step 1 | "done" with no action | nothing to do |
| 7 | Step 2: `Run /brigade:init in the second`, conversation, merge the PR onto the integration branch, then `The result of /brigade:init is merged onto the integration branch` | the space's second opens `claude /brigade:init`; the step goes to "done" | the integration branch carries the init's result |
| 8 | Step 3: `Verify` (replay as often as needed) | the launched line, the output of `installation` and its code, in full; each `MANQUE` is also under the step that fixes it | verdict `READY`; an `à savoir` line holds nothing back. If something is missing on the box itself (box command too old): **terminal**, the command it names — normally `sudo git -C /opt/brigade pull --ff-only` —, then `Verify` |
| 9 | Step 4: tick the proposed stations, enter the cooks at once, `Declare the stations` | "Declared now: …" lists each station and its cap | the step is "done"; "Verify" no longer says `aucune station déclarée` |
| 10 | Step 5: `Protect the integration branch` | the branch is said to be protected on the repo, with no missing right | the step is "done"; a missing right is written with its action |
| 11 | Step 6: for each decision, read its question, its options and the recommendation, choose, `Answer` | one decision at a time, "N decisions waiting" goes down; the optional ones are skipped with `Skip the optional decisions — the start does not require them` | "No decision waiting." |
| 12 | Step 7: `Start` | the box rechecks everything; only if it is green, the installation is marked finished; a shell opens in the space with `ssh -t <host> sudo systemctl enable --now brigade@<name>.service` written, **not sent** | "The installation is finished: the box verified everything, the kitchen is ready to serve, and no installation step is left." |
| 13 | In that shell: Enter (and the `sudo` password if asked) | the service starts | `brigade@<name>.service` is active |
| 14 | Close the app, reopen it | the seven steps are back to "done", nothing to redo | no action is asked |

## Final success criteria

1. **The kitchen serves the project**: after the Enter of action 13, `brigade <name> status` (or the
   app's watch) shows the project's runtime active, its declared stations, the rail read; a
   `fire` ticket put on a short issue is taken by a cook.
2. **No action is asked after "finished"**: the installation screen has no current step, no
   active installation button, no `MANQUE`; the reopened app asks for nothing again.
3. **The first project has not moved**: its service, its ports and its rail are unchanged.

## If it sticks

A step that refuses says why under its button or under the right-hand tabs; what the box returned
is displayed as is. A box whose runtime is older than the step returns "THE BOX DID
NOT RETURN WHAT … RETURNS": starting a version (alert band) updates it.
For each step, note what was seen and the time: that is the acceptance report.
