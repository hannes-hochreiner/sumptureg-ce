# NixOS Module Design: sumptureg Production Deployment

**Date:** 2026-07-14

## Overview

A NixOS module that deploys the full sumptureg stack: the PWA (static files), CouchDB as the database backend, nginx as the TLS reverse proxy, and `static-ip-authentication-proxy` (siap) for IP-based proxy authentication into CouchDB. All secrets are auto-generated and managed by the module — the operator provides only the domain name and TLS certificate/key.

---

## Architecture

```
Client (HTTPS:443)
  │
  ▼
nginx (virtual host: cfg.domain)
  ├── /               → static files from sumptureg package ($out/var/html)
  ├── /api            → auth_request /auth → proxy_pass CouchDB /sumptureg
  ├── /api/_session   → auth_request /auth → proxy_pass CouchDB /_session
  └── /auth (internal)→ siap via Unix socket (GET /auth)
                           reads X-Real-IP + X-Original-Host
                           returns 200 + X-Auth-CouchDB-{Username,Roles,Token}
                                  or 401

siap  (Unix socket: /run/siap/siap.sock)
  └── hosts map keyed by domain → ip_mapping + proxy-secret

CouchDB (127.0.0.1:5984, loopback-only)
  └── proxy auth: verifies token via shared HMAC secret
  └── database: sumptureg (security set by setup service)
```

nginx makes auth sub-requests to siap via a Unix domain socket — no TCP port is allocated for siap. CouchDB cannot bind to a Unix socket (Cowboy/Erlang limitation) so it stays on loopback TCP at the default port 5984.

---

## Repositories and Changes

### `static-ip-authentication-proxy` — small changes required

| What | Change |
|---|---|
| `Cargo.toml` | Add `"unix"` to Rocket features: `features = ["json", "unix"]` |
| `flake.nix` | `nixosModules.${system}.default` → `nixosModules.default` |
| NixOS module | Add `package` option defaulting to `self.packages.${pkgs.system}.default` |
| NixOS module | Declare `hochreiner-siap` as a system user/group; add `ROCKET_IP_HEADER=X-Real-IP` to systemd service |
| NixOS module | Change `address` default to `unix:/run/siap/siap.sock` |

The `nixosModules.default` change makes the module system-agnostic: the module receives `pkgs` from the NixOS module system and uses `pkgs.system` to resolve the package, instead of closing over a hardcoded `system` string.

### `sumptureg-ce` — new input + new files

New flake input: `static-ip-authentication-proxy`

New files:
```
modules/
  couchdb.nix     # internal — defines hochreiner.services.couchdb
  sumptureg.nix   # exported — defines hochreiner.services.sumptureg
                  #            imports couchdb.nix and siap nixosModule
```

New flake output:
```nix
nixosModules.default = # a function closing over self + siap flake input
  { config, lib, pkgs, ... }:
  {
    imports = [
      ./modules/couchdb.nix
      siap.nixosModules.default
      # sumptureg option definitions and config live here
    ];
    ...
  };
```

By making `nixosModules.default` a function (rather than a path), the module can close over `self` (to reference the sumptureg package) and `siap` (the flake input), without needing to pass them through the NixOS module argument system.

---

## Module Options

### `hochreiner.services.couchdb` (defined in `modules/couchdb.nix`)

This module is internal to `sumptureg-ce` and not exported separately. It will be moved to the `static-ip-authentication-proxy` flake when a second app (e.g. travel-manager) needs to contribute databases.

| Option | Type | Description |
|---|---|---|
| `enable` | `bool` | Enables CouchDB and the setup service. Set automatically by app modules — operator does not need to set this. |
| `databases` | `attrsOf { memberRoles :: [str]; adminRoles :: [str] }` | Each app registers its database here. The key is the database name. `memberRoles`/`adminRoles` map to CouchDB's `_security` document. |

### `hochreiner.services.sumptureg` (defined in `modules/sumptureg.nix`)

