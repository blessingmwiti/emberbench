import { Fragment, type ReactNode } from 'react';

interface MarkdownContentProps {
  content: string;
}

function safeLinkTarget(target: string) {
  const normalized = target.trim();
  if (/^(https?:|mailto:)/i.test(normalized)) return normalized;
  return null;
}

function renderInline(content: string): ReactNode[] {
  const pattern = /(`[^`\n]+`|\*\*[^*\n]+\*\*|\*[^*\n]+\*|\[[^\]\n]+\]\([^\s)\n]+\))/g;
  const nodes: ReactNode[] = [];
  let cursor = 0;

  for (const match of content.matchAll(pattern)) {
    const index = match.index;
    if (index > cursor) nodes.push(content.slice(cursor, index));

    const token = match[0];
    const key = `${index}-${token}`;
    if (token.startsWith('`')) {
      nodes.push(<code key={key}>{token.slice(1, -1)}</code>);
    } else if (token.startsWith('**')) {
      nodes.push(<strong key={key}>{renderInline(token.slice(2, -2))}</strong>);
    } else if (token.startsWith('*')) {
      nodes.push(<em key={key}>{renderInline(token.slice(1, -1))}</em>);
    } else {
      const linkMatch = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token);
      const target = linkMatch ? safeLinkTarget(linkMatch[2] ?? '') : null;
      if (linkMatch && target) {
        nodes.push(
          <a
            href={target}
            key={key}
            rel={target.startsWith('mailto:') ? undefined : 'noreferrer'}
            target={target.startsWith('mailto:') ? undefined : '_blank'}
          >
            {linkMatch[1] ?? token}
          </a>,
        );
      } else {
        nodes.push(linkMatch?.[1] ?? token);
      }
    }
    cursor = index + token.length;
  }

  if (cursor < content.length) nodes.push(content.slice(cursor));
  return nodes;
}

function isBlockStart(line: string) {
  return (
    /^```/.test(line) ||
    /^#{1,3}\s+/.test(line) ||
    /^>\s?/.test(line) ||
    /^[-*]\s+/.test(line) ||
    /^\d+\.\s+/.test(line)
  );
}

function renderFencedCode(code: string[], language: string | undefined, key: string) {
  const normalizedLanguage = language || 'text';
  if (normalizedLanguage === 'diff') {
    return (
      <pre className="markdown-code-block markdown-code-block--diff" data-language="diff" key={key}>
        <code data-language="diff">
          {code.map((line, lineIndex) => {
            const kind =
              line.startsWith('+++') || line.startsWith('---')
                ? 'metadata'
                : line.startsWith('@@')
                  ? 'hunk'
                  : line.startsWith('+')
                    ? 'addition'
                    : line.startsWith('-')
                      ? 'removal'
                      : 'context';
            return (
              <span className={`markdown-diff-line markdown-diff-line--${kind}`} key={lineIndex}>
                {line || ' '}
              </span>
            );
          })}
        </code>
      </pre>
    );
  }

  return (
    <pre className="markdown-code-block" data-language={normalizedLanguage} key={key}>
      <code data-language={normalizedLanguage}>{code.join('\n')}</code>
    </pre>
  );
}

export function MarkdownContent({ content }: MarkdownContentProps) {
  const lines = content.replace(/\r\n?/g, '\n').split('\n');
  const blocks: ReactNode[] = [];

  for (let index = 0; index < lines.length; ) {
    const line = lines[index] ?? '';
    if (!line.trim()) {
      index += 1;
      continue;
    }

    const fence = /^```\s*([A-Za-z0-9_-]+)?\s*$/.exec(line);
    if (fence) {
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !/^```\s*$/.test(lines[index] ?? '')) {
        code.push(lines[index] ?? '');
        index += 1;
      }
      if (index < lines.length) index += 1;
      const language = fence[1]?.toLowerCase();
      blocks.push(renderFencedCode(code, language, `code-${index}`));
      continue;
    }

    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      const level = (heading[1] ?? '').length;
      const children = renderInline(heading[2] ?? '');
      blocks.push(
        level === 1 ? (
          <h2 key={`heading-${index}`}>{children}</h2>
        ) : level === 2 ? (
          <h3 key={`heading-${index}`}>{children}</h3>
        ) : (
          <h4 key={`heading-${index}`}>{children}</h4>
        ),
      );
      index += 1;
      continue;
    }

    if (/^>\s?/.test(line)) {
      const quote: string[] = [];
      while (index < lines.length && /^>\s?/.test(lines[index] ?? '')) {
        quote.push((lines[index] ?? '').replace(/^>\s?/, ''));
        index += 1;
      }
      blocks.push(<blockquote key={`quote-${index}`}>{renderInline(quote.join(' '))}</blockquote>);
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      const items: ReactNode[] = [];
      while (index < lines.length && /^[-*]\s+/.test(lines[index] ?? '')) {
        items.push(
          <li key={`item-${index}`}>
            {renderInline((lines[index] ?? '').replace(/^[-*]\s+/, ''))}
          </li>,
        );
        index += 1;
      }
      blocks.push(<ul key={`list-${index}`}>{items}</ul>);
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      const items: ReactNode[] = [];
      while (index < lines.length && /^\d+\.\s+/.test(lines[index] ?? '')) {
        items.push(
          <li key={`item-${index}`}>
            {renderInline((lines[index] ?? '').replace(/^\d+\.\s+/, ''))}
          </li>,
        );
        index += 1;
      }
      blocks.push(<ol key={`list-${index}`}>{items}</ol>);
      continue;
    }

    const paragraph: string[] = [line];
    index += 1;
    while (
      index < lines.length &&
      (lines[index] ?? '').trim() &&
      !isBlockStart(lines[index] ?? '')
    ) {
      paragraph.push(lines[index] ?? '');
      index += 1;
    }
    blocks.push(<p key={`paragraph-${index}`}>{renderInline(paragraph.join('\n'))}</p>);
  }

  return <Fragment>{blocks}</Fragment>;
}
