import { Component, ElementRef, HostListener, OnInit, signal } from '@angular/core';
import { Room } from 'livekit-client';
import { LocalService } from '../providers/services/local.service';
import { CommonModule } from '@angular/common';
import { MediaPermissions, MediaPermissionsService } from '../providers/services/media-permission.service';
import { Observable } from 'rxjs';
import { VideoComponent } from '../video/video.component';
import { AudioComponent } from '../audio/audio.component';
import { NgbTooltipModule } from '@ng-bootstrap/ng-bootstrap';
import { User } from '../models/model';
import { MeetingService } from '../meeting/meeting.service';

@Component({
  selector: 'app-meeting-mini',
  standalone: true,
  imports: [CommonModule, VideoComponent, AudioComponent, NgbTooltipModule],
  templateUrl: './meeting-mini.component.html',
  styleUrl: './meeting-mini.component.css'
})
export class MeetingMiniComponent implements OnInit {
  // Simple draggable behavior
  private dragging = false;
  private startX = 0;
  private startY = 0;
  private origLeft = 0;
  private origTop = 0;
  userName: string = null;
  private user: User = null;
  permissions$: Observable<MediaPermissions>;
  room = signal<Room | undefined>(undefined);

  constructor(private elRef: ElementRef,
    public meetingService: MeetingService,
    private mediaPerm: MediaPermissionsService,
    private local: LocalService) {
    this.permissions$ = this.mediaPerm.permissions$;
  }

  ngOnInit() {
    this.user = this.local.getUser();
    this.userName = this.getFullName();
    this.room.set(this.meetingService.room());
  }

  expand() { this.meetingService.maximize(); }
  async leave() { await this.meetingService.leaveRoom(true); }

  @HostListener('mousedown', ['$event'])
  onMouseDown(e: MouseEvent) {
    this.dragging = true;
    const rect = (this.elRef.nativeElement as HTMLElement).getBoundingClientRect();
    this.startX = e.clientX;
    this.startY = e.clientY;
    this.origLeft = rect.left;
    this.origTop = rect.top;
    e.preventDefault();
  }

  @HostListener('document:mousemove', ['$event'])
  onMouseMove(e: MouseEvent) {
    if (!this.dragging) return;

    const dx = e.clientX - this.startX;
    const dy = e.clientY - this.startY;

    const el = this.elRef.nativeElement as HTMLElement;
    const childRect = el.getBoundingClientRect();

    // Use viewport dimensions as boundaries
    const viewportWidth = document.documentElement.clientWidth;
    const viewportHeight = document.documentElement.clientHeight;

    // New position before clamping
    let newLeft = this.origLeft + dx;
    let newTop = this.origTop + dy;

    // Clamp horizontally
    const minLeft = 0;
    const maxLeft = viewportWidth - childRect.width;
    newLeft = Math.min(Math.max(newLeft, minLeft), maxLeft);

    // Clamp vertically
    const minTop = 0;
    const maxTop = viewportHeight - childRect.height;
    newTop = Math.min(Math.max(newTop, minTop), maxTop);

    // Apply relative to viewport
    el.style.position = 'fixed'; // fixed keeps it inside viewport
    el.style.left = `${newLeft}px`;
    el.style.top = `${newTop}px`;
  }

  @HostListener('document:mouseup')
  onMouseUp() { this.dragging = false; }

  async toggleCamera() {
    await this.meetingService.toggleCamera();
  }

  async toggleMic() {
    await this.meetingService.toggleMic()
  }

  getUserInitiaLetter(): string {
    var name = this.getFullName();
    if (!name)
      return "";

    const words = name.split(' ').slice(0, 2);
    const initials = words.map(x => {
      if (x.length > 0) {
        return x.charAt(0).toUpperCase();
      }
      return '';
    }).join('');

    return initials;
  }

  getColorFromName(): string {
    var name = this.getFullName();
    // Predefined color palette (Google Meet style soft colors)
    const colors = [
      "#f28b829f", "#FDD663", "#81C995", "#AECBFA", "#D7AEFB", "#FFB300",
      "#34A853", "#4285F4", "#FBBC05", "#EA4335", "#9AA0A6", "#F6C7B6"
    ];

    // Create hash from name
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }

    // Pick color based on hash
    const index = Math.abs(hash) % colors.length;
    return colors[index];
  }

  private getFullName(): string {
    let fullName = this.user?.firstName;
    if (this.user?.lastName)
      fullName = fullName + " " + this.user.lastName;

    return fullName;
  }
}
