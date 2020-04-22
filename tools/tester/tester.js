import '../property-grid/property-grid.js';
import '../../components/layouts/app-layout/app-layout.js';
ODA({is: 'oda-tester', extends: 'oda-app-layout', template:`
    <oda-property-grid :inspected-object="component" slot="left-drawer"></oda-property-grid>
    <span slot="top-left" class="no-flex center" style="font-weight: bold; font-size: large;">{{label}}</span>
    <oda-button slot="top-right" allow-toggle ::toggled="center" class="raised" icon="enterprise:target" style="margin-right: 4px"></oda-button>
    <slot @slotchange="onSlot"></slot>`,
    props:{
        label:{
            get(){
                return this.component && (this.component.localName || this.component.label || this.component.title || 'component') || 'no component';
            }
        },
        component: {
            default: null,
        },
        center: false
    },
    onSlot(e){
        const els = e.target.assignedElements();
        if (!els.length) return;
        this.component = els.length?els[0]:null;
        if (this.component){
            this.component.setAttribute('slot', 'main')
        }
    }
});
export class TestDataSet extends Array{
    constructor(length = 10, deep = 5, params = {}) {
        super();
        this.length = length;
        for (let i = 0; i < length; i++){
            this[i] = new TestDataSetItem(length, deep, params);
        }
    }
}
export class TestDataSetItem{
    id = getGuid();
    label = tossACoin() ? `label` : `very long label of the field for checking overflow. just in case anything happens #${this.id}`;
    name = tossACoin() ? `name #${this.id}` : `very long name of the field for checking overflow. just in case anything happens #${this.id}`;
    constructor(length = 10, deep = 0, params = {}) {
        if (params.icon) {
            switch (params.icon) {
                case 'random': this.icon = getRandomIcon(); break;
                case 'random:random': this.icon = tossACoin() ? getRandomIcon() : undefined; break;
                case 'no':
                default: break;
            }
        }
        if (deep) {
            const l = tossACoin() ? getRandomInt(0, length) : 0;
            this.items = new TestDataSet(l, --deep, params);
        }
    }
}
export function tossACoin() {
    return Boolean(Math.round(Math.random()));
}
export function getRandomInt(min = 0, max = 100) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
}
export const simpleIconList = [
    'icons:3d-rotation', 'icons:accessibility', 'icons:account-balance', 'icons:account-balance-wallet', 'icons:account-box', 'icons:account-circle', 'icons:add', 'icons:add-alert', 'icons:add-box', 'icons:add-circle', 'icons:add-circle-outline', 'icons:add-shopping-cart', 'icons:alarm', 'icons:alarm-add', 'icons:alarm-off', 'icons:alarm-on', 'icons:android', 'icons:announcement', 'icons:apps', 'icons:archive', 'icons:arrow-back', 'icons:arrow-drop-down', 'icons:arrow-drop-down-circle', 'icons:arrow-drop-up', 'icons:arrow-forward', 'icons:aspect-ratio', 'icons:assessment', 'icons:assignment', 'icons:assignment-ind', 'icons:assignment-late', 'icons:assignment-return', 'icons:assignment-returned', 'icons:assignment-turned-in', 'icons:attachment', 'icons:autorenew', 'icons:backspace', 'icons:backup', 'icons:block', 'icons:book', 'icons:bookmark', 'icons:bookmark-border', 'icons:bug-report', 'icons:build', 'icons:cached', 'icons:camera-enhance', 'icons:cancel', 'icons:card-giftcard', 'icons:card-membership', 'icons:card-travel', 'icons:change-history', 'icons:check', 'icons:check-box', 'icons:check-box-indeterminate', 'icons:check-box-outline-blank', 'icons:check-circle', 'icons:chevron-left', 'icons:chevron-right', 'icons:chrome-reader-mode', 'icons:class', 'icons:clear', 'icons:close', 'icons:cloud', 'icons:cloud-circle', 'icons:cloud-done', 'icons:cloud-download', 'icons:cloud-off', 'icons:cloud-queue', 'icons:cloud-upload', 'icons:code', 'icons:collapse-tree', 'icons:content-copy', 'icons:content-cut', 'icons:content-paste', 'icons:create', 'icons:create-new-folder', 'icons:credit-card', 'icons:dashboard', 'icons:delete', 'icons:description', 'icons:dns', 'icons:done', 'icons:done-all', 'icons:drafts', 'icons:drop', 'icons:eject', 'icons:error', 'icons:error-outline', 'icons:event', 'icons:event-seat', 'icons:exit-to-app', 'icons:expand-less', 'icons:expand-more', 'icons:expand-tree', 'icons:explore', 'icons:extension', 'icons:face', 'icons:favorite', 'icons:favorite-border', 'icons:feedback', 'icons:file-download', 'icons:file-upload', 'icons:filter', 'icons:filter-list', 'icons:find-in-page', 'icons:find-replace', 'icons:flag', 'icons:flight-land', 'icons:flight-takeoff', 'icons:flip-to-back', 'icons:flip-to-front', 'icons:folder', 'icons:folder-extension', 'icons:folder-open', 'icons:folder-shared', 'icons:font-download', 'icons:forward', 'icons:fullscreen', 'icons:fullscreen-exit', 'icons:gesture', 'icons:get-app', 'icons:gif', 'icons:grade', 'icons:group-work', 'icons:help', 'icons:help-outline', 'icons:highlight-off', 'icons:history', 'icons:home', 'icons:hourglass-empty', 'icons:hourglass-full', 'icons:http', 'icons:https', 'icons:inbox', 'icons:indeterminate-check-box', 'icons:info', 'icons:info-outline', 'icons:input', 'icons:invert-colors', 'icons:label', 'icons:label-outline', 'icons:language', 'icons:launch', 'icons:link', 'icons:list', 'icons:lock', 'icons:lock-open', 'icons:lock-outline', 'icons:loyalty', 'icons:mail', 'icons:markunread', 'icons:markunread-mailbox', 'icons:menu', 'icons:more-horiz', 'icons:more-vert', 'icons:note-add', 'icons:offline-pin', 'icons:open-in-browser', 'icons:open-in-new', 'icons:open-with', 'icons:pageview', 'icons:payment', 'icons:perm-camera-mic', 'icons:perm-contact-calendar', 'icons:perm-data-setting', 'icons:perm-device-information', 'icons:perm-identity', 'icons:perm-media', 'icons:perm-phone-msg', 'icons:perm-scan-wifi', 'icons:picture-in-picture', 'icons:play-for-work', 'icons:polymer', 'icons:power-settings-new', 'icons:print', 'icons:query-builder', 'icons:question-answer', 'icons:radio-button-checked', 'icons:radio-button-unchecked', 'icons:receipt', 'icons:redeem', 'icons:redo', 'icons:refresh', 'icons:remove', 'icons:remove-circle', 'icons:remove-circle-outline', 'icons:reorder', 'icons:reply', 'icons:reply-all', 'icons:report', 'icons:report-problem', 'icons:restore', 'icons:room', 'icons:save', 'icons:schedule', 'icons:search', 'icons:select-all', 'icons:send', 'icons:settings', 'icons:settings-applications', 'icons:settings-backup-restore', 'icons:settings-bluetooth', 'icons:settings-brightness', 'icons:settings-cell', 'icons:settings-ethernet', 'icons:settings-input-antenna', 'icons:settings-input-component', 'icons:settings-input-composite', 'icons:settings-input-hdmi', 'icons:settings-input-svideo', 'icons:settings-overscan', 'icons:settings-phone', 'icons:settings-power', 'icons:settings-remote', 'icons:settings-voice', 'icons:shop', 'icons:shop-two', 'icons:shopping-basket', 'icons:shopping-cart', 'icons:sort', 'icons:speaker-notes', 'icons:spellcheck', 'icons:star', 'icons:star-border', 'icons:star-half', 'icons:stars', 'icons:store', 'icons:subject', 'icons:supervisor-account', 'icons:swap-horiz', 'icons:swap-vert', 'icons:swap-vertical-circle', 'icons:system-update-alt', 'icons:tab', 'icons:tab-unselected', 'icons:text-format', 'icons:theaters', 'icons:thumb-down', 'icons:thumb-up', 'icons:thumbs-up-down', 'icons:to-parent', 'icons:toc', 'icons:today', 'icons:toll', 'icons:track-changes', 'icons:translate', 'icons:tree-structure', 'icons:trending-down', 'icons:trending-flat', 'icons:trending-up', 'icons:turned-in', 'icons:turned-in-not', 'icons:undo', 'icons:unfold-less', 'icons:unfold-more', 'icons:up-folder', 'icons:verified-user', 'icons:view-agenda', 'icons:view-array', 'icons:view-carousel', 'icons:view-column', 'icons:view-day', 'icons:view-headline', 'icons:view-list', 'icons:view-module', 'icons:view-quilt', 'icons:view-stream', 'icons:view-week', 'icons:visibility', 'icons:visibility-off', 'icons:warning', 'icons:work', 'icons:youtube-searched-for', 'icons:zoom-in', 'icons:zoom-out'
];
export function getRandomIcon() {
    const idx = Math.floor(Math.random() * simpleIconList.length);
    return simpleIconList[idx];
}
export function getGuid () {
    function s4() {
        return Math.floor((1 + Math.random()) * 0x10000)
            .toString(16)
            .substring(1);
    }

    return s4() + s4() + '-' + s4() + '-' + s4() + '-' +
        s4() + '-' + s4() + s4() + s4();
}
