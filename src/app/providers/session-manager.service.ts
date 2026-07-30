import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { ConfeetSocketService } from './socket/confeet-socket.service';
import { MeetingService } from '../meeting/meeting.service';
import { NotificationService } from '../notifications/services/notification.service';
import { ServerEventService } from './socket/server-events/server-event.service';
import { ChatService } from '../chat/chat.service';
import { JwtService } from './services/jwt.service';
import { Login } from '../models/constant';

@Injectable({
  providedIn: 'root'
})
export class SessionManagerService {

  constructor(
    private router: Router,
    private ws: ConfeetSocketService,
    private meetingService: MeetingService,
    private notificationService: NotificationService,
    private serverEvents: ServerEventService,
    private chatService: ChatService,
    private jwtService: JwtService
  ) { }

  /**
   * Orchestrates a complete logout process cleaning all connections, states, and caches.
   */
  async logout(): Promise<void> {
    try {
      // 1. Notify others that the user is offline
      this.ws.updateStatus('Offline');

      // Add a small delay to ensure the message gets sent before we sever the connection
      await new Promise(resolve => setTimeout(resolve, 100));

      // 2. Disconnect WebSocket entirely (stops heartbeats)
      this.ws.disconnect();

      // 3. Leave any active meeting
      this.meetingService.leaveRoom();

      // 4. Destroy active subscriptions so we don't leak memory or duplicate events on re-login
      this.notificationService.destroy();
      this.serverEvents.destroy();

      // 5. Clear application state caching (signals)
      this.chatService.clearSessionData();

    } catch (err) {
      console.error('Error during logout orchestration', err);
    } finally {
      // 6. ALWAYS clear auth tokens even if some cleanup failed
      this.jwtService.removeJwtToken();

      // 7. Navigate to login
      this.router.navigate([Login]);
    }
  }
}
