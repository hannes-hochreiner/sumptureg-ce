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
