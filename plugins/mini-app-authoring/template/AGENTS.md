# Working on the reference mini app

This is Daily Log, the mini app every user mini app is created from: the mini-app-authoring plugin's
`mini-app create` copies it into a new folder under a new identity, and the agent replaces its
domain. It lives in the plugin it ships with and is checked like any mini app in this repository.

What a copy is made of is declared in `scaffold.json`, and every part of it is load-bearing:

- **Entry** — same path and export in every copy, body replaced: `.localix-mini-app/mini-app.json`, `guide.md`,
  `icon.svg`, `backend/index.ts` (`register`), `ui/register.tsx` (`registerUi`).
- **Domain** — Daily Log itself, replaced by each copy. Its identifiers on `domainTokens` are the
  residue the plugin's check reports; one a copy may rightly keep (`{snake}_summary`) is not listed.
- **Patterns** — each domain file is the pattern for its part (a collection, a tool, a settings
  route, the screen, a chart, a list, a form, the tests), named at an anchor the file contains. Keep
  each the best example of its kind: copies imitate them.

There is no frame of copied helpers: the plumbing is the SDK's app layer
(`@localixai/mini-app-sdk/backend` and `/ui`, declared in the kit). A fix to it reaches every copy
at once.

House rules the copies inherit from here:

- `shared/model.ts` is the contract: schemas and the pure logic both sides use. The screen and the
  tools compute what they show with the same function.
- What the person and the agent create lives in a collection. The screen reads it with
  `useCollection` and changes it through it; it never keeps a second copy of the list.
- Every control comes from the host kit, `@localixai/kit/<id>`, coloured with host tokens; the
  plugin's style step applies the rules. A native control kept on purpose (a board square, a row
  clicked as a whole) says why: `{/* mini-app: native-control — <reason> */}` on its line or the
  line above; a marker without a reason fails the check. Never import `@/…`: the UI is built into
  its own artifact.
- The screen publishes what it shows as message context and clears it when inactive
  (`useAgentContext`).
- No word "template" in prose of a shipped file: the scaffold renames it to the copy's name.

Choose checks for the changed contract. Run a focused test under this mini app, and
`bun run check template` from the repository root: the same `mini-app check` a copy gets, with the
template's own names allowed. Changes to what copies are made of also need the plugin's tests
(`bun run test:plugins`): they create a copy and check it.

For visible changes, look at the screen in Localix at narrow and wide widths.
