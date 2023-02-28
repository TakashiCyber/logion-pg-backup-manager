# Logion Postgres Backup Manager

The Logion Postgres Backup Manager (LPBM) is a tool that enables the (almost) real-time backup of a logion node's PostgreSQL database.
The data are encrypted then stored and replicated using [IPFS Cluster](https://cluster.ipfs.io/).

In the context of the logion network, the IPFS and IPFS cluster networks are private i.e. other nodes cannot connect unless they share
the same secrets.

## Test it

The `docker-compose.yml` file at the root of this project provides an example of LPBM deployed as a Docker container in a setup including
a PostgreSQL service, an IPFS service and an IPFS Cluster service. Note that some permissions will have to be set and require superuser
access (sudo), you may be prompted for your superuser password.

1. Run `./scripts/up.sh`
2. Follow LPBM's logs with `docker-compose logs -f lpbm`
3. In another terminal, connect to the DB (`psql -U postgres -h 127.0.0.1 postgres`) and alter its state (e.g. by creating a table `CREATE TABLE test();`)
4. Go back to the terminal showing the logs, should see a new delta being produced (this may take up to a minute,
   the minimum rotation period allowed by Postgres).
5. Execute a destroy/restore cycle by running `./scripts/restore_demo.sh`.
6. Follow LPBM's logs with `docker-compose logs -f lpbm` and see that the state was restored.
7. Connect to the DB and see that the latest state was restored.
8. (Optional) A full backup is created initially (when there is no journal yet), and once a day (according to config). But a full backup can be triggered any time by running `./scripts/full_backup_demo.sh`. 


In order to clean-up, you should execute `./scripts/down.sh`.

## Requirements

LPBM can be executed on a machine with the following setup:

- Node.js 16
- Postgres clients (pg_dump, pg_restore, psql) compatible with the PostgreSQL server to backup
- [go-ipfs](https://github.com/ipfs/go-ipfs) >=0.12.0
- [ipfs-cluster-ctl](https://github.com/ipfs/ipfs-cluster) >=0.14.5

## Usage

Initially, run `cp .env.sample .env` and ajust your settings. You may then run LPBM from source using (after installing dependencies with `yarn install`)

```
yarn start
```

However, the easiest is probably to directly use the Docker image (see `docker-compose.yml`) which comes with all requirements
pre-installed (note that the default image is currently only compatible with PostgreSQL server <=12).

## How it works

LPMB is a service that runs alongside PostgreSQL and generates full or incremental backups on a regular time basis.
The full backups are generated using `pg_dump`. The incremental backups (also called deltas) are generated by analysing the CSV logs
of PostgreSQL (see PostgreSQL configuration section). In both cases, data are encrypted
(with AES 256 CBC, IV and salt are randomly generated for each file) on-the-fly and written to disk. The resulting files
are then moved to the IPFS network. The files are replicated in order to ensure their availability in case of nodes leaving the network. Data
replication is automatically managed by the IPFS Cluster service.

The CIDs of pinned files are written to a journal file. Each time the journal file is modified, an e-mail is sent. This enables the recipient to
restore the latest DB state in case the server actually running LPBM becomes inaccessible and the journal file is lost.

Note that as long as the DB state does not change, no delta is produced and the journal file remains unchanged. Full backups are generated on a
regular time basis.

Restoring a database to its latest known state is as easy as setting the journal file to the content received by e-mail and asking to LPBM to
actually restore it. The DB must be empty before restoring data. Full backups are restored using `pg_restore` while deltas (which actually
contain SQL statements) are applied using `psql`.

## LPBM configuration

LPBM reads its configuration from the environment variables are listed below.

- `LOG_DIRECTORY`: the directory in which PostgreSQL writes its logs, note that LPBM requires write access to the log files and directory as
  it deletes treated log files.
- `WORKING_DIRECTORY`: the directory in which LPBM will write its files (including the journal file and other temporary files).
- `ENC_PASSWORD`: the encryption password from which the encryption key is derived.
- `PG_USER`: the user used to connect to PostgreSQL with `pg_dump`, `pg_restore` and `psql`.
- `PG_DATABASE`: the database used to connect to PostgreSQL with `pg_dump`, `pg_restore` and `psql`.
- `PG_HOST`: the host used to connect to PostgreSQL with `pg_dump`, `pg_restore` and `psql`.
- `SMTP_ENABLED`: a flag telling if e-mail sending is enabled (`true`) or disabled (`false`).
- `SMTP_HOST`: the SMTP server to use.
- `SMTP_PORT`: the port of the SMTP service.
- `SMTP_USER`: the user for authenticated SMTP connection.
- `SMTP_PASSWD`: the password for authenticated SMTP connection.
- `SMTP_FROM`: the sender address.
- `MAIL_TO`: the recipients (comma-separated list of e-mail addresses).
- `MAIL_SUBJECT_PREFIX`: an optional prefix for the e-mail subject (may be used in order to identify the host actually sending the notifications).
- `IPFS_CLUSTER_CTL`: the path to the `ipfs-cluster-ctl` executable.
- `IPFS_CLUSTER_HOST`: the host to use with `ipfs-cluster-ctl`.
- `IPFS_MIN_REPLICA`: the minimum replication factor of backup files.
- `IPFS_MAX_REPLICA`: the maximum replication factor of backup files.
- `IPFS`: the path to the `ipfs` executable.
- `IPFS_HOST`: the host to use with `ipfs`.
- `TRIGGER_CRON`: the CRON expression telling when LPBM should be triggered (e.g. */10 * * * * * means every 10 seconds).
- `FULL_BACKUP_TRIGGER_CRON`: the CRON expression telling when LPBM should perform a full backup instead of an incremental one, at the next trigger (e.g. 59 58 0 * * * means every day at 00:59:59).
- `MAX_FULL_BACKUPS`: the maximum number of full backups to keep (keeping more than 1 enables to restore previous states).
- `LOG_LEVEL`: the log level (can be one of `info`, `debug`, `warn` or `error`).

Note that if the PostgreSQL connection requires a password, it must be set in the [PGPASS file](https://www.postgresql.org/docs/current/libpq-pgpass.html).

## PostgreSQL configuration

Here is an excerpt of a PostgreSQL configuration file with the relevant variables:

```
log_destination = 'csvlog' # Enable CSV logging, this is required by the backup manager
logging_collector = on 	   # Required with csvlog
log_directory = 'log'	   # Logs storage folder, will be $PGDATA/log
log_filename = 'postgresql-%Y-%m-%d_%H%M%S.log' # Log file name pattern
log_truncate_on_rotation = on # Recommended with age-based rotation
log_rotation_age = 1min # Rotate logs every minute, it is currently not possible to have a sub-minute rotation age
log_rotation_size = 0 # Disable size-based rotation
log_statement = 'mod' # Log only updates, this is required by the backup manager
```

**WARNING**: Setting `log_rotation_age` to less than 1 minute actually disables rotation, which as a consequence prevents the detection of new deltas (LPBM only reads post-rotation logs).

## Known limitations

- Currently, LPBM is specific to the logion use case as it ignores some statements to prevent the creation of useless increments.
- The increments are built from the CSV logs, any state modification which is not output to the logs (e.g. importing large objects) by Postgres will be ignored.
- The minimum rotation period allowed by Postgres is 1 minute which means that data are safe at worst after 1 minute plus LPBM's trigger period.
