import { Routes, UrlSegment } from "@angular/router";
import { authGuard, guestGuard } from "./providers/auth.guard";
import { SplashComponent } from "./splash/splash.component";
// Import our new fallback component
import { UnderConstructionComponent } from "./shared/components/under-construction/under-construction.component";

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
    canActivate: [guestGuard],
  },
  {
    path: 'register',
    loadComponent: () =>
      import('./register/register.component').then(c => c.RegisterComponent),
    canActivate: [guestGuard],
  },
  {
    path: 'btc',
    loadComponent: () =>
      import('./layout/layout.component').then(c => c.LayoutComponent),
    canActivate: [authGuard],
    canActivateChild: [authGuard],
    children: [
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./dashboard/dashboard.component').then(c => c.DashboardComponent),
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
      },
      {
        path: 'calendar',
        loadComponent: () =>
          import('./calendar/calendar.component').then(c => c.CalendarComponent),
      },
      {
        path: 'monitor-dashboard',
        loadComponent: () =>
          import('./monitor-dashboard/monitor-dashboard.component').then(c => c.MonitorDashboardComponent),
      }
    ],
  },

  // ==========================================================================
  // New Internal Link Routes Redirecting to Fallback
  // ==========================================================================
  { path: 'pricing', component: UnderConstructionComponent },
  { path: 'security', component: UnderConstructionComponent },
  { path: 'integrations', component: UnderConstructionComponent },
  { path: 'blog', component: UnderConstructionComponent },
  { path: 'careers', component: UnderConstructionComponent },
  // You can change this to a real component when your Contact form layout is ready!

  // ==========================================================================
  //  New Legal Link Routes Redirecting to Fallback
  // ==========================================================================
  { path: 'privacy-policy', component: UnderConstructionComponent },
  { path: 'terms-of-service', component: UnderConstructionComponent },
  { path: 'cookie-policy', component: UnderConstructionComponent },
  { path: 'under-construction', component: UnderConstructionComponent },

  // ==========================================================================
  // Wildcard Route: Catches any unmapped broken paths and safely shows construction fallback
  // ==========================================================================
  { path: '**', component: UnderConstructionComponent }
];