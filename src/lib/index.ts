import { getNestedValue, hash, deepCopy, testRegexr } from '../utils/tools';
import { negative, breakpoints } from '../utils/helpers';
import { Keyframes, Container, Property, Style, StyleSheet } from '../utils/style';
import { resolveVariants } from './variants';
import { staticUtilities, dynamicUtilities } from './utilities';

import extract, { generateStaticStyle } from './extract';
import preflight from './preflight';
import { baseConfig } from '../config';
import cssEscape from '../utils/algorithm/cssEscape';
import combineConfig from '../utils/algorithm/combineConfig';
import ClassParser from '../utils/parser/class';

import type {
  Config,
  DictStr,
  DefaultConfig,
  DynamicUtility,
  ConfigUtil,
  Theme,
  DefaultTheme,
  Output,
  Element,
  Shortcut,
  PluginUtils,
  PluginUtilOptions,
  PluginOutput,
  PluginWithOptions,
  DeepNestObject,
  UtilityGenerator,
  VariantGenerator,
  ThemeType,
} from '../interfaces';

import type { Utility } from './utilities/handler';

type Cache = {
  html: string[];
  classes: string[];
  utilities: string[];
}
type ResolvedVariants = { [key: string]: () => Style }
type VariantTypes = 'screen' | 'theme' | 'state'

type StyleArrayObject = { [key: string]: Style[] }

interface Plugin {
  static: StyleArrayObject; // All styles that do not require purge
  dynamic: { [key: string]: ((utility: Utility) => Output)};
  utilities: StyleArrayObject;
  components: StyleArrayObject;
  preflights: StyleArrayObject;
  shortcuts: StyleArrayObject;
  variants: { [key: string]: () => Style };
}

type VariantUtils = {
  modifySelectors: (modifier: ({ className }: {
      className: string;
  }) => string) => Style;
  atRule: (name: string) => Style;
  pseudoClass: (name: string) => Style;
  pseudoElement: (name: string) => Style;
  parent: (name: string) => Style;
  child: (name: string) => Style;
}

export class Processor {
  private _config: Config;
  private _theme: Config['theme'];
  private _variants: ResolvedVariants = {};
  private _cache: Cache = {
    html: [],
    classes: [],
    utilities: [],
  };

  readonly _plugin: Plugin = {
    static: {},
    dynamic: {},
    utilities: {},
    components: {},
    preflights: {},
    variants: {},
    shortcuts: {},
  };

  public pluginUtils: PluginUtils = {
    addDynamic: (...args) => this.addDynamic(...args),
    addUtilities: (...args) => this.addUtilities(...args),
    addComponents: (...args) => this.addComponents(...args),
    addBase: (...args) => this.addBase(...args),
    addVariant: (...args) => this.addVariant(...args),
    e: (...args) => this.e(...args),
    prefix: (...args) => this.prefix(...args),
    config: (...args) => this.config(...args),
    theme: (...args) => this.theme(...args),
    variants: (...args) => this.variants(...args),
  };

