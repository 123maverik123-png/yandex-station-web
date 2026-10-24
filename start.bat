@echo off
rem Запуск панели на Windows: двойной щелчок или  start.bat [IP колонки]
chcp 65001 >nul
cd /d "%~dp0"
set "PY="
where py >nul 2>nul && set "PY=py -3"
if not defined PY where python >nul 2>nul && set "PY=python"
if not defined PY (
  echo Нужен Python 3.9 или новее: https://www.python.org/downloads/
  echo При установке отметьте «Add python.exe to PATH».
  pause
  exit /b 1
)
if "%~1"=="" (
  %PY% server.py --open
) else (
  %PY% server.py --open --device %*
)
pause
