{
  description = "Sumptureg CE";

  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs?ref=nixos-25.11";
    nixpkgs-us.url = "github:nixos/nixpkgs?ref=nixos-unstable";
  };

  outputs = { self, nixpkgs, nixpkgs-us }:
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
  };
}
