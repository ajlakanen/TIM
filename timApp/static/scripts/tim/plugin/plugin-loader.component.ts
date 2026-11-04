import moment from "moment";
import type {
    AfterViewInit,
    DoBootstrap,
    NgModuleRef,
    OnDestroy,
    OnInit,
    Type,
} from "@angular/core";
import {
    ApplicationRef,
    Component,
    ContentChild,
    createNgModule,
    ElementRef,
    Input,
    NgModule,
    NgZone,
    ViewChild,
    ViewContainerRef,
} from "@angular/core";
import {FormsModule} from "@angular/forms";
import {platformBrowserDynamic} from "@angular/platform-browser-dynamic";
import {createDowngradedModule, doDowngrade} from "tim/downgrade";
import {vctrlInstance} from "tim/document/viewctrlinstance";
import {TimUtilityModule} from "tim/ui/tim-utility.module";
import {ParCompiler} from "tim/editor/parCompiler";
import {PurifyModule} from "tim/util/purify.module";
import {getURLParameter, getViewName, timeout, toPromise} from "tim/util/utils";
import type {ITimComponent, ViewCtrl} from "tim/document/viewctrl";
import {TimDefer} from "tim/util/timdefer";
import type {ReadonlyMoment} from "tim/util/readonlymoment";
import {timLogTime} from "tim/util/timTiming";
import {Users} from "tim/user/userService";
import {showLoginDialog} from "tim/user/showLoginDialog";
import type {AnswerBrowserComponent} from "tim/answer/answer-browser.component";
import {AnswerBrowserModule} from "tim/answer/answer-browser.component";
import type {IGenericPluginMarkup} from "tim/plugin/attributes";
import {TaskId, TaskIdWithDefaultDocId} from "tim/plugin/taskid";
import type {PluginJson} from "tim/plugin/angular-plugin-base.directive";
import {HttpClient, HttpClientModule} from "@angular/common/http";
import type {IRegisteredPlugin} from "tim/plugin/pluginRegistry";
import {getPlugin} from "tim/plugin/pluginRegistry";
import {BrowserModule} from "@angular/platform-browser";
import {genericglobals, isDocumentGlobals} from "tim/util/globals";

const LAZY_MARKER = "lazy";
const LAZY_MARKER_LENGTH = LAZY_MARKER.length;
const LAZY_COMMENT_MARKER = `<!--${LAZY_MARKER}`;

function isElement(n: Node): n is Element {
    return n.nodeType === Node.ELEMENT_NODE;
}

