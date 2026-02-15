#!/bin/sh
set -e

# Colors
BOLD='\033[1m'
DIM='\033[2m'
RESET='\033[0m'
WHITE='\033[1;37m'
YELLOW='\033[1;33m'
GOLD='\033[0;33m'
GREEN='\033[0;32m'
RED='\033[0;31m'
GRAY='\033[0;90m'

echo ""
printf "${GOLD}  ╔══════════════════════════════════════╗${RESET}\n"
printf "${GOLD}  ║                                      ║${RESET}\n"
printf "${GOLD}  ║${RESET}           👻  ${WHITE}Open${YELLOW}SOUL${WHITE}.md${RESET}            ${GOLD}║${RESET}\n"
printf "${GOLD}  ║${RESET}      ${DIM}${GRAY}Your agent deserves a SOUL${RESET}      ${GOLD}║${RESET}\n"
printf "${GOLD}  ║                                      ║${RESET}\n"
printf "${GOLD}  ╚══════════════════════════════════════╝${RESET}\n"
echo ""

# ── Preflight checks ────────────────────────

printf "  ${DIM}${GRAY}checking requirements...${RESET}\n"
echo ""

if ! command -v node >/dev/null 2>&1; then
  printf "  ${RED}x${RESET} ${WHITE}node${RESET} not found\n"
  echo ""
  printf "    ${DIM}Node.js is required to install the soul CLI.${RESET}\n"
  printf "    ${DIM}Get it at ${WHITE}https://nodejs.org${RESET} ${DIM}(v22+ recommended)${RESET}\n"
  echo ""
  exit 1
fi

NODE_VERSION=$(node -v)
printf "  ${GREEN}~${RESET} ${DIM}node ${WHITE}${NODE_VERSION}${RESET}\n"

if ! command -v npm >/dev/null 2>&1; then
  printf "  ${RED}x${RESET} ${WHITE}npm${RESET} not found\n"
  echo ""
  printf "    ${DIM}npm ships with Node.js — try reinstalling from ${WHITE}https://nodejs.org${RESET}\n"
  echo ""
  exit 1
fi

NPM_VERSION=$(npm -v)
printf "  ${GREEN}~${RESET} ${DIM}npm ${WHITE}v${NPM_VERSION}${RESET}\n"
echo ""

# ── Install ──────────────────────────────────

printf "  🔮 ${WHITE}Summoning the ${WHITE}Open${YELLOW}SOUL${WHITE} CLI...${RESET}\n"
echo ""
npm install -g opensoul
echo ""

# ── Done ─────────────────────────────────────

printf "  👻 ${GREEN}Open${YELLOW}SOUL${GREEN} CLI installed successfully${RESET}\n"
echo ""
printf "    ${DIM}Your SOUL.md path defaults to ${WHITE}~/.openclaw/workspace/SOUL.md${RESET}\n"
printf "    ${DIM}Change it anytime with:${RESET}\n"
echo ""
printf "      ${YELLOW}\$${RESET} ${WHITE}soul path ${GOLD}/path/to/SOUL.md${RESET}\n"
echo ""
printf "    ${DIM}Get started by possessing a soul:${RESET}\n"
echo ""
printf "      ${YELLOW}\$${RESET} ${WHITE}soul possess ${GOLD}<name>${RESET}\n"
printf "      ${DIM}${GRAY}(your existing SOUL.md will be backed up)${RESET}\n"
echo ""
printf "    ${DIM}To restore your original SOUL.md:${RESET}\n"
echo ""
printf "      ${YELLOW}\$${RESET} ${WHITE}soul exorcise${RESET}\n"
echo ""
printf "    ${DIM}Browse souls at ${YELLOW}https://opensoul.md/browse${RESET}\n"
printf "    ${DIM}or search from your terminal:${RESET}\n"
echo ""
printf "      ${YELLOW}\$${RESET} ${WHITE}soul search ${GOLD}<query>${RESET}\n"
echo ""
printf "    ${DIM}${GRAY}Happy haunting${RESET} 🕯️\n"
echo ""
