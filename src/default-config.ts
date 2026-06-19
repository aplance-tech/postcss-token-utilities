import { StaticRule, TokenRule, VariantRule } from ".";

const DEFAULT_CLASS_MATCHER: string[] = [
  "className",
  "class",
  "classList",
  "class:list",
  "clsx",
  "cn",
];

// Default Rules

// Border & Outline common
const lineStyles = ["solid", "dashed", "dotted", "double", "none"];

// Border
const staticBorderStyles = lineStyles.flatMap((style) => [
  { class: `border-${style}`, css: `border-style: ${style}` },
  { class: `border-t-${style}`, css: `border-top-style: ${style}` },
  { class: `border-r-${style}`, css: `border-right-style: ${style}` },
  { class: `border-b-${style}`, css: `border-bottom-style: ${style}` },
  { class: `border-l-${style}`, css: `border-left-style: ${style}` },
]);

// Border widths - bare `border`, per-edge, and x/y shorthands. This plugin emits
// no global `border-style: solid` reset (unlike Tailwind's preflight), so a
// width-only utility sets a width but never paints. Each width utility therefore
// also sets `solid` on its edge(s) so `border` / `border-t` render on their own
// (the overwhelmingly common case). An explicit style class (`border-dashed`,
// `border-t-none`, ...) still wins because the style statics are emitted AFTER
// these (see the order in DEFAULT_STATIC_RULES). Width reads the --border-1
// token (1px fallback) to match the .border-1 scale.
const bw = "var(--border-1, 1px)";
const staticBorderWidths = [
  { class: "border", css: `border-width: ${bw}; border-style: solid` },
  { class: "border-t", css: `border-top-width: ${bw}; border-top-style: solid` },
  { class: "border-r", css: `border-right-width: ${bw}; border-right-style: solid` },
  { class: "border-b", css: `border-bottom-width: ${bw}; border-bottom-style: solid` },
  { class: "border-l", css: `border-left-width: ${bw}; border-left-style: solid` },
  {
    class: "border-x",
    css: `border-left-width: ${bw}; border-right-width: ${bw}; border-left-style: solid; border-right-style: solid`,
  },
  {
    class: "border-y",
    css: `border-top-width: ${bw}; border-bottom-width: ${bw}; border-top-style: solid; border-bottom-style: solid`,
  },
];

// Outline
const staticOutlineStyles = lineStyles.map((style) => ({
  class: style === "none" ? "outline-none" : `outline-${style}`,
  css:
    style === "none"
      ? "outline: 2px solid transparent; outline-offset: 2px"
      : `outline-style: ${style}`,
}));

const outlineOffsets = [0, 1, 2, 4, 8];
const staticOutlineOffsets = outlineOffsets.map((o) => ({
  class: `outline-offset-${o}`,
  css: `outline-offset: ${o}px`,
}));

// Grid columns / rows (1..12 / 1..6)
const gridColsRange = Array.from({ length: 12 }, (_, i) => i + 1);
const gridRowsRange = Array.from({ length: 6 }, (_, i) => i + 1);

const staticGridCols = gridColsRange.flatMap((n) => [
  {
    class: `grid-cols-${n}`,
    css: `grid-template-columns: repeat(${n}, minmax(0, 1fr))`,
  },
  { class: `col-span-${n}`, css: `grid-column: span ${n} / span ${n}` },
  { class: `col-start-${n}`, css: `grid-column-start: ${n}` },
  { class: `col-end-${n}`, css: `grid-column-end: ${n}` },
]);

const staticGridRows = gridRowsRange.flatMap((n) => [
  {
    class: `grid-rows-${n}`,
    css: `grid-template-rows: repeat(${n}, minmax(0, 1fr))`,
  },
  { class: `row-span-${n}`, css: `grid-row: span ${n} / span ${n}` },
  { class: `row-start-${n}`, css: `grid-row-start: ${n}` },
  { class: `row-end-${n}`, css: `grid-row-end: ${n}` },
]);