| Option | Type | Description |
|---|---|---|
| `enable` | `bool` | Enables the full stack. |
| `domain` | `str` | nginx `server_name` and siap host map key. |
| `certificateFile` | `path` | Path to TLS certificate (PEM). |
| `certificateKeyFile` | `path` | Path to TLS private key (PEM). |
| `ipMapping` | `attrsOf { user :: str; roles :: [str] }` | IP address → user/roles mapping, forwarded verbatim to the siap host entry for this domain. |

The sumptureg module internally wires the shared proxy secret from the couchdb module into the siap host config. The operator never configures the secret directly.

---

## Secrets

Both secrets are auto-generated at activation time and persist across reboots and rebuilds. Generation is idempotent — files are only written if absent.

### Files

| File | Permissions | Readers |
|---|---|---|
| `/var/lib/hochreiner-couchdb/admin-password` | `600 root:root` | CouchDB setup service (runs as root) |
| `/var/lib/hochreiner-couchdb/proxy-secret` | `640 root:hochreiner-siap` | Setup service (root) + siap daemon (`hochreiner-siap` user) |

`hochreiner-siap` is a declared system user and group created by the siap NixOS module (`users.users.hochreiner-siap`, `users.groups.hochreiner-siap`). A dynamic user cannot be used here because file ownership must be stable across reboots.

### Generation (activation script in `modules/couchdb.nix`)

```bash
mkdir -p /var/lib/hochreiner-couchdb

if [ ! -f /var/lib/hochreiner-couchdb/admin-password ]; then
  head -c 32 /dev/urandom | base64 -w0 \
    > /var/lib/hochreiner-couchdb/admin-password
  chmod 600 /var/lib/hochreiner-couchdb/admin-password
  chown root:root /var/lib/hochreiner-couchdb/admin-password
fi

if [ ! -f /var/lib/hochreiner-couchdb/proxy-secret ]; then
  head -c 32 /dev/urandom | base64 -w0 \
    > /var/lib/hochreiner-couchdb/proxy-secret
  chmod 640 /var/lib/hochreiner-couchdb/proxy-secret
  chown root:hochreiner-siap /var/lib/hochreiner-couchdb/proxy-secret
fi
```

The admin password is readable by root only. An operator who needs it for manual CouchDB access can retrieve it with `sudo cat /var/lib/hochreiner-couchdb/admin-password`.

---

## CouchDB Setup Service

A `Type = oneshot` systemd service (`hochreiner-couchdb-setup.service`) that runs after `couchdb.service` on every boot. All steps are idempotent.

```
After=couchdb.service
Requires=couchdb.service
Before=nginx.service siap.service
```

**Sequence:**

1. Poll `GET http://127.0.0.1:5984/` until CouchDB accepts connections.
2. **Admin creation (first boot only):** If CouchDB is still in Admin Party mode (unauthenticated `GET /_all_dbs` succeeds), create the `admin` user via `PUT /_node/_local/_config/admins/admin`.
3. **Proxy auth config (idempotent):** `PUT /_node/_local/_config/chttpd_auth/proxy_use_secret "true"` and `PUT /_node/_local/_config/chttpd_auth/secret "<value>"`. CouchDB persists these to its own `local.ini`.
4. **Database creation (idempotent):** For each entry in `hochreiner.services.couchdb.databases`, `PUT /<dbname>` (returns 412 if already exists — ignored). Then `PUT /<dbname>/_security` with the `memberRoles`/`adminRoles` from the option.

All `curl` calls use credentials read from `/var/lib/hochreiner-couchdb/admin-password` at runtime.

---

## nginx Virtual Host

Configured via `services.nginx.virtualHosts.${cfg.domain}` in the sumptureg module.