@Component({
    selector: "tim-plugin-loader",
    template: `
        <tim-alert *ngIf="error" severity="danger">
            {{ error }}
        </tim-alert>
        <ng-template #lockIcon>
            <svg class="login-required-lock-icon" aria-hidden="true" viewBox="0 0 16 16" width="1em" height="1em">
                <path d="M4.5 7V5a3.5 3.5 0 0 1 7 0v2" fill="none" stroke="#4a4a4a" stroke-width="1.6"/>
                <rect x="2.5" y="7" width="11" height="8" rx="1.5" fill="#f2a93b" stroke="#b87514" stroke-width="0.8"/>
                <circle cx="8" cy="10.5" r="1.1" fill="#6b4206"/>
                <rect x="7.4" y="10.8" width="1.2" height="2.2" rx="0.4" fill="#6b4206"/>
            </svg>
        </ng-template>
        <ng-template #lockCard>
            <span class="login-required-lock">
                <ng-container *ngTemplateOutlet="lockIcon"></ng-container>
                <button class="btn btn-default btn-sm login-required-login" type="button" [title]="lockTitle" (click)="openLoginDialog()" i18n>Log in to answer</button>
            </span>
            <button *ngIf="!lockedPluginShown" class="btn btn-link login-required-show" type="button" (click)="showLockedPlugin()" i18n>Show anyway</button>
        </ng-template>
        <div *ngIf="isLocked() && wrapper=='div' && lockedPluginShown" class="login-required-card login-required-bar">
            <ng-container *ngTemplateOutlet="lockCard"></ng-container>
        </div>
        <answerbrowser *ngIf="type != 'none' && parsedTaskId && showBrowser && !preview && !unlockable && !lockedByPrerequisite"
                       [taskId]="parsedTaskId"
                       [answerId]="answerId">
        </answerbrowser>
        <div *ngIf="timed">
            <div *ngIf="running">
                <ng-container i18n>Time left:</ng-container>
                <tim-countdown [endTime]="endTime" (onFinish)="expireTask()"></tim-countdown>
            </div>
            <div i18n *ngIf="expired">
                Your access to this task has expired
            </div>
            <h4 *ngIf="accessHeader && taskHidden">{{accessHeader}}</h4>
            <div *ngIf="unlockable">
                <ng-container i18n>Unlock task. You will have {{accessDuration}} seconds to answer to this task.</ng-container>
                <button i18n i18n-title class="btn btn-primary" (click)="unlockTimedTask()" title="Unlock task">Unlock task</button>
            </div>
            <div *ngIf="expired && accessEndText">{{accessEndText}}</div>
        </div>
        <div *ngIf="lockedByPrerequisite">
            <div>
                {{getPrerequisiteLockedText()}}
            </div>
            <button class="btn btn-primary" (click)="unlockHiddenTask()"
                    title="{{getPrerequisiteUnlockText()}}">{{getPrerequisiteUnlockText()}}</button>
            <div *ngIf="lockedError">{{lockedError}}</div>
        </div>
        <div *ngIf="wrapper=='div'" [style.visibility]="taskHidden ? 'hidden' : 'visible'" #wrapper [attr.id]="id" [attr.plugin-type]="pluginType" [attr.inert]="isVeiled() ? '' : null">
            <ng-container *ngTemplateOutlet="tempOutlet"></ng-container>
            <ng-container #pluginPlacement></ng-container>
            <div *ngIf="nonPluginHtml" [innerHTML]="nonPluginHtml | purify"></div>
        </div>
        <span *ngIf="wrapper=='span'" [style.visibility]="taskHidden ? 'hidden' : 'visible'" #wrapper [attr.id]="id" [attr.plugin-type]="pluginType" [attr.inert]="isVeiled() ? '' : null">
            <ng-container *ngTemplateOutlet="tempOutlet"></ng-container>
            <ng-container #pluginPlacement></ng-container>
            <div *ngIf="nonPluginHtml" [innerHTML]="nonPluginHtml | purify"></div>
        </span>
        <span *ngIf="isVeiled() && wrapper=='span'" class="login-required-overlay inline" [class.narrow]="!inlineLockLabelFits">
            <button #inlineLock
                    class="login-required-lock inline"
                    type="button"
                    [title]="lockTitle"
                    [attr.aria-label]="lockTitle"
                    (click)="openLoginDialog()">
                <ng-container *ngTemplateOutlet="lockIcon"></ng-container>
                <span class="login-required-lock-label" i18n>Log in to answer</span>
            </button>
        </span>
        <div *ngIf="isVeiled() && wrapper=='div'" class="login-required-overlay">
            <div class="login-required-card">
                <ng-container *ngTemplateOutlet="lockCard"></ng-container>
            </div>
        </div>
        <ng-template #tempOutlet>
            <ng-content #contenthtml *ngIf="defaultload"></ng-content>
        </ng-template>
        <div *ngIf="feedback">
            <tim-alert [severity]="'warning'" [closeable]="true" (closing)="showFeedback('')">
                <div class="math" #feedbackDiv [innerHTML]="feedback | purify"></div>
            </tim-alert>
        </div>

    `,
    host: {
        "[class.lazy-answer-inactive]": "lazyActivated && !activated",
        "[class.login-required-locked]": "isLocked()",
    },
})
export class PluginLoaderComponent implements AfterViewInit, OnDestroy, OnInit {
    @ViewChild("pluginPlacement", {read: ViewContainerRef, static: false})
    pluginPlacement!: ViewContainerRef;
    private feedBackElement?: ElementRef<HTMLDivElement>;
    @ViewChild("feedbackDiv") set feedbackDiv(
        el: ElementRef<HTMLDivElement> | undefined
    ) {
        if (!el || this.feedBackElement == el) {
            return;
        }
        this.feedBackElement = el;
        ParCompiler.processAllMath($(el.nativeElement));
    }
    private compiled = false;
    activated = false;
    lazyActivated = false;
    private viewctrl?: ViewCtrl;
    @Input() public taskId!: string;
    public nonPluginHtml?: string;
    public parsedTaskId?: TaskId;
    @Input() public type!: "full" | "lazyonly" | "none";
    @Input() public answerId?: number;
    @Input() public template?: string;
    @Input() public wrapper!: "div" | "span";
    @Input() public id!: string;
    @Input() public pluginType!: string;
    @Input() public preview?: boolean;
    @ViewChild("wrapper") pluginWrapper?: ElementRef<HTMLElement>;
    @ViewChild("inlineLock") inlineLock?: ElementRef<HTMLElement>;
    @ContentChild("contenthtml") contenthtml?: ElementRef<HTMLElement>;
    public defaultload = true;
    loadPluginAfterInit = false;
    public showBrowser: boolean = false;
    public hideBrowser: boolean = false;
    private forceBrowser: boolean = false;
    public showPlaceholder = true;
    public feedback?: string = "";
    public abLoad = new TimDefer<AnswerBrowserComponent | null>();
    @Input() public accessDuration?: number;
    @Input() public accessEnd?: string;
    @Input() public accessEndText?: string;
    @Input() public accessHeader?: string;
    @Input() public lockableByPrerequisite?: boolean;
    @Input() public lockedByPrerequisite?: boolean;
    @Input() public lockedText?: string;
    @Input() public lockedButtonText?: string;
    @Input() public lockedError?: string;
    @Input() public eagerlyLoadState?: boolean;
    /**
     * Set by the server when the viewer is not logged in and the plugin markup does not allow
     * anonymous answers; the loader then shows a "log in to answer" notice above the task.
     */
    @Input() public loginRequired?: boolean;
    lockTitle = $localize`Log in to answer this task.`;

    /**
     * Whether the task is locked because the viewer must log in first. A locked plugin is
     * covered by a veil (see isVeiled) with a lock that offers login. A block plugin also
     * has "Show anyway", after which the plugin is left as it is, so that it stays readable
     * with a screen reader and its content can be copied. Answering fails on the server anyway.
     */
    isLocked() {
        return !!this.loginRequired && !this.preview;
    }

    /**
     * Whether the "Log in to answer" label fits in the lock of a locked inline plugin;
     * in a narrow field only the lock icon is shown. See observeInlineLockRoom.
     */
    inlineLockLabelFits = true;
    private inlineLockObserver?: ResizeObserver;
    private inlineLockFullWidth?: number;

    /** The user chose "Show anyway": the veil is removed and the login card becomes a bar above the plugin. */
    lockedPluginShown = false;

    /**
     * Removes the veil. The plugin is then loaded as if hovered, so that a lazy plugin does not
     * stay static until the pointer leaves and re-enters the task.
     */
    showLockedPlugin() {
        this.lockedPluginShown = true;
        void this.loadPlugin();
    }

    /**
     * Whether the locked plugin is covered by the veil that carries the lock. The covered
     * plugin is inert so that it cannot be used behind the veil (e.g. text typed into a field
     * could not be saved anyway), and a lazy plugin is not replaced with the real one while
     * covered. Only a block plugin can be uncovered ("Show anyway").
     */
    isVeiled() {
        return (
            this.isLocked() &&
            (this.wrapper == "span" || !this.lockedPluginShown)
        );
    }
    error = "";

    timed = false;
    expired = false;
    unlockable = false;
    running = false;
    endTime?: ReadonlyMoment;
    taskHidden = false;

    private currentModRef?: NgModuleRef<unknown>;
    private currentModuleType?: Type<unknown>;

