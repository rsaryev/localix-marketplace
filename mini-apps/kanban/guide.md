_Use: Keep this chat's task board (Kanban): put multi-part, durable work on it as epics and tasks, take
a card before you work it, tick its checklist, complete or block it, and read what the person has
arranged. Use when the work has several parts or must survive the conversation, or when the person
asks you to add, move, assign or report on cards; a small single deliverable needs no card._

# Keep the task board

Each chat has its own board, kept in that chat's folder and deleted with it. There is no board for the
project or the user, and every call acts on the board of the chat you are in. Everything goes through
one tool, `kanban`, and its `action`: `list`, `search`, `detail`, `create`, `update`, `take`,
`complete`, `block`, `reorder`, `delete`.

## The board is passive

It records work and never starts it: no card, status or assignment starts a run or wakes you. When the
person moves a card you are not told, so `list` the board before you plan or report progress. Who does
a card's work is your decision, made with your own tools.

Cards are `LX-<n>`, either an `epic` (a container for tasks) or a `task`. Statuses: `backlog`,
`ready`, `in_progress`, `blocked`, `review`, `done`, `cancelled`. Name a card by its id or exact
title; a unique part of the title works too, and an ambiguous one lists the candidates.

## Which action for which request

- "What is on the board?", "where are we?" — `list` (50 cards at most, epics with their tasks
  beneath). `search` with `query` finds cards whose id, title or description hold every word.
  `detail` with `task_id` gives one card's full brief: description, checklist, dependencies, paths.
- "Plan this", "add a task" — `create`. Put a whole plan in one `creates` batch, epic first and
  prerequisites before what waits on them. `depends_on` and `parent` may name an earlier entry by
  title. Do not put `title` or other card fields beside `creates`. Cards land in `backlog`. If an
  entry is refused, the earlier ones are already on the board: retry only the missing ones.
- Change text, owner, epic, priority, dependencies or checklist — `update`. It moves a card only to
  `backlog`, `ready` or `cancelled`. `priority` runs from -2 to 2.
- Start work yourself — `take` (see below). Finish — `complete`. Stuck — `block` with a concrete
  `note`. These are the only ways to `in_progress`, `done` and `blocked`; `update` refuses them.
- Reorder inside a column — `reorder` with `sort_order`.
- `delete` removes the card for good and cannot be undone; only when the person asks. Its tasks
  become top-level cards and it disappears from other cards' dependencies.

An action refuses a field it does not read, by name, and changes nothing; call the action that does.

## Doing a card

1. `take` it before you work it yourself. It needs a `backlog`, `ready` or `blocked` task whose
   dependencies are all `done`, and it assigns the card to you. An epic cannot be taken: take its
   tasks.
2. A card assigned to another agent is refused. Hand it to a subagent (`Agent`) with the card's
   `detail` as the brief, or reassign it first with `update` and `agent`. The subagent knows nothing
   of the board; the card stays yours to `complete` or `block` after you review its report.
3. Tick as you go: `update` with `items` as the whole checklist in order. A plain string keeps an
   item's tick; `{ text, done: true }` sets it. An epic holds no checklist.
4. `complete` finishes it; `items_done: true` ticks the whole checklist in the same call. The answer
   names the cards it released and any items still unticked. When it says an epic's last task is
   finished, `complete` the epic once its goal is met. `review` is a column for the person: you
   finish with `complete`.
5. `block` moves the card to `blocked` and records the obstacle; once it is cleared, `update` it to
   `ready` (that clears the note) and `take` it again.

## Cards for the person

`agent: "user"` assigns a card to the person (other values are an agent's id or name). The board tells
them, and the card waits for them: you cannot `take` or `complete` it. Reassigning a card that is
`in_progress` or in `review` puts it back to `ready`. `cancelled` is final; create a new card instead.

## What the person attaches

A board or card the person links into a message (`@resource:` → Board, or dragging a card) reaches
you as text: the board as `list` shows it, a card as its `detail` with its status. It is a snapshot,
so re-read before you act on it.

## After you act

The board shows the person every change live, so do not restate it. One short line: what you created,
took, completed or blocked, with the card id. After you put new work on the board, `create`
returns an "Open board" link; give it when the person should look.
