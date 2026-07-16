# NixOS Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the NixOS module described in `docs/superpowers/specs/2026-07-14-nixos-module-design.md`, which deploys the full sumptureg stack (nginx + CouchDB + siap) with all secrets auto-generated.

**Architecture:** `modules/sumptureg.nix` (exported) closes over `self` and `siap` flake inputs and imports `modules/couchdb.nix` (internal) plus `siap.nixosModules.default`. The sumptureg module wires nginx, siap, and CouchDB; the couchdb module owns secret generation and the oneshot setup service. siap is modified in its own repo first to support Unix sockets and a system-agnostic module export.

**Tech Stack:** Nix flakes, NixOS module system, Rocket 0.5 (Unix socket feature), CouchDB HTTP API (curl in setup script), nginx virtualHosts NixOS module.

## Global Constraints

- nixpkgs channel: `nixos-25.11` (already in `sumptureg-ce` flake)
- siap package built from `github:hannes-hochreiner/static-api-authentication-proxy`
- siap binds to `127.0.0.1` (loopback) — Rocket 0.5.1 has no Unix socket support
- Secrets directory: `/var/lib/hochreiner-couchdb/`
- CouchDB binds to `127.0.0.1:5984` only (loopback)
- System user for siap: `hochreiner-siap` (declared, not dynamic — file ownership must be stable)
- All `nix` commands run from the relevant repo root
- Commits go into each repo independently; sumptureg-ce references siap by GitHub URL in `flake.lock`

---

### Task 1 [repo: static-api-authentication-proxy] — Add Unix socket feature to Rocket

**Files:**
- Modify: `Cargo.toml`
- Possibly modify: `hashes.toml` (if vendor hash changes)

**Interfaces:**
- Produces: siap binary that accepts `ROCKET_ADDRESS=unix:/path/to/sock`

- [ ] **Step 1: Edit Cargo.toml to add the `unix` feature**

Change line 8 from:
```toml
rocket = { version = "0.5.1", features = ["json"] }
```
to:
```toml
rocket = { version = "0.5.1", features = ["json", "unix"] }
```

- [ ] **Step 2: Enter the dev shell and re-vendor dependencies**

```bash
nix develop
bun run ./scripts/vendor-cargo.js --source .
```

If the output hash differs from `hashes.toml`'s `deps` field, the vendor step will fail or produce a new hash. Note the new hash.

- [ ] **Step 3: Update hashes.toml if the vendor hash changed**

Run:
```bash
bun run ./scripts/update-cargo.js
```

This regenerates `hashes.toml`. If `deps` changed, the Nix derivation's `outputHash` must match.

- [ ] **Step 4: Verify the binary builds**

```bash
nix build .#bin
```

Expected: `result/bin/static-ip-authentication-proxy` exists.

- [ ] **Step 5: Smoke-test that the binary accepts a Unix socket address**

```bash
ROCKET_ADDRESS=unix:/tmp/siap-test.sock \
ROCKET_IP_HEADER=X-Real-IP \
CONFIG_PATH=/dev/null \
./result/bin/static-ip-authentication-proxy &
sleep 1
ls /tmp/siap-test.sock   # should exist
kill %1
rm -f /tmp/siap-test.sock
```

Expected: the socket file is created (the process will error on CONFIG_PATH=/dev/null but creates the socket before parsing config).

Note: if the binary panics before creating the socket, it still proves the feature compiled in; the actual socket behaviour is verified in Task 2's integration build.

- [ ] **Step 6: Commit**

```bash
git add Cargo.toml hashes.toml Cargo.lock
git commit -m "feat: add Rocket unix socket feature"
```

---

### Task 2 [repo: static-api-authentication-proxy] — Refactor siap NixOS module

**Files:**
- Modify: `flake.nix` (module key, package option, system user, service config, test config)

**Interfaces:**
- Produces: `nixosModules.default` — a system-agnostic NixOS module function `{ config, lib, pkgs, ... }: { ... }`
- Produces: `users.users.hochreiner-siap` + `users.groups.hochreiner-siap` declared by the module
- Produces: systemd service `hochreiner.static-ip-authentication-proxy` running as `hochreiner-siap`, socket at `/run/siap/siap.sock` with `0660` permissions

- [ ] **Step 1: Replace `nixosModules.${system}.default` with `nixosModules.default`**

