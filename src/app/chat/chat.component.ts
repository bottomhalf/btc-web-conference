import { Component, DestroyRef, effect, inject, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { LocalService } from '../providers/services/local.service';
import { ConfeetSocketService, Message } from '../providers/socket/confeet-socket.service';
import { Subscription } from 'rxjs';
import { Conversation, Participant, SearchResult, UserDetail } from '../components/global-search/search.models';
import { ChatService } from './chat.service';
import { Router } from '@angular/router';
import { ResponseModel, User } from '../models/model';
import { ClientEventService } from '../providers/socket/client-event.service';
import { NotificationService } from '../notifications/services/notification.service';
import { CallType } from '../models/conference_call/call_model';
import { ServerEventService } from '../providers/socket/server-event.service';
import { ChatContainerComponent } from './chat-container/chat-container.component';

@Component({
    selector: 'app-chat',
    standalone: true,
    imports: [CommonModule, FormsModule, ChatContainerComponent],
    templateUrl: './chat.component.html',
    styleUrl: './chat.component.css',
})
export class ChatComponent implements OnInit, OnDestroy {
    // Local state managed by signals in service
    isPageReady: boolean = false;
    today: Date = new Date();
    recieverId?: string = null;
    filterModal: FilterModal = { pageIndex: 1, pageSize: 20, searchString: '1=1' };
    conn: any = null;
    user: User = {
        isMicOn: false,
        isCameraOn: false,
    };

    searchQuery: string = '';
    isSearching: boolean = false;

    // New Chat Popup state
    showNewChatPopup: boolean = false;
    popupMode: 'new-chat' | 'create-group' = 'new-chat';

    // New Group Members for popup creation
    newGroupName: string = '';
    newGroupMembers: SearchResult[] = [];
    memberSearchQuery: string = '';
    memberSearchResults: SearchResult[] = [];
    memberSearchSelectedIndex: number = -1;

    private subscriptions = new Subscription();
    currentUserId: string = "";

    readonly destroyRef = inject(DestroyRef);

    constructor(
        private local: LocalService,
        private ws: ConfeetSocketService,
        public chatService: ChatService,
        private router: Router,
        public notificationService: NotificationService,
        private serverEventService: ServerEventService,
        private clientEventService: ClientEventService
    ) {
        // React to group notifications
        effect(() => {
            const groupNotification = this.serverEventService.groupNotification();
            if (groupNotification) {
                this.chatService.getMeetingRooms();
                return;
            }
        }, { allowSignalWrites: true });
    }

    ngOnInit() {
        this.user = this.local.getUser();
        this.currentUserId = this.user.userId;

        // Listen for global search selections
        this.subscriptions.add(
            this.chatService.openChat$.subscribe((user: any) => {
                this.startConversation(user);
            })
        );

        this.getConversations();

        var navigation = this.router.getCurrentNavigation();
        if (navigation?.extras.state?.['channel']) {
            this.startConversation(navigation?.extras.state['channel']);
        } else if (navigation?.extras.state?.['id']) {
            const conversationId = navigation?.extras.state['id'];
        }

        this.isPageReady = true;
    }

    // Get typingUsers from NotificationService
    get typingUsers(): Map<string, boolean> {
        return this.notificationService.typingUsers();
    }

    getConversations() {
        this.chatService.getMeetingRooms();
        // State handling for navigation is tricker without the direct promise return
        // We can check the signal effect or assume it loads.
        // For the navigation state check, we can check the signal value immediately if loaded, 
        // or effectively we should move this logic to a computed or effect, or just check after a small delay if strict async is needed.
        // However, since getMeetingRooms awaits, we can just await if we make this async, or use .then() on the void promise if we want.
        // But better pattern:
        // Just call it.
    }

    getCurrentInitiaLetter(conversation: Conversation): string {
        return this.chatService.getCurrentInitiaLetter(conversation, this.currentUserId);
    }

    getConversationName(conversation: Conversation): string {
        return this.chatService.getConversationName(conversation, this.currentUserId);
    }

    getUserInitiaLetter(fname: string, lname: string): string {
        return this.chatService.getUserInitiaLetter(fname, lname);
    }

    getColorFromName(fname: string, lname: string): string {
        return this.chatService.getColorFromName(fname, lname);
    }

    onSearch() {
        if (!this.searchQuery || this.searchQuery.length < 2) {
            this.chatService.searchResults.set([]);
            return;
        }

        this.isSearching = true;
        this.isSearching = true;
        this.chatService.searchUsers(this.searchQuery).then(() => {
            this.isSearching = false;
        });
    }

    isConversation(obj: UserDetail | Conversation): obj is Conversation {
        return (obj as Conversation).conversationType !== undefined;
    }

    isGroupConversation(obj: UserDetail | Conversation): obj is Conversation {
        return (obj as Conversation).conversationType === 'group';
    }

    startConversation(selectedConversation: UserDetail | Conversation) {
        if (this.isGroupConversation(selectedConversation)) {
            this.enableConversation(selectedConversation as Conversation);
        } else {
            this.enableNewConversation(selectedConversation as UserDetail);
        }
    }

    enableConversation(conversation: Conversation) {
        // Check if conversation exists
        conversation.conversationType = 'group';
        const existing = this.chatService.meetingRooms().findIndex(x => x.id === conversation.id);
        if (existing > -1) {
            this.selectChannelForConversation(this.chatService.meetingRooms()[existing]);
        } else {
            console.log("Starting new chat with", conversation);
            this.chatService.meetingRooms.update(rooms => [conversation, ...rooms]);
            this.selectChannelForConversation(conversation);
        }

        this.searchQuery = '';
        this.chatService.searchResults.set([]);
    }

    enableNewConversation(selectedUser: UserDetail) {
        // Check if conversation exists
        const existing = this.chatService.meetingRooms().findIndex(x =>
            x.participantIds.findIndex(y => y === selectedUser.userId) > -1 &&
            x.participantIds.findIndex(y => y === this.currentUserId) > -1 &&
            x.participantIds.length == 2
        );

        if (existing > -1) {
            this.selectChannelForConversation(this.chatService.meetingRooms()[existing]);
        } else {
            console.log("Starting new chat with", selectedUser);
            let newConversation: Conversation = {
                id: null,
                conversationId: null,
                conversationType: 'direct',
                conversationName: selectedUser.username,
                conversationAvatar: selectedUser.avatar,
                participantIds: [selectedUser.userId, this.currentUserId],
                participants: [
                    <Participant>{
                        userId: selectedUser.userId,
                        username: selectedUser.username,
                        firstName: selectedUser.firstName,
                        lastName: selectedUser.lastName,
                        email: selectedUser.email,
                        avatar: selectedUser.avatar,
                        joinedAt: new Date(),
                        role: 'user'
                    },
                    <Participant>{
                        userId: this.user.userId,
                        username: "",
                        firstName: this.user.firstName,
                        lastName: this.user.lastName,
                        email: this.user.email,
                        avatar: "",
                        joinedAt: new Date(),
                        role: 'user'
                    }
                ],
                createdBy: this.currentUserId,
                createdAt: new Date(),
                updatedAt: null,
                lastMessageAt: null,
                lastMessage: null,
                settings: null,
                isActive: true
            }

            this.chatService.meetingRooms.update(rooms => [newConversation, ...rooms]);
            this.selectChannelForConversation(newConversation);
        }

        this.searchQuery = '';
        this.chatService.searchResults.set([]);
    }

    selectChannelForConversation(conversation: Conversation) {
        this.ws.currentConversation.set(conversation);
        this.ws.currentConversationId.set(conversation.id);

        this.chatService.messages.set([]); // Clear existing messages

        // Notify the NotificationService which conversation is now active
        this.notificationService.setActiveConversation(conversation.id);
    }

    // New Chat Popup Methods
    toggleNewChatPopup(): void {
        this.showNewChatPopup = !this.showNewChatPopup;
    }

    closeNewChatPopup(): void {
        this.showNewChatPopup = false;
        this.popupMode = 'new-chat';
        this.searchQuery = '';
        this.memberSearchQuery = '';
        this.newGroupMembers = [];
        this.newGroupName = '';
    }

    ngOnDestroy(): void {
        this.subscriptions.unsubscribe();
        // Clear active conversation when leaving chat page
        this.notificationService.setActiveConversation(null);
    }
}

export interface FilterModal {
    searchString: string;
    sortBy?: string;
    pageIndex: number;
    pageSize: number;
}
