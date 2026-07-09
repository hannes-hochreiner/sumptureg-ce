#!/usr/bin/env -S nu --stdin
use std/log

def main [] {}

def "main build" [
  src: string
] {
  augment_path

  let out = $env.out
  let tmp = $env.tmp
  let var_html = $"($out)/var/html"

  mkdir $tmp
  cd $src

  log info "copying repo"
  cp repo.js $tmp
  log info "copying index.html"
  cp index.html $tmp
  log info "copying manifest.json"
  cp manifest.json $tmp
  log info "copying icon.svg"
  cp icon.svg $tmp
  log info "copying worker.js"
  ^cp worker.js $tmp
  log info "copying components"
  ^cp -r components $tmp
  log info "copying pages"
  ^cp -r pages $tmp
  log info "copying objects"
  ^cp -r objects $tmp
  log info "creating service worker"
  create_service_worker $src $tmp

  mkdir $var_html
  ^cp -r $"($tmp)/." $var_html

  log info "build complete"
}

def --env augment_path [] {
  $env.PATH = [
    ...$env.PATH
    ...($env.buildInputs | split row -r '\s+' | each {|item| $"($item)/bin"})
  ]
}

def create_service_worker [
  source_path: string
  output_path: string
] {
  {
    version: (random uuid),
    project_artifacts: [
      './',
      './index.html',
      './manifest.json',
      './icon.svg',
      './repo.js',
      './worker.js',
      ...(ls -la $"($source_path)/pages" | get name | each {|x| $"./($x | path relative-to $source_path)"}),
      ...(ls -la $"($source_path)/components" | get name | each {|x| $"./($x | path relative-to $source_path)"}),
      ...(ls -la $"($source_path)/objects" | get name | each {|x| $"./($x | path relative-to $source_path)"}),
    ]
  } | to json | tera -t $"($source_path)/sw.js.tera" -s | save $"($output_path)/sw.js"
}
