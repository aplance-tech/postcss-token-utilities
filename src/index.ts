import { type PluginCreator, parse } from "postcss";
import fs from "node:fs";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import glob from "fast-glob";
import {
  DEFAULT_CLASS_MATCHER,
  DEFAULT_STATIC_RULES,
  DEFAULT_TOKEN_RULES,
  DEFAULT_VARIANT_RULES,
} from "./default-config";

const PLUGIN_NAME = "postcss-token-utilities";
const RULES_FILE_NAMES = [
  "token-utilities.rules.ts",
  "token-utilities.rules.js",
  "token-utilities.rules.mjs",
];

// Module-level regex constants (compile once)
const ROOT_BLOCK_REGEX = /:root\s*\{([\s\S]*?)\}/;
const CSS_VAR_REGEX = /--([\w-]+)\s*:\s*([^;]+)/g;
const CUSTOM_MEDIA_REGEX = /@custom-media\s+--([a-z0-9-]+)\s+\(([^)]+)\)/g;
const QUOTED_STRING_REGEX = /["'`]([^"'`]+)["'`]/g;
const VALID_CLASS_REGEX = /^[a-zA-Z0-9_:.-]+$/;
const WHITESPACE_SPLIT_REGEX = /\s+/;
// A numeric length (px / em / rem) - the units real width breakpoints use. The
// raw number is compared directly, which is correct as long as a project uses a
// consistent unit for its breakpoints (the normal case); units are not converted.
const WIDTH_LENGTH_REGEX = /(\d+(?:\.\d+)?)\s*(?:px|r?em)\b/;
const MIN_WIDTH_REGEX = /min-width|>=|>/;

// Approximate the viewport-width range a media condition covers, used to order
// responsive variants so the cascade is correct WITHOUT per-project config:
// emit the widest range first and the narrowest (most specific) last, so when
// several breakpoints match at once the narrowest one wins.
//   - max-width X  -> covers ~0..X        -> range = X
//   - min-width X  -> covers ~X..infinity -> range = MAX - X  (always widest)
// This makes desktop-first (max-width) sort largest->smallest and mobile-first
// (min-width) sort smallest->largest, both correct. Conditions with no length
// width (e.g. `prefers-color-scheme`, `orientation`) return MAX so they sort
// ahead of width breakpoints and keep their definition order via a stable sort.
function mediaRange(condition: string): number {
  const match = condition.match(WIDTH_LENGTH_REGEX);
  if (!match) return Number.MAX_SAFE_INTEGER;
  const value = parseFloat(match[1]);
  if (MIN_WIDTH_REGEX.test(condition)) return Number.MAX_SAFE_INTEGER - value;
  return value;
}

// Types
export type DesignTokens = Record<string, Record<string, string>>;
export interface StaticRule {
  class: string;
  css: string;
}
export interface TokenRule {
  token: string;
  prefix: string;
  css: (key: string, value: string) => string;
}

// Variant rules
export interface BaseVariantRule {
  name: string;
}
export interface PseudoVariantRule extends BaseVariantRule {
  type: "pseudo";
}
export interface MediaVariantRule extends BaseVariantRule {
  type: "media";
  condition: string; // Required for media
}
export interface AncestorVariantRule extends BaseVariantRule {
  type: "ancestor";
  selector: string; // Required for ancestor
}
export type VariantRule =
  | PseudoVariantRule
  | MediaVariantRule
  | AncestorVariantRule;

// combined interface for all rules
export interface Rules {
  staticRules?: StaticRule[];
  tokenRules?: TokenRule[];
  variantRules?: VariantRule[];
}

export interface PluginOptions {
  designTokenSource: string;
  customMediaSource?: string;
  content: string[];
  classMatcher?: string[];
  generated?:
    | {
        path: string;
      }
    | false;
  extend?: Rules;
  defaultRules?: {
    staticRules?: boolean;
    tokenRules?: boolean;
    variantRules?: boolean;
  };
  logs?: boolean;
}

// Global Process Caches (Persist across hot-reloads)
let universeCache: {
  configHash: string;
  cssMap: Map<string, string>;
  rawCss: string;
  // class name -> position in the canonical cascade order, used to sort the
  // injected utilities deterministically (see UtilityGenerator.build).
  rank: Map<string, number>;
} | null = null;

// The File Scan Cache: Stores mtime and classes per file
const fileScanCache = new Map<
  string,
  { mtime: number; classes: Set<string> }
>();

// Process-global cap on concurrently-open file descriptors.
//
// PostCSS runs the `Once` hook once PER stylesheet, and bundlers (Vite/rolldown,
// webpack) process many stylesheets in PARALLEL. Each invocation scans the whole
// content glob, so an unbounded `Promise.all` over those files opens every one
// at once - multiplied across every concurrent stylesheet. On a large app that's
// thousands of simultaneous handles, which exhausts the OS limit and throws
// `EMFILE: too many open files` (hit first on Windows, where the limit is lower).
//
// This semaphore bounds the TOTAL in-flight fs operations across ALL invocations
// (module-level state is shared by the single plugin instance), so throughput is
// still high but the descriptor count is safe regardless of repo size or build
// parallelism. Dependency-free by design (this plugin stays lightweight).
const FS_CONCURRENCY = 64;
let fsActiveCount = 0;
const fsWaiters: Array<() => void> = [];

// Run `task` while holding one of the FS_CONCURRENCY slots. Uses token-transfer
// (a finishing task hands its slot straight to the next waiter rather than
// decrementing and letting the waiter re-increment), so the active count can
// never transiently exceed the cap across microtask scheduling.
const withFsSlot = async <T>(task: () => Promise<T>): Promise<T> => {
  if (fsActiveCount < FS_CONCURRENCY) {
    fsActiveCount++;
  } else {
    // At capacity: wait for a slot to be handed to us (count already accounts
    // for it on hand-off, so we don't increment again).
    await new Promise<void>((release) => fsWaiters.push(release));
  }
  try {
    return await task();
  } finally {
    const next = fsWaiters.shift();
    if (next) {
      next(); // transfer this slot directly to the next waiter (count unchanged)
    } else {
      fsActiveCount--;
    }
  }
};

class ClassExtractor {
  private matcherRegex: RegExp;

  constructor(matchers: string[] = []) {
    const allMatchers = [...DEFAULT_CLASS_MATCHER, ...(matchers || [])];
    // Escape regex special chars in matcher names
    const escaped = allMatchers.map((m) =>
      m.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    );
    // Single-pass regex across all matchers
    this.matcherRegex = new RegExp(`(?:${escaped.join("|")})`, "g");
  }

  extract(content: string): Set<string> {
    const classes = new Set<string>();
    const matcherRe = this.matcherRegex;
    matcherRe.lastIndex = 0;

    let m: RegExpExecArray | null;
    while ((m = matcherRe.exec(content)) !== null) {
      const start = m.index + m[0].length;
      // Window of 500 chars covers typical className / clsx / cn() usage
      const chunk = content.substring(start, start + 500);
      this.extractQuotedStrings(chunk, classes);
    }

    return classes;
  }

  // Covers "class", 'class', `class`, arrays, objects, etc.
  private extractQuotedStrings(text: string, classes: Set<string>): void {
    QUOTED_STRING_REGEX.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = QUOTED_STRING_REGEX.exec(text)) !== null) {
      const parts = match[1].split(WHITESPACE_SPLIT_REGEX);
      for (let i = 0; i < parts.length; i++) {
        const name = parts[i];
        if (name && this.isValidClassName(name)) {
          classes.add(name);
        }
      }
    }
  }

  // Filter out obvious non-classes (URLs, paths, long strings)
  private isValidClassName(str: string): boolean {
    const len = str.length;
    if (len === 0 || len > 100) return false;

    // Skip obvious non-classes (fast char checks before regex)
    for (let i = 0; i < len; i++) {
      const c = str.charCodeAt(i);
      // '(' 40, '{' 123, '[' 91, '\\' 92
      if (c === 40 || c === 123 || c === 91 || c === 92) return false;
    }
    if (str.charCodeAt(0) === 47 /* '/' */) return false;
    if (str.includes("://")) return false;

    // Valid class: letters, numbers, hyphens, colons, underscores, dots
    return VALID_CLASS_REGEX.test(str);
  }
}

// Universe Utility Generator
class UtilityGenerator {
  private tokens: DesignTokens = {};
  private rules: {
    static: StaticRule[];
    token: TokenRule[];
    variant: VariantRule[];
  };

  constructor(opts: PluginOptions, css: { tokens: string; media: string }) {
    // 1. Setup Rules
    const useDef = {
      static: opts.defaultRules?.staticRules !== false,
      token: opts.defaultRules?.tokenRules !== false,
      variant: opts.defaultRules?.variantRules !== false,
    };

    this.rules = {
      static: [
        ...(useDef.static ? DEFAULT_STATIC_RULES : []),
        ...(opts.extend?.staticRules || []),
      ],
      token: [
        ...(useDef.token ? DEFAULT_TOKEN_RULES : []),
        ...(opts.extend?.tokenRules || []),
      ],
      variant: [
        ...(useDef.variant ? DEFAULT_VARIANT_RULES : []),
        ...(opts.extend?.variantRules || []),
      ],
    };

    // 2. Parse Inputs
    this.parseTokens(css.tokens);
    this.parseMedia(css.media);
  }

  private parseTokens(css: string) {
    const rootMatch = css.match(ROOT_BLOCK_REGEX);
    if (!rootMatch) return;

    // Sort categories by length (desc) so longer prefixes (e.g. "font-size")
    // are matched before shorter ones (e.g. "font")
    const categories = [
      ...new Set(this.rules.token.map((r) => r.token)),
    ].sort((a, b) => b.length - a.length);

    CSS_VAR_REGEX.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = CSS_VAR_REGEX.exec(rootMatch[1])) !== null) {
      const varName = match[1];
      for (const cat of categories) {
        if (
          varName.length > cat.length + 1 &&
          varName.charCodeAt(cat.length) === 45 /* '-' */ &&
          varName.startsWith(cat)
        ) {
          const key = varName.substring(cat.length + 1);
          if (!this.tokens[cat]) this.tokens[cat] = {};
          this.tokens[cat][key] = `var(--${varName})`;
          break;
        }
      }
    }
  }

  private parseMedia(css: string) {
    CUSTOM_MEDIA_REGEX.lastIndex = 0;
    let match: RegExpExecArray | null;
    const existing = new Set(this.rules.variant.map((v) => v.name));

    while ((match = CUSTOM_MEDIA_REGEX.exec(css)) !== null) {
      if (!existing.has(match[1])) {
        this.rules.variant.push({
          name: match[1],
          type: "media",
          condition: match[2],
        });
        existing.add(match[1]);
      }
    }
  }

  // Variants in CASCADE order (later wins). State variants (pseudo + ancestor)
  // keep their definition order; media variants are sorted widest-range-first so
  // the narrowest/most-specific breakpoint is emitted last and wins when several
  // match at once. This is what makes responsive utilities deterministic instead
  // of dependent on definition / discovery order.
  private orderedVariants(): VariantRule[] {
    const states: VariantRule[] = [];
    const media: MediaVariantRule[] = [];
    for (const v of this.rules.variant) {
      if (v.type === "media") media.push(v);
      else states.push(v);
    }
    const decorated = media.map((v, i) => ({
      v,
      i,
      range: mediaRange(v.condition),
    }));
    // Widest range first, narrowest last; stable on ties (preserve definition order).
    decorated.sort((a, b) => b.range - a.range || a.i - b.i);
    return [...states, ...decorated.map((d) => d.v)];
  }

  build(opts: { collectRaw: boolean }) {
    const map = new Map<string, string>();
    const baseClasses: string[] = [];
    const variants = this.orderedVariants();
    const collectRaw = opts.collectRaw;

    const add = (cls: string, css: string) => {
      map.set(cls, `.${cls} { ${css} }`);
      baseClasses.push(cls);

      for (let i = 0; i < variants.length; i++) {
        const v = variants[i];
        const escaped = `${v.name}\\:${cls}`;
        const lookup = `${v.name}:${cls}`;
        let vCss = "";

        if (v.type === "pseudo") {
          vCss = `.${escaped}:${v.name} { ${css} }`;
        } else if (v.type === "media" && v.condition) {
          vCss = `@media (${v.condition}) { .${escaped} { ${css} } }`;
        } else if (v.type === "ancestor" && v.selector) {
          vCss = `${v.selector} .${escaped} { ${css} }`;
        }

        if (vCss) map.set(lookup, vCss);
      }
    };

    // Static
    for (let i = 0; i < this.rules.static.length; i++) {
      const r = this.rules.static[i];
      add(r.class, r.css);
    }

    // Tokens
    for (let i = 0; i < this.rules.token.length; i++) {
      const r = this.rules.token[i];
      const cat = this.tokens[r.token];
      if (!cat) continue;
      for (const k in cat) {
        add(`${r.prefix}${k}`, r.css(k, cat[k]));
      }
    }

    // Canonical cascade order: EVERY base utility first (so a variant always
    // wins over the base it overrides), then the variant utilities grouped by
    // variant in `variants` order (states, then media narrowest-last). Both the
    // injected stylesheet and the generated reference file follow this order, so
    // the cascade no longer depends on the order classes happen to appear in the
    // scanned files.
    const order: string[] = baseClasses.slice();
    for (let i = 0; i < variants.length; i++) {
      const name = variants[i].name;
      for (let j = 0; j < baseClasses.length; j++) {
        const lookup = `${name}:${baseClasses[j]}`;
        if (map.has(lookup)) order.push(lookup);
      }
    }

    const rank = new Map<string, number>();
    for (let i = 0; i < order.length; i++) rank.set(order[i], i);

    const raw = collectRaw ? order.map((c) => map.get(c) as string) : [];
    return { map, raw, rank };
  }
}

// Helper for loading rules from file
async function loadRulesFile(cwd: string): Promise<Rules | null> {
  for (const fileName of RULES_FILE_NAMES) {
    const rulesPath = join(cwd, fileName);

    if (fs.existsSync(rulesPath)) {
      try {
        const fileUrl = pathToFileURL(rulesPath).href;
        const cacheBustedUrl = `${fileUrl}?t=${Date.now()}`;
        const rulesModule = await import(cacheBustedUrl);

        const rules = rulesModule.default || rulesModule;

        return rules;
      } catch (error) {
        console.warn(`[${PLUGIN_NAME}] Failed to load ${fileName}:`, error);
      }
    }
  }

  return null;
}

// Plugin Definition
const postcssTokenUtilities: PluginCreator<PluginOptions> = (
  opts = { designTokenSource: "", content: [] },
) => {
  return {
    postcssPlugin: PLUGIN_NAME,

    async Once(root, { result }) {
      const cwd = process.cwd();
      const rulesFile = await loadRulesFile(cwd);

      const finalOpts: PluginOptions = {
        ...opts,
        extend: {
          staticRules: [
            ...(rulesFile?.staticRules || []),
            ...(opts.extend?.staticRules || []),
          ],
          tokenRules: [
            ...(rulesFile?.tokenRules || []),
            ...(opts.extend?.tokenRules || []),
          ],
          variantRules: [
            ...(rulesFile?.variantRules || []),
            ...(opts.extend?.variantRules || []),
          ],
        },
      };

      const rulesFileName = RULES_FILE_NAMES.find((name) =>
        fs.existsSync(join(cwd, name)),
      );

      if (rulesFileName) {
        const rulesFilePath = join(cwd, rulesFileName);
        result.messages.push({
          type: "dependency",
          plugin: PLUGIN_NAME,
          file: rulesFilePath,
          parent: result.opts.from,
        });
      }

      const enableLogs = finalOpts?.logs ?? false;

      // Validation
      if (!finalOpts.designTokenSource || !finalOpts.content.length) {
        if (enableLogs) {
          console.warn(
            `[${PLUGIN_NAME}] Missing required config: designTokenSource and content are required in postcss.config.`,
          );
        }
        return;
      }

      const tokenPath = resolve(cwd, finalOpts.designTokenSource);
      const mediaPath = finalOpts.customMediaSource
        ? resolve(cwd, finalOpts.customMediaSource)
        : null;

      // Read Config Sources
      let tokenCss = "",
        mediaCss = "";

      try {
        tokenCss = fs.readFileSync(tokenPath, "utf-8");
        result.messages.push({
          type: "dependency",
          plugin: PLUGIN_NAME,
          file: tokenPath,
          parent: result.opts.from,
        });

        if (mediaPath && fs.existsSync(mediaPath)) {
          mediaCss = fs.readFileSync(mediaPath, "utf-8");
          result.messages.push({
            type: "dependency",
            plugin: PLUGIN_NAME,
            file: mediaPath,
            parent: result.opts.from,
          });
        }
      } catch (e) {
        if (enableLogs) {
          console.warn(`[${PLUGIN_NAME}] Warning: Sources not found.`);
        }
      }

      const defaultOutPath = "src/styles/utilities.gen.css";

      const rawOutPath =
        finalOpts.generated !== false
          ? finalOpts.generated?.path || defaultOutPath
          : null;

      const normalizedOutPath =
        rawOutPath && rawOutPath.endsWith(".gen.css")
          ? rawOutPath
          : rawOutPath
            ? rawOutPath.replace(/\.css$/, "") + ".gen.css"
            : null;

      const outPath: string | null = normalizedOutPath
        ? resolve(cwd, normalizedOutPath)
        : null;

      const GEN_CSS_PATTERN = "**/*.gen.css";

      const shouldWriteGenerated = !!(finalOpts.generated && outPath);

      const configHash = createHash("md5")
        .update(
          tokenCss +
            mediaCss +
            JSON.stringify(finalOpts.extend || {}) +
            JSON.stringify(finalOpts.defaultRules || {}),
        )
        .digest("hex");

      if (universeCache?.configHash !== configHash) {
        const gen = new UtilityGenerator(finalOpts, {
          tokens: tokenCss,
          media: mediaCss,
        });
        const { map, raw, rank } = gen.build({
          collectRaw: shouldWriteGenerated,
        });
        const rawCss = shouldWriteGenerated ? raw.join("\n") : "";
        universeCache = { configHash, cssMap: map, rawCss, rank };

        // Write to disk (Only on Universe change & if option is there)
        if (shouldWriteGenerated) {
          const header = [
            "/* ========================================= */",
            "/* AUTO-GENERATED FILE                       */",
            "/*    - DO NOT EDIT MANUALLY                 */",
            "/* Do not import it directly in app CSS.     */",
            `/* Generated by ${PLUGIN_NAME}               */`,
            "/*                                           */",
            "/* Git Ignore Recommendation:                */",
            `/*   ${GEN_CSS_PATTERN}                      */`,
            "/*                                           */",
            "/* VS Code IntelliSense Recommendation:      */",
            "/*   Add glob pattern to extensions like     */",
            "/*   (CSS Navigation) Always Include:        */",
            `/*   ${GEN_CSS_PATTERN}                      */`,
            "/*                                           */",
            "/* Purpose:                                  */",
            "/* - Provides IntelliSense for utility CSS   */",
            "/* - Improves PostCSS performance by caching */",
            "/*   generated utility rules                 */",
            "/*                                           */",
            "/* To refresh IntelliSense after changes:    */",
            "/* - CMD/CTRL + Shift + P                    */",
            "/* - Type: Reload Window                     */",
            "/* - Or restart VS Code                      */",
            "/*                                           */",
            "/* To disable:                               */",
            "/* - Set { generated: false } in plugin opts */",
            "/* ========================================= */",
            "",
          ].join("\n");

          const contentToWrite = header + rawCss;

          const existing = fs.existsSync(outPath)
            ? fs.readFileSync(outPath, "utf-8")
            : "";

          if (existing !== contentToWrite) {
            fs.writeFileSync(outPath, contentToWrite);
            if (enableLogs) {
              console.log(`[${PLUGIN_NAME}] Updated reference: ${outPath}`);
              console.log(
                `[${PLUGIN_NAME}] 💡 Reload VS Code window (Cmd/Ctrl+Shift+P → "Reload Window") to refresh IntelliSense`,
              );
            }
          }
        }
      }

      const extractor = new ClassExtractor(finalOpts?.classMatcher);
      const usedClasses = new Set<string>();

      const files = await glob(finalOpts.content, {
        cwd,
        absolute: true,
        ignore: ["**/node_modules/**", "**/.next/**", GEN_CSS_PATTERN],
        onlyFiles: true,
      });

      // Prune cache entries for files no longer in the content glob
      if (fileScanCache.size > files.length) {
        const activeFiles = new Set(files);
        for (const cachedFile of fileScanCache.keys()) {
          if (!activeFiles.has(cachedFile)) {
            fileScanCache.delete(cachedFile);
          }
        }
      }

      // Stat all files (concurrency-bounded), then read only the ones that
      // changed. The bound caps open descriptors so a large content glob across
      // many parallel stylesheets can't exhaust the OS limit (EMFILE).
      const toRead: string[] = [];
      const statResults = await Promise.all(
        files.map((f) =>
          withFsSlot(() => fs.promises.stat(f)).then((s) => ({ f, s })),
        ),
      );

      for (const { f, s } of statResults) {
        result.messages.push({
          type: "dependency",
          plugin: PLUGIN_NAME,
          file: f,
          parent: result.opts.from,
        });
        const cached = fileScanCache.get(f);
        if (cached && cached.mtime === s.mtimeMs) {
          cached.classes.forEach((c) => usedClasses.add(c));
        } else {
          toRead.push(f);
        }
      }

      if (toRead.length > 0) {
        const contents = await Promise.all(
          toRead.map((f) => withFsSlot(() => fs.promises.readFile(f, "utf-8"))),
        );
        for (let i = 0; i < toRead.length; i++) {
          const f = toRead[i];
          const classes = extractor.extract(contents[i]);
          const mtime =
            statResults.find((r) => r.f === f)?.s.mtimeMs ?? Date.now();
          fileScanCache.set(f, { mtime, classes });
          classes.forEach((c) => usedClasses.add(c));
        }
      }

      // Emit the used utilities in canonical cascade order (base before its
      // variants, breakpoints narrowest-last) rather than the order they happened
      // to be discovered in source files - otherwise equal-specificity rules like
      // `grid-cols-3` and `lg:grid-cols-1` would win by accident of scan order.
      const injectLines: string[] = [];
      const cssMap = universeCache?.cssMap;
      const rank = universeCache?.rank;
      if (cssMap && rank) {
        const ordered = [...usedClasses].sort(
          (a, b) => (rank.get(a) ?? 0) - (rank.get(b) ?? 0),
        );
        for (const c of ordered) {
          const css = cssMap.get(c);
          if (css) injectLines.push(css);
        }
      }

      if (toRead.length > 0 && enableLogs)
        console.log(
          `[${PLUGIN_NAME}]: ${injectLines.length} utilities injected.`,
        );

      root.walkAtRules("layer", (atRule) => {
        if (atRule.params === "utilities-gen") {
          atRule.nodes = [];
          if (injectLines.length > 0) {
            atRule.append(
              parse(injectLines.join("\n"), {
                from: outPath || resolve(cwd, defaultOutPath),
              }),
            );
          }
        }
      });
    },
  };
};

postcssTokenUtilities.postcss = true;
export default postcssTokenUtilities;
