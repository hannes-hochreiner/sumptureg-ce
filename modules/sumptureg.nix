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
