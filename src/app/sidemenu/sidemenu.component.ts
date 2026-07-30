import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { iNavigation } from '../providers/services/iNavigation';
import { LocalService } from '../providers/services/local.service';
import { NgbDropdownConfig, NgbDropdownModule } from '@ng-bootstrap/ng-bootstrap';
import { CalendarPage, ChatPage, Dashboard, MonitorDashboard } from '../models/constant';
import { User } from '../models/model';
import { ThemeService } from '../providers/services/theme.service';
import { SessionManagerService } from '../providers/session-manager.service';

@Component({
  selector: 'app-sidemenu',
  standalone: true,
  imports: [CommonModule, NgbDropdownModule],
  providers: [NgbDropdownConfig],
  templateUrl: './sidemenu.component.html',
  styleUrl: './sidemenu.component.css'
})
export class SidemenuComponent {
  sideMenu: Array<{ Id: number, Title: string, Link: string, Icon: string, IsActive: boolean }> = [
    {
      Id: 1,
      IsActive: false,
      Title: "Chat",
      Link: ChatPage,
      Icon: "M240-400h320v-80H240v80Zm0-120h480v-80H240v80Zm0-120h480v-80H240v80ZM80-80v-720q0-33 23.5-56.5T160-880h640q33 0 56.5 23.5T880-800v480q0 33-23.5 56.5T800-240H240L80-80Zm126-240h594v-480H160v525l46-45Zm-46 0v-480 480Z"
    }, {
      Id: 2,
      IsActive: true,
      Link: Dashboard,
      Title: "Meet",
      Icon: "M160-160q-33 0-56.5-23.5T80-240v-480q0-33 23.5-56.5T160-800h480q33 0 56.5 23.5T720-720v180l160-160v440L720-420v180q0 33-23.5 56.5T640-160H160Zm0-80h480v-480H160v480Zm0 0v-480 480Z"
    }, {
      Id: 3,
      IsActive: false,
      Link: CalendarPage,
      Title: "Calendar",
      Icon: "M200-80q-33 0-56.5-23.5T120-160v-560q0-33 23.5-56.5T200-800h40v-80h80v80h320v-80h80v80h40q33 0 56.5 23.5T840-720v560q0 33-23.5 56.5T760-80H200Zm0-80h560v-400H200v400Zm0-480h560v-80H200v80Zm0 0v-80 80Zm280 240q-17 0-28.5-11.5T440-440q0-17 11.5-28.5T480-480q17 0 28.5 11.5T520-440q0 17-11.5 28.5T480-400Zm-160 0q-17 0-28.5-11.5T280-440q0-17 11.5-28.5T320-480q17 0 28.5 11.5T360-440q0 17-11.5 28.5T320-400Zm320 0q-17 0-28.5-11.5T600-440q0-17 11.5-28.5T640-480q17 0 28.5 11.5T680-440q0 17-11.5 28.5T640-400ZM480-240q-17 0-28.5-11.5T440-280q0-17 11.5-28.5T480-320q17 0 28.5 11.5T520-280q0 17-11.5 28.5T480-240Zm-160 0q-17 0-28.5-11.5T280-280q0-17 11.5-28.5T320-320q17 0 28.5 11.5T360-280q0 17-11.5 28.5T320-240Zm320 0q-17 0-28.5-11.5T600-280q0-17 11.5-28.5T640-320q17 0 28.5 11.5T680-280q0 17-11.5 28.5T640-240Z"
    }, {
      Id: 4,
      IsActive: false,
      Link: MonitorDashboard,
      Title: "Monitor",
      Icon: "M480-80q-82 0-155-31.5t-127.5-86Q143-252 111.5-325T80-480q0-83 31.5-155.5t86-127Q252-817 325-848.5T480-880q83 0 155.5 31.5t127 86q54.5 54.5 86 127T880-480q0 10-.5 20t-1.5 20h-81q2-10 2.5-20t.5-20q0-141-99.5-240.5T480-800q-141 0-240.5 99.5T140-460h220l-80 80h-80q16 63 57.5 113t102.5 74v-167h80v200q20 0 40-3t40-9v-108l80-80v227q10-6 19.5-12t18.5-14l57 57q-47 38-103.5 60T480-80Zm320-160v-160H640v-80h160v-160h80v160h160v80H880v160h-80Zm-320-80q-33 0-56.5-23.5T400-400q0-33 23.5-56.5T480-480q33 0 56.5 23.5T560-400q0 33-23.5 56.5T480-320Z"
    }
  ];
  currentUser: User = null;
  unreadCount: number = 0; // For notification badge

  constructor(private router: Router,
    private nav: iNavigation,
    private local: LocalService,
    private config: NgbDropdownConfig,
    private sessionManager: SessionManagerService,
    public themeService: ThemeService
  ) {
    config.placement = 'top-end';
    config.autoClose = true;
    this.currentUser = this.local.getUser();

    let currentPage = this.router.url;
    this.sideMenu.forEach(x => {
      x.IsActive = false;
    });
    if (currentPage.includes(ChatPage))
      this.sideMenu[0].IsActive = true;
    else if (currentPage.includes(MonitorDashboard))
      this.sideMenu[3].IsActive = true;
    else if (currentPage.includes(Dashboard))
      this.sideMenu[1].IsActive = true;
    else if (currentPage.includes(CalendarPage))
      this.sideMenu[2].IsActive = true;
  }

  navigatePage(link: string) {
    this.sideMenu.forEach(x => {
      x.IsActive = false;
    });
    if (link.includes(ChatPage))
      this.sideMenu[0].IsActive = true;
    else if (link.includes(MonitorDashboard))
      this.sideMenu[3].IsActive = true;
    else if (link.includes(Dashboard))
      this.sideMenu[1].IsActive = true;
    else if (link.includes(CalendarPage))
      this.sideMenu[2].IsActive = true;

    this.nav.navigate(link, null);
  }

  getUserInitiaLetter(): string {
    let fullName = this.getFullName();

    const words = fullName.split(' ').slice(0, 2);
    const initials = words.map(x => {
      if (x.length > 0) {
        return x.charAt(0).toUpperCase();
      }
      return '';
    }).join('');

    return initials;
  }

  getFullName(): string {
    let fullName = this.currentUser?.firstName;
    if (this.currentUser?.lastName)
      fullName = fullName + " " + this.currentUser.lastName;

    return fullName
  }

  async logout() {
    await this.sessionManager.logout();
  }

  toggleTheme() {
    this.themeService.toggleTheme();
  }
}
