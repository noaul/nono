import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MarkdownRenderer from './MarkdownRenderer';
import { renderDiagram, renderMath } from '../services/readmeRendering';

vi.mock('../services/readmeRendering', () => ({ renderDiagram: vi.fn(), renderMath: vi.fn() }));

describe('README asynchronous enhancement boundaries', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('keeps ordinary README content away from heavy engines', () => {
    render(<MarkdownRenderer content={'# Hello\n\n> An ordinary quote\n\n```js\nconst price = "$5";\n```'} />);
    expect(renderDiagram).not.toHaveBeenCalled();
    expect(renderMath).not.toHaveBeenCalled();
  });

  it('renders a diagram and keeps the original source available for copy', async () => {
    vi.mocked(renderDiagram).mockResolvedValue('<svg><text>Start</text></svg>');
    const { container } = render(<MarkdownRenderer content={'```mermaid\ngraph TD; Start --> End\n```'} />);
    await screen.findByRole('img', { name: 'Mermaid diagram' });
    expect(container.querySelector('svg text')).toHaveTextContent('Start');
    expect(container.querySelector('details code')).toHaveTextContent('graph TD; Start --> End');
    expect(container.querySelector('details button')).toBeInTheDocument();
  });

  it('ignores a stale diagram result after the README changes and cancels the old request', async () => {
    let resolveOld!: (html: string) => void;
    vi.mocked(renderDiagram).mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }));
    vi.mocked(renderDiagram).mockResolvedValueOnce('<svg><text>New result</text></svg>');
    const { container, rerender } = render(<MarkdownRenderer content={'```mermaid\ngraph TD; Old --> Diagram\n```'} />);
    const oldSignal = vi.mocked(renderDiagram).mock.calls[0][1]?.signal;
    rerender(<MarkdownRenderer content={'```mermaid\ngraph TD; New --> Diagram\n```'} />);
    expect(oldSignal?.aborted).toBe(true);
    await screen.findByRole('img', { name: 'Mermaid diagram' });
    await act(async () => { resolveOld('<svg><text>Old result</text></svg>'); });
    expect(container.querySelector('svg text')).toHaveTextContent('New result');
    expect(container).not.toHaveTextContent('Old result');
  });

  it('keeps Mermaid syntax visible when a render fails', async () => {
    vi.mocked(renderDiagram).mockRejectedValue(new Error('bad syntax'));
    const { container } = render(<MarkdownRenderer content={'```mermaid\nnot a valid diagram\n```'} />);
    await screen.findByRole('status');
    expect(container.querySelector('code')).toHaveTextContent('not a valid diagram');
    expect(screen.queryByRole('img', { name: 'Mermaid diagram' })).toBeNull();
  });

  it('keeps invalid math visible without interrupting surrounding content', async () => {
    vi.mocked(renderMath).mockRejectedValue(new Error('bad formula'));
    const { container } = render(<MarkdownRenderer content={'Before $\\badformula$ after.'} />);
    await waitFor(() => expect(container).toHaveTextContent('Before $\\badformula$ after.'));
    expect(container.querySelector('.katex')).toBeNull();
  });
});
