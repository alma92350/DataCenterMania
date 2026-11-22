import { translateTree } from './i18n';

/**
 * Minimal DOM morph: makes `target`'s children match `html` while reusing existing nodes
 * where the structure is the same. Live panels refresh several times a second; replacing
 * innerHTML destroyed the button under the player's finger and swallowed the tap.
 */
export function morph(target: Element, html: string): void {
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  translateTree(tpl.content);
  morphChildren(target, tpl.content);
}

function morphChildren(from: Node, to: Node): void {
  const want = Array.from(to.childNodes);
  let cur = from.firstChild;
  for (const next of want) {
    if (!cur) {
      from.appendChild(next.cloneNode(true));
      continue;
    }
    if (sameKind(cur, next)) {
      morphNode(cur, next);
      cur = cur.nextSibling;
    } else {
      const replacement = next.cloneNode(true);
      from.replaceChild(replacement, cur);
      cur = replacement.nextSibling;
    }
  }
  while (cur) {
    const after = cur.nextSibling;
    from.removeChild(cur);
    cur = after;
  }
}

function sameKind(a: Node, b: Node): boolean {
  if (a.nodeType !== b.nodeType) return false;
  if (a.nodeType === Node.ELEMENT_NODE) return (a as Element).tagName === (b as Element).tagName;
  return true;
}

function morphNode(cur: Node, next: Node): void {
  if (cur.nodeType !== Node.ELEMENT_NODE) {
    if (cur.nodeValue !== next.nodeValue) cur.nodeValue = next.nodeValue;
    return;
  }
  const a = cur as Element;
  const b = next as Element;
  for (const attr of Array.from(a.attributes)) if (!b.hasAttribute(attr.name)) a.removeAttribute(attr.name);
  for (const attr of Array.from(b.attributes)) if (a.getAttribute(attr.name) !== attr.value) a.setAttribute(attr.name, attr.value);
  if (a.tagName === 'TEMPLATE') {
    (a as HTMLTemplateElement).innerHTML = (b as HTMLTemplateElement).innerHTML;
    return;
  }
  morphChildren(a, b);
  // form state lives in properties, not attributes
  if (a.tagName === 'SELECT') {
    const sel = Array.from((b as HTMLSelectElement).options).find((o) => o.hasAttribute('selected'));
    if (sel && (a as HTMLSelectElement).value !== sel.value) (a as HTMLSelectElement).value = sel.value;
  } else if (a.tagName === 'INPUT') {
    const input = a as HTMLInputElement;
    if (input.type === 'checkbox') input.checked = b.hasAttribute('checked');
  }
}
