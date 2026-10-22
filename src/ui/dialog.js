export function createPhoneDialog({ mount, documentRef }) {
  let active;
  const attach = () => {
    if (!active) return;
    mount.append(active.overlay);
    for (const child of mount.children) child.inert = child !== active.overlay;
  };
  return {
    attach,
    custom({ title, content, confirmText, cancelText, submit }) {
      active?.finish(false);
      return new Promise(resolve => {
        const previous = mount.getRootNode().activeElement;
        const overlay = documentRef.createElement('div'); overlay.className = 'phone-dialog-backdrop';
        const panel = documentRef.createElement('section'); panel.className = 'phone-dialog'; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true'); panel.setAttribute('aria-label', title);
        const heading = documentRef.createElement('h2'); heading.textContent = title;
        const actions = documentRef.createElement('div'); actions.className = 'form-actions';
        const finish = value => {
          overlay.remove(); active = null;
          for (const child of mount.children) child.inert = false;
          previous?.focus?.({ preventScroll: true }); resolve(value);
        };
        const button = (label, className, click) => { const node = documentRef.createElement('button'); node.type = 'button'; node.className = className; node.textContent = label; node.addEventListener('click', click); return node; };
        if (cancelText) actions.append(button(cancelText, 'text-button', () => finish(false)));
        const confirm = button(confirmText, 'save-button', () => { if (submit() !== false) finish(true); });
        actions.append(confirm); panel.append(heading, content, actions); overlay.append(panel);
        overlay.addEventListener('keydown', event => {
          event.stopPropagation();
          if (event.key === 'Escape') { event.preventDefault(); finish(false); }
          if (event.key === 'Tab') {
            const buttons = [...panel.querySelectorAll('button, a[href]')], index = buttons.indexOf(mount.getRootNode().activeElement);
            event.preventDefault(); buttons[(index + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length]?.focus();
          }
        });
        active = { overlay, finish }; attach(); confirm.focus({ preventScroll: true });
      });
    },
    dispose() { active?.finish(false); },
  };
}