    constructor(
        private elementRef: ElementRef<HTMLElement>,
        private http: HttpClient,
        private zone: NgZone,
        private appRef: ApplicationRef,
        public vcr: ViewContainerRef
    ) {
        timLogTime("timPluginLoader constructor", "answ", 1);
        const globals = genericglobals();
        if (isDocumentGlobals(globals)) {
            this.lazyActivated = globals.docSettings.lazyAnswers ?? false;
        }
    }

    get loaderElement(): HTMLElement {
        return this.elementRef.nativeElement;
    }

    private async refreshMath() {
        await ParCompiler.processAllMathDelayed($(this.loaderElement));
    }

    async ngOnInit() {
        // Don't activate if it isn't supposed to have a browser in the first place
        if (this.type == "none" || this.type == "lazyonly") {
            this.lazyActivated = false;
        }
        this.viewctrl = vctrlInstance;
        if (this.viewctrl && !this.preview && this.taskId) {
            this.viewctrl.registerPluginLoader(this);
        }
        if (!this.taskId) {
            this.viewctrl?.registerPluginLoaderWithoutTaskId(this);
        }
        const r = TaskId.tryParse(this.taskId);
        if (r.ok) {
            this.parsedTaskId = r.result;
            if (
                (getURLParameter("task") === this.parsedTaskId.name &&
                    !this.preview) ||
                getViewName() == "review"
            ) {
                this.loadPluginAfterInit = true;
            }
        }
        if (this.lockedByPrerequisite) {
            this.hidePlugin();
        }
        if (this.type == "none") {
            // Light plugin loader doesn't have AB => mark as resolved
            this.abLoad.resolve(null);
        }

        await timeout();
        const m = this.pluginMarkup();
        if (
            m?.hideBrowser ||
            this.viewctrl?.docSettings.hideBrowser ||
            this.isUseCurrentUser() ||
            this.isInFormMode()
        ) {
            this.hideBrowser = true;
            this.showPlaceholder = false;
        }
        if (m?.forceBrowser) {
            this.forceBrowser = true;
        }

        this.showPlaceholder = !this.isInFormMode() && !this.hideBrowser;

        if (this.accessDuration && !this.viewctrl?.item.rights.teacher) {
            this.timed = true;
            if (!this.accessEnd) {
                this.unlockable = true;
                this.hidePlugin();
            } else {
                this.endTime = moment(this.accessEnd);
                if (this.endTime.isBefore(moment.now())) {
                    this.expireTask();
                } else {
                    this.startTask();
                }
            }
        }
        if (this.lockableByPrerequisite) {
            if (!m?.previousTask) {
                return;
            }
            if (this.lockedByPrerequisite) {
                this.viewctrl?.addLockListener(this);
                this.lockedText = m.previousTask.hideText;
                this.lockedButtonText = m.previousTask.unlockText;
            }
            this.toggleLockedAreas();
        }
    }

    ngAfterViewInit() {
        if (!this.pluginWrapper) {
            return;
        }

        this.elementRef.nativeElement.addEventListener(
            "mouseenter",
            this.activationHandler
        );
        this.elementRef.nativeElement.addEventListener(
            "touchstart",
            this.activationHandler
        );
        const pluginhtml = this.pluginWrapper.nativeElement.innerHTML;
        if (!pluginhtml.startsWith(LAZY_COMMENT_MARKER)) {
            // A non-lazy plugin is shown even when locked so that the task content stays visible.
            const component = this.pluginWrapper.nativeElement
                .childNodes[0] as HTMLElement;
            this.determineAndSetComponent(component);
        }
        if (this.loadPluginAfterInit || this.eagerlyLoadState) {
            this.loadPlugin();
        }
        if (this.inlineLock) {
            this.observeInlineLockRoom(
                this.inlineLock.nativeElement,
                this.pluginWrapper.nativeElement
            );
        }
    }