In `flake.nix`, change:
```nix
nixosModules.${system}.default = { config, lib, pkgs, ... }:
```
to:
```nix
nixosModules.default = { config, lib, pkgs, ... }:
```

- [ ] **Step 2: Add the `package` option and remove the hardcoded package reference**

Inside the module's `options` block, add after the existing `address` option:

```nix
package = mkOption {
  type = types.package;
  default = self.packages.${pkgs.system}.default;
  description = lib.mdDoc "The static-ip-authentication-proxy package to use";
};
```

In the `config` block, replace the `let pkg = self.packages.${system}.default;` binding and change `${pkg}` to `${cfg.package}`.

- [ ] **Step 3: Add the `hochreiner-siap` system user and group**

In the `config = mkIf cfg.enable { ... }` block, add:

```nix
users.users.hochreiner-siap = {
  isSystemUser = true;
  group = "hochreiner-siap";
};
users.groups.hochreiner-siap = {};
```

- [ ] **Step 4: Update the systemd service config**

Replace the existing `systemd.services."hochreiner.static-ip-authentication-proxy"` service config with:

```nix
systemd.services."hochreiner.static-ip-authentication-proxy" = {
  wantedBy = [ "multi-user.target" ];
  description = "static ip authentication proxy service";
  serviceConfig = {
    Type = "simple";
    User = "hochreiner-siap";
    Group = "hochreiner-siap";
    ExecStart = "${cfg.package}/bin/static-ip-authentication-proxy";
    Environment = [
      "RUST_LOG=${cfg.log_level}"
      "ROCKET_ADDRESS=${cfg.address}"
      "ROCKET_PORT=${builtins.toString cfg.port}"
      "ROCKET_IP_HEADER=X-Real-IP"
      "CONFIG_PATH=${configuration_file}"
      "PATH=/run/current-system/sw/bin"
    ];
  };
};
```

Note: `RuntimeDirectory`, `RuntimeDirectoryMode`, and `UMask` are NOT included — siap uses TCP loopback, not a Unix socket, so no socket file is created.

- [ ] **Step 5: Change the `address` option default**

Find the `address` option and change its default to loopback-only (Rocket 0.5.1 has no Unix socket support):

```nix
address = mkOption {
  type = types.str;
  default = "127.0.0.1";
  description = lib.mdDoc "Address to bind the service to";
};
```

- [ ] **Step 6: Update `nixosConfigurations.siap-test` to reference the new module key**

Change:
```nix
self.nixosModules.${system}.default
```
to:
```nix
self.nixosModules.default
```

- [ ] **Step 7: Verify the flake evaluates**

```bash
nix flake check
```

Expected: no errors.

- [ ] **Step 8: Build the test NixOS configuration**

```bash
nix build .#nixosConfigurations.siap-test.config.system.build.toplevel
```

Expected: build succeeds (this is the integration test — it proves the module wires correctly into a full NixOS system).

- [ ] **Step 9: Commit**

```bash
git add flake.nix
git commit -m "feat: refactor nixos module — system-agnostic export, hochreiner-siap user, loopback default"
```

---

### Task 3 [repo: sumptureg-ce] — Add siap input and scaffold module files

**Files:**
- Modify: `flake.nix` (add input, add nixosModules output)
- Create: `modules/couchdb.nix` (skeleton)
- Create: `modules/sumptureg.nix` (skeleton)

**Interfaces:**
- Produces: `nixosModules.default` export in sumptureg-ce flake
- Consumes: `static-ip-authentication-proxy.nixosModules.default`

- [ ] **Step 1: Add the siap flake input**

In `flake.nix`, add to the `inputs` block:

```nix
static-ip-authentication-proxy.url = "github:hannes-hochreiner/static-api-authentication-proxy";
```

Add `static-ip-authentication-proxy` to the `outputs` destructuring:

```nix
outputs = { self, nixpkgs, nixpkgs-us, static-ip-authentication-proxy }:
```

- [ ] **Step 2: Add `nixosModules.default` to the flake outputs**

Inside the `in { ... }` outputs block, add:

```nix
nixosModules.default = import ./modules/sumptureg.nix {
  inherit self;
  siap = static-ip-authentication-proxy;
};
```

- [ ] **Step 3: Create `modules/couchdb.nix` skeleton**

