@echo off
setlocal
cd /d "%~dp0"

where python >nul 2>&1
if errorlevel 1 (
  echo Python was not found on PATH.
  echo Install Python 3.11+ from https://www.python.org/downloads/
  echo Enable "Add python.exe to PATH" during setup, then retry.
  pause
  exit /b 1
)

if not exist ".env" (
  if exist ".env.example" (
    echo Creating .env from .env.example ...
    copy /Y ".env.example" ".env" >nul
  ) else (
    echo Missing .env and .env.example
    pause
    exit /b 1
  )
)

if not exist ".venv\Scripts\python.exe" (
  echo Creating virtual environment...
  python -m venv .venv
  if errorlevel 1 (
    echo Failed to create .venv
    pause
    exit /b 1
  )

  echo Installing dependencies...
  ".venv\Scripts\python.exe" -m pip install --upgrade pip
  ".venv\Scripts\python.exe" -m pip install -r requirements.txt
  if errorlevel 1 (
    echo.
    echo Failed to install requirements.
    echo On Windows you may need "Microsoft Visual C++ Redistributable".
    pause
    exit /b 1
  )
)

echo.
echo Starting Cam Link bridge...
echo Phone UI: https://camlink.web.app
echo.
".venv\Scripts\python.exe" main.py %*
set EXITCODE=%ERRORLEVEL%
if not %EXITCODE%==0 (
  echo.
  echo Bridge exited with an error.
  pause
)
exit /b %EXITCODE%