```nginx
server {
    listen 443 ssl;
    server_name {domain};
    ssl_certificate     {certificateFile};
    ssl_certificate_key {certificateKeyFile};

    # Internal auth sub-request to siap via Unix socket
    location = /auth {
        internal;
        proxy_pass           http://unix:/run/siap/siap.sock:/auth;
        proxy_pass_request_body off;
        proxy_set_header     Content-Length  "";
        proxy_set_header     X-Original-Host $host;
        proxy_set_header     X-Real-IP       $remote_addr;
    }

    # Static PWA files
    location / {
        root      {sumptureg-package}/var/html;
        try_files $uri $uri/ /index.html;
        expires   -1;
        add_header Cache-Control "no-store, no-cache, must-revalidate";
    }

    # CouchDB database — requires auth
    location /api {
        auth_request /auth;
        auth_request_set $db_user  $upstream_http_x_auth_couchdb_username;
        auth_request_set $db_roles $upstream_http_x_auth_couchdb_roles;
        auth_request_set $db_token $upstream_http_x_auth_couchdb_token;

        proxy_pass       http://127.0.0.1:5984/sumptureg;
        proxy_set_header X-Auth-CouchDB-Username $db_user;
        proxy_set_header X-Auth-CouchDB-Roles    $db_roles;
        proxy_set_header X-Auth-CouchDB-Token    $db_token;
        proxy_redirect   off;
        proxy_buffering  off;
    }

    # CouchDB session endpoint — requires auth
    location /api/_session {
        auth_request /auth;
        auth_request_set $db_user  $upstream_http_x_auth_couchdb_username;
        auth_request_set $db_roles $upstream_http_x_auth_couchdb_roles;
        auth_request_set $db_token $upstream_http_x_auth_couchdb_token;

        proxy_pass       http://127.0.0.1:5984/_session;
        proxy_set_header X-Auth-CouchDB-Username $db_user;
        proxy_set_header X-Auth-CouchDB-Roles    $db_roles;
        proxy_set_header X-Auth-CouchDB-Token    $db_token;
        proxy_redirect   off;
        proxy_buffering  off;
    }
}
```

---

## siap Host Entry (set by sumptureg module)

The sumptureg module contributes the following to `hochreiner.services.static-ip-authentication-proxy.configuration`:

```nix
hosts.${cfg.domain} = {
  ip_mapping   = cfg.ipMapping;
  user_header  = "X-Auth-CouchDB-Username";
  roles_header = "X-Auth-CouchDB-Roles";
  token_header = "X-Auth-CouchDB-Token";
  secret_file  = "/var/lib/hochreiner-couchdb/proxy-secret";
};
```

The header names are hardcoded by the module — they are dictated by CouchDB's proxy authentication protocol and are not user-configurable.

---

## Example System Configuration

```nix
{
  imports = [ sumptureg-ce.nixosModules.default ];

  hochreiner.services.sumptureg = {
    enable           = true;
    domain           = "sumptureg.example.com";
    certificateFile  = "/run/credentials/nginx/cert.pem";
    certificateKeyFile = "/run/credentials/nginx/key.pem";
    ipMapping = {
      "192.168.1.5" = { user = "hannes"; roles = [ "sumptureg-user" ]; };
    };
  };

  # hochreiner.services.couchdb has no required options —
  # secrets are auto-generated, databases are registered by the app module.
}
```

---

## Future: Adding travel-manager

When travel-manager is added:

1. Move `modules/couchdb.nix` from `sumptureg-ce` to the `static-ip-authentication-proxy` flake, exported as `nixosModules.couchdb`.
2. Both `sumptureg-ce` and the travel-manager flake import it.
3. Each app module contributes its entry to `hochreiner.services.couchdb.databases` — NixOS merges them automatically.
4. Both siap host entries coexist in `hochreiner.services.static-ip-authentication-proxy.configuration.hosts`, keyed by their respective domains.
5. The single CouchDB proxy secret is shared — this is a CouchDB protocol constraint, not a design choice. App isolation is enforced via database-level security and user/role separation.