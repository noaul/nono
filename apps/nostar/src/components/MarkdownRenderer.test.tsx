import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import MarkdownRenderer from '../components/MarkdownRenderer';

vi.mock('../store/useAppStore', () => ({
  useAppStore: vi.fn((selector) => {
    const state = {
      language: 'zh',
      githubToken: null,
      setReadmeModalOpen: vi.fn(),
    };
    return selector ? selector(state) : state;
  }),
}));

describe('MarkdownRenderer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Basic Rendering', () => {
    it('should render plain text', () => {
      render(<MarkdownRenderer content="Hello World" />);
      expect(screen.getByText('Hello World')).toBeInTheDocument();
    });

    it('should render headings with correct hierarchy', () => {
      // Embedded markdown sits below the app shell's h1, so every level shifts down by one.
      // The relative hierarchy is preserved; it is not flattened.
      const { container } = render(
        <MarkdownRenderer content={'# One\n\n## Two\n\n### Three\n\n#### Four'} />
      );

      expect(container.querySelector('h1')).toBeNull();
      expect(container.querySelector('h2')).toHaveTextContent('One');
      expect(container.querySelector('h3')).toHaveTextContent('Two');
      expect(container.querySelector('h4')).toHaveTextContent('Three');
      expect(container.querySelector('h5')).toHaveTextContent('Four');
    });

    it('should render h4-h6 headings', () => {
      const { container } = render(
        <MarkdownRenderer content="#### Heading 4" />
      );
      // `####` lands on h5 after the shift.
      expect(container.querySelector('h5')).toHaveTextContent('Heading 4');
    });

    it('should clamp the deepest source levels at h6', () => {
      // The scale stops at h6, so both `#####` and `######` land there.
      const { container } = render(
        <MarkdownRenderer content={'##### Five\n\n###### Six'} />
      );

      const sixes = container.querySelectorAll('h6');
      expect(sixes).toHaveLength(2);
      expect(sixes[0]).toHaveTextContent('Five');
      expect(sixes[1]).toHaveTextContent('Six');
    });

    it('should render bold text', () => {
      const { container } = render(<MarkdownRenderer content="**bold text**" />);
      expect(container.querySelector('strong')).toHaveTextContent('bold text');
    });

    it('should render italic text', () => {
      const { container } = render(<MarkdownRenderer content="*italic text*" />);
      expect(container.querySelector('em')).toHaveTextContent('italic text');
    });

    it('should render inline code', () => {
      const { container } = render(<MarkdownRenderer content="`inline code`" />);
      const code = container.querySelector('code');
      expect(code).toHaveTextContent('inline code');
      expect(code).not.toHaveClass('language-');
    });

    it('should render code blocks with language', () => {
      const { container } = render(
        <MarkdownRenderer content={'```javascript\nconsole.log("hello");\n```'} />
      );
      expect(container.querySelector('.language-javascript')).toBeInTheDocument();
    });

    it('should render unordered lists', () => {
      const { container } = render(
        <MarkdownRenderer content="- Item 1" />
      );
      expect(container.querySelector('ul')).toBeInTheDocument();
      expect(container.querySelector('li')).toBeInTheDocument();
    });

    it('should render ordered lists', () => {
      const { container } = render(
        <MarkdownRenderer content="1. Item 1" />
      );
      expect(container.querySelector('ol')).toBeInTheDocument();
      expect(container.querySelector('li')).toBeInTheDocument();
    });

    it('should render blockquotes', () => {
      const { container } = render(<MarkdownRenderer content="> quoted text" />);
      expect(container.querySelector('blockquote')).toHaveTextContent('quoted text');
    });

    it('should render horizontal rule', () => {
      const { container } = render(<MarkdownRenderer content="---" />);
      expect(container.querySelector('hr')).toBeInTheDocument();
    });

    it('should render tables', () => {
      const content = `| Header 1 | Header 2 |
|----------|----------|
| Cell 1   | Cell 2   |`;
      const { container } = render(<MarkdownRenderer content={content} />);
      expect(container.querySelector('table')).toBeInTheDocument();
      expect(container.querySelector('thead')).toBeInTheDocument();
      expect(container.querySelector('tbody')).toBeInTheDocument();
    });
  });

  describe('Links', () => {
    it('should render external links with target _blank', () => {
      const { container } = render(
        <MarkdownRenderer content="[External Link](https://example.com)" />
      );
      const link = container.querySelector('a');
      expect(link).toHaveAttribute('href', 'https://example.com');
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    });

    it('should render mailto links without target _blank', () => {
      const { container } = render(
        <MarkdownRenderer content="[Email](mailto:test@example.com)" />
      );
      const link = container.querySelector('a');
      expect(link).toHaveAttribute('href', 'mailto:test@example.com');
      expect(link).not.toHaveAttribute('target', '_blank');
    });

    it('should handle anchor links with headingIds', () => {
      const headingIds = new Map<string, string>();
      headingIds.set('section-1', 'heading-0');
      
      const { container } = render(
        <MarkdownRenderer 
          content="[Jump to Section](#section-1)" 
          headingIds={headingIds}
        />
      );
      const link = container.querySelector('a');
      expect(link).toHaveAttribute('href', '#section-1');
      expect(link).not.toHaveAttribute('target', '_blank');
    });

    it('should resolve relative links with baseUrl', () => {
      const { container } = render(
        <MarkdownRenderer 
          content="[Relative Link](./docs/guide.md)"
          baseUrl="https://github.com/user/repo"
        />
      );
      const link = container.querySelector('a');
      expect(link?.getAttribute('href')).toContain('github.com');
    });
  });

  describe('Images', () => {
    it('should render images', () => {
      const { container } = render(
        <MarkdownRenderer content="![Alt text](https://example.com/image.png)" />
      );
      const img = container.querySelector('img');
      expect(img).toHaveAttribute('src', 'https://example.com/image.png');
      expect(img).toHaveAttribute('alt', 'Alt text');
    });

    it('should resolve relative image URLs with baseUrl', () => {
      const { container } = render(
        <MarkdownRenderer 
          content="![Image](./images/logo.png)"
          baseUrl="https://github.com/user/repo"
        />
      );
      const img = container.querySelector('img');
      expect(img?.getAttribute('src')).toContain('github.com');
    });
  });

  describe('Code Blocks', () => {
    it('should show line numbers for code blocks with more than 3 lines', () => {
      const content = '```javascript\nline1\nline2\nline3\nline4\n```';
      const { container } = render(<MarkdownRenderer content={content} />);
      const lineNumbers = container.querySelectorAll('.text-gray-400');
      expect(lineNumbers.length).toBeGreaterThan(0);
    });

    it('should not show line numbers for code blocks with 3 or fewer lines', () => {
      const content = '```javascript\nline1\nline2\n```';
      const { container } = render(<MarkdownRenderer content={content} />);
      const lineNumbers = container.querySelectorAll('.text-gray-400');
      const hasLineNumbers = Array.from(lineNumbers).some(el => 
        el.textContent?.trim() === '1' || el.textContent?.trim() === '2'
      );
      expect(hasLineNumbers).toBe(false);
    });

    it('should normalize language aliases', () => {
      const { container } = render(
        <MarkdownRenderer content={'```sh\necho "hello"\n```'} />
      );
      expect(container.querySelector('.language-bash')).toBeInTheDocument();
    });
  });

  describe('GitHub Flavored Markdown', () => {
    it('should render task lists', () => {
      const { container } = render(
        <MarkdownRenderer content="- [x] Task 1" />
      );
      const checkboxes = container.querySelectorAll('input[type="checkbox"]');
      expect(checkboxes).toHaveLength(1);
      expect(checkboxes[0]).toHaveAttribute('checked');
    });

    it('should render strikethrough', () => {
      const { container } = render(<MarkdownRenderer content="~~strikethrough~~" />);
      expect(container.querySelector('del')).toHaveTextContent('strikethrough');
    });

    it('should render tables with alignment', () => {
      const content = `| Left | Center | Right |
|:-----|:------:|------:|
| L1   | C1     | R1    |`;
      const { container } = render(<MarkdownRenderer content={content} />);
      expect(container.querySelector('table')).toBeInTheDocument();
    });
  });

  describe('Performance Optimizations', () => {
    it('should not re-render when content is the same', () => {
      const { rerender } = render(<MarkdownRenderer content="Test content" />);
      const initialElement = screen.getByText('Test content');
      
      rerender(<MarkdownRenderer content="Test content" />);
      const afterElement = screen.getByText('Test content');
      
      expect(initialElement).toBe(afterElement);
    });

    it('should handle empty content gracefully', () => {
      const { container } = render(<MarkdownRenderer content="" />);
      expect(container.querySelector('.prose')).toBeInTheDocument();
    });
  });

  describe('shouldRender prop', () => {
    it('should show loading state when shouldRender is false', () => {
      render(<MarkdownRenderer content="Test" shouldRender={false} />);
      expect(screen.getByText('Loading...')).toBeInTheDocument();
    });
  });

  describe('enableHtml prop', () => {
    it('should render HTML when enableHtml is true', () => {
      const { container } = render(
        <MarkdownRenderer 
          content='<strong>HTML content</strong>' 
          enableHtml={true} 
        />
      );
      expect(container.querySelector('strong')).toBeInTheDocument();
    });
  });

  describe('Heading IDs', () => {
    it('should assign IDs to headings from headingIds map', () => {
      const headingIds = new Map<string, string>();
      headingIds.set('Test Heading', 'custom-id-123');
      
      const { container } = render(
        <MarkdownRenderer 
          content="# Test Heading" 
          headingIds={headingIds}
        />
      );
      const heading = container.querySelector('h2');
      expect(heading).toHaveAttribute('id', 'custom-id-123');
    });

    it('should generate unique IDs for headings not in map', () => {
      const { container } = render(
        <MarkdownRenderer content="# New Heading" />
      );
      const heading = container.querySelector('h2');
      expect(heading?.getAttribute('id')).toMatch(/^heading-extra-\d+$/);
    });
  });
});


describe('README enhancements', () => {
  it.each(['NOTE', 'TIP', 'IMPORTANT', 'WARNING', 'CAUTION'])('renders %s as an alert with formatted content', (type) => {
    const { container } = render(<MarkdownRenderer content={`> [!${type}]\n> Keep **this detail**.\n>\n> - Follow the instructions`} enableHtml />);
    const alert = container.querySelector(`[data-markdown-alert="${type.toLowerCase()}"]`);
    expect(alert).toBeInTheDocument();
    expect(alert?.querySelector('strong')).toHaveTextContent('this detail');
    expect(alert?.querySelector('li')).toHaveTextContent('Follow the instructions');
    expect(alert).not.toHaveTextContent(`[!${type}]`);
  });

  it('renders inline and display math without treating normal code or escaped dollars as equations', async () => {
    const { container } = render(<MarkdownRenderer content={'Inline $x^2$.\n\n$$\n\\sum_{i=1}^n i\n$$\n\n`$raw$` and \\$5.'} enableHtml />);
    await waitFor(() => expect(container.querySelectorAll('.katex')).toHaveLength(2));
    expect(container.querySelector('.katex-display')).toBeInTheDocument();
    expect(container.querySelector('code')).toHaveTextContent('$raw$');
    expect(container).toHaveTextContent('$5');
  });

  it('preserves navigation IDs for headings containing equations', async () => {
    const { container } = render(<MarkdownRenderer content="# Compute $x^2$" headingIds={new Map([['Compute $x^2$', 'equation-heading']])} />);
    await waitFor(() => expect(container.querySelector('.katex')).toBeInTheDocument());
    expect(container.querySelector('h2')).toHaveAttribute('id', 'equation-heading');
  });

  it('keeps unsafe embedded HTML and link protocols out of the rendered README', () => {
    const { container } = render(<MarkdownRenderer content={'<script>alert(1)</script><img src="javascript:alert(1)" onerror="alert(1)"><a href="javascript:alert(1)">unsafe</a>\n\n[unsafe markdown](javascript:alert(1))'} enableHtml />);
    expect(container.querySelector('script, [onerror]')).toBeNull();
    expect(container.querySelector('[href^="javascript:"], [src^="javascript:"]')).toBeNull();
  });
});


