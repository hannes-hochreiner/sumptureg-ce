{ self, siap }:
{ config, lib, pkgs, ... }:
with lib;
let
  cfg = config.hochreiner.services.sumptureg;
  sumptureg-package = self.packages.${pkgs.system}.default;

  defaultCategories = [
    { id = "c0000000-0000-0000-0000-000000000001"; name = "Books"; }
    { id = "c0000000-0000-0000-0000-000000000002"; name = "Cafeteria"; }
    { id = "c0000000-0000-0000-0000-000000000003"; name = "Cereal"; }
    { id = "c0000000-0000-0000-0000-000000000004"; name = "Cleaning supplies"; }
    { id = "c0000000-0000-0000-0000-000000000005"; name = "Clothing"; }
    { id = "c0000000-0000-0000-0000-000000000006"; name = "Courses"; }
    { id = "c0000000-0000-0000-0000-000000000007"; name = "Dry cleaning"; }
    { id = "c0000000-0000-0000-0000-000000000008"; name = "Eating out"; }
    { id = "c0000000-0000-0000-0000-000000000009"; name = "Entertainment"; }
    { id = "c0000000-0000-0000-0000-00000000000a"; name = "Fruit"; }
    { id = "c0000000-0000-0000-0000-00000000000b"; name = "Gifts"; }
    { id = "c0000000-0000-0000-0000-00000000000c"; name = "Health"; }
    { id = "c0000000-0000-0000-0000-00000000000d"; name = "Home improvement"; }
    { id = "c0000000-0000-0000-0000-00000000000e"; name = "Meat"; }
    { id = "c0000000-0000-0000-0000-00000000000f"; name = "Personal care"; }
    { id = "c0000000-0000-0000-0000-000000000010"; name = "Postage"; }
    { id = "c0000000-0000-0000-0000-000000000011"; name = "Restaurants"; }
    { id = "c0000000-0000-0000-0000-000000000012"; name = "Sports"; }
    { id = "c0000000-0000-0000-0000-000000000013"; name = "Stationary"; }
    { id = "c0000000-0000-0000-0000-000000000014"; name = "Transport"; }
    { id = "c0000000-0000-0000-0000-000000000015"; name = "Vegetables"; }
    { id = "c0000000-0000-0000-0000-000000000016"; name = "Yoghurt"; }
  ];

  seedCategoriesScript = pkgs.writeShellScript "hochreiner-sumptureg-seed-categories" ''
    set -euo pipefail

    PASS=$(cat /var/lib/hochreiner-couchdb/admin-password)

    ${concatStringsSep "\n" (map (c: ''
      ${pkgs.curl}/bin/curl -sf -u "admin:$PASS" -X PUT \
        "http://127.0.0.1:5984/sumptureg/${c.id}" \
        -H "Content-Type: application/json" \
        -d '${builtins.toJSON { type = "category"; name = c.name; }}' \
        >/dev/null || true
    '') defaultCategories)}
  '';
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

    # Seed the default category list into a freshly created database
    systemd.services.hochreiner-sumptureg-seed-categories = {
      description = "seed default sumptureg categories";
      wantedBy = [ "multi-user.target" ];
      after    = [ "hochreiner-couchdb-setup.service" ];
      requires = [ "hochreiner-couchdb-setup.service" ];
      serviceConfig = {
        Type = "oneshot";
        RemainAfterExit = true;
        ExecStart = seedCategoriesScript;
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
