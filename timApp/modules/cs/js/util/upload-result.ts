/* eslint no-underscore-dangle: ["error", { "allow": ["type_", "src_"] }] */
import {Component, EventEmitter, Input, Output} from "@angular/core";
import type {SafeResourceUrl} from "@angular/platform-browser";
import {DomSanitizer} from "@angular/platform-browser";

@Component({
    selector: "cs-upload-result",
    template: `
    <p *ngIf="src_ && type_ && deleted">
        {{name}} &ndash;
        <ng-container i18n>file deleted {{deleted | date:'d.M.yyyy'}}</ng-container>
    </p>
    <ng-container *ngIf="src_ && type_ && !deleted">
        <p *ngIf="type_ != 'unknown'" class="smalllink">
            <a [href]="src_" [title]="type_">{{name}}</a>
        </p>
        <p *ngIf="type_ == 'unknown'">
            Ladattu:
            <a [href]="src_" [title]="type_">{{name}}</a>
            <ng-container *ngTemplateOutlet="deleteButton"></ng-container>
        </p>
        <!-- The small link is too small for the button -->
        <p *ngIf="type_ != 'unknown' && allowDelete">
            <ng-container *ngTemplateOutlet="deleteButton"></ng-container>
        </p>
        <ng-container [ngSwitch]="type_">
            <img *ngSwitchCase="'image'" [src]="src_"/>
            <video *ngSwitchCase="'video'" [src]="src_" controls></video>
            <audio *ngSwitchCase="'audio'" [src]="src_" controls></audio>
            <div *ngSwitchCase="'text'" style="overflow: auto; -webkit-overflow-scrolling: touch; max-height:900px; -webkit-box-pack: center; -webkit-box-align: center; display: -webkit-box;">
                <iframe [src]="src_" width="800" sandbox></iframe>
            </div>
            <div *ngSwitchCase="'other'" style="overflow: auto; -webkit-overflow-scrolling: touch; max-height:1200px; -webkit-box-pack: center; -webkit-box-align: center; display: -webkit-box;">
                <iframe [src]="src_" width="800" height="900"></iframe>
            </div>
        </ng-container>
    </ng-container>
    <ng-template #deleteButton>
        <button *ngIf="allowDelete" class="btn btn-default btn-xs"
                style="margin-left: 1em"
                (click)="delete.emit()"
                title="Delete the file from the server" i18n-title>
            <i class="glyphicon glyphicon-trash"></i>&nbsp;<ng-container i18n>Delete file</ng-container>
        </button>
    </ng-template>`,
})
export class UploadResultComponent {
    // TODO: test
    static specializedTypes = ["image", "video", "audio", "text"];
    static otherTypes = ["pdf", "xml"];

    type_?: string;
    src_?: SafeResourceUrl;
    name?: string;

    /** Time when the file was deleted from the server, if it has been deleted. */
    @Input() deleted?: string;
    @Input() allowDelete = false;
    @Output() delete = new EventEmitter<void>();

    constructor(private sanitizer: DomSanitizer) {}

    @Input()
    set src(src: string) {
        this.src_ = this.sanitizer.bypassSecurityTrustResourceUrl(src);

        const s = src.split("\\").pop();
        this.name = s ? s.split("/").pop() : "";
    }

    @Input()
    set type(type: string) {
        type = type.toLowerCase();
        for (const t of UploadResultComponent.specializedTypes) {
            if (type.startsWith(t)) {
                this.type_ = t;
                return;
            }
        }
        for (const t of UploadResultComponent.otherTypes) {
            if (type.endsWith(t)) {
                this.type_ = "other";
                return;
            }
        }
        this.type_ = "unknown";
    }
}
