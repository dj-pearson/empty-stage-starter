#!/usr/bin/env bash
# Diagnose why Kong returns 503 "name resolution failed" for /functions/v1/*
# Usage:  ssh root@<server> 'bash -s' < diagnose-kong.sh
# or:     scp diagnose-kong.sh root@<server>:/tmp/ && ssh root@<server> bash /tmp/diagnose-kong.sh

set +e

section() { echo; echo "=== $1 ==="; }

section "KONG CONTAINER"
docker ps --format '{{.Names}}\t{{.Status}}' | grep -i kong || echo '(none)'

section "FUNCTIONS / EDGE-RUNTIME CONTAINERS"
docker ps --format '{{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}' \
  | grep -iE 'function|edge|deno' || echo '(none)'

section "ALL DOCKER NETWORKS"
docker network ls

section "KONG -> NETWORKS"
for c in $(docker ps --format '{{.Names}}' | grep -i kong); do
  echo "-- $c --"
  docker inspect "$c" --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} ({{$v.IPAddress}}){{"\n"}}{{end}}'
done

section "FUNCTIONS -> NETWORKS"
for c in $(docker ps --format '{{.Names}}' | grep -iE 'function|edge|deno'); do
  echo "-- $c --"
  docker inspect "$c" --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} ({{$v.IPAddress}}){{"\n"}}{{end}}'
done

section "KONG ENV VARS (functions-related)"
for c in $(docker ps --format '{{.Names}}' | grep -i kong); do
  echo "-- $c --"
  docker exec "$c" env 2>/dev/null | grep -iE 'function|edge|upstream' || echo '(no functions-related env)'
done

section "KONG DECLARATIVE CONFIG (functions service)"
for c in $(docker ps --format '{{.Names}}' | grep -i kong); do
  echo "-- $c --"
  files=$(docker exec "$c" sh -c 'find / -name "kong.yml" -o -name "kong.yaml" 2>/dev/null' 2>/dev/null)
  if [ -z "$files" ]; then
    echo '(no kong.yml/kong.yaml found inside container)'
    continue
  fi
  for f in $files; do
    echo "--- $f ---"
    docker exec "$c" cat "$f" 2>/dev/null | grep -B1 -A6 -iE 'function|edge' || echo '(no functions/edge entries)'
  done
done

section "KONG -> CAN IT RESOLVE THE FUNCTIONS HOST?"
for kong in $(docker ps --format '{{.Names}}' | grep -i kong); do
  for fn in $(docker ps --format '{{.Names}}' | grep -iE 'function|edge|deno'); do
    echo "-- $kong → $fn --"
    docker exec "$kong" sh -c "getent hosts $fn 2>&1 || nslookup $fn 2>&1 | head -5" 2>/dev/null
  done
done

section "DONE"
