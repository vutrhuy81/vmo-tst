/* Shared, bounded geometry validation and SVG rendering. No model HTML is used. */
(function (root) {
  'use strict';
  const kinds = { collinear: 3, perpendicular: 4, parallel: 4, equalLength: 4, midpoint: 3, onCircle: 3 };
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  function clean(value) {
    if (!value || value.isGeometry !== true || !Array.isArray(value.points) || value.points.length < 3 || value.points.length > 40) return null;
    if (!Array.isArray(value.segments) || value.segments.length > 80 || !Array.isArray(value.circles) || value.circles.length > 12 || !Array.isArray(value.constraints) || !value.constraints.length || value.constraints.length > 100) return null;
    const points = [], byId = new Map();
    for (const p of value.points) {
      if (!p || typeof p.id !== 'string' || !/^[A-Za-z][A-Za-z0-9_']{0,15}$/.test(p.id) || byId.has(p.id) || typeof p.x !== 'number' || typeof p.y !== 'number' || !Number.isFinite(p.x) || !Number.isFinite(p.y) || Math.max(Math.abs(p.x), Math.abs(p.y)) > 10000) return null;
      const point = { id: p.id, x: p.x, y: p.y }; points.push(point); byId.set(p.id, point);
    }
    const span = Math.max(...['x', 'y'].map(axis => Math.max(...points.map(p => p[axis])) - Math.min(...points.map(p => p[axis]))));
    if (span < 1e-6) return null;
    // Work in normalized coordinates so tolerance is independent of diagram scale.
    const origin = points[0];
    const normalized = new Map(points.map(p => [p.id, { x: (p.x - origin.x) / span, y: (p.y - origin.y) / span }]));
    const segments = [], circles = [], constraints = [];
    for (const s of value.segments) {
      if (!s || !byId.has(s.from) || !byId.has(s.to) || distance(normalized.get(s.from), normalized.get(s.to)) < 1e-5) return null;
      segments.push({ from: s.from, to: s.to, auxiliary: s.auxiliary === true });
    }
    for (const c of value.circles) {
      if (!c || !byId.has(c.center) || !byId.has(c.through) || distance(normalized.get(c.center), normalized.get(c.through)) < 1e-5) return null;
      circles.push({ center: c.center, through: c.through, auxiliary: c.auxiliary === true });
    }
    if (!segments.length && !circles.length) return null;
    const tol = 1e-4;
    for (const c of value.constraints) {
      if (!c || !Object.hasOwn(kinds, c.type) || !Array.isArray(c.points) || c.points.length !== kinds[c.type] || c.points.some(id => !byId.has(id))) return null;
      const [a, b, d, e] = c.points.map(id => normalized.get(id));
      let valid = false;
      if (c.type === 'midpoint') valid = distance(a, { x: (b.x + d.x) / 2, y: (b.y + d.y) / 2 }) <= tol && distance(b, d) > tol;
      else if (c.type === 'onCircle') valid = distance(b, d) > tol && Math.abs(distance(a, b) - distance(b, d)) <= tol;
      else if (c.type === 'collinear') valid = distance(a, b) > tol && Math.abs((b.x - a.x) * (d.y - a.y) - (b.y - a.y) * (d.x - a.x)) / distance(a, b) <= tol;
      else {
        const u = { x: b.x - a.x, y: b.y - a.y }, v = { x: e.x - d.x, y: e.y - d.y };
        const lu = distance(a, b), lv = distance(d, e);
        if (lu > tol && lv > tol) {
          if (c.type === 'equalLength') valid = Math.abs(lu - lv) <= tol;
          if (c.type === 'perpendicular') valid = Math.abs(u.x * v.x + u.y * v.y) / (lu * lv) <= tol;
          if (c.type === 'parallel') valid = Math.abs(u.x * v.y - u.y * v.x) / (lu * lv) <= tol;
        }
      }
      if (!valid) return null;
      constraints.push({ type: c.type, points: [...c.points] });
    }
    return { isGeometry: true, caption: typeof value.caption === 'string' ? value.caption.slice(0, 1000) : '', points, segments, circles, constraints };
  }
  function figure(doc, value, english = false) {
    const data = clean(value);
    if (!data) return null;
    const ns = 'http://www.w3.org/2000/svg';
    const node = (tag, attrs) => { const el = doc.createElementNS(ns, tag); for (const [key, val] of Object.entries(attrs)) el.setAttribute(key, String(val)); return el; };
    const figure = doc.createElement('figure'); figure.className = 'ai-geometry-figure'; figure.style.cssText = 'margin:16px 0;padding:12px;border:1px solid #cbd5e1;border-radius:10px;background:#fff;color:#0f172a;break-inside:avoid;';
    const title = english ? 'Geometry diagram' : 'Hình vẽ bài toán';
    const heading = doc.createElement('strong'); heading.textContent = title; figure.append(heading);
    const svg = node('svg', { viewBox: '0 0 760 500', role: 'img', 'aria-label': title, preserveAspectRatio: 'xMidYMid meet' });
    svg.style.cssText = 'display:block;width:100%;max-height:480px;height:auto;';
    const desc = node('title', {}); desc.textContent = data.caption || title; svg.append(desc);
    const map = new Map(data.points.map(p => [p.id, p]));
    const xs = data.points.map(p => p.x), ys = data.points.map(p => p.y);
    for (const c of data.circles) { const o = map.get(c.center), r = distance(o, map.get(c.through)); xs.push(o.x - r, o.x + r); ys.push(o.y - r, o.y + r); }
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const scale = Math.min(660 / Math.max(maxX - minX, 1e-6), 400 / Math.max(maxY - minY, 1e-6));
    const pos = p => ({ x: 380 + (p.x - (minX + maxX) / 2) * scale, y: 250 - (p.y - (minY + maxY) / 2) * scale });
    for (const c of data.circles) { const o = map.get(c.center), p = pos(o); svg.append(node('circle', { cx: p.x, cy: p.y, r: distance(o, map.get(c.through)) * scale, fill: 'none', stroke: '#334155', 'stroke-width': 1.8, 'stroke-dasharray': c.auxiliary ? '6 4' : 'none' })); }
    for (const s of data.segments) { const a = pos(map.get(s.from)), b = pos(map.get(s.to)); svg.append(node('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: s.auxiliary ? '#64748b' : '#0f172a', 'stroke-width': 1.8, 'stroke-dasharray': s.auxiliary ? '6 4' : 'none' })); }
    for (const p of data.points) {
      const a = pos(p); svg.append(node('circle', { cx: a.x, cy: a.y, r: 3, fill: '#0f172a' }));
      const label = node('text', { x: a.x + (a.x > 380 ? -7 : 7), y: a.y - 9, 'text-anchor': a.x > 380 ? 'end' : 'start', fill: '#0f172a', 'font-size': 16, 'font-family': 'serif', 'font-style': 'italic', stroke: '#fff', 'stroke-width': 3, 'paint-order': 'stroke' }); label.textContent = p.id; svg.append(label);
    }
    figure.append(svg);
    const caption = doc.createElement('figcaption'); caption.style.cssText = 'font-size:0.9em;color:#475569;';
    caption.textContent = (data.caption ? data.caption + ' — ' : '') + (english ? 'Illustration of one configuration; the proof covers all cases.' : 'Hình minh họa một cấu hình; kết luận phải dựa trên chứng minh.'); figure.append(caption);
    return figure;
  }
  root.MathAppGeometry = Object.freeze({ clean, figure });
})(globalThis);