// Order (-2..12 + first/last/none)
const orderRange = Array.from({ length: 13 }, (_, i) => i); // 0..12
const staticOrder = [
  ...orderRange.map((n) => ({ class: `order-${n}`, css: `order: ${n}` })),
  { class: "order-first", css: "order: -9999" },
  { class: "order-last", css: "order: 9999" },
  { class: "order-none", css: "order: 0" },
];

const DEFAULT_STATIC_RULES: StaticRule[] = [
  // Display
  { class: "block", css: "display: block" },
  { class: "inline-block", css: "display: inline-block" },
  { class: "inline", css: "display: inline" },
  { class: "flex", css: "display: flex" },
  { class: "inline-flex", css: "display: inline-flex" },
  { class: "grid", css: "display: grid" },
  { class: "inline-grid", css: "display: inline-grid" },
  { class: "contents", css: "display: contents" },
  { class: "flow-root", css: "display: flow-root" },
  { class: "hidden", css: "display: none" },

  // Box sizing
  { class: "box-border", css: "box-sizing: border-box" },
  { class: "box-content", css: "box-sizing: content-box" },

  // Isolation
  { class: "isolate", css: "isolation: isolate" },
  { class: "isolation-auto", css: "isolation: auto" },

  // Position
  { class: "static", css: "position: static" },
  { class: "fixed", css: "position: fixed" },
  { class: "absolute", css: "position: absolute" },
  { class: "relative", css: "position: relative" },
  { class: "sticky", css: "position: sticky" },

  // Float & Clear
  { class: "float-left", css: "float: left" },
  { class: "float-right", css: "float: right" },
  { class: "float-none", css: "float: none" },
  { class: "clear-left", css: "clear: left" },
  { class: "clear-right", css: "clear: right" },
  { class: "clear-both", css: "clear: both" },
  { class: "clear-none", css: "clear: none" },

  // Overflow
  { class: "overflow-auto", css: "overflow: auto" },
  { class: "overflow-hidden", css: "overflow: hidden" },
  { class: "overflow-visible", css: "overflow: visible" },
  { class: "overflow-scroll", css: "overflow: scroll" },
  { class: "overflow-x-auto", css: "overflow-x: auto" },
  { class: "overflow-y-auto", css: "overflow-y: auto" },
  { class: "overflow-x-hidden", css: "overflow-x: hidden" },
  { class: "overflow-y-hidden", css: "overflow-y: hidden" },
  { class: "overflow-x-visible", css: "overflow-x: visible" },
  { class: "overflow-y-visible", css: "overflow-y: visible" },
  { class: "overflow-x-scroll", css: "overflow-x: scroll" },
  { class: "overflow-y-scroll", css: "overflow-y: scroll" },

  // Overscroll
  { class: "overscroll-auto", css: "overscroll-behavior: auto" },
  { class: "overscroll-contain", css: "overscroll-behavior: contain" },
  { class: "overscroll-none", css: "overscroll-behavior: none" },
  { class: "overscroll-y-auto", css: "overscroll-behavior-y: auto" },
  { class: "overscroll-y-contain", css: "overscroll-behavior-y: contain" },
  { class: "overscroll-y-none", css: "overscroll-behavior-y: none" },
  { class: "overscroll-x-auto", css: "overscroll-behavior-x: auto" },
  { class: "overscroll-x-contain", css: "overscroll-behavior-x: contain" },
  { class: "overscroll-x-none", css: "overscroll-behavior-x: none" },

  // Flexbox
  { class: "flex-row", css: "flex-direction: row" },
  { class: "flex-row-reverse", css: "flex-direction: row-reverse" },
  { class: "flex-col", css: "flex-direction: column" },
  { class: "flex-col-reverse", css: "flex-direction: column-reverse" },
  { class: "flex-wrap", css: "flex-wrap: wrap" },
  { class: "flex-wrap-reverse", css: "flex-wrap: wrap-reverse" },
  { class: "flex-nowrap", css: "flex-wrap: nowrap" },
  { class: "flex-1", css: "flex: 1 1 0%" },
  { class: "flex-auto", css: "flex: 1 1 auto" },
  { class: "flex-initial", css: "flex: 0 1 auto" },
  { class: "flex-none", css: "flex: none" },
  { class: "flex-grow", css: "flex-grow: 1" },
  { class: "flex-grow-0", css: "flex-grow: 0" },
  { class: "flex-shrink", css: "flex-shrink: 1" },
  { class: "flex-shrink-0", css: "flex-shrink: 0" },
  { class: "basis-auto", css: "flex-basis: auto" },
  { class: "basis-full", css: "flex-basis: 100%" },

  // Align & Justify
  { class: "items-start", css: "align-items: flex-start" },
  { class: "items-end", css: "align-items: flex-end" },
  { class: "items-center", css: "align-items: center" },
  { class: "items-baseline", css: "align-items: baseline" },
  { class: "items-stretch", css: "align-items: stretch" },
  { class: "justify-start", css: "justify-content: flex-start" },
  { class: "justify-end", css: "justify-content: flex-end" },
  { class: "justify-center", css: "justify-content: center" },
  { class: "justify-between", css: "justify-content: space-between" },
  { class: "justify-around", css: "justify-content: space-around" },
  { class: "justify-evenly", css: "justify-content: space-evenly" },
  { class: "justify-items-start", css: "justify-items: start" },
  { class: "justify-items-end", css: "justify-items: end" },
  { class: "justify-items-center", css: "justify-items: center" },
  { class: "justify-items-stretch", css: "justify-items: stretch" },
  { class: "self-auto", css: "align-self: auto" },
  { class: "self-start", css: "align-self: flex-start" },
  { class: "self-end", css: "align-self: flex-end" },
  { class: "self-center", css: "align-self: center" },
  { class: "self-stretch", css: "align-self: stretch" },
  { class: "self-baseline", css: "align-self: baseline" },
  { class: "justify-self-auto", css: "justify-self: auto" },
  { class: "justify-self-start", css: "justify-self: start" },
  { class: "justify-self-end", css: "justify-self: end" },
  { class: "justify-self-center", css: "justify-self: center" },
  { class: "justify-self-stretch", css: "justify-self: stretch" },
  { class: "content-start", css: "align-content: flex-start" },
  { class: "content-end", css: "align-content: flex-end" },
  { class: "content-center", css: "align-content: center" },
  { class: "content-between", css: "align-content: space-between" },
  { class: "content-around", css: "align-content: space-around" },
  { class: "content-evenly", css: "align-content: space-evenly" },
  { class: "place-items-start", css: "place-items: start" },
  { class: "place-items-end", css: "place-items: end" },
  { class: "place-items-center", css: "place-items: center" },
  { class: "place-items-stretch", css: "place-items: stretch" },
  { class: "place-content-start", css: "place-content: start" },
  { class: "place-content-end", css: "place-content: end" },
  { class: "place-content-center", css: "place-content: center" },
  { class: "place-content-between", css: "place-content: space-between" },
  { class: "place-content-around", css: "place-content: space-around" },
  { class: "place-content-evenly", css: "place-content: space-evenly" },
  { class: "place-content-stretch", css: "place-content: stretch" },
  { class: "place-self-auto", css: "place-self: auto" },
  { class: "place-self-start", css: "place-self: start" },
  { class: "place-self-end", css: "place-self: end" },
  { class: "place-self-center", css: "place-self: center" },
  { class: "place-self-stretch", css: "place-self: stretch" },

  // Vertical align
  { class: "align-baseline", css: "vertical-align: baseline" },
  { class: "align-top", css: "vertical-align: top" },
  { class: "align-middle", css: "vertical-align: middle" },
  { class: "align-bottom", css: "vertical-align: bottom" },
  { class: "align-text-top", css: "vertical-align: text-top" },
  { class: "align-text-bottom", css: "vertical-align: text-bottom" },
  { class: "align-sub", css: "vertical-align: sub" },
  { class: "align-super", css: "vertical-align: super" },

  // Text alignment & transform
  { class: "text-left", css: "text-align: left" },
  { class: "text-center", css: "text-align: center" },
  { class: "text-right", css: "text-align: right" },
  { class: "text-justify", css: "text-align: justify" },
  { class: "text-start", css: "text-align: start" },
  { class: "text-end", css: "text-align: end" },
  { class: "uppercase", css: "text-transform: uppercase" },
  { class: "lowercase", css: "text-transform: lowercase" },
  { class: "capitalize", css: "text-transform: capitalize" },
  { class: "normal-case", css: "text-transform: none" },

  // Font style
  { class: "italic", css: "font-style: italic" },
  { class: "not-italic", css: "font-style: normal" },

  // Text decoration
  { class: "underline", css: "text-decoration: underline" },
  { class: "line-through", css: "text-decoration: line-through" },
  { class: "no-underline", css: "text-decoration: none" },

  // Text overflow
  { class: "text-ellipsis", css: "text-overflow: ellipsis" },
  { class: "text-clip", css: "text-overflow: clip" },
  {
    class: "truncate",
    css: "overflow: hidden; text-overflow: ellipsis; white-space: nowrap",
  },

  // Whitespace & word break
  { class: "whitespace-normal", css: "white-space: normal" },
  { class: "whitespace-nowrap", css: "white-space: nowrap" },
  { class: "whitespace-pre", css: "white-space: pre" },
  { class: "whitespace-pre-line", css: "white-space: pre-line" },
  { class: "whitespace-pre-wrap", css: "white-space: pre-wrap" },
  { class: "break-normal", css: "word-break: normal; overflow-wrap: normal" },
  { class: "break-words", css: "overflow-wrap: break-word" },
  { class: "break-all", css: "word-break: break-all" },
  { class: "break-keep", css: "word-break: keep-all" },

  // List
  { class: "list-none", css: "list-style-type: none" },
  { class: "list-disc", css: "list-style-type: disc" },
  { class: "list-decimal", css: "list-style-type: decimal" },
  { class: "list-inside", css: "list-style-position: inside" },
  { class: "list-outside", css: "list-style-position: outside" },

  // Cursor
  { class: "cursor-auto", css: "cursor: auto" },
  { class: "cursor-default", css: "cursor: default" },
  { class: "cursor-pointer", css: "cursor: pointer" },
  { class: "cursor-wait", css: "cursor: wait" },
  { class: "cursor-text", css: "cursor: text" },
  { class: "cursor-move", css: "cursor: move" },
  { class: "cursor-help", css: "cursor: help" },
  { class: "cursor-grab", css: "cursor: grab" },
  { class: "cursor-grabbing", css: "cursor: grabbing" },
  { class: "cursor-crosshair", css: "cursor: crosshair" },
  { class: "cursor-not-allowed", css: "cursor: not-allowed" },

  // User select
  { class: "select-none", css: "user-select: none" },
  { class: "select-text", css: "user-select: text" },
  { class: "select-all", css: "user-select: all" },
  { class: "select-auto", css: "user-select: auto" },

  // Pointer events
  { class: "pointer-events-none", css: "pointer-events: none" },
  { class: "pointer-events-auto", css: "pointer-events: auto" },

  // Resize
  { class: "resize-none", css: "resize: none" },
  { class: "resize-y", css: "resize: vertical" },
  { class: "resize-x", css: "resize: horizontal" },
  { class: "resize", css: "resize: both" },

  // Appearance
  { class: "appearance-none", css: "appearance: none" },

  // Scroll behavior
  { class: "scroll-auto", css: "scroll-behavior: auto" },
  { class: "scroll-smooth", css: "scroll-behavior: smooth" },

  // Scroll snap
  { class: "snap-none", css: "scroll-snap-type: none" },
  { class: "snap-x", css: "scroll-snap-type: x var(--scroll-snap-strictness, mandatory)" },
  { class: "snap-y", css: "scroll-snap-type: y var(--scroll-snap-strictness, mandatory)" },
  { class: "snap-both", css: "scroll-snap-type: both var(--scroll-snap-strictness, mandatory)" },
  { class: "snap-mandatory", css: "--scroll-snap-strictness: mandatory" },
  { class: "snap-proximity", css: "--scroll-snap-strictness: proximity" },
  { class: "snap-start", css: "scroll-snap-align: start" },
  { class: "snap-end", css: "scroll-snap-align: end" },
  { class: "snap-center", css: "scroll-snap-align: center" },
  { class: "snap-align-none", css: "scroll-snap-align: none" },
  { class: "snap-normal", css: "scroll-snap-stop: normal" },
  { class: "snap-always", css: "scroll-snap-stop: always" },

  // Opacity
  { class: "opacity-0", css: "opacity: 0" },
  { class: "opacity-25", css: "opacity: 0.25" },
  { class: "opacity-50", css: "opacity: 0.5" },
  { class: "opacity-75", css: "opacity: 0.75" },
  { class: "opacity-100", css: "opacity: 1" },

  // Z-Index
  { class: "z-0", css: "z-index: 0" },
  { class: "z-10", css: "z-index: 10" },
  { class: "z-20", css: "z-index: 20" },
  { class: "z-30", css: "z-index: 30" },
  { class: "z-40", css: "z-index: 40" },
  { class: "z-50", css: "z-index: 50" },
  { class: "z-auto", css: "z-index: auto" },

  // Object fit & position
  { class: "object-contain", css: "object-fit: contain" },
  { class: "object-cover", css: "object-fit: cover" },
  { class: "object-fill", css: "object-fit: fill" },
  { class: "object-none", css: "object-fit: none" },
  { class: "object-scale-down", css: "object-fit: scale-down" },
  { class: "object-center", css: "object-position: center" },
  { class: "object-top", css: "object-position: top" },
  { class: "object-bottom", css: "object-position: bottom" },
  { class: "object-left", css: "object-position: left" },
  { class: "object-right", css: "object-position: right" },

  // Visibility
  { class: "visible", css: "visibility: visible" },
  { class: "invisible", css: "visibility: hidden" },

  // Aspect ratio
  { class: "aspect-auto", css: "aspect-ratio: auto" },
  { class: "aspect-square", css: "aspect-ratio: 1 / 1" },
  { class: "aspect-video", css: "aspect-ratio: 16 / 9" },

  // Grid static
  { class: "grid-cols-none", css: "grid-template-columns: none" },
  { class: "grid-rows-none", css: "grid-template-rows: none" },
  { class: "col-auto", css: "grid-column: auto" },
  { class: "row-auto", css: "grid-row: auto" },
  { class: "col-span-full", css: "grid-column: 1 / -1" },
  { class: "row-span-full", css: "grid-row: 1 / -1" },
  { class: "grid-flow-row", css: "grid-auto-flow: row" },
  { class: "grid-flow-col", css: "grid-auto-flow: column" },
  { class: "grid-flow-dense", css: "grid-auto-flow: dense" },
  { class: "grid-flow-row-dense", css: "grid-auto-flow: row dense" },
  { class: "grid-flow-col-dense", css: "grid-auto-flow: column dense" },
  { class: "auto-cols-auto", css: "grid-auto-columns: auto" },
  { class: "auto-cols-min", css: "grid-auto-columns: min-content" },
  { class: "auto-cols-max", css: "grid-auto-columns: max-content" },
  { class: "auto-cols-fr", css: "grid-auto-columns: minmax(0, 1fr)" },
  { class: "auto-rows-auto", css: "grid-auto-rows: auto" },
  { class: "auto-rows-min", css: "grid-auto-rows: min-content" },
  { class: "auto-rows-max", css: "grid-auto-rows: max-content" },
  { class: "auto-rows-fr", css: "grid-auto-rows: minmax(0, 1fr)" },
  ...staticGridCols,
  ...staticGridRows,

  // Order
  ...staticOrder,

  // Outline / Border
  ...staticOutlineOffsets,
  ...staticOutlineStyles,
  // Widths BEFORE styles so an explicit style class (border-dashed, ...) wins.
  ...staticBorderWidths,
  ...staticBorderStyles,

  // Auto margins & sizing
  { class: "m-auto", css: "margin: auto" },
  { class: "mx-auto", css: "margin-left: auto; margin-right: auto" },
  { class: "my-auto", css: "margin-top: auto; margin-bottom: auto" },
  { class: "mt-auto", css: "margin-top: auto" },
  { class: "mr-auto", css: "margin-right: auto" },
  { class: "mb-auto", css: "margin-bottom: auto" },
  { class: "ml-auto", css: "margin-left: auto" },

  // Width & Height
  { class: "w-auto", css: "width: auto" },
  { class: "w-full", css: "width: 100%" },
  { class: "w-screen", css: "width: 100vw" },
  { class: "w-min", css: "width: min-content" },
  { class: "w-max", css: "width: max-content" },
  { class: "w-fit", css: "width: fit-content" },
  { class: "h-auto", css: "height: auto" },
  { class: "h-full", css: "height: 100%" },
  { class: "h-screen", css: "height: 100vh" },
  { class: "h-min", css: "height: min-content" },
  { class: "h-max", css: "height: max-content" },
  { class: "h-fit", css: "height: fit-content" },
  { class: "max-w-none", css: "max-width: none" },
  { class: "max-w-full", css: "max-width: 100%" },
  { class: "max-w-screen", css: "max-width: 100vw" },
  { class: "max-w-min", css: "max-width: min-content" },
  { class: "max-w-max", css: "max-width: max-content" },
  { class: "max-w-fit", css: "max-width: fit-content" },
  { class: "min-w-full", css: "min-width: 100%" },
  { class: "min-w-screen", css: "min-width: 100vw" },
  { class: "min-w-min", css: "min-width: min-content" },
  { class: "min-w-max", css: "min-width: max-content" },
  { class: "min-w-fit", css: "min-width: fit-content" },
  { class: "max-h-none", css: "max-height: none" },
  { class: "max-h-full", css: "max-height: 100%" },
  { class: "max-h-screen", css: "max-height: 100vh" },
  { class: "max-h-min", css: "max-height: min-content" },
  { class: "max-h-max", css: "max-height: max-content" },
  { class: "max-h-fit", css: "max-height: fit-content" },
  { class: "min-h-0", css: "min-height: 0px" },
  { class: "min-h-full", css: "min-height: 100%" },
  { class: "min-h-screen", css: "min-height: 100vh" },
  { class: "min-h-min", css: "min-height: min-content" },
  { class: "min-h-max", css: "min-height: max-content" },
  { class: "min-h-fit", css: "min-height: fit-content" },
];

