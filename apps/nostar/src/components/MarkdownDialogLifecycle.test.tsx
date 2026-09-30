import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Modal } from './Modal';
import MarkdownRenderer from './MarkdownRenderer';

afterEach(() => { cleanup(); document.body.style.overflow = ''; });

describe('README and image dialog lifecycle', () => {
  it('closes only the image zoom on Escape, traps its focus, and keeps the parent scroll lock', () => {
    document.body.style.overflow = 'auto';
    const close = vi.fn();
    render(<Modal isOpen onClose={close} title="README"><MarkdownRenderer content="![Diagram](https://example.test/diagram.png)" /></Modal>);
    const outer = screen.getByRole('dialog', { name: 'README' });
    fireEvent.click(screen.getByAltText('Diagram'));
    const dialogs = screen.getAllByRole('dialog');
    expect(dialogs).toHaveLength(2);
    const zoom = dialogs.find(dialog => dialog !== outer)!;
    const buttons = within(zoom).getAllByRole('button');
    buttons[buttons.length - 1].focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(buttons[0]).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(close).not.toHaveBeenCalled();
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(document.body.style.overflow).toBe('hidden');
    expect(outer.contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(close).toHaveBeenCalledOnce();
  });

  it('excludes controls in visually hidden ancestors from the focus cycle', () => {
    render(<Modal isOpen onClose={() => {}} title="Visible"><button>Last visible</button><div style={{display:'none'}}><button>Hidden action</button></div></Modal>);
    const close = screen.getByRole('button', {name:/Close|关闭/});
    close.focus();
    fireEvent.keyDown(document, { key:'Tab', shiftKey:true });
    expect(screen.getByRole('button', {name:'Last visible'})).toHaveFocus();
  });
  it('skips collapsed source details and disabled fieldset actions during reverse Tab', () => {
    render(<Modal isOpen onClose={() => {}} title="Source"><button>Visible action</button><details><summary>Source details</summary><button>Copy collapsed source</button></details><fieldset disabled><button>Disabled work</button></fieldset></Modal>);
    const close = screen.getByRole('button', {name:/Close|关闭/});
    close.focus();
    fireEvent.keyDown(document, { key:'Tab', shiftKey:true });
    expect(screen.getByText('Source details')).toHaveFocus();
  });

});