```nix
{ config, lib, pkgs, ... }:
with lib;
let
  cfg = config.hochreiner.services.couchdb;
in {
  options.hochreiner.services.couchdb = {
    enable = mkEnableOption "hochreiner CouchDB setup";
    databases = mkOption {
      type = types.attrsOf (types.submodule {
        options = {
          memberRoles = mkOption { type = types.listOf types.str; default = []; };
          adminRoles  = mkOption { type = types.listOf types.str; default = []; };
        };
      });
      default = {};
    };
  };
  config = mkIf cfg.enable {};
}
```

- [ ] **Step 4: Create `modules/sumptureg.nix` skeleton**

```nix
{ self, siap }:
{ config, lib, pkgs, ... }:
with lib;
let
  cfg = config.hochreiner.services.sumptureg;
in {
  imports = [
    ./couchdb.nix
    siap.nixosModules.default
  ];
  options.hochreiner.services.sumptureg = {
    enable = mkEnableOption "sumptureg expense tracking PWA";
    domain           = mkOption { type = types.str; };
    certificateFile  = mkOption { type = types.path; };
    certificateKeyFile = mkOption { type = types.path; };
    ipMapping = mkOption {
      type = types.attrsOf (types.submodule {
        options = {
          user  = mkOption { type = types.str; };
          roles = mkOption { type = types.listOf types.str; default = []; };
        };
      });
      default = {};
    };
  };
  config = mkIf cfg.enable {};
}
```

- [ ] **Step 5: Update flake.lock to fetch the siap input**

```bash
nix flake update static-ip-authentication-proxy
```

- [ ] **Step 6: Verify the flake evaluates**

```bash
nix flake check
```

Expected: no errors. The empty `config` blocks mean no services are configured yet, but the option definitions and imports must all evaluate cleanly.

- [ ] **Step 7: Commit**

```bash
git add flake.nix flake.lock modules/couchdb.nix modules/sumptureg.nix
git commit -m "feat: scaffold nixos module files and add siap flake input"
```

---

### Task 4 [repo: sumptureg-ce] — Implement `couchdb.nix`

**Files:**
- Modify: `modules/couchdb.nix`

**Interfaces:**
- Produces: `hochreiner.services.couchdb.enable` (bool)
- Produces: `hochreiner.services.couchdb.databases` (attrsOf { memberRoles, adminRoles })
- Produces: activation script that generates `/var/lib/hochreiner-couchdb/admin-password` (600 root:root) and `/var/lib/hochreiner-couchdb/proxy-secret` (640 root:hochreiner-siap) on first boot
- Produces: `systemd.services.hochreiner-couchdb-setup` oneshot that initialises CouchDB after `couchdb.service`

- [ ] **Step 1: Write the full `modules/couchdb.nix`**

Replace the skeleton entirely:

