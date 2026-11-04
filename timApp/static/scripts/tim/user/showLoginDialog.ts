import type {AngularDialogComponent} from "tim/ui/angulardialog/angular-dialog-component.directive";
import {angularDialog} from "tim/ui/angulardialog/dialog.service";
import {to2} from "tim/util/utils";
import type {ILoginParams} from "tim/user/login-dialog.component";

let instance: AngularDialogComponent<ILoginParams, void> | undefined;

/**
 * Open login dialog if no other instances are opened.
 * By default, the dialog logs in (not sign up) as the only user of the session.
 */
export async function showLoginDialog(
    params: ILoginParams = {showSignup: false, addingToSession: false}
) {
    if (instance) {
        return;
    }
    const {LoginDialogComponent} = await import("./login-dialog.component");
    const dialog = angularDialog.open(LoginDialogComponent, params, {
        resetSize: true,
    });
    instance = await dialog;
    await to2(instance.result);
    instance = undefined;
    return;
}
