#!/usr/bin/env node
import { Command } from "commander";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { createInterface } from "node:readline";
import pc from "picocolors";
import { parseSoulFile } from "@soulmd/core";
import { loadConfig, getConfigValue, setConfigValue } from "./config.js";
import { listCached, getCached, cacheSoul } from "./cache.js";
import { swapSoul, rollbackSoul, hasBackup, isSwapped, readCurrentSoul, getSoulPath } from "./swap.js";
import { RegistryClient } from "./registry-client.js";
import { installSkill, uninstallSkill, isSkillInstalled, getSkillPath } from "./skill.js";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(resolve(__dirname, "../package.json"), "utf-8"));

let verbose = false;

function log(...args: unknown[]) {
  if (verbose) console.error(pc.dim("[verbose]"), ...args);
}

function fail(message: string): never {
  console.error(pc.red(message));
  process.exit(1);
}

function confirm(prompt: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`${prompt} [y/N] `, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === "y");
    });
  });
}

const program = new Command();

program
  .name("soul")
  .description("Soul.MD — Swappable bot personality files")
  .version(pkg.version, "-v, --version")
  .option("--verbose", "Enable verbose output for debugging")
  .hook("preAction", () => {
    verbose = program.opts().verbose ?? false;
  });

// --- config ---
const configCmd = program
  .command("config")
  .description("Manage CLI configuration");

configCmd
  .command("get <key>")
  .description("Get a config value")
  .action((key: string) => {
    const value = getConfigValue(key);
    if (value === undefined) {
      fail(`Unknown config key: ${key}`);
    }
    console.log(value);
  });

configCmd
  .command("set <key> <value>")
  .description("Set a config value")
  .action((key: string, value: string) => {
    setConfigValue(key, value);
    console.log(pc.green(`Set ${key} = ${value}`));
  });

// --- status ---
program
  .command("status")
  .description("Show current SOUL.md status")
  .action(() => {
    const soulPath = getSoulPath();
    const wsDir = dirname(soulPath);

    if (!existsSync(wsDir)) {
      console.log(pc.yellow(`OpenClaw workspace not found at ${wsDir}`));
      console.log(pc.dim("Is OpenClaw installed? Expected ~/.openclaw/workspace/"));
      return;
    }

    const content = readCurrentSoul();
    if (!content) {
      console.log(pc.yellow(`No SOUL.md found at ${soulPath}`));
      return;
    }

    const swapped = isSwapped();
    console.log(pc.bold("\nSOUL.md Status"));
    console.log(`Path: ${soulPath}`);
    console.log(`State: ${swapped ? pc.cyan("swapped") : pc.green("original")}`);
    console.log(`Backup: ${hasBackup() ? pc.green("saved") : pc.dim("none")}`);

    if (swapped) {
      const rawContent = content.split("\n").slice(1).join("\n");
      const firstLine = rawContent.trim().split("\n")[0] ?? "";
      console.log(`Preview: ${pc.cyan(firstLine)}`);
    }
  });

// --- swap ---
program
  .command("swap <pathOrName>")
  .description("Swap a soul file into ~/.openclaw/workspace/SOUL.md")
  .option("--dry-run", "Preview the swap without writing anything")
  .option("-y, --yes", "Skip confirmation prompt")
  .action(async (pathOrName: string, opts: { dryRun?: boolean; yes?: boolean }) => {
    let content: string;
    let source: string;
    const filePath = resolve(pathOrName);

    if (existsSync(filePath)) {
      content = readFileSync(filePath, "utf-8");
      source = filePath;
      log(`Reading from file: ${filePath}`);
    } else {
      const cached = getCached(pathOrName);
      if (cached) {
        content = cached.content;
        source = `cache:${cached.entry.name}`;
        log(`Reading from cache: ${cached.entry.name}`);
      } else {
        fail(`File not found and not in cache: ${pathOrName}\nTry 'soul pull <slug>' to download from the registry first.`);
      }
    }

    const filename = pathOrName.split("/").pop() ?? pathOrName;

    if (opts.dryRun) {
      console.log(pc.bold("\n[dry-run] Would swap to:"));
      console.log(`  Source: ${source}`);
      console.log(`  Target: ${getSoulPath()}`);
      console.log(`  Backup: ${!isSwapped() && existsSync(getSoulPath()) ? "would create" : "already exists"}`);
      const preview = content.trim().split("\n")[0] ?? "";
      console.log(`  Preview: ${pc.cyan(preview)}`);
      return;
    }

    // Confirmation prompt on first swap (unless --yes or non-interactive)
    if (!opts.yes && !isSwapped() && existsSync(getSoulPath()) && process.stdin.isTTY) {
      const ok = await confirm("This will modify your SOUL.md (original will be backed up). Continue?");
      if (!ok) {
        console.log(pc.dim("Aborted."));
        return;
      }
    }

    const { backedUp } = swapSoul(content);

    console.log(pc.green(`\n✓ Swapped to ${pc.bold(filename)}`));
    console.log(pc.dim(`  Written to ${getSoulPath()}`));
    if (backedUp) {
      console.log(pc.dim(`  Original SOUL.md backed up (use 'soul rollback' to restore)`));
    }
  });

// --- list ---
program
  .command("list")
  .description("List locally cached souls")
  .action(() => {
    const cached = listCached();
    if (cached.length === 0) {
      console.log(pc.yellow("No cached souls. Use 'soul pull <slug>' to download one."));
      return;
    }

    console.log(pc.bold("\nCached Souls:"));
    for (const entry of cached) {
      console.log(`  ${pc.cyan(entry.name)} — ${entry.hash.slice(0, 12)}... (${entry.cachedAt})`);
    }
  });

// --- rollback ---
program
  .command("rollback")
  .description("Restore the original SOUL.md")
  .action(() => {
    if (!hasBackup()) {
      fail("No backup found. Nothing to rollback to.");
    }

    const restored = rollbackSoul();
    if (restored) {
      console.log(pc.green("\n✓ Restored original SOUL.md"));
      console.log(pc.dim(`  ${getSoulPath()}`));
    } else {
      fail("Failed to restore backup.");
    }
  });

// --- pull ---
program
  .command("pull <slug>")
  .description("Pull a soul from the registry and cache it locally")
  .action(async (slug: string) => {
    log(`Pulling soul '${slug}' from registry`);
    try {
      const client = new RegistryClient();
      log(`Registry URL: ${loadConfig().registry_url}`);
      const content = await client.getContent(slug);
      const soul = parseSoulFile(content);
      const name = soul.frontmatter.name ?? slug;

      cacheSoul(name, content, soul.hash);

      console.log(pc.green(`\n✓ Pulled ${pc.bold(name)} (${slug})`));
      console.log(pc.dim(`  Cached locally. Use 'soul swap ${name}' to activate.`));
    } catch (err) {
      fail((err as Error).message);
    }
  });

