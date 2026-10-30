export function createPhoneDialog({ mount, documentRef }) {
  let active;
  const attach = () => {
    if (!active) return;
    if (active.overlay.parentNode !== mount) mount.append(active.overlay);
    for (const child of mount.children) child.inert = child !== active.overlay;
  };
  return {
    attach,
    custom({ title, content, confirmText, cancelText, submit, danger = false, dismissOnBackdrop = false, onClose }) {
      active?.finish(false);
      return new Promise(resolve => {
        const previous = mount.getRootNode().activeElement;
        const previousSelector = previous?.id ? `#${CSS.escape(previous.id)}` : previous?.hasAttribute('data-action') ? [...previous.attributes].filter(attribute => attribute.name.startsWith('data-')).map(({ name, value }) => `[${name}="${CSS.escape(value)}"]`).join('') : '';
        const overlay = documentRef.createElement('div'); overlay.className = 'phone-dialog-backdrop'; overlay.dataset.phoneOverlay = '';
        const panel = documentRef.createElement('section'); panel.className = 'phone-dialog'; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true'); panel.setAttribute('aria-label', title);
        const heading = documentRef.createElement('h2'); heading.textContent = title;
        const actions = documentRef.createElement('div'); actions.className = 'form-actions';
        let done = false;
        const finish = value => {
          if (done) return; done = true; onClose?.();
          overlay.remove(); if (active?.overlay === overlay) active = null;
          for (const child of mount.children) child.inert = false;
          (previous?.isConnected ? previous : previousSelector && mount.getRootNode().querySelector(previousSelector))?.focus?.({ preventScroll: true }); resolve(value);
        };
        const button = (label, className, click) => { const node = documentRef.createElement('button'); node.type = 'button'; node.className = className; node.textContent = label; node.addEventListener('click', click); return node; };
        const cancel = cancelText ? button(cancelText, 'text-button', () => finish(false)) : null;
        if (cancel) actions.append(cancel);
        const error = documentRef.createElement('p'); error.className = 'phone-dialog-error'; error.setAttribute('role', 'alert');
        let submitting = false;
        const runSubmit = async () => {
          if (done || submitting) return;
          submitting = true; confirm.disabled = true; error.textContent = '';
          try { if (await submit() !== false) finish(true); }
          catch (reason) { if (!done) error.textContent = reason?.message || '操作失败，请重试。'; }
          finally { submitting = false; confirm.disabled = false; }
        };
        const confirm = button(confirmText, danger ? 'danger-button' : 'save-button', runSubmit);
        if (content.classList?.contains('api-editor-form')) panel.className += ' phone-api-dialog';
        if (String(content.tagName).toLowerCase() === 'form') content.addEventListener('submit', event => { event.preventDefault(); void runSubmit(); });
        actions.append(confirm); panel.append(heading, content, error, actions); overlay.append(panel);
        if (dismissOnBackdrop) overlay.addEventListener('click', event => { if (event.target === overlay) finish(false); });
        overlay.addEventListener('keydown', event => {
          event.stopPropagation();
          if (event.isComposing || event.keyCode === 229) return;
          if (event.key === 'Escape') { event.preventDefault(); finish(false); }
          if (event.key === 'Enter' && event.target.matches('input')) { event.preventDefault(); confirm.click(); }
          if (event.key === 'Tab') {
            const buttons = [...panel.querySelectorAll('button, a[href], input, textarea, select')].filter(node => !node.disabled && node.getClientRects().length), index = buttons.indexOf(mount.getRootNode().activeElement);
            event.preventDefault(); buttons[(index + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length]?.focus();
          }
        });
        active = { overlay, finish }; attach(); (panel.querySelector('input, textarea, select') || (danger && cancel ? cancel : confirm)).focus({ preventScroll: true });
      });
    },
    dispose() { active?.finish(false); },
  };
}