  public variantUtils: VariantUtils = {
    modifySelectors: (modifier) =>
      new Style().wrapSelector((selector) =>
        modifier({
          className: /^[.#]/.test(selector) ? selector.substring(1) : selector,
        })),
    atRule: (name) => new Style().atRule(name),
    pseudoClass: (name) => new Style().pseudoClass(name),
    pseudoElement: (name) => new Style().pseudoElement(name),
    parent: (name) => new Style().parent(name),
    child: (name) => new Style().child(name),
  };

  constructor(config?: Config) {
    this._config = this.resolveConfig(config, baseConfig);
    this._theme = this._config.theme;
    this._config.shortcuts && this.loadShortcuts(this._config.shortcuts);
  }

  private _resolveConfig(userConfig: Config, presets: Config = {}) {
    if (userConfig.presets) presets = this._resolvePresets(userConfig.presets);
    const userTheme = userConfig.theme;
    if (userTheme) delete userConfig.theme;
    const extendTheme: Theme = userTheme?.extend ?? {};
    const theme = (presets.theme || {}) as Record<string, ThemeType>;
    if (userTheme) {
      delete userTheme.extend;
      for (const [key, value] of Object.entries(userTheme)) {
        theme[key] = typeof value === 'function' ? value : { ...value };
      }
    }
    if (extendTheme && typeof extendTheme === 'object') {
      for (const [key, value] of Object.entries(extendTheme)) {
        const themeValue = theme[key];
        if (typeof themeValue === 'function') {
          theme[key] = (theme, { negative, breakpoints }) => {
            return {
              ...(themeValue as ConfigUtil)(theme, { negative, breakpoints }),
              ...(typeof value === 'function' ? value(theme, { negative, breakpoints }) : value ?? {}),
            };
          };
        } else if (typeof themeValue === 'object') {
          theme[key] = (theme, { negative, breakpoints }) => {
            return {
              ...themeValue,
              ...(typeof value === 'function' ? value(theme, { negative, breakpoints }) : value ?? {}),
            };
          };
        } else {
          theme[key] = value;
        }
      }
    }
    return { ...presets, ...userConfig, theme };
  }

  private _resolvePresets(presets: Config[]) {
    let config: Config = {};
    presets.forEach((p) => {
      config = this._resolveConfig(config, p);
    });
    return config;
  }

  private _resolveFunction(config: Config) {
    if (!config.theme) return config;
    const theme = (path: string, defaultValue?: unknown) => this.theme(path, defaultValue);
    for (const [key, value] of Object.entries(config.theme)) {
      if (typeof value === 'function') {
        (config.theme as Record<string, ThemeType>)[key] = value(theme, {
          negative,
          breakpoints,
        }) as ConfigUtil;
      }
    }
    return config;
  }

  private _resolveCorePlugins() {
    // not support yet
  }

  private _resolvePlugins() {
    // not support yet
  }

  private _replaceStyleVariants(styles: Style[]) {
    // @screen sm -> @screen (min-width: 640px)
    styles.forEach(style => {
      style.atRules = style.atRules?.map(i => {
        if (i.match(/@screen/)) {
          const variant = i.replace(/\s*@screen\s*/, '');
          const atRule = this._variants[variant]().atRules?.[0];
          return atRule ?? i;
        }
        return i;
      });
    });
  }

  resolveConfig(config: Config | undefined, presets: Config): Config {
    this._config = this._resolveConfig({ ...deepCopy(config ? config : {}), exclude: config?.exclude }, deepCopy(presets)); // deep copy
    this._theme = this._config.theme; // update theme to make sure theme() function works.
    this._config.plugins?.map(i => i.__isOptionsFunction ? this.loadPluginWithOptions(i) : this.loadPlugin(i));
    this._config = this._resolveFunction(this._config);
    this._variants = this.resolveVariants();
    return this._config;
  }

  resolveVariants(
    type?: VariantTypes
  ): ResolvedVariants {
    const variants = resolveVariants(this._config);
    if (type) {
      return variants[type];
    }
    return { ...variants.screen, ...variants.theme, ...variants.state };
  }

  resolveStaticUtilities(includePlugins = false): StyleArrayObject {
    const staticStyles: StyleArrayObject = {};
    for (const key in staticUtilities) {
      staticStyles[key] = [generateStaticStyle(key, true)];
    }
    if (!includePlugins) return staticStyles;
    return { ...staticStyles, ...this._plugin.utilities, ...this._plugin.components };
  }

  resolveDynamicUtilities(includePlugins = false): DynamicUtility {
    if (!includePlugins) return dynamicUtilities;
    return { ...dynamicUtilities, ...this._plugin.dynamic };
  }

  get allConfig(): DefaultConfig {
    return this._config as DefaultConfig;
  }

  get allTheme(): DefaultTheme {
    return (this._theme ?? {}) as DefaultTheme;
  }

  wrapWithVariants(variants: string[], styles: Style | Style[]): Style[] {
    // apply variant to style
    if (!Array.isArray(styles)) styles = [styles];
    if (variants.length === 0) return styles;
    const allVariants = { ...this._variants, ...this._plugin.variants };
    return styles.map((style) => {
      if (style instanceof Keyframes) return style;
      const wrapped = variants
        .filter((i) => i in allVariants)
        .map((i) => allVariants[i]())
        .reduce((previousValue: Style, currentValue: Style) => {
          return previousValue.extend(currentValue);
        }, new Style())
        .extend(style);
      return (style instanceof Container) ? new Container().extend(wrapped) : wrapped;
    });
  }

  removePrefix(className: string): string {
    const prefix = this.config('prefix') as string | undefined;
    return prefix ? className.replace(new RegExp(`^${prefix}`), '') : className;
  }

  markAsImportant(style: Style, force: boolean | string = false): Style {
    const _important = force ? force : this.config('important', false);
    const important =
      typeof _important === 'string'
        ? (_important as string)
        : (_important as boolean);
    if (important) {
      if (typeof important === 'string') {
        style.parent(important);
      } else {
        style.important = true;
      }
    }
    return style;
  }

  extract(className: string, addComment = false): Style | Style[] | undefined {
    return extract(this, className, addComment);
  }

  preflight(
    html?: string,
    includeBase = true,
    includeGlobal = true,
    includePlugins = true,
    ignoreProcessed = false
  ): StyleSheet {
    let id;
    if (html) {
      id = hash(html);
      if (ignoreProcessed && this._cache.html.includes(id))
        return new StyleSheet();
    }
    id && this._cache.html.push(id);
    return preflight(this, html, includeBase, includeGlobal, includePlugins);
  }

  interpret(
    classNames: string,
    ignoreProcessed = false,
    handleIgnored?: (ignored:string) => Style | Style[] | undefined
  ): { success: string[]; ignored: string[]; styleSheet: StyleSheet } {
    // Interpret tailwind class then generate raw tailwind css.
    const ast = new ClassParser(
      classNames,
      this.config('separator', ':') as string
    ).parse();
    const success: string[] = [];
    const ignored: string[] = [];
    const styleSheet = new StyleSheet();

    const _hIgnored = (className:string) => {
      if (handleIgnored) {
        const style = handleIgnored(className);
        if (style) {
          styleSheet.add(style);
          success.push(className);
        } else {
          ignored.push(className);
        }
      }
      ignored.push(className);
    };

    const _gStyle = (
      baseClass: string,
      variants: string[],
      selector: string,
      important = false,
    ) => {
      if (this._config.exclude && testRegexr(selector, this._config.exclude)) {
        // filter exclude className
        ignored.push(selector);
        return;
      }
      const result = this.extract(baseClass);
      if (result) {
        success.push(selector);
        const escapedSelector = '.' + cssEscape(selector);
        if (result instanceof Style) {
          result.selector = escapedSelector;
          this.markAsImportant(result, important);
        } else if (Array.isArray(result)) {
          result.forEach(i => {
            if (i instanceof Container) i.selector = escapedSelector;
            this.markAsImportant(i, important);
          });
        }
        styleSheet.add(this.wrapWithVariants(variants, result));
      } else {
        _hIgnored(selector);
      }
    };

    const _hGroup = (obj: Element, parentVariants: string[] = []) => {
      Array.isArray(obj.content) &&
        obj.content.forEach((u: Element) => {
          if (u.type === 'group') {
            _hGroup(u, obj.variants);
          } else {
            // utility
            const variants = [
              ...parentVariants,
              ...obj.variants,
              ...u.variants,
            ];
            const important = obj.important || u.important;
            const selector = (important ? '!' : '') + [...variants, u.content].join(':');
            typeof u.content === 'string' &&
              _gStyle(this.removePrefix(u.content), variants, selector, important);
          }
        });
    };

    ast.forEach((obj) => {
      if (!(ignoreProcessed && this._cache.utilities.includes(obj.raw))) {
        this._cache.utilities.push(obj.raw);
        if (obj.type === 'utility') {
          if (Array.isArray(obj.content)) {
            // #functions stuff
          } else if (obj.content) {
            _gStyle(this.removePrefix(obj.content), obj.variants, obj.raw, obj.important);
          }
        } else if (obj.type === 'group') {
          _hGroup(obj);
        } else {
          _hIgnored(obj.raw);
        }
      }
    });

    return {
      success,
      ignored,
      styleSheet, //.sort()
    };
  }

  compile(
    classNames: string,
    prefix = 'windi-',
    showComment = false,
    ignoreGenerated = false,
    handleIgnored?: (ignored:string) => Style | Style[] | undefined,
    outputClassName?: string
  ): {
    success: string[];
    ignored: string[];
    className?: string;
    styleSheet: StyleSheet;
  } {
    // Compile tailwind css classes to one combined class.
    const ast = new ClassParser(classNames, this.config('separator', ':') as string).parse();
    const success: string[] = [];
    const ignored: string[] = [];
    const styleSheet = new StyleSheet();
    let className: string | undefined = outputClassName ?? prefix + hash(classNames.trim().split(/\s+/g).join(' '));
    if (ignoreGenerated && this._cache.classes.includes(className))
      return { success, ignored, styleSheet, className };
    const buildSelector = '.' + className;

    const _hIgnored = (className:string) => {
      if (handleIgnored) {
        const style = handleIgnored(className);
        if (style) {
          styleSheet.add(style);
          success.push(className);
        } else {
          ignored.push(className);
        }
      }
      ignored.push(className);
    };

    const _gStyle = (
      baseClass: string,
      variants: string[],
      selector: string,
      important = false
    ) => {
      if (this._config.exclude && testRegexr(selector, this._config.exclude)) {
        // filter exclude className
        ignored.push(selector);
        return;
      }
      const result = this.extract(baseClass, showComment);
      if (result) {
        success.push(selector);
        if (Array.isArray(result)) {
          result.forEach((i) => {
            i.selector = buildSelector;
            this.markAsImportant(i, important);
          });
        } else {
          result.selector = buildSelector;
          this.markAsImportant(result, important);
        }
        styleSheet.add(this.wrapWithVariants(variants, result));
      } else {
        _hIgnored(selector);
      }
    };

    const _hGroup = (obj: Element, parentVariants: string[] = []) => {
      Array.isArray(obj.content) &&
        obj.content.forEach((u) => {
          if (u.type === 'group') {
            _hGroup(u, obj.variants);
          } else {
            // utility
            const variants = [
              ...parentVariants,
              ...obj.variants,
              ...u.variants,
            ];
            const selector = [...variants, u.content].join(':');
            typeof u.content === 'string' &&
              _gStyle(this.removePrefix(u.content), variants, selector, obj.important || u.important);
          }
        });
    };

    ast.forEach((obj) => {
      if (obj.type === 'utility') {
        if (Array.isArray(obj.content)) {
          // #functions stuff
        } else if (obj.content) {
          _gStyle(this.removePrefix(obj.content), obj.variants, obj.raw, obj.important);
        }
      } else if (obj.type === 'group') {
        _hGroup(obj);
      } else {
        _hIgnored(obj.raw);
      }
    });

    className = success.length > 0 ? className : undefined;
    if (className) this._cache.classes.push(className);
    return {
      success,
      ignored,
      className,
      styleSheet,
    };
  }

  loadPlugin({
    handler,
    config,
  }: PluginOutput): void {
    if (config) {
      config = this._resolveFunction(config);
      config = combineConfig(
        config as { [key: string]: unknown },
        this._config as { [key: string]: unknown }
      );
      const pluginTheme = config.theme as Record<string, ThemeType>;
      const extendTheme = pluginTheme?.extend as undefined | Record<string, ThemeType>;
      if (pluginTheme && extendTheme && typeof extendTheme === 'object') {
        for (const [key, value] of Object.entries(extendTheme)) {
          const themeValue = pluginTheme[key];
          if (themeValue && typeof themeValue === 'object') {
            pluginTheme[key] = { ...(themeValue ?? {}), ...value as { [key:string] : unknown } };
          } else if (value && typeof value === 'object' ){
            pluginTheme[key] = value as {[key:string] : unknown};
          }
        }
      }
      this._config = { ...config, theme: pluginTheme };
      this._theme = pluginTheme;
      this._variants = this.resolveVariants();
    }
    handler(this.pluginUtils);
  }

  loadPluginWithOptions(optionsFunction: PluginWithOptions<unknown>, userOptions?:DictStr): void {
    const plugin = optionsFunction(userOptions ?? {});
    this.loadPlugin(plugin);
  }

  loadShortcuts(shortcuts: { [ key:string ]: Shortcut }): void {
    for (const [key, value] of Object.entries(shortcuts)) {
      const name = '.' + cssEscape(key);
      if (typeof value === 'string') {
        this._plugin.shortcuts[name] = this.compile(value, undefined, undefined, false, undefined, cssEscape(key)).styleSheet.children;
      } else {
        let styles = Style.generate(name, value);
        // styles.map(i => console.log(i.property));
        styles.forEach(style => {
          const applies = style.property.filter(i => i.name === '@apply').map(i => i.value).join(' ');
          if (applies[0] && style.selector) {
            styles = styles.concat(this.compile(applies, undefined, undefined, false, undefined, style.rule.slice(1,)).styleSheet.children);
            style.property = style.property.filter(i => i.name !== '@apply');
          }
        });
        this._plugin.shortcuts[name] = styles;
      }
    }
  }

  // tailwind interfaces
  config(path: string, defaultValue?: unknown): unknown {
    return getNestedValue(this._config, path) ?? defaultValue;
  }

  theme(path: string, defaultValue?: unknown): unknown {
    return this._theme
      ? getNestedValue(this._theme, path) ?? defaultValue
      : undefined;
  }

  corePlugins(path: string): boolean {
    if (Array.isArray(this._config.corePlugins)) {
      return this._config.corePlugins.includes(path);
    }
    return (this.config(`corePlugins.${path}`, true) as boolean) ?? false;
  }

  variants(path: string, defaultValue: string[] = []): string[] {
    if (Array.isArray(this._config.variants)) {
      return this._config.variants;
    }
    return this.config(`variants.${path}`, defaultValue) as string[];
  }

  e(selector: string): string {
    return cssEscape(selector);
  }

  prefix(selector: string): string {
    return selector.replace(/(?=[\w])/, this._config.prefix ?? '');
  }

  addUtilities(
    utilities: DeepNestObject,
    options: PluginUtilOptions = {
      variants: [],
      respectPrefix: true,
      respectImportant: true,
    }
  ): Style[] {
    if (Array.isArray(options)) options = { variants: options };
    let output: Style[] = [];
    for (const [key, value] of Object.entries(utilities)) {
      const styles = Style.generate(key.startsWith('.') && options.respectPrefix ? this.prefix(key) : key, value);
      if (options.respectImportant && this._config.important) styles.forEach(style => style.important = true);
      output = [...output, ...styles];
      (key.startsWith('.')? this._plugin.utilities: this._plugin.static)[key] = styles;
    }
    return output;
  }

  addDynamic(
    key: string,
    generator: UtilityGenerator,
    options: PluginUtilOptions = {
      variants: [],
      respectPrefix: true,
      respectImportant: true,
    }
  ): UtilityGenerator {
    const uOptions = Array.isArray(options)? { variants:options } : options;
    const style = (
      selector: string,
      property?: Property | Property[],
      important:boolean = uOptions.respectImportant && this._config.important ? true : false
    ) => new Style(selector, property, important);
    const prop = (
      name: string | string[],
      value?: string,
      comment?: string,
      important = uOptions.respectImportant && this._config.important ? true : false
    ) => new Property(name, value, comment, important);
    style.generate = Style.generate;
    prop.parse = Property.parse;
    if (key in this._plugin.dynamic) {
      // handle duplicated key;
      this._plugin.dynamic[key] = (Utility: Utility) => deepCopy(this._plugin.dynamic[key])(Utility) || generator({ Utility, Style: style, Property: prop });
    } else {
      this._plugin.dynamic[key] = (Utility: Utility) => generator({ Utility, Style: style, Property: prop });
    }
    return generator;
  }

  addComponents(
    components: DeepNestObject | DeepNestObject[],
    options: PluginUtilOptions = { variants: [], respectPrefix: false }
  ): Style[] {
    if (Array.isArray(options)) options = { variants: options };
    let output: Style[] = [];
    if (Array.isArray(components)) {
      components = components.reduce((previous: {[key:string]:unknown}, current) => {
        return combineConfig(previous, current);
      }, {}) as DeepNestObject;
    }
    for (const [key, value] of Object.entries(components)) {
      const pkey = key.startsWith('.') && options.respectPrefix ? this.prefix(key): key;
      const styles = Style.generate(pkey, value);
      this._replaceStyleVariants(styles);
      output = [...output, ...styles];
      (key.startsWith('.')? this._plugin.components: this._plugin.static)[pkey] = styles;
    }
    return output;
  }

  addBase(baseStyles: DeepNestObject, autoPurge = true): Style[] {
    let output: Style[] = [];
    for (const [key, value] of Object.entries(baseStyles)) {
      const styles = Style.generate(key, value);
      this._replaceStyleVariants(styles);
      output = [...output, ...styles];
      (autoPurge? this._plugin.preflights : this._plugin.static)[key] = styles;
    }
    return output;
  }

  addVariant(
    name: string,
    generator: VariantGenerator,
  ): Style | Style[] {
    // name && generator && options;
    const style = generator({
      ...this.variantUtils,
      separator: this.config('separator', ':') as string,
      style: new Style(),
    });
    this._plugin.variants[name] = () => style;
    return style;
  }
}
