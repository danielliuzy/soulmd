# OpenSOUL.md

### Your agent deserves a SOUL.

OpenSOUL.md is a registry of AI personality files ([SOUL.md](https://soul.md)). Summon souls others have conjured, create your own from a prompt, or possess your OpenClaw Agent with a whole new personality.

**Website:** [opensoul.tech](https://opensoul.tech)

## 👻 What's a [SOUL.md](https://soul.md)?

A [SOUL.md](https://soul.md) file defines _who_ your agent is, not what it can do. Values, boundaries, communication style, how it handles the existential reality of waking up with no memory every session. Think of it as a personality config that actually has personality.

## 🚀 Quick Start

### 👀 Just want to browse?

Head to [opensoul.tech](https://opensoul.tech) to explore community-created souls, or summon one into existence with a text prompt.

### 📦 Install the CLI

```bash
curl -fsSL https://opensoul.tech/install.sh | sh
```

Or via npm:

```bash
npm install -g opensoul
```

### 🔮 CLI commands

```bash
soul search --top          # browse the top-rated souls
soul possess chaos-goblin  # your AI is now a chaos goblin
soul exorcise              # undo the possession, restore the original
```

## 🐾 Using with OpenClaw

```bash
soul install
```

This teaches your OpenClaw Agent the dark arts. After installing, just ask your bot to find and possess souls on its own — no manual rituals needed.

## 🏗️ Project Structure

| Package                          | What it does                                                                                                                                                                |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`packages/cli`](packages/cli)   | The `soul` CLI. Summon, possess, and exorcise [SOUL.md](https://soul.md) files from the registry. Published as [`opensoul`](https://www.npmjs.com/package/opensoul) on npm. |
| [`packages/web`](packages/web)   | The [opensoul.tech](https://opensoul.tech) marketplace. Browse souls, upload your own, or conjure one with AI. Built with Next.js.                                          |
| [`packages/api`](packages/api)   | The registry API. Handles uploads, downloads, ratings, auth, and AI soul generation. Runs on Cloudflare Workers.                                                            |
| [`packages/core`](packages/core) | Shared [SOUL.md](https://soul.md) parser and TypeScript types used by the CLI and API.                                                                                      |

## 🛠️ Development

Requires Node 22+ and pnpm 10.x.

```bash
pnpm install       # install dependencies
pnpm build         # build all packages
pnpm dev           # run all dev servers
pnpm test          # run tests
```

## 📄 License

MIT
