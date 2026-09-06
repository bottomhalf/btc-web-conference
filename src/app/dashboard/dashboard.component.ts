import { Component, OnDestroy, OnInit, ViewChild, ElementRef } from '@angular/core';
import { FormGroup, FormControl, Validators, FormsModule, ReactiveFormsModule, FormBuilder } from '@angular/forms';
import { NgbDatepickerModule, NgbDateStruct, NgbDropdownModule, NgbTooltipModule } from '@ng-bootstrap/ng-bootstrap';
import { AjaxService } from '../providers/services/ajax.service';
import { HideModal, ShowModal, ToLocateDate } from '../providers/services/common.service';
import { iNavigation } from '../providers/services/iNavigation';
import { CommonModule } from '@angular/common';
import { LocalService } from '../providers/services/local.service';
import { environment } from '../../environments/environment';
import { ConfeetSocketService } from '../providers/socket/confeet-socket.service';
import { MeetingDetail, ResponseModel, User } from '../models/model';
import { Router } from '@angular/router';
import { JoinCallService } from '../providers/socket/client-events/call/join-call.service';
import { CallType } from '../models/conference_call/call_model';
import { MultiUserAutocompleteComponent } from '../shared/components/multi-user-autocomplete/multi-user-autocomplete.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, NgbDatepickerModule, NgbDropdownModule, NgbTooltipModule, MultiUserAutocompleteComponent],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css'
})
export class DashboardComponent implements OnInit, OnDestroy {
  meetingDate!: NgbDateStruct;
  meetingTimes: Array<string> = [];
  minPickerDate!: NgbDateStruct;
  meetingEndDate!: NgbDateStruct;
  minEndPickerDate!: NgbDateStruct;
  meetingForm!: FormGroup;
  meetingDetail: MeetingDetail = { agenda: '', durationInSecond: 0, meetingDetailId: 0, meetingId: '', meetingPassword: '', organizedBy: 0, title: '', startTime: null, endTime: null, isAllDay: false, repeatType: 0, participants: '' }
  endMeetingTimes: Array<string> = [];
  participantSearchQuery: string = '';
  participantSearchResults: any[] = [];
  selectedParticipants: any[] = [];
  @ViewChild('editorContent') editorContent!: ElementRef;
  isSubmitted: boolean = false;
  isLoading: boolean = false;
  isPageReady: boolean = false;
  isEditing: boolean = false;
  quickMeetingTitle: string = "";
  showAll: boolean = false;
  duration: string = "00:00";
  today: Date = new Date();
  recentMeetings: Array<MeetingDetail> = [];
  allSchedularMeeting: Array<MeetingDetail> = [];
  user: User = null;
  searchQuery: string = '';
  activeMeetingFilter: 'all' | 'quick' | 'scheduled' = 'all';

  get totalMeetingCount(): number {
    return (this.recentMeetings?.length || 0) + (this.allSchedularMeeting?.length || 0);
  }

  get filteredRecentMeetings(): MeetingDetail[] {
    let list = this.recentMeetings || [];
    if (this.searchQuery) {
      const q = this.searchQuery.toLowerCase().trim();
      list = list.filter(m => (m.title && m.title.toLowerCase().includes(q)) || (m.meetingId && m.meetingId.toLowerCase().includes(q)));
    }
    return this.showAll ? list : list.slice(0, 6);
  }

  get filteredSchedularMeetings(): MeetingDetail[] {
    let list = this.allSchedularMeeting || [];
    if (this.searchQuery) {
      const q = this.searchQuery.toLowerCase().trim();
      list = list.filter(m => (m.title && m.title.toLowerCase().includes(q)) || (m.meetingId && m.meetingId.toLowerCase().includes(q)) || (m.organizerName && m.organizerName.toLowerCase().includes(q)));
    }
    return list;
  }

