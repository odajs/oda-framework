/*
 * oda.js v3.0
 * (c) 2019-2020 R.A. Perepelkin
 * Under the MIT License.
 */


window.globalThis = window.globalThis || window;
'use strict';
if (!window.ODA) {

    window.addEventListener('mousedown', e => {
        if (e.use) return;
        e.use = true;
        ODA.mousePos = new DOMRect(e.pageX, e.pageY);
        if (window.parent !== window)
            window.parent.dispatchEvent(new MouseEvent('mousedown', e));
        let i = 0;
        let w;
        while (w = window[i]) {
            if (w) {
                const ev = new MouseEvent('mousedown', e);
                ev.use = true;
                w.dispatchEvent(ev);
            }
            i++;
        }
    }, true);

    // if ('serviceWorker' in navigator) {
    //     window.addEventListener('load', function() {
    //         navigator.serviceWorker.register(import.meta.url.replace('/oda.js', '/sw.js')).then(function(registration) {
    //             console.log('Service worker registered with scope: ', registration.scope);
    //         }, function(err) {
    //             console.log('ServiceWorker registration failed: ', err);
    //         });
    //     });
    // }


    const domParser = new DOMParser();
    const regExpApply = /(?:@apply\s+)(--[\w-]*\w+)+/g;
    const regExpParseRule = /([a-z\-]+)\s*:\s*((?:[^;]*url\(.*?\)[^;]*|[^;]*)*)\s*(?:;|$)/gi;
    function applyStyleMixins(styleText, styles) {
        let matches = styleText.match(regExpApply);
        if (matches) {
            matches = matches.map(m => m.replace(/@apply\s*/, ''));
            for (let v of matches) {
                const rule = styles[v];
                styleText = styleText.replace(new RegExp(`@apply\\s+${v}\\s*;?`, 'g'), rule);
            }
            if (styleText.match(regExpApply))
                styleText = applyStyleMixins(styleText, styles);
        }
        return styleText;
    }
    function getStylesMyxins(cssRule, styles = {}) {
        const style = cssRule.style;
        if (style) {
            Array.from(style).filter(s => s.startsWith('--')).forEach(s => {
                const css = getComputedStyle(document.documentElement).getPropertyValue(s);
                styles[s] = applyStyleMixins(css.replace(/{|}/g, '').trim(), ODA.style && ODA.style.styles || styles);
            });
        }
        return styles;
    }
    function cssRuleParse(rules, res, host = false) {
        for (let rule of rules) {
            if (rule.media) {
                let key = '@media ' + rule.media.mediaText;
                let r = res[key] = res[key] || {};
                cssRuleParse(rule.cssRules, r);
            }
            else if (rule.cssText) {
                if (rule.cssText.includes(':host') && !host) continue;
                const ss = rule.cssText.replace(rule.selectorText, '').match(regExpParseRule);
                if (!ss) continue;
                let sel = rule.selectorText.split(',').join(',\r');
                let r = res[sel] = res[sel] || [];
                r.add(...ss);
            }
        }
    }
    function isObject(obj) {
        return obj && typeof obj === 'object';
    }
    Object.__proto__.equal = function (a, b) {
        if (a === b) return true;
        if (!isObject(a) || !isObject(b)) return false;
        if (a.constructor !== Object || b.constructor !== Object) return Object.is(a, b);
        for (let key in Object.assign({}, a, b))
            if (!Object.equal(b[key], a[key])) return false;
        return true;
    };
    const regExImport = /import\s+?(?:(?:(?:[\w*\s{},]*)\s+from\s+?)|)(?<name>(?:".*?")|(?:'.*?'))[\s]*?(?:;|$|)/g;
    const regexUrl = /https?:\/\/(?:.+\/)[^:?#&]+/g

    async function ODA(prototype = {}, origin, context) {
        // if (typeof prototype.imports === 'string'){
        //     prototype.imports = prototype.imports.split(',')
        // }
        // if (Array.isArray(prototype.imports)){
        //     let idx =  ODA.$deferred.indexOf(prototype);
        //     await Promise.all(prototype.imports.map(async i=>{
        //         let path = i.trim();
        //         if (path.startsWith('@')){
        //             if (context && !path.startsWith('@oda'))
        //                 path = `/api/${context}/${path}`;
        //             else
        //                 path = `/${path}`
        //         }
        //         if (origin)
        //             path = origin + '/' + path;
        //         path = path.replace(/\/\//g, '/');
        //         console.log(path);
        //         const module = await import(path);

        //         while (ODA.$deferred.length>idx + 1){
        //             idx++;
        //             try {
        //                 await ODA.regComponent(ODA.$deferred[idx].is, origin, context);
        //             } catch (err) {
        //                 console.warn(ODA.$deferred[idx].is, err);
        //             }
        //         }
        //         return module;
        //     }));
        // }
        const matches = (new Error()).stack.match(regexUrl);
        prototype.url = prototype.url || matches[matches.length - 1];
        prototype.dir = prototype.url.substring(0, prototype.url.lastIndexOf('/')) + '/';
        prototype.extends = Array.isArray(prototype.extends) ? prototype.extends : prototype.extends?.split(',') || [];
        let list = ODA.telemetry.modules[prototype.url];
        if (!list) {
            ODA.telemetry.modules[prototype.url] = list = [];
        }

        list.add(prototype.is)
        ODA.getImports(prototype.url);
        function regComponent() {
            if (window.customElements.get(prototype.is) === undefined) {
                try {
                    let parents = prototype.extends.filter(i => {
                        i = i.trim();
                        return i === 'this' || i.includes('-');
                    });
                    parents = parents.map(ext => {
                        ext = ext.trim();
                        if (ext === 'this')
                            return ext;
                        const parent = ODA.telemetry.components[ext];
                        if (!parent)
                            throw new Error(`Not found inherit parent "${ext}"`);
                        // ODA.error(prototype.is,`not found inherit parent "${ext}"`);
                        return parent;
                    });
                    let template = prototype.template || '';
                    if (parents.length) {
                        let templateExt = '';
                        for (let parent of parents) {
                            if (parent === 'this') {
                                templateExt += template;
                                template = null;
                            }
                            else
                                templateExt += parent.prototype.template;
                        }
                        if (template)
                            templateExt += template;
                        template = templateExt;
                    }
                    const doc = domParser.parseFromString(`<template>${template || ''}</template>`, 'text/html');
                    template = doc.querySelector('template');
                    const namedSlots = template.content.querySelectorAll('slot[name]');
                    for (let slot of namedSlots) {
                        for (let ch of slot.children) {
                            if (ch.attributes['slot']) continue;
                            ch.setAttribute('slot', slot.name);
                        }
                    }
                    prototype.slots = Array.prototype.map.call(namedSlots, el => el.getAttribute('name'));
                    if (ODA.style) {
                        const styles = Array.prototype.filter.call(template.content.children, i => i.localName === 'style');
                        const rules = {};
                        for (let style of styles) {
                            const text = style.textContent;
                            style.textContent = applyStyleMixins(text, ODA.style.styles);
                            // *** for compatibility with devices from Apple
                            let txtContent = style.textContent.replace(/\}\}/g, ']]]]').replace(/\s\s+/g, ' ').split('}'),
                                arrHost = [];
                            txtContent.map(o => {
                                let s = o.replace(/]]]]/g, '}}').trim() + '}';
                                if (s.includes(':host')) arrHost.push({ cssText: s, selectorText: s.replace(/\{.+\}/, '').trim() });
                            })
                            // ***
                            document.head.appendChild(style);
                            if (style.sheet.cssRules.length && !/\{\{.*\}\}/g.test(style.textContent)) {
                                cssRuleParse(style.sheet.cssRules, rules);
                                if (arrHost.length > 0) cssRuleParse(arrHost, rules, true); // ***
                                style.remove();
                            }
                            else
                                template.content.insertBefore(style, template.content.firstElementChild);
                        }
                        let classes = [];
                        for (let el of template.content.querySelectorAll('[class]')) {
                            for (let cls of el.getAttribute('class').split(' ')) {
                                cls && classes.add(cls);
                            }
                        }
                        for (let i of classes) {
                            let map = ODA.style.styles['--' + i];
                            if (!map) continue;
                            i = i + ', ::slotted(.' + i + ')';
                            let r = rules['.' + i] = rules['.' + i] || [];
                            for (let s of map.split(';'))
                                s && r.add(s.trim() + ';')
                        }

                        let attributes = [];
                        for (let el of template.content.querySelectorAll('*')) {
                            for (let attr of el.attributes) {
                                attributes.add(attr.name.replace(/^\.?:+/g, ''));
                            }
                        }
                        for (let i of attributes) {
                            let map = ODA.style.styles['--' + i];
                            if (!map) continue;
                            i = '[' + i + '], ::slotted([' + i + '])';
                            let r = rules[i] = rules[i] || [];
                            for (let s of map.split(';'))
                                s && r.add(s.trim() + ';')
                        }
                        const keys = Object.keys(rules);
                        if (keys.length) {
                            const el = document.createElement('style');
                            el.textContent = keys.map(i => {
                                const rule = rules[i];
                                // i += ', ::slotted('+i+')';
                                if (Array.isArray(rule))
                                    return '\r' + i + '{\r\t' + rule.join('\r\t') + '\r}';
                                return '\r' + i + '{\r\t' + Object.keys(rule).map(i => {
                                    return i + '{\r\t\t' + rule[i].join('\r\t\t') + '\r\t}';
                                }).join('\r') + '\r}';
                            }).join('');
                            template.content.insertBefore(el, template.content.firstElementChild);
                        }
                    }
                    prototype.template = template.innerHTML.trim();
                    ODA.telemetry.components[prototype.is] = { prototype: prototype, count: 0, render: 0 };
                    convertPrototype(parents);
                    let options;
                    let el;
                    if (prototype.extends.length === 1 && !ODA.telemetry.components[prototype.extends[0]]) {
                        el = class extends Object.getPrototypeOf(document.createElement(prototype.extends[0])).constructor {
                            constructor() {
                                super();
                            }
                            connectedCallback() {
                                if (prototype.attached)
                                    prototype.attached.apply(this);
                            }
                            disconnectedCallback() {
                                if (prototype.detached)
                                    prototype.detached.apply(this);

                            }
                        };
                        options = { extends: prototype.extends[0] }
                    }
                    else
                        el = ComponentFactory();
                    window.customElements.define(prototype.is, el, options);
                    ODA.telemetry.last = prototype.is;
                    console.log(prototype.is, 'registered')
                }
                catch (e) {
                    console.error(prototype.is, e);
                }
            }
            else {
                // ODA.warn(prototype.is, 'component has already been registered');
            }
        }

        // const componentResizeObserver = window.ResizeObserver && new ResizeObserver(entries=>{
        //     for (const obs of entries){
        //         obs.target.fire('resize');
        //     }
        // });

        function observe(key, h) {
            core.observers[key] = core.observers[key] || [];
            core.observers[key].push(h);
        }
        const core = {
            cache: {},
            saveProps: {},
            slotRefs: {},
            slotted: [],
            reflects: [],
            observers: {},
            listeners: {},
            deps: {},
            prototype: prototype,
            node: { tag: '#document-fragment', id: 0, dirs: [] },
            data: {},
            io: new IntersectionObserver(entries => {
                for (let i = 0, entry, l = entries.length; i < l; i++) {
                    entry = entries[i];
                    if (!!entry.target.$sleep !== entry.isIntersecting) continue;
                    entry.target.$sleep = !entry.isIntersecting;
                    if (!entry.target.$sleep)
                        requestAnimationFrame(() => { entry.target.render.call(entry.target) });
                }
            }, { rootMargin: '20%' }),
            ro: new ResizeObserver(entries => {
                for (const obs of entries) {
                    if (!obs.target.__events || obs.target.__events.has('resize'))
                        obs.target.fire('resize');
                }
            })
        };
        function callHook(hook) {
            this.fire(hook);
            const h = prototype[hook];
            if (!h) return;
            h.call(this);
        }
        function ComponentFactory() {
            class odaComponent extends HTMLElement {
                constructor() {
                    super();
                    this.$core = Object.assign({}, core);
                    this.$core.slotted = [];
                    this.$core.slotRefs = {};
                    this.$core.events = {};
                    this.$core.cache = { observers: {} };
                    this.$core.debounces = new Map();
                    this.$core.renderer = render.bind(this);
                    this.$core.listeners = {};
                    this.properties = prototype.properties;
                    const data = deepCopy(core.data);
                    const defs = {};
                    for (let i in data) {
                        if (this[i]) {
                            // defs[i] = this[i];

                            data[i] = this[i];
                            delete this[i];
                        }

                        if (prototype.properties[i].freeze) continue;
                        data[i] = makeReactive.call(this, data[i]);
                    }
                    this.$core.data = makeReactive.call(this, data, prototype.properties);

                    this.$core.root = this.$core.shadowRoot = this.attachShadow({ mode: 'closed' });
                    callHook.call(this, 'created');
                    ODA.telemetry.components[prototype.is].count++;
                    ODA.telemetry.components.count++;
                    if (prototype.hostAttributes) {
                        for (let a in prototype.hostAttributes) {
                            let val = prototype.hostAttributes[a];
                            val = (val === '') ? true : (val === undefined ? false : val);
                            this.setProperty(a, val);
                        }
                    }

                    for (let a of Array.prototype.filter.call(this.attributes, attr => attr.name.includes('.'))) {
                        let val = a.value;
                        val = (val === '') ? true : (val === undefined ? false : val);
                        this.setProperty(a.name, val);
                    }
                    for (let i in defs) {
                        this[i] = defs[i];
                    }
                    if (this.$core.shadowRoot) {
                        this.$core.ro.observe(this);
                        // componentResizeObserver && componentResizeObserver.observe(this);
                        // window.addEventListener('resize', e =>{
                        //     this.fire('resize', e)
                        // });
                        this.render(true);
                        callHook.call(this, 'ready');
                    }
                }
                connectedCallback() {
                    for (const name of core.reflects)
                        funcToAttribute.call(this, name);
                    for (const key in this.$core.observers) {
                        for (const h of this.$core.observers[key])
                            h.call(this);
                    }
                    for (let event in prototype.listeners) {
                        this.$core.listeners[event] = (e) => {
                            prototype.listeners[event].call(this, e, e.detail);
                        };
                        this.addEventListener(event, this.$core.listeners[event]);
                    }
                    callHook.call(this, 'attached');
                }
                disconnectedCallback() {
                    for (let event in prototype.listeners) {
                        this.removeEventListener(event, this.$core.listeners[event]);
                        delete this.$core.listeners[event];
                    }

                    this._retractSlots();
                    callHook.call(this, 'detached');
                }
                get $$savePath() {
                    const key = this.$core.saveKey || this.saveKey
                    return this.localName + (key ? '.' + key : '');
                }
                static get observedAttributes() {
                    if (!prototype.observedAttributes) {
                        prototype.observedAttributes = Object.keys(prototype.properties).map(key => prototype.properties[key].attrName);
                        prototype.observedAttributes.add('slot');
                    }
                    return prototype.observedAttributes;
                }
                _retractSlots() {
                    this.$core.slotted.forEach(el => {
                        el.slotProxy?.parentNode?.replaceChild(el, el.slotProxy);
                        el._slotProxy = el.slotProxy;
                        el.slotProxy = undefined;

                    });
                    this.$core.slotted.splice(0, this.$core.slotted.length);
                }
                attributeChangedCallback(name, o, n) {
                    if (o === n) return;
                    const descriptor = this.properties[name.toCamelCase()];
                    if (Array.isArray(descriptor?.list) && !descriptor.list.includes(n)) {
                        return;
                    }
                    if (descriptor?.type === Boolean) {
                        n = (n === '') ? true : (((o === '' && n === undefined) || (n === 'false')) ? false : n);
                    }
                    if (name === 'slot' && n === '?') {
                        this._retractSlots();
                    }
                    this.$core.data[name.toCamelCase()] = n;
                }
                updateStyle(styles = {}) {
                    this.$core.style = Object.assign({}, this.$core.style, styles);
                    this.render();
                }
                notify(key, stop) {
                    const obs = this.$core.observers[key];
                    if (obs) {
                        for (let h of obs)
                            h.call(this, stop);
                    }
                    for (let dep of this.$core.deps[key] || [])
                        dep.call(this);

                    let root = this;
                    while (root && root.domHost)
                        root = root.domHost;
                    root.render();
                    // callHook.call(this, 'updated');
                }
                render(force) {
                    if (!force && (!this.$core.shadowRoot || this.$core.__inRender)) return;
                    this.$core.__inRender = true;
                    if (force)
                        render.call(this, force)
                    else
                        ODA.render(this.$core.renderer);
                    if (Object.keys(this.$core.saveProps).length) {
                        const savePath = this.$$savePath;
                        let save = {};
                        if (force) {
                            save = JSON.parse(localStorage.getItem(savePath));
                            if (isObject(save) && Object.keys(save).length > 0) {
                                for (let p in this.$core.saveProps) {
                                    this.$core.data[p] = save[p];
                                }
                            }
                        }
                        else {
                            for (let p in this.$core.saveProps) {
                                const val = this.$core.data[p];
                                let def = this.$core.saveProps[p];
                                if (typeof def === 'function')
                                    def = def();
                                if (Object.equal(val, def)) continue;
                                save[p] = val;
                            }
                            if (Object.keys(save).length)
                                localStorage.setItem(savePath, JSON.stringify(save));
                        }
                    }
                }
                get domHost() {
                    return this.$domHost;
                }
                resolveUrl(path) {
                    return prototype.$path + path;
                }
                fire(event, detail) {
                    event = new odaCustomEvent(event, { detail: { value: detail }, composed: true });
                    this.dispatchEvent(event);
                }
                listen(event = '', callback, props = { target: this, once: false, useCapture: false }) {
                    props.target = props.target || this;
                    if (typeof callback === 'string') {
                        callback = this.$core.events[callback] = this.$core.events[callback] || this[callback].bind(this);
                    }
                    event.split(',').forEach(i => {
                        props.target.addEventListener(i.trim(), callback, props.useCapture);
                        if (props.once) {
                            const once = () => {
                                props.target.removeEventListener(i.trim(), callback, props.useCapture)
                                props.target.removeEventListener(i.trim(), once)
                            }
                            props.target.addEventListener(i.trim(), once)
                        }
                    });
                }
                get $dirInfo() {
                    return ODA.getDirInfo(this.$dir);
                }
                unlisten(event = '', callback, props = { target: this, useCapture: false }) {
                    props.target = props.target || this;
                    if (props.target) {
                        if (typeof callback === 'string')
                            callback = this.$core.events[callback];
                        if (callback) {
                            event.split(',').forEach(i => {
                                props.target.removeEventListener(i.trim(), callback, props.useCapture)
                            });
                        }
                    }
                }
                create(tagName, props = {}, inner) {
                    const el = document.createElement(tagName);
                    for (let p in props)
                        el[p] = props[p];
                    if (inner) {
                        if (inner instanceof HTMLElement)
                            el.appendChild(inner);
                        else
                            el.textContent = inner;
                    }
                    return el;
                }
                clearSaves() {
                    globalThis.localStorage.removeItem(this.$$savePath);
                }
                debounce(key, handler, delay = 0) {
                    let db = this.$core.debounces.get(key);
                    if (db)
                        delay ? clearTimeout(db) : cancelAnimationFrame(db);
                    const fn = delay ? setTimeout : requestAnimationFrame;
                    const t = fn(() => {
                        this.$core.debounces.delete(key);
                        handler.call(this);
                    }, delay);
                    this.$core.debounces.set(key, t)
                }
                get $() {
                    return this.$refs;
                }
                get $url() {
                    return prototype.url;
                }
                get $dir() {
                    return prototype.dir;
                }
                get $$parents() {
                    return prototype.parents.map(i => i.prototype.is);
                }
                get $$imports() {
                    return ODA.telemetry.imports[prototype.url];
                }
                get $$modules() {
                    return ODA.telemetry.modules[this.$url].filter(i => i !== prototype.is)
                }
                get $refs() {
                    if (!this.$core.refs || Object.keys(this.$core.refs).length === 0) {
                        this.$core.refs = Object.assign({}, this.$core.slotRefs);
                        let els = [...this.$core.shadowRoot.querySelectorAll('*'), ...this.querySelectorAll('*')];
                        els = Array.prototype.filter.call(els, i => i.$ref);
                        for (let el of els) {
                            let ref = el.$ref;
                            let arr = this.$core.refs[ref];
                            if (Array.isArray(arr))
                                arr.push(el);
                            else if (el.$for)
                                this.$core.refs[ref] = [el];
                            else
                                this.$core.refs[ref] = el;
                        }

                    }
                    return this.$core.refs;
                }
                async(handler, delay = 0) {
                    delay ? setTimeout(handler, delay) : requestAnimationFrame(handler)
                }
                __read(path, def) {
                    this.setting = this.setting || JSON.parse(localStorage.getItem(prototype.is));
                    if (typeof this.setting !== 'object')
                        this.setting = {};
                    path = path.split('/');
                    let s = this.setting;
                    while (path.length && s) {
                        s = s[path.shift()];
                    }
                    return s || def;
                }
                __write(path, value) {
                    this.setting = this.setting || JSON.parse(localStorage.getItem(prototype.is));
                    if (this.setting === null)
                        this.setting = {};
                    path = path.split('/');
                    let s = this.setting;
                    if (s) {
                        while (path.length > 1) {
                            const p = path.shift();
                            s = s[p] = typeof s[p] === 'object' ? s[p] : {};
                        }
                        s[path.shift()] = value;
                        localStorage.setItem(prototype.is, JSON.stringify(this.setting));
                    }
                }
                $super(parentName, name, ...args) {
                    //
                    // let id = ODA.telemetry[this.$parent.$options.name].prototype.extends;
                    // while (id) {
                    //     const p = ODA.telemetry[id].prototype;
                    //     const methods = p.methods[name] || p[name];
                    //     if (typeof methods === 'function')
                    //         return methods.call(this, ...args);
                    //     id = p.extends;
                    // }
                    const components = ODA.telemetry.components;

                    if (parentName && components[parentName]) {
                        const proto = components[parentName].prototype;
                        const method = proto[name];
                        if (typeof method === 'function') return method.call(this, ...args);
                    }

                    const getIds = (p) => {
                        const res = [];
                        let id = p.extends;
                        if (id) {
                            const ids = id.split(/, */).filter(i => i !== 'this');
                            for (const id of ids) {
                                res.push(id);
                                res.push(...getIds(components[id].prototype));
                            }
                        }
                        return res;
                    };
                    const curId = prototype.is;
                    const curMethod = components[curId].prototype.methods[name] || components[curId].prototype[name];
                    const ids = getIds(components[curId].prototype);
                    for (const id of ids) {
                        const proto = components[id].prototype;
                        const method = proto.methods[name] || proto[name];
                        if (curMethod !== method && typeof method === 'function') {
                            return method.call(this, ...args);
                        }
                    }
                    throw new Error(`Not found super method: "${name}" `);
                };
            }

            for (let name in prototype.properties) {
                const prop = prototype.properties[name];
                if (prop.save) {
                    core.saveProps[name] = prop.default;
                }
                prop.name = name;
                Object.defineProperty(odaComponent.prototype, name, {
                    enumerable: true,
                    set(v) {
                        this.$core.data[name] = v;
                    },
                    get() {
                        return this.$core.data[name];
                    }
                });
                prop.attrName = prop.attrName || name.toKebabCase();
                if (prop.computed) {
                    observe(name, function clearComputedValue(stop) {
                        if (stop) return;
                        this.$core.data[name] = undefined;
                    });
                }
                if (prop.reflectToAttribute) {
                    observe(name, function reflectToAttribute() {
                        funcToAttribute.call(this, name);
                    });
                    core.reflects.add(name);
                }
                let val = prop.default;
                if (typeof val === "function")
                    val = val.call(this);
                if (val && val.then)
                    val.then(core.data[name]);
                else
                    core.data[name] = val;
            }
            core.node.children = prototype.template ? parseJSX(prototype, prototype.template) : [];
            let cnt = 0;
            for (let func of prototype.observers) {
                const obsId = ++cnt;
                let expr;
                if (typeof func === 'function') {
                    expr = func.toString();
                    expr = expr.substring(0, expr.indexOf('{')).replace('async', '').replace('function', '').replace(func.name, '');
                }
                else {
                    expr = func.substring(func.indexOf('('));
                }
                expr = expr.replace('(', '').replace(')', '').trim();
                const dd = Object.keys(core.data);
                const vars = expr.split(',').map(prop => {
                    prop = prop.trim();
                    const idx = dd.indexOf(prop);
                    if (idx < 0)
                        ODA.error(prototype.is, `No found propety by name "${prop} for observer ${func.toString()}"`);
                    return { prop, arg: 'v' + idx };
                });
                if (typeof func === 'string') {
                    const args = vars.map(i => {
                        const idx = func.indexOf('(');
                        func = func.slice(0, idx) + func.slice(idx).replace(i.prop, i.arg);
                        return i.arg;
                    }).join(',');
                    func = createFunc(args, func, prototype);
                }
                function funcObserver() {
                    const params = vars.map(v => {
                        return this.$core.data[v.prop];
                    });
                    if (params.includes(undefined)) return;
                    const old = this.$core.cache.observers[obsId] || [];
                    let  r = params.map((i, idx)=>{
                        if (old[idx] === undefined)
                            return false;

                        return old[idx] === i// || (old[idx] && i && old[idx].__op__ === i.__op__);
                    });
                    r = r.indexOf(false);
                    if (r < 0) return;
                    this.$core.cache.observers[obsId] = params;
                    func.call(this, ...params);
                }
                for (const v of vars)
                    observe(v.prop, funcObserver);
            }
            Object.getOwnPropertyNames(prototype).forEach(name => {
                const d = getDescriptor(prototype, name);
                if (typeof d.value === 'function') {
                    odaComponent.prototype[name] = function (...args) {
                        return d.value.call(this, ...args);
                    }
                }
            });
            Object.defineProperty(odaComponent, 'name', {
                writable: false,
                value: prototype.is
            });
            return odaComponent
        }

        function convertPrototype(parents) {
            prototype.parents = parents;
            prototype.properties = prototype.properties || prototype.props || {};
            prototype.observers = prototype.observers || [];
            for (let key in prototype.properties) {
                let prop = prototype.properties[key];
                let computed = prop && (prop.computed || prop.get || (typeof prop === 'function' && !prop.prototype && prop));
                if (computed) {
                    if (typeof prop === 'function')
                        prototype.properties[key] = prop = {};
                    if (typeof computed === 'string')
                        computed = prototype[computed];
                    delete prop.get;
                    prop.computed = computed;
                }
                let watch = prop && (prop.watch || prop.set || prop.observe);
                if (watch) {
                    if (typeof watch === 'string')
                        watch = prototype[watch];
                    delete prop.set;
                    delete prop.observe;
                    prop.watch = watch;
                }
                if (typeof prop === "function") {
                    prop = { type: prop };
                    prototype.properties[key] = prop;
                }
                else if (Array.isArray(prop)) {
                    const array = [].concat(prop);
                    prop = prototype.properties[key] = {
                        default() {
                            return [].concat(array);
                        }, type: Array
                    };
                }
                else if (typeof prop !== "object") {
                    prop = prototype.properties[key] = { default: prop, type: prop.__proto__.constructor };
                }
                else if (prop === null) {
                    prop = prototype.properties[key] = { type: Object, default: null };
                }
                else if (Object.keys(prop).length === 0 || (!computed && !watch && prop.default === undefined && !prop.type && !('shared' in prop))) {
                    const n = Object.assign({}, prop);
                    prop = prototype.properties[key] = { type: Object, default() { return n } };
                }
                if (prop.shared) {
                    prototype.$shared = prototype.$shared || [];
                    prototype.$shared.add(key)
                }

                prop.default = (prop.default === undefined) ? (prop.value || prop.def) : prop.default;
                delete prop.value;
                if (prop.default !== undefined && typeof prop.default !== 'function') {
                    switch (prop.type) {
                        case undefined: {
                            if (Array.isArray(prop.default)) {
                                const array = [].concat(prop.default);
                                prop.default = function () { return [].concat(array) };
                                prop.type = Array;
                            }
                            else if (isNativeObject(prop.default)) {
                                const obj = Object.assign({}, prop.default);
                                prop.default = function () { return Object.assign({}, obj) };
                                prop.type = Object;
                            }
                            else if (prop.default === null)
                                prop.type = Object;
                            else {
                                prop.type = prop.default.__proto__.constructor;
                            }

                        } break;
                        case Object: {
                            if (prop.default) {
                                const obj = Object.assign({}, prop.default);
                                prop.default = function () { return Object.assign({}, obj) };
                            }
                        } break;
                        case Array: {
                            const array = Array.from(prop.default);
                            prop.default = function () { return Array.from(array) };
                        } break;
                    }
                }
            }

            prototype.listeners = prototype.listeners || {};
            if (prototype.keyBindings) {
                prototype.listeners.keydown = function (e) {
                    const e_key = e.key.toLowerCase();
                    const e_code = e.code.toLowerCase();
                    const key = Object.keys(prototype.keyBindings).find(key => {
                        return key.toLowerCase().split(',').some(v => {
                            return v.split('+').every(s => {
                                if (!s) return false;
                                const k = s.trim() || ' ';
                                switch (k) {
                                    case 'ctrl':
                                        return e.ctrlKey;
                                    case 'shift':
                                        return e.shiftKey;
                                    case 'alt':
                                        return e.altKey;
                                    default:
                                        return k === e_key || k === e_code || `key${k}` === e_code;
                                }
                            })
                        });
                    });
                    if (key) {
                        e.preventDefault();
                        let handler = prototype.keyBindings[key];
                        if (typeof handler === 'string')
                            handler = prototype[handler];
                        handler.call(this, e);
                    }
                }
            }
            for (let event in prototype.listeners) {
                const handler = prototype.listeners[event];
                prototype.listeners[event] = (typeof handler === 'string') ? prototype[handler] : handler;
            }

            parents.forEach(parent => {
                if (typeof parent === 'object') {
                    if (parent.prototype.$shared) {
                        prototype.$shared = prototype.$shared || [];
                        prototype.$shared.add(...parent.prototype.$shared)
                    }
                    for (let key in parent.prototype.properties) {
                        let p = parent.prototype.properties[key];
                        let me = prototype.properties[key];
                        if (!me) {
                            p = Object.assign({}, p);
                            p.extends = parent.prototype.is;
                            prototype.properties[key] = p;
                        }
                        else {
                            for (let k in p) {
                                if (!me[k]) {
                                    me[k] = p[k];
                                }
                                else if (k === 'type' && p[k] && me[k] !== p[k]) {
                                    const _types = new Set([...(Array.isArray(me[k]) ? me[k] : [me[k]]), ...(Array.isArray(p[k]) ? p[k] : [p[k]])]);
                                    me[k] = [..._types];
                                }
                            }
                            if (!me.extends)
                                me.extends = parent.prototype.is;
                            else
                                me.extends = me.extends + ', ' + parent.prototype.is;
                        }
                    }
                    for (let key in parent.prototype.listeners) {
                        if (!getDescriptor(prototype.listeners, key)) {
                            const par = getDescriptor(parent.prototype.listeners, key);
                            prototype.listeners[key] = par.value;
                        }
                    }
                    parent.prototype.observers.forEach(func => {
                        let name;
                        if (typeof func === 'function') {
                            name = func.name;
                        }
                        else {
                            name = func.split(' ')[0]
                        }
                        const f = prototype.observers.find(func => {
                            if (typeof func === 'function') {
                                return name === func.name;
                            }
                            else {
                                return func.startsWith(name);
                            }
                        });
                        if (!f) {
                            prototype.observers.push(func);
                        }
                    });
                    for (let key in parent.prototype) {
                        const p = getDescriptor(parent.prototype, key);
                        const self = getDescriptor(prototype, key);
                        if (typeof p.value === 'function') {
                            if (!self) {
                                prototype[key] = function (...args) {
                                    return p.value.call(this, ...args);
                                }
                            }
                            else if (hooks.includes(key)) {
                                prototype[key] = function () {
                                    p.value.apply(this);
                                    if (self)
                                        self.value.apply(this);
                                }
                            }
                        }
                    }
                }
            });
        }

        if (document.frameworkIsReady)
            regComponent(prototype);
        else {
            const handler = () => {
                document.removeEventListener('framework-ready', handler);
                regComponent(prototype);
            };
            document.addEventListener('framework-ready', handler)
        }
        return prototype;
    };


    // ODA.$deferred = {};

    // ODA.regComponent = async function (id, origin, context) {
    //     if (window.customElements.get(id)) return;
    //     if (!(id in ODA.$deferred))
    //         throw new Error(`Prototype ${id} not found!`);
    //     await ODA.$deferred[id].load(origin, context);
    //     // const prototype = ODA.$deferred.find(p=>p.is === id);
    //     // if (!prototype)
    //     //     throw new Error(`Prototype ${id} not found!`);
    //     // await ODA(ODA.$deferred[id].prototype, origin, context);
    // }

    ODA.isLocal = document.location.hostname === 'localhost';
    ODA.$url = import.meta.url;
    ODA.$dir = ODA.$url.substring(0, ODA.$url.lastIndexOf('/'));
    // import (ODA.$dir+"/tools/algorithms/search/levenshtein/levenshtein.js").then(res=>{
    //     ODA.levenstein = res;
    // })
    const getDescriptor = Object.getOwnPropertyDescriptor;
    window.ODA = ODA;

    try {
        ODA.rootPath = import.meta;
        ODA.rootPath = ODA.rootPath.url.replace('/oda.js', '');
    } catch (e) {
        console.error(e);
    }

    function signals(prop, value, old) {
        if (this.$node && this.$node.bind && this.$node.bind[prop.name] && (prop.notify || this.$node.listeners[prop.attrName + "-changed"]))
            this.dispatchEvent(new CustomEvent(prop.attrName + '-changed', { detail: { value, src: this }, bubbles: true, cancelable: true }));
        if (prop.watch)
            prop.watch.call(this, value, old);
    }

    function makeReactive(obj, props, old) {
        if (!isObject(obj)) return obj;
        let d = obj.__op__;
        let hosts = d && d.hosts;
        if (hosts) {
            const val = hosts.get(this);
            if (val) {
                if (val === obj || (Array.isArray(obj) && val.length))
                    return val;
                return obj;
            }
            obj.__op__.obj = obj;
            //obj = obj.__op__.obj || obj;
        }
        else {
            if (Array.isArray(obj)) {
                for (let i = 0, l = obj.length; i < l; i++) {
                    obj[i] = makeReactive.call(this, obj[i]);
                }
            }
            else if (!isNativeObject(obj)) return obj;
            // console.dir(obj)
        }
        const handlers = {
            get: (target, key) => {
                let val = target[key];
                if (val && (typeof val === 'function' || typeof key === 'symbol' || (Array.isArray(target) && !/\d+/.test(key)) || /^__/.test(key)))
                    return val;
                if (this.$core.target && !Array.isArray(target) && this.$core.target !== key) {
                    let deps = this.$core.deps[key];
                    if (!deps)
                        deps = this.$core.deps[key] = this.$core.observers[this.$core.target] || [];
                    else {
                        for (let h of this.$core.observers[this.$core.target] || [])
                            deps.add(h)
                    }
                }
                const prop = props && props[key];
                if (prop) {
                    if (prop.computed) {
                        if (prop.reactive || !val || this.$core.deps[key] === undefined) {

                            const before = this.$core.target;
                            this.$core.target = key;
                            let nval = prop.computed.call(this);
                            if (!prop.freeze)
                                nval = makeReactive.call(this, nval);
                            this.$core.deps[key] = this.$core.deps[key] || [];
                            this.$core.target = before;
                            if (nval !== val) {
                                val = target[key] = nval;
                                for (let host of target.__op__.hosts.keys()) {
                                    prop && signals.call(host, prop, val);
                                }
                            }
                        }
                        return val;
                    }
                    else if (prop.freeze) {
                        return val;
                    }
                }
                return val && makeReactive.call(this, val);
            },
            set: (target, key, value) => {
                let prop = props && props[key];
                if (value !== undefined && prop) {
                    if (prop.type === Boolean)
                        value = (value === 'true') || !!value;
                    else if (prop.type === Number)
                        value = +value;
                }
                const old = target[key];
                if (old === value) return true;
                if (value && (!prop || !prop.freeze)) {
                    value = makeReactive.call(this, value, undefined, old);
                    if (old === value) return true;
                }
                target[key] = value;
                for (let map of target.__op__.hosts) {
                    const host = map[0];
                    const val = map[1];
                    host.notify(key/*, value === undefined*/);
                    prop && signals.call(host, prop, value, old);
                }
                return true;
            }
        };

        const proxy = new Proxy(obj, handlers);
        if (!hosts) {
            const options = (old && old.__op__) || { proxy, main: this, obj, self: {} };
            options.hosts = new Map();
            Object.defineProperty(obj, '__op__', {
                enumerable: false,
                configurable: true,
                value: options
            });
        }
        obj.__op__ && obj.__op__.hosts.set(this, proxy);
        return proxy;
    }
    function funcToAttribute(name) {
        const val = this.$core.data[name];
        name = name.toKebabCase();
        if (val === false || val === undefined || val === null || val === '')
            this.removeAttribute(name);
        else
            this.setAttribute(name, val === true ? '' : val);
    }
    let sid = 0;
    class VNode {
        constructor(el, vars) {
            this.cache = {};
            this.id = ++sid;
            this.vars = vars;
            el.$node = this;
            this.el = el;
            this.tag = el.nodeName;
            this.fn = {};
            this.children = [];
            if (el.nodeName === 'svg' || (el.parentNode && el.parentNode.$node && el.parentNode.$node.svg))
                this.svg = true;
            this.listeners = {};
        }
        setCache(el) {
            this.cache[el.nodeName] = this.cache[el.nodeName] || [];
            this.cache[el.nodeName].add(el);
        }
        getCache(tag) {
            return (this.cache[tag] || []).shift()
        }
        set textContent(v) {
            this._textContent = v;
        }
        get textContent() {
            if (!this.translate)
                return this._textContent;
            return ODA.translate(this._textContent);
        }
        set translate(v) {
            this._translate = v;
        }
        get translate() {
            return this._translate !== false;
        }
    }

    function exprOptionalConverter(expr) {
        const matches = expr.match(reDotQ).filter(i => i);
        for (let str of matches) {
            const m1 = str.match(reDotQ1);
            let step = '', res = '';
            for (let str1 of m1) {
                const v = str1.replace('?', '');
                step += v;
                res += (res ? ' && ' : '') + step;
            }
            expr = expr.replace(str, '(' + res + ')');
        }
        return expr;
    }
    const dirRE = /^((oda|[a-z])?-)|~/;
    const reDotQ = /(\b\w+\?)((\..?\w+|\[.+?\]|\(.+?\)(?=\s))\??)+/g;
    //const reDotQ1 = /(\[.+?\](\?(?=(\.|\[)))?)|\.?\b\w+(\?(?=(\.|\[)))?/g;
    const reDotQ1 = /(\[.+?\](\?(?=(\.|\[)))?)|\.?\$*\b\w+(\?(?=(\.|\[)))?/g;
    function parseJSX(prototype, el, vars = []) {
        if (typeof el === 'string') {
            let tmp = document.createElement('template');
            tmp.innerHTML = el;
            tmp = tmp.content.childNodes;
            return Array.prototype.map.call(tmp, el => parseJSX(prototype, el)).filter(i => i);
        }
        let src = new VNode(el, vars);
        if (el.nodeType === 3) {
            let value = el.textContent.trim();
            if (!value) return;
            src.translate = (el.parentElement && (el.parentElement.nodeName === 'STYLE' || el.parentElement.getAttribute('is') === 'style')) ? false : true;
            if (/\{\{((?:.|\n)+?)\}\}/g.test(value)) {
                let expr = value.replace(/^|$/g, "'").replace(/{{/g, "'+(").replace(/}}/g, ")+'").replace(/\n/g, "\\n").replace(/\+\'\'/g, "").replace(/\'\'\+/g, "");
                if (prototype[expr])
                    expr += '()';
                const fn = createFunc(vars.join(','), expr, prototype);
                src.text = src.text || [];
                src.text.push(function textContent($el) {
                    let value = exec.call(this, fn, $el.$for);
                    if ($el._text === value) return;
                    $el._text = value;
                    $el.nodeValue = src.translate ? ODA.translate(value, src.language) : value;
                });
            }
            else
                src.textContent = value;
        }
        else if (el.nodeType === 8) {
            src.textContent = el.textContent;
        }
        else {
            for (const attr of el.attributes) {
                let name = attr.name;
                let expr = attr.value;
                let modifiers;
                if (prototype[expr])
                    expr += '()';
                else if (reDotQ.test(expr)) {
                    expr = exprOptionalConverter(expr);
                }
                if (/^(:|bind:)/.test(attr.name)) {
                    name = name.replace(/^(::?|:|bind::?)/g, '');
                    if (tags[name])
                        new Tags(src, name, expr, vars);
                    else if (directives[name])
                        new Directive(src, name, expr, vars);
                    else if (name === 'for')
                        return forDirective(prototype, src, name, expr, vars, attr.name);
                    else {
                        if (expr === '')
                            expr = attr.name.replace(/:+/, '').toCamelCase();
                        let fn = createFunc(vars.join(','), expr, prototype);
                        if (/::/.test(attr.name)) {
                            const params = ['$value', ...(vars || [])];
                            src.listeners.input = function func2wayInput(e) {
                                if (!e.target.parentNode) return;
                                let value = e.target.value;
                                const target = e.target;
                                switch (e.target.type) {
                                    case 'checkbox': {
                                        value = e.target.checked;
                                    }
                                }
                                target.__lockBind = name;
                                const handle = () => {
                                    target.__lockBind = false;
                                    target.removeEventListener('blur', handle);
                                };
                                target.addEventListener('blur', handle);
                                target.dispatchEvent(new CustomEvent(name + '-changed', { detail: { value } }));
                            };
                            const func = new Function(params.join(','), `with (this) {${expr} = $value}`);
                            src.listeners[name + '-changed'] = function func2wayBind(e, d) {
                                if (!e.target.parentNode) return;
                                let res = e.detail.value === undefined ? e.target[name] : e.detail.value;
                                if (e.target.$node.vars.length) {
                                    let idx = e.target.$node.vars.indexOf(expr);
                                    if (idx % 2 === 0) {
                                        const array = e.target.$for[idx + 2];
                                        const index = e.target.$for[idx + 1];
                                        array[index] = e.target[name];
                                        return;
                                    }
                                }
                                exec.call(this, func, [res, ...(e.target.$for || [])]);
                            };
                            src.listeners[name + '-changed'].notify = name;
                        }
                        const h = function (params) {
                            return exec.call(this, fn, params);
                        };
                        h.modifiers = modifiers;
                        src.bind = src.bind || {};
                        src.bind[name.toCamelCase()] = h;
                    }
                }
                else if (dirRE.test(name)) {
                    name = name.replace(dirRE, '');
                    if (name === 'for')
                        return forDirective(prototype, src, name, expr, vars, attr.name);
                    else if (tags[name])
                        new Tags(src, name, expr, vars);
                    else if (directives[name])
                        new Directive(src, name, expr, vars);
                    else
                        throw new Error('Unknown directive ' + attr.name);
                }
                else if (/^@/.test(attr.name)) {
                    modifiers = parseModifiers(name);
                    if (modifiers)
                        name = name.replace(modifierRE, '');
                    if (prototype[attr.value])
                        expr = attr.value + '($event, $detail)';
                    name = name.replace(/^@/g, '');
                    const params = ['$event', '$detail', ...(vars || [])];
                    const fn = new Function(params.join(','), `with (this) {${expr}}`);
                    src.listeners = src.listeners || {};
                    const handler = prototype[expr];
                    src.listeners[name] = function (e) {
                        modifiers && modifiers.stop && e.stopPropagation();
                        modifiers && modifiers.prevent && e.preventDefault();
                        modifiers && modifiers.immediate && e.stopImmediatePropagation();
                        if (typeof handler === 'function')
                            handler.call(this, e, e.detail);
                        else
                            exec.call(this, fn, [e, e.detail, ...(e.target.$for || [])]);
                    };
                }
                else if (name === 'is')
                    src.tag = expr.toUpperCase();
                else if (name === 'ref') {
                    new Directive(src, name, "\'" + expr + "\'", vars);
                }
                else {
                    src.attrs = src.attrs || {};
                    src.attrs[name] = expr;
                }

            }
            if (src.attrs && src.dirs) {
                for (const a of Object.keys(src.attrs)) {
                    if (src.dirs.find(f => f.name === a)) {
                        src.vals = src.vals || {};
                        src.vals[a] = src.attrs[a];
                        delete src.attrs[a];
                    }
                }
            }
            if (prototype.$shared && src.tag !== 'STYLE') {
                for (let key of prototype.$shared) {
                    if (!src.bind || !src.bind[key]) {
                        src.bind = src.bind || {};
                        let fn = createFunc(vars.join(','), key, prototype);
                        src.bind[key] = function (params, $el) {
                            const result = exec.call(this, fn, params);
                            return result === undefined ? $el[key] : result;
                        };
                    }
                }
            }
            src.children = Array.from(el.childNodes).map(el => {
                return parseJSX(prototype, el, vars)
            }).filter(i => i);
        }
        return src;
    }
    const tags = {
        if(tag, fn, p, $el) {
            let t = exec.call(this, fn, p);
            return t ? tag : '#comment';
        },
        'else-if'(tag, fn, p, $el) {
            if (!$el || ($el.previousElementSibling && $el.previousElementSibling.nodeType === 1))
                return '#comment';
            return exec.call(this, fn, p) ? tag : '#comment';
        },
        else(tag, fn, p, $el) {
            if (!$el || ($el.previousElementSibling && $el.previousElementSibling.nodeType === 1))
                return '#comment';
            return tag;
        },
        is(tag, fn, p) {
            if (tag.startsWith('#'))
                return tag;
            return (exec.call(this, fn, p) || '').toUpperCase() || tag;
        }
    };
    const directives = {
        wake($el, fn, p) {
            const key = exec.call(this, fn, p);
            $el.$wake = key;
        },
        'save-key'($el, fn, p) {
            if ($el.$core) {
                const key = exec.call(this, fn, p);
                if ($el.$core.saveKey === key) return;
                $el.$core.saveKey = key;
                $el.render(true);
            }
        },
        props($el, fn, p) {
            const props = exec.call(this, fn, p);
            for (let i in props) {
                $el.setProperty(i, props[i]);
            }
        },
        ref($el, fn, p) {
            const ref = exec.call(this, fn, p);
            if ($el.$ref === ref) return;
            $el.$ref = ref;
            this.$core.$refs = null;
        },
        show($el, fn, p) {
            $el.style.display = exec.call(this, fn, p) ? '' : 'none';
        },
        html($el, fn, p) {
            const html = exec.call(this, fn, p) || '';
            if ($el.$cache.innerHTML === html) return;
            $el.innerHTML = $el.$cache.innerHTML = html;
        },
        text($el, fn, p) {
            let val = exec.call(this, fn, p);
            if (val === undefined)
                val = '';
            if ($el.$cache.textContent === val) return;
            $el.$cache.textContent = val;
            $el.textContent = ODA.translate(val, $el.language);
        },
        class($el, fn, p) {
            let s = exec.call(this, fn, p) || '';
            if (Array.isArray(s))
                s = s[0];
            if (!Object.equal($el.$class, s)) {
                $el.$class = s;
                if (typeof s === 'object')
                    s = Object.keys(s).filter(i => s[i]).join(' ');
                if ($el.$node.vals && $el.$node.vals.class)
                    s = (s ? (s + ' ') : '') + $el.$node.vals.class;
                $el.setAttribute('class', s);
            }
        },
        style($el, fn, p) {
            let s = exec.call(this, fn, p) || '';
            if (!Object.equal($el.$style, s)) {
                $el.$style = s;
                if (Array.isArray(s))
                    s = s.join('; ');
                else if (isObject(s))
                    s = Object.keys(s).filter(i => s[i]).map(i => i.toKebabCase() + ': ' + s[i]).join('; ');
                if ($el.$node.vals && $el.$node.vals.style)
                    s = $el.$node.vals.style + (s ? ('; ' + s) : '');
                $el.setAttribute('style', s);
            }
        }
    };
    class Directive {
        constructor(src, name, expr, vars) {
            expr = expr || 'true';
            src.fn[name] = createFunc(vars.join(','), expr);
            src.fn[name].expr = expr;
            src.dirs = src.dirs || [];
            src.dirs.push(directives[name])
        }
    }
    class Tags {
        constructor(src, name, expr, vars) {
            src.fn[name] = expr ? createFunc(vars.join(','), expr) : null;
            src.tags = src.tags || [];
            src.tags.push(tags[name])
        }
    }
    function forDirective(prototype, src, name, expr, vars, attrName) {
        const newVars = expr.replace(/\s(in|of)\s/, '\n').split('\n');
        expr = newVars.pop();
        const params = (newVars.shift() || '').replace('(', '').replace(')', '').split(',');
        forVars.forEach((varName, i) => {
            let p = (params[i] || forVars[i]).trim();
            let pp = p;
            let idx = 1;
            while (vars.find(v => p === v)) {
                p = pp + idx; ++idx;
            }
            newVars.push(p);
        });
        src.vars = [...vars];
        src.vars.push(...newVars);
        src.el.removeAttribute(attrName);
        const child = parseJSX(prototype, src.el, src.vars);
        const fn = createFunc(src.vars.join(','), expr);
        const h = function (p = []) {
            let items = exec.call(this, fn, p);
            if (!Array.isArray(items)) {
                items = new Array(+items || 0);
                for (let i = 0; i < items.length; items[i++] = i);
            }
            return items.map((item, i) => {
                return { child, params: [...p, item, i, items] }
            })
        };
        h.src = child;
        return h;
    }

    function createElement(src, tag, old) {
        let $el;// = src.getCache(tag);
        if (!$el) {
            if (tag === '#comment')
                $el = document.createComment((src.textContent || src.id) + (old ? (': ' + old.tagName) : ''));
            else if (tag === '#text')
                $el = document.createTextNode(src.textContent || '');

            else {
                if (src.svg)
                    $el = document.createElementNS(svgNS, tag.toLowerCase());
                else
                    $el = document.createElement(tag);
                if (tag !== 'STYLE') {
                    this.$core.ro.observe($el);
                    // componentResizeObserver && componentResizeObserver.observe($el);
                    this.$core.io.observe($el);
                }
                if (src.attrs)
                    for (let i in src.attrs)
                        $el.setAttribute(i, src.attrs[i]);

            }
            $el.$cache = {};
            $el.$node = src;
            $el.$domHost = this;
            for (const e in src.listeners || {}) {
                const event = (ev) => {
                    src.listeners[e].call(this, ev);
                }
                $el.addEventListener(e, event);
            }

        }
        else if ($el.nodeType === 1) {
            for (let i of $el.attributes) {
                $el.removeAttribute(i.name);
            }
        }
        this.$core.refs = null;
        return $el;
    }
    function render() {
        updateDom.call(this, this.$core.node, this.$core.shadowRoot);
        this.$core.__inRender = false;
    }
    function updateDom(src, $el, $parent, pars) {
        if ($parent) {
            let tag = src.tag;
            if (src.tags) {
                for (let h of src.tags)
                    tag = h.call(this, tag, src.fn[h.name], pars, $el);
            }
            if (!$el) {
                $el = createElement.call(this, src, tag);
                $parent.appendChild($el);
            }
            else if ($el.$node && $el.$node.id !== src.id) {
                const el = createElement.call(this, src, tag);
                $parent.replaceChild(el, $el);
                $el = el;
            }
            else if ($el.slotTarget) {
                $el = $el.slotTarget;
            }
            else if ($el.nodeName !== tag) {
                const el = createElement.call(this, src, tag, $el);
                $parent.replaceChild(el, $el);
                el.$ref = $el.$ref;
                $el = el;
            }
        }
        $el.$wake = $el.$wake || this.$wake;
        $el.$for = pars;

        if ($el.children && src.children.length && (!$el.$sleep || $el.$wake || src.svg || $el.localName === 'slot')) {
            for (let i = 0, idx = 0, l = src.children.length; i < l; i++) {
                let h = src.children[i];
                if (typeof h === "function") {
                    for (const node of h.call(this, pars)) {
                        updateDom.call(this, node.child, $el.childNodes[idx], $el, node.params);
                        idx++;
                    }
                    let el = $el.childNodes[idx];
                    while (el && el.$node === h.src) {
                        el.remove();
                        el = $el.childNodes[idx];
                    }
                }
                else {
                    let el = $el.childNodes[idx];
                    updateDom.call(this, h, el, $el, pars);
                    idx++;
                }
            }
        }
        if ($el.nodeType !== 1) {
            for (let h of src.text || [])
                h.call(this, $el);
            return;
        }
        if (src.dirs)
            for (let h of src.dirs)
                h.call(this, $el, src.fn[h.name], pars);
        if (src.bind)
            for (let i in src.bind) {
                const b = src.bind[i].call(this, pars, $el);
                if (b === undefined && src.listeners[i + '-changed'] && $el.fire) {
                    requestAnimationFrame(() => {
                        $el.fire(i + '-changed');
                    });
                }
                else {
                    $el.setProperty(i, b);
                }
            }

        if ($el.$core)
            for (let i in $el.$core.style || {})
                $el.style[i] = $el.$core.style[i];
        if ($el.$core) {
            $el.render();
        }
        else if ($el.localName === 'slot') {
            const elements = ($el.assignedElements && $el.assignedElements()) || [];
            for (let el of elements) {
                el.render && el.render();
            }
        }
        if (/* !this.parentElement ||  */!$el.slot || $el.slotProxy || $el.slot === '?' || this.slot === '?') return;
        this.$core.slotted.add($el);
        this.$core.io.unobserve($el);
        const el = $el._slotProxy || createElement.call(this, src, '#comment');
        el.slotTarget = $el;
        $el.slotProxy = el;
        el.textContent += `-- ${$el.localName} (slot: "${$el.slot}")`;

        if ($el.$ref) {
            let arr = this.$core.slotRefs[$el.$ref];
            if (Array.isArray(arr))
                arr.push($el);
            else if ($el.$for)
                this.$core.slotRefs[$el.$ref] = [$el];
            else
                this.$core.slotRefs[$el.$ref] = $el;
        }
        $parent.replaceChild(el, $el);
        if ($el.slot === '*')
            $el.removeAttribute('slot')
        requestAnimationFrame(() => {
            let host;
            for (host of this.$core.shadowRoot.querySelectorAll('*')) {
                if (host.$core && host.$core.prototype.slots && host.$core.prototype.slots.includes($el.slot)) {
                    host.appendChild($el);
                    return;
                }
            }

            host = this;
            while (host) {
                for (let ch of host.children) {
                    if (ch.$core && ch.$core.prototype.slots && ch.$core.prototype.slots.includes($el.slot)) {
                        ch.appendChild($el);
                        return;
                    }
                }
                if (host.$core.prototype.slots && host.$core.prototype.slots.includes($el.slot)) {
                    host.appendChild($el);
                    return;
                }
                host = host.domHost || (host.parentElement?.$core && host.parentElement);
            }
            this.appendChild($el);
        })

    }

    const regExpWords = /[a-zA-Z][a-z]+|[a-zA-Z]/g;

    ODA.translates = { phrases: [], words: [] };
    ODA.translate = function (text, language) {
        return text;
        // if (text && ODA.dictionary && (language || ODA.language) !== 'en' && text.length<255){
        //     const phrase = ODA.translates.phrases.find(i => i.text === text);
        //     if (!phrase && ODA.levenstein){
        //         const list = ODA.levenstein.levenshteinList(text, Object.keys(ODA.dictionary), true).filter(i=>i.distance === 0 );
        //         let translate = list.length?ODA.dictionary[list[0].value]:'';
        //         ODA.translates.phrases.push({text, translate});
        //         for (let i of (text.match(regExpWords) || [])){
        //             i = i.toLowerCase();
        //             if (ODA.translates.words.find(w=>(w.text === i)))
        //                 continue;
        //             const word = ODA.translates.words[i]
        //             if (!word){
        //                 const words = ODA.levenstein.levenshteinList(i, Object.keys(ODA.dictionary), true).filter(i=>i.distance === 0 );
        //                 let translate = words.length?ODA.dictionary[words[0].value]:''
        //                 ODA.translates.words.push({text: i, translate});
        //             }
        //         }
        //     }
        //     else if (phrase.translate)
        //         text = phrase.translate;
        // }
        // return text;
    }

    let renderQueue = [], rafID = 0, limit = 15;
    let q = [];
    ODA.render = function (renderer) {
        renderQueue.add(renderer);
         if (rafID === 0)
            rafID = requestAnimationFrame(raf);
    };
    function raf() {
        if (q.length === 0){
            q = renderQueue;
            renderQueue = [];
        }
        let now = new Date();
        while (q.length && ((new Date() - now) < limit)) {
            q.shift()();
        }
        if (q.length === 0 && renderQueue.length === 0)
            rafID = 0;
        else
            rafID = requestAnimationFrame(raf);
    }

    function parseModifiers(name) {
        if (!name) return;
        const match = name.match(modifierRE);
        if (!match) return;
        const ret = {};
        match.forEach(function (m) { ret[m.slice(1)] = true; });
        return ret
    }
    function createFunc(vars, expr, prototype = {}) {
        try {
            return new Function(vars, `with (this) {return (${expr})}`);
        }
        catch (e) {
            console.error('%c' + expr + '\r\n', 'color: black; font-weight: bold; padding: 4px;', prototype.is, e);
        }
    }
    function exec(fn, p = []) {
        try {
            return fn.call(this, ...p);
        }
        catch (e) {
            console.error('%c' + fn.toString() + '\r\n', 'color: black; padding: 4px;', this, e);
        }
    }
    const forVars = ['item', 'index', 'items'];
    const svgNS = "http://www.w3.org/2000/svg";
    const modifierRE = /\.[^.]+/g;
    Object.defineProperty(Element.prototype, 'error', {
        set(v) {
            const target = (this.nodeType === 3 && this.parentElement) ? this.parentElement : this;
            if (target.nodeType === 1) {
                if (v) {
                    target.setAttribute('part', 'error');
                    target.setAttribute('oda-error', v);
                }
                else {
                    target.removeAttribute('part');
                    target.removeAttribute('oda-error');
                }
            }
        }
    });

    Object.defineProperty(Array.prototype, 'has', { enumerable: false, value: Array.prototype.includes });
    Object.defineProperty(Array.prototype, 'clear', {
        enumerable: false, value: function () {
            this.splice(0);
        }
    });
    Object.defineProperty(Array.prototype, 'last', {
        enumerable: false, get() {
            return this[this.length - 1];
        }
    });
    Object.defineProperty(Array.prototype, 'add', {
        enumerable: false, value: function (...item) {
            for (let i of item) {
                if (this.includes(i)) continue;
                this.push(i);
            }
        }
    });
    Object.defineProperty(Array.prototype, 'remove', {
        enumerable: false, value: function (...items) {
            for (const item of items) {
                const idx = this.indexOf(item);
                if (idx < 0) continue;
                this.splice(idx, 1);
            }
        }
    });
    function cached(fn) {
        const cache = Object.create(null);
        return (function cachedFn(str) {
            return cache[str] || (cache[str] = fn(str))
        })
    }
    const kebabGlossary = {};
    function toKebab(str) {
        return (kebabGlossary[str] = str.replace(/\B([A-Z])/g, '-$1').toLowerCase());
    }
    if (!String.toKebabCase) {
        Object.defineProperty(String.prototype, 'toKebabCase', {
            enumerable: false, value: function () {
                const s = this.toString();
                const str = kebabGlossary[s];
                return str ? str : toKebab(s);
            }
        });
    }
    const camelGlossary = {};
    function toCamel(str) {
        return (camelGlossary[str] = str.replace(/-(\w)/g, function (_, c) { return c ? c.toUpperCase() : '' }))
    }
    if (!String.toCamelCase) {
        Object.defineProperty(String.prototype, 'toCamelCase', {
            enumerable: false, value: function () {
                const s = this.toString();
                const str = camelGlossary[s];
                return str ? str : toCamel(s);
            }
        });
    }
    ODA.mainWindow = window;
    try {
        while (ODA.mainWindow.parent && ODA.mainWindow.parent !== ODA.mainWindow) {
            ODA.mainWindow = ODA.mainWindow.parent;
        }
    }
    catch (e) {
        console.dir(e);
    }
    ODA.origin = origin;
    ODA.telemetry = {
        proxy: 0, modules: {}, imports: {}, components: { count: 0 }, clear: () => {
            for (const i of Object.keys(ODA.telemetry)) {
                if (typeof ODA.telemetry[i] === 'number')
                    ODA.telemetry[i] = 0;
            }
        }
    };
    ODA.modules = [];
    ODA.tests = {};
    window.onerror = (...e) => {
        const module = ODA.modules.find(i => i.path === e[1]);
        if (module) {
            ODA.error(module.id, e[4].stack);
            return true;
        }
        else if (document.currentScript && e[0].includes('SyntaxError')) {
            let s = document.currentScript.textContent;
            let idx = s.indexOf('is:');
            if (idx > 0) {
                s = s.substring(idx + 3);
                s = s.replace(/'/g, '"');
                s = s.substring(s.indexOf('"') + 1);
                s = s.substring(0, s.indexOf('"'));
                if (s.includes('-')) {
                    ODA({
                        is: s,
                        template: `<span class="error border" style="cursor: help; padding: 2px; background-color: yellow; margin: 2px" title="${e[0]}'\n'${e[1]} - (${e[2]},${e[3]})">error: &lt;${s}&gt;</span>`
                    })
                }
            }
        }
        return false;
    };
    ODA.error = (component, ...args) => ODA.console(component, 'red', ...args);
    ODA.warn = (component, ...args) => ODA.console(component, 'orange', ...args);
    ODA.success = (component, ...args) => ODA.console(component, 'green', ...args);
    ODA.log = (component, ...args) => ODA.console(component, 'gray', ...args);
    ODA.console = async (component = { localName: 'unknown' }, color, ...args) => {
        if (window.top === window.self) {
            await import('/web/tools/console/console.js');
            const logComponent = document.body.querySelector('oda-console') || document.body.appendChild(ODA.createComponent('oda-console'));
            component = (component && component.localName) || component;
            const item = {
                component,
                style: `color: white; font-weight: bold; background-color: ${color}; padding: 1px 8px; border-radius: 8px`,
                text: [...args].join(' ')
            };
            logComponent.items = logComponent.items ? [item, ...logComponent.items] : [item];
        } else { }
    };
    // ODA.error = (component, ...args)=>{
    //     ODA.console( component, console.error, 'red', ...args);
    // };
    // ODA.warn = (component, ...args)=>{
    //     ODA.console(component, console.warn, 'orange', ...args);
    // };
    // ODA.success = (component, ...args)=>{
    //     ODA.console(component, console.log, 'green', ...args);
    // };
    // ODA.log = (component, ...args)=>{
    //     ODA.console(component, console.log, 'gray', ...args);
    // };
    // ODA.console = (component = {}, method, color, ...args)=>{
    //     component = (component && component.localName) || component;
    //     method(`%c<${component}>`, `color: white; font-weight: bold; background-color: ${color}; padding: 1px 8px; border-radius: 8px`, ...args)
    // };
    const cache = {
        fetch: {},
        file: {}
    };
    ODA.loadURL = async function (url) {
        if (!cache.fetch[url])
            cache.fetch[url] = fetch(url);
        return cache.fetch[url];
    };
    ODA.loadJSON = async function (url) {
        if (!cache.file[url]) {
            cache.file[url] = new Promise(async (resolve, reject) => {
                try {
                    const file = await ODA.loadURL(url);
                    const text = await file.json();
                    resolve(text)
                }
                catch (e) {
                    reject(e)
                }
            });
        }
        return cache.file[url];
    };
    const pars = new DOMParser();
    ODA.loadHTML = async function (url) {
        if (!cache.file[url]) {
            cache.file[url] = new Promise(async (resolve, reject) => {
                try {
                    const file = await ODA.loadURL(url);
                    const text = await file.text();
                    resolve(pars.parseFromString(text, 'text/html'))
                } catch (e) {
                    reject(e)
                }
            });
        }
        return cache.file[url];
    };
    class odaRouter {
        constructor() {
            this.rules = {};
            this.root = window.location.pathname.replace(/\/[a-zA-Z]+\.[a-zA-Z]+$/, '/');
            window.addEventListener('popstate', (e) => {
                this.run((e.state && e.state.path) || '');
            })
        }
        create(rule, callback) {
            for (let r of rule.split(',')) {
                r = r || '__empty__';
                this.rules[r] = this.rules[r] || [];
                if (!this.rules[r].includes(callback))
                    this.rules[r].push(callback);
            }
        }
        set currentRoute(v) {
            this._current = v;
        }
        go(path, idx = 0) {
            if (path.startsWith('#')) {
                const hash = window.location.hash.split('#');
                hash.unshift();
                while (hash.length > idx + 1) {
                    hash.pop();
                }
                path = hash.join('#') + path;

            }
            window.history.pushState({ path }, null, path);
            this.run(path)
        }
        run(path) {
            rules: for (let rule in this.rules) {
                if (rule === '__empty__') {
                    if (path) continue;
                }
                else {
                    chars: for (let i = 0, char1, char2; i < rule.length; i++) {
                        char1 = rule[i];
                        char2 = path[i];
                        switch (char1) {
                            case '*':
                                break chars;
                            case '?':
                                if (char2 === undefined) continue rules;
                                break;
                            default:
                                if (char1 !== char2) continue rules;
                                break;
                        }
                    }
                }
                for (let h of this.rules[rule])
                    h(path)
            }
        }
        back() {
            window.history.back();
        }
    }
    ODA.router = new odaRouter();
    const hooks = ['created', 'ready', 'attached', 'detached', 'updated', 'destroyed'];
    // ODA.loadScript = async function (url) {
    //     return ODA.cache('load-script:' + url, ()=>{
    //         return new Promise(function (resolve, reject) {
    //             let script = document.createElement("script");
    //             script.onload = function (e) {
    //                 globalThis.loader && globalThis.loader.off();
    //                 resolve(script);
    //             };
    //             script.onerror = function (e) {
    //                 globalThis.loader && globalThis.loader.off();
    //                 script.remove();
    //                 script = null;
    //                 reject(new Error('error on load script', url));
    //             };
    //             script.async = true;
    //             script.type = "text/javascript";
    //             if (ODA.origin && ODA.origin !== document.location.origin && !url.startsWith(ODA.origin))
    //                 url = ODA.origin + url;
    //             script.src = encodeURI(url);
    //             globalThis.loader && globalThis.loader.on(100);
    //             document.head.appendChild(script);
    //         });
    //     });
    // };
    // ODA.loadLink = function (url){
    //     return ODA.cache('load-link: '+url, ()=>{
    //         return new Promise((resolve, reject) => {
    //             const link = document.createElement("link");
    //             link.addEventListener('load', e=>{
    //                 resolve(link);
    //             });
    //             link.onerror = e => {
    //                 console.error(e);
    //                 reject(e);
    //             };
    //             link.rel = "import";
    //             if (ODA.origin && ODA.origin !== document.location.origin && !url.startsWith(ODA.origin))
    //                 url = ODA.origin + url;
    //             link.href = url;
    //             document.head.appendChild(link);
    //         });
    //     });
    // };
    // function load (){
    //     document.body.hidden = true;
    //     const links = Array.prototype.map.call(document.head.querySelectorAll('link[rel=oda-import]'), i=>{
    //         return ODA.loadLink(i.href);
    //     });
    //     Promise.all(links).then(()=>{
    //         document.body.hidden = false;
    //     })
    // }
    const toString = Object.prototype.toString;
    function isNativeObject(obj) {
        return toString.call(obj) === '[object Object]';
    }
    function def(obj, key, val, enumerable) {
        Object.defineProperty(obj, key, {
            value: val,
            enumerable: !!enumerable,
            writable: true,
            configurable: true
        });
    }
    function deepCopy(obj) {
        if (Array.isArray(obj))
            return obj.map(i => deepCopy(i));
        else if (isNativeObject(obj)) {
            obj = Object.assign({}, obj);
            for (const key in obj)
                obj[key] = deepCopy(obj[key]);
        }
        return obj;
    }

    Node.prototype.setProperty = function (name, v) {
        if (this.__lockBind === name) return;
        if (this.$core) {
            if (name.includes('.')) {
                let path = name.split('.');
                let step;
                for (let i = 0; i < path.length; i++) {
                    let key = path[i].toCamelCase();
                    if (i === 0) {
                        const prop = this.$core.prototype.properties[key];
                        if (prop) {
                            step = this.$core.data[key] = this.$core.data[key] || {};
                        }
                        else break;
                    }
                    else if (isObject(step)) {
                        if (i < path.length - 1) {
                            step = step[key] = step[key] || {};
                        } else {
                            step[key] = v;
                            return;
                        }
                    }
                }
            }
            else {
                const prop = this.$core.prototype.properties[name];
                if (prop) {
                    this.$core.data[name] = v;
                    return;
                }
            }

        }
        if (typeof v === 'object' || this.nodeType !== 1 || (this.$node && this.$node.vars.has(name))) {
            // if (this.$core){
            //     this.$core.data[name] = v;
            //     return;
            // }
            this[name] = v;
        }
        else {
            const d = !this.$core && getDescriptor(this.__proto__, name);
            if (!d)
                name = name.toKebabCase();
            else if (d.set && v !== undefined) {
                if (this[name] !== v)
                    this[name] = v;
                return;
            }
            if (v === false || v === undefined || v === null || v === '')
                this.removeAttribute(name);
            else
                this.setAttribute(name, v === true ? '' : v);
        }

        if (!this.assignedElements) return;
        for (const ch of this.assignedElements())
            ch.setProperty(name, v)

    };
    Node.prototype.fire = function (event, detail) {
        if (!this.$wake && this.$sleep) return;
        event = new odaCustomEvent(event, { detail: { value: detail }, composed: true });
        this.dispatchEvent(event);
    };
    Node.prototype.render = function () {
        if (!this.$wake && (this.$sleep || !this.$node)) return;
        updateDom.call(this.$domHost, this.$node, this, this.parentNode, this.$for);
    };
    // if (document.body) {
    //     load();
    // } else {
    //     document.addEventListener('DOMContentLoaded', load);
    // }
    class odaEvent {
        constructor(target, handler, ...args) {
            this.handler = handler;
            target.__listeners = target.__listeners || {};
            target.__listeners[this.event] = target.__listeners[this.event] || new Map();
            target.__listeners[this.event].set(handler, this);
            this._target = target;
            this._events = {};
        }
        static remove(name, target, handler) {
            const event = target.__listeners && target.__listeners[name] && target.__listeners[name].get(handler);
            event && event.delete();
        }
        get event() {
            return 'event'
        }
        addSubEvent(name, handler, useCapture) {
            this._events[name] = handler;
            this._target.addEventListener(name, handler, useCapture);
        }
        delete() {
            for (const name in this._events) {
                if (this._events.hasOwnProperty(name)) {
                    this._target.removeEventListener(name, this._events[name]);
                }
            }
            delete this._events;
        }
    }
    if (!("path" in Event.prototype))
        Object.defineProperty(Event.prototype, "path", {
            get: function () {
                var path = [];
                var currentElem = this.target;
                while (currentElem) {
                    path.push(currentElem);
                    currentElem = currentElem.parentElement;
                }
                if (path.indexOf(window) === -1 && path.indexOf(document) === -1)
                    path.push(document);
                if (path.indexOf(window) === -1)
                    path.push(window);
                return path;
            }
        });

    class odaCustomEvent extends CustomEvent {
        constructor(name, params, source) {
            super(name, params);
            if (source) {
                const props = {
                    path: {
                        value: source.path
                    },
                    currentTarget: {
                        value: source.currentTarget
                    },
                    target: {
                        value: source.target
                    },
                    stopPropagation: {
                        value: () => source.stopPropagation()
                    },
                    preventDefault: {
                        value: () => source.preventDefault()
                    },
                    sourceEvent: {
                        value: source
                    }
                };
                Object.defineProperties(this, props);
            }
        }
    }
    class odaEventTap extends odaEvent {
        constructor(target, handler, ...args) {
            super(target, handler, ...args);
            // if (!target.onclick) {
            //     target.onclick = () => void(0);
            // }
            this.addSubEvent('click', (e) => {
                const ce = new odaCustomEvent("tap", { detail: { sourceEvent: e } }, e);
                this.handler(ce, ce.detail);
            });
        }
        get event() {
            return 'tap'
        }
    }
    class odaEventDown extends odaEvent {
        constructor(target, handler, ...args) {
            super(target, handler, ...args);
            this.addSubEvent('mousedown', (e) => {
                const ce = new odaCustomEvent("down", { detail: { sourceEvent: e } }, e);
                this.handler(ce, ce.detail);
            });
        }
        get event() {
            return 'down'
        }
    }
    class odaEventUp extends odaEvent {
        constructor(target, handler, ...args) {
            super(target, handler, ...args);
            this.addSubEvent('mouseup', (e) => {
                const ce = new odaCustomEvent("up", { detail: { sourceEvent: e } }, e);
                this.handler(ce, ce.detail);
            });
        }
        get event() {
            return 'up'
        }
    }
    class odaEventTrack extends odaEvent {
        constructor(target, handler, ...args) {
            super(target, handler, ...args);
            this.addSubEvent('mousedown', (e) => {
                // e.stopPropagation(); //ломает обработку mousedown на всех вложенных элементах
                this.detail = {
                    state: 'start',
                    start: {
                        x: e.clientX,
                        y: e.clientY
                    }, ddx: 0, ddy: 0, dx: 0, dy: 0,
                };
                window.addEventListener('mousemove', moveHandler);
                window.addEventListener('mouseup', upHandler);
            });
            const moveHandler = (e) => {
                this.detail.x = e.clientX;
                this.detail.y = e.clientY;
                this.detail.ddx = -(this.detail.dx - (e.clientX - this.detail.start.x));
                this.detail.ddy = -(this.detail.dy - (e.clientY - this.detail.start.y));
                this.detail.dx = e.clientX - this.detail.start.x;
                this.detail.dy = e.clientY - this.detail.start.y;
                if (this.detail.dx || this.detail.dy) {
                    const ce = new odaCustomEvent("track", { detail: Object.assign({}, this.detail) }, e);
                    this.handler(ce, ce.detail);
                    this.detail.state = 'track';
                }
            };
            const upHandler = (e) => {
                window.removeEventListener('mousemove', moveHandler);
                window.removeEventListener('mouseup', upHandler);
                this.detail.state = 'end';
                const ce = new odaCustomEvent("track", { detail: Object.assign({}, this.detail) }, e);
                this.handler(ce, ce.detail);
            };
        }

        get event() {
            return 'track'
        }
    }
    if (!Element.prototype.__addEventListener) {
        const func = Element.prototype.addEventListener;
        Element.prototype.addEventListener = function (name, handler, ...args) {
            let event;
            switch (name) {
                case 'tap':
                    event = new odaEventTap(this, handler, ...args);
                    break;
                case 'down':
                    event = new odaEventDown(this, handler, ...args);
                    break;
                case 'up':
                    event = new odaEventUp(this, handler, ...args);
                    break;
                case 'track':
                    event = new odaEventTrack(this, handler, ...args);
                    break;
                default:
                    return func.call(this, name, handler, ...args);
            }
            this.__events = this.__events || new Map();
            let array = this.__events.get(name);
            if (!array) {
                array = [];
                this.__events.set(name, array);
            }
            array.push({ handler, event: event });
            return event;
        };
    }
    if (!Element.prototype.__removeEventListener) {
        const func = Element.prototype.removeEventListener;
        Element.prototype.removeEventListener = function (name, handler, ...args) {
            if (this.__events) {
                const array = this.__events.get(name) || [];
                const event = array.find(i => i.handler === handler)
                if (event) {
                    odaEvent.remove(name, this, handler);
                    // event.delete();
                    // switch (name){
                    //     case 'tap':
                    //     case 'down':
                    //     case 'up':
                    //     case 'track':{
                    //         odaEvent.remove(name, this, handler);
                    //     } break;
                    //     default:
                    //
                    // }
                    const idx = array.indexOf(event);
                    if (idx > -1) {
                        array.splice(idx, 1);
                    }
                }

                if (!array.length)
                    this.__events.delete(name);
            }
            func.call(this, name, handler, ...args);

        };
    }
    ODA._cache = {};
    ODA.cache = (key, callback) => {
        ODA._cache[key] = ODA._cache[key] || ((typeof callback === 'function') ? callback() : callback);
        return ODA._cache[key];
    }


    ODA.createComponent = (id, props = {}) => {
        let el = document.createElement(id);
        for (let p in props) {
            el[p] = props[p];
        }
        return el;
    }
    ODA.loadComponent = async (comp, props = {}, folder = 'components') => {
        if (typeof comp !== 'string') return comp;
        comp = comp.replace('oda-', '')
        let path = `./${folder}/${comp}/${comp}.js`;
        await import(path);
        return ODA.createComponent(`oda-${comp}`, props)
    }

    ODA.notify = function (text) {
        ODA.push(text);
    };
    ODA.push = (name = 'Warning!', { tag = 'message', body, icon = '/web/res/icons/warning.png', image } = {}) => {
        if (!body) {
            body = name;
            name = 'Warning!'
        }
        let params = { tag, body, icon, image };
        switch (Notification.permission.toLowerCase()) {
            case "granted":
                new Notification(name, params);
                break;
            case "denied":
                break;
            case "default":
                Notification.requestPermission(state => {
                    if (state === "granted")
                        ODA.push(name, params);
                });
                break;
        }
    };
    ODA.pushMessage = ODA.push;
    ODA.pushError = (error, context) => {
        if (error instanceof Error)
            error = error.stack;
        const tag = (context && context.displayLabel) || 'Error';
        ODA.push(tag, {
            tag: tag,
            body: error,
            icon: '/web/res/icons/error.png'
        })
    };
    ODA.getIconUrl = function (icon, item) {
        let url = icon;
        if (!url.includes(':') && !url.includes('/web/')) {
            url = '/web/res/icons/' + url;
            if (!url.includes('.png'))
                url += '.png';
        }
        url = encodeURI(url);
    };
    ODA.getImports = function (urlOrId) {
        const p = ODA.telemetry.components[urlOrId];
        if (p)
            urlOrId = p.prototype.url;

        let list = ODA.telemetry.imports[urlOrId];
        if (!list) {
            list = ODA.telemetry.imports[urlOrId] = [];
            const dir = urlOrId.substring(0, urlOrId.lastIndexOf('/')) + '/';
            fetch(urlOrId).then(res => {
                res.text().then(text => {
                    const results = text.matchAll(regExImport);
                    for (let result of results) {
                        const url = new URL(dir + eval(result.groups.name)).href;
                        list.add(url);
                        // console.log(urlOrId, url)
                    }
                }).catch(err => {

                })
            }).catch(err => {

            })
        }
        return list;
    };
    ODA.getDirInfo = async function (url) {
        let res;
        if (!ODA.localDirs) {
            try {
                res = await ODA.loadJSON(url.replace('/web/oda/', '/api/web/oda/') + '?get_dirlist');
            }
            catch (e) {
                //  console.error(e);
            }
        }
        if (!res) {
            try {
                res = await ODA.loadJSON(url + '/_.info');
                ODA.localDirs = true;
            }
            catch (e) {
                res = {}
                console.error(e)
            }
        }
        return res;
    }
    window.ODARect = window.ODARect || class ODARect {
        constructor(element) {
            if (element && element.host)
                element = element.host;
            const pos = element ? element.getBoundingClientRect() : ODA.mousePos;
            this.x = pos.x;
            this.y = pos.y;
            this.top = pos.top;
            this.bottom = pos.bottom;
            this.left = pos.left;
            this.right = pos.right;
            this.width = pos.width;
            this.height = pos.height;
        }
    };
    if (!window.DOMRect) {
        window.DOMRect = function (x, y, width, height) {
            this.x = x;
            this.y = y;
            this.top = y;
            this.bottom = y + height;
            this.left = x;
            this.right = x + width;
            this.width = width;
            this.height = height;
        }
    }
    document.addEventListener('mousedown', e => {
        ODA.mousePos = new DOMRect(e.pageX, e.pageY);
    });

    Object.defineProperty(ODA, 'language', {
        configurable: false,
        async set(n) {
            ODA._language = n;
            try {
                ODA.dictionary = await ODA.loadJSON(ODA.$dir + '/tools/languages/dictionaries/' + n + '.json');
            }
            catch (e) {
                ODA.dictionary = {};
            }
            for (let el of document.body.children)
                el.render && el.render();
        },
        get() {
            return ODA._language;
        }
    })
    ODA.language = navigator.language.split('-')[0];

    const keyPressMap = {}

    window.addEventListener('keypress', (e) => {
        const e_key = e.key.toLowerCase();
        const e_code = e.code.toLowerCase();
        const key = Object.keys(keyPressMap).find(key => {
            return key.toLowerCase().split(',').some(v => {
                return v.split('+').every(s => {
                    if (!s) return false;
                    const k = s.trim() || ' ';
                    switch (k) {
                        case 'ctrl':
                            return e.ctrlKey;
                        case 'shift':
                            return e.shiftKey;
                        case 'alt':
                            return e.altKey;
                        default:
                            return k === e_key || k === e_code || `key${k}` === e_code;
                    }
                })
            });
        });
        if (key) {
            const calls = keyPressMap[key.toLowerCase()] || [];
            calls.forEach(func => func(e))
        }
    }, true)

    ODA.onKeyPress = function (keys, callbck) {
        keys = keys.toLowerCase();
        for (let key of keys.split(',')) {
            const calls = keyPressMap[key] || [];
            calls.add(callbck)
            keyPressMap[key] = calls;
        }
    }

    window.addEventListener('load', async () => {
        document.oncontextmenu = (e) => {
            e.target.dispatchEvent(new MouseEvent('menu', e));
            return false;
        };
        document.frameworkIsReady = true;
        ODA({
            is: 'oda-style', template: /*html*/`
        <style scope="oda" group="layouts">
            :root{
                --font-family: Roboto, Noto, sans-serif;
                --bar-background: white;
                --stroke-color: transparent;
                --content-background: white;
                --content-color: black;
                --header-color: black;
                --border-color: darkslategray;
                --border-radius: 0px;

                --body-background: transparent;
                --body-color: #555555;
                --header-background: silver;


                --section-background: lightgrey;
                --section-color: black;

                --layout-background: whitesmoke;
                --layout-color: black;

                --content:{
                    background-color: var(--content-background, white);
                    color: var(--content-color, black);
                };
                --font-150:{
                    font-size: 150%;
                };
                --horizontal: {
                    display: flex;
                    flex-direction: row;
                };
                --horizontal-center:{
                    @apply --horizontal;
                    align-items: center;
                };
                --h:{
                    @apply --horizontal;
                };
                --horizontal-end:{
                    @apply --horizontal;
                    justify-content: flex-end;
                };
                --bold:{
                    font-weight: bold;
                };
                --between:{
                    justify-content: space-between;
                };
                --flex:{
                    flex: 1;
                    flex-basis: auto;
                };

                --no-flex: {
                    flex-grow: 0;
                    flex-shrink: 0;
                    flex-basis: auto;
                };
                --bar:{
                    @apply --horizontal;
                };
                --center:{
                    justify-content: center;
                    align-self: center;
                    align-content: center;
                };
                --vertical: {
                    display: flex;
                    flex-direction: column;
                };
                --border:{
                    border: 1px solid;
                };

                --toolbar:{
                    @apply --horizontal;
                    align-items: center;
                };
                --header: {
                    background: var(--header-background);
                    color: var(--header-color);
                    fill: var(--header-color);
                };
                --layout: {
                    background: var(--layout-background);
                    color: var(--layout-color);
                    fill: var(--layout-color);
                };
                --footer: {
                    @apply --header;
                };
                --border: {
                    border: 1px solid var(--border-color, darkslategray);
                    border-radius: var(--border-radius);
                };
                --border-left: {
                    border-left: 1px solid var(--border-color, darkslategray);
                };
                --border-top: {
                    border-top: 1px solid var(--border-color, darkslategray);
                };
                --border-right: {
                    border-right: 1px solid var(--border-color, darkslategray);
                };
                --border-bottom: {
                    border-bottom: 1px solid var(--border-color, darkslategray);
                };
                --label: {
                    white-space: nowrap;
                    align-content: center;
                    text-overflow: ellipsis;
                    font-family: var(--font-family);
                    overflow: hidden;
                    padding: 0px 4px;
                };

                --cover:{
                    position: fixed;
                    left: 0px;
                    top: 0px;
                    width: 100%;
                    height: 100%;
                    background-color: rgba(0,0,0,.1);
                    z-index: 1000;
                };
                --user-select:{
                    user-select: text !important;
                }
            };
            ::-webkit-scrollbar {
                width: 12px;
                height: 12px;
            }
            ::-webkit-scrollbar-track {
                -webkit-box-shadow: inset 0 0 6px rgba(0,0,0,0.3);

            }
            ::-webkit-scrollbar-thumb {
                border-radius: 10px;
                background: var(--body-background);

                -webkit-box-shadow: inset 0 0 6px rgba(0,0,0,0.5);
            }
            html {
                -ms-text-size-adjust: 100%;
                -webkit-text-size-adjust: 100%;
                height: 100%;
                --my-variable: 100px;
            }
            ::part{
                min-width: 0px;
            }
            ::part(error){
                position: relative;
                overflow: visible;
                min-height: 20px;
                min-width: 20px;
            }
            ::part(error):before{
                content: '';
                position: absolute;
                top: 0px;
                left: 0px;
                width: 0px;
                height: 0px;
                border: 4px solid transparent;
                border-left: 4px solid red;
                border-top: 4px solid red;
            }
            body{
                display: flex;
                flex: 1;
                animation: fadeIn .5s;
                flex-direction: column;
                font-family: var(--font-family);
                user-select: none;
                margin: 0px;
                padding: 0px;
                height: 100%;
                background: var(--body-background);
                color: var(--body-color, #555555);
                fill: var(--body-color, #555555);
                stroke: var(--stroke-color, transparent);
            }
        </style>
        <style scope="oda" group="shadow">
            :root {
                --box-shadow: 0 8px 10px 1px rgba(0, 0, 0, 0.14), 0 3px 14px 2px rgba(0, 0, 0, 0.12), 0 5px 5px -3px rgba(0, 0, 0, 0.2);
                --shadow: {
                    box-shadow: var(--box-shadow);
                };

                --shadow-transition: {
                    transition: box-shadow 0.28s cubic-bezier(0.4, 0, 0.2, 1);
                };

                --text-shadow: {
                    text-shadow: 0 1px 1px rgba(255, 255, 255, 0.75);
                };

                --text-shadow-black: {
                    text-shadow: 0 1px 1px black;
                };
                --raised:{
                    box-shadow: 0 2px 2px 0 rgba(0, 0, 0, 0.14), 0 1px 5px 0 rgba(0, 0, 0, 0.12), 0 3px 1px -2px rgba(0, 0, 0, 0.2);
                };
            }
            body[context-menu-show] *:not(oda-context-menu){
                pointer-events: none;
            }
        </style>
        <style scope="oda" group="special">
            :root {
                --success-color: green;
                --error-color: red;
                --info-color: blueviolet;
                --warning-color: orange;
                --invert:{
                    color: var(--layout-background) !important;
                    border-color: var(--layout-background) !important;
                    fill: var(--layout-background) !important;
                    background: var(--layout-color) !important;
                };
                --error: {
                    color: var(--error-color) !important;
                    border-color: var(--error-color) !important;
                    fill: var(--error-color) !important;

                };
                --error-invert: {
                    @apply --invert;
                    background: var(--error-color) !important;
                };

                --success: {
                    color: var(--success-color) !important;
                    fill: var(--success-color) !important;
                    border-color: var(--success-color) !important;
                };
                --success-invert: {
                    @apply --invert;
                    background: var(--success-color) !important;
                };

                --info: {
                    color: var(--info-color) !important;
                    fill: var(--info-color) !important;
                    border-color: var(--info-color) !important;
                };
                --info-invert: {
                    @apply --invert;
                    background: var(--info-color) !important;
                };

                --warning: {
                    color: var(--warning-color)  !important;
                    fill: var(--warning-color) !important;
                    border-color: var(--warning-color) !important;
                };

                --warning-invert: {
                    @apply --invert;
                    background: var(--warning-color) !important;
                };
            }
        </style>
        <style scope="oda" group="effects">
            :root{
                --focused-color: blue;
                --selected-color: navy;
                --selected-background: silver;
                --dark-color: white;
                --dark-background: gray;
                --dark: {
                    color: var(--dark-color) !important;
                    background-color: var(--dark-background) !important;
                };

                --active: {
                    color: var(--selected-color) !important;
                    background-color: var(--selected-background) !important;
                };
                --selected: {
                    /*filter: brightness(90%);*/
                    color: var(--selected-color) !important;
                    filter: brightness(0.8) contrast(1.2);
                    /*background-color: var(--selected-background) !important;*/
                    /* background: linear-gradient(var(--selected-background), var(--content-background), var(--selected-background))  !important; */
                };
                --focused:{
                    /*outline: 2px solid var(--focused-color) !important;*/
                    /*background-color: whitesmoke !important;*/
                    /*color: var(--focused-color, red) !important;*/
                    box-shadow: inset 0 -2px 0 0  var(--focused-color)!important;
                    /*border-bottom: 2px solid var(--focused-color) !important;*/
                    /*box-sizing: border-box;*/
                    /*filter: brightness(.9) contrast(1);*/
                };
                --disabled: {
                    cursor: default !important;
                    opacity: 0.4;
                    user-focus: none;
                    user-focus-key: none;
                    user-select: none;
                    user-input: none;
                    pointer-events: none;
                    filter: grayscale(80%);
                };
            }
        </style>
        <style scope="oda">
            @keyframes blinker {
                100% {
                    opacity: 0;
                }
            }
            @-webkit-keyframes blinker {
                100% {
                    opacity: 0;
                }
            }

            @keyframes zoom-in {
                from {transform:scale(0)}
                to {transform:scale(1)}
            }
            @keyframes zoom-out {
                from {transform:scale(1)}
                to {transform:scale(0)}
            }

            @keyframes fadeIn {
                from {
                    opacity: 0;
                }
                to {
                    opacity: 1;
                }
            }

            @-moz-keyframes fadeIn {
                from {
                    opacity: 0;
                }
                to {
                    opacity: 1;
                }
            }

            @keyframes fadeOut {
                from {
                    opacity: 1;
                }
                to {
                    opacity: 0;
                }
            }

            @-moz-keyframes fadeOut {
                from {
                    opacity: 1;
                }
                to {
                    opacity: 0;
                }
            }
        </style>
        <style group="theme"></style>`,
            properties: {
                styles: {
                    type: Object,
                    freeze: true
                },
                theme: {
                    default: {},
                    freeze: true,
                    set(n, o) {
                        for (let node of this.$core.data.nodes)
                            node.textContent = this.convert(node);
                        document.querySelector('style[group=theme]').textContent = `\n:root{\n${Object.keys(n).map(key => '\t' + key + ': ' + n[key] + ';\n').join('')}}`;
                        let event = new CustomEvent('setTheme', { detail: { value: document.querySelector('style[group=theme]').textContent }, composed: true });
                        document.dispatchEvent(event);
                    }
                },
                nodes: {
                    default: [],
                    freeze: true
                }
            },
            ready() {
                this.elements = Array.from(this.$core.shadowRoot.children);
                const styles = {};
                for (let style of this.elements) {
                    document.head.appendChild(style);
                    for (let i of style.sheet.cssRules) {
                        if (i.style) {
                            for (let key of i.style) {
                                let val = i.style.getPropertyValue(key);
                                if (!/^--/.test(key)) continue;
                                val = val.toString().trim().replace(/^{|}$/g, '').trim().split(';').join(';');
                                styles[key] = val;
                            }
                        }
                    }
                }
                const proxy = new Proxy(styles, {
                    get: (target, p, receiver) => {
                        let val = target[p];
                        if (typeof val === 'string') {
                            let theme = this.$core.data.theme[p];
                            if (theme)
                                return theme;

                            applyStyleMixins(val, this.$core.data.styles);
                            // for (let v of (val.match(regExpApply) || [])){
                            //     let rule = this.$core.data.styles[v];
                            //     val = val.replace(new RegExp(`@apply\\s+${v}\s?;`, 'g'), rule);
                            // }
                        }
                        return val;
                    },
                    set: (target, p, value, receiver) => {
                        target[p] = value;
                        return true;
                    }
                });
                const options = { proxy, main: this };
                options.hosts = new Map();
                options.hosts.set(this, proxy);
                Object.defineProperty(styles, '__op__', {
                    enumerable: false,
                    configurable: true,
                    value: options
                });
                this.styles = proxy;
            },
            convert(node, style) {
                node.style = style || node.style || node.textContent;
                this.$core.data.nodes.add(node);
                let res = node.style;
                if (!res) return res;
                applyStyleMixins(res, this.$core.data.styles);
                // for (let v of (res.match(regExpApply) || [])){
                //     let rule = this.$core.data.styles[v];
                //     if(rule)
                //         res = res.replace(new RegExp(`@apply\\s+${v}\s?;`, 'g'), rule);
                // }
                return res;
            },
            update(updates = {}) {
                if (Object.keys(updates).length === 0)
                    this.$core.data.theme = updates;
                else
                    this.$core.data.theme = Object.assign({}, this.$core.data.theme, updates);
            }
        });

        ODA.style = document.createElement('oda-style');

        // import('./tools/languages/editor/dictionary-editor.js').then(() => {
        //     console.log('dictionary-editor is loaded')
        // });
        // import('./tools/console/console.js').then(() => {
        //     ODA.console = ODA.createComponent('oda-console');
        // });
        ODA.containerStack = [];
        ODA.getDirInfo(ODA.$dir + '/tools/containers').then(res => {
            ODA.$containers = (res.$DIR || []).map(i => i.name);
            for (let id of ODA.$containers) {
                ODA[('show-' + id).toCamelCase()] = async function (component, props = {}, hostProps = {}) {
                    await import('./tools/containers/' + id + '/' + id + '.js');
                    const host = ODA.createComponent('oda-' + id, hostProps);
                    let ctrl = component;
                    if (typeof ctrl === 'string')
                        ctrl = ODA.createComponent(ctrl, props);
                    else if (ctrl.parentElement) {
                        if (ctrl.containerHost)
                            ctrl.containerHost.fire('cancel');
                        const comment = document.createComment(ctrl.innerHTML);
                        comment.slotTarget = ctrl;
                        ctrl.slotProxy = comment;
                        ctrl.containerHost = host;
                        comment.$slot = ctrl.slot;
                        delete ctrl.slot;
                        ctrl.parentElement.replaceChild(comment, ctrl);
                    }
                    host.style.position = 'absolute';
                    host.style.width = '100%';
                    host.style.height = '100%';
                    host.appendChild(ctrl)
                    document.body.appendChild(host);
                    ODA.containerStack.push(host);
                    try {
                        return await new Promise((resolve, reject) => {
                            this.keyboardEvent = e => {
                                if (e.keyCode === 27) {
                                    //reject();
                                    while (ODA.containerStack.length)
                                        ODA.containerStack.pop().fire('cancel');
                                }
                            }
                            this.cancelEvent = e => {
                                reject();
                            }
                            this.mouseEvent = e => {
                                while (ODA.containerStack.includes(e.target.parentElement) && ODA.containerStack.last !== e.target.parentElement) {
                                    ODA.containerStack.pop().fire('cancel');
                                }

                                if (ODA.containerStack.last === host && e.target !== ctrl) {
                                    let el = e.target.parentElement;
                                    while (el) {
                                        if (el === host) return;
                                        el = el.parentElement;
                                    }
                                    //reject();
                                    while (ODA.containerStack.length)
                                        ODA.containerStack.pop().fire('cancel');
                                }

                            }
                            this.okEvent = e => {
                                resolve(ctrl);
                            }
                            host.addEventListener('cancel', this.cancelEvent);
                            host.addEventListener('ok', this.okEvent);
                            window.addEventListener('keydown', this.keyboardEvent, true);
                            document.addEventListener('mousedown', this.mouseEvent, true);
                        })
                    }
                    catch (e) {
                        return undefined
                    }
                    finally {
                        ODA.containerStack.remove(host);
                        if (ctrl.slotProxy) {
                            ctrl.slot = ctrl.slotProxy.$slot;
                            ctrl.slotProxy.parentElement.replaceChild(ctrl, ctrl.slotProxy);
                        }
                        host.removeEventListener('cancel', this.cancelEvent);
                        host.removeEventListener('ok', this.okEvent);
                        window.removeEventListener('keydown', this.keyboardEvent, true);
                        document.removeEventListener('mousedown', this.mouseEvent, true);
                        host.remove();
                    }
                }
            }
        })


        document.dispatchEvent(new Event('framework-ready'));
        if (document.body.firstElementChild && document.body.firstElementChild.tagName === 'ODA-TESTER') {
            document.body.style.display = 'none';
            import('./tools/tester/tester.js').then(() => {
                document.body.style.display = '';
            });
        }
    });

}
export default ODA;
