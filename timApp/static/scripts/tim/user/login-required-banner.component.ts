import type {OnInit} from "@angular/core";
import {Component} from "@angular/core";
import {showLoginDialog} from "tim/user/showLoginDialog";
import {Users} from "tim/user/userService";

/**
 * A notice at the top of a document for viewers who are not logged in, shown when the document
 * has tasks that they cannot answer without logging in (see the login-required attribute that
 * TIM sets on tim-plugin-loader). The tasks themselves are locked by the plugin loader.
 */
@Component({
    selector: "tim-login-required-banner",
    template: `
        <div *ngIf="visible" class="alert alert-info login-required-banner" role="status">
            <span class="glyphicon glyphicon-info-sign"></span>
            <span i18n>You are not logged in. You can read the material, but answering the tasks requires logging in.</span>
            <button class="btn btn-default btn-sm" type="button" (click)="openLoginDialog()" i18n>Log in</button>
        </div>
    `,
})
export class LoginRequiredBannerComponent implements OnInit {
    visible = false;

    ngOnInit() {
        this.visible =
            !Users.isLoggedIn() &&
            document.querySelector("tim-plugin-loader[login-required]") != null;
    }

    openLoginDialog() {
        void showLoginDialog();
    }
}
