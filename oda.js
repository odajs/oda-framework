/*
 * oda.js v3.0
 * (c) 2019-2020 Roman Perepelkin
 * Under the MIT License.
 */

window.globalThis = window.globalThis || window;
'use strict';

const domParser = new DOMParser();
const regExpApply = /(?<=@apply\s+)--(\w+-?\w+)+/g;
const regExpParseRule = /([a-z\-]+)\s*:\s*((?:[^;]*url\(.*?\)[^;]*|[^;]*)*)\s*(?:;|$)/gi;
function cssRuleParse(rules, res) {
    for (let rule of rules){
        if (rule.styleMap){
            const ss = rule.cssText.replace(rule.selectorText, '').match(regExpParseRule);
            if (!ss) continue;
            let sel = rule.selectorText.split(',').join(',\r');
            let r = res[sel] = res[sel] || [];
            r.add(...ss);
        }
        else if(rule.media){
            let key = '@media '+rule.media.mediaText;
            let r = res[key] = res[key] || {};
            cssRuleParse(rule.cssRules, r);
        }
    }
}
function isObject(obj){
    return obj && typeof obj === 'object';
}
Object.__proto__.equal = function(a, b) {
    if (a === b) return true;
    if (!isObject(a) || !isObject(b)) return false;
    for(let key in Object.assign({}, a, b))
        if(!Object.equal(b[key], a[key])) return false;
    return true;
};

export default function ODA(prototype = {}) {
    function  regComponent () {
        if (window.customElements.get(prototype.is) === undefined){
            try{
                let parents = ((prototype.extends && prototype.extends.split(',')) || []).filter(i=>{
                    i = i.trim();
                    return i === 'this' || i.includes('-');
                });
                parents = parents.map(ext =>{
                    ext = ext.trim();
                    if (ext === 'this')
                        return ext;
                    const parent =  ODA.telemetry.components[ext];
                    if (!parent)
                        ODA.error(prototype.is,`not found inherit parent "${ext}"`);
                    return parent;
                });
                let template = prototype.template;
                if (parents.length){
                    let templateExt = '';
                    for (let parent of parents){
                        if (parent === 'this'){
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
                for (let slot of namedSlots){
                    for (let ch of slot.children){
                        if (ch.attributes['slot']) continue;
                        ch.setAttribute('slot', slot.name);
                    }
                }
                prototype.slots = Array.prototype.map.call(namedSlots, el=>el.getAttribute('name'));
                if (ODA.style){
                    const styles = Array.prototype.filter.call(template.content.children, i=>i.localName === 'style');
                    const rules = {};
                    for (let style of styles){
                        let text = style.textContent;
                        for (let v of (text.match(regExpApply) || [])){
                            let rule =  ODA.style.styles[v];
                            if(!rule) continue;
                            text = text.replace(new RegExp(`@apply\\s+${v}\s?;`, 'g'), rule);
                        }
                        style.textContent = text;
                        document.head.appendChild(style);
                        if (style.sheet.cssRules.length){
                            cssRuleParse(style.sheet.cssRules, rules);
                            style.remove();
                        }
                        else
                            template.content.insertBefore(style, template.content.firstElementChild);
                    }
                    let classes = [];
                    for(let el of template.content.querySelectorAll('[class]')){
                        for (let cls of el.getAttribute('class').split(' ')){
                            cls && classes.add(cls);
                        }
                    }
                    for (let i of classes){
                        let map = ODA.style.styles['--'+i];
                        if (!map) continue;
                        let r = rules['.'+i] = rules['.'+i] || [];
                        for (let s of map.split(';'))
                            s && r.add(s.trim()+';')
                    }

                    let attributes = [];
                    for(let el of template.content.querySelectorAll('*')){
                        for (let attr of el.attributes){
                            attributes.add(attr.name.replace(/^\.?:+/g, ''));
                        }
                    }
                    for (let i of attributes){
                        let map = ODA.style.styles['--'+i];
                        if (!map) continue;
                        let r = rules['['+i+']'] = rules['['+i+']'] || [];
                        for (let s of map.split(';'))
                            s && r.add(s.trim()+';')
                    }
                    const keys = Object.keys(rules);
                    if (keys.length){
                        const el = document.createElement('style');
                        el.textContent = keys.map(i =>{
                            const rule = rules[i];
                            if (Array.isArray(rule))
                                return '\r'+i+'{\r\t'+rule.join('\r\t')+'\r}';
                            return '\r'+i+'{\r\t'+Object.keys(rule).map(i=>{
                                return i+'{\r\t\t'+rule[i].join('\r\t\t')+'\r\t}';
                            }).join('\r')+'\r}';
                        }).join('');
                        template.content.insertBefore(el, template.content.firstElementChild);
                    }
                }
                prototype.template = template.innerHTML.trim();
                ODA.telemetry.components[prototype.is] = {prototype: prototype, count: 0, render: 0};
                convertPrototype(parents);
                let options;
                let el;
                if (prototype.extends && !prototype.extends.includes(',') && !ODA.telemetry.components[prototype.extends]){
                    el = class extends Object.getPrototypeOf(document.createElement(prototype.extends)).constructor{
                        constructor(){
                            super();
                        }
                        connectedCallback(){
                            if (prototype.attached)
                                prototype.attached.apply(this);
                        }
                        disconnectedCallback(){
                            if (prototype.detached)
                                prototype.detached.apply(this);
                        }
                    };
                    options = {extends: prototype.extends}
                }
                else
                    el = ComponentFactory();
                window.customElements.define(prototype.is,  el , options);
                ODA.telemetry.last = prototype.is;
                // ODA.success(prototype.is, 'registered');
            }
            catch (e) {
                ODA.error(prototype.is, e);
            }
        }
        else{
            // ODA.warn(prototype.is, 'component has already been registered');
        }
    }

    const componentResizeObserver = new ResizeObserver(entries=>{
        for (const obs of entries){
            obs.target.fire('resize');
        }
    });

    function  observe(key, h){
        core.observers[key] = core.observers[key] || [];
        core.observers[key].push(h);
    }
    const core = {
        cache:{},
        save: {},
        slotRefs: {},
        reflects: [],
        observers: {},
        listeners: {},
        deps: {},
        prototype: prototype,
        node: { tag: '#document-fragment', id: 0, dirs: []},
        data: {},
        io: new IntersectionObserver(entries => {
            for (let i = 0, entry, l = entries.length; i<l ;i++){
                entry = entries[i];
                if (!!entry.target.$freeze !== entry.isIntersecting) continue;
                entry.target.$freeze = !entry.isIntersecting;
                if (!entry.target.$freeze)
                    requestAnimationFrame(entry.target.render.bind(entry.target));
            }
        }, {rootMargin: '20%'})
    };
    function callHook (hook) {
        this.fire(hook);
        const h = prototype[hook];
        if (!h) return;
        h.call(this);
    }
    function ComponentFactory () {
        class odaComponent extends HTMLElement {
            constructor () {
                super();
                this.$core = Object.assign({}, core);
                this.$core.events = {};
                this.$core.cache = {observers:{}};
                this.$core.debounces = new Map();
                this.properties = prototype.properties;
                const data = deepCopy(core.data);
                for(let i in data){
                    if(prototype.properties[i].freeze) continue;
                    data[i] = makeReactive.call(this, data[i]);
                }
                this.$core.data = makeReactive.call(this, data, prototype.properties);
                this.$core.root = this.$core.shadowRoot = this.attachShadow({mode: 'closed'});
                callHook.call(this, 'created');
                ODA.telemetry.components[prototype.is].count++;
                ODA.telemetry.components.count++;
                if(prototype.hostAttributes){
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

                if(this.$core.shadowRoot){
                    componentResizeObserver.observe(this);
                    window.addEventListener('resize', e =>{
                        this.fire('resize', e)
                    });
                    this.render(true);
                    callHook.call(this, 'ready');
                }
            }
            connectedCallback () {
                for (const name of core.reflects)
                    funcToAttribute.call(this, name);
                for (const key in this.$core.observers){
                    for(const h of this.$core.observers[key])
                        h.call(this);
                }
                for (let event in prototype.listeners){
                    this.$core.listeners[event] = (e)=>{
                        prototype.listeners[event].call(this, e, e.detail);
                    };
                    this.addEventListener(event, this.$core.listeners[event]);
                }
                callHook.call(this, 'attached');
            }
            disconnectedCallback () {
                for (let event in prototype.listeners)
                    this.removeEventListener(event, this.$core.listeners[event]);
                callHook.call(this, 'detached');
            }
            static get observedAttributes(){
                return Object.keys(prototype.properties).map(key=>prototype.properties[key].attrName);
            }
            attributeChangedCallback(name, o, n){
                if (o === n) return;
                n = (n === '')?true:((o === '' && n === undefined)?false:n);
                this.$core.data[name.toCamelCase()] = n;
            }
            updateStyle (styles = {}){
                this.$core.style = Object.assign({}, this.$core.style, styles);
                this.render();
            }
            notify(key, stop){
                const obs = this.$core.observers[key];
                if(obs) {
                    for(let h of obs)
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
            render(force){
                if(!this.$core.shadowRoot || this.$core.__inRender) return;
                this.$core.__inRender = true;
                force?render.call(this, force):ODA.render(render.bind(this));
                if(this.$core.save && this.$core.saveKey){
                    const save = {};
                    for (let p in this.$core.save){
                        const val = this.$core.data[p];
                        if (val === this.$core.save[p]) continue;
                        save[p] = val
                    }
                    localStorage.setItem(this.$core.saveKey, JSON.stringify(save));
                }
            }
            resolveUrl(path){
                return prototype.$path + path;
            }
            fire (event, detail){
                event =  new odaCustomEvent(event, {detail: {value: detail}, composed: true});
                this.dispatchEvent(event);
            }
            listen(item, event='', callback){
                if (item) {
                    if (typeof callback === 'string'){
                        callback = this.$core.events[callback] = this.$core.events[callback] || this[callback].bind(this);
                    }
                    event.split(',').forEach(i => {
                        item.addEventListener(i.trim(), callback)
                    });
                }
            }
            unlisten (item, event='', callback){
                if (item) {
                    if (typeof callback === 'string')
                        callback = this.$core.events[callback];
                    if(callback) {
                        event.split(',').forEach(i => {
                            item.removeEventListener(i.trim(), callback)
                        });
                    }
                }
            }
            create (tagName, props={}, inner){
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
            debounce (key, handler, delay = 0){
                let db = this.$core.debounces.get(key);
                if(db)
                    delay?clearTimeout(db):cancelAnimationFrame(db);
                const fn = delay?setTimeout:requestAnimationFrame;
                const t = fn(() => {
                    this.$core.debounces.delete(key);
                    handler.call(this);
                }, delay);
                this.$core.debounces.set(key, t)
            }
            get $() {
                return this.$refs;
            }
            get $refs() {
                if(!this.$core.refs || Object.keys(this.$core.refs).length === 0){
                    this.$core.refs = Object.assign({}, this.$core.slotRefs);
                    let els = this.$core.shadowRoot.querySelectorAll('*');
                    els = Array.prototype.filter.call(els, i=>i.$ref);
                    for (let el of els){
                        let ref = el.$ref;
                        let arr = this.$core.refs[ref];
                        if (arr)
                            arr.push(el);
                        else if(el.$for)
                            this.$core.refs[ref] = [el];
                        else
                            this.$core.refs[ref] = el;
                    }

                }
                return this.$core.refs;
            }
            async (handler, delay = 0){
                delay?setTimeout(handler, delay):requestIdleCallback(handler)
            }
            __read (path, def){
                this.setting  =  this.setting || JSON.parse(localStorage.getItem(prototype.is));
                if(typeof this.setting !== 'object')
                    this.setting  = {};
                path = path.split('/');
                let s = this.setting;
                while (path.length && s){
                    s = s[path.shift()];
                }
                return s || def;
            }
            __write (path, value){
                this.setting  =  this.setting || JSON.parse(localStorage.getItem(prototype.is));
                if(typeof this.setting !== 'object')
                    this.setting  = {};
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
            $super  (name, ...args) {
                const getIds = (p) => {
                    const res = [];
                    let id = p.extends;
                    if (id) {
                        const ids = id.split(/, */).filter(i => i !== 'this');
                        for (const id of ids) {
                            res.push(id);
                            res.push(...getIds(ODA.telemetry.components[id].prototype));
                        }
                    }
                    return res;
                };
                const curId = this.$parent.$core.name;
                const curMethod = ODA.telemetry.components[curId].prototype[name] || ODA.telemetry.components[curId].prototype[name];
                const ids = getIds(ODA.telemetry.components[curId].prototype);
                for (const id of ids) {
                    const proto = ODA.telemetry.components[id].prototype;
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
            if (prop.save){
                core.save = core.save || {};
                core.save[name] = prop.default;
            }
            prop.name = name;
            Object.defineProperty(odaComponent.prototype, name, {
                enumerable: true,
                set(v){
                    this.$core.data[name] = v;
                },
                get() {
                    return this.$core.data[name];
                }
            });
            prop.attrName = prop.attrName || name.toKebabCase();
            if (prop.computed){
                observe(name, function clearComputedValue(stop) {
                    if (stop) return;
                    this.$core.data[name] = undefined;
                });
            }
            if (prop.reflectToAttribute){
                observe(name, function reflectToAttribute(){
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
        core.node.children = prototype.template?parseJSX(prototype, prototype.template):[];
        let cnt = 0;
        for(let func of prototype.observers){
            const obsId = ++cnt;
            let expr;
            if (typeof func === 'function') {
                expr = func.toString();
                expr = expr.substring(0, expr.indexOf('{')).replace('async', '').replace('function', '').replace(func.name, '');
            }
            else{
                expr = func.substring(func.indexOf('('));
            }
            expr = expr.replace('(', '').replace(')', '').trim();
            const dd = Object.keys(core.data);
            const vars = expr.split(',').map(prop=>{
                prop = prop.trim();
                const idx = dd.indexOf(prop);
                if (idx<0)
                    ODA.error(prototype.is, `No found propety by name "${prop} for observer ${func.toString()}"`);
                return {prop, arg: 'v' + idx};
            });
            if (typeof func === 'string'){
                const args = vars.map(i=>{
                    func = func.replace(i.prop, i.arg);
                    return i.arg;
                }).join(',');
                func = new Function(args, `with (this) {${func}}`);
            }
            function funcObserver(){
                const params = vars.map(v=>{
                    return this.$core.data[v.prop];
                });
                if (!params.includes(undefined) && !Object.equal(this.$core.cache.observers[obsId], params)){
                    this.$core.cache.observers[obsId] =  params;
                    func.call(this,  ...params);
                }
            }
            for (const v of vars)
                observe(v.prop, funcObserver);
        }
        Object.getOwnPropertyNames(prototype).forEach(name => {
            const d = getDescriptor(prototype, name);
            if (typeof d.value === 'function'){
                odaComponent.prototype[name] = function (...args)  {
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

    function convertPrototype(parents){
        prototype.properties = prototype.properties || prototype.props || {};
        prototype.observers = prototype.observers || [];
        prototype.properties.saveKey = {
            type: String,
            set(n, o){
                this.$core.saveKey = prototype.is + (n?(': '+n):'');
                if(this.$core.save){
                    const save = JSON.parse(localStorage.getItem(this.$core.saveKey));
                    if(save){
                        for (let p in this.$core.save){
                            this.$core.data[p] = save[p];
                        }
                    }
                }
            }
        };
        for(let key in prototype.properties){
            let prop = prototype.properties[key];
            let computed = prop && (prop.computed || prop.get || (typeof prop === 'function' && !prop.prototype && prop));
            if (computed){
                if (typeof prop === 'function')
                    prototype.properties[key] = prop = {};
                if (typeof computed === 'string')
                    computed = prototype[computed];
                delete prop.get;
                prop.computed = computed;
            }
            let watch = prop && (prop.watch || prop.set || prop.observe);
            if (watch){
                if (typeof watch === 'string')
                    watch = prototype[watch];
                delete prop.set;
                delete prop.observe;
                prop.watch = watch;
            }
            if (typeof prop === "function"){
                prop = {type: prop};
                prototype.properties[key] = prop;
            }
            else if (Array.isArray(prop)) {
                const array =  [].concat(prop);
                prop = prototype.properties[key] = {default(){
                        return [].concat(array);
                    }, type: Array};
            }
            else if(typeof prop !== "object"){
                prop = prototype.properties[key] = {default: prop, type: prop.__proto__.constructor};
            }
            else if(prop === null){
                prop = prototype.properties[key] = {type: Object, default: null};
            }
            else if(Object.keys(prop).length === 0 || (!computed && !watch && prop.default === undefined && !prop.type)){
                const n = Object.assign({}, prop);
                prop = prototype.properties[key] = {type: Object, default(){return n}};
            }

            prop.default = (prop.default === undefined)?(prop.value || prop.def):prop.default;
            delete prop.value;
            if (prop.default !== undefined && typeof prop.default !== 'function') {
                switch (prop.type) {
                    case undefined:{
                        if (Array.isArray(prop.default)){
                            const array = [].concat(prop.default);
                            prop.default = function(){return [].concat(array)};
                            prop.type = Array;
                        }
                        else if(isNativeObject(prop.default)){
                            const obj = Object.assign({}, prop.default);
                            prop.default = function(){return Object.assign({}, obj)};
                            prop.type = Object;
                        }
                        else if (prop.default === null)
                            prop.type = Object;
                        else{
                            prop.type = prop.default.__proto__.constructor;
                        }

                    } break;
                    case Object:{
                        if (prop.default){
                            const obj = Object.assign({}, prop.default);
                            prop.default = function(){return Object.assign({}, obj)};
                        }
                    } break;
                    case Array:{
                        const array = [].concat(prop.default);
                        prop.default = function(){return [].concat(array)};
                    } break;
                }
            }
        }

        prototype.listeners = prototype.listeners || {};
        if (prototype.keyBindings){
            prototype.listeners.keydown = function (e) {
                const key = Object.keys(prototype.keyBindings).find(key=>{
                    return key.toLowerCase().split(',').some(v=>{
                        return v.split('+').every(k=>{
                            switch (k.trim()) {
                                case 'ctrl':
                                    return e.ctrlKey;
                                case 'shift':
                                    return e.shiftKey;
                                case 'alt':
                                    return e.altKey;
                                default:
                                    return k === e.key.toLowerCase();
                            }
                        })
                    });
                });
                if (key){
                    e.preventDefault();
                    let handler = prototype.keyBindings[key];
                    if (typeof handler === 'string')
                        handler = prototype[handler];
                    handler.call(this, e);
                }
            }
        }
        for (let event in prototype.listeners){
            const handler = prototype.listeners[event];
            prototype.listeners[event] = (typeof handler === 'string')?prototype[handler]:handler;
        }

        parents.forEach(parent=>{
            if (typeof parent === 'object'){
                for(let key in parent.prototype.properties){
                    let p = parent.prototype.properties[key];
                    let me = prototype.properties[key];
                    if(!me){
                        p = Object.assign({}, p);
                        p.extends = parent.prototype.is;
                        prototype.properties[key] = p;
                    }
                    else{
                        for(let k in p){
                            if (!me[k]){
                                me[k] = p[k];
                            }
                            else if(k === 'type' && p[k] && me[k] !== p[k]){
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
                for(let key in parent.prototype.listeners){
                    if(!getDescriptor(prototype.listeners, key)){
                        const par = getDescriptor(parent.prototype.listeners, key);
                        prototype.listeners[key] = par.value;
                    }
                }
                parent.prototype.observers.forEach(func =>{
                    let name;
                    if (typeof func === 'function'){
                        name = func.name;
                    }
                    else{
                        name = func.split(' ')[0]
                    }
                    const f = prototype.observers.find(func=>{
                        if (typeof func === 'function'){
                            return name === func.name;
                        }
                        else{
                            return func.startsWith(name);
                        }
                    });
                    if(!f){
                        prototype.observers.push(func);
                    }
                });
                for(let key in parent.prototype){
                    const p = getDescriptor(parent.prototype, key);
                    const self = getDescriptor(prototype, key);
                    if (typeof p.value === 'function'){
                        if (!self){
                            prototype[key] = function(...args){
                                return p.value.call(this, ...args);
                            }
                        }
                        else if(hooks.includes(key)){
                            prototype[key] = function(){
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
const getDescriptor =  Object.getOwnPropertyDescriptor;
window.ODA = ODA;

try {
    ODA.rootPath = import.meta;
    ODA.rootPath = ODA.rootPath.url.replace('/oda.js','');
} catch (e) { }

function  signals(prop, value, old){
    if (prop.notify)
        this.dispatchEvent(new CustomEvent(prop.attrName+'-changed', {detail: {value, src: this}, bubbles: true, cancelable: true}));
    if (prop.watch)
        prop.watch.call(this, value, old);
}

function makeReactive(obj, props, old) {
    if (!isObject(obj)) return obj;

    let d = obj.__op__;
    let hosts = d && d.hosts;
    if (hosts){
        const val = hosts.get(this);
        if (val)
            return  val;
        obj = obj.__op__.obj;
    }
    else {
        if (Array.isArray(obj)){
            for (let i = 0, l = obj.length; i<l; i++){
                obj[i] = makeReactive.call(this, obj[i]);
            }
        }
        else if (!isNativeObject(obj)) return obj;
    }
    const handlers = {
        get: (target, key)=>{
            let val = target[key];
            if (val && (typeof val === 'function' || typeof key === 'symbol' || (Array.isArray(target) && !/\d+/.test(key)) || /^__/.test(key)))
                return val;
            if (this.$core.target && !Array.isArray(target) && this.$core.target !== key){
                let deps = this.$core.deps[key];
                if (!deps)
                    deps = this.$core.deps[key] = this.$core.observers[this.$core.target] || [];
                else{
                    for (let h of this.$core.observers[this.$core.target] || [])
                        deps.add(h)
                }
            }
            const prop = props && props[key];
            if (prop){
                if (prop.computed) {
                    if (!val){
                        const before = this.$core.target;
                        this.$core.target = key;
                        val = prop.computed.call(this);
                        if (!prop.freeze)
                            val = makeReactive.call(this, val);
                        target[key] = val;
                        this.$core.target = before;
                        for (let host of target.__op__.hosts.keys()){
                            // host.notify(key, true);
                            prop && signals.call(host, prop, val);
                        }
                    }
                    return val;
                }
                else if (prop.freeze){
                    return val;
                }
            }
            return val && makeReactive.call(this, val);
        },
        set:(target, key, value)=>{
            let prop = props && props[key];
            if (value !== undefined && prop){
                if (prop.type === Boolean)
                    value = (value === 'true') || !!value;
                else if (prop.type === Number)
                    value = +value;
            }
            const old = target[key];
            if (old === value) return true;
            if (value && (!prop || !prop.freeze)){
                value = makeReactive.call(this, value, undefined, old);
                if (old === value) return true;
            }
            target[key] = value;
            for (let host of target.__op__.hosts.keys()){
                host.notify(key/*, value === undefined*/);
                prop && signals.call(host, prop, value, old);
            }
            return true;
        }
    };

    const proxy= new Proxy(obj, handlers);
    if (!hosts){
        const options = (old && old.__op__) || {proxy, main: this, obj, self: {}};
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
function funcToAttribute(name){
    const val = this.$core.data[name];
    name = name.toKebabCase();
    if (val === false || val === undefined || val === null || val === '')
        this.removeAttribute(name);
    else
        this.setAttribute(name, val === true?'':val);
}
let sid = 0;
class VNode{
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
    setCache(el){
        this.cache[el.nodeName] = this.cache[el.nodeName] || [];
        this.cache[el.nodeName].add(el);
    }
    getCache(tag){
        return (this.cache[tag] || []).shift()
    }
}
function  translate(text, language){
    return text;// && 'РУС';
}
const dirRE = /^((oda|[a-z])?-)|~/;
function parseJSX(prototype, el, vars = []){
    if (typeof el === 'string'){
        let tmp = document.createElement('template');
        tmp.innerHTML = el;
        tmp = tmp.content.childNodes;
        return Array.prototype.map.call(tmp, el=>parseJSX(prototype, el)).filter(i=>i);
    }
    let src = new VNode(el, vars);
    if (el.nodeType === 3){
        let value = el.textContent.trim();
        if (!value) return;
        const isStyle = el.parentElement && (el.parentElement.nodeName === 'STYLE' || el.parentElement.getAttribute('is') === 'style');
        if(/\{\{((?:.|\n)+?)\}\}/g.test(value)) {
            let expr = value.replace(/^|$/g, "'").replace(/{{/g, "'+(").replace(/}}/g, ")+'").replace(/\n/g, "\\n").replace(/\+\'\'/g, "").replace(/\'\'\+/g, "");
            if (prototype[expr])
                expr +='()';
            const fn = func(vars.join(','), expr);
            src.text = src.text || [];
            src.text.push(function textContent($el){
                let value = exec.call(this, fn, $el.$for);
                if ($el._text === value) return;
                $el._text = value;
                $el.nodeValue = isStyle?value:translate(value, src.language);
            });
        }
        else if (isStyle){
           src.textContent = value;
        }
        else
            src.textContent = translate(value, src.language);
    }
    else if (el.nodeType === 8){
        src.textContent = el.textContent;
    }
    else {
        for (const attr of el.attributes){
            let name = attr.name;
            let expr = attr.value;
            let modifiers;
            if (prototype[expr])
                expr+='()';
            if (/^(:|bind:)/.test(attr.name)){
                name = name.replace(/^(::?|:|bind::?)/g, '');
                if (tags[name])
                    new Tags(src, name, expr, vars);
                else if (directives[name])
                    new Directive(src, name, expr, vars);
                else if (name === 'for')
                    return forDirective(prototype, src, name, expr, vars, attr.name);
                else{
                    if (expr === '')
                        expr = attr.name.replace(/:+/,'').toCamelCase();
                    let fn = func(vars.join(','), expr);
                    if (/::/.test(attr.name)){
                        const params = ['$value', ...(vars || [])];
                        src.listeners.input = function func2wayInput (e) {
                            if (!e.target.parentNode) return;
                            let value = e.target.value;
                            const target = e.target;
                            switch (e.target.type) {
                                case 'checkbox':{
                                    value = e.target.checked;
                                }
                            }
                            target.__lockBind = name;
                            const handle = ()=>{
                                target.__lockBind = false;
                                target.removeEventListener('blur', handle);
                            };
                            target.addEventListener('blur', handle);
                            target.dispatchEvent(new CustomEvent(name+'-changed', {detail: {value}}));
                        };
                        const func = new Function(params.join(','), `with (this) {${expr} = $value}`);
                        src.listeners[name+'-changed'] = function func2wayBind (e, d) {
                            if (!e.target.parentNode) return;
                            let  res = e.detail.value === undefined?e.target[name]:e.detail.value;
                            if (e.target.$node.vars.length){
                                let idx = e.target.$node.vars.indexOf(expr);
                                if (idx%2 === 0){
                                    const array = e.target.$for[idx+2];
                                    const index = e.target.$for[idx+1];
                                    array[index] = e.target[name];
                                    return;
                                }
                            }
                            exec.call(this, func, [res, ...(e.target.$for || [])]);
                        };
                        src.listeners[name+'-changed'].notify = name;
                    }
                    const h = function(params){
                        return exec.call(this, fn, params);
                    };
                    h.modifiers = modifiers;
                    src.bind = src.bind || {};
                    src.bind[name.toCamelCase()] = h;
                }
            }
            else if (dirRE.test(name)){
                name = name.replace(dirRE, '');
                if (name === 'for')
                    return forDirective(prototype, src, name, expr, vars, attr.name);
                else if (tags[name])
                    new Tags(src, name, expr, vars);
                else if (directives[name])
                    new Directive(src, name, expr, vars);
                else
                    throw new Error('Unknown directive '+attr.name);
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
                src.listeners[name] = function (e){
                    modifiers && modifiers.stop && e.stopPropagation();
                    modifiers && modifiers.prevent && e.preventDefault();
                    if(typeof handler === 'function')
                        handler.call(this, e, e.detail);
                    else
                        exec.call(this, fn, [e, e.detail, ...(e.target.$for || [])]);
                };
            }
            else if (name === 'is')
                src.tag = expr.toUpperCase();
            else if (name === 'ref'){
                new Directive(src, name, "\'"+expr+"\'", vars);
            }
            else{
                src.attrs = src.attrs || {};
                src.attrs[name] =  expr;
            }

        }
        if (src.attrs && src.dirs){
            for (const a of Object.keys(src.attrs)){
                if (src.dirs.find(f=>f.name === a)) {
                    src.vals = src.vals || {};
                    src.vals[a] = src.attrs[a];
                    delete src.attrs[a];
                }
            }
        }
        src.children =  Array.from(el.childNodes).map(el=>{
            return parseJSX(prototype, el, vars)
        }).filter(i=>i);
    }
    return src;
}
const tags = {
    if(tag, fn, p, $el){
        let t = exec.call(this, fn, p);
        return t?tag:'#comment';
    },
    'else-if'(tag, fn, p, $el){
        if (!$el || ($el.previousElementSibling && $el.previousElementSibling.nodeType === 1))
            return '#comment';
        return exec.call(this, fn, p)?tag:'#comment';
    },
    else(tag, fn, p, $el){
        if (!$el || ($el.previousElementSibling && $el.previousElementSibling.nodeType === 1))
            return '#comment';
        return tag;
    },
    is(tag, fn, p){
        return (exec.call(this, fn, p) || '').toUpperCase() || tag;
    }
};
const directives = {
    'save-key'($el, fn, p){
        const key = exec.call(this, fn, p);
        $el.setProperty('saveKey', key);

    },
    props($el, fn, p){
        const props = exec.call(this, fn, p);
        for (let i in props){
            $el.setProperty(i, props[i]);
        }
    },
    ref($el, fn, p){
        const ref = exec.call(this, fn, p);
        if ($el.$ref === ref) return;
        $el.$ref = ref;
        this.$core.$refs = null;
    },
    show($el, fn, p){
        $el.style.display = exec.call(this, fn, p)?'':'none';
    },
    html($el, fn, p){
        const html = exec.call(this, fn, p) || '';
        if ($el.$cache.innerHTML === html) return;
        $el.innerHTML = $el.$cache.innerHTML = html;
    },
    text($el, fn, p){
        let val = exec.call(this, fn, p);
        if (val === undefined)
            val = '';
        if ($el.$cache.textContent === val) return;
        $el.$cache.textContent = val;
        $el.textContent = translate(val);
    },
    class($el, fn, p){
        let s = exec.call(this, fn, p) || '';
        if (Array.isArray(s))
            s = s[0];
        if (!Object.equal($el.$class, s)){
            $el.$class = s;
            if (typeof s === 'object')
                s = Object.keys(s).filter(i=>s[i]).join(' ');
            if ($el.$node.vals && $el.$node.vals.class)
                s = (s?(s+' '):'') + $el.$node.vals.class;
            $el.setAttribute('class', s);
        }
    },
    style($el, fn, p){
        let s = exec.call(this, fn, p) || '';
        if (!Object.equal($el.$style, s)){
            $el.$style = s;
            if(Array.isArray(s))
                s = s.join('; ');
            else if (isObject(s))
                s = Object.keys(s).filter(i=>s[i]).map(i=>i.toKebabCase()+': '+s[i]).join('; ');
            if ($el.$node.vals && $el.$node.vals.style)
                s = $el.$node.vals.style+(s?('; '+s):'');
            $el.setAttribute('style', s);
        }
    }
};
class Directive {
    constructor(src, name, expr, vars){
        src.fn[name] = func(vars.join(','), expr);
        src.fn[name].expr = expr;
        src.dirs = src.dirs || [];
        src.dirs.push(directives[name])
    }
}
class Tags {
    constructor(src, name, expr, vars){
        src.fn[name] = expr?func(vars.join(','), expr):null;
        src.tags = src.tags || [];
        src.tags.push(tags[name])
    }
}
function  forDirective(prototype, src, name, expr, vars, attrName){
    const newVars = expr.replace(/\s(in|of)\s/, '\n').split('\n');
    expr = newVars.pop();
    const params = (newVars.shift() || '').replace('(', '').replace(')', '').split(',');
    forVars.forEach((varName, i) =>{
        let p  = (params[i] || forVars[i]).trim();
        let pp = p;
        let idx = 1;
        while (vars.find(v =>p === v)){
            p = pp + idx; ++idx;
        }
        newVars.push(p);
    });
    src.vars = [...vars];
    src.vars.push(...newVars);
    src.el.removeAttribute(attrName);
    const child = parseJSX(prototype, src.el, src.vars);
    const fn = func(src.vars.join(','), expr);
    const h =  function (p = []) {
        let items = exec.call(this, fn, p);
        if(!Array.isArray(items)){
            items = new Array(+items || 0);
            for (let i = 0; i < items.length; items[i++] = i);
        }
        return items.map((item,  i) =>{
            return  {child, params: [...p, item, i, items]}
        })
    };
    h.src = child;
    return h;
}

function createElement(src, tag, old) {
    let $el;// = src.getCache(tag);
    if (!$el){
        if (tag === '#comment')
            $el = document.createComment((src.textContent || src.id) + (old?(': '+old.tagName):''));
        else if (tag === '#text')
            $el = document.createTextNode(src.textContent||'');
        else if (src.svg)
            $el = document.createElementNS(svgNS, tag.toLowerCase());
        else{
            $el = document.createElement(tag);
            if (tag !== 'STYLE')
                this.$core.io.observe($el);
            if (src.attrs)
                for (let i in src.attrs)
                    $el.setAttribute(i, src.attrs[i]);
        }
        $el.$cache = {};
        $el.$node = src;
        $el.domHost = this;
        for (const e in src.listeners || {})
            $el.addEventListener(e, src.listeners[e].bind(this));
    }
    else if ($el.nodeType === 1){
        for (let i of $el.attributes){
            $el.removeAttribute(i.name);
        }
    }
    this.$core.refs = null;
    return $el;
}
function render(){
    updateDom.call(this, this.$core.node, this.$core.shadowRoot);
    this.$core.__inRender = false;
}
function  updateDom(src, $el, $parent, pars){
    if ($parent){
        let tag = src.tag;
        if (src.tags){
            for (let h of src.tags)
                tag = h.call(this, tag, src.fn[h.name], pars, $el);
        }
        if (!$el){
            $el = createElement.call(this, src, tag);
            $parent.appendChild($el);
        }
        else if ($el.$node.id !== src.id){
            const el = createElement.call(this, src, tag);
            $parent.replaceChild(el, $el);
            $el = el;
        }
        else if ($el.slotTarget){
            $el = $el.slotTarget;
        }
        else if($el.nodeName !== tag){
            const el = createElement.call(this, src, tag, $el);
            $parent.replaceChild(el, $el);
            el.$ref =  $el.$ref;
            $el = el;
        }
    }

    $el.$for = pars;

    if (!$el.$freeze && $el.children){
        for (let i = 0, idx = 0, l = src.children.length; i<l; i++){
            let h = src.children[i];
            if (typeof h === "function"){
                for (const node of h.call(this, pars)){
                    updateDom.call(this, node.child, $el.childNodes[idx], $el, node.params);
                    idx++;
                }
                let el = $el.childNodes[idx];
                while(el && el.$node === h.src){
                    el.remove();
                    el = $el.childNodes[idx];
                }
            }
            else{
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
        for (let i in src.bind){
            const b = src.bind[i].call(this, pars);
            if (b === undefined && src.listeners[i+'-changed'] && $el.fire){
                requestAnimationFrame(()=>{
                    $el.fire(i+'-changed');
                });
            }
            else{
                $el.setProperty(i, b);
            }

            // if(this.$node){
            //     for(let event in this.$node.listeners){
            //         if(this.$node.listeners[event].notify)
            //             this.fire(event);
            //         // this.$node.listeners[event].call(this)
            //     }
            // }
        }

    if ($el.$core)
        for (let i in $el.$core.style || {})
            $el.style[i] = $el.$core.style[i];
    if ($el.$core){
        $el.render();
    }
    else if ($el.localName === 'slot'){
        for (let el of $el.assignedElements()){
            el.render && el.render();
        }
    }
    if (!$el.slot || $el.slotProxy) return;

    this.$core.io.unobserve($el);
    const el = createElement.call(this, src, '#comment');
    el.slotTarget = $el;
    $el.slotProxy = el;
    el.textContent += `-- ${$el.localName} (slot: "${$el.slot}")`;

    if ($el.$ref) {
        let arr = this.$core.slotRefs[$el.$ref];
        if (arr)
            arr.push($el);
        else if ($el.$for)
            this.$core.slotRefs[$el.$ref] = [$el];
        else
            this.$core.slotRefs[$el.$ref] = $el;
    }
    $parent.replaceChild(el, $el);

    requestAnimationFrame(()=>{
        let host;
        for (host of this.$core.shadowRoot.querySelectorAll('*')){
            if (host.$core && host.$core.prototype.slots && host.$core.prototype.slots.includes($el.slot)){
                host.appendChild($el);
                return;
            }
        }

        host = this;
        while(host){
            for (let ch of host.children){
                if (ch.$core && ch.$core.prototype.slots && ch.$core.prototype.slots.includes($el.slot)){
                    ch.appendChild($el);
                    return;
                }
            }
            if (host.$core.prototype.slots && host.$core.prototype.slots.includes($el.slot)){
                host.appendChild($el);
                return;
            }
            host = host.domHost;
        }
        this.appendChild($el);
    })

}

let renderQueue = [], rafID = 0 , limit = 30;
ODA.render = function(renderer){
    renderQueue.push(renderer);
    if (renderQueue.length>1 || rafID) return;
    // rafID && cancelAnimationFrame(rafID);
    rafID = requestAnimationFrame(raf);
};
function raf() {
    rafID = 0;
    let now = new Date();
    while (renderQueue.length && (new Date() - now < limit)){
        renderQueue.shift()();
    }
    // limit = 15;
    if (!renderQueue.length) return;
    rafID && cancelAnimationFrame(rafID);
    rafID = requestAnimationFrame(raf);
}

function parseModifiers (name) {
    if (!name) return;
    const match = name.match(modifierRE);
    if (!match) return;
    const ret = {};
    match.forEach(function (m) { ret[m.slice(1)] = true; });
    return ret
}
const reDotQ = /(\b\S+\?\.)?/g;
function func (vars, expr) {
    try{
        if (reDotQ.test(expr)){
            const matches = expr.match(reDotQ).filter(i=>i);
            for (let str of matches){
                let res = str.split('?.').filter(i =>i ).reduce((res, v)=>{
                    if (res.length)
                        res.push(res[res.length-1]+'.'+ v);
                    else
                        res.push(v);
                    return res;
                }, []);
                res = '(('+res.join(' && ') +') || {}).';
                expr = expr.replace(str, res);
            }
        }
        return new Function(vars, `with (this) {return (${expr})}`);
    }
    catch (e) {
        console.error(e);
    }
}
function exec (fn, p = []){
    try{
        return fn.call(this, ...p);
    }
    catch(e){
        console.error(e);
        console.warn(fn.toString(), p, this);
    }
}
const forVars = ['item', 'index', 'items'];
const svgNS = "http://www.w3.org/2000/svg";
const modifierRE = /\.[^.]+/g;
Object.defineProperty(Element.prototype, 'error',{
    set(v) {
        const target =  (this.nodeType === 3 && this.parentElement)?this.parentElement:this;
        if (target.nodeType === 1){
            if (v){
                target.setAttribute('part', 'error');
                target.setAttribute('oda-error', v);
            }
            else{
                target.removeAttribute('part');
                target.removeAttribute('oda-error');
            }
        }
    }
});
Array.prototype.has = Array.prototype.includes;
Array.prototype.clear = function () {
    this.splice(0);
};
Array.prototype.add = function (...item) {
    for (let i of item){
        if (this.includes(i)) continue;
        this.push(i);
    }
};
Array.prototype.remove = function (...items) {
    for (const item of items){
        const idx = this.indexOf(item);
        if (idx <0) continue;
        this.splice(idx, 1);
    }
};
function cached (fn) {
    const cache = Object.create(null);
    return (function cachedFn (str) {
        return cache[str] || (cache[str] = fn(str))
    })
}
const kebabGlossary = {};
function toKebab(str){
    return (kebabGlossary[str] = str.replace(/\B([A-Z])/g, '-$1').toLowerCase());
}
String.prototype.toKebabCase = function () {
    const s = this.toString();
    const str = kebabGlossary[s];
    return str?str:toKebab(s);
};
const camelGlossary = {};
function toCamel(str){
    return (camelGlossary[str] = str.replace(/-(\w)/g, function (_, c) { return c ? c.toUpperCase() : ''}))
};
String.prototype.toCamelCase = function (){
    const s = this.toString();
    const str = camelGlossary[s];
    return str?str:toCamel(s);
};
ODA.mainWindow = window;
try{
    while(ODA.mainWindow.parent && ODA.mainWindow.parent !== ODA.mainWindow) {
        ODA.mainWindow = ODA.mainWindow.parent;
    }
}
catch(e){
    console.dir(e);
}
ODA.origin = origin;
ODA.telemetry = {proxy: 0,  components: {count: 0}, clear:()=>{
        for (const i of Object.keys(ODA.telemetry)){
            if (typeof ODA.telemetry[i] === 'number')
                ODA.telemetry[i] = 0;
        }
    }};
ODA.modules = [];
ODA.tests = {};
window.onerror = (...e) => {
    const module = ODA.modules.find(i=>i.path === e[1]);
    if (module){
        ODA.error(module.id, e[4].stack);
        return true;
    }
    else if (document.currentScript && e[0].includes('SyntaxError')){
        let s = document.currentScript.textContent;
        let idx = s.indexOf('is:');
        if (idx>0){
            s = s.substring(idx + 3);
            s = s.replace(/'/g, '"');
            s = s.substring(s.indexOf('"')+1);
            s = s.substring(0, s.indexOf('"'));
            if (s.includes('-')){
                ODA({
                    is: s,
                    template: `<span class="error border" style="cursor: help; padding: 2px; background-color: yellow; margin: 2px" title="${e[0]}'\n'${e[1]} - (${e[2]},${e[3]})">error: &lt;${s}&gt;</span>`
                })
            }
        }
    }
    return false;
};
ODA.error = (component, ...args)=>{
    ODA.console( component, console.error, 'red', ...args);
};
ODA.warn = (component, ...args)=>{
    ODA.console(component, console.warn, 'orange', ...args);
};
ODA.success = (component, ...args)=>{
    ODA.console(component, console.log, 'green', ...args);
};
ODA.log = (component, ...args)=>{
    ODA.console(component, console.log, 'gray', ...args);
};
ODA.console = (component = {}, method, color, ...args)=>{
    component = (component && component.localName) || component;
    method(`%c<${component}>`, `color: white; font-weight: bold; background-color: ${color}; padding: 1px 8px; border-radius: 8px`, ...args)
};
const cache = {
    fetch: {},
    file: {}
};
ODA.loadURL = async function(url){
    if (!cache.fetch[url])
        cache.fetch[url] = fetch(url);
    return cache.fetch[url];
};
ODA.loadJSON = async function(url) {
    if (!cache.file[url]){
        cache.file[url] = new Promise(async (resolve, reject) => {
            try{
                const file = await ODA.loadURL(url);
                const text =  await file.json();
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
ODA.loadHTML = async function(url) {
    if (!cache.file[url]){
        cache.file[url] = new Promise(async (res) => {
            const file = await ODA.loadURL(url);
            const text =  await file.text();
            res(pars.parseFromString(text, 'text/html'))
        });
    }
    return cache.file[url];
};
class odaRouter{
    constructor() {
        this.rules = {};
        this.root = window.location.pathname.replace(/(?<=\/)[a-zA-Z]+\.[a-zA-Z]+$/, '');
        window.addEventListener('popstate', (e) => {
            this.run((e.state && e.state.path) || '');
        })
    }
    create(rule, callback){
        for(let r of rule.split(',')){
            r = r || '__empty__';
            this.rules[r] = this.rules[r] || [];
            if(!this.rules[r].includes(callback))
                this.rules[r].push(callback);
        }
    }
    set currentRoute(v){
        this._current = v;
    }
    go(path, idx = 0){
        if(path.startsWith('#')){
            const hash = window.location.hash.split('#');
            hash.unshift();
            while (hash.length>idx+1){
                hash.pop();
            }
            path = hash.join('#')+path;

        }
        window.history.pushState({path}, null, path);
        this.run(path)
    }
    run(path){
        rules:for (let rule in this.rules){
            if(rule === '__empty__'){
                if(path) continue;
            }
            else{
                chars:for(let i = 0, char1, char2; i<rule.length; i++){
                    char1 = rule[i];
                    char2 = path[i];
                    switch (char1) {
                        case '*':
                            break chars;
                        case '?':
                            if(char2 === undefined) continue rules;
                            break;
                        default:
                            if(char1 !== char2) continue rules;
                            break;
                    }
                }
            }
            for(let h of this.rules[rule])
                h(path)
        }
    }
    back(){
        window.history.back();
    }
}
ODA.router = new odaRouter();
const hooks = ['created', 'ready', 'attached', 'detached', 'updated', 'destroyed'];
ODA.loadScript = async function (url) {
    return ODA.cache('load-script:' + url, ()=>{
        return new Promise(function (resolve, reject) {
            let script = document.createElement("script");
            script.onload = function (e) {
                globalThis.loader && globalThis.loader.off();
                resolve(script);
            };
            script.onerror = function (e) {
                globalThis.loader && globalThis.loader.off();
                script.remove();
                script = null;
                reject(new Error('error on load script', url));
            };
            script.async = true;
            script.type = "text/javascript";
            if (ODA.origin && ODA.origin !== document.location.origin && !url.startsWith(ODA.origin))
                url = ODA.origin + url;
            script.src = encodeURI(url);
            globalThis.loader && globalThis.loader.on(100);
            document.head.appendChild(script);
        });
    });
};
ODA.loadLink = function (url){
    return ODA.cache('load-link: '+url, ()=>{
        return new Promise((resolve, reject) => {
            const link = document.createElement("link");
            link.addEventListener('load', e=>{
                resolve(link);
            });
            link.onerror = e => {
                console.error(e);
                reject(e);
            };
            link.rel = "import";
            if (ODA.origin && ODA.origin !== document.location.origin && !url.startsWith(ODA.origin))
                url = ODA.origin + url;
            link.href = url;
            document.head.appendChild(link);
        });
    });
};
function load (){
    document.body.hidden = true;
    const links = Array.prototype.map.call(document.head.querySelectorAll('link[rel=oda-import]'), i=>{
        return ODA.loadLink(i.href);
    });
    Promise.all(links).then(()=>{
        document.body.hidden = false;
    })
}
const toString = Object.prototype.toString;
function isNativeObject (obj) {
    return toString.call(obj) === '[object Object]';
}
function def (obj, key, val, enumerable) {
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
    else if (isNativeObject(obj)){
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
            for (let i = 0; i < path.length; i++){
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
            if (prop){
                this.$core.data[name] = v;
                return;
            }
        }

    }
    if (typeof v === 'object' || this.nodeType !== 1 || (this.$node && this.$node.vars.has(name))) {
        if (this.$core){
            this.$core.data[name] = v;
            return;
        }
        this[name] = v;
    }
    else {
        const d = !this.$core && getDescriptor(this.__proto__, name);
        if (!d)
            name = name.toKebabCase();
        else if (d.set && v !== undefined){
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

Node.prototype.render = function () {
    if (this.$freeze || !this.$node) return;
    updateDom.call(this.domHost, this.$node, this,  this.parentNode, this.$for);
};
if (document.body) {
    load();
} else {
    document.addEventListener('DOMContentLoaded', load);
}
class odaEvent{
    constructor(target, handler, ...args){
        this.handler = handler;
        target.__listeners = target.__listeners || {};
        target.__listeners[this.event] = target.__listeners[this.event] || new Map();
        target.__listeners[this.event].set(handler, this);
        this._target = target;
        this._events = {};
    }
    static remove(name, target, handler){
        const event = target.__listeners && target.__listeners[name] && target.__listeners[name].get(handler);
        event && event.delete();
    }
    get event(){
        return 'event'
    }
    addSubEvent(name, handler, useCapture){
        this._events[name] = handler;
        this._target.addEventListener(name, handler, useCapture);
    }
    delete(){
        for(const name in this._events){
            if(this._events.hasOwnProperty(name)){
                this._target.removeEventListener(name, this._events[name]);
            }
        }
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

class  odaCustomEvent extends CustomEvent{
    constructor(name, params, source){
        super(name, params);
        if(source){
            const props = {
                path:{
                    value: source.path
                },
                currentTarget:{
                    value: source.currentTarget
                },
                target:{
                    value: source.target
                },
                stopPropagation:{
                    value: () => source.stopPropagation()
                },
                preventDefault:{
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
class odaEventTap extends odaEvent{
    constructor(target, handler, ...args){
        super(target, handler, ...args);
        // if (!target.onclick) {
        //     target.onclick = () => void(0);
        // }
        this.addSubEvent('click', (e) => {
            const ce = new odaCustomEvent("tap", {detail: {sourceEvent: e}}, e);
            this.handler(ce, ce.detail);
        });
    }
    get event(){
        return 'tap'
    }
}
class odaEventDown extends odaEvent{
    constructor(target, handler, ...args){
        super(target, handler, ...args);
        this.addSubEvent('mousedown', (e) => {
            const ce = new odaCustomEvent("down", {detail: {sourceEvent: e}}, e);
            this.handler(ce, ce.detail);
        });
    }
    get event(){
        return 'down'
    }
}
class odaEventUp extends odaEvent{
    constructor(target, handler, ...args){
        super(target, handler, ...args);
        this.addSubEvent('mouseup', (e) => {
            const ce = new odaCustomEvent("up",{detail: {sourceEvent: e}}, e);
            this.handler(ce, ce.detail);
        });
    }
    get event(){
        return 'up'
    }
}
class odaEventTrack extends odaEvent {
    constructor(target, handler, ...args) {
        super(target, handler, ...args);
        this.addSubEvent('mousedown', (e) => {
            e.stopPropagation();
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
                const ce = new odaCustomEvent("track",  {detail: Object.assign({}, this.detail)}, e);
                this.handler(ce, ce.detail);
                this.detail.state = 'track';
            }
        };
        const upHandler = (e) => {
            window.removeEventListener('mousemove', moveHandler);
            window.removeEventListener('mouseup', upHandler);
            this.detail.state = 'end';
            const ce = new odaCustomEvent("track", {detail: Object.assign({}, this.detail)}, e);
            this.handler(ce, ce.detail);
        };
    }

    get event() {
        return 'track'
    }
}
if (!Element.prototype.__addEventListener) {
    const func = Element.prototype.addEventListener;
    Element.prototype.addEventListener = function(name, handler, ...args){
        this.__events = this.__events || new Map();
        let array = this.__events.get(name);
        if (!array){
            array = [];
            this.__events.set(name, array);
        }
        const f = ()=>{
            switch (name){
                case 'tap':
                    return new odaEventTap(this, handler, ...args);
                case 'down':
                    return new odaEventDown(this, handler, ...args);
                case 'up':
                    return new odaEventUp(this, handler, ...args);
                case 'track':
                    return new odaEventTrack(this, handler, ...args);
                // case 'resize':
                //     return new odaEventResize(this, handler, ...args);
                default:
                    return func.call(this, name, handler, ...args);
            }
        };
        array.push({handler, event: f()});
    };
}
if (!Element.prototype.__removeEventListener) {
    const func = Element.prototype.removeEventListener;
    Element.prototype.removeEventListener = function(name, handler, ...args){
        if (this.__events){
            const array = this.__events.get(name) || [];
            const idx = array.indexOf(handler);
            if (idx>-1){
                array.splice(idx, 1);
            }
            if (!array.length)
                this.__events.delete(name);
        }
        switch (name){
            case 'tap':
            case 'down':
            case 'up':
            case 'track':{
                odaEvent.remove(name, this, handler);
            } break;
            default:
                func.call(this, name, handler, ...args);
        }
    };
}
ODA._cache = {};
ODA.cache = (key, callback) => {
    ODA._cache[key] = ODA._cache[key] || (typeof callback === 'function')?callback():callback;
    return ODA._cache[key];
};
ODA.createComponent = async (url, params, inner) => {
    const id = await ODA.loadComponent(url);
    let el = document.createElement(id);
    if (params) {
        for (let p in params) {
            el[p] = params[p];
        }
    }
    if (inner)
        el.textContent = inner;
    return el;
};
ODA.loadComponent = async (url) => {
    return ODA.cache('load-component: '+url, async ()=>{
        const link = await ODA.loadLink(url);
        const body = link.import.body ? link.import.body : link.import;
        const module = Array.prototype.find.call(body.children, (e) => e.localName === 'oda-module');
        const load = (link)=>{
            [...link.import.querySelectorAll('link')].forEach(l => {
                if (l.import) {
                    load(l);
                    [...l.import.querySelectorAll('oda-module')].forEach(m => {
                        const t = m.querySelector('template');
                        if (t) {
                            [...t.content.children].forEach(s => {
                                if (s.localName === 'script') {
                                    m.appendChild(s);
                                }
                            });
                        }
                    });
                }
            });
        };
        load(link);
        const t = module && module.querySelector('template');
        if (t) {
            [...t.content.children].forEach(s => {
                if (s.localName === 'script') {
                    module.appendChild(s);
                }
            });
        }
        return (module && module.id);
    })
};

ODA.notify = function(text){
    ODA.push(text);
};
ODA.push = (name = 'Warning!', {tag = 'message', body, icon = '/web/res/icons/warning.png', image}={}) => {
    if (!body){
        body = name;
        name = 'Warning!'
    }
    let params = {tag, body, icon, image};
    switch ( Notification.permission.toLowerCase() ) {
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
ODA.pushError = (error, context)=>{
    if (error instanceof Error)
        error = error.stack;
    const tag = (context && context.displayLabel) || 'Error';
    ODA.push(tag,{
        tag : tag,
        body : error,
        icon : '/web/res/icons/error.png'
    })
};
ODA.getIconUrl = function(icon, item){
    let url = icon;
    if(!url.includes(':') && !url.includes('/web/')){
        url = '/web/res/icons/' + url;
        if(!url.includes('.png'))
            url += '.png';
    }
    url = encodeURI(url);
};

window.ODARect = window.ODARect || class ODARect{
    constructor(element){
        if (element && element.host)
            element = element.host;
        const pos = element?element.getBoundingClientRect():ODA.mousePos;
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
if (!window.DOMRect){
    window.DOMRect = function  (x, y,  width, height){
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
document.addEventListener('mousedown', e =>{
    ODA.mousePos = new DOMRect(e.pageX, e.pageY);
});
// window.odaLocalStorage = window.odaLocalStorage ||  class odaLocalStorage{
//     constructor(path, parent){
//         this._path = path;
//         this._parent = parent;
//         try{
//             if (this._parent){
//                 this._storage = this._parent.getValue(path) || {};
//             }
//             else{
//                 this._storage = JSON.parse(localStorage.getItem(path)) || {};
//             }
//             if(typeof this._storage !== 'object')
//                 this._storage = {};
//         }
//         catch(err){
//             this._storage = {};
//         }
//
//     }
//     setValue(key, value){
//         let path = key.split('/');
//         let s = this._storage;
//         while (typeof s === 'object' && path.length) {
//             let v = path.shift();
//             if (path.length){
//                 s = s[v || '*'] || {};
//             }
//             else{
//                 if (value)
//                     s[v || '*'] = value;
//                 else if (s[v || '*'])
//                     delete s[v || '*'];
//                 break;
//             }
//         }
//         this.save();
//     }
//     getValue(key){
//         let path = key.split('/');
//         let s = this._storage;
//         while (typeof  s === 'object' && path.length) {
//             let v = path.shift();
//             s = s[v || '*'];
//         }
//         return s;
//     }
//     clear(){
//         this._storage = null;
//         this.save();
//         this._storage = {};
//
//     }
//     save(){
//         if (this._parent)
//             this._parent.setValue(this._path, this._storage);
//         else if (this._storage)
//             localStorage.setItem(this._path, JSON.stringify(this._storage));
//         else
//             localStorage.removeItem(this._path);
//     }
// };
window.addEventListener('load', async () => {
    document.oncontextmenu = (e) => {
        e.target.dispatchEvent(new MouseEvent('menu', e));
        return false;
    };
    document.frameworkIsReady = true;
    ODA({is: 'oda-style', template:`
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
                --header-background: lightgrey;
        
        
                --section-background: lightgrey;
                --section-color: black;
        
                --layout-background: white;
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
                    /*filter: brightness(.90);*/
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
                    border-color: red;
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
                    border: var(--success-color) !important;
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
                    background-color: whitesmoke !important;
                    color: var(--focused-color, red) !important;
                    text-decoration: underline;
                    /*border-bottom: 1px solid var(--focused-color) !important;*/
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
        properties:{
            styles:{
                type: Object,
                freeze: true
            },
            theme:{
                default: {},
                freeze: true,
                set(n, o){
                    for(let node of this.$core.data.nodes)
                        node.textContent = this.convert(node);
                    document.querySelector('style[group=theme]').textContent = `\n:root{\n${Object.keys(n).map(key => '\t'+key+': '+n[key]+';\n').join('')}}`
                }
            },
            nodes:{
                default: [],
                freeze: true
            }
        },
        ready(){
            this.elements = Array.from(this.$core.shadowRoot.children);
            const styles = {};
            for (let style of this.elements){
                document.head.appendChild(style);
                for (let i of style.sheet.cssRules) {
                    (i.styleMap || []).forEach((val, key)=>{
                        if (!/^--/.test(key)) return;
                        val = val.toString().trim().replace(/^{|}$/g, '').trim().split(';').join(';');
                        styles[key] = val;
                    });
                }
            }
            const proxy = new Proxy(styles, {
                get:(target, p, receiver) => {
                    let val = target[p];
                    if (typeof val === 'string'){
                        let theme = this.$core.data.theme[p];
                        if (theme)
                            return theme;
                        for (let v of (val.match(regExpApply) || [])){
                            let rule = this.$core.data.styles[v];
                            val = val.replace(new RegExp(`@apply\\s+${v}\s?;`, 'g'), rule);
                        }
                    }
                    return val;
                },
                set:(target, p, value, receiver) =>{
                    target[p] = value;
                    return true;
                }
            });
            const options = {proxy, main: this};
            options.hosts = new Map();
            options.hosts.set(this, proxy);
            Object.defineProperty(styles, '__op__', {
                enumerable: false,
                configurable: true,
                value: options
            });
            this.styles = proxy;
        },
        convert(node, style){
            node.style = style || node.style || node.textContent;
            this.$core.data.nodes.add(node);
            let res = node.style;
            if (!res) return res;
            for (let v of (res.match(regExpApply) || [])){
                let rule = this.$core.data.styles[v];
                if(rule)
                    res = res.replace(new RegExp(`@apply\\s+${v}\s?;`, 'g'), rule);
            }
            return res;
        },
        update(updates = {}){
            if (Object.keys(updates).length === 0)
                this.$core.data.theme = updates;
            else
                this.$core.data.theme = Object.assign({}, this.$core.data.theme, updates);
        }
    });
    ODA.style = document.createElement('oda-style');
    document.dispatchEvent(new Event('framework-ready'));
    if (document.body.firstElementChild.tagName === 'ODA-TESTER')
        import('./tools/tester/tester.js');

});