// Must add tokens in css root: {} to see it work
const DEFAULT_TOKEN_RULES: TokenRule[] = [
  // Spacing (all directions + shorthands)
  {
    token: "spacing",
    prefix: "gap-",
    css: (_k, v) => `gap: ${v};`,
  },
  {
    token: "spacing",
    prefix: "gap-x-",
    css: (_k, v) => `column-gap: ${v};`,
  },
  {
    token: "spacing",
    prefix: "gap-y-",
    css: (_k, v) => `row-gap: ${v};`,
  },

  // Padding
  {
    token: "spacing",
    prefix: "p-",
    css: (_k, v) => `padding: ${v};`,
  },
  {
    token: "spacing",
    prefix: "pt-",
    css: (_k, v) => `padding-top: ${v};`,
  },
  {
    token: "spacing",
    prefix: "pr-",
    css: (_k, v) => `padding-right: ${v};`,
  },
  {
    token: "spacing",
    prefix: "pb-",
    css: (_k, v) => `padding-bottom: ${v};`,
  },
  {
    token: "spacing",
    prefix: "pl-",
    css: (_k, v) => `padding-left: ${v};`,
  },
  {
    token: "spacing",
    prefix: "px-",
    css: (_k, v) => `padding-left: ${v}; padding-right: ${v};`,
  },
  {
    token: "spacing",
    prefix: "py-",
    css: (_k, v) => `padding-top: ${v}; padding-bottom: ${v};`,
  },

  // Margin
  {
    token: "spacing",
    prefix: "m-",
    css: (_k, v) => `margin: ${v};`,
  },
  {
    token: "spacing",
    prefix: "mt-",
    css: (_k, v) => `margin-top: ${v};`,
  },
  {
    token: "spacing",
    prefix: "mr-",
    css: (_k, v) => `margin-right: ${v};`,
  },
  {
    token: "spacing",
    prefix: "mb-",
    css: (_k, v) => `margin-bottom: ${v};`,
  },
  {
    token: "spacing",
    prefix: "ml-",
    css: (_k, v) => `margin-left: ${v};`,
  },
  {
    token: "spacing",
    prefix: "mx-",
    css: (_k, v) => `margin-left: ${v}; margin-right: ${v};`,
  },
  {
    token: "spacing",
    prefix: "my-",
    css: (_k, v) => `margin-top: ${v}; margin-bottom: ${v};`,
  },

  // Size (width, height, min/max)
  {
    token: "spacing",
    prefix: "w-",
    css: (_k, v) => `width: ${v};`,
  },
  {
    token: "spacing",
    prefix: "h-",
    css: (_k, v) => `height: ${v};`,
  },
  {
    token: "spacing",
    prefix: "min-w-",
    css: (_k, v) => `min-width: ${v};`,
  },
  {
    token: "spacing",
    prefix: "min-h-",
    css: (_k, v) => `min-height: ${v};`,
  },
  {
    token: "spacing",
    prefix: "max-w-",
    css: (_k, v) => `max-width: ${v};`,
  },
  {
    token: "spacing",
    prefix: "max-h-",
    css: (_k, v) => `max-height: ${v};`,
  },
  {
    token: "spacing",
    prefix: "basis-",
    css: (_k, v) => `flex-basis: ${v};`,
  },

  // Scroll margin & padding
  {
    token: "spacing",
    prefix: "scroll-m-",
    css: (_k, v) => `scroll-margin: ${v};`,
  },
  {
    token: "spacing",
    prefix: "scroll-p-",
    css: (_k, v) => `scroll-padding: ${v};`,
  },

  // Inset / positioning
  {
    token: "spacing",
    prefix: "inset-",
    css: (_k, v) => `inset: ${v};`,
  },
  {
    token: "spacing",
    prefix: "inset-x-",
    css: (_k, v) => `left: ${v}; right: ${v};`,
  },
  {
    token: "spacing",
    prefix: "inset-y-",
    css: (_k, v) => `top: ${v}; bottom: ${v};`,
  },
  {
    token: "spacing",
    prefix: "top-",
    css: (_k, v) => `top: ${v};`,
  },
  {
    token: "spacing",
    prefix: "right-",
    css: (_k, v) => `right: ${v};`,
  },
  {
    token: "spacing",
    prefix: "bottom-",
    css: (_k, v) => `bottom: ${v};`,
  },
  {
    token: "spacing",
    prefix: "left-",
    css: (_k, v) => `left: ${v};`,
  },

  // Colors
  {
    token: "color",
    prefix: "bg-",
    css: (k, v) => {
      if (k.startsWith("gradient-")) {
        return `background: linear-gradient(to right, ${v}, transparent);`;
      }
      return `background-color: ${v};`;
    },
  },
  {
    token: "color",
    prefix: "text-",
    css: (_k, v) => `color: ${v};`,
  },
  {
    token: "color",
    prefix: "border-",
    css: (_k, v) => `border-color: ${v};`,
  },
  {
    token: "color",
    prefix: "outline-",
    css: (_k, v) => `outline-color: ${v};`,
  },
  {
    token: "color",
    prefix: "fill-",
    css: (_k, v) => `fill: ${v};`,
  },
  {
    token: "color",
    prefix: "stroke-",
    css: (_k, v) => `stroke: ${v};`,
  },
  {
    token: "color",
    prefix: "decoration-",
    css: (_k, v) => `text-decoration-color: ${v};`,
  },
  {
    token: "color",
    prefix: "caret-",
    css: (_k, v) => `caret-color: ${v};`,
  },
  {
    token: "color",
    prefix: "accent-",
    css: (_k, v) => `accent-color: ${v};`,
  },

  // Border, Outline & Radius
  {
    token: "radius",
    prefix: "rounded-",
    css: (k, v) => {
      if (k === "none") return "border-radius: 0;";
      if (k === "full") return "border-radius: 9999px;";
      return `border-radius: ${v};`;
    },
  },
  {
    token: "border",
    prefix: "border-",
    css: (_k, v) => `border-width: ${v};`,
  },
  {
    token: "outline",
    prefix: "outline-",
    css: (_k, v) => `outline-width: ${v};`,
  },

  // Typography
  {
    token: "font-size",
    prefix: "text-",
    css: (_k, v) => `font-size: ${v};`,
  },
  {
    token: "font-weight",
    prefix: "font-",
    css: (_k, v) => `font-weight: ${v};`,
  },
  {
    token: "font-family",
    prefix: "font-",
    css: (_k, v) => `font-family: ${v};`,
  },
  {
    token: "letter-spacing",
    prefix: "tracking-",
    css: (_k, v) => `letter-spacing: ${v};`,
  },

  // Effects
  {
    token: "shadow",
    prefix: "shadow-",
    css: (_k, v) => `box-shadow: ${v};`,
  },
  {
    token: "transition",
    prefix: "transition-",
    css: (_k, v) => `transition: ${v};`,
  },
  {
    token: "duration",
    prefix: "duration-",
    css: (_k, v) => `transition-duration: ${v};`,
  },
  {
    token: "ease",
    prefix: "ease-",
    css: (_k, v) => `transition-timing-function: ${v};`,
  },
  {
    token: "blur",
    prefix: "blur-",
    css: (_k, v) => `filter: blur(${v});`,
  },
  {
    token: "blur",
    prefix: "backdrop-blur-",
    css: (_k, v) => `backdrop-filter: blur(${v});`,
  },

  // Others
  {
    token: "line-height",
    prefix: "leading-",
    css: (_k, v) => `line-height: ${v};`,
  },
  {
    token: "z-index",
    prefix: "z-",
    css: (_k, v) => `z-index: ${v};`,
  },
  {
    token: "aspect",
    prefix: "aspect-",
    css: (_k, v) => `aspect-ratio: ${v};`,
  },
  {
    token: "order",
    prefix: "order-",
    css: (_k, v) => `order: ${v};`,
  },
];

