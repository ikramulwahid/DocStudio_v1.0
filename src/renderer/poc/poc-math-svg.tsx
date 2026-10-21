/**
 * DocStudio — MathJax SVG → react-pdf converter (P06-M3)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Turns the SVG string produced by `services/math-engine` into react-pdf
 * `<Svg>/<G>/<Path>/<Rect>` elements the PDF engine consumes directly
 * (vector glyphs, no raster fonts, no HTML/CSS anywhere).
 *
 * Conversion contract (each point verified by verify_p06_m3.mjs against the
 * REAL react-pdf pipeline):
 * • A small stack parser reads the MathJax subset: `svg`, `g`, `path`,
 *   `rect`, `defs`, `use`, plus `text`/`tspan` which are dropped (they only
 *   occur in `merror` output, and the engine surfaces those as errors
 *   BEFORE anything reaches this module — the renderer prints an honest
 *   text marker instead).
 * • `<use>` is resolved HERE against a defs/id map into cloned `<path>`
 *   nodes, because `@react-pdf/renderer` exports no `Use` primitive.
 *   Positioning survives: MathJax `<use>` elements carry no x/y (verified)
 *   — placement comes from ancestor `<g transform>` — and if x/y ever
 *   appear they are wrapped in a translating `<G>`.
 * • Attribute names are mapped to react-pdf's camelCase SVG props
 *   (`stroke-width` → `strokeWidth`, …); `data-*`, `role`, `focusable`,
 *   `xmlns*` and `style` are dropped (HTML-only or informational).
 * • `currentColor` (how MathJax paints glyphs) is replaced with the
 *   document's body text colour, so formulas follow the theme exactly.
 * • Unknown elements are dropped rather than thrown — an export must
 *   never crash on one unusual glyph layout.
 *
 * @module renderer/poc/poc-math-svg
 */

import React from 'react';
import { Svg, G, Path, Rect } from '@react-pdf/renderer';

/** One parsed MathJax SVG element (attributes kept in source order). */
export interface MathSvgNode {
  readonly tag: string;
  readonly attrs: ReadonlyArray<readonly [string, string]>;
  readonly children: readonly MathSvgNode[];
}

/** A parsed MathJax `<svg>` root: the viewBox string plus its children. */
export interface ParsedMathSvg {
  readonly viewBox: string;
  readonly children: readonly MathSvgNode[];
}

interface OpenFrame {
  tag: string;
  attrs: Array<[string, string]>;
  children: MathSvgNode[];
}

const TAG_RE = /<(\/?)([a-zA-Z][\w:-]*)((?:\s+[\w:.-]+\s*=\s*"[^"]*")*)\s*(\/?)>/g;
const ATTR_RE = /([\w:.-]+)\s*=\s*"([^"]*)"/g;

/**
 * Parse a MathJax SVG string. Returns `null` (instead of throwing) for
 * input that is not the expected well-formed `<svg>` document, so callers
 * can turn it into an honest visible marker.
 */
export function parseMathSvgDocument(source: string): ParsedMathSvg | null {
  const stack: OpenFrame[] = [];
  let root: MathSvgNode | null = null;
  let cursor = 0;
  TAG_RE.lastIndex = 0;

  let match = TAG_RE.exec(source);
  if (match === null || match.index !== 0 || match[2].toLowerCase() !== 'svg') return null;

  while (match !== null) {
    const [full, closing, rawTag, rawAttrs, selfClosing] = match;
    const tag = rawTag.toLowerCase();

    if (closing === '/') {
      const frame = stack.pop();
      if (frame === undefined || frame.tag !== tag) return null;
      const node: MathSvgNode = { tag: frame.tag, attrs: frame.attrs, children: frame.children };
      if (stack.length === 0) {
        root = node;
      } else {
        stack[stack.length - 1].children.push(node);
      }
    } else {
      const attrs: Array<[string, string]> = [];
      ATTR_RE.lastIndex = 0;
      let attr = ATTR_RE.exec(rawAttrs);
      while (attr !== null) {
        attrs.push([attr[1], attr[2]]);
        attr = ATTR_RE.exec(rawAttrs);
      }
      if (selfClosing === '/') {
        const node: MathSvgNode = { tag, attrs, children: [] };
        if (stack.length === 0) {
          root = node;
        } else {
          stack[stack.length - 1].children.push(node);
        }
      } else {
        stack.push({ tag, attrs, children: [] });
      }
    }

    cursor = match.index + full.length;
    match = TAG_RE.exec(source);
    // Text between tags is intentionally ignored (whitespace in MathJax
    // output; real text only exists inside the intercepted merror path).
  }
  if (stack.length !== 0 || root === null || root.tag !== 'svg') return null;
  if (cursor === 0) return null;

  const viewBox = attrValue(root, 'viewBox');
  if (viewBox === null) return null;
  return { viewBox, children: root.children };
}

