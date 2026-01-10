import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormGroup, FormControl, Validators, FormsModule, ReactiveFormsModule, FormBuilder } from '@angular/forms';
import { NgbDatepickerModule, NgbDateStruct, NgbTooltipModule } from '@ng-bootstrap/ng-bootstrap';
import { AjaxService } from '../providers/services/ajax.service';
import { HideModal, ShowModal, ToLocateDate } from '../providers/services/common.service';
import { iNavigation } from '../providers/services/iNavigation';
import { CommonModule } from '@angular/common';
import { LocalService } from '../providers/services/local.service';
import { environment } from '../../environments/environment';
import { ConfeetSocketService } from '../providers/socket/confeet-socket.service';
import { MeetingDetail, ResponseModel, User } from '../models/model';
import { Preview } from '../models/constant';
import { Router } from '@angular/router';
import { ClientEventService } from '../providers/socket/client-event.service';
import { UserFilter } from '../models/user.filter';
import { Conversation } from '../components/global-search/search.models';
import { CallType } from '../models/conference_call/call_model';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, NgbDatepickerModule, NgbTooltipModule, NgbTooltipModule],
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
  meetingDetail: MeetingDetail = { agenda: '', durationInSecond: 0, meetingDetailId: 0, meetingId: '', meetingPassword: '', organizedBy: 0, title: '', startTime: null, endTime: null }
  isSubmitted: boolean = false;
  isLoading: boolean = false;
  isPageReady: boolean = false;
  quickMeetingTitle: string = "";
  showAll: boolean = false;
  duration: string = "00:00";
  today: Date = new Date();
  recentMeetings: Array<Conversation> = [];
  allSchedularMeeting: Array<MeetingDetail> = [];
  user: User = null;

  private timer!: any;
  constructor(private nav: iNavigation,
    private local: LocalService,
    private ws: ConfeetSocketService,
    private fb: FormBuilder,
    private router: Router,
    private http: AjaxService,
    private clientEventService: ClientEventService
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
      endTime: new FormControl(this.meetingDetail.endTime, [Validators.required])
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
    console.log(value);
    this.http.post("meeting/generateMeeting", value).then((res: ResponseModel) => {
      if (res.ResponseBody) {
        this.bindMeetings(res.ResponseBody);
        HideModal("createMeeting");
        this.isLoading = false;
        this.isSubmitted = false;
      }
    }).catch(e => {
      this.isLoading = false;
    })
  }

  private loadData() {
    this.isPageReady = false;
    this.http.get("meeting/get-recent-meetings").then((res: ResponseModel) => {
      if (res.ResponseBody) {
        this.bindMeetings(res.ResponseBody as UserFilter);
        this.isPageReady = true;
      }
    }).catch(e => {
      this.isPageReady = true;
    })
  }

  private bindMeetings(res: UserFilter) {
    this.recentMeetings = (res.data != null && res.data.length > 0) ? res.data as Conversation[] : [];
    // this.allSchedularMeeting = (res.data != null && res.data.length > 0) ? res.data.filter(x => !x.hasQuickMeeting) : [];
    // if (this.allSchedularMeeting.length > 0) {
    //   this.allSchedularMeeting.forEach(x => {
    //     let startDate = new Date(x.startDate);
    //     x.startTime = this.formatTime(startDate);
    //     x.endDate = new Date(startDate.getTime() + (x.durationInSecond * 1000));
    //     x.endTime = this.formatTime(x.endDate);
    //   })
    // }
  }

  joinMeeting(item: Conversation) {
    this.ws.currentConversationId.set(item.id);
    this.clientEventService.joinCall(this.user.userId, item.id);
    this.router.navigate(['/btc/preview'], {
      state: {
        id: item.id,
        type: CallType.AUDIO,
        title: item.conversationName ? item.conversationName : 'Unknown'
      }
    });
  }

  scheduleMeetingPopup() {
    this.isSubmitted = false;
    this.meetingDetail = { agenda: '', durationInSecond: 0, meetingDetailId: 0, meetingId: '', meetingPassword: '', organizedBy: 0, title: '', startTime: null, endTime: null };
    this.meetingDate = null;
    this.meetingEndDate = null;
    this.initForm();
    ShowModal("createMeeting");
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
      if (res.ResponseBody) {
        this.bindMeetings(res.ResponseBody);
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

  copyLink(item: MeetingDetail, tooltip: any) {
    let url = environment.production ? `www.confeet.com/#/btc/preview?meetingid=${item.meetingId}_${item.meetingDetailId}` : `http://localhost:4200/#/btc/preview?meetingid=${item.meetingId}_${item.meetingDetailId}`;
    navigator.clipboard.writeText(url).then(() => {
      console.log('Copied to clipboard:');
      tooltip.open();
      setTimeout(() => tooltip.close(), 1500); // Close tooltip after 1.5s
    }).catch(err => {
      console.error('Failed to copy:', err);
    });
  }

  get visibleRecords(): Conversation[] {
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
    this.http.post("validateMeetingIdPassCode", '').then((res: ResponseModel) => {
      if (res.ResponseBody) {
        HideModal("joinMeetingModal");
        let meeting = res.ResponseBody;
        this.joinMeeting(meeting);
        this.isLoading = false;
      }
    }).catch(e => {
      this.isLoading = false;
    })
  }

  shareInviteLink(item: MeetingDetail, tooltip: any) {
    let url = environment.production ? `www.axilcorps.com/#/btc/preview?meetingid=${item.meetingId}_${item.meetingDetailId}` : `http://localhost:4200/#/btc/preview?meetingid=${item.meetingId}_${item.meetingDetailId}`;
    let shareUrl = `${item.organizerName} invited you to a BottomHalf Meeting:

                    ${item.title}
                    ${this.toFullDateString(item.startDate)}
                    ${item.startTime} - ${item.endTime} (IST)
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

  ngOnDestroy() {
    clearInterval(this.timer);
  }
}