{ pkgs ? import <nixpkgs> {} }:

let
  py = pkgs.python313;
  ps = pkgs.python313Packages;
  python = py.withPackages (_: [
    ps.chromadb
    ps.edge-tts
    ps.websockets
    ps.curl-cffi
    ps.uvicorn
    ps.fastapi
  ]);
in
pkgs.mkShell {
  packages = [
    python
    pkgs.stdenv.cc.cc
    pkgs.zlib
  ];

  shellHook = ''
    export LD_LIBRARY_PATH="${pkgs.lib.makeLibraryPath [ pkgs.stdenv.cc.cc pkgs.zlib ]}''${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
    echo "Lunaria pure nix shell ready"
    echo "python: $(which python)"
    echo "run: python run.py"
    echo "note: chromadb is preinstalled; mem0ai comes from requirements.txt because nixpkgs does not package it yet."
  '';
}
