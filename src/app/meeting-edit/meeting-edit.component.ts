import { Component, ElementRef, HostListener, OnInit, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { NgbDatepickerModule, NgbDateStruct, NgbTooltipModule } from '@ng-bootstrap/ng-bootstrap';
import { AjaxService } from '../providers/services/ajax.service';
import { LocalService } from '../providers/services/local.service';
import { ConfeetSocketService } from '../providers/socket/confeet-socket.service';
import { JoinCallService } from '../providers/socket/client-events/call/join-call.service';
import { CallType } from '../models/conference_call/call_model';
import { MeetingDetail, ResponseModel, User } from '../models/model';
import { MultiUserAutocompleteComponent } from '../shared/components/multi-user-autocomplete/multi-user-autocomplete.component';
import { ToLocateDate } from '../providers/services/common.service';
import { environment } from '../../environments/environment';

@Component({
  selector: 'app-meeting-edit',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    RouterModule,
    NgbDatepickerModule,
    NgbTooltipModule,
    MultiUserAutocompleteComponent
  ],
  templateUrl: './meeting-edit.component.html',
  styleUrl: './meeting-edit.component.css'
})
export class MeetingEditComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private http = inject(AjaxService);
  private local = inject(LocalService);
  private fb = inject(FormBuilder);
  private ws = inject(ConfeetSocketService);
  private joinCallService = inject(JoinCallService);

  @ViewChild('editorContent') editorContent!: ElementRef;

  activeTab: 'details' | 'participants' | 'agenda' | 'settings' = 'details';

  meetingDetailId: number | string | null = null;
  originalMeetingDetail: MeetingDetail | null = null;
  meetingDetail: MeetingDetail = {
    meetingDetailId: 0,
    meetingId: '',
    meetingPassword: '',
    organizedBy: 0,
    agenda: '',
    title: '',
    durationInSecond: 1800,
    isAllDay: false,
    repeatType: 0,
    participants: '',
    participantsId: []
  };

  meetingForm!: FormGroup;
  meetingDate!: NgbDateStruct;
  meetingEndDate!: NgbDateStruct;
  minPickerDate!: NgbDateStruct;
  minEndPickerDate!: NgbDateStruct;

  meetingTimes: string[] = [];
  endMeetingTimes: string[] = [];

  participantSearchQuery: string = '';
  participantSearchResults: any[] = [];
  selectedParticipants: any[] = [];

  // In-Call Settings
  muteOnEntry: boolean = false;
  enableWaitingRoom: boolean = false;
  hostVideoDefault: boolean = true;
  participantVideoDefault: boolean = true;
  allowScreenSharing: boolean = true;
  recordMeeting: boolean = false;

  isLoading: boolean = false;
  isSaving: boolean = false;
  isSubmitted: boolean = false;
  hasUnsavedChanges: boolean = false;

  errorMessage: string | null = null;
  successMessage: string | null = null;
  durationText: string = '30m';
  showPassword: boolean = false;
  user: User | null = null;

  // Duration Presets (in minutes)
  readonly durationPresets = [15, 30, 45, 60, 90, 120];

  isDeleting: boolean = false;

  get attendeesCount(): number {
    if (this.selectedParticipants && this.selectedParticipants.length > 0) {
      return this.selectedParticipants.length;
    }
    if (typeof this.meetingDetail?.participantCount === 'number' && this.meetingDetail.participantCount > 0) {
      return this.meetingDetail.participantCount;
    }
    if (this.meetingDetail?.participantsDetail && this.meetingDetail.participantsDetail.length > 0) {
      return this.meetingDetail.participantsDetail.length;
    }
    if (this.meetingDetail?.participantsId && Array.isArray(this.meetingDetail.participantsId)) {
      return this.meetingDetail.participantsId.length;
    }
    return 0;
  }

  get persistedEndDateTime(): Date | null {
    if (!this.meetingDetail) return null;

    let eDate: Date | null = null;
    if (this.meetingDetail.endDate) {
      eDate = this.parseDateSafely(this.meetingDetail.endDate, new Date(0));
    }

    if (this.meetingDetail.endTime) {
      if (eDate && eDate.getTime() > 0) {
        const time = this.convertTo24Hour(String(this.meetingDetail.endTime));
        return new Date(eDate.getFullYear(), eDate.getMonth(), eDate.getDate(), time[0], time[1], 0);
      } else {
        const tDate = this.parseDateSafely(this.meetingDetail.endTime, new Date(0));
        if (tDate && tDate.getTime() > 0) return tDate;
      }
    }

    if (eDate && eDate.getTime() > 0) {
      return eDate;
    }

    if (this.meetingDetail.startDate) {
      const sDate = this.parseDateSafely(this.meetingDetail.startDate, new Date(0));
      const duration = Number(this.meetingDetail.durationInSecond || 1800);
      if (sDate && sDate.getTime() > 0) {
        return new Date(sDate.getTime() + (duration * 1000));
      }
    }

    return null;
  }

  get isExpired(): boolean {
    const end = this.persistedEndDateTime;
    if (!end || isNaN(end.getTime())) return false;
    return end.getTime() < Date.now();
  }

  constructor() {
    const today = new Date();
    this.minPickerDate = {
      year: today.getFullYear(),
      month: today.getMonth() + 1,
      day: today.getDate()
    };
    this.minEndPickerDate = { ...this.minPickerDate };
  }

  @HostListener('window:keydown', ['$event'])
  handleKeyboardEvent(event: KeyboardEvent): void {
    if ((event.ctrlKey || event.metaKey) && event.key === 's') {
      event.preventDefault();
      this.saveMeeting();
    }
  }

  ngOnInit(): void {
    this.user = this.local.getUser();
    this.generateTimeSlots();
    this.initForm();

    const paramId = this.route.snapshot.paramMap.get('id');
    const queryId = this.route.snapshot.queryParamMap.get('id');
    this.meetingDetailId = paramId || queryId;

    if (this.meetingDetailId) {
      this.loadMeetingDetail(this.meetingDetailId);
    } else {
      this.errorMessage = 'No Meeting ID was provided.';
    }
  }

  private generateTimeSlots(): void {
    this.meetingTimes = [];
    let hour = 0;
    let minute = 0;

    while (hour < 24) {
      const displayHour = hour % 12 === 0 ? 12 : hour % 12;
      const ampm = hour < 12 ? 'A.M' : 'P.M';
      const displayMinute = minute === 0 ? '00' : '30';
      this.meetingTimes.push(`${displayHour}:${displayMinute} ${ampm}`);

      if (minute === 0) {
        minute = 30;
      } else {
        minute = 0;
        hour++;
      }
    }
    this.endMeetingTimes = [...this.meetingTimes];
  }

  private initForm(): void {
    this.meetingForm = this.fb.group({
      meetingDetailId: [this.meetingDetail.meetingDetailId],
      meetingId: [this.meetingDetail.meetingId],
      meetingPassword: [this.meetingDetail.meetingPassword],
      organizedBy: [this.meetingDetail.organizedBy],
      title: [this.meetingDetail.title, [Validators.required]],
      startDate: [this.meetingDetail.startDate, [Validators.required]],
      endDate: [this.meetingDetail.endDate, [Validators.required]],
      startTime: [this.meetingDetail.startTime, [Validators.required]],
      endTime: [this.meetingDetail.endTime, [Validators.required]],
      durationInSecond: [this.meetingDetail.durationInSecond || 1800],
      agenda: [this.meetingDetail.agenda || ''],
      isAllDay: [this.meetingDetail.isAllDay || false],
      repeatType: [this.meetingDetail.repeatType || 0]
    });

    this.meetingForm.valueChanges.subscribe(() => {
      this.hasUnsavedChanges = true;
    });
  }

  loadMeetingDetail(id: number | string): void {
    this.isLoading = true;
    this.errorMessage = null;

    this.http.get(`meeting/getMeetingDetail/${id}`).then((res: ResponseModel) => {
      this.isLoading = false;
      if (res && res.responseBody) {
        this.originalMeetingDetail = { ...res.responseBody };
        this.populateMeeting(res.responseBody);
        this.hasUnsavedChanges = false;
      } else if (res && res.isSuccess && res.responseBody === null) {
        this.errorMessage = 'Meeting details not found for ID: ' + id;
      } else {
        this.errorMessage = res.errorMessage || 'Failed to load meeting details.';
      }
    }).catch(err => {
      this.isLoading = false;
      console.error('Error fetching meeting detail:', err);
      this.errorMessage = err?.message || 'Unable to connect to server to fetch meeting detail.';
    });
  }

  private populateMeeting(detail: MeetingDetail): void {
    if (!detail) return;
    this.meetingDetail = { ...detail };

    // 1. Resolve Start Date safely
    let sDate = this.parseDateSafely(detail.startDate, new Date());
    this.meetingDate = {
      year: sDate.getFullYear(),
      month: sDate.getMonth() + 1,
      day: sDate.getDate()
    };
    this.minEndPickerDate = { ...this.meetingDate };

    // 2. Resolve Start Time slot (from detail.startTime or detail.startDate or sDate)
    let startTimeStr = this.extractTimeSlot(detail.startTime, sDate);
    if (!this.meetingTimes.includes(startTimeStr)) {
      startTimeStr = this.meetingTimes.length > 0 ? this.meetingTimes[0] : '10:00 A.M';
    }

    // Combine start date with start time
    const startHourMin = this.convertTo24Hour(startTimeStr);
    sDate.setHours(startHourMin[0], startHourMin[1], 0, 0);

    // 3. Resolve Duration
    let durationSeconds = Number(detail.durationInSecond);
    if (!durationSeconds || isNaN(durationSeconds) || durationSeconds <= 0) {
      if (detail.endDate) {
        const e = this.parseDateSafely(detail.endDate, sDate);
        const diff = Math.floor((e.getTime() - sDate.getTime()) / 1000);
        durationSeconds = diff > 0 ? diff : 1800;
      } else {
        durationSeconds = 1800;
      }
    }

    // 4. Resolve End Date
    let eDate = detail.endDate
      ? this.parseDateSafely(detail.endDate, new Date(sDate.getTime() + (durationSeconds * 1000)))
      : new Date(sDate.getTime() + (durationSeconds * 1000));

    this.meetingEndDate = {
      year: eDate.getFullYear(),
      month: eDate.getMonth() + 1,
      day: eDate.getDate()
    };

    // Ensure all meeting times are always available in endMeetingTimes
    this.endMeetingTimes = [...this.meetingTimes];

    // 5. Resolve End Time slot (from detail.endTime or detail.endDate or eDate)
    let endTimeStr = this.extractTimeSlot(detail.endTime, eDate);
    if (!this.meetingTimes.includes(endTimeStr)) {
      endTimeStr = this.roundToNearestSlot(eDate);
      if (!this.meetingTimes.includes(endTimeStr) && this.meetingTimes.length > 0) {
        endTimeStr = this.meetingTimes[0];
      }
    }

    // Combine end date with end time
    if (endTimeStr) {
      const endHourMin = this.convertTo24Hour(endTimeStr);
      eDate.setHours(endHourMin[0], endHourMin[1], 0, 0);
    }

    // 6. Form Patch
    this.meetingForm.patchValue({
      meetingDetailId: detail.meetingDetailId || 0,
      meetingId: detail.meetingId || '',
      meetingPassword: detail.meetingPassword || '',
      organizedBy: detail.organizedBy || 0,
      title: detail.title || '',
      startDate: sDate,
      endDate: eDate,
      startTime: startTimeStr,
      endTime: endTimeStr,
      durationInSecond: durationSeconds,
      agenda: detail.agenda || '',
      isAllDay: Boolean(detail.isAllDay),
      repeatType: Number(detail.repeatType || 0)
    }, { emitEvent: false });

    this.calculateDurationDisplay(durationSeconds);

    // 7. Parse Participants / Attendees
    if (detail.participantsDetail && Array.isArray(detail.participantsDetail) && detail.participantsDetail.length > 0) {
      this.selectedParticipants = detail.participantsDetail.map((p: any) => {
        const userId = p.userId || p.user_id || p.id;
        const fName = p.firstName || p.first_name || '';
        const lName = p.lastName || p.last_name || '';
        const fullName = (fName || lName) ? `${fName} ${lName}`.trim() : (p.name || p.email || userId || 'Attendee');
        return {
          userId: userId,
          firstName: fName,
          lastName: lName,
          name: fullName,
          email: p.email || '',
          avatar: p.avatar || p.avatarUrl || '',
          role: p.role || 'Attendee',
          status: p.status || 'Active',
          joinedAt: p.joinedAt || p.joined_at || null,
          participantsId: p.participantsId || []
        };
      });
    } else if (detail.participants) {
      try {
        if (typeof detail.participants === 'string' && (detail.participants.startsWith('[') || detail.participants.startsWith('{'))) {
          const parsed = JSON.parse(detail.participants);
          const list = Array.isArray(parsed) ? parsed : [parsed];
          this.selectedParticipants = list.map((p: any) => {
            const userId = p.userId || p.user_id || p.id;
            const fName = p.firstName || p.first_name || '';
            const lName = p.lastName || p.last_name || '';
            const fullName = (fName || lName) ? `${fName} ${lName}`.trim() : (p.name || p.email || userId || 'Attendee');
            return {
              userId: userId,
              firstName: fName,
              lastName: lName,
              name: fullName,
              email: p.email || '',
              avatar: p.avatar || p.avatarUrl || '',
              role: p.role || 'Attendee',
              status: p.status || 'Active'
            };
          });
        } else if (Array.isArray(detail.participants)) {
          this.selectedParticipants = detail.participants.map((p: any) => {
            if (typeof p === 'string') {
              return { userId: p, name: p, email: p };
            }
            const userId = p.userId || p.user_id || p.id;
            const fName = p.firstName || p.first_name || '';
            const lName = p.lastName || p.last_name || '';
            const fullName = (fName || lName) ? `${fName} ${lName}`.trim() : (p.name || p.email || userId || 'Attendee');
            return {
              userId: userId,
              firstName: fName,
              lastName: lName,
              name: fullName,
              email: p.email || '',
              avatar: p.avatar || p.avatarUrl || '',
              role: p.role || 'Attendee',
              status: p.status || 'Active'
            };
          });
        }
      } catch (e) {
        this.selectedParticipants = [];
      }
    } else {
      this.selectedParticipants = [];
    }

    setTimeout(() => {
      if (this.editorContent && this.editorContent.nativeElement) {
        this.editorContent.nativeElement.innerHTML = detail.agenda || '';
      }
    }, 100);
  }

  // Quick Preset Durations (+15m, +30m, +1h, etc.)
  setPresetDuration(minutes: number): void {
    const startTime = this.meetingForm.get('startTime')?.value || this.meetingTimes[0] || '10:00 A.M';
    const start24 = this.convertTo24Hour(startTime);
    const startMinutes = start24[0] * 60 + start24[1];
    const targetEndMinutes = startMinutes + minutes;

    const endHour24 = Math.floor(targetEndMinutes / 60) % 24;
    const endMin = targetEndMinutes % 60;

    const displayHour = endHour24 % 12 === 0 ? 12 : endHour24 % 12;
    const ampm = endHour24 < 12 ? 'A.M' : 'P.M';
    const displayMin = endMin < 10 ? '0' + endMin : endMin.toString();
    let endTimeStr = `${displayHour}:${displayMin} ${ampm}`;

    if (!this.meetingTimes.includes(endTimeStr)) {
      const d = new Date();
      d.setHours(endHour24, endMin, 0, 0);
      endTimeStr = this.roundToNearestSlot(d);
    }

    this.endMeetingTimes = [...this.meetingTimes];

    this.meetingForm.patchValue({
      endTime: endTimeStr,
      durationInSecond: minutes * 60
    });

    this.calculateDurationDisplay(minutes * 60);
    this.hasUnsavedChanges = true;
  }

  // Insert Agenda Templates
  applyAgendaTemplate(type: '1on1' | 'standup' | 'sprint' | 'client'): void {
    let templateHtml = '';
    switch (type) {
      case '1on1':
        templateHtml = `
          <h4><strong>1-on-1 Sync Agenda</strong></h4>
          <ul>
            <li><strong>Wins & Highlights:</strong> Key achievements since last sync</li>
            <li><strong>Current Priorities:</strong> Top projects in flight</li>
            <li><strong>Blockers & Support:</strong> Where can we unblock you?</li>
            <li><strong>Career & Growth:</strong> Long-term development and feedback</li>
            <li><strong>Action Items:</strong> Next milestones and follow-ups</li>
          </ul>`;
        break;
      case 'standup':
        templateHtml = `
          <h4><strong>Daily Standup Agenda</strong></h4>
          <ul>
            <li><strong>Yesterday:</strong> What did you achieve?</li>
            <li><strong>Today:</strong> What are your core tasks?</li>
            <li><strong>Roadblocks:</strong> Any blockers or dependencies?</li>
          </ul>`;
        break;
      case 'sprint':
        templateHtml = `
          <h4><strong>Sprint Planning & Demo</strong></h4>
          <ul>
            <li><strong>Sprint Goals:</strong> Key target deliverables</li>
            <li><strong>User Stories:</strong> Priority backlog walkthrough</li>
            <li><strong>Demo & Acceptance:</strong> Live walkthrough of features</li>
            <li><strong>Q&A & Sign-off:</strong> Feedback and deployment targets</li>
          </ul>`;
        break;
      case 'client':
        templateHtml = `
          <h4><strong>Client Presentation & Discussion</strong></h4>
          <ul>
            <li><strong>Welcome & Introductions:</strong> Team roll call</li>
            <li><strong>Product Showcase:</strong> Feature highlights & value demo</li>
            <li><strong>Discussion & Q&A:</strong> Client feedback and custom requests</li>
            <li><strong>Next Steps:</strong> Rollout timeline and next sync</li>
          </ul>`;
        break;
    }

    if (this.editorContent && this.editorContent.nativeElement) {
      this.editorContent.nativeElement.innerHTML = templateHtml;
      this.meetingForm.get('agenda')?.setValue(templateHtml);
      this.hasUnsavedChanges = true;
    }
  }

  onMeetingDateSelect(e: NgbDateStruct): void {
    const startTime = this.meetingForm.get('startTime')?.value;
    let date: Date;
    if (startTime) {
      const time = this.convertTo24Hour(startTime);
      date = new Date(e.year, e.month - 1, e.day, time[0], time[1]);
    } else {
      date = new Date(e.year, e.month - 1, e.day);
    }
    this.meetingForm.get('startDate')?.setValue(date);
    this.minEndPickerDate = e;
  }

  onstartTimeSelect(): void {
    let date = this.meetingForm.get('startDate')?.value;
    const startTime = this.meetingForm.get('startTime')?.value;
    if (startTime) {
      date = this.parseDateSafely(date, new Date());
      const time = this.convertTo24Hour(startTime);
      const selectedDate = new Date(date.getFullYear(), date.getMonth(), date.getDate(), time[0], time[1]);
      this.meetingForm.get('startDate')?.setValue(selectedDate);
    }
    this.endMeetingTimes = [...this.meetingTimes];
    this.calculateDuration();
  }

  onMeetingEndDateSelect(e: NgbDateStruct): void {
    const endTime = this.meetingForm.get('endTime')?.value;
    let date: Date;
    if (endTime) {
      const time = this.convertTo24Hour(endTime);
      date = new Date(e.year, e.month - 1, e.day, time[0], time[1]);
    } else {
      date = new Date(e.year, e.month - 1, e.day);
    }
    this.meetingForm.get('endDate')?.setValue(date);
  }

  onEndTimeSelect(): void {
    let date = this.meetingForm.get('endDate')?.value;
    const endTime = this.meetingForm.get('endTime')?.value;
    if (endTime) {
      date = this.parseDateSafely(date, new Date());
      const time = this.convertTo24Hour(endTime);
      const selectedDate = new Date(date.getFullYear(), date.getMonth(), date.getDate(), time[0], time[1]);
      this.meetingForm.get('endDate')?.setValue(selectedDate);
    }
    this.endMeetingTimes = [...this.meetingTimes];
    this.calculateDuration();
  }

  private calculateDuration(): void {
    const startTime: string = this.meetingForm.get('startTime')?.value;
    const endTime: string = this.meetingForm.get('endTime')?.value;

    if (startTime && endTime) {
      const start24 = this.convertTo24Hour(startTime);
      const end24 = this.convertTo24Hour(endTime);

      const startMinutes = start24[0] * 60 + start24[1];
      let endMinutes = end24[0] * 60 + end24[1];

      // Handle overnight or past midnight
      if (endMinutes < startMinutes) {
        endMinutes += 24 * 60;
      }

      let diffMinutes = endMinutes - startMinutes;
      if (diffMinutes <= 0) {
        diffMinutes = 30;
      }

      const durationSeconds = diffMinutes * 60;
      this.meetingForm.get('durationInSecond')?.setValue(durationSeconds);
      this.calculateDurationDisplay(durationSeconds);
    }
  }

  private calculateDurationDisplay(durationSeconds: number): void {
    const totalMinutes = Math.floor(durationSeconds / 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    if (hours > 0 && minutes > 0) {
      this.durationText = `${hours}h ${minutes}m`;
    } else if (hours > 0) {
      this.durationText = `${hours} hr`;
    } else {
      this.durationText = `${minutes} min`;
    }
  }

  resetForm(): void {
    if (this.originalMeetingDetail) {
      this.populateMeeting(this.originalMeetingDetail);
      this.hasUnsavedChanges = false;
      this.errorMessage = null;
      this.successMessage = 'Form reset to original values.';
      setTimeout(() => this.successMessage = null, 3000);
    }
  }

  saveMeeting(): void {
    this.isSubmitted = true;
    this.errorMessage = null;
    this.successMessage = null;

    if (this.meetingForm.invalid) {
      this.activeTab = 'details';
      return;
    }

    const rawValue = this.meetingForm.getRawValue();

    // Prepare start date
    let startDate: Date = rawValue.startDate;
    if (this.meetingDate) {
      const startTime = rawValue.startTime;
      const time = startTime ? this.convertTo24Hour(startTime) : [0, 0];
      startDate = new Date(this.meetingDate.year, this.meetingDate.month - 1, this.meetingDate.day, time[0], time[1], 0);
    } else if (startDate && !(startDate instanceof Date)) {
      startDate = new Date(startDate);
    }
    if (!startDate || isNaN(startDate.getTime())) {
      startDate = new Date();
    }

    // Prepare end date
    let endDate: Date = rawValue.endDate;
    if (this.meetingEndDate) {
      const endTime = rawValue.endTime;
      const time = endTime ? this.convertTo24Hour(endTime) : [0, 0];
      endDate = new Date(this.meetingEndDate.year, this.meetingEndDate.month - 1, this.meetingEndDate.day, time[0], time[1], 0);
    } else if (endDate && !(endDate instanceof Date)) {
      endDate = new Date(endDate);
    }
    if (!endDate || isNaN(endDate.getTime())) {
      const dur = Number(rawValue.durationInSecond || this.meetingDetail.durationInSecond || 1800);
      endDate = new Date(startDate.getTime() + (dur * 1000));
    }

    // Validation: Start Date vs End Date & Start Time vs End Time
    const startDayDate = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate()).getTime();
    const endDayDate = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate()).getTime();

    if (startDayDate > endDayDate) {
      this.errorMessage = 'End Date cannot be earlier than Start Date. Please select a valid date range.';
      this.activeTab = 'details';
      return;
    }

    if (startDayDate === endDayDate) {
      const startTime = rawValue.startTime;
      const endTime = rawValue.endTime;
      if (startTime && endTime) {
        const start24 = this.convertTo24Hour(startTime);
        const end24 = this.convertTo24Hour(endTime);
        const startMinutes = start24[0] * 60 + start24[1];
        const endMinutes = end24[0] * 60 + end24[1];
        if (startMinutes >= endMinutes) {
          this.errorMessage = 'End Time must be later than Start Time for meetings on the same date.';
          this.activeTab = 'details';
          return;
        }
      }
    }

    if (startDate.getTime() >= endDate.getTime()) {
      this.errorMessage = 'Meeting End Date & Time must be after Start Date & Time.';
      this.activeTab = 'details';
      return;
    }

    this.isSaving = true;

    // Prepare participants
    let participantsStr = '';
    let participantsIdList: string[] = [];

    if (this.selectedParticipants && this.selectedParticipants.length > 0) {
      participantsIdList = this.selectedParticipants.map(p => String(p.userId || p.id || ''));
      participantsStr = JSON.stringify(this.selectedParticipants);
    }

    const payload = {
      meetingDetailId: Number(rawValue.meetingDetailId || this.meetingDetail.meetingDetailId || this.meetingDetailId || 0),
      meetingId: String(rawValue.meetingId || this.meetingDetail.meetingId || ''),
      meetingPassword: String(rawValue.meetingPassword || this.meetingDetail.meetingPassword || ''),
      organizedBy: Number(rawValue.organizedBy || this.meetingDetail.organizedBy || (this.user?.userId ? Number(this.user.userId) : 0)),
      agenda: rawValue.agenda || this.meetingDetail.agenda || '',
      title: rawValue.title || this.meetingDetail.title || '',
      startDate: this.formatLocalDateTime(startDate),
      startTime: this.formatLocalDateTime(startDate),
      endDate: this.formatLocalDateTime(endDate),
      endTime: this.formatLocalDateTime(endDate),
      durationInSecond: Number(rawValue.durationInSecond || this.meetingDetail.durationInSecond || 1800),
      organizerName: this.meetingDetail.organizerName || (this.user?.firstName ? `${this.user.firstName} ${this.user.lastName || ''}`.trim() : ''),
      hasQuickMeeting: Boolean(this.meetingDetail.hasQuickMeeting),
      conversationId: this.meetingDetail.conversationId || '',
      isAllDay: Boolean(rawValue.isAllDay),
      repeatType: Number(rawValue.repeatType || 0),
      participants: participantsStr,
      participantsId: participantsIdList,
      participantCount: this.selectedParticipants.length || this.meetingDetail.participantCount || 0
    };

    this.http.put('meeting/updateMeetingDetail', payload).then((res: ResponseModel) => {
      this.isSaving = false;
      if (res && res.isSuccess !== false) {
        this.hasUnsavedChanges = false;
        this.successMessage = 'Meeting details updated successfully!';
        if (res.responseBody) {
          this.meetingDetail = { ...res.responseBody };
          this.originalMeetingDetail = { ...res.responseBody };
          this.populateMeeting(res.responseBody);
        } else {
          this.meetingDetail = {
            ...this.meetingDetail,
            ...payload,
            startDate: payload.startDate,
            endDate: payload.endDate,
            startTime: payload.startTime,
            endTime: payload.endTime
          };
          this.originalMeetingDetail = { ...this.meetingDetail };
        }
        // Auto-dismiss success notification after 5 seconds but stay on page
        setTimeout(() => {
          if (this.successMessage === 'Meeting details updated successfully!') {
            this.successMessage = null;
          }
        }, 5000);
      } else {
        this.errorMessage = res?.errorMessage || 'Failed to update meeting. Please check the values and try again.';
      }
    }).catch(err => {
      this.isSaving = false;
      console.error('Error updating meeting detail:', err);
      this.errorMessage = err?.message || 'Failed to save meeting changes. Please try again.';
    });
  }

  joinMeeting(): void {
    if (!this.meetingDetail || this.isExpired) return;
    const convId = this.meetingDetail.conversationId;
    if (convId) {
      this.ws.currentConversationId.set(convId);
      if (this.user?.userId) {
        this.joinCallService.execute(this.user.userId, convId);
      }
    }
    this.router.navigate(['/btc/preview'], {
      state: {
        id: convId,
        type: CallType.AUDIO,
        autoJoin: true,
        title: this.meetingDetail.title || 'Meeting'
      }
    });
  }

  extendFromNow(additionalMinutes: number = 30): void {
    const now = new Date();
    this.meetingDate = {
      year: now.getFullYear(),
      month: now.getMonth() + 1,
      day: now.getDate()
    };
    this.minEndPickerDate = { ...this.meetingDate };

    let startTimeStr = this.roundToNearestSlot(now);
    if (!this.meetingTimes.includes(startTimeStr)) {
      startTimeStr = this.meetingTimes[0];
    }

    const newEndDate = new Date(now.getTime() + (additionalMinutes * 60 * 1000));
    this.meetingEndDate = {
      year: newEndDate.getFullYear(),
      month: newEndDate.getMonth() + 1,
      day: newEndDate.getDate()
    };

    const startIndex = this.meetingTimes.indexOf(startTimeStr);
    if (startIndex !== -1) {
      this.endMeetingTimes = this.meetingTimes.slice(startIndex + 1);
    } else {
      this.endMeetingTimes = [...this.meetingTimes];
    }

    let endTimeStr = this.roundToNearestSlot(newEndDate);
    if (!this.endMeetingTimes.includes(endTimeStr)) {
      endTimeStr = this.endMeetingTimes[0] || this.meetingTimes[0];
    }

    this.meetingForm.patchValue({
      startDate: now,
      endDate: newEndDate,
      startTime: startTimeStr,
      endTime: endTimeStr,
      durationInSecond: additionalMinutes * 60
    });

    this.calculateDurationDisplay(additionalMinutes * 60);
    this.hasUnsavedChanges = true;
    this.successMessage = `Meeting extended by ${additionalMinutes}m. Click 'Save Changes' to update.`;
    setTimeout(() => {
      if (this.successMessage?.startsWith('Meeting extended')) {
        this.successMessage = null;
      }
    }, 4000);
  }

  deleteMeeting(): void {
    const id = this.meetingDetail.meetingDetailId || this.meetingDetailId;
    if (!id) return;

    if (!confirm('Are you sure you want to delete this meeting? This action cannot be undone.')) {
      return;
    }

    this.isDeleting = true;
    this.errorMessage = null;

    this.http.delete(`meeting/deleteMeetingDetail/${id}`).then((res: ResponseModel) => {
      this.isDeleting = false;
      this.successMessage = 'Meeting deleted successfully!';
      setTimeout(() => {
        this.router.navigate(['/btc/dashboard']);
      }, 1000);
    }).catch(err => {
      this.http.delete(`meeting/deleteMeeting?meetingDetailId=${id}`).then(() => {
        this.isDeleting = false;
        this.successMessage = 'Meeting deleted successfully!';
        setTimeout(() => {
          this.router.navigate(['/btc/dashboard']);
        }, 1000);
      }).catch(err2 => {
        this.isDeleting = false;
        console.error('Error deleting meeting:', err2);
        this.errorMessage = err2?.message || 'Failed to delete meeting. Please try again.';
      });
    });
  }

  copyMeetingLink(tooltip: any): void {
    const targetId = this.meetingDetail.meetingId && this.meetingDetail.meetingDetailId
      ? `${this.meetingDetail.meetingId}_${this.meetingDetail.meetingDetailId}`
      : (this.meetingDetail.meetingId || this.meetingDetailId);

    const url = environment.production
      ? `https://www.confeet.com/#/btc/preview?meetingid=${targetId}`
      : `http://localhost:4200/#/btc/preview?meetingid=${targetId}`;

    navigator.clipboard.writeText(url).then(() => {
      tooltip.open();
      setTimeout(() => tooltip.close(), 1500);
    });
  }

  copyMeetingId(tooltip: any): void {
    if (this.meetingDetail.meetingId) {
      navigator.clipboard.writeText(this.meetingDetail.meetingId).then(() => {
        tooltip.open();
        setTimeout(() => tooltip.close(), 1500);
      });
    }
  }

  copyPasscode(tooltip: any): void {
    if (this.meetingDetail.meetingPassword) {
      navigator.clipboard.writeText(this.meetingDetail.meetingPassword).then(() => {
        tooltip.open();
        setTimeout(() => tooltip.close(), 1500);
      });
    }
  }

  copyInviteText(tooltip: any): void {
    const targetId = this.meetingDetail.meetingId && this.meetingDetail.meetingDetailId
      ? `${this.meetingDetail.meetingId}_${this.meetingDetail.meetingDetailId}`
      : (this.meetingDetail.meetingId || this.meetingDetailId);

    const url = environment.production
      ? `https://www.confeet.com/#/btc/preview?meetingid=${targetId}`
      : `http://localhost:4200/#/btc/preview?meetingid=${targetId}`;

    const startDateStr = this.meetingForm.get('startDate')?.value ? this.toFullDateString(this.meetingForm.get('startDate')?.value) : '';
    const startTimeStr = this.meetingForm.get('startTime')?.value || '';
    const endTimeStr = this.meetingForm.get('endTime')?.value || '';

    const shareUrl = `${this.meetingDetail.organizerName || this.user?.firstName || 'Host'} invited you to a BottomHalf Meeting:

Topic: ${this.meetingForm.get('title')?.value || 'Meeting'}
Date: ${startDateStr}
Time: ${startTimeStr} - ${endTimeStr} (IST)

Join Meeting Link:
${url}

Meeting ID: ${this.meetingDetail.meetingId || ''}
Passcode: ${this.meetingDetail.meetingPassword || ''}`;

    navigator.clipboard.writeText(shareUrl).then(() => {
      tooltip.open();
      setTimeout(() => tooltip.close(), 1500);
    });
  }

  onParticipantSearch(): void {
    if (!this.participantSearchQuery) {
      this.participantSearchResults = [];
      return;
    }
    this.http.get(`users/search?term=${this.participantSearchQuery}&pageNumber=1&pageSize=10`).then((res: ResponseModel) => {
      if (res.responseBody && res.responseBody.data) {
        this.participantSearchResults = res.responseBody.data.map((u: any) => ({
          userId: u.id || u.userId,
          name: (u.firstName && u.lastName) ? `${u.firstName} ${u.lastName}` : (u.firstName || u.email || u.id),
          email: u.email,
          avatar: u.avatarUrl,
          designation: u.email
        })).filter((u: any) =>
          !this.selectedParticipants.find(sp => sp.userId === u.userId)
        );
      }
    });
  }

  addParticipant(user: any): void {
    if (!this.selectedParticipants.find(p => p.userId === (user.userId || user.id))) {
      this.selectedParticipants.push({
        userId: user.userId || user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        name: (user.firstName && user.lastName) ? `${user.firstName} ${user.lastName}` : (user.name || user.email)
      });
      this.hasUnsavedChanges = true;
    }
    this.participantSearchQuery = '';
    this.participantSearchResults = [];
  }

  removeParticipant(user: any): void {
    this.selectedParticipants = this.selectedParticipants.filter(p => p.userId !== user.userId);
    this.hasUnsavedChanges = true;
  }

  execCommand(command: string, value: string = ''): void {
    document.execCommand(command, false, value);
    this.editorContent?.nativeElement?.focus();
    this.hasUnsavedChanges = true;
  }

  updateAgendaContent(event: any): void {
    this.meetingForm.get('agenda')?.setValue(event.target.innerHTML);
    this.hasUnsavedChanges = true;
  }

  goBack(): void {
    if (this.hasUnsavedChanges) {
      if (confirm('You have unsaved changes. Are you sure you want to leave?')) {
        this.router.navigate(['/btc/dashboard']);
      }
    } else {
      this.router.navigate(['/btc/dashboard']);
    }
  }

  private convertTo24Hour(time: string): [number, number] {
    if (!time || typeof time !== 'string') {
      return [0, 0];
    }
    const cleanTime = time.trim();
    // Match 12-hour pattern like "10:30 A.M", "10:30 AM", "10:30:00 AM", "10:30pm"
    const match12 = cleanTime.match(/^0?(\d{1,2}):(\d{2})(?::\d{2})?\s*([AaPp])\.?([Mm])?\.?$/i);
    if (match12) {
      let hours = parseInt(match12[1], 10);
      const minutes = parseInt(match12[2], 10);
      const isPm = match12[3].toUpperCase() === 'P';
      if (!isPm && hours === 12) {
        hours = 0;
      } else if (isPm && hours !== 12) {
        hours += 12;
      }
      return [hours, minutes];
    }

    // Match 24-hour pattern like "14:30" or "14:30:00"
    const match24 = cleanTime.match(/^(\d{1,2}):(\d{2})/);
    if (match24) {
      return [parseInt(match24[1], 10), parseInt(match24[2], 10)];
    }

    return [0, 0];
  }

  private formatTime(date: Date): string {
    let hours = date.getHours();
    const minutes = date.getMinutes();
    const ampm = hours >= 12 ? 'P.M' : 'A.M';

    hours = hours % 12;
    hours = hours ? hours : 12;

    const minStr = minutes < 10 ? '0' + minutes : minutes;
    return `${hours}:${minStr} ${ampm}`;
  }

  private roundToNearestSlot(date: Date): string {
    const d = new Date(date);
    let mins = d.getMinutes();
    if (mins < 15) {
      mins = 0;
    } else if (mins < 45) {
      mins = 30;
    } else {
      mins = 0;
      d.setHours(d.getHours() + 1);
    }
    d.setMinutes(mins);
    return this.formatTime(d);
  }

  private isUtcDate(date: any): boolean {
    if (!date) return false;
    if (typeof date === 'string') {
      const upper = date.trim().toUpperCase();
      if (upper.includes('Z') || upper.includes('+00:00') || upper.includes('-00:00') || upper.endsWith('+0000') || upper.includes('UTC')) {
        return true;
      }
      const separatorIndex = upper.indexOf('T') !== -1 ? upper.indexOf('T') : upper.indexOf(' ');
      if (separatorIndex !== -1) {
        const timePart = upper.substring(separatorIndex + 1);
        if (timePart.indexOf('+') === -1 && timePart.indexOf('-') === -1) {
          return true;
        }
      }
    }
    return false;
  }

  private convertedDate(date: any): Date {
    return ToLocateDate(date) || new Date(date);
  }

  formatLocalDateTime(d: Date): string {
    const pad = (n: number) => (n < 10 ? '0' + n : n.toString());
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }

  parseDateSafely(input: any, fallback: Date): Date {
    if (!input) return fallback;
    if (input instanceof Date && !isNaN(input.getTime())) return input;
    if (typeof input === 'string' && input.trim().length > 0) {
      const d = this.isUtcDate(input) ? this.convertedDate(input) : new Date(input);
      if (d && !isNaN(d.getTime())) return d;
    }
    return fallback;
  }

  extractTimeSlot(input: any, fallbackDate: Date): string {
    if (!input) {
      return this.roundToNearestSlot(fallbackDate);
    }
    if (input instanceof Date && !isNaN(input.getTime())) {
      return this.roundToNearestSlot(input);
    }
    if (typeof input === 'string') {
      const trimmed = input.trim();
      if (!trimmed) {
        return this.roundToNearestSlot(fallbackDate);
      }
      if (this.meetingTimes.includes(trimmed)) {
        return trimmed;
      }

      // Handle 12-hour with AM / PM / A.M / P.M
      const match12 = trimmed.match(/^0?(\d{1,2}):(\d{2})(?::\d{2})?\s*([AaPp])\.?([Mm])?\.?$/i);
      if (match12) {
        let hour = parseInt(match12[1], 10);
        let min = parseInt(match12[2], 10);
        const meridiem = match12[3].toUpperCase() === 'P' ? 'P.M' : 'A.M';
        if (hour >= 1 && hour <= 12) {
          const roundedMin = min < 15 ? '00' : (min < 45 ? '30' : '00');
          if (min >= 45) {
            hour = (hour % 12) + 1;
          }
          const candidate = `${hour}:${roundedMin} ${meridiem}`;
          if (this.meetingTimes.includes(candidate)) {
            return candidate;
          }
        }
      }

      // Handle 24-hour format: e.g. "14:30" or "14:30:00"
      const match24 = trimmed.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
      if (match24) {
        let hour24 = parseInt(match24[1], 10);
        let min = parseInt(match24[2], 10);
        if (hour24 >= 0 && hour24 < 24) {
          const displayMin = min < 15 ? '00' : (min < 45 ? '30' : '00');
          if (min >= 45) {
            hour24 = (hour24 + 1) % 24;
          }
          const displayHour = hour24 % 12 === 0 ? 12 : hour24 % 12;
          const ampm = hour24 < 12 ? 'A.M' : 'P.M';
          const candidate = `${displayHour}:${displayMin} ${ampm}`;
          if (this.meetingTimes.includes(candidate)) {
            return candidate;
          }
        }
      }

      // Handle full ISO date strings e.g. "2026-09-05T14:30:00"
      if (trimmed.includes('T') || trimmed.includes('-') || trimmed.includes('/')) {
        const d = this.parseDateSafely(trimmed, fallbackDate);
        if (d && !isNaN(d.getTime())) {
          return this.roundToNearestSlot(d);
        }
      }
    }
    return this.roundToNearestSlot(fallbackDate);
  }

  toFullDateString(dateInput: any): string {
    if (!dateInput) return '';
    const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
    const options: Intl.DateTimeFormatOptions = {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    };
    return date.toLocaleDateString('en-US', options);
  }
}
