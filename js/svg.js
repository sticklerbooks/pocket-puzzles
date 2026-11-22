const NS = 'http://www.w3.org/2000/svg';

export function svgEl(tag, attrs = {}, parent) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (parent) parent.appendChild(e);
  return e;
}

export function htmlEl(tag, cls, parent) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (parent) parent.appendChild(e);
  return e;
}

// Pointer position in the svg's own coordinates.
export function svgPoint(svg, evt) {
  const m = svg.getScreenCTM().inverse();
  const p = new DOMPoint(evt.clientX, evt.clientY).matrixTransform(m);
  return [p.x, p.y];
}

export const PALETTE = ['#4f8cff', '#2bb673', '#f5a524', '#a970ff', '#16b5c8', '#ff7ac6', '#9bb31a', '#8d7a6b', '#6c8ebf', '#d4a017', '#3fb8a9', '#c45fd6'];
