_Use: Look into the person's databases (SQLite, PostgreSQL, MySQL, SQL Server, ClickHouse, Redis,
MongoDB, Elasticsearch) from chat: list and open saved connections, read a schema, sample rows, run a
query, or add a connection. Use when they ask about the structure or contents of a database, want a
query run, or hand you a connection to work with._

# Work with a database

Everything goes through one tool, `database_client`, and its `action`: `connections`, `schema`,
`browse`, `query`, `connect`, `test`, `reconnect`, `disconnect`, `remove`. Saved connections belong
to the person, not to a chat or a project; every chat sees the same list. A saved connection is not
the same as an open one: a restart drops every open connection, and nothing reopens it for you.

## Find your footing

1. Start with `connections`. It lists each saved connection with its engine, `(read-only)` when it is
   one, whether it is connected, and its `id`.
2. A call that says no database is connected, or that a connection is not connected: use `reconnect`
   with that `connection_id`, then repeat the call.
3. `browse` and `query` take the only connected database when you omit `connection_id`. With several
   connected they refuse and list the options. `schema` does not choose: without a `connection_id` it
   only lists the connected databases, so always pass the id.

## Which action for which request

- "What tables are there?" — `schema` with `connection_id`. It lists tables and views per schema,
  200 objects at most; ask for a specific table beyond that.
- "What does this table look like?" — `schema` with `connection_id` and `table` (and `schema` to
  qualify it): columns, keys, indexes, triggers. A schemaless engine returns no columns; sample it
  with `browse` instead.
- "Show me some rows" — `browse` with `table`. It reads a bounded page by identity, quotes names for
  you and never writes: `limit` 1–50 (default 20), `offset`, `sort_column`, `sort_direction`. Prefer
  it to `query` whenever you only want to see data.
- A filter, join, aggregate, count or a native command — `query`, in the engine's own language (the
  result header names the engine and its language). Learn the schema first, select only the columns
  you need and add a `LIMIT` (`TOP` on SQL Server). You are shown 50 rows at most; a result past
  10,000 rows is cut and says so, so add a `WHERE` or an aggregate instead of paging.
- A text with several SQL statements runs one by one and stops at the first one that fails; the error
  says which. Do not assume the statements before it were undone.
- A statement over 30 seconds is cancelled.

## Writes and read-only connections

`query` runs on the person's real database. Anything not proven to be a plain read is treated as an
irreversible write, and may be held for the person's approval; a plan session that must not write
refuses it. If a write is declined, do not try to reach the same effect another way.

- Check the connection first. A read-only connection refuses every write with "Connection is
  read-only"; do not work around it. Read-only is a guard against accidents, not a security
  boundary, so never suggest it makes a risky statement safe.
- Run a write only when the person asked for that change. Name the table and the statement you will
  run before you run it, and say what it changed afterwards (affected rows, tables).
- A `DELETE` or `DROP` cannot be taken back. Ask first unless the person named the exact
  target.

## Add or manage a connection

- "Connect to X" — `connect` with a `url` (`postgres://app@db.internal:5432/shop`), a `file` for
  SQLite (a path, or `:memory:`), or `host`, `port`, `user`, `password`, `database`. The engine is
  read from the url scheme or a `.db`/`.sqlite` file; pass `engine` for `http(s)://` urls, which may
  be ClickHouse or Elasticsearch, and for any other file. Add `name` for a display name.
- When unsure the target works, `test` first: it opens and closes the connection and saves nothing.
- A SQLite `file` that does not exist is created. Confirm the path when the person did not name it.
- Set `readonly: true` for production data unless the person wants to write.
- Prefer a vault reference, `${secret:KEY}`, to a literal password in a call. Replies never show
  credentials or full urls, so do not ask for them back.
- `disconnect` closes it and keeps it saved. `remove` forgets the saved connection and its stored
  credential for good: only when the person asks for exactly that.

## What the person attaches

- A connection, schema, table or column the person links in a message (`@resource:` picker) reaches
  you as text: engine and query language, schemas, a table's columns and keys with an approximate row
  count, and a few recent successful query shapes with literal values removed. It holds no
  credentials and no row data.
- A query console, `.sql` file or table tab that is open can hand you what is on screen: the unsent
  draft, the open result with the query behind it (200 rows at most), the last 12 output entries
  with errors, or the visible page of a table. Answer from that before querying again; call the tool
  when it is missing or stale.

## After you act

The workbench refreshes by itself after a successful write, so do not paste a table into the chat.
Say what you found in a sentence or two, the numbers that matter, and what you ran if it changed
anything. A failure is reported as the error and the next step, such as reconnecting.
