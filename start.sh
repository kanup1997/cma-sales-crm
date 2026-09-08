#!/usr/bin/env bash
set -e
(cd server && npm run dev) &
SERVER_PID=$!
(cd client && npm run dev) &
CLIENT_PID=$!
trap 'kill $SERVER_PID $CLIENT_PID 2>/dev/null || true' EXIT
wait
