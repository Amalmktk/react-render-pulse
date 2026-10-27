# Security

## Reporting a vulnerability

Please don't open a public issue. Report it privately through GitHub: on the repository, go to **Security → Report a vulnerability** ([private vulnerability reporting](https://github.com/Amalmktk/react-render-pulse/security/advisories/new)).

Include what's affected (client, collector or viewer, and the version), how to reproduce it, and the impact. You'll get a reply within a week.

## Scope

Especially relevant:

- The collector accepting or storing data it shouldn't (validation, size limits, origins, rate limits).
- The client sending anything beyond the documented payload, or breaking the host app.
- The viewer's server exposing files or data beyond the report API.

The viewer binds to `127.0.0.1` by default and has no authentication; exposing it with `--host 0.0.0.0` is at your own risk.
