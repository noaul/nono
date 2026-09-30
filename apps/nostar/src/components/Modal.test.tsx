import { fireEvent, render, screen, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Modal } from './Modal';
afterEach(() => {
  cleanup();
  document.body.style.overflow = '';
});
describe('shared accessible modal', () => {
  it('names the dialog, wraps focus and restores the opener', () => {
    const opener = document.createElement('button');
    document.body.append(opener);
    opener.focus();
    const close = vi.fn();
    const view = render(
      <Modal isOpen onClose={close} title="Dialog">
        <button>Last</button>
      </Modal>
    );
    expect(screen.getByRole('dialog', { name: 'Dialog' })).toHaveAttribute(
      'aria-modal',
      'true'
    );
    const last = screen.getByText('Last');
    last.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(screen.getByRole('button', { name: /Close|关闭/ })).toHaveFocus();
    view.unmount();
    expect(opener).toHaveFocus();
    opener.remove();
  });
  it('only closes the top modal and keeps original body overflow until all close', () => {
    document.body.style.overflow = 'auto';
    const outerClose = vi.fn(),
      innerClose = vi.fn();
    const outer = render(
      <Modal isOpen onClose={outerClose} title="Outer">
        <button>Outer content</button>
      </Modal>
    );
    const inner = render(
      <Modal isOpen onClose={innerClose} title="Inner">
        <button>Inner content</button>
      </Modal>
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(innerClose).toHaveBeenCalledOnce();
    expect(outerClose).not.toHaveBeenCalled();
    inner.unmount();
    expect(document.body.style.overflow).toBe('hidden');
    outer.unmount();
    expect(document.body.style.overflow).toBe('auto');
  });
});
