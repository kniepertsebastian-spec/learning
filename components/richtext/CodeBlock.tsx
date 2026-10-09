"use client";

import * as React from "react";
import { CopyButton } from "@/components/richtext/CopyButton";
import { nodeText, splitLines } from "@/components/richtext/code-lines";
import { useLocaleOptional } from "@/lib/i18n";
import { terminalCommands } from "@/lib/markdown/blocks";
import { cn } from "@/lib/cn";

function langOf(code: React.ReactElement<{ className?: string }>): string {
  return /language-([\w+-]+)/.exec(code.props.className ?? "")?.[1] ?? "";
}

/** Normaler Codeblock; mit `title="datei.yaml"` und `{7-8}` Kopfzeile und hervorgehobene Zeilen. */
export function CodeBlock({ code, title, lines }: { code: React.ReactElement<{ className?: string; children?: React.ReactNode }>; title: string | null; lines: number[] }) {
  const lang = langOf(code);
  const text = nodeText(code.props.children).replace(/\n$/, "");
  const marked = new Set(lines);
  const split = splitLines(code.props.children);
  return (
    <figure className="my-3 max-w-full overflow-hidden rounded-[14px] border border-border bg-surface-inset" data-testid="code-block">
      {(title || lang) && (
        <figcaption className="flex items-center justify-between gap-3 border-b border-border-subtle bg-surface px-3.5 py-1.5">
          <span className="min-w-0 truncate font-mono text-xs text-subtle">{title ?? lang}</span>
          <CopyButton text={text} title={undefined} />
        </figcaption>
      )}
      <pre className="overflow-x-auto p-3.5 font-mono text-[13px] leading-relaxed text-foreground">
        <code className={cn("hljs block", code.props.className)}>
          {split.map((line, i) => (
            <span key={i} data-line={i + 1} data-highlighted={marked.has(i + 1) || undefined} className={cn("block min-h-[1.4em] px-1", marked.has(i + 1) && "-mx-3.5 border-l-2 border-accent bg-accent-soft px-3.5")}>
              {line.length ? line : "​"}
            </span>
          ))}
        </code>
      </pre>
    </figure>
  );
}

/** Terminal: `$ `-Zeilen sind Befehle (Prompt mint), alles andere Ausgabe (grau); Kopieren nimmt nur die Befehle; `{7}` markiert Fehlerzeilen. */
export function TerminalBlock({ code, lines }: { code: React.ReactElement<{ className?: string; children?: React.ReactNode }>; lines: number[] }) {
  const { t } = useLocaleOptional();
  const text = nodeText(code.props.children).replace(/\n$/, "");
  const rows = text.split("\n");
  const commands = terminalCommands(text);
  const errors = new Set(lines);
  return (
    <figure className="my-3 max-w-full overflow-hidden rounded-[14px] border border-border bg-surface-inset" data-testid="terminal-block">
      <figcaption className="flex items-center justify-between gap-3 border-b border-border-subtle bg-surface px-3.5 py-1.5">
        <span className="flex items-center gap-2">
          <span className="flex gap-1.5" aria-hidden="true">
            <span className="h-2.5 w-2.5 rounded-full bg-track" />
            <span className="h-2.5 w-2.5 rounded-full bg-track" />
            <span className="h-2.5 w-2.5 rounded-full bg-track" />
          </span>
          <span className="font-mono text-xs text-subtle">{t.lesson_blocks.terminal} · bash</span>
        </span>
        {commands && <CopyButton text={commands} />}
      </figcaption>
      <pre className="overflow-x-auto p-3.5 font-mono text-[13px] leading-relaxed">
        <code>
          {rows.map((row, i) => {
            const isCommand = row.startsWith("$ ");
            return (
              <span key={i} data-row={isCommand ? "command" : "output"} data-error={errors.has(i + 1) || undefined} className={cn("block min-h-[1.4em] px-1", errors.has(i + 1) && "-mx-3.5 bg-danger-soft px-3.5")}>
                {isCommand ? (
                  <>
                    <span className="text-mint-text select-none">$ </span>
                    <span className="text-foreground">{row.slice(2)}</span>
                  </>
                ) : (
                  <span className="text-code-muted">{row || "​"}</span>
                )}
              </span>
            );
          })}
        </code>
      </pre>
    </figure>
  );
}