    /**
     * Shows the label of the inline lock only when the plugin is wide enough for it.
     * The width of the lock with the label is measured once, while the label is still
     * shown, and compared with the plugin width whenever the plugin is resized.
     */
    private observeInlineLockRoom(lock: HTMLElement, wrapper: HTMLElement) {
        this.inlineLockObserver = new ResizeObserver(() => {
            this.inlineLockFullWidth ??= lock.offsetWidth;
            const fits = wrapper.offsetWidth >= this.inlineLockFullWidth + 16;
            if (fits !== this.inlineLockLabelFits) {
                this.zone.run(() => (this.inlineLockLabelFits = fits));
            }
        });
        this.inlineLockObserver.observe(wrapper);
    }

    ngOnDestroy() {
        this.removeActivationHandlers();
        this.inlineLockObserver?.disconnect();
        this.currentModRef?.destroy();
    }

    private activationHandler = () => {
        this.activated = true;
        void this.loadPlugin();
    };

    private removeActivationHandlers() {
        this.elementRef.nativeElement.removeEventListener(
            "mouseenter",
            this.activationHandler
        );
        this.elementRef.nativeElement.removeEventListener(
            "touchstart",
            this.activationHandler
        );
    }

    showFeedback(txt?: string) {
        this.feedback = txt;
        if (this.feedBackElement) {
            ParCompiler.processAllMathDelayed(
                $(this.feedBackElement.nativeElement)
            );
        }
    }

    public pluginObject(): ITimComponent | undefined {
        if (!this.viewctrl || !this.taskId) {
            return undefined;
        }
        return this.viewctrl.getTimComponentByName(this.taskId);
    }

    public pluginMarkup(): IGenericPluginMarkup | undefined {
        const c = this.pluginObject();
        if (!c) {
            return undefined;
        }
        return c.markup;
    }

    public isUseCurrentUser() {
        const m = this.pluginMarkup();
        return m?.useCurrentUser ?? false;
    }

    public isGlobal(): boolean {
        return this.taskId.includes("GLO_");
        // return this.pluginMarkup().globalField;
    }

    loadAnswerBrowser() {
        if (this.viewctrl) {
            const ab = this.viewctrl.getAnswerBrowser(this.taskId);
            if (ab) {
                this.compiled = true;
                this.abLoad.resolve(ab);
            }
        }
        if (
            this.viewctrl &&
            (!this.viewctrl.noBrowser || this.forceBrowser) &&
            this.parsedTaskId &&
            this.type !== "lazyonly" &&
            Users.isLoggedIn()
        ) {
            this.showBrowser = true;
        } else {
            this.abLoad.resolve(null); // this plugin instance doesn't have answer browser
        }
    }

    async loadPlugin() {
        if (this.compiled) {
            return;
        }
        if (this.isVeiled()) {
            // A plugin behind the veil is not replaced with the real one and sends no init requests,
            // regardless of who asks for the load (hover, form mode, user change, review...).
            // Callers may await abLoad, so resolve it: a viewer who cannot answer has no answer browser.
            this.abLoad.resolve(null);
            return;
        }
        // PluginLoader is wrapped in AngularJS, so outside calls (e.g. via viewctrl) may not be properly tracked
        // Therefore, ensure the call is run inside the Angular zone to ensure change detection is triggered
        await this.zone.run(async () => {
            this.loadAnswerBrowser();
            const h = this.getNonLazyHtml();
            if (h && this.viewctrl) {
                this.defaultload = false;
                await this.loadFromHtml(h);
            }
            this.removeActivationHandlers();
        });
    }

    async loadFromHtml(html: string) {
        const elementToCompile = $(html)[0];
        this.defaultload = false;
        await this.determineAndSetComponent(elementToCompile);
        await this.refreshMath();
    }

    async determineAndSetComponent(component: HTMLElement) {
        if (component.nodeType === Node.COMMENT_NODE) {
            // empty loader, do nothing
            return;
        }
        if (component.tagName == undefined) {
            this.error = `Unknown component ${this.taskId}`;
            return;
        }
        const runnername = component.tagName.toLowerCase();
        if (runnername == "div") {
            // For now assume every non-component plugin html (e.g plugins in error state) is wrapped in div, so we
            // can catch plugins that are not properly handled yet
            this.setInnerHtml(component);
            return;
        }
        this.defaultload = false;
        this.nonPluginHtml = undefined;
        const json = component.getAttribute("json");
        const registeredPlugin = getPlugin(runnername);
        if (!registeredPlugin) {
            this.error = $localize`Unknown component: ${runnername}`;
            return;
        }
        if (!json) {
            this.error = $localize`Component ${runnername} is missing attribute json`;
            return;
        }
        await this.setComponent(registeredPlugin, json);
    }

