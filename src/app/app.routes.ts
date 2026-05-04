import { Routes, UrlSegment } from "@angular/router";
import { AppComponent } from "./app.component";
import { MeetingComponent } from "./meeting/meeting.component";
import { PreviewComponent } from "./preview/preview.component";
import { authGuard } from "./providers/auth.guard";
import { SplashComponent } from "./splash/splash.component";

// Custom route matcher
export function btcRouteMatcher(segments: UrlSegment[]) {
  const fullPath = segments.map(s => s.path).join('');

  // Regex: starts with btc, must have exactly 3 hyphens
  const pattern = /^btc-[^-]+-[^-]+$/;

  if (pattern.test(fullPath)) {
    return {
      consumed: segments
    };
  }
  return null;
}

export const routes: Routes = [
  {
    path: '',
    component: SplashComponent,
  },
  {
    path: 'home',
    loadComponent: () =>
      import('./landing/landing.component').then(c => c.LandingComponent),
  },
  {
    path: 'leadership/:role',
    loadComponent: () =>
      import('./leadership/leadership.component').then(c => c.LeadershipComponent),
  },
  {
    path: 'login',
    loadComponent: () =>
      import('./login/login.component').then(c => c.LoginComponent),
  },
  {
    path: 'btc',
    loadComponent: () =>
      import('./layout/layout.component').then(c => c.LayoutComponent),
    children: [
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./dashboard/dashboard.component').then(c => c.DashboardComponent),
        canActivate: [authGuard],
      },
      {
        path: 'preview',
        loadComponent: () =>
          import('./preview/preview.component').then(c => c.PreviewComponent),
      },
      {
        path: 'meeting/:id',
        loadComponent: () =>
          import('./meeting/meeting.component').then(c => c.MeetingComponent),
      },
      {
        path: 'chat',
        loadComponent: () =>
          import('./chat/chat.component').then(c => c.ChatComponent),
        canActivate: [authGuard],
      },
      {
        path: 'calendar',
        loadComponent: () =>
          import('./calendar/calendar.component').then(c => c.CalendarComponent),
        canActivate: [authGuard],
      },
      {
        path: 'monitor-dashboard',
        loadComponent: () =>
          import('./monitor-dashboard/monitor-dashboard.component').then(c => c.MonitorDashboardComponent),
        canActivate: [authGuard],
      }
    ],
  },
];