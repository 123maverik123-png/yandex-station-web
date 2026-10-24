#!/bin/sh
# Запуск панели на Linux / macOS: ./start.sh [IP колонки]
cd "$(dirname "$0")" || exit 1
if ! command -v python3 >/dev/null 2>&1; then
    echo "Нужен Python 3.9 или новее: https://www.python.org/downloads/"
    exit 1
fi
if [ -n "$1" ] && [ "${1#-}" = "$1" ]; then
    dev="$1"; shift
    exec python3 server.py --open --device "$dev" "$@"
fi
exec python3 server.py --open "$@"
