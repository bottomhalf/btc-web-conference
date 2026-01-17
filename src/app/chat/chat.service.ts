import { Injectable, signal } from '@angular/core';
import { Subject } from 'rxjs';
import { Conversation, Participant, SearchResult, UserDetail } from '../components/global-search/search.models';
import { HttpService } from '../providers/services/http.service';
import { Message } from '../providers/socket/confeet-socket.service';
import { ResponseModel } from '../models/model';

@Injectable({
    providedIn: 'root'
})
export class ChatService {
    public openChat$ = new Subject<any>();

    // Signals for State Management
    public meetingRooms = signal<Conversation[]>([]);
    public messages = signal<Message[]>([]);
    public searchResults = signal<SearchResult[]>([]);
    public userSearchResults = signal<UserDetail[]>([]);
    public isLoading = signal<boolean>(false);

    constructor(private http: HttpService) { }

    // HTTP Methods
    async getMeetingRooms(): Promise<void> {
        this.isLoading.set(true);
        const res = await this.http.get(`conversations/rooms?pageNumber=1&pageSize=20`);
        if (res.IsSuccess && res.ResponseBody) {
            this.meetingRooms.set(res.ResponseBody.data || []);
        }
        this.isLoading.set(false);
    }

    async searchUsers(term: string): Promise<void> {
        if (!term) {
            this.searchResults.set([]);
            return;
        }
        this.isLoading.set(true);
        const res = await this.http.get(`search/typeahead?q=${term}&fs=y`);
        if (res.IsSuccess) {
            this.filterSearchResults(res.ResponseBody['results']);
        }
        this.isLoading.set(false);
    }

    filterSearchResults(results: any): SearchResult[] {
        this.searchResults.set([]);
        if (!results || (!results['users'] && !results['conversations'])) return this.searchResults();

        if (results['users']) {
            this.searchResults.set((results['users'] as UserDetail[]).map(user => ({
                avatar: user.avatar,
                conversationId: user.id,
                email: user.email,
                participants: [{
                    userId: user.userId,
                    username: user.username,
                    firstName: user.firstName,
                    lastName: user.lastName,
                    email: user.email,
                    avatar: user.avatar,
                    joinedAt: null,
                    role: 'member'
                }],
                name: user.firstName + ' ' + user.lastName,
                type: 'user',
                userId: user.userId,
                designation: user.designation
            })));
        }

        if (results['conversations']) {
            let conversations = (results['conversations'] as Conversation[]).map(conversation => (<SearchResult>{
                avatar: conversation.conversationAvatar,
                conversationId: conversation.conversationId,
                participants: conversation.participants,
                name: conversation.conversationName,
                type: 'group',
                userId: null,
                designation: null
            }));

            this.searchResults.update((current) => [...current, ...conversations]);
        }

        return this.searchResults();
    }

    async getMessages(conversationId: string, page: number, limit: number, append: boolean = false): Promise<void> {
        // isLoading not set here to avoid flickering entire chat on pagination
        const res = await this.http.get(`messages/get?id=${conversationId ?? ''}&page=${page}&limit=${limit}`);
        if (res.IsSuccess && res.ResponseBody && res.ResponseBody.messages) {
            if (append) {
                // If appending (e.g. infinite scroll), combine with existing
                // Note: Logic depends on scroll direction. Typically infinite scroll loads OLDER messages (prepend)
                // or newer (append). Assuming standard "load more" appends for now or component handles logic.
                // Actually, for "load older" we usually prepend. 
                // Let's simplified: Service just holds "current view's messages". 
                // COMPLEXITY: State in Service for pagination is tricky. 
                // Let's append if page > 1, else set.
                if (page > 1) {
                    this.messages.update(current => [...res.ResponseBody.messages.reverse(), ...current]);
                } else {
                    this.messages.set(res.ResponseBody.messages.reverse());
                }
            } else {
                this.messages.set(res.ResponseBody.messages.reverse());
            }
        }
    }

    async createConversation(userId: string, conversation: Conversation): Promise<ResponseModel> {
        const res = await this.http.post(`conversations/create/${userId}`, conversation);
        // If successful, we might want to refresh meeting rooms or add this one
        if (res.IsSuccess) {
            // Optionally refresh list
            // this.getMeetingRooms(); 
        }
        return res; // Keep return for Component to know ID of new chat
    }

    async createGroupConversation(userId: string, groupName: string, conversationId: string, participants: Participant[]): Promise<ResponseModel> {
        const res = await this.http.post(`conversations/create-group/${userId}/${groupName}/${conversationId}`, participants);
        // If successful, we might want to refresh meeting rooms or add this one
        if (res.IsSuccess) {
            // Optionally refresh list
            // this.getMeetingRooms(); 
        }
        return res; // Keep return for Component to know ID of new chat
    }

    // Helper Methods
    getConversationName(conversation: Conversation, currentUserId: string): string {
        if (conversation.conversationType == 'group') {
            return conversation.conversationName || 'Group';
        } else {
            let participants = conversation.participants.filter((x) => x.userId != currentUserId);
            if (participants.length == 0) return 'Unknown';

            if (participants.length == 1) {
                return participants[0].firstName + ' ' + participants[0].lastName;
            } else if (participants.length > 2) {
                return participants[0].firstName + ' and ' + participants[1].firstName;
            } else {
                return participants[0].firstName + ', ' + participants[1].firstName + ' +' + `${participants.length - 2}`;
            }
        }
    }

    getCurrentInitiaLetter(conversation: Conversation, currentUserId: string): string {
        let participants = conversation.participants.filter((x) => x.userId != currentUserId);
        if (participants.length == 0) return '';

        if (participants.length == 1) {
            return this.getUserInitiaLetter(participants[0].firstName, participants[0].lastName);
        } else
            return this.getUserInitiaLetter("GRP", '');
    }

    getUserInitiaLetter(fname: string, lname: string): string {
        var name = fname + ' ' + (lname != null && lname != '' ? lname : '');
        if (!name) return '';

        const words = name.split(' ').slice(0, 2);
        const initials = words
            .map((x) => {
                if (x.length > 0) {
                    return x.charAt(0).toUpperCase();
                }
                return '';
            })
            .join('');

        return initials;
    }

    getColorFromName(fname: string, lname: string): string {
        var name = fname + ' ' + (lname != null && lname != '' ? lname : '');
        // Predefined color palette (Google Meet style soft colors)
        const colors = [
            '#f28b829f',
            '#FDD663',
            '#81C995',
            '#AECBFA',
            '#D7AEFB',
            '#FFB300',
            '#34A853',
            '#4285F4',
            '#FBBC05',
            '#ff8075ff',
            '#9AA0A6',
            '#F6C7B6',
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
}