    setInnerHtml(element: HTMLElement) {
        if (this.defaultload) {
            return;
        }
        const viewContainerRef = this.pluginPlacement;
        viewContainerRef.clear();
        this.nonPluginHtml = element.outerHTML;
    }

    private createModule(moduleType: Type<unknown>) {
        if (this.currentModuleType === moduleType && this.currentModRef) {
            return this.currentModRef;
        }

        if (this.currentModRef) {
            this.currentModRef.destroy();
            this.currentModRef = undefined;
        }

        // Note: there are multiple ways to bootstrap a module with the components
        // 1. createNgModule - creates a new module with no platform -> mainly for child modules, prevents multiple platform instances
        //   * Seems to be fast and easy to bootstrap, but doesn't allow referencing e.g. BrowserModule => this seems to be intended for child modules
        // 2. PlatformRef.bootstrapModule - bootstraps a module as if it's an application module
        //   * Angular allows multiple bootstraps for the same platform
        //   * Seems to break change detection for plugins
        // For now we'll use createNgModule since eventually we'll likely move to use Angular Elements that seem to do the same thing
        this.currentModRef = createNgModule(moduleType, this.appRef.injector);
        this.currentModuleType = moduleType;
        return this.currentModRef;
    }

    async setComponent(registeredPlugin: IRegisteredPlugin, json: string) {
        const viewContainerRef = this.pluginPlacement;
        viewContainerRef.clear();

        const modRef = this.createModule(registeredPlugin.module);
        const componentRef = await viewContainerRef.createComponent<PluginJson>(
            registeredPlugin.component,
            {ngModuleRef: modRef}
        );
        componentRef.instance.json = json;
        componentRef.changeDetectorRef.detectChanges();
    }

    /**
     * Returns the non-lazy HTML for the plugin if the plugin is lazy.
     * If the plugin is not lazy, returns nothing.
     */
    getNonLazyHtml() {
        const pe = this.getPluginElement();
        const cns = pe[0].childNodes;
        let nonLazyHtml;
        for (const n of cns) {
            if (
                n.nodeType === Node.COMMENT_NODE &&
                n.nodeValue &&
                n.nodeValue.startsWith(LAZY_MARKER) &&
                n.nodeValue.endsWith(LAZY_MARKER)
            ) {
                nonLazyHtml = n.nodeValue.slice(
                    LAZY_MARKER_LENGTH,
                    n.nodeValue.length - LAZY_MARKER_LENGTH
                );
                break;
            } else if (
                isElement(n) &&
                n.tagName === "DIV" &&
                n.className === LAZY_MARKER
            ) {
                nonLazyHtml = n.getAttribute("data-html");
                break;
            }
        }
        return nonLazyHtml;
    }

    getPluginElement(): JQuery {
        return $(
            this.elementRef.nativeElement.querySelectorAll(
                "[plugin-type]"
            )[0] as HTMLElement
        );
    }

    unDimPlugin() {
        const e = this.getPluginElement();
        e.css("opacity", "1");
        e.removeClass("hidden-print");
    }

    dimPlugin() {
        if (!this.isInFormMode()) {
            const e = this.getPluginElement();
            e.css("opacity", "0.3");
            e.addClass("hidden-print");
        }
    }

    hidePlugin() {
        this.taskHidden = true;
    }

    unHidePlugin() {
        this.taskHidden = false;
    }

    async unlockTimedTask() {
        const r = await toPromise(
            this.http.get<{end_time: string; expired?: boolean}>(
                "/unlockTimedTask",
                {
                    params: {
                        task_id: this.taskId,
                    },
                }
            )
        );
        if (r.ok) {
            this.unlockable = false;
            this.endTime = moment(r.result.end_time);
            if (this.endTime.isBefore(moment.now())) {
                this.expireTask();
            } else {
                this.startTask();
            }
        }
    }

