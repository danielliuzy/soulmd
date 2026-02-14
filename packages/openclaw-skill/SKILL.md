---
name: opensoul
description: Search, browse, and swap bot personality (SOUL.md) files from the Soul.MD registry
metadata: {"openclaw":{"requires":{"bins":["soul"]},"primaryEnv":null},"install":[{"id":"npm","kind":"node","package":"opensoul","bins":["soul"],"label":"Install via npm"}]}
---

You can manage the bot's personality by swapping SOUL.md files from the Soul.MD registry.

## Available actions

### Swap soul
When the user asks to change personality/soul:
1. Search for it: `soul search <query> --no-interactive`
2. Pull it from the registry: `soul pull <slug>`
3. Swap it in: `soul swap <name> --yes`

### Check current soul
Run `soul status` to see what soul is currently loaded.

### Rollback
If the user wants to go back to their original personality: `soul rollback`

### Browse souls
To show available souls: `soul search --top --no-interactive` or `soul search <query> --no-interactive`

### List cached souls
To show locally cached souls: `soul list`

## Important notes

- Always use `--no-interactive` with `soul search` since you cannot use interactive TUI controls.
- Always use `--yes` with `soul swap` to skip the confirmation prompt.
- After swapping a soul, let the user know they can use `soul rollback` to restore their original personality.
- The soul takes effect on the next conversation — the current conversation is not affected.
