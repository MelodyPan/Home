@echo off
cd /d "%~dp0"
node "%~dp0scripts\home-site-start.cjs"
if errorlevel 1 pause