describe('responsive README images', () => {
  it('keeps responsive sources and the fallback img as direct picture children', () => {
    const { container } = render(<MarkdownRenderer enableHtml baseUrl="https://github.com/owner/demo" content={'<picture><source type="image/avif" media="(prefers-color-scheme: dark)" srcset="./dark.avif 1x, /dark@2x.avif 2x"><img src="./light.png" alt="Theme"></picture>'} />);
    const picture = container.querySelector('picture');
    expect(picture?.querySelector(':scope > source')).toHaveAttribute('type', 'image/avif');
    expect(picture?.querySelector(':scope > source')).toHaveAttribute('srcset', 'https://github.com/owner/demo/raw/HEAD/dark.avif 1x, https://github.com/owner/demo/raw/HEAD/dark@2x.avif 2x');
    const image = picture?.querySelector(':scope > img');
    expect(image).toHaveAttribute('src', 'https://github.com/owner/demo/raw/HEAD/light.png');
    Object.defineProperty(image, 'naturalWidth', {configurable: true, value: 180});
    fireEvent.load(image!);
    expect(container.querySelector('picture > img')).toHaveAttribute('src', 'https://github.com/owner/demo/raw/HEAD/light.png');
    expect(container.querySelector('picture > source')).toHaveAttribute('media', '(prefers-color-scheme: dark)');
  });
  it('resolves img srcset and preserves commas inside URLs while rejecting each unsafe candidate', () => {
    const { container } = render(<MarkdownRenderer enableHtml baseUrl="https://github.com/owner/demo" content={'<img alt="Responsive" src="./light.png" srcset="javascript:alert(1) 1x, file:///tmp/x 2x, data:image/png;base64,AAAA 3x, //cdn.example.test/w_800,q_auto/hero.png 4x, ./large.png 5x">'} />);
    expect(container.querySelector('img')).toHaveAttribute('srcset', 'https://cdn.example.test/w_800,q_auto/hero.png 4x, https://github.com/owner/demo/raw/HEAD/large.png 5x');
  });
  it('filters unsafe source protocols without a repository base URL', () => {
    const { container } = render(<MarkdownRenderer enableHtml content={'<picture><source srcset="blob:unsafe 1x, JaVaScRiPt:alert(1) 2x, //cdn.example.test/dark.png 3x"><img src="https://example.test/light.png"></picture>'} />);
    expect(container.querySelector('source')).toHaveAttribute('srcset', 'https://cdn.example.test/dark.png 3x');
  });
  it('zooms and downloads the responsive image selected by the browser', async () => {
    const { container } = render(<MarkdownRenderer enableHtml content={'<picture><source srcset="https://example.test/dark.avif"><img src="https://example.test/light.png" alt="Selected"></picture>'} />);
    const image = container.querySelector('img')!;
    Object.defineProperty(image, 'currentSrc', {configurable: true, value: 'https://example.test/dark.avif'});
    fireEvent.load(image);
    fireEvent.click(image);
    expect(screen.getByRole('dialog').querySelector('img')).toHaveAttribute('src', 'https://example.test/dark.avif');
    const fetchImage = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
    let downloadedUrl: string | undefined;
    const clickAnchor = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { downloadedUrl = this.href; });
    try {
      fireEvent.click(screen.getByRole('dialog').querySelector('button[title="下载图片"]')!);
      await waitFor(() => expect(fetchImage).toHaveBeenCalledWith('https://example.test/dark.avif'));
      expect(downloadedUrl).toBe('https://example.test/dark.avif');
    } finally { fetchImage.mockRestore(); clickAnchor.mockRestore(); }
  });
});