// Variant rules hover:, focus:, dark:, md:, lg: etc.
const DEFAULT_VARIANT_RULES: VariantRule[] = [
  // i. Pseudo-class variants (Interactive states)
  { name: "hover", type: "pseudo" },
  { name: "focus", type: "pseudo" },
  { name: "focus-within", type: "pseudo" },
  { name: "focus-visible", type: "pseudo" },
  { name: "active", type: "pseudo" },
  { name: "disabled", type: "pseudo" },
  { name: "checked", type: "pseudo" },

  // Structural pseudo-classes
  { name: "first", type: "pseudo" },
  { name: "last", type: "pseudo" },
  { name: "only", type: "pseudo" },
  { name: "odd", type: "pseudo" },
  { name: "even", type: "pseudo" },
  { name: "first-of-type", type: "pseudo" },
  { name: "last-of-type", type: "pseudo" },
  { name: "only-of-type", type: "pseudo" },
  { name: "empty", type: "pseudo" },

  // ii. Media query variants (Responsive & Preferences)
  // Most of the media variants can be easily added via @custom-media from media.css ...
  // And those can be used as utilities in classes also in css files

  // iii. Ancestor variants (Group & Peer patterns)
  // Group - for parent hover/focus states (any descendant)
  { name: "group-hover", type: "ancestor", selector: ".group:hover" },
  { name: "group-focus", type: "ancestor", selector: ".group:focus" },
  { name: "group-active", type: "ancestor", selector: ".group:active" },
  {
    name: "group-focus-within",
    type: "ancestor",
    selector: ".group:focus-within",
  },
  { name: "group-disabled", type: "ancestor", selector: ".group:disabled" },

  // Group Direct - for immediate children only
  { name: "group-hover-direct", type: "ancestor", selector: ".group:hover >" },
  { name: "group-focus-direct", type: "ancestor", selector: ".group:focus >" },
  {
    name: "group-active-direct",
    type: "ancestor",
    selector: ".group:active >",
  },

  // Peer - for sibling states
  { name: "peer-hover", type: "ancestor", selector: ".peer:hover ~" },
  { name: "peer-focus", type: "ancestor", selector: ".peer:focus ~" },
  { name: "peer-checked", type: "ancestor", selector: ".peer:checked ~" },
  { name: "peer-disabled", type: "ancestor", selector: ".peer:disabled ~" },
];

export {
  DEFAULT_CLASS_MATCHER,
  DEFAULT_STATIC_RULES,
  DEFAULT_TOKEN_RULES,
  DEFAULT_VARIANT_RULES,
};
