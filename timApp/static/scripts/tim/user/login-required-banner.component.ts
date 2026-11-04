import type {AfterViewInit, OnDestroy} from "@angular/core";
import {Component, ElementRef} from "@angular/core";
import {showLoginDialog} from "tim/user/showLoginDialog";
import {Users} from "tim/user/userService";

/**
 * A notice at the top of a document for viewers who are not logged in, shown when the document
 * has tasks that they cannot answer without logging in (see the login-required attribute that
 * TIM sets on tim-plugin-loader). The tasks themselves are locked by the plugin loader.
 *
 * The notice is sticky, so its current height is published as the CSS variable
 * --login-required-banner-height on the document element, and the sticky cards of the locked
 * tasks offset themselves by it so that the notice never covers them.
 */
@Component({
    selector: "tim-login-required-banner",
    template: `
        <div *ngIf="visible" class="alert alert-info login-required-banner" role="status">
            <span class="glyphicon glyphicon-info-sign"></span>
            <span i18n>You can read the material, but using the interactive components requires logging in.</span>
            <span class="login-required-banner-actions">
                <button class="btn btn-default btn-sm" type="button" (click)="openLoginDialog()" i18n>Log in</button>
                <button class="close login-required-banner-close" type="button" title="Close" i18n-title aria-label="Close" i18n-aria-label (click)="close()">&times;</button>
            </span>
        </div>
    `,
})
export class LoginRequiredBannerComponent implements AfterViewInit, OnDestroy {
    visible =
        !Users.isLoggedIn() &&
        document.querySelector("tim-plugin-loader[login-required]") != null;
    private resizeObserver?: ResizeObserver;

    constructor(private host: ElementRef<HTMLElement>) {}

    ngAfterViewInit() {
        if (!this.visible) {
            return;
        }
        const banner = this.host.nativeElement.querySelector<HTMLElement>(
            ".login-required-banner"
        );
        if (!banner) {
            return;
        }
        this.resizeObserver = new ResizeObserver(() =>
            this.setBannerHeight(banner.offsetHeight)
        );
        this.resizeObserver.observe(banner);
    }

    ngOnDestroy() {
        this.close();
    }

    close() {
        this.visible = false;
        this.resizeObserver?.disconnect();
        this.resizeObserver = undefined;
        this.setBannerHeight(0);
    }

    openLoginDialog() {
        void showLoginDialog();
    }

    private setBannerHeight(px: number) {
        document.documentElement.style.setProperty(
            "--login-required-banner-height",
            `${px}px`
        );
    }
}
