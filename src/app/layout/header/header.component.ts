import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { NgbTypeaheadModule } from '@ng-bootstrap/ng-bootstrap';
import { Observable, of, OperatorFunction } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap, tap, map } from 'rxjs/operators';
import { LocalService } from '../../providers/services/local.service';
import { AjaxService } from '../../providers/services/ajax.service';
import { HttpService } from '../../providers/services/http.service';
import { iNavigation } from '../../providers/services/iNavigation';
import { UserFilter } from '../../models/user.filter';
import { GlobalSearchComponent } from "../../components/global-search/global-search.component";
import { ChatService } from '../../chat/chat.service';
import { User } from '../../models/model';

@Component({
    selector: 'app-header',
    standalone: true,
    imports: [CommonModule, FormsModule, NgbTypeaheadModule, GlobalSearchComponent],
    templateUrl: './header.component.html',
    styleUrl: './header.component.css'
})
export class HeaderComponent {
    searchQuery: string = '';
    searchResults: any[] = [];
    isSearching: boolean = false;
    user: User;

    // Status Popover
    showStatusPopover: boolean = false;
    popoverTop: number = 0;
    popoverLeft: number = 0;
    userStatus: 'available' | 'busy' | 'dnd' | 'away' | 'offline' = 'available';
    statusMessage: string = '';
    editingStatusMessage: boolean = false;
    tempStatusMessage: string = '';

    readonly statusOptions = [
        { value: 'available', label: 'Available', color: '#92c353' },
        { value: 'busy',      label: 'Busy',      color: '#c4314b' },
        { value: 'dnd',       label: 'Do not disturb', color: '#c4314b' },
        { value: 'away',      label: 'Be right back',  color: '#f8d22a' },
        { value: 'offline',   label: 'Appear offline',  color: '#8a8886' },
    ] as const;

    private http = inject(AjaxService);
    private httpService = inject(HttpService);
    private chatService = inject(ChatService);
    private router = inject(Router);
    private localService = inject(LocalService);
    private nav = inject(iNavigation);

    constructor() {
        this.user = this.localService.getUser();
    }

    // ===== Trigger Existing Create Group Chat Modal =====
    openCreateGroupModal(): void {
        if (this.router.url.includes('/btc/chat')) {
            this.chatService.triggerCreateGroup();
        } else {
            this.router.navigate(['/btc/chat'], { state: { openCreateGroup: true } }).then(() => {
                this.chatService.triggerCreateGroup();
            });
        }
    }

    // ===== Status Popover =====
    private popoverCloseHandler = () => {
        this.showStatusPopover = false;
        this.editingStatusMessage = false;
        document.removeEventListener('click', this.popoverCloseHandler);
    };

    toggleStatusPopover(event: Event): void {
        event.stopPropagation();
        this.showStatusPopover = !this.showStatusPopover;
        if (this.showStatusPopover) {
            this.tempStatusMessage = this.statusMessage;
            this.editingStatusMessage = false;
            const trigger = event.currentTarget as HTMLElement;
            const rect = trigger.getBoundingClientRect();
            this.popoverTop  = rect.bottom + 6;
            this.popoverLeft = rect.right - 280;
            setTimeout(() => {
                document.addEventListener('click', this.popoverCloseHandler);
            }, 0);
        } else {
            document.removeEventListener('click', this.popoverCloseHandler);
        }
    }

    stopPopoverPropagation(event: Event): void { event.stopPropagation(); }

    setUserStatus(status: 'available' | 'busy' | 'dnd' | 'away' | 'offline'): void {
        this.userStatus = status;
        alert(`Status set to: ${this.getStatusLabel()}`);
    }

    getStatusColor(): string {
        return this.statusOptions.find(s => s.value === this.userStatus)?.color ?? '#92c353';
    }

    getStatusLabel(): string {
        return this.statusOptions.find(s => s.value === this.userStatus)?.label ?? 'Available';
    }

    startEditingStatusMessage(): void {
        this.editingStatusMessage = true;
        this.tempStatusMessage = this.statusMessage;
    }

    saveStatusMessage(): void {
        this.statusMessage = this.tempStatusMessage;
        this.editingStatusMessage = false;
    }

    cancelStatusMessage(): void {
        this.tempStatusMessage = this.statusMessage;
        this.editingStatusMessage = false;
    }

    search: OperatorFunction<string, readonly any[]> = (text$: Observable<string>) =>
        text$.pipe(
            debounceTime(300),
            distinctUntilChanged(),
            tap(() => this.isSearching = true),
            switchMap(term => {
                if (term.length < 2) {
                    this.isSearching = false;
                    return of([]);
                }
                // Convert Promise to Observable logic
                return new Observable<any[]>(observer => {
                    this.http.get(`user-cache/search?term=${term}&pageNumber=1&pageSize=10`)
                        .then((res: any) => {
                            let results: Array<UserFilter> = [];
                            if (res && res.data) {
                                results = res.data;
                            }
                            observer.next(results);
                            observer.complete();
                        })
                        .catch(err => {
                            console.error(err);
                            observer.next([]);
                            observer.complete();
                        })
                });
            }),
            tap(() => this.isSearching = false)
        );

    formatter = (x: any) => {
        if (!x || typeof x === 'string') return x || '';
        return x.firstName + ' ' + (x.lastName || '');
    };

    onSelect(event: any) {
        event.preventDefault();
        const selectedUser = event.item;
        this.selectUser(selectedUser);
        this.searchQuery = '';
    }

    selectUser(selectedUser: any) {
        console.log("Global search selected:", selectedUser);
        this.searchResults = [];
        this.searchQuery = '';

        // Navigate to chat if not already there
        // this.nav.navigate("/btc/chat", selectedUser)
        this.router.navigate(['/btc/chat']).then(() => {
            // Trigger the chat opening
            this.chatService.openChat$.next(selectedUser);
        });
    }

    // Helper for avatar logic (reused)
    getUserInitiaLetter(fname: string, lname: string): string {
        var name = fname + ' ' + (lname != null && lname != '' ? lname : '');
        if (!name) return '';
        const words = name.split(' ').slice(0, 2);
        return words.map(x => x.length > 0 ? x.charAt(0).toUpperCase() : '').join('');
    }

    getColorFromName(fname: string, lname: string): string {
        var name = fname + ' ' + (lname != null && lname != '' ? lname : '');
        const colors = ['#f28b829f', '#FDD663', '#81C995', '#AECBFA', '#D7AEFB', '#FFB300', '#34A853', '#4285F4', '#FBBC05', '#ff8075ff', '#9AA0A6', '#F6C7B6'];
        let hash = 0;
        for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
        const index = Math.abs(hash) % colors.length;
        return colors[index];
    }
}
