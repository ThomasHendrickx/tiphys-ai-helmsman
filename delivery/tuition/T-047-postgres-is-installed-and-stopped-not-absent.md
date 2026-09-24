# T-047: Postgres is installed and stopped, not absent

## What happened

On 2026-09-24 the M5-P6 hemma intake recorded that hemma's build, full test
and Playwright E2E runs could not be run locally because "this container does
not have" Postgres, and the orchestrator repeated it to the owner. The owner
answered that every session says this and it is false.

It was false. Measured the same day:

```
$ which psql pg_ctlcluster
/usr/bin/psql
/usr/bin/pg_ctlcluster
$ pg_lsclusters
16  main    5432 down   postgres /var/lib/postgresql/16/main ...
$ service postgresql start
 * Starting PostgreSQL 16 database server
   ...done.
$ pg_lsclusters
16  main    5432 online postgres /var/lib/postgresql/16/main ...
```

## The mechanism

A service that is INSTALLED but STOPPED reads exactly like one that is
ABSENT to a probe that only tries to connect. Connecting fails either way. The
probe measured "not running" and the report said "not present".

## The trap next to it, and it is the dangerous one

The ambient environment sets `DATABASE_URL` and `E2E_DATABASE_URL`, and both
point at a REMOTE Supabase pooler, not at the local cluster. From this
container the connection timed out. A session that "finds" a database by
reading those variables would run migrations or E2E against a remote, possibly
production, database. Never use them for tests.

## The procedure

1. `pg_lsclusters`. If the cluster is `down`, `service postgresql start`.
2. Create a local database: `su postgres -c "createdb <name>"`. The local
   superuser password was set to `postgres` on 2026-09-24; a fresh container may
   need `su postgres -c "psql -c \"alter user postgres password 'postgres'\""`.
3. Override EVERY database variable the project reads, on the command itself,
   to `postgresql://postgres:postgres@localhost:5432/<name>`, and print the
   resolved host before any migrate or test run.

The same shape as CLAUDE.md standing warning 14: a check that returns the same
answer in two different states cannot tell them apart. Related entry on a
different axis: delivery/tuition/T-044-a-suite-flake-blamed-on-load-was-a-permission-bit.md:1.
