#!/usr/bin/env bash
set -e
(cd server && npm install)
(cd client && npm install)
echo "Setup complete. Run ./start.sh"