  private timer!: any;
  constructor(private nav: iNavigation,
    private local: LocalService,
    private ws: ConfeetSocketService,
    private fb: FormBuilder,
    private router: Router,
    private http: AjaxService,
    private joinCallService: JoinCallService
  ) {
    const today = new Date();
    this.minPickerDate = {
      year: today.getFullYear(),
      month: today.getMonth() + 1, // Month is 0-indexed in Date, 1-indexed in NgbDateStruct
      day: today.getDate()
    };
  }

  async ngOnInit() {
    this.user = this.local.getUser();
    history.pushState(null, '', window.location.href);
    window.addEventListener('popstate', this.popStateListener);
    this.timer = setInterval(() => {
      this.today = new Date();
    }, 1000); // update every second

    this.generateTimeSlots();
    this.initForm();
    this.loadData();
  }

  generateTimeSlots() {
    this.meetingTimes = [];
    let hour = 0;
    let minute = 0;

    while (hour < 24) {
      let displayHour = hour % 12 === 0 ? 12 : hour % 12;
      let ampm = hour < 12 ? "A.M" : "P.M";
      let displayMinute = minute === 0 ? "00" : "30";
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

  private initForm() {
    this.meetingForm = this.fb.group({
      meetingDetailId: new FormControl(this.meetingDetail.meetingDetailId),
      meetingId: new FormControl(this.meetingDetail.meetingId),
      meetingPassword: new FormControl(this.meetingDetail.meetingPassword),
      organizedBy: new FormControl(this.meetingDetail.organizedBy),
      agenda: new FormControl(this.meetingDetail.agenda),
      title: new FormControl(this.meetingDetail.title, [Validators.required]),
      startDate: new FormControl(this.meetingDetail.startDate, [Validators.required]),
      durationInSecond: new FormControl(this.meetingDetail.durationInSecond),
      endDate: new FormControl(this.meetingDetail.endDate, [Validators.required]),
      startTime: new FormControl(this.meetingDetail.startTime, [Validators.required]),
      endTime: new FormControl(this.meetingDetail.endTime, [Validators.required]),
      isAllDay: new FormControl(this.meetingDetail.isAllDay),
      repeatType: new FormControl(this.meetingDetail.repeatType)
    });
  }

  onMeetingDateSelect(e: NgbDateStruct) {
    let startTime = this.meetingForm.get("startTime").value;
    let date;
    if (startTime) {
      var time = this.convertTo24Hour(startTime);
      date = new Date(e.year, e.month - 1, e.day, time[0], time[1]);
    } else {
      date = new Date(e.year, e.month - 1, e.day);
    }
    this.meetingForm.get('startDate')?.setValue(date);
    this.minEndPickerDate = e;
    this.calculateDuration();
  }

  onstartTimeSelect() {
    let date = this.meetingForm.get('startDate').value;
    if (date) {
      let startTime = this.meetingForm.get("startTime").value;
      var time = this.convertTo24Hour(startTime);
      var selectedDate = new Date(date.getFullYear(), date.getMonth(), date.getDate(), time[0], time[1]);
      this.meetingForm.get('startDate')?.setValue(selectedDate);

      // Update end meeting times to only show times after start time
      const startIndex = this.meetingTimes.indexOf(startTime);
      if (startIndex !== -1) {
        this.endMeetingTimes = this.meetingTimes.slice(startIndex + 1);
        let currentEndTime = this.meetingForm.get('endTime').value;
        if (this.endMeetingTimes.length > 0 && (!currentEndTime || this.endMeetingTimes.indexOf(currentEndTime) === -1)) {
          this.meetingForm.get('endTime').setValue(this.endMeetingTimes[0]);
          this.onEndTimeSelect();
        }
      }
      this.calculateDuration();
    }
  }

  onMeetingEndDateSelect(e: NgbDateStruct) {
    let startTime = this.meetingForm.get("endTime").value;
    let date;
    if (startTime) {
      var time = this.convertTo24Hour(startTime);
      date = new Date(e.year, e.month - 1, e.day, time[0], time[1]);
    } else {
      date = new Date(e.year, e.month - 1, e.day);
    }
    this.meetingForm.get('endDate')?.setValue(date);
    this.calculateDuration();
  }

  onEndTimeSelect() {
    let date = this.meetingForm.get('endDate').value;
    if (date) {
      let startTime = this.meetingForm.get("endTime").value;
      var time = this.convertTo24Hour(startTime);
      var selectedDate = new Date(date.getFullYear(), date.getMonth(), date.getDate(), time[0], time[1]);
      this.meetingForm.get('endDate')?.setValue(selectedDate);
      this.calculateDuration();
    }
  }

  saveMeetingDetail() {
    this.isSubmitted = true;
    if (this.meetingForm.invalid) {
      return;
    }
    this.isLoading = true;
    let value = this.meetingForm.getRawValue();
    if (this.selectedParticipants.length > 0) {
      value.participantsId = this.selectedParticipants.map(p => p.userId);
    } else {
      value.participantsId = [];
    }

    console.log(value);
    this.http.post("meeting/generateMeeting", value).then((res: ResponseModel) => {
      if (res.responseBody) {
        this.bindMeetings(res.responseBody.QuickMeetings)
        this.bindSchedularMeetings(res.responseBody.ScheduledMeetings as Array<MeetingDetail>);
        HideModal("createMeeting");
        this.isLoading = false;
        this.isSubmitted = false;
        this.isEditing = false;
      }
    }).catch(e => {
      this.isLoading = false;
    })
  }

  private loadData() {
    this.isPageReady = false;
    this.http.get("meeting/getAllMeetingByOrganizer").then((res: ResponseModel) => {
      if (res.responseBody) {
        this.bindMeetings(res.responseBody.QuickMeetings)
        this.bindSchedularMeetings(res.responseBody.ScheduledMeetings as Array<MeetingDetail>);
        this.isPageReady = true;
      }
    }).catch(e => {
      console.error(e);
    });
  }

  private bindMeetings(res: any) {
    this.recentMeetings = (res != null && res.length > 0) ? res as MeetingDetail[] : [];
  }

  private isUtcDate(date: any): boolean {
    if (!date) return false;
    if (typeof date === 'string') {
      const upper = date.trim().toUpperCase();
      if (upper.indexOf('Z') !== -1 || upper.indexOf('+00:00') !== -1 || upper.indexOf('-00:00') !== -1 || upper.endsWith('+0000') || upper.includes('UTC')) {
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

  private bindSchedularMeetings(res: Array<MeetingDetail>) {
    this.allSchedularMeeting = res || [];
    this.allSchedularMeeting.forEach(meeting => {
      if (meeting.startDate) {
        if (this.isUtcDate(meeting.startDate)) {
          meeting.startDate = this.convertedDate(meeting.startDate);
        }
        const startDate = new Date(meeting.startDate);
        meeting.startTime = this.formatTime(startDate);
        if (meeting.endDate && this.isUtcDate(meeting.endDate)) {
          meeting.endDate = this.convertedDate(meeting.endDate);
        }
        if (meeting.durationInSecond) {
          meeting.endDate = new Date(startDate.getTime() + (meeting.durationInSecond * 1000));
          meeting.endTime = this.formatTime(meeting.endDate);
        } else if (meeting.endDate) {
          meeting.endTime = this.formatTime(new Date(meeting.endDate));
        }
      }
    });
  }

  joinMeeting(item: any) {
    this.ws.currentConversationId.set(item.conversationId);
    this.joinCallService.execute(this.user.userId, item.conversationId);
    this.router.navigate(['/btc/preview'], {
      state: {
        id: item.conversationId,
        type: CallType.AUDIO,
        autoJoin: true,
        title: item.title ? item.title : 'Unknown'
      }
    });
  }

  scheduleMeetingPopup() {
    this.isEditing = false;
    this.isSubmitted = false;
    this.meetingDetail = { agenda: '', durationInSecond: 0, repeatType: 0, meetingDetailId: 0, meetingId: '', meetingPassword: '', organizedBy: 0, title: '', startTime: null, endTime: null };
    this.meetingDate = null;
    this.meetingEndDate = null;
    this.selectedParticipants = [];
    if (this.editorContent && this.editorContent.nativeElement) {
      this.editorContent.nativeElement.innerHTML = '';
    }
    this.initForm();
    ShowModal("createMeeting");
  }

  editMeeting(item: MeetingDetail) {
    const id = item.meetingDetailId || item.meetingId;
    if (id) {
      this.router.navigate(['/btc/edit-meeting', id]);
    }
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

  quickMeetingModal() {
    let user = this.local?.getUser();
    let fullName = user.firstName;
    if (user.lastName)
      fullName = fullName + " " + user.lastName;

    this.quickMeetingTitle = `Meeting with ${fullName}`;
    this.isSubmitted = false;
    ShowModal("quickMeetingModal");
  }

  generateQuickMeeting() {
    this.isSubmitted = true;
    if (!this.quickMeetingTitle) {
      return;
    }

    this.isLoading = true;
    let meetingDetal = {
      title: this.quickMeetingTitle
    };
    this.http.post("meeting/generateQuickMeeting", meetingDetal).then((res: ResponseModel) => {
      if (res.responseBody) {
        this.bindMeetings(res.responseBody.QuickMeetings)
        this.bindSchedularMeetings(res.responseBody.ScheduledMeetings as Array<MeetingDetail>);
        this.isLoading = false;
        HideModal("quickMeetingModal");
      }
    }).catch(e => {
      this.isLoading = false;
    })
  }

  convertedDate(date: any) {
    return ToLocateDate(date);
  }

  copyLink(item: any, tooltip: any) {
    let targetId = item.meetingId && item.meetingDetailId ? `${item.meetingId}_${item.meetingDetailId}` : (item.meetingId || item.id);
    let url = environment.production ? `https://www.confeet.com/#/btc/preview?meetingid=${targetId}` : `http://localhost:4200/#/btc/preview?meetingid=${targetId}`;
    navigator.clipboard.writeText(url).then(() => {
      console.log('Copied to clipboard:');
      tooltip.open();
      setTimeout(() => tooltip.close(), 1500); // Close tooltip after 1.5s
    }).catch(err => {
      console.error('Failed to copy:', err);
    });
  }

  get visibleRecords(): MeetingDetail[] {
    return this.showAll ? this.recentMeetings : this.recentMeetings.slice(0, 3);
  }

  toggleView() {
    this.showAll = !this.showAll;
  }

  private convertTo24Hour(time: string): Array<number> {
    const timeParts = time.split(' '); // Split into time and AM/PM
    const timeArr = timeParts[0].split(':'); // Split hours and minutes
    let hours = parseInt(timeArr[0], 10);
    const minutes = timeArr[1];
    const period = timeParts[1]; // AM or PM

    if (period === 'A.M' && hours === 12) {
      hours = 0; // Midnight case
    }
    if (period === 'P.M' && hours !== 12) {
      hours += 12; // Convert PM times (except for 12 PM which is noon)
    }

    return [hours, Number(minutes)];
  }

  private calculateDuration() {
    let startDate = this.meetingForm.get('startDate').value;
    let endDate = this.meetingForm.get('endDate').value;
    let startTime = this.meetingForm.get('startTime').value;
    let endTime = this.meetingForm.get('endTime').value;

    if (startDate && endDate && startTime && endTime) {
      const timeDifferenceMs = endDate.getTime() - startDate.getTime();
      if (timeDifferenceMs < 0) {
        this.meetingForm.get("endDate").setValue(null);
        console.error("Invalid end time selected")
        return;
      }
      this.meetingForm.get("durationInSecond").setValue(timeDifferenceMs / 1000);
      this.getDuration(timeDifferenceMs / 1000);
    }
  }

  getDuration(duration: number) {
    var totalMinutes = Math.floor(duration / 60);
    var hours = Math.floor(totalMinutes / 60);

    this.duration = `${hours}:${totalMinutes % 60}`;
  }

  joinMeetingPopup() {
    this.isSubmitted = false;
    this.meetingDetail.meetingId = null;
    this.meetingDetail.meetingPassword = null;
    ShowModal("joinMeetingModal");
  }

  JoinMeetingBydId() {
    this.isSubmitted = true;
    if (!this.meetingDetail.meetingId || !this.meetingDetail.meetingPassword) {
      console.error("Please enter meeting id and password")
      return;
    }

    this.isLoading = true;
    this.http.post("meeting/validateMeetingIdPassCode", {
      meetingId: this.meetingDetail.meetingId,
      meetingPassword: this.meetingDetail.meetingPassword
    }).then((res: ResponseModel) => {
      if (res.responseBody) {
        HideModal("joinMeetingModal");
        let meeting = res.responseBody;
        this.joinMeeting(meeting);
        this.isLoading = false;
      }
    }).catch(e => {
      this.isLoading = false;
    })
  }

  shareInviteLink(item: any, tooltip: any) {
    let targetId = item.meetingId && item.meetingDetailId ? `${item.meetingId}_${item.meetingDetailId}` : (item.meetingId || item.id);
    let url = environment.production ? `https://www.confeet.com/#/btc/preview?meetingid=${targetId}` : `http://localhost:4200/#/btc/preview?meetingid=${targetId}`;
    let shareUrl = `${item.organizerName || 'Host'} invited you to a BottomHalf Meeting:

${item.title || 'Meeting'}
${item.startDate ? this.toFullDateString(item.startDate) : ''}
${item.startTime || ''} - ${item.endTime || ''} (IST)
Meeting link: ${url}`;

    navigator.clipboard.writeText(shareUrl).then(() => {
      console.log('Copied to clipboard:');
      tooltip.open();
      setTimeout(() => tooltip.close(), 1500); // Close tooltip after 1.5s
    }).catch(err => {
      console.error('Failed to copy:', err);
    });
  }

  shareIdPasscodeLink(item: MeetingDetail, tooltip: any) {
    let shareUrl = `BottomHalf Meeting:
Meeting ID: ${item.meetingId}
Passcode: ${item.meetingPassword}`;
    navigator.clipboard.writeText(shareUrl).then(() => {
      console.log('Copied to clipboard:');
      tooltip.open();
      setTimeout(() => tooltip.close(), 1500); // Close tooltip after 1.5s
    }).catch(err => {
      console.error('Failed to copy:', err);
    });
  }

  private popStateListener = (event: PopStateEvent) => {
    history.pushState(null, '', window.location.href); // push state back
    alert('You cannot navigate back.');
  };

  private formatTime(date: Date): string {
    let hours = date.getHours();
    const minutes = date.getMinutes();
    const ampm = hours >= 12 ? 'P.M' : 'A.M';

    hours = hours % 12;
    hours = hours ? hours : 12; // convert 0 to 12 for midnight/noon

    const minStr = minutes < 10 ? '0' + minutes : minutes;

    return `${hours}:${minStr} ${ampm}`;
  }

  private toFullDateString(dateInput: Date): string {
    const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
    const options: Intl.DateTimeFormatOptions = {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    };
    return date.toLocaleDateString('en-US', options);
  }

  // Participant Search Logic
  onParticipantSearch() {
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

  addParticipant(user: any) {
    if (!this.selectedParticipants.find(p => p.userId === (user.userId || user.id))) {
      this.selectedParticipants.push({
        userId: user.userId || user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email
      });
    }
    this.participantSearchQuery = '';
    this.participantSearchResults = [];
  }

  removeParticipant(user: any) {
    this.selectedParticipants = this.selectedParticipants.filter(p => p.userId !== user.userId);
  }

  // Editor Logic
  execCommand(command: string) {
    document.execCommand(command, false, '');
    this.editorContent.nativeElement.focus();
  }

  updateAgendaContent(event: any) {
    this.meetingForm.get('agenda')?.setValue(event.target.innerHTML);
  }

  ngOnDestroy() {
    clearInterval(this.timer);
  }
}