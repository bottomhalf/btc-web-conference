import { Component, OnDestroy, OnInit } from '@angular/core';
import { NavigationEnd, NavigationStart, Router, RouterOutlet } from '@angular/router';
import { filter, Subscription } from 'rxjs';
import { CommonService } from './providers/services/common.service';
import { iNavigation } from './providers/services/iNavigation';
import { MeetingContainerComponent } from "./meeting-container/meeting-container.component";
import { MeetingService } from './meeting/meeting.service';
import { ThemeService } from './providers/services/theme.service';

@Component({
    selector: 'app-root',
    standalone: true,
    imports: [RouterOutlet, MeetingContainerComponent],
    templateUrl: './app.component.html',
    styleUrl: './app.component.css',
})
export class AppComponent implements OnInit, OnDestroy {
    navRouter: Subscription = null;
    constructor(private common: CommonService,
        private nav: iNavigation,
        private router: Router,
        private meetingService: MeetingService,
        private themeService: ThemeService // Initialize theme on app startup
    ) {
        this.navRouter = this.router.events.subscribe((event: any) => {
            if (event instanceof NavigationStart) {
                let pageName = event.url.replace("/", "")
                this.common.SetCurrentPageName(pageName);
                this.nav.manageLocalSessionKey(pageName);
                this.nav.pushRoute(pageName);
            }
        });

        this.router.events.pipe(filter(e => e instanceof NavigationEnd)).subscribe((ev: any) => {
            const url = ev.urlAfterRedirects ?? ev.url;
            if (this.meetingService.inMeeting() && url.startsWith('/meeting')) {
                // on meeting route -> maximize
                this.meetingService.maximize();
            } else if (this.meetingService.inMeeting()) {
                // any other route -> minimize
                this.meetingService.minimize();
            }
        });
    }

    ngOnInit() {
        this.router.events
            .pipe(filter(event => event instanceof NavigationEnd))
            .subscribe((event: any) => {
                // Now we have the correct URL
                if (event.urlAfterRedirects === '/' || event.urlAfterRedirects === '') {
                    const randomId = this.generateRandomString();
                    this.router.navigate([`/meeting/${randomId}`]);
                }
            });
    }

    ngOnDestroy(): void {
        this.navRouter.unsubscribe();
    }

    private generateRandomString(length: number = 12): string {
        return `${this.randomLetters(3)}-${this.randomLetters(3)}-${this.randomLetters(6)}`;
    }

    private randomLetters(len: number): string {
        const letters = 'abcdefghijklmnopqrstuvwxyz';
        return Array.from({ length: len }, () => letters[Math.floor(Math.random() * letters.length)]).join('');
    }

}