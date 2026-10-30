// Keep only the currently edited branch connected; other content still renders once.
// Moving a saved textarea out and back would blur it and end a mobile IME session.
export function createEditingRenderer(surface) {
  const root = surface.getRootNode(), composing = new WeakSet();
  let held;
  const start = event => composing.add(event.target);
  const end = event => composing.delete(event.target);
  root.addEventListener('compositionstart', start);
  root.addEventListener('compositionend', end);
  const forms = '.composer, .social-comment-form, .forum-comment-form, .ls-reply-form, .ls-compose-form, .profile-form, .group-form, .api-form, .attachment-form';
  const ownerAttributes = ['data-social-comment-form', 'data-forum-post', 'data-liangshi-reply-form', 'data-reply-to'];
  function attributes(current, next, editor = false) {
    for (const { name } of [...current.attributes]) if ((!editor || name !== 'value') && !next.hasAttribute(name)) current.removeAttribute(name);
    for (const { name, value } of next.attributes) if ((!editor || name !== 'value') && current.getAttribute(name) !== value) current.setAttribute(name, value);
  }
  return {
    hold() {
      const input = root.activeElement;
      if (input?.matches?.('textarea, input:not([type="checkbox"]):not([type="file"]):not([type="radio"])') && input.closest(forms) && input.closest('.phone-main')) held = { input, start: input.selectionStart, end: input.selectionEnd, direction: input.selectionDirection };
    },
    release(restore = false) {
      const previous = held; held = null;
      if (restore && previous?.input.isConnected) { previous.input.focus({ preventScroll: true }); if (previous.start !== null) previous.input.setSelectionRange(previous.start, previous.end, previous.direction); }
    },
    render(markup, sameRoute) {
      const overlays = sameRoute && [...surface.children].filter(node => node.hasAttribute('data-phone-overlay'));
      if (overlays?.length) {
        const template = surface.ownerDocument.createElement('template'); template.innerHTML = markup;
        for (const child of [...surface.childNodes]) if (!overlays.includes(child)) child.remove();
        surface.insertBefore(template.content, overlays[0]);
        return;
      }
      const input = sameRoute && (held?.input.isConnected ? held.input : root.activeElement);
      const form = input?.matches?.('textarea, input:not([type="checkbox"]):not([type="file"]):not([type="radio"])') && input.closest(forms);
      if (!form || !surface.contains(form) || !input.closest('.phone-main')) { surface.innerHTML = markup; return; }
      const template = surface.ownerDocument.createElement('template'); template.innerHTML = markup;
      const formClass = [...form.classList].find(name => forms.includes(`.${name}`));
      const owners = ownerAttributes.filter(name => form.hasAttribute(name)).map(name => `[${name}="${CSS.escape(form.getAttribute(name))}"]`).join('');
      const nextForm = template.content.querySelector(`.${formClass}${owners}`);
      const next = nextForm?.querySelector(input.id ? `#${CSS.escape(input.id)}` : `[name="${CSS.escape(input.name)}"]`);
      const branch = (node, parent) => { const nodes = []; while (node && node !== parent) { nodes.unshift(node); node = node.parentNode; } return node === parent ? nodes : []; };
      const currentPath = branch(input, surface), nextPath = branch(next, template.content);
      if (!next || input.tagName !== next.tagName || currentPath.length !== nextPath.length || currentPath.some((node, i) => node.tagName !== nextPath[i].tagName)) { surface.innerHTML = markup; return; }
      let currentParent = surface, nextParent = template.content;
      for (let i = 0; i < currentPath.length; i++) {
        const currentChild = currentPath[i], nextChild = nextPath[i];
        // Never remove or move the ancestor that contains the active editor.
        for (const child of [...currentParent.childNodes]) if (child !== currentChild) child.remove();
        while (nextParent.firstChild && nextParent.firstChild !== nextChild) currentParent.insertBefore(nextParent.firstChild, currentChild);
        while (nextChild.nextSibling) currentParent.append(nextChild.nextSibling);
        attributes(currentChild, nextChild, currentChild === input);
        currentParent = currentChild; nextParent = nextChild;
      }
      if (!composing.has(input) && input.value !== next.value) input.value = next.value;
    },
    dispose() { root.removeEventListener('compositionstart', start); root.removeEventListener('compositionend', end); },
  };
}
