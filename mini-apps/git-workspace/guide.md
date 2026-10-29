_Use: Work with the person's Git repositories: read the diff, commit, branch or working-tree status
they attach to a message, and run `git` yourself for history, commits, branches, stashes and merge
conflicts. Use when a diff, commit, branch or repository is attached, the Git tab is open, or they
ask what changed, what to commit, or how to resolve a conflict._

# Work with Git changes

Git gives you no tools. The Git tab is the person's view of the repository of the chat it was opened
from; you reach that repository through what they attach to a message and through your own shell
(`git`).

## What arrives with a message

When the chat belongs to a project and the Git tab is open, the message offers its **Working tree
status** as a chip the person can dismiss. They can also pick from the message box's `@` menu:
**Repositories**, then the project (then the repository, when it holds several), then **Branches**,
**Commits**, **Working status**, **Staged** or **Unstaged**; a commit opens to its files too. The
text comes to you between `--- Context …` and `--- End context ---` lines, opening with
`Repository path (run git / read files here): …`. That path is the project's folder, and in a
project of several repositories not the workspace root: check it is the checkout you work in. Each:

- **Repository:** branch (or detached HEAD), upstream, ahead and behind, changed-file count, tip.
- **Working status:** every changed file with its status and `+/-` counts, then a diff. The file
  list is complete; the diff is the **staged** set when anything is staged, otherwise all changes,
  with new files and very large diffs sampled. With several repositories it is the container
  repository's, or else the first one found.
- **Staged, Unstaged:** that diff alone (unstaged covers tracked files only). **Commit:** author,
  date and the full patch, or one file's diff. **Branch:** upstream, date of its last commit, and
  `Diff vs base`: the base named there is the branch's own upstream when it has one (so a branch
  that tracks its remote twin shows only what is unpushed), else `origin/main`, `origin/master`,
  `main` or `master`. It is `base...branch`, what the branch added since it diverged.
- A cut diff says `too large to show in full — leading files only`: the rest is not there.

## What the attachment is not

- **A moment, not the present.** It was read when the message was sent; later turns keep that copy.
  Run `git status`, `git diff`, `git log` before you act on a diff from earlier in the chat.
- **Not always there.** An attachment over about 8 KB is dropped whole, not cut, and so is one that
  looks like it holds a credential. A commit patch or a working diff is often over. You then get
  one line, `@resource:<link>: not included — … Read it with your tools`: use `git show <sha>`,
  `git diff`, `git diff --cached`. Do not repeat a secret you find.
- **Not the whole state.** The status does not say whether a merge, rebase, cherry-pick or bisect is
  underway. Run `git status` first.

## Conflicts

The attached status lists a conflicted file as `conflicted`; the tab shows it under **Merge
Changes**. The app has no conflict editor of its own: the file opens in the file editor, which
resolves each marker block as current, incoming or both. **Stage as resolved** is `git add <file>`.

To resolve one yourself, read the file, keep what both sides meant (not simply one side), remove
every `<<<<<<<`, `=======`, `>>>>>>>` line (search to be sure), then `git add` that file. The tab
refuses to commit or amend while any conflict remains, so check `git status` is clear first. In a
rebase it offers **Continue**, **Skip** and **Abort**: stage the resolved files, then continue.
Skip drops that patch and Abort backs out of the whole rebase, so those are the person's call.

## Reviewing and changing

Review the scope you were given and say which: staged is what a commit would take, unstaged what it
would leave, a branch its changes against the base. Do not edit while reviewing unless asked. Say
what you will run before you change anything. The tab's own rules are the ones to follow:

- **Commit:** the tab commits what is staged and, with nothing staged, stages every change first.
  Look at `git status` and tell the person what goes in. Use `-m` so no editor opens.
- **Pull:** only fast-forward (`git pull --ff-only`). If history has diverged, say so; do not merge
  or rebase on your own.
- **Push:** a plain push. After a rejection the tab offers `--force-with-lease`, never a bare
  `--force`, and only for history the person rewrote. The shell flags `git push --force`, `-f`,
  `--force-with-lease` and `--mirror` as dangerous.
- **Discard, nuke, drop a stash, hard reset, `branch -D`, rewrite history:** the tab confirms
  discard, nuke and stash drop, because Git keeps nothing to recover. Ask first, say which files
  are lost.

The tab picks up your changes (a branch switch, a `git add`) within about two seconds; do not ask
the person to refresh it.
