import { Component, inject, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { MeetingComponent } from '../meeting/meeting.component';
import { MeetingService } from '../meeting/meeting.service';
import { LocalService } from '../providers/services/local.service';
import { iNavigation } from '../providers/services/iNavigation';
import { Dashboard } from '../models/constant';

@Component({
  selector: 'app-meeting-room',
  standalone: true,
  imports: [CommonModule, MeetingComponent],
  templateUrl: './meeting-room.component.html',
  styleUrl: './meeting-room.component.css'
})
export class MeetingRoomComponent implements OnInit, OnDestroy {
  public meetingService = inject(MeetingService);
  private local = inject(LocalService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private nav = inject(iNavigation);

  isWaitingInLobby: boolean = false;
  meetingId: string | null = null;

  ngOnInit(): void {
    this.route.paramMap.subscribe(params => {
      const id = params.get('id');
      if (id) {
        this.meetingId = id;
        this.meetingService.meetingId = id;
      }
    });

    if (!this.meetingId && this.meetingService.meetingId) {
      this.meetingId = this.meetingService.meetingId;
    }

    // If meeting is not yet active, initiate joining
    if (this.meetingId && !this.meetingService.inMeeting()) {
      this.meetingService.userJoinRoom();
    }
  }

  cancelLobbyRequest(): void {
    this.isWaitingInLobby = false;
    this.meetingService.leaveRoom(true);
  }

  leaveMeeting(): void {
    this.meetingService.leaveRoom(true);
  }

  ngOnDestroy(): void {
    // Teardown handled centrally by MeetingService on leave
  }
}
