@echo off
setlocal
cd /d "%~dp0.."
title AUVRYN 1.11

echo ========================================
echo        AUVRYN 1.11 - Launcher
echo ========================================
echo.
echo Verificando se existe uma versao antiga aberta...
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":8765" ^| findstr "LISTENING"') do (
  echo Encerrando instancia antiga do AUVRYN na porta 8765 ^(PID %%P^)...
  taskkill /PID %%P /F >nul 2>&1
)

timeout /t 1 /nobreak >nul

echo Abrindo AUVRYN 1.11...
where py >nul 2>&1
if %errorlevel%==0 (
  py server\server.py
  goto :end
)
where python >nul 2>&1
if %errorlevel%==0 (
  python server\server.py
  goto :end
)

echo.
echo ERRO: Python nao foi encontrado neste PC.
echo Instale o Python e marque "Add Python to PATH".
echo.
pause
:end
endlocal
