"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";

const installers = [
  { label: "clawhub", command: "npx clawhub install opensoulmd" },
  {
    label: "curl",
    command: "curl -fsSL https://opensoul.md/install.sh | sh",
  },
  { label: "npm", command: "npm install -g opensoul" },
];

export default function InstallerWidget() {
  const [selected, setSelected] = useState(0);
  const [copied, setCopied] = useState(false);

  return (
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
  );
}
