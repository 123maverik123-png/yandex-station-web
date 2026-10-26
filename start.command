#!/bin/sh
# macOS: двойной щелчок в Finder или ./start.command [IP колонки] [параметры].
cd "$(dirname "$0")" || exit 1
/bin/sh ./start.sh "$@"
status=$?
if [ "$status" -ne 0 ] && [ -t 0 ]; then
    printf '\nНе удалось запустить панель. Нажмите Enter, чтобы закрыть окно…'
    read -r reply
fi
exit "$status"