/** Read one attribute value (first match) from a parsed node. */
export function attrValue(node: MathSvgNode, name: string): string | null {
  for (const [key, value] of node.attrs) {
    if (key === name) return value;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Attribute mapping
// ─────────────────────────────────────────────────────────────────────────────

/** Hyphenated SVG attribute → react-pdf camelCase prop (unsupported ones dropped). */
const CAMEL_PROPS: Readonly<Record<string, string>> = {
  'stroke-width': 'strokeWidth',
  'stroke-linecap': 'strokeLinecap',
  'stroke-linejoin': 'strokeLinejoin',
  'stroke-miterlimit': 'strokeMiterlimit',
  'stroke-dasharray': 'strokeDasharray',
  'stroke-dashoffset': 'strokeDashoffset',
  'stroke-opacity': 'strokeOpacity',
  'fill-opacity': 'fillOpacity',
  'fill-rule': 'fillRule',
  'clip-path': 'clipPath',
};

/** Attributes dropped on conversion (HTML-only or informational). */
const DROP_ATTRS: ReadonlySet<string> = new Set([
  'style',
  'xmlns',
  'xmlns:xlink',
  'role',
  'focusable',
]);

/**
 * The supported subset of (mapped) attribute names.  Anything else — text
 * elements' font attributes, unknown glyph metadata — is dropped rather
 * than forwarded blind (normal MathJax output only emits these plus
 * `data-*`, verified during P06-M3).
 */
const KEEP_PROPS: ReadonlySet<string> = new Set([
  'd',
  'transform',
  'id',
  'x',
  'y',
  'width',
  'height',
  'fill',
  'stroke',
  'opacity',
  'clipPath',
  'strokeWidth',
  'strokeLinecap',
  'strokeLinejoin',
  'strokeMiterlimit',
  'strokeDasharray',
  'strokeDashoffset',
  'strokeOpacity',
  'fillOpacity',
  'fillRule',
]);

// ─────────────────────────────────────────────────────────────────────────────
// Path-data expansion (quadratics → exact cubics)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * MathJax glyph outlines are quadratic Béziers (`Q`/`T`).  PDF has no
 * quadratic operator, and the two downstream libraries both handle them
 * lossily: pdfkit maps `Q` onto its legacy `v` operator by using the
 * quadratic control point AS a cubic control point (every curve bends off
 * the true outline), and react-pdf's `T` expansion re-serialises back into
 * `Q` (the same approximation a second time).
 *
 * Since this converter owns the `d` string, it expands `Q`/`T` here into
 * EXACT cubic Béziers — the textbook conversion
 * (`c1 = p0 + 2/3(q − p0)`, `c2 = p2 + 2/3(q − p2)`, with `T` first
 * reflecting the previous quadratic control point about the current
 * point) — and normalises `H`/`V` to `L`, emitting only absolute
 * `M L C S Z`: the subset pdfkit renders natively with exact `c`
 * operators.  Verified against the original quadratics by sampling both
 * curves at matched parameters in verify_p06_m3.mjs.
 *
 * Survey evidence (30 representative formulas → 235 paths): MathJax SVG
 * output uses only `H L M Q T V Z`, always absolute, usually with NO
 * space before the next letter.  Anything unexpected (arcs `A`, relative
 * input it cannot place, malformed data) makes this function return the
 * ORIGINAL string untouched — a best-effort pass-through instead of a
 * throw, so one unusual glyph can never fail an export.
 */
const PATH_TOKEN_RE = /([A-Za-z])|(-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)/g;
const PATH_ARGC: Readonly<Record<string, number>> = {
  M: 2,
  L: 2,
  H: 1,
  V: 1,
  C: 6,
  S: 4,
  Q: 4,
  T: 2,
  Z: 0,
};
const isPathLetter = (token: string): boolean => token.length === 1 && /[A-Za-z]/.test(token);
/** Trim to 3 decimals (0.001 svg units ≈ 0.000001 em — far below visible). */
const fmtUnit = (v: number): string => String(Math.round(v * 1000) / 1000);

/** Exact quadratic → cubic segment for control `q` between `p0` and `p2`. */
const quadToCubic = (
  x0: number,
  y0: number,
  qx1: number,
  qy1: number,
  ex: number,
  ey: number,
): string => {
  const c1x = x0 + (2 / 3) * (qx1 - x0);
  const c1y = y0 + (2 / 3) * (qy1 - y0);
  const c2x = ex + (2 / 3) * (qx1 - ex);
  const c2y = ey + (2 / 3) * (qy1 - ey);
  return `C${fmtUnit(c1x)} ${fmtUnit(c1y)} ${fmtUnit(c2x)} ${fmtUnit(c2y)} ${fmtUnit(ex)} ${fmtUnit(ey)}`;
};

export function expandMathPathData(source: string): string {
  const bail = (): string => source;

  // 1. Tokenise — letters vs numbers, tolerating MathJax's no-space style
  //    and comma separators; any other junk between tokens = bail.
  const tokens: string[] = [];
  PATH_TOKEN_RE.lastIndex = 0;
  let consumed = 0;
  let match = PATH_TOKEN_RE.exec(source);
  while (match !== null) {
    if (!/^[\s,]*$/.test(source.slice(consumed, match.index))) return bail();
    consumed = match.index + match[0].length;
    tokens.push(match[0]);
    match = PATH_TOKEN_RE.exec(source);
  }
  if (!/^[\s,]*$/.test(source.slice(consumed))) return bail();
  if (tokens.length === 0) return bail();

  const out: string[] = [];
  let cx = 0;
  let cy = 0;
  let sx = 0;
  let sy = 0;
  let qx: number | null = null;
  let qy: number | null = null;
  let c2x: number | null = null;
  let c2y: number | null = null;
  let prevCubic = false;
  let i = 0;
  let cmd: string | null = null;

  while (i < tokens.length) {
    const token = tokens[i];
    if (!isPathLetter(token)) {
      // A number with no active command (including after Z) = malformed.
      return bail();
    }
    cmd = token;
    i += 1;
    if (cmd.toUpperCase() === 'Z') {
      out.push('Z');
      cx = sx;
      cy = sy;
      qx = null;
      qy = null;
      c2x = null;
      c2y = null;
      prevCubic = false;
      continue;
    }
    if (PATH_ARGC[cmd.toUpperCase()] === undefined) return bail();

    let consumedGroup = false;
    // One command may drive several implicit argument groups.
    while (i < tokens.length && !isPathLetter(tokens[i])) {
      const upper: string = cmd.toUpperCase();
      const argc = PATH_ARGC[upper];
      if (argc === undefined || i + argc > tokens.length) return bail();
      const nums = tokens.slice(i, i + argc).map(Number);
      if (nums.some((n) => !Number.isFinite(n))) return bail();
      i += argc;
      consumedGroup = true;
      const rel: boolean = cmd !== upper;
      switch (upper) {
        case 'M': {
          const x = rel ? cx + nums[0] : nums[0];
          const y = rel ? cy + nums[1] : nums[1];
          out.push(`M${fmtUnit(x)} ${fmtUnit(y)}`);
          sx = x;
          sy = y;
          cx = x;
          cy = y;
          qx = null;
          qy = null;
          c2x = null;
          c2y = null;
          prevCubic = false;
          // Implicit coordinate pairs after M are linetos (SVG rule).
          cmd = rel ? 'l' : 'L';
          break;
        }
        case 'L': {
          const x = rel ? cx + nums[0] : nums[0];
          const y = rel ? cy + nums[1] : nums[1];
          out.push(`L${fmtUnit(x)} ${fmtUnit(y)}`);
          cx = x;
          cy = y;
          qx = null;
          qy = null;
          c2x = null;
          c2y = null;
          prevCubic = false;
          break;
        }
        case 'H': {
          const x = rel ? cx + nums[0] : nums[0];
          out.push(`L${fmtUnit(x)} ${fmtUnit(cy)}`);
          cx = x;
          qx = null;
          qy = null;
          c2x = null;
          c2y = null;
          prevCubic = false;
          break;
        }
        case 'V': {
          const y = rel ? cy + nums[0] : nums[0];
          out.push(`L${fmtUnit(cx)} ${fmtUnit(y)}`);
          cy = y;
          qx = null;
          qy = null;
          c2x = null;
          c2y = null;
          prevCubic = false;
          break;
        }
        case 'Q': {
          const cqx = rel ? cx + nums[0] : nums[0];
          const cqy = rel ? cy + nums[1] : nums[1];
          const ex = rel ? cx + nums[2] : nums[2];
          const ey = rel ? cy + nums[3] : nums[3];
          out.push(quadToCubic(cx, cy, cqx, cqy, ex, ey));
          cx = ex;
          cy = ey;
          qx = cqx;
          qy = cqy;
          c2x = null;
          c2y = null;
          prevCubic = false;
          break;
        }
        case 'T': {
          // Reflect the previous quadratic control; with none, control = here.
          const rqx: number = qx !== null ? 2 * cx - qx : cx;
          const rqy: number = qy !== null ? 2 * cy - qy : cy;
          const ex = rel ? cx + nums[0] : nums[0];
          const ey = rel ? cy + nums[1] : nums[1];
          out.push(quadToCubic(cx, cy, rqx, rqy, ex, ey));
          cx = ex;
          cy = ey;
          qx = rqx;
          qy = rqy;
          c2x = null;
          c2y = null;
          prevCubic = false;
          break;
        }
        case 'C': {
          const x1 = rel ? cx + nums[0] : nums[0];
          const y1 = rel ? cy + nums[1] : nums[1];
          const x2 = rel ? cx + nums[2] : nums[2];
          const y2 = rel ? cy + nums[3] : nums[3];
          const ex = rel ? cx + nums[4] : nums[4];
          const ey = rel ? cy + nums[5] : nums[5];
          out.push(
            `C${fmtUnit(x1)} ${fmtUnit(y1)} ${fmtUnit(x2)} ${fmtUnit(y2)} ${fmtUnit(ex)} ${fmtUnit(ey)}`,
          );
          cx = ex;
          cy = ey;
          c2x = x2;
          c2y = y2;
          qx = null;
          qy = null;
          prevCubic = true;
          break;
        }
        case 'S': {
          const x2 = rel ? cx + nums[0] : nums[0];
          const y2 = rel ? cy + nums[1] : nums[1];
          const ex = rel ? cx + nums[2] : nums[2];
          const ey = rel ? cy + nums[3] : nums[3];
          const x1 = prevCubic && c2x !== null && c2y !== null ? 2 * cx - c2x : cx;
          const y1 = prevCubic && c2x !== null && c2y !== null ? 2 * cy - c2y : cy;
          out.push(
            `C${fmtUnit(x1)} ${fmtUnit(y1)} ${fmtUnit(x2)} ${fmtUnit(y2)} ${fmtUnit(ex)} ${fmtUnit(ey)}`,
          );
          cx = ex;
          cy = ey;
          c2x = x2;
          c2y = y2;
          qx = null;
          qy = null;
          prevCubic = true;
          break;
        }
        default:
          return bail();
      }
    }
    if (!consumedGroup) return bail();
  }

  if (out.length === 0) return bail();
  return out.join('');
}

type PropBag = Record<string, string | number>;

function collectProps(node: MathSvgNode, color: string, bag: PropBag): void {
  for (const [rawKey, rawValue] of node.attrs) {
    if (rawKey.startsWith('data-') || DROP_ATTRS.has(rawKey)) continue;
    const key = CAMEL_PROPS[rawKey] ?? rawKey;
    if (!KEEP_PROPS.has(key)) continue;
    if (key === 'd') {
      // Quadratics expanded to exact cubics here (see module docs above).
      bag.d = expandMathPathData(rawValue);
    } else if ((key === 'fill' || key === 'stroke') && rawValue === 'currentColor') {
      // MathJax paints glyphs with `currentColor`; the document's body
      // text colour replaces it so formulas follow the resolved theme.
      bag[key] = color;
    } else {
      bag[key] = rawValue;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Element conversion
// ─────────────────────────────────────────────────────────────────────────────

interface ConvertContext {
  /** id → path node, indexed from the whole tree (defs or inline). */
  readonly defs: ReadonlyMap<string, MathSvgNode>;
  readonly color: string;
}

function indexDefs(node: MathSvgNode, map: Map<string, MathSvgNode>): void {
  const id = attrValue(node, 'id');
  if (id !== null && (node.tag === 'path' || node.tag === 'rect' || node.tag === 'g')) {
    if (!map.has(id)) map.set(id, node);
  }
  for (const child of node.children) indexDefs(child, map);
}

function convertNode(
  node: MathSvgNode,
  ctx: ConvertContext,
  keyPrefix: string,
  index: number,
): React.ReactElement | null {
  const key = `${keyPrefix}.${index}`;
  const bag: PropBag = {};
  collectProps(node, ctx.color, bag);

  switch (node.tag) {
    case 'g': {
      const children: React.ReactElement[] = [];
      node.children.forEach((child, i) => {
        const el = convertNode(child, ctx, key, i);
        if (el !== null) children.push(el);
      });
      return <G key={key} {...bag}>{children}</G>;
    }
    case 'path':
      // `d` is always present on MathJax paths; the fallback satisfies the
      // strict element typings for parsed (runtime) attribute bags.
      return <Path key={key} d={typeof bag.d === 'string' ? bag.d : ''} {...bag} />;
    case 'rect':
      return <Rect key={key} width={bag.width ?? 0} height={bag.height ?? 0} {...bag} />;
    case 'use': {
      // Resolved HERE — react-pdf has no Use primitive (see module docs).
      const href = attrValue(node, 'xlink:href') ?? attrValue(node, 'href');
      const target = href !== null ? ctx.defs.get(href.replace(/^#/, '')) : undefined;
      if (target === undefined || target.tag !== 'path') return null;
      const pathBag: PropBag = {};
      collectProps(target, ctx.color, pathBag);
      const useX = Number(bag.x ?? 0);
      const useY = Number(bag.y ?? 0);
      const el = (
        <Path key={key} d={typeof pathBag.d === 'string' ? pathBag.d : ''} {...pathBag} />
      );
      if ((Number.isFinite(useX) && useX !== 0) || (Number.isFinite(useY) && useY !== 0)) {
        return (
          <G key={key} transform={`translate(${useX},${useY})`}>
            {el}
          </G>
        );
      }
      return el;
    }
    // Consumed by indexDefs; never rendered.
    case 'defs':
      return null;
    // Text only exists inside merror output, which never reaches here.
    case 'text':
    case 'tspan':
    // Unknown/unusual node — dropped, never thrown (export robustness).
    default:
      return null;
  }
}

/**
 * Build the react-pdf `<Svg>` element for one parsed MathJax SVG.
 *
 * `widthPt`/`heightPt` replace MathJax's `ex`-unit width/height (the
 * viewBox is kept verbatim, so react-pdf maps user space → box exactly —
 * uniform scale, no distortion).
 */
export function mathSvgToReact(
  parsed: ParsedMathSvg,
  options: { widthPt: number; heightPt: number; color: string },
): React.ReactElement {
  const defs = new Map<string, MathSvgNode>();
  // Root children share the tree the defs index walks.
  const syntheticRoot: MathSvgNode = { tag: 'svg', attrs: [], children: parsed.children };
  indexDefs(syntheticRoot, defs);

  const ctx: ConvertContext = { defs, color: options.color };
  const children: React.ReactElement[] = [];
  parsed.children.forEach((child, i) => {
    const el = convertNode(child, ctx, 'r', i);
    if (el !== null) children.push(el);
  });

  return (
    <Svg
      width={options.widthPt}
      height={options.heightPt}
      viewBox={parsed.viewBox}
    >
      {children}
    </Svg>
  );
}
