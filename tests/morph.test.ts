// @vitest-environment happy-dom
import { morph } from '../src/ui/morph';

describe('DOM morph (keeps buttons alive across refreshes)', () => {
  it('updates text in place and keeps element identity', () => {
    const el = document.createElement('div');
    el.innerHTML = '<p>Using <b>3.1</b> Gbps</p><button data-action="buy">Buy</button>';
    const btn = el.querySelector('button')!;
    const b = el.querySelector('b')!;
    morph(el, '<p>Using <b>4.7</b> Gbps</p><button data-action="buy">Buy</button>');
    expect(el.querySelector('button')).toBe(btn);
    expect(el.querySelector('b')).toBe(b);
    expect(b.textContent).toBe('4.7');
  });

  it('updates, adds and removes attributes', () => {
    const el = document.createElement('div');
    el.innerHTML = '<button class="a" disabled data-x="1">Go</button>';
    const btn = el.querySelector('button')!;
    morph(el, '<button class="b" data-y="2">Go</button>');
    expect(el.querySelector('button')).toBe(btn);
    expect(btn.className).toBe('b');
    expect(btn.hasAttribute('disabled')).toBe(false);
    expect(btn.hasAttribute('data-x')).toBe(false);
    expect(btn.getAttribute('data-y')).toBe('2');
  });

  it('adds and removes children, and replaces nodes whose tag changed', () => {
    const el = document.createElement('ul');
    el.innerHTML = '<li>a</li><li>b</li><li>c</li>';
    const first = el.firstElementChild;
    morph(el, '<li>a</li><span>x</span>');
    expect(el.children).toHaveLength(2);
    expect(el.firstElementChild).toBe(first);
    expect(el.children[1]!.tagName).toBe('SPAN');
    morph(el, '<li>a</li><span>x</span><li>new</li>');
    expect(el.children).toHaveLength(3);
    expect(el.innerHTML).toBe('<li>a</li><span>x</span><li>new</li>');
  });

  it('result is identical to innerHTML for arbitrary markup', () => {
    const el = document.createElement('div');
    el.innerHTML = '<div class="row"><b>One</b> two <i>three</i></div>';
    const html = '<div class="row x"><b>Uno</b> dos <em>tres</em><button>+</button></div><p>tail</p>';
    morph(el, html);
    const ref = document.createElement('div');
    ref.innerHTML = html;
    expect(el.innerHTML).toBe(ref.innerHTML);
  });

  it('keeps the selected value of a select the player is not touching', () => {
    const el = document.createElement('div');
    el.innerHTML = '<select><option value="a">A</option><option value="b" selected>B</option></select>';
    morph(el, '<select><option value="a" selected>A</option><option value="b">B</option></select>');
    expect((el.querySelector('select') as HTMLSelectElement).value).toBe('a');
  });
});
