import React from "react";
import "katex/dist/katex.min.css";
import { InlineMath, BlockMath } from "react-katex";

interface MarkdownLatexProps {
  children: string;
  className?: string;
}

/**
 * Component that renders text with LaTeX and basic Markdown support.
 *
 * LaTeX syntax:
 * - Inline: $formula$ or \(formula\)
 * - Block: $$formula$$ or \[formula\]
 *
 * Markdown syntax:
 * - **bold**
 * - *italic*
 * - `code`
 * - [link](url)
 * - - list items
 * - | tables |
 * - --- horizontal rules
 */
export function MarkdownLatex({ children, className }: MarkdownLatexProps) {
  if (!children) return null;

  const elements = parseContent(children);

  return (
    <span className={className}>
      {elements.map((element, index) => (
        <React.Fragment key={index}>{element}</React.Fragment>
      ))}
    </span>
  );
}

function renderMarkdownTable(tableText: string): React.ReactNode {
  const lines = tableText.trim().split("\n").filter((l) => l.trim());
  if (lines.length < 2) return <span>{tableText}</span>;

  const parseCells = (line: string) =>
    line.split("|").filter((c) => c.trim()).map((c) => c.trim());

  const headerCells = parseCells(lines[0]);
  // Skip separator line (contains ---)
  const dataLines = lines.slice(2);
  const rows = dataLines.map(parseCells);

  // Detect alignment from separator row
  const separatorCells = parseCells(lines[1]);
  const alignments = separatorCells.map((cell) => {
    if (cell.startsWith(":") && cell.endsWith(":")) return "center";
    if (cell.endsWith(":")) return "right";
    return "left";
  });

  return (
    <div className="my-3 overflow-x-auto custom-scrollbar" style={{
      maxWidth: "100%",
      borderRadius: 10,
      border: "1px solid rgba(147,51,234,0.15)",
      backgroundColor: "rgba(15,13,25,0.4)",
    }}>
      <table
        style={{
          borderCollapse: "collapse",
          fontSize: "12px",
          width: "100%",
          minWidth: "max-content",
        }}
      >
        <thead>
          <tr>
            {headerCells.map((cell, i) => (
              <th
                key={i}
                style={{
                  padding: "8px 14px",
                  borderBottom: "2px solid rgba(147,51,234,0.2)",
                  textAlign: (alignments[i] || "left") as "left" | "center" | "right",
                  fontWeight: 600,
                  color: "#c084fc",
                  whiteSpace: "nowrap",
                  fontSize: "11px",
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                  backgroundColor: "rgba(147,51,234,0.06)",
                }}
              >
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr
              key={ri}
              style={{
                backgroundColor: ri % 2 === 0 ? "transparent" : "rgba(147,51,234,0.03)",
              }}
            >
              {row.map((cell, ci) => (
                <td
                  key={ci}
                  style={{
                    padding: "6px 14px",
                    borderBottom: "1px solid rgba(147,51,234,0.08)",
                    color: "#e4e4e7",
                    whiteSpace: "nowrap",
                    textAlign: (alignments[ci] || "left") as "left" | "center" | "right",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {parseInlineMarkdown(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function isMarkdownTable(text: string): boolean {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return false;
  // Must have at least a header row and a separator row with ---
  return lines[0].includes("|") && lines.some((l) => /^\|?\s*[-:]+\s*\|/.test(l));
}

function parseContent(text: string): React.ReactNode[] {
  const elements: React.ReactNode[] = [];

  // Split by block math first ($$...$$)
  const blockParts = text.split(/(\$\$[\s\S]*?\$\$)/g);

  for (const part of blockParts) {
    if (part.startsWith("$$") && part.endsWith("$$")) {
      // Block math
      const formula = part.slice(2, -2).trim();
      try {
        elements.push(
          <div className="my-2 overflow-x-auto">
            <BlockMath math={formula} />
          </div>
        );
      } catch {
        elements.push(<code className="text-red-500">{part}</code>);
      }
    } else {
      // Split out markdown tables from inline content
      const tableRegex = /((?:^|\n)\|[^\n]+\|\n\|[-:| ]+\|\n(?:\|[^\n]+\|\n?)*)/g;
      let lastIdx = 0;
      let tableMatch;

      while ((tableMatch = tableRegex.exec(part)) !== null) {
        // Text before table
        if (tableMatch.index > lastIdx) {
          elements.push(...parseInlineContent(part.slice(lastIdx, tableMatch.index)));
        }
        // Render table
        if (isMarkdownTable(tableMatch[1])) {
          elements.push(renderMarkdownTable(tableMatch[1]));
        } else {
          elements.push(...parseInlineContent(tableMatch[1]));
        }
        lastIdx = tableMatch.index + tableMatch[0].length;
      }

      // Remaining text after last table
      if (lastIdx < part.length) {
        elements.push(...parseInlineContent(part.slice(lastIdx)));
      }
    }
  }

  return elements;
}

function parseInlineContent(text: string): React.ReactNode[] {
  const elements: React.ReactNode[] = [];

  // Regex for inline math ($...$) - non-greedy, single line
  const inlineMathRegex = /\$([^\$\n]+)\$/g;

  let lastIndex = 0;
  let match;

  while ((match = inlineMathRegex.exec(text)) !== null) {
    // Add text before match
    if (match.index > lastIndex) {
      elements.push(...parseMarkdown(text.slice(lastIndex, match.index)));
    }

    // Add inline math
    const formula = match[1].trim();
    try {
      elements.push(<InlineMath math={formula} />);
    } catch {
      elements.push(<code className="text-red-500">${formula}$</code>);
    }

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    elements.push(...parseMarkdown(text.slice(lastIndex)));
  }

  return elements;
}

function parseMarkdown(text: string): React.ReactNode[] {
  if (!text) return [];

  const elements: React.ReactNode[] = [];

  // Split by lines to handle line breaks
  const lines = text.split("\n");

  lines.forEach((line, lineIndex) => {
    if (lineIndex > 0) {
      elements.push(<br />);
    }

    // Horizontal rule
    if (/^[-*_]{3,}\s*$/.test(line.trim())) {
      elements.push(
        <hr style={{
          border: "none",
          borderTop: "1px solid rgba(147,51,234,0.15)",
          margin: "12px 0",
        }} />
      );
      return;
    }

    // Headings (### h3, ## h2, # h1)
    const headingMatch = line.match(/^(#{1,4})\s+(.+)/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const content = headingMatch[2];
      const sizes: Record<number, { fontSize: number; fontWeight: number; marginTop: number }> = {
        1: { fontSize: 18, fontWeight: 700, marginTop: 16 },
        2: { fontSize: 16, fontWeight: 650, marginTop: 12 },
        3: { fontSize: 14, fontWeight: 600, marginTop: 10 },
        4: { fontSize: 13, fontWeight: 590, marginTop: 8 },
      };
      const style = sizes[level] || sizes[3];
      elements.push(
        <span className="block" style={{
          fontSize: style.fontSize,
          fontWeight: style.fontWeight,
          color: "#f4f4f5",
          marginTop: lineIndex === 0 ? 0 : style.marginTop,
          marginBottom: 4,
        }}>
          {parseInlineMarkdown(content)}
        </span>
      );
      return;
    }

    // Check for list items
    if (line.match(/^[-*]\s+/)) {
      const content = line.replace(/^[-*]\s+/, "");
      elements.push(
        <span className="block pl-4">
          <span style={{ color: "#9333ea", marginRight: 10, display: "inline-block" }}>•</span>
          {parseInlineMarkdown(content)}
        </span>
      );
      return;
    }

    // Check for indented list items (  - item)
    const indentedListMatch = line.match(/^(\s{2,})[-*]\s+/);
    if (indentedListMatch) {
      const indent = Math.floor(indentedListMatch[1].length / 2);
      const content = line.replace(/^\s+[-*]\s+/, "");
      elements.push(
        <span className="block" style={{ paddingLeft: 16 + indent * 12 }}>
          <span style={{ color: "#7c3aed", marginRight: 10, display: "inline-block" }}>◦</span>
          {parseInlineMarkdown(content)}
        </span>
      );
      return;
    }

    // Check for numbered list
    const numberedMatch = line.match(/^(\d+)\.\s+/);
    if (numberedMatch) {
      const content = line.replace(/^\d+\.\s+/, "");
      elements.push(
        <span className="block pl-4">
          <span style={{ color: "#9333ea", fontWeight: 600, marginRight: 10, display: "inline-block" }}>{numberedMatch[1]}.</span>
          {parseInlineMarkdown(content)}
        </span>
      );
      return;
    }

    elements.push(...parseInlineMarkdown(line));
  });

  return elements;
}

function parseInlineMarkdown(text: string): React.ReactNode[] {
  if (!text) return [];

  const elements: React.ReactNode[] = [];

  // Combined regex for markdown patterns
  // Order matters: bold before italic
  const patterns = [
    { regex: /\*\*([^*]+)\*\*/g, render: (content: string) => <strong style={{ fontWeight: 600, color: "#f4f4f5" }}>{content}</strong> },
    { regex: /\*([^*]+)\*/g, render: (content: string) => <em>{content}</em> },
    { regex: /`([^`]+)`/g, render: (content: string) => (
      <code style={{
        backgroundColor: "rgba(147,51,234,0.1)",
        border: "1px solid rgba(147,51,234,0.15)",
        padding: "1px 5px",
        borderRadius: 4,
        fontSize: "12px",
        fontFamily: "monospace",
        color: "#c084fc",
      }}>{content}</code>
    )},
    { regex: /\[([^\]]+)\]\(([^)]+)\)/g, render: (content: string, url: string) => (
      <a href={url} className="text-blue-600 hover:underline" target="_blank" rel="noopener noreferrer">
        {content}
      </a>
    )},
  ];

  let currentText = text;
  let processed = false;

  for (const pattern of patterns) {
    if (pattern.regex.test(currentText)) {
      processed = true;

      // Reset regex lastIndex
      pattern.regex.lastIndex = 0;

      let matches: RegExpExecArray | null;
      const matchList: { index: number; match: RegExpExecArray }[] = [];

      while ((matches = pattern.regex.exec(currentText)) !== null) {
        matchList.push({ index: matches.index, match: matches });
      }

      let lastIdx = 0;
      for (const { match } of matchList) {
        // Text before match
        if (match.index > lastIdx) {
          elements.push(currentText.slice(lastIdx, match.index));
        }

        // Rendered match
        if (match.length === 3) {
          // Link pattern with 2 groups
          elements.push(pattern.render(match[1], match[2]));
        } else {
          elements.push(pattern.render(match[1]));
        }

        lastIdx = match.index + match[0].length;
      }

      // Remaining text
      if (lastIdx < currentText.length) {
        elements.push(currentText.slice(lastIdx));
      }

      break; // Only process first matching pattern
    }
  }

  if (!processed) {
    elements.push(text);
  }

  return elements;
}

export default MarkdownLatex;
