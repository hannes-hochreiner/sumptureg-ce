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

    # Configure proxy auth (idempotent)
    ${pkgs.curl}/bin/curl -sf -u "admin:$PASS" -X PUT \
      "http://127.0.0.1:5984/_node/_local/_config/chttpd_auth/proxy_use_secret" \
      -d '"true"'
    ${pkgs.curl}/bin/curl -sf -u "admin:$PASS" -X PUT \
      "http://127.0.0.1:5984/_node/_local/_config/chttpd_auth/secret" \
      -d "\"$SECRET\""
    ${pkgs.curl}/bin/curl -sf -u "admin:$PASS" -X PUT \
      "http://127.0.0.1:5984/_node/_local/_config/chttpd_auth/timeout" \
      -d '"2592000"'

    ${concatStringsSep "\n" (mapAttrsToList (name: dbcfg: ''
      ${pkgs.curl}/bin/curl -sf -u "admin:$PASS" -X PUT \
        "http://127.0.0.1:5984/${name}" || true
      ${pkgs.curl}/bin/curl -sf -u "admin:$PASS" -X PUT \
        "http://127.0.0.1:5984/${name}/_security" \
        -H "Content-Type: application/json" \
        -d '${builtins.toJSON {
          admins  = { names = []; roles = dbcfg.adminRoles; };
          members = { names = []; roles = dbcfg.memberRoles; };
        }}'
    '') cfg.databases)}
  '';
in {
  key = "hochreiner-couchdb";

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
      extraConfig = {
        couchdb.single_node = true;
      };
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

        # CouchDB refuses to start at all without a preconfigured admin
        # account ("Admin Party" boot is no longer supported), so the
        # account must exist in local.ini before couchdb.service starts.
        mkdir -p /var/lib/couchdb
        chown couchdb:couchdb /var/lib/couchdb
        touch /var/lib/couchdb/local.ini
        chown couchdb:couchdb /var/lib/couchdb/local.ini
        if ! ${pkgs.gnugrep}/bin/grep -q '^\[admins\]' /var/lib/couchdb/local.ini; then
          printf '[admins]\nadmin = %s\n' "$(cat /var/lib/hochreiner-couchdb/admin-password)" \
            >> /var/lib/couchdb/local.ini
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

    systemd.services.nginx = {
      after = [ "hochreiner-couchdb-setup.service" ];
      wants = [ "hochreiner-couchdb-setup.service" ];
    };

    systemd.services."hochreiner.static-ip-authentication-proxy" = {
      after = [ "hochreiner-couchdb-setup.service" ];
      wants = [ "hochreiner-couchdb-setup.service" ];
    };
  };
}
