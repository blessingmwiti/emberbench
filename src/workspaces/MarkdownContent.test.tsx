import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { MarkdownContent } from './MarkdownContent';

describe('MarkdownContent', () => {
  it('renders common Markdown and fenced code without injecting HTML', () => {
    const { container } = render(
      <MarkdownContent
        content={[
          '## Private plan',
          '',
          'Use **small steps** and `localStorage`.',
          '',
          '- Draft',
          '- Review',
          '',
          '```ts',
          'const privateValue = "<script>alert(1)</script>";',
          '```',
        ].join('\n')}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Private plan' })).toBeInTheDocument();
    expect(container.querySelector('strong')).toHaveTextContent('small steps');
    expect(container.querySelector('p code')).toHaveTextContent('localStorage');
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(container.querySelector('pre code')).toHaveAttribute('data-language', 'ts');
    expect(container.querySelector('script')).toBeNull();
  });

  it('allows explicit web links and neutralizes unsafe link protocols', () => {
    const { container } = render(
      <MarkdownContent
        content={'Read [the guide](https://example.com) but ignore [this](javascript:alert).'}
      />,
    );

    expect(screen.getByRole('link', { name: 'the guide' })).toHaveAttribute(
      'href',
      'https://example.com',
    );
    expect(screen.queryByRole('link', { name: 'this' })).toBeNull();
    expect(container).toHaveTextContent('but ignore this.');
  });

  it('renders raw HTML as inert text', () => {
    const { container } = render(<MarkdownContent content={'<img src=x onerror="alert(1)">'} />);

    expect(container.querySelector('img')).toBeNull();
    expect(container).toHaveTextContent('<img src=x onerror="alert(1)">');
  });

  it('classifies diff lines without treating markers as markup', () => {
    const { container } = render(
      <MarkdownContent
        content={[
          '```diff',
          '--- a/file.ts',
          '+++ b/file.ts',
          '@@ -1 +1 @@',
          '-const mode = "cloud";',
          '+const mode = "local";',
          ' context();',
          '```',
        ].join('\n')}
      />,
    );

    expect(container.querySelector('pre')).toHaveAttribute('data-language', 'diff');
    expect(container.querySelectorAll('.markdown-diff-line--metadata')).toHaveLength(2);
    expect(container.querySelector('.markdown-diff-line--hunk')).toHaveTextContent('@@ -1 +1 @@');
    expect(container.querySelector('.markdown-diff-line--removal')).toHaveTextContent(
      '-const mode = "cloud";',
    );
    expect(container.querySelector('.markdown-diff-line--addition')).toHaveTextContent(
      '+const mode = "local";',
    );
  });
});
