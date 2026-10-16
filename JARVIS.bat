@echo off
title J.A.R.V.I.S.
cd /d "%~dp0"
if not exist node_modules call npm install
call npm run jarvis