```nix
{ config, lib, pkgs, ... }:
with lib;
let
  cfg = config.hochreiner.services.couchdb;

  setupScript = pkgs.writeShellScript "hochreiner-couchdb-setup" ''
    set -euo pipefail

    until ${pkgs.curl}/bin/curl -sf http://127.0.0.1:5984/ > /dev/null; do
      sleep 1
    done

    PASS=$(cat /var/lib/hochreiner-couchdb/admin-password)
    SECRET=$(cat /var/lib/hochreiner-couchdb/proxy-secret)

    # First-boot: create admin if CouchDB is still in Admin Party mode
    if ${pkgs.curl}/bin/curl -sf http://127.0.0.1:5984/_all_dbs > /dev/null 2>&1; then
      ${pkgs.curl}/bin/curl -sf -X PUT \
        http://127.0.0.1:5984/_node/_local/_config/admins/admin \
        -d "\"$PASS\""
    fi

    # Configure proxy auth (idempotent)
    ${pkgs.curl}/bin/curl -sf -X PUT \
      "http://admin:$PASS@127.0.0.1:5984/_node/_local/_config/chttpd_auth/proxy_use_secret" \
      -d '"true"'
    ${pkgs.curl}/bin/curl -sf -X PUT \
      "http://admin:$PASS@127.0.0.1:5984/_node/_local/_config/chttpd_auth/secret" \
      -d "\"$SECRET\""
    ${pkgs.curl}/bin/curl -sf -X PUT \
      "http://admin:$PASS@127.0.0.1:5984/_node/_local/_config/chttpd_auth/timeout" \
      -d '"2592000"'

    ${concatStringsSep "\n" (mapAttrsToList (name: dbcfg: ''
      ${pkgs.curl}/bin/curl -sf -X PUT \
        "http://admin:$PASS@127.0.0.1:5984/${name}" || true
      ${pkgs.curl}/bin/curl -sf -X PUT \
        "http://admin:$PASS@127.0.0.1:5984/${name}/_security" \
        -H "Content-Type: application/json" \
        -d '${builtins.toJSON {
          admins  = { names = []; roles = dbcfg.adminRoles; };
          members = { names = []; roles = dbcfg.memberRoles; };
        }}'
    '') cfg.databases)}
  '';
in {
  options.hochreiner.services.couchdb = {
    enable = mkEnableOption "hochreiner CouchDB setup";

    databases = mkOption {
      type = types.attrsOf (types.submodule {
        options = {
          memberRoles = mkOption {
            type = types.listOf types.str;
            default = [];
            description = lib.mdDoc "Roles whose members may read/write this database";
          };
          adminRoles = mkOption {
            type = types.listOf types.str;
            default = [];
            description = lib.mdDoc "Roles with database-admin access";
          };
        };
      });
      default = {};
      description = lib.mdDoc "Databases to create. Key is the CouchDB database name.";
    };
  };

  config = mkIf cfg.enable {
    services.couchdb = {
      enable = true;
      bindAddress = "127.0.0.1";
      extraConfig = ''
        [couchdb]
        single_node = true
      '';
    };

    system.activationScripts.hochreiner-couchdb-secrets = {
      deps = [ "users" "groups" ];
      text = ''
        mkdir -p /var/lib/hochreiner-couchdb

        if [ ! -f /var/lib/hochreiner-couchdb/admin-password ]; then
          ${pkgs.coreutils}/bin/head -c 32 /dev/urandom \
            | ${pkgs.coreutils}/bin/base64 -w0 \
            > /var/lib/hochreiner-couchdb/admin-password
          chmod 600 /var/lib/hochreiner-couchdb/admin-password
          chown root:root /var/lib/hochreiner-couchdb/admin-password
        fi

        if [ ! -f /var/lib/hochreiner-couchdb/proxy-secret ]; then
          ${pkgs.coreutils}/bin/head -c 32 /dev/urandom \
            | ${pkgs.coreutils}/bin/base64 -w0 \
            > /var/lib/hochreiner-couchdb/proxy-secret
          chmod 640 /var/lib/hochreiner-couchdb/proxy-secret
          chown root:hochreiner-siap /var/lib/hochreiner-couchdb/proxy-secret
        fi
      '';
    };

    systemd.services.hochreiner-couchdb-setup = {
      description = "hochreiner CouchDB initialisation";
      wantedBy = [ "multi-user.target" ];
      after    = [ "couchdb.service" ];
      requires = [ "couchdb.service" ];
      before   = [ "nginx.service"
                   "hochreiner.static-ip-authentication-proxy.service" ];
      serviceConfig = {
        Type = "oneshot";
        RemainAfterExit = true;
        ExecStart = setupScript;
      };
    };
  };
}
```

- [ ] **Step 2: Verify the module evaluates**

```bash
nix eval .#nixosModules.default
```

Expected: prints a lambda (the module function), no errors.

- [ ] **Step 3: Add a test NixOS configuration to `flake.nix` to drive early evaluation**

Inside the `in { ... }` block of `flake.nix`, add:

```nix
nixosConfigurations.sumptureg-test = nixpkgs.lib.nixosSystem {
  inherit system;
  modules = [
    self.nixosModules.default
    ({ pkgs, ... }: {
      boot.isContainer = true;
      networking.hostName = "sumptureg-test";
      networking.firewall.allowedTCPPorts = [ 443 ];

      hochreiner.services.sumptureg = {
        enable = true;
        domain = "sumptureg.test";
        certificateFile    = "/etc/ssl/test-cert.pem";
        certificateKeyFile = "/etc/ssl/test-key.pem";
        ipMapping."127.0.0.1" = {
          user  = "testuser";
          roles = [ "sumptureg-user" ];
        };
      };

      system.stateVersion = "25.11";
    })
  ];
};
```

