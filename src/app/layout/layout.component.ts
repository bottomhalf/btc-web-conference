import { Component, OnInit, signal, Signal } from '@angular/core';
import { SidemenuComponent } from "../sidemenu/sidemenu.component";
import { HeaderComponent } from "./header/header.component";
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { LocalService } from '../providers/services/local.service';
import { NgbTooltipModule } from '@ng-bootstrap/ng-bootstrap';
import { ConfeetSocketService } from '../providers/socket/confeet-socket.service';
import { environment } from '../../environments/environment';
import { NotificationService } from '../notifications/services/notification.service';
import { ToastNotificationComponent } from '../notifications/toast-notification/toast-notification.component';
import { User } from '../models/model';
import { ServerEventService } from '../providers/socket/server-event.service';
import { IncomingCallComponent } from '../notifications/incoming-call/incoming-call.component';
import { DeviceService } from './device.service';
import { MeetingService } from '../meeting/meeting.service';

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [SidemenuComponent, RouterOutlet, NgbTooltipModule, HeaderComponent, ToastNotificationComponent, IncomingCallComponent],
  templateUrl: './layout.component.html',
  styleUrl: './layout.component.css'
})
export class LayoutComponent implements OnInit {
  isLoggedIn: boolean = false;
  userName: string = null;
  user: User = null;

  constructor(private local: LocalService,
    public meetingService: MeetingService,
    private ws: ConfeetSocketService,
    private serverEvents: ServerEventService,
    private notificationService: NotificationService,
    private router: Router,
    private deviceService: DeviceService
  ) {
    this.isLoggedIn = local.isLoggedIn();

    this.router.events.subscribe(event => {
      if (event instanceof NavigationEnd) {
        if (event.urlAfterRedirects.startsWith('/meeting')) {
          // If in meeting route → show full screen
          if (this.meetingService.inMeeting()) {
            this.meetingService.maximize();
          }
        } else {
          // Any other page → minimize
          if (this.meetingService.inMeeting()) {
            this.meetingService.minimize();
          }
        }
      }
    });
  }

  ngOnInit(): void {
    this.deviceService.loadDevices();
    this.user = this.local.getUser();
    if (this.user.userId) {
      this.socketHandShake();
      this.notificationService.initialize();
      this.serverEvents.initialize();
    }
  }

  socketHandShake() {
    var socketEndPoint = `${environment.socketBaseUrl}/${environment.socketHandshakEndpoint}`;
    this.ws.connect(socketEndPoint, this.user.userId);
  }
}