    informAboutLock(sourceTask: TaskId) {
        const prevInfo = this.pluginMarkup()?.previousTask;
        if (!prevInfo || !this.viewctrl?.docId || !prevInfo.requireLock) {
            return;
        }
        const tid = TaskIdWithDefaultDocId(
            prevInfo.taskid,
            this.viewctrl.docId
        );
        if (tid?.docTask() == sourceTask.docTask()) {
            if (prevInfo.count) {
                // todo
                return;
            }
            this.unlockHiddenTask();
        }
    }

    async unlockHiddenTask() {
        const r = await toPromise(
            this.http.get<{unlocked: boolean; error?: string}>(
                "/unlockHiddenTask",
                {
                    params: {
                        task_id: this.taskId,
                    },
                }
            )
        );
        if (r.ok) {
            if (r.result.unlocked) {
                this.lockedByPrerequisite = false;
                this.unHidePlugin();
                this.toggleLockedAreas();
            } else {
                this.lockedError =
                    r.result.error ??
                    $localize`You haven't unlocked this task yet`;
            }
        } else {
            this.lockedError = r.result.error.error;
        }
    }

    /**
     * Hide areas where hide-with attribute matches current taskid
     * TODO:
     *  This should be handled by the actual plugin containing the modelAnswer and the locks (and later
     *  be handled server-side), but the current implementation of modelAnswer lock query is expensive and unoptimized
     */
    toggleLockedAreas() {
        if (!this.parsedTaskId) {
            return;
        }
        const dataAreas = document.querySelectorAll(
            `[attrs*='"area"'][attrs*='"hide-with": "${this.parsedTaskId.name}"']`
        );
        for (const da of dataAreas) {
            const attrs = da.getAttribute("attrs");
            if (attrs) {
                try {
                    const attrObj = JSON.parse(attrs) as {
                        area: string;
                    };
                    const areaName = attrObj.area;
                    if (areaName) {
                        const area = document.querySelector(
                            `div.area.area_${areaName} > .areaContent`
                        );
                        if (area && area instanceof HTMLElement) {
                            area.style.setProperty(
                                "display",
                                this.lockedByPrerequisite ? "none" : "block",
                                "important"
                            );
                        }
                    }
                } catch {}
            }
        }
    }

    expireTask() {
        this.expired = true;
        this.running = false;
        if (this.accessEndText) {
            this.hidePlugin();
        }
    }

    startTask() {
        this.unHidePlugin();
        this.running = true;
    }

    isInFormMode() {
        if (this.viewctrl) {
            const timComp = this.viewctrl.getTimComponentByName(this.taskId);
            if (timComp) {
                return this.viewctrl.isTimComponentInFormMode(timComp);
            }
        }
        return false;
    }

    warnAboutMissingTaskId() {
        this.error = $localize`Plugin is missing task id`;
    }

    openLoginDialog() {
        void showLoginDialog();
    }

    getPrerequisiteLockedText() {
        return this.lockedText ?? $localize`You haven't unlocked this task yet`;
    }

    getPrerequisiteUnlockText() {
        return this.lockedButtonText ?? $localize`Open task`;
    }

    getAnswerId() {
        return this.answerId;
    }
}
@NgModule({
    declarations: [PluginLoaderComponent],
    imports: [
        AnswerBrowserModule,
        BrowserModule,
        FormsModule,
        PurifyModule,
        TimUtilityModule,
        HttpClientModule,
    ],
    exports: [PluginLoaderComponent],
})
export class PluginLoaderModule implements DoBootstrap {
    ngDoBootstrap(appRef: ApplicationRef) {}
}

export const moduleDefs = [
    doDowngrade(
        createDowngradedModule((extraProviders) =>
            platformBrowserDynamic(extraProviders).bootstrapModule(
                PluginLoaderModule
            )
        ),
        "timPluginLoader",
        PluginLoaderComponent
    ),
];
