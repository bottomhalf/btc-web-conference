import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LocalService } from '../providers/services/local.service';
import { MeetingService } from '../meeting/meeting.service';
import { MeetingComponent } from '../meeting/meeting.component';
import { trigger, state, style, transition, animate } from '@angular/animations';

@Component({
  selector: 'app-meeting-container',
  standalone: true,
  imports: [MeetingComponent, CommonModule],
  templateUrl: './meeting-container.component.html',
  styleUrl: './meeting-container.component.css',
  animations: [
    trigger('slideFade', [
      state('hidden', style({ opacity: 0, height: '0px', overflow: 'hidden', width: '0px' })),
      state('visible', style({ opacity: 1, height: '*', overflow: 'hidden' })),
      transition('hidden <=> visible', animate('300ms ease-in-out'))
    ])
  ]
})
export class MeetingContainerComponent {
  private lastInMeetingState: boolean | null = null;

  constructor(
    public meetingService: MeetingService,
    private local: LocalService
  ) { }

  get isLoggedIn(): boolean {
    return this.local.isLoggedIn();
  }

  // Helper method to log only when *ngIf state CHANGES (not every evaluation)
  logMeetingRender(): boolean {
    const inMeeting = this.meetingService.inMeeting();

    // Only log when state changes
    if (this.lastInMeetingState !== inMeeting) {
      console.log('[MeetingContainer] *ngIf STATE CHANGED:', {
        from: this.lastInMeetingState,
        to: inMeeting,
        timestamp: new Date().toISOString(),
        action: inMeeting ? '✅ CREATING <app-meeting>' : '❌ DESTROYING <app-meeting>'
      });
      this.lastInMeetingState = inMeeting;
    }

    return inMeeting;
  }
}
