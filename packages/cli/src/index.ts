#!/usr/bin/env node
import { Command } from "commander";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname, basename } from "node:path";
import { createInterface } from "node:readline";
import pc from "picocolors";
import { createHash } from "node:crypto";
import { loadConfig, getConfigValue, setConfigValue } from "./config.js";
import {
  listCached,
  getCached,
  cacheSoul,
  removeCached,
  touchCached,
} from "./cache.js";
import {
  swapSoul,
  rollbackSoul,
  hasBackup,
  isSwapped,
  readCurrentSoul,
  getSoulPath,
} from "./swap.js";
import { RegistryClient } from "./registry-client.js";
import {
  installSkill,
  uninstallSkill,
  isSkillInstalled,
  getSkillPath,
} from "./skill.js";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(
  readFileSync(resolve(__dirname, "../package.json"), "utf-8"),
);

let verbose = false;

function log(...args: unknown[]) {
  if (verbose) console.error(pc.dim("[verbose]"), ...args);
}

function fail(message: string): never {
  console.error(pc.red(message));
  process.exit(1);
}

const SPINNER_FRAMES = ["◐", "◓", "◑", "◒"];

function spinner(message: string): { stop: (finalMessage?: string) => void } {
  let i = 0;
  const stream = process.stderr;
  stream.write(`  ${SPINNER_FRAMES[0]} ${message}`);
  const timer = setInterval(() => {
    i = (i + 1) % SPINNER_FRAMES.length;
    stream.write(`\r  ${SPINNER_FRAMES[i]} ${message}`);
  }, 100);
  return {
    stop(finalMessage?: string) {
      clearInterval(timer);
      stream.write(`\r${" ".repeat(message.length + 10)}\r`);
      if (finalMessage) console.log(finalMessage);
    },
  };
}

function confirm(prompt: string, defaultYes = false): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const hint = defaultYes ? "[Y/n]" : "[y/N]";
  return new Promise((resolve) => {
    rl.question(`${prompt} ${hint} `, (answer) => {
      rl.close();
      const trimmed = answer.trim().toLowerCase();
      if (trimmed === "") resolve(defaultYes);
      else resolve(trimmed === "y");
    });
  });
}

const program = new Command();

program
  .name("soul")
  .description("OpenSoul CLI — manage swappable bot personality files")
  .version(pkg.version, "-v, --version")
  .option("--verbose", "Enable verbose output for debugging")
  .hook("preAction", () => {
    verbose = program.opts().verbose ?? false;
  });

// --- possess ---
program
  .command("possess <pathOrName>")
  .description("Swap your bot's SOUL.md with a soul file or cached soul")
  .option("--dry-run", "Preview the swap without writing anything")
  .option("-y, --yes", "Skip confirmation prompt")
  .action(
    async (pathOrName: string, opts: { dryRun?: boolean; yes?: boolean }) => {
      let content: string;
      let source: string;
      let soulName: string | undefined;
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
          soulName = cached.entry.name;
          log(`Reading from cache: ${cached.entry.name}`);
        } else {
          // Check cache for fuzzy matches before hitting the network
          const normalize = (s: string) =>
            s
              .toLowerCase()
              .replace(/[-_\s]+/g, " ")
              .trim();
          const input = normalize(pathOrName);
          const allCached = listCached();
          const fuzzyMatches = allCached.filter((e) => {
            const n = normalize(e.name);
            return n.includes(input) || input.includes(n);
          });

          if (fuzzyMatches.length > 0) {
            const labels = fuzzyMatches.map((e) => pc.cyan(e.name));
            fail(
              `Soul '${pathOrName}' not found in cache.\n\n  Did you mean one of these?\n${labels.map((l) => `    ${l}`).join("\n")}\n\n  Use the exact name, or 'soul summon <label>' to download from the registry.`,
            );
          }

          // Auto-summon from registry — normalize to label format (spaces → hyphens, lowercase)
          const label = pathOrName.trim().toLowerCase().replace(/\s+/g, "-");
          const s = spinner(pc.cyan("🔮 Summoning soul from registry..."));
          try {
            const client = new RegistryClient();
            log(`Registry URL: ${loadConfig().registry_url}`);
            log(`Trying label: ${label}`);
            const [meta, fetchedContent] = await Promise.all([
              client.getMeta(label),
              client.getContent(label),
            ]);
            content = fetchedContent;
            const hash = createHash("sha256").update(content).digest("hex");
            const name = meta.name;
            cacheSoul(name, content, hash, meta.label);
            soulName = name;
            source = `registry:${meta.label}`;
            s.stop(
              pc.green(
                `🔮 Summoned ${pc.yellow(pc.bold(name))} (${meta.label})`,
              ),
            );
          } catch (err) {
            s.stop();

            // Try to suggest similar souls from the registry — search by first word for broader matches
            let suggestion = "";
            try {
              const words = pathOrName
                .replace(/[-_]/g, " ")
                .trim()
                .split(/\s+/);
              const searchTerm = words[0];
              const client = new RegistryClient();
              const { data: results } = await client.search(
                searchTerm,
                undefined,
                undefined,
                5,
              );
              if (results.length > 0) {
                const labels = results.map((r) => pc.cyan(r.label));
                suggestion = `\n\n  Did you mean one of these?\n${labels.map((l) => `    ${l}`).join("\n")}`;
              }
            } catch {
              // Search failed too — just show the original error
            }

            fail(
              `Soul '${pathOrName}' not found as a local file, in cache, or in the registry.${suggestion}`,
            );
          }
        }
      }

      const filename = pathOrName.split("/").pop() ?? pathOrName;

      // Validate the target soul path before attempting the swap
      const targetPath = getSoulPath();
      const targetDir = dirname(targetPath);
      if (!existsSync(targetDir)) {
        fail(
          `Target directory not found: ${pc.yellow(targetDir)}\n\n  Your configured SOUL.md path is: ${pc.cyan(targetPath)}\n  Use ${pc.bold("soul path <newPath>")} to set the correct path to your SOUL.md file.`,
        );
      }
      if (basename(targetPath) !== "SOUL.md") {
        fail(
          `Configured path points to ${pc.yellow(basename(targetPath))}, expected ${pc.cyan("SOUL.md")}\n\n  Your configured path is: ${pc.cyan(targetPath)}\n  Use ${pc.bold("soul path <newPath>")} to set it to a valid SOUL.md file or its parent directory.`,
        );
      }

      if (opts.dryRun) {
        console.log(pc.bold("\n[dry-run] Would possess with:"));
        console.log(`  Source: ${source}`);
        console.log(`  Target: ${getSoulPath()}`);
        console.log(
          `  Backup: ${!isSwapped() && existsSync(getSoulPath()) ? "would create" : "already exists"}`,
        );
        const preview = content.trim().split("\n")[0] ?? "";
        console.log(`  Preview: ${pc.cyan(preview)}`);
        return;
      }

      // Confirmation prompt on first swap (unless --yes or non-interactive)
      if (
        !opts.yes &&
        !isSwapped() &&
        existsSync(getSoulPath()) &&
        process.stdin.isTTY
      ) {
        console.log(pc.dim(`  SOUL.md location: ${getSoulPath()}`));
        const ok = await confirm(
          "This will modify your SOUL.md (original will be backed up locally). Continue?",
          true,
        );
        if (!ok) {
          console.log(pc.dim("Aborted."));
          return;
        }
      }

      const s = spinner(pc.cyan("👻 Possessing..."));
      const { backedUp } = swapSoul(content);
      if (soulName) touchCached(soulName);
      s.stop(pc.green(`\n👻 Possessed with ${pc.yellow(pc.bold(filename))}`));

      console.log(pc.dim(`  Written to ${getSoulPath()}`));
      if (backedUp) {
        console.log(
          pc.dim(
            `  Original SOUL.md backed up (use 'soul exorcise' to restore)`,
          ),
        );
      }
    },
  );

// --- exorcise ---
program
  .command("exorcise")
  .description("Restore the original SOUL.md from backup")
  .action(() => {
    if (!hasBackup()) {
      fail("No backup found. Nothing to exorcise.");
    }

    const restored = rollbackSoul();
    if (restored) {
      console.log(
        pc.green(`\n🕯️  Soul exorcised — ${pc.yellow("SOUL.md")} restored`),
      );
      console.log(pc.dim(`  ${getSoulPath()}`));
    } else {
      fail("Failed to exorcise soul.");
    }
  });

// --- search ---
program
  .command("search [query]")
  .description("Search the soul registry")
  .option("--top", "Sort by highest-rated")
  .option("--popular", "Sort by most popular")
  .option("--no-interactive", "Print results without interactive selection")
  .action(
    async (
      query: string | undefined,
      opts: { top?: boolean; popular?: boolean; interactive?: boolean },
    ) => {
      try {
        const client = new RegistryClient();
        const sort = opts.top ? "top" : opts.popular ? "popular" : undefined;
        log(
          `Searching registry: query=${query ?? "(all)"} sort=${sort ?? "recent"}`,
        );
        const { data: results, pagination } = await client.search(query, sort);

        if (results.length === 0) {
          console.log(pc.yellow("No souls found."));
          return;
        }

        // Non-interactive mode: just print results
        if (!process.stdin.isTTY || opts.interactive === false) {
          console.log(
            pc.bold(
              `\n${pagination.total} soul(s) found (page ${pagination.page}/${pagination.totalPages}):\n`,
            ),
          );
          for (const soul of results) {
            const rating = soul.rating_avg
              ? pc.yellow(` ★ ${soul.rating_avg.toFixed(1)}`) +
                pc.dim(` (${soul.rating_count} ratings)`)
              : "";
            const desc = soul.description
              ? pc.dim(` — ${soul.description}`)
              : "";
            const nameTag =
              soul.name !== soul.label ? ` ${pc.yellow(`(${soul.name})`)}` : "";
            console.log(
              `  ${pc.cyan(pc.bold(soul.label))}${nameTag} ${pc.magenta(`by ${soul.author}`)}${rating}${desc}`,
            );
          }
          return;
        }

        // Interactive mode: let user pick a soul
        const { select, confirm: inquirerConfirm } =
          await import("@inquirer/prompts");

        const choices = results.map((soul) => {
          const rating = soul.rating_avg
            ? pc.yellow(` ★ ${soul.rating_avg.toFixed(1)}`) +
              pc.dim(` (${soul.rating_count})`)
            : "";
          const author = pc.magenta(`by ${soul.author}`);
          const desc = soul.description ? pc.dim(` — ${soul.description}`) : "";
          const nameTag =
            soul.name !== soul.label ? ` ${pc.yellow(`(${soul.name})`)}` : "";
          return {
            name: `${pc.cyan(pc.bold(soul.label))}${nameTag} ${author}${rating}${desc}`,
            value: soul.label,
          };
        });

        console.log(pc.bold(`\n${pagination.total} soul(s) found:\n`));

        const label = await select({
          message: "Select a soul to pull",
          choices: [
            ...choices,
            { name: pc.dim("Cancel"), value: "__cancel__" },
          ],
        });

        if (label === "__cancel__") {
          return;
        }

        // Summon the selected soul
        log(`Summoning soul '${label}' from registry`);
        const [meta, content] = await Promise.all([
          client.getMeta(label),
          client.getContent(label),
        ]);
        const hash = createHash("sha256").update(content).digest("hex");
        const name = meta.name;
        cacheSoul(name, content, hash, meta.label);
        console.log(
          pc.green(`🔮 Summoned ${pc.yellow(pc.bold(name))} (${label})`),
        );

        // Ask if they want to possess immediately
        const shouldSwap = await inquirerConfirm({
          message: "Possess your bot with this soul now?",
          default: true,
        });

        if (shouldSwap) {
          const { backedUp } = swapSoul(content);
          console.log(
            pc.green(`\n👻 Possessed with ${pc.yellow(pc.bold(name))}`),
          );
          console.log(pc.dim(`  Written to ${getSoulPath()}`));
          if (backedUp) {
            console.log(
              pc.dim(
                `  Original SOUL.md backed up (use 'soul exorcise' to restore)`,
              ),
            );
          }
        } else {
          console.log(
            pc.dim(`  Use 'soul possess ${name}' to activate later.`),
          );
        }
      } catch (err) {
        if ((err as Error).name === "ExitPromptError") {
          // User pressed Ctrl+C during prompt
          return;
        }
        fail((err as Error).message);
      }
    },
  );

// --- summon ---
program
  .command("summon <label>")
  .description("Download a soul from the registry to local cache")
  .action(async (label: string) => {
    log(`Summoning soul '${label}' from registry`);
    try {
      const client = new RegistryClient();
      log(`Registry URL: ${loadConfig().registry_url}`);
      const [meta, content] = await Promise.all([
        client.getMeta(label),
        client.getContent(label),
      ]);
      const hash = createHash("sha256").update(content).digest("hex");
      const name = meta.name;

      cacheSoul(name, content, hash, meta.label);

      console.log(
        pc.green(`\n🔮 Summoned ${pc.yellow(pc.bold(name))} (${label})`),
      );
      console.log(
        pc.dim(`  Cached locally. Use 'soul possess ${name}' to activate.`),
      );
    } catch (err) {
      fail((err as Error).message);
    }
  });

