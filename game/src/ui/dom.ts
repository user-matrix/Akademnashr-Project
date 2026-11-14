import { ICONS, type IconName } from './icons';

type Child = Node | string | null | undefined | false;

interface Props {
  class?: string;
  text?: string;
  html?: string;
  onclick?: (e: MouseEvent) => void;
  attrs?: Record<string, string>;
}

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props.class) el.className = props.class;
  if (props.html != null) el.innerHTML = props.html;
  if (props.text != null) el.textContent = props.text;
  if (props.onclick) el.addEventListener('click', props.onclick as EventListener);
  if (props.attrs) for (const k in props.attrs) el.setAttribute(k, props.attrs[k]);
  for (const c of children) if (c) el.append(c);
  return el;
}

export function icon(name: IconName): HTMLElement {
  const span = document.createElement('span');
  span.style.display = 'contents';
  span.innerHTML = ICONS[name];
  return span;
}

export function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} missing`);
  return el;
}

export function formatNumber(n: number): string {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}
