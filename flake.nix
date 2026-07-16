{
  description = "Sumptureg CE";

  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs?ref=nixos-25.11";
    nixpkgs-us.url = "github:nixos/nixpkgs?ref=nixos-unstable";
    static-ip-authentication-proxy.url = "github:hannes-hochreiner/static-api-authentication-proxy";
  };

  outputs = { self, nixpkgs, nixpkgs-us, static-ip-authentication-proxy }:
  let
    system = "x86_64-linux";
    pkgs = import nixpkgs {
      inherit system;
    };
    pkgs-us = import nixpkgs-us {
      inherit system;
    };
    sumptureg-ce = derivation {
      inherit system;
      name = "sumptureg-ce-${self.shortRev or "dev"}";
      builder = "${pkgs.nushell}/bin/nu";
      buildInputs = with pkgs; [
        uutils-coreutils-noprefix
        tera-cli
      ];
      args = [ ./builder.nu "build" ./. ];
    };
  in {
    packages.${system}.default = sumptureg-ce;

    devShells.${system}.default = pkgs.mkShell {
      name = "sumptureg-ce";
      shellHook = ''
        exec nu
      '';
      buildInputs = with pkgs; [
        pkgs-us.bun
        nushell
        tera-cli
      ];
    };

    nixosModules.default = import ./modules/sumptureg.nix {
      inherit self;
      siap = static-ip-authentication-proxy;
    };

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
  };
}
