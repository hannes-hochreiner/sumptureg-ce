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