// --- search ---
program
  .command("search [query]")
  .description("Search for souls in the registry")
  .option("--top", "Show highest-rated souls")
  .option("--popular", "Show most popular souls")
  .option("--no-interactive", "Disable interactive selection")
  .action(async (query: string | undefined, opts: { top?: boolean; popular?: boolean; interactive?: boolean }) => {
    try {
      const client = new RegistryClient();
      const sort = opts.top ? "top" : opts.popular ? "popular" : undefined;
      log(`Searching registry: query=${query ?? "(all)"} sort=${sort ?? "recent"}`);
      const { data: results, pagination } = await client.search(query, sort);

      if (results.length === 0) {
        console.log(pc.yellow("No souls found."));
        return;
      }

      // Non-interactive mode: just print results
      if (!process.stdin.isTTY || opts.interactive === false) {
        console.log(pc.bold(`\n${pagination.total} soul(s) found (page ${pagination.page}/${pagination.totalPages}):\n`));
        for (const soul of results) {
          const rating = soul.rating_avg
            ? pc.yellow(` ★ ${soul.rating_avg.toFixed(1)}`) + pc.dim(` (${soul.rating_count} ratings)`)
            : "";
          const desc = soul.description ? pc.dim(` — ${soul.description}`) : "";
          console.log(`  ${pc.cyan(pc.bold(soul.slug))} ${pc.dim(`v${soul.version}`)} ${pc.magenta(`by ${soul.author}`)}${rating}${desc}`);
        }
        return;
      }

      // Interactive mode: let user pick a soul
      const { select, confirm: inquirerConfirm } = await import("@inquirer/prompts");

      const choices = results.map((soul) => {
        const rating = soul.rating_avg
          ? pc.yellow(` ★ ${soul.rating_avg.toFixed(1)}`) + pc.dim(` (${soul.rating_count})`)
          : "";
        const author = pc.magenta(`by ${soul.author}`);
        const ver = pc.dim(`v${soul.version}`);
        const desc = soul.description ? pc.dim(` — ${soul.description}`) : "";
        return {
          name: `${pc.cyan(pc.bold(soul.slug))} ${ver} ${author}${rating}${desc}`,
          value: soul.slug,
        };
      });

      console.log(pc.bold(`\n${pagination.total} soul(s) found:\n`));

      const slug = await select({
        message: "Select a soul to pull",
        choices: [...choices, { name: pc.dim("Cancel"), value: "__cancel__" }],
      });

      if (slug === "__cancel__") {
        return;
      }

      // Pull the selected soul
      log(`Pulling soul '${slug}' from registry`);
      const content = await client.getContent(slug);
      const soul = parseSoulFile(content);
      const name = soul.frontmatter.name ?? slug;
      cacheSoul(name, content, soul.hash);
      console.log(pc.green(`\n✓ Pulled ${pc.bold(name)} (${slug})`));

      // Ask if they want to swap immediately
      const shouldSwap = await inquirerConfirm({
        message: "Swap to this soul now?",
        default: true,
      });

      if (shouldSwap) {
        const { backedUp } = swapSoul(content);
        console.log(pc.green(`✓ Swapped to ${pc.bold(name)}`));
        console.log(pc.dim(`  Written to ${getSoulPath()}`));
        if (backedUp) {
          console.log(pc.dim(`  Original SOUL.md backed up (use 'soul rollback' to restore)`));
        }
      } else {
        console.log(pc.dim(`  Use 'soul swap ${name}' to activate later.`));
      }
    } catch (err) {
      if ((err as Error).name === "ExitPromptError") {
        // User pressed Ctrl+C during prompt
        return;
      }
      fail((err as Error).message);
    }
  });

// --- install ---
program
  .command("install")
  .description("Install the SoulMD skill into OpenClaw (~/.openclaw/skills/soulmd/)")
  .action(() => {
    const { path, updated } = installSkill();
    if (updated) {
      console.log(pc.green(`\n✓ Updated SoulMD skill`));
    } else {
      console.log(pc.green(`\n✓ Installed SoulMD skill`));
    }
    console.log(pc.dim(`  ${path}`));
    console.log(pc.dim(`  Your OpenClaw bot can now swap souls via natural language.`));
  });

// --- uninstall ---
program
  .command("uninstall")
  .description("Remove the SoulMD skill from OpenClaw")
  .action(() => {
    if (!isSkillInstalled()) {
      console.log(pc.yellow("SoulMD skill is not installed."));
      return;
    }

    const removed = uninstallSkill();
    if (removed) {
      console.log(pc.green("\n✓ Uninstalled SoulMD skill"));
    } else {
      fail("Failed to uninstall skill.");
    }
  });

program.parse();
