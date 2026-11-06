#!/usr/bin/env node
// consistency.mjs — the faults a reviewer marks by eye, found in a real browser.
//
// Usage:
//   node consistency.mjs <url> [--widths 1440,1024,820,768,390] [--out dir]
//     [--page map|console|guide|wall] [--primary "<main action>"]
//     [--json] [--quick]
//
// It opens the page in its own headless Chrome, walks every screen at each width,
// and prints every finding as FAIL or WARN with the element, what is wrong and a
// one-line fix, then a table of every check as PASS, WARN or FAIL.
//
// FAIL: the builder must fix it, or report why it is false.
// WARN: look at it.
// Exit 1 when anything FAILs, 0 when clean, 2 when the page could not be checked.
//
// The idea is taken from Leonxlnx/taste-skill's consistency.mjs: a taste that
// cannot be stated as a rule cannot be checked, and a rule that cannot be checked
// is an opinion. Every rule here is a thing a reviewer would mark by eye and a
// script can decide.
//
// Node 22+, no dependencies beyond Playwright, which must be resolvable.

import { mkdirSync, writeFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

async function loadPlaywright() {
  const candidates = [process.env.PLAYWRIGHT_PATH, 'playwright'].filter(Boolean);
  try {
    const require = createRequire(import.meta.url);
    candidates.push(require.resolve('playwright', { paths: [process.cwd()] }));
  } catch {
    // The caller may instead provide an explicit Playwright entry point.
  }
  for (const candidate of candidates) {
    try {
      const specifier = isAbsolute(candidate) ? pathToFileURL(candidate).href : candidate;
      return await import(specifier);
    } catch {
      // try the next candidate
    }
  }
  throw new Error('Playwright not found. Install it, or set PLAYWRIGHT_PATH.');
}

// ---------------------------------------------------------------- the rules
//
// Each rule has an id, a severity, a one-line fix, and a check that runs inside
// the page. A rule earns its place only if a script can decide it; everything
// that needs a human eye stays in the checklist of the reference file.

const RULES = [
  // --- 读得出 -------------------------------------------------------------
  {
    id: 'text-contrast',
    severity: 'fail',
    fix: 'raise the text/ground contrast to 4.5:1 (body) or 3:1 (large text)',
    check: `(() => {
      const results = [];
      const lum = (c) => {
        const m = c.match(/[\\d.]+/g); if (!m) return null;
        const [r, g, b] = m.slice(0, 3).map(v => {
          const s = v / 255;
          return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
        });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      };
      const ratio = (fg, bg) => {
        const a = lum(fg), b = lum(bg);
        if (a === null || b === null) return null;
        const [hi, lo] = a > b ? [a, b] : [b, a];
        return (hi + 0.05) / (lo + 0.05);
      };
      // The effective ground behind a text node: walk up until a background is found.
      const groundOf = (el) => {
        let node = el;
        while (node && node !== document.documentElement) {
          const bg = getComputedStyle(node).backgroundColor;
          const m = bg.match(/[\\d.]+/g);
          if (m && (m.length < 4 || Number(m[3]) > 0.9)) {
            if (!(m.length < 4 && Number(m[3]) === 0)) return bg;
          }
          node = node.parentElement;
        }
        return getComputedStyle(document.body).backgroundColor;
      };
      const seen = new Set();
      document.querySelectorAll('body *').forEach(el => {
        if (el.children.length) return;
        const text = (el.textContent || '').trim();
        if (!text) return;
        if (!el.getClientRects().length) return;
        const style = getComputedStyle(el);
        if (style.visibility === 'hidden' || style.display === 'none') return;
        if (Number(style.opacity) < 0.5) return;
        const size = parseFloat(style.fontSize);
        const weight = Number(style.fontWeight) || 400;
        const large = size >= 24 || (size >= 18.66 && weight >= 700);
        const need = large ? 3 : 4.5;
        const r = ratio(style.color, groundOf(el));
        if (r === null || r >= need) return;
        const key = style.color + '|' + groundOf(el);
        if (seen.has(key)) return;
        seen.add(key);
        results.push({ text: text.slice(0, 40), color: style.color, ground: groundOf(el),
          ratio: Number(r.toFixed(2)), need });
      });
      return results;
    })()`,
  },
  {
    id: 'body-size',
    severity: 'warn',
    fix: 'a paragraph is under 13px; a panel note may be 11px',
    check: `(() => {
      // The 16px floor belongs to a marketing page. A map panel is a dense, fixed
      // instrument: its notes are read at a glance next to the map, and 11-12px is
      // the working size there. What still matters is that a paragraph of running
      // text is not smaller than 13px, and that nothing in the map's own overlay is
      // below 10px, where it stops being legible.
      const results = [];
      document.querySelectorAll('p, li, dd').forEach(el => {
        if (el.children.length) return;
        if (!el.getClientRects().length) return;
        const text = (el.textContent || '').trim();
        if (text.length < 24) return;
        const size = parseFloat(getComputedStyle(el).fontSize);
        // 12px is the working size of a map panel's note. A marketing page wants
        // 16px, but a map panel sits beside the map and is read in glances; below
        // 12px the note stops being readable next to the map's own type.
        if (size >= 12) return;
        results.push({ text: text.slice(0, 40), size, kind: 'paragraph' });
      });
      document.querySelectorAll('.leaflet-container span, .leaflet-container div').forEach(el => {
        if (el.children.length) return;
        if (!el.getClientRects().length) return;
        const text = (el.textContent || '').trim();
        if (!text) return;
        const size = parseFloat(getComputedStyle(el).fontSize);
        if (size >= 10) return;
        results.push({ text: text.slice(0, 40), size, kind: 'map-overlay' });
      });
      return results.slice(0, 6);
    })()`,
  },
  {
    id: 'tap-target',
    severity: 'warn',
    fix: 'give the control a 44x44 hit area on a touch screen',
    check: `(() => {
      // 44px is a touch target. On a pointer device a 32px control in a dense toolbar
      // is legible and usable, so the floor is 32px there and 44px where the page is
      // a phone.
      const touch = window.matchMedia('(pointer: coarse)').matches
        || window.innerWidth <= 760;
      const floor = touch ? 44 : 32;
      const results = [];
      document.querySelectorAll('button, a[href], select, input').forEach(el => {
        // A link inside the attribution is a credit, not a control.
        if (el.closest('.leaflet-control-attribution')) return;
        // A checkbox or a radio is sized by its own box; its label is the target.
        if (el.type === 'checkbox' || el.type === 'radio') return;
        const rect = el.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        if (rect.width >= floor && rect.height >= floor) return;
        results.push({ label: (el.textContent || el.getAttribute('aria-label') || el.tagName).trim().slice(0, 30),
          width: Math.round(rect.width), height: Math.round(rect.height), floor });
      });
      return results.slice(0, 8);
    })()`,
  },

  // --- 一套系统 ------------------------------------------------------------
  {
    id: 'button-styles',
    severity: 'fail',
    fix: 'one primary and one secondary button: one shape, one height, one label size',
    check: `(() => {
      const results = [];
      const groups = new Map();
      // Only the action buttons count. A list row is a button in the DOM but not a
      // button in the design: it carries data, not an action, and a list is allowed
      // to have rows of one height.
      document.querySelectorAll('.btn, button[data-action], .bar-actions button, nav button').forEach(el => {
        const style = getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        // Navigation tabs and map actions are different control families.
        const group = el.closest('nav, .bar-actions') || document.body;
        if (!groups.has(group)) groups.set(group, new Map());
        const shapes = groups.get(group);
        const key = style.borderRadius + '|' + Math.round(rect.height) + '|' + style.fontSize;
        if (!shapes.has(key)) shapes.set(key, []);
        shapes.get(key).push((el.textContent || '').trim().slice(0, 20));
      });
      for (const shapes of groups.values()) {
        if (shapes.size < 2) continue;
        results.push({ variants: [...shapes].map(([shape, labels]) => ({ shape, labels: labels.slice(0, 4) })) });
      }
      return results;
    })()`,
  },
  {
    id: 'heading-scale',
    severity: 'fail',
    fix: 'one size per heading level, and h1 larger than h2 larger than h3',
    check: `(() => {
      const results = [];
      const sizes = {};
      document.querySelectorAll('h1, h2, h3, h4').forEach(el => {
        if (!el.getClientRects().length) return;
        const level = el.tagName.toLowerCase();
        const size = Math.round(parseFloat(getComputedStyle(el).fontSize));
        (sizes[level] ||= new Set()).add(size);
      });
      for (const [level, set] of Object.entries(sizes)) {
        if (set.size > 1) results.push({ level, sizes: [...set] });
      }
      const order = ['h1', 'h2', 'h3'];
      for (let i = 0; i < order.length - 1; i += 1) {
        const a = sizes[order[i]], b = sizes[order[i + 1]];
        if (!a || !b) continue;
        const maxA = Math.max(...a), minB = Math.min(...b);
        if (maxA <= minB) results.push({ level: order[i] + '>' + order[i + 1], maxA, minB });
      }
      return results;
    })()`,
  },
  {
    id: 'radius-family',
    severity: 'warn',
    fix: 'one radius family for the whole page',
    check: `(() => {
      const radii = new Map();
      document.querySelectorAll('button, .card, input, select, [class*="card"]').forEach(el => {
        const rect = el.getBoundingClientRect();
        if (!rect.width) return;
        const radius = getComputedStyle(el).borderRadius;
        if (!radius || radius === '0px') return;
        const key = radius.split(' ')[0];
        radii.set(key, (radii.get(key) ?? 0) + 1);
      });
      const entries = [...radii.entries()].sort((a, b) => b[1] - a[1]);
      return entries.length > 3 ? entries.map(([radius, count]) => ({ radius, count })) : [];
    })()`,
  },
  {
    id: 'focus-visible',
    severity: 'fail',
    fix: 'give the control a visible focus ring',
    check: `(() => {
      // The focus ring lives in a :focus-visible rule, which getComputedStyle does
      // not report while the element is at rest. So the stylesheets are searched for
      // a focus rule instead of measuring a resting element.
      for (const sheet of document.styleSheets) {
        let list;
        try { list = sheet.cssRules; } catch { continue; }
        for (const rule of list) {
          if (rule.selectorText && /:focus/.test(rule.selectorText)) return [];
        }
      }
      const results = [];
      document.querySelectorAll('button, a[href], select, input').forEach(el => {
        const rect = el.getBoundingClientRect();
        if (!rect.width) return;
        results.push({ label: (el.textContent || el.tagName).trim().slice(0, 30) });
      });
      return results.slice(0, 8);
    })()`,
  },

  // --- 反模式：可在浏览器里判定的那些 ---------------------------------------
  {
    id: 'raw-colour',
    severity: 'fail',
    fix: 'a pure saturated hue reads as an error; use a tint',
    check: `(() => {
      const pure = new Set(['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#00ffff',
        '#ff00ff', '#f00', '#0f0', '#00f', '#ff0', '#0ff', '#f0f']);
      const toHex = (value) => {
        const m = String(value).match(/rgba?\\(([^)]+)\\)/);
        if (m) {
          const [r, g, b] = m[1].split(',').map(Number);
          return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
        }
        return String(value).toLowerCase();
      };
      const results = [];
      const seen = new Set();
      document.querySelectorAll('body *').forEach(el => {
        const style = getComputedStyle(el);
        ['color', 'backgroundColor', 'borderTopColor', 'fill', 'stroke'].forEach(prop => {
          const hex = toHex(style[prop]);
          if (!pure.has(hex)) return;
          const key = prop + hex;
          if (seen.has(key)) return;
          seen.add(key);
          results.push({ property: prop, value: hex,
            element: el.tagName.toLowerCase() + (el.className ? '.' + String(el.className).slice(0, 24) : '') });
        });
      });
      return results.slice(0, 8);
    })()`,
  },
  {
    id: 'opaque-fill',
    severity: 'fail',
    fix: 'a thematic polygon over a basemap fills at 0.35, not 1.0',
    check: `(() => {
      const results = [];
      // Only the thematic area counts. The basemap's own land and water fills are
      // opaque by nature, and a half-transparent river is not a river.
      const panes = [...document.querySelectorAll('.leaflet-pane')]
        .filter(pane => /districts/.test(pane.className));
      const paths = [];
      panes.forEach(pane => paths.push(...pane.querySelectorAll('path')));
      paths.forEach(el => {
        // A no-data hatch lives in <defs><pattern> inside the same SVG. Those
        // helper paths are opaque by construction and are not thematic areas.
        if (el.closest('defs, pattern, marker, clipPath, mask')) return;
        const style = getComputedStyle(el);
        const value = Number(style.fillOpacity);
        if (!Number.isFinite(value) || value < 0.99) return;
        // A full-opacity fill is right for a mask and for a selection, so the
        // finding says what it might be rather than asserting a defect.
        results.push({ fill: style.fill, fillOpacity: style.fillOpacity });
      });
      return results.slice(0, 8);
    })()`,
  },
  {
    id: 'cursor-pointer',
    severity: 'warn',
    fix: 'an interactive feature needs cursor: pointer',
    check: `(() => {
      const results = [];
      document.querySelectorAll('.leaflet-interactive').forEach(el => {
        const style = getComputedStyle(el);
        if (style.cursor === 'pointer') return;
        results.push({ tag: el.tagName.toLowerCase(), cursor: style.cursor,
          className: String(el.getAttribute('class') || '').slice(0, 40) });
      });
      return results.slice(0, 6);
    })()`,
  },
  {
    id: 'default-popup',
    severity: 'warn',
    fix: "the engine's default popup is a white box with a heavy shadow; restyle it",
    check: `(() => {
      const wrapper = document.querySelector('.leaflet-popup-content-wrapper');
      if (!wrapper) return [];
      const style = getComputedStyle(wrapper);
      const radius = parseFloat(style.borderRadius) || 0;
      const shadow = style.boxShadow;
      const heavy = /rgba\\(0,\\s*0,\\s*0,\\s*0\\.5\\)|rgb\\(0,\\s*0,\\s*0\\)/.test(shadow);
      if (radius > 0 && !heavy) return [];
      return [{ borderRadius: style.borderRadius, boxShadow: shadow.slice(0, 60) }];
    })()`,
  },
  {
    id: 'pin-density',
    severity: 'warn',
    fix: 'above 30 points use circles, a cluster layer or a hexbin layer',
    check: `(() => {
      // A pin is an image icon. A circle marker is a path. Count the image icons.
      const pins = document.querySelectorAll('.leaflet-marker-icon img');
      if (pins.length <= 30) return [];
      return [{ pinCount: pins.length,
        note: 'this many pin icons will cover the map' }];
    })()`,
  },
  {
    id: 'attribution-legible',
    severity: 'fail',
    fix: 'the attribution must stay visible and legible',
    check: `(() => {
      const controls = [...document.querySelectorAll('.leaflet-control-attribution')];
      if (!controls.length) return [];
      const results = [];
      controls.forEach(el => {
        const style = getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') {
          results.push({ what: 'hidden' });
          return;
        }
        if (Number(style.opacity) < 0.5) {
          results.push({ what: 'faded', opacity: style.opacity });
          return;
        }
        const size = parseFloat(style.fontSize);
        if (size && size < 9) results.push({ what: 'too small', fontSize: size });
      });
      return results;
    })()`,
  },
  {
    id: 'tabular-numbers',
    severity: 'warn',
    fix: 'figures the reader compares need font-variant-numeric: tabular-nums',
    check: `(() => {
      const results = [];
      const seen = new Set();
      document.querySelectorAll('output, .status *, .readout, [class*="count"], [class*="figure"]').forEach(el => {
        const text = (el.textContent || '').trim();
        if (!text || text.length < 2 || !/[0-9]/.test(text)) return;
        let node = el;
        let tabular = false;
        while (node && node !== document.body) {
          if (getComputedStyle(node).fontVariantNumeric.includes('tabular-nums')) { tabular = true; break; }
          node = node.parentElement;
        }
        if (tabular) return;
        const key = String(el.className) + '|' + text.slice(0, 12);
        if (seen.has(key)) return;
        seen.add(key);
        results.push({ text: text.slice(0, 30) });
      });
      return results.slice(0, 6);
    })()`,
  },

  // --- 地图专有 ------------------------------------------------------------
  {
    id: 'annotation-overlap',
    severity: 'fail',
    fix: 'two labels overlap; drop the lower-priority one or move it',
    check: `(() => {
      if (!window.__demo?.labelBoxes) return null;
      const boxes = window.__demo.labelBoxes();
      const results = [];
      for (let i = 0; i < boxes.length; i += 1) {
        for (let j = i + 1; j < boxes.length; j += 1) {
          const a = boxes[i], b = boxes[j];
          const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
          const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
          if (w > 1 && h > 1) results.push({ a: a.text, b: b.text });
        }
      }
      return results.slice(0, 8);
    })()`,
  },
  {
    id: 'annotation-outside',
    severity: 'fail',
    fix: 'a label leaves the canvas; move its anchor or drop it',
    check: `(() => {
      if (!window.__demo?.labelBoxes || !window.__demo?.mapBox) return null;
      const map = window.__demo.mapBox();
      return window.__demo.labelBoxes()
        .filter(box => box.left < map.left - 1 || box.right > map.right + 1
          || box.top < map.top - 1 || box.bottom > map.bottom + 1)
        .map(box => ({ text: box.text }));
    })()`,
  },
  {
    id: 'popup-covers-feature',
    severity: 'fail',
    fix: 'the popup covers the feature it describes; pan the map or offset the popup',
    check: `(() => {
      if (!window.__demo?.markerBox || !window.__demo?.selected || !document.querySelector('.leaflet-popup')) return null;
      const results = [];
      document.querySelectorAll('.leaflet-popup').forEach(popup => {
        const p = popup.getBoundingClientRect();
        window.__demo.selected();
        const marker = window.__demo.markerBox(window.__demo.selected());
        if (!marker) return;
        const w = Math.min(p.right, marker.right) - Math.max(p.left, marker.left);
        const h = Math.min(p.bottom, marker.bottom) - Math.max(p.top, marker.top);
        if (w > 0 && h > 0) {
          results.push({ overlapPx2: Math.round(w * h), site: window.__demo.selected() });
        }
      });
      return results;
    })()`,
  },
  {
    id: 'legend-correspondence',
    severity: 'fail',
    fix: 'a legend colour is not on the map, or a map colour is not in the legend',
    check: `(() => {
      if (!window.__demo?.legendColors) return null;
      const legend = window.__demo.legendColors();
      // The correspondence is between the legend and the data layers it describes,
      // not the basemap. A station colour is not a basemap colour, and requiring it
      // to be one would be a false positive.
      const toHex = (value) => {
        const m = String(value).match(/rgba?\\(([^)]+)\\)/);
        if (m) {
          const [r, g, b] = m[1].split(',').map(Number);
          return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
        }
        return /^#[0-9a-f]{3,8}$/i.test(String(value)) ? String(value).slice(0, 7) : null;
      };
      const dataColors = new Set();
      document.querySelectorAll('.leaflet-marker-icon, path').forEach(el => {
        // A Leaflet path paints through the SVG presentation attributes, and
        // getComputedStyle reports 'none' for a fill that was never set. So both the
        // attribute and the computed value are read, and the hex form is normalised
        // so that '#14558a' and 'rgb(20, 85, 138)' compare equal.
        const style = getComputedStyle(el);
        const values = [
          style.fill, style.stroke,
          el.getAttribute('fill'), el.getAttribute('stroke'),
          style.backgroundColor, style.borderTopColor,
        ];
        values.forEach(value => {
          if (!value || value === 'none' || value === 'transparent') return;
          const hex = toHex(value);
          if (hex) dataColors.add(hex.toLowerCase());
        });
      });
      // A missing-value class is drawn with a pattern, not a flat colour, so its
      // legend swatch has no matching fill on the map. It is checked by its pattern
      // instead, and skipped when the map does use one.
      const patterns = new Set();
      document.querySelectorAll('pattern').forEach(el => {
        const fill = el.querySelector('rect')?.getAttribute('fill');
        if (fill) patterns.add(toHex(fill)?.toLowerCase());
      });
      const orphans = legend.filter(entry => {
        if (!entry.bound || entry.kind === 'line') return false;
        const hex = toHex(entry.bound)?.toLowerCase();
        if (!hex) return false;
        if (dataColors.has(hex)) return false;
        if (patterns.has(hex)) return false;
        return true;
      });
      return orphans.map(entry => ({ text: entry.text, color: entry.bound }));
    })()`,
  },
  {
    id: 'attribution-present',
    severity: 'fail',
    fix: 'the map has no attribution; the data source must be named',
    check: `(() => {
      // Every attribution control on the page is read, not just the first: a project
      // may name its data source in a second control.
      const texts = [...document.querySelectorAll('.leaflet-control-attribution')]
        .map(el => (el.textContent || '').trim());
      const named = texts.map(text =>
        text.replace(/Leaflet/gi, '').replace(/[\\s|·]+/g, '')).filter(text => text.length >= 4);
      if (named.length) return [];
      return [{ text: texts.join(' | ') || '(no attribution control)' }];
    })()`,
  },
  {
    id: 'controls-reachable',
    severity: 'warn',
    fix: 'the map has no zoom control or the control is too small',
    check: `(() => {
      const results = [];
      const zoom = document.querySelector('.leaflet-control-zoom');
      if (!zoom) return [{ what: 'no zoom control' }];
      const rect = zoom.getBoundingClientRect();
      if (rect.width < 28) results.push({ what: 'zoom control too small', width: Math.round(rect.width) });
      return results;
    })()`,
  },

  // --- 排版与文案 ----------------------------------------------------------
  {
    id: 'filler-words',
    severity: 'warn',
    fix: 'the wording is filler; name the thing this page shows',
    check: `(() => {
      const banned = ['了解更多', '点击这里', '更多', '探索', '发现', '一键',
        '赋能', '打造', '一站式', '智能化', '领先', '高效', '极致', '无缝',
        'Learn more', 'Read more', 'Discover', 'Explore', 'Click here'];
      const results = [];
      document.querySelectorAll('button, a, h1, h2, h3').forEach(el => {
        const text = (el.textContent || '').trim();
        if (!text || text.length > 40) return;
        if (banned.some(word => text.includes(word))) results.push({ text: text.slice(0, 30) });
      });
      return results.slice(0, 8);
    })()`,
  },
  {
    id: 'placeholder-text',
    severity: 'fail',
    fix: 'remove the placeholder; write the real words or drop the element',
    check: `(() => {
      const results = [];
      document.querySelectorAll('body *').forEach(el => {
        if (el.children.length) return;
        const text = (el.textContent || '').trim();
        if (!text) return;
        if (/\\[.+\\]|lorem ipsum|TODO|待补充|待定|占位/i.test(text)) {
          results.push({ text: text.slice(0, 40) });
        }
      });
      return results.slice(0, 8);
    })()`,
  },
  {
    id: 'label-not-noun',
    severity: 'warn',
    fix: 'a heading or button should name a thing, not a category',
    check: `(() => {
      const banned = ['功能一览', '模块', '其他', '更多内容', '相关内容', '概述'];
      const results = [];
      document.querySelectorAll('h1, h2, h3, button').forEach(el => {
        const text = (el.textContent || '').trim();
        if (text.length > 24) return;
        if (banned.some(word => text.includes(word))) results.push({ text });
      });
      return results.slice(0, 6);
    })()`,
  },

  // --- 动效 ---------------------------------------------------------------
  {
    id: 'scroll-reveal',
    severity: 'fail',
    fix: 'remove the scroll-driven reveal; the map is the content',
    check: `(() => {
      const results = [];
      document.querySelectorAll('*').forEach(el => {
        const style = getComputedStyle(el);
        const name = style.animationName || '';
        const dur = style.animationDuration || '0s';
        if (name === 'none' || dur === '0s') return;
        if (/reveal|fade-?in|rise|stagger/i.test(name)) {
          results.push({ animation: name, duration: dur });
        }
      });
      return results.slice(0, 6);
    })()`,
  },
  {
    id: 'motion-duration',
    severity: 'warn',
    fix: 'use the motion tokens: 140ms in, 200ms out, 90ms press',
    check: `(() => {
      const allowed = new Set(['0s', '0.14s', '0.09s', '0.2s', '0.24s', '0.6s', '3.2s']);
      const results = [];
      document.querySelectorAll('button, a, .card, .sheet, .panel').forEach(el => {
        const style = getComputedStyle(el);
        const dur = style.transitionDuration || '0s';
        dur.split(',').map(s => s.trim()).forEach(value => {
          if (value === '0s' || allowed.has(value)) return;
          results.push({ element: el.tagName.toLowerCase(), duration: value });
        });
      });
      return results.slice(0, 8);
    })()`,
  },
  {
    id: 'reduced-motion',
    severity: 'warn',
    fix: 'under prefers-reduced-motion nothing should stay hidden or keep moving',
    check: `(() => {
      if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) return [];
      const results = [];
      document.querySelectorAll('*').forEach(el => {
        const style = getComputedStyle(el);
        if (!el.getClientRects().length) return;
        // Static partial opacity is a common visual treatment, not motion. Report an
        // entirely invisible element or an animation still running in reduced-motion mode.
        const running = el.getAnimations().some(animation => animation.playState === 'running');
        if (Number(style.opacity) === 0 || running)
          results.push({ element: el.tagName.toLowerCase(), opacity: style.opacity, running });
      });
      return results.slice(0, 6);
    })()`,
  },
];

// ---------------------------------------------------------------- the run

function parseArgs(argv) {
  const args = { widths: [1440, 1024, 768, 390], out: null, page: null, primary: null, json: false, quick: false };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--widths') args.widths = argv[++i].split(',').map(Number);
    else if (token === '--out') args.out = argv[++i];
    else if (token === '--page') args.page = argv[++i];
    else if (token === '--primary') args.primary = argv[++i];
    else if (token === '--json') args.json = true;
    else if (token === '--quick') args.quick = true;
    else if (!token.startsWith('--')) args.url = token;
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.url) {
    console.error('usage: node consistency.mjs <url> [--widths ...] [--out dir] [--json]');
    process.exit(2);
  }

  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ headless: true });
  const report = { url: args.url, page: args.page, widths: args.widths, states: [], findings: [] };

  for (const width of args.widths) {
    const height = width <= 480 ? 844 : width <= 820 ? 1024 : 900;
    const context = await browser.newContext({ viewport: { width, height } });
    const page = await context.newPage();
    const consoleErrors = [];
    page.on('pageerror', error => consoleErrors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });

    try {
      await page.goto(args.url, { waitUntil: 'load', timeout: 30000 });
      await page.waitForTimeout(1200);
    } catch (error) {
      report.findings.push({ width, rule: 'page-load', severity: 'fail', detail: String(error).slice(0, 120) });
      await context.close();
      continue;
    }

    const state = { width, height, consoleErrors, results: {} };
    for (const rule of RULES) {
      let findings = [];
      try {
        if (rule.id === 'reduced-motion') await page.emulateMedia({ reducedMotion: 'reduce' });
        findings = await page.evaluate(rule.check);
      } catch (error) {
        findings = [{ error: String(error).slice(0, 120) }];
      } finally {
        if (rule.id === 'reduced-motion') await page.emulateMedia({ reducedMotion: 'no-preference' });
      }
      state.results[rule.id] = findings;
      if (findings?.length) {
        report.findings.push({ width, rule: rule.id, severity: rule.severity, fix: rule.fix, findings });
      }
    }
    if (consoleErrors.length) {
      report.findings.push({ width, rule: 'page-errors', severity: 'fail',
        fix: 'resolve page and resource errors before judging the rendered result',
        findings: consoleErrors.map(error => ({ error })) });
    }
    report.states.push(state);

    if (!args.json) {
      console.log(`\n=== ${width}x${height} ===`);
      for (const rule of RULES) {
        const findings = state.results[rule.id];
        if (!findings?.length) continue;
        console.log(`  ${rule.severity === 'fail' ? 'FAIL' : 'WARN'} ${rule.id}: ${rule.fix}`);
        findings.slice(0, 4).forEach(finding => {
          console.log(`        ${JSON.stringify(finding)}`);
        });
      }
    }
    await context.close();
  }

  await browser.close();

  // The table: every rule at every width.
  const table = RULES.map(rule => {
    const cells = report.states.map(state => {
      const findings = state.results[rule.id];
      if (!findings) return 'SKIP';
      if (!findings.length) return 'PASS';
      return rule.severity === 'fail' ? 'FAIL' : 'WARN';
    });
    return { rule: rule.id, cells };
  });

  const fails = report.findings.filter(finding => finding.severity === 'fail').length;
  const warns = report.findings.filter(finding => finding.severity === 'warn').length;

  if (args.json) {
    console.log(JSON.stringify({ ...report, table, fails, warns }, null, 2));
  } else {
    console.log('\n=== table ===');
    const header = ['rule', ...report.states.map(state => String(state.width))].join('\t');
    console.log(header);
    for (const row of table) console.log([row.rule, ...row.cells].join('\t'));
    console.log(`\n${fails} FAIL, ${warns} WARN`);
  }

  if (args.out) {
    mkdirSync(resolve(args.out), { recursive: true });
    writeFileSync(resolve(args.out, 'consistency.json'),
      `${JSON.stringify({ ...report, table, fails, warns }, null, 2)}\n`, 'utf8');
  }

  process.exit(fails ? 1 : 0);
}

main().catch(error => {
  console.error(String(error));
  process.exit(2);
});
