"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { listSouls } from "@/lib/api";
import type { Soul } from "@/lib/types";
import SoulCard from "@/components/SoulCard";
import { Copy, Check } from "lucide-react";

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0 },
};

export default function HomePage() {
  const installers = [
    { label: "npm", command: "npm install -g soulmd" },
    { label: "pnpm", command: "pnpm add -g soulmd" },
    { label: "yarn", command: "yarn global add soulmd" },
    { label: "bun", command: "bun add -g soulmd" },
  ];
  const [selected, setSelected] = useState(0);
  const [copied, setCopied] = useState(false);
  const [topSouls, setTopSouls] = useState<Soul[]>([]);
  const [recentSouls, setRecentSouls] = useState<Soul[]>([]);

  useEffect(() => {
    listSouls({ sort: "top", limit: 6 }).then((res) => setTopSouls(res.data));
    listSouls({ limit: 6 }).then((res) => setRecentSouls(res.data));
  }, []);

  return (
    <div>
      {/* Hero */}
      <section className="text-center py-16">
        <motion.h1
          variants={fadeUp}
          initial="hidden"
          animate="visible"
          transition={{ duration: 0.4 }}
          className="text-4xl md:text-6xl font-bold mb-4"
        >
          Open<span className="text-accent font-mono">SOUL</span>.md
        </motion.h1>
        <motion.p
          variants={fadeUp}
          initial="hidden"
          animate="visible"
          transition={{ duration: 0.4, delay: 0.08 }}
          className="text-text text-xl max-w-xl mx-auto mb-8"
        >
          Upload your <code className="font-mono"><span className="text-accent">SOUL</span>.md</code>
        </motion.p>
        <motion.div
          variants={fadeUp}
          initial="hidden"
          animate="visible"
          transition={{ duration: 0.4, delay: 0.15 }}
          className="flex items-center justify-center gap-4 mb-8"
        >
          <Link
            href="/browse"
            className="bg-accent hover:bg-accent-hover text-white px-8 py-3 rounded-lg text-lg font-semibold transition-colors shadow-md shadow-accent/20"
          >
            Browse
          </Link>
          <Link
            href="/upload"
            className="border-2 border-accent text-accent hover:bg-accent hover:text-white px-8 py-3 rounded-lg text-lg font-semibold transition-colors"
          >
            Upload <span className="font-mono"><span className="text-accent">SOUL</span>.md</span>
          </Link>
        </motion.div>
        <motion.div
          variants={fadeUp}
          initial="hidden"
          animate="visible"
          transition={{ duration: 0.4, delay: 0.22 }}
          className="inline-flex flex-col items-center"
        >
          <div className="bg-bg-card border border-border rounded-lg overflow-hidden">
            <div className="flex border-b border-border">
              {installers.map((inst, i) => (
                <button
                  key={inst.label}
                  onClick={() => {
                    setSelected(i);
                    setCopied(false);
                  }}
                  className={`flex-1 text-xs px-4 py-2 transition-colors ${
                    i === selected
                      ? "text-accent bg-bg-hover font-medium"
                      : "text-text-muted hover:text-text hover:bg-bg-hover/50"
                  }`}
                >
                  {inst.label}
                </button>
              ))}
            </div>
            <button
              onClick={() => {
                navigator.clipboard.writeText(installers[selected].command);
                setCopied(true);
              }}
              className="group w-full flex items-center gap-3 px-5 py-3 hover:bg-bg-hover/50 transition-colors cursor-pointer"
            >
              <span className="text-success text-sm">$</span>
              <code className="text-sm text-text font-mono flex-1 text-left">
                {installers[selected].command}
              </code>
              <span className="text-text-muted group-hover:text-text transition-colors">
                {copied ? (
                  <Check size={14} className="text-accent" />
                ) : (
                  <Copy size={14} />
                )}
              </span>
            </button>
          </div>
        </motion.div>
      </section>

      {/* Top Rated */}
      {topSouls.length > 0 && (
        <motion.section
          variants={fadeUp}
          initial="hidden"
          animate="visible"
          transition={{ duration: 0.4, delay: 0.3 }}
          className="mb-12"
        >
          <h2 className="text-xl font-semibold mb-4">Top Rated</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {topSouls.map((soul, i) => (
              <motion.div
                key={soul.id}
                variants={fadeUp}
                initial="hidden"
                animate="visible"
                transition={{ duration: 0.3, delay: 0.35 + i * 0.04 }}
              >
                <SoulCard soul={soul} />
              </motion.div>
            ))}
          </div>
        </motion.section>
      )}

      {/* Recently Added */}
      {recentSouls.length > 0 && (
        <motion.section
          variants={fadeUp}
          initial="hidden"
          animate="visible"
          transition={{ duration: 0.4, delay: 0.35 }}
        >
          <h2 className="text-xl font-semibold mb-4">Recently Added</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {recentSouls.map((soul, i) => (
              <motion.div
                key={soul.id}
                variants={fadeUp}
                initial="hidden"
                animate="visible"
                transition={{ duration: 0.3, delay: 0.4 + i * 0.04 }}
              >
                <SoulCard soul={soul} />
              </motion.div>
            ))}
          </div>
        </motion.section>
      )}
    </div>
  );
}
