@echo off
rem Hourly copy of the hosted database and files to the local server (owner's decision, 2026-11-11).
rem Run by the Windows task "EmeilSG hosted to local sync". Needs Docker Desktop and the local server running.
rem The log is in "test data\_backup\sync-hosted-to-local.log" (git-ignored).
cd /d "%~dp0.."
node scripts\sync-hosted-to-local.mjs >> "..\..\test data\_backup\sync-hosted-to-local.log" 2>&1