// --- list ---
program
  .command("list")
  .description("List locally cached souls (most recently used first)")
  .option("-p, --page <number>", "Page number", "1")
  .option("-n, --per-page <number>", "Souls per page", "20")
  .action((opts) => {
    const cached = listCached();
    if (cached.length === 0) {
      console.log(
        pc.yellow(
          "No cached souls. Use 'soul summon <label>' to download one.",
        ),
      );
      return;
    }

    const sorted = [...cached].sort((a, b) => {
      const aUsed = a.lastUsedAt ?? "";
      const bUsed = b.lastUsedAt ?? "";
      if (aUsed !== bUsed) return bUsed.localeCompare(aUsed);
      return (b.cachedAt ?? "").localeCompare(a.cachedAt ?? "");
    });

    const perPage = Math.max(1, parseInt(opts.perPage, 10) || 20);
    const totalPages = Math.ceil(sorted.length / perPage);
    const page = Math.min(
      Math.max(1, parseInt(opts.page, 10) || 1),
      totalPages,
    );
    const start = (page - 1) * perPage;
    const pageItems = sorted.slice(start, start + perPage);

    for (const entry of pageItems) {
      const label =
        entry.label ?? entry.name.toLowerCase().replace(/\s+/g, "-");
      const nameDisplay =
        entry.label && entry.name !== entry.label
          ? ` ${pc.dim(`(${entry.name})`)}`
          : "";
      console.log(`  ${pc.yellow(label)}${nameDisplay}`);
    }

    if (totalPages > 1) {
      console.log(
        pc.dim(`\n  Page ${page}/${totalPages} (${sorted.length} souls)`),
      );
    }
  });

// --- banish ---
program
  .command("banish <name>")
  .description("Remove a soul from the local cache")
  .action((name: string) => {
    const removed = removeCached(name);
    if (removed) {
      console.log(
        pc.green(`\n🚪 Banished ${pc.yellow(pc.bold(name))} from cache`),
      );
    } else {
      fail(`Soul '${name}' not found in cache.`);
    }
  });

// --- status ---
program
  .command("status")
  .description("Show current SOUL.md status and swap state")
  .action(() => {
    const soulPath = getSoulPath();
    const wsDir = dirname(soulPath);

    if (!existsSync(wsDir)) {
      console.log(pc.yellow(`OpenClaw workspace not found at ${wsDir}`));
      console.log(
        pc.dim("Is OpenClaw installed? Expected ~/.openclaw/workspace/"),
      );
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
    console.log(
      `State: ${swapped ? pc.cyan("swapped") : pc.green("original")}`,
    );
    console.log(`Backup: ${hasBackup() ? pc.green("saved") : pc.dim("none")}`);

    if (swapped) {
      const rawContent = content.split("\n").slice(1).join("\n");
      const firstLine = rawContent.trim().split("\n")[0] ?? "";
      console.log(`Preview: ${pc.cyan(firstLine)}`);
    }
  });

// --- path ---
program
  .command("path [newPath]")
  .description("Show or set the SOUL.md file path (or --skills for skills dir)")
  .option("--skills", "Show or set the OpenClaw skills directory path")
  .action((newPath: string | undefined, opts: { skills?: boolean }) => {
    const key = opts.skills ? "skills_path" : "soul_path";
    const label = opts.skills ? "Skills path" : "SOUL.md path";
    if (newPath) {
      const resolved = resolve(newPath);
      setConfigValue(key, resolved);
      console.log(pc.green(`  ${label} set to ${pc.yellow(resolved)}`));
    } else {
      console.log(opts.skills ? loadConfig().skills_path : getSoulPath());
    }
  });

// --- install ---
program
  .command("install")
  .description("Install the OpenSoul skill into OpenClaw")
  .action(() => {
    const { path, updated } = installSkill();
    if (updated) {
      console.log(pc.green(`\n✓ Updated OpenSOUL skill`));
    } else {
      console.log(pc.green(`\n✓ Installed OpenSOUL skill`));
    }
    console.log(pc.dim(`  ${path}`));
    console.log(
      pc.dim(`  Your OpenClaw bot can now swap souls via natural language.`),
    );
  });

// --- uninstall ---
program
  .command("uninstall")
  .description("Remove the OpenSoul skill from OpenClaw")
  .action(() => {
    if (!isSkillInstalled()) {
      console.log(pc.yellow("OpenSoul skill is not installed."));
      return;
    }

    const removed = uninstallSkill();
    if (removed) {
      console.log(pc.green("\n✓ Uninstalled OpenSOUL skill"));
    } else {
      fail("Failed to uninstall skill.");
    }
  });

// --- config ---
const configCmd = program
  .command("config")
  .description("Get or set CLI configuration values");

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

program.parse();