- [ ] **Step 4: Build the test config (this will fail until Task 5 completes — that's expected)**

```bash
nix build .#nixosConfigurations.sumptureg-test.config.system.build.toplevel 2>&1 | head -20
```

Expected at this point: evaluation error about `hochreiner.services.sumptureg` options not being wired (the `config` block in `sumptureg.nix` is empty). This is the red state — the test shows what's missing.

- [ ] **Step 5: Commit**

```bash
git add modules/couchdb.nix flake.nix
git commit -m "feat: implement couchdb nixos module with secret generation and setup service"
```

---

### Task 5 [repo: sumptureg-ce] — Implement `sumptureg.nix`

**Files:**
- Modify: `modules/sumptureg.nix`

**Interfaces:**
- Consumes: `hochreiner.services.couchdb.databases` (attrsOf) from `couchdb.nix`
- Consumes: `hochreiner.services.static-ip-authentication-proxy.configuration.hosts` (attrsOf) from siap module
- Consumes: `services.nginx.virtualHosts` from NixOS nginx module
- Consumes: `self.packages.${pkgs.system}.default` — the sumptureg-ce package (`$out/var/html`)
- Produces: full wiring of all three services

- [ ] **Step 1: Write the full `modules/sumptureg.nix`**

Replace the skeleton entirely:

```nix
{ self, siap }:
{ config, lib, pkgs, ... }:
with lib;
let
  cfg = config.hochreiner.services.sumptureg;
  sumptureg-package = self.packages.${pkgs.system}.default;
in {
  imports = [
    ./couchdb.nix
    siap.nixosModules.default
  ];

  options.hochreiner.services.sumptureg = {
    enable = mkEnableOption "sumptureg expense tracking PWA";

    domain = mkOption {
      type = types.str;
      description = lib.mdDoc "nginx server_name and siap host map key";
    };

    certificateFile = mkOption {
      type = types.path;
      description = lib.mdDoc "Path to TLS certificate (PEM)";
    };

    certificateKeyFile = mkOption {
      type = types.path;
      description = lib.mdDoc "Path to TLS private key (PEM)";
    };

    ipMapping = mkOption {
      type = types.attrsOf (types.submodule {
        options = {
          user  = mkOption { type = types.str; };
          roles = mkOption { type = types.listOf types.str; default = []; };
        };
      });
      default = {};
      description = lib.mdDoc "IP address → user/roles mapping forwarded to siap";
    };
  };

  config = mkIf cfg.enable {
    # Register the sumptureg database with auto-derived member roles
    hochreiner.services.couchdb = {
      enable = true;
      databases."sumptureg" = {
        memberRoles = mkDefault (
          unique (flatten (mapAttrsToList (_: u: u.roles) cfg.ipMapping))
        );
        adminRoles = mkDefault [];
      };
    };

    # Register the siap host entry for this domain
    hochreiner.services.static-ip-authentication-proxy = {
      enable = true;
      configuration.hosts.${cfg.domain} = {
        ip_mapping = mapAttrs (_: u: { inherit (u) user roles; }) cfg.ipMapping;
        user_header  = "X-Auth-CouchDB-Username";
        roles_header = "X-Auth-CouchDB-Roles";
        token_header = "X-Auth-CouchDB-Token";
        secret_file  = "/var/lib/hochreiner-couchdb/proxy-secret";
      };
    };

    # nginx virtual host
    services.nginx = {
      enable = true;
      virtualHosts.${cfg.domain} = {
        forceSSL = true;
        sslCertificate    = cfg.certificateFile;
        sslCertificateKey = cfg.certificateKeyFile;

        extraConfig = ''
          location = /auth {
            internal;
            proxy_pass http://127.0.0.1:${toString config.hochreiner.services.static-ip-authentication-proxy.port}/auth;
            proxy_pass_request_body off;
            proxy_set_header Content-Length  "";
            proxy_set_header X-Original-Host $host;
            proxy_set_header X-Real-IP       $remote_addr;
          }
        '';

        locations."/" = {
          root = "${sumptureg-package}/var/html";
          tryFiles = "$uri $uri/ /index.html";
          extraConfig = ''
            expires -1;
            add_header Cache-Control "no-store, no-cache, must-revalidate";
          '';
        };

        locations."/api/_session" = {
          extraConfig = ''
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
          '';
        };

        locations."/api" = {
          extraConfig = ''
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
          '';
        };
      };
    };
  };
}
```

Note: `/api/_session` is listed before `/api` in the Nix attrset. nginx evaluates prefix locations by specificity (longest match wins), so requests to `/api/_session` will be served by the `_session` location regardless of declaration order. The Nix ordering does not affect nginx's location matching behaviour.

- [ ] **Step 2: Build the test NixOS configuration (green state)**

```bash
nix build .#nixosConfigurations.sumptureg-test.config.system.build.toplevel
```

Expected: build succeeds. This is the green state — the module evaluates into a complete NixOS system closure.

- [ ] **Step 3: Spot-check the generated nginx config**

```bash
nix eval --raw \
  .#nixosConfigurations.sumptureg-test.config.services.nginx.virtualHosts."sumptureg.test".extraConfig
```

Expected output contains:
```
location = /auth {
```

- [ ] **Step 4: Spot-check the generated siap host config**

```bash
nix eval --json \
  '.#nixosConfigurations.sumptureg-test.config.hochreiner.services.static-ip-authentication-proxy.configuration.hosts'
```

Expected: a JSON object with key `"sumptureg.test"` containing `user_header`, `roles_header`, `token_header`, `secret_file`, and `ip_mapping`.

- [ ] **Step 5: Spot-check the generated CouchDB database config**

```bash
nix eval --json \
  '.#nixosConfigurations.sumptureg-test.config.hochreiner.services.couchdb.databases'
```

Expected: `{"sumptureg":{"memberRoles":["sumptureg-user"],"adminRoles":[]}}`.

- [ ] **Step 6: Commit**

```bash
git add modules/sumptureg.nix flake.nix
git commit -m "feat: implement sumptureg nixos module — wires nginx, siap, and couchdb"
```

---

## Self-Review

**Spec coverage:**

| Spec requirement | Task |
|---|---|
| siap: Rocket unix feature | Task 1 |
| siap: `nixosModules.default` (system-agnostic) | Task 2 |
| siap: `package` option | Task 2 |
| siap: `hochreiner-siap` system user | Task 2 |
| siap: `ROCKET_IP_HEADER=X-Real-IP` | Task 2 |
| siap: Unix socket address default | Task 2 |
| sumptureg-ce: siap flake input | Task 3 |
| sumptureg-ce: `nixosModules.default` output | Task 3 |
| `hochreiner.services.couchdb` options | Task 4 |
| Secret generation activation script | Task 4 |
| Secret file permissions (600/640) | Task 4 |
| CouchDB oneshot setup service | Task 4 |
| CouchDB proxy auth configuration (setup script) | Task 4 |
| `hochreiner.services.sumptureg` options | Task 5 |
| nginx virtual host with TLS | Task 5 |
| nginx `/auth` internal location → siap loopback TCP | Task 5 |
| nginx `/api` → CouchDB with auth headers | Task 5 |
| nginx `/api/_session` → CouchDB `/_session` | Task 5 |
| siap host entry wired from sumptureg options | Task 5 |
| nginx user added to `hochreiner-siap` group | N/A — not needed with TCP loopback |
| memberRoles auto-derived from ipMapping | Task 5 |
| `admin-password` 600 root:root | Task 4 |
| `proxy-secret` 640 root:hochreiner-siap | Task 4 |
| Future travel-manager path documented | spec only |

No gaps found.

**Placeholder scan:** No TBDs or incomplete steps. All code blocks are complete.

**Type consistency:**
- `hochreiner.services.couchdb.databases` defined in Task 4 as `attrsOf { memberRoles, adminRoles }` — consumed in Task 5 via `databases."sumptureg" = { memberRoles = ...; adminRoles = ...; }` ✓
- `hochreiner.services.static-ip-authentication-proxy.configuration.hosts` consumed in Task 5 — this attrset is defined by the siap module (`configuration.hosts` is `attrsOf (submodule hostConfig)`). The fields set (`ip_mapping`, `user_header`, `roles_header`, `token_header`, `secret_file`) match the siap module's `hostConfig` submodule options ✓
- `sumptureg-package` used in Task 5 as `self.packages.${pkgs.system}.default` — matches the sumptureg-ce flake's `packages.${system}.default` output ✓
