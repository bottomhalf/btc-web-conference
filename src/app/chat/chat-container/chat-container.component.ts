import { Component, inject, Input, signal, ViewChild, ElementRef, AfterViewChecked, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ConfeetSocketService } from '../../providers/socket/confeet-socket.service';
import { ChatService } from '../chat.service';
import { LocalService } from '../../providers/services/local.service';
import { ClientEventService } from '../../providers/socket/client-event.service';
import { Conversation, Participant, SearchResult } from '../../components/global-search/search.models';
import { ResponseModel, User } from '../../models/model';
import { CallType } from '../../models/conference_call/call_model';

@Component({
  selector: 'app-chat-container',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './chat-container.component.html',
  styleUrl: './chat-container.component.css'
})
export class ChatContainerComponent implements AfterViewChecked {
  @ViewChild('messagesContainer') private messagesContainer!: ElementRef;
  @Input() header: boolean = false;
  @Input() classes: string = '';

  ws = inject(ConfeetSocketService);
  chatService = inject(ChatService);
  private local = inject(LocalService);
  private router = inject(Router);
  private clientEventService = inject(ClientEventService);

  // User data
  user: User = {
    isMicOn: false,
    isCameraOn: false,
  };
  currentUserId: string = "";

  // Message state
  message = signal<string | null>('');
  pageIndex: number = 1;
  private shouldScrollToBottom = false;
  private shouldPreserveScrollPosition = false;
  private previousScrollHeight = 0;

  // Members dropdown state
  showMembersDropdown: boolean = false;
  showCreateGroupInput: boolean = false;
  newGroupName: string = '';
  newGroupMembers: SearchResult[] = [];
  memberSearchQuery: string = '';
  memberSearchResults: SearchResult[] = [];
  memberSearchSelectedIndex: number = -1;

  constructor() {
    this.user = this.local.getUser();
    this.currentUserId = this.user.userId;

    // React to conversation changes and load messages
    effect(() => {
      const conversation = this.ws.currentConversation();
      if (conversation && conversation.id) {
        // Reset page index and load first page of messages
        this.pageIndex = 1;
        this.loadMoreMessages(true); // true = scroll to bottom
        this.chatService.setIsChatStatus(true, 'Chat container');
      }
    }, { allowSignalWrites: true });
  }

  ngAfterViewChecked() {
    if (this.shouldScrollToBottom) {
      this.scrollToBottom();
      this.shouldScrollToBottom = false;
    }

    // Preserve scroll position when older messages are prepended
    if (this.shouldPreserveScrollPosition && this.messagesContainer) {
      const container = this.messagesContainer.nativeElement;
      const newScrollHeight = container.scrollHeight;
      const scrollDiff = newScrollHeight - this.previousScrollHeight;
      container.scrollTop = scrollDiff;
      this.shouldPreserveScrollPosition = false;
    }
  }

  // Helper methods
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

  // Audio call
  startAudioCall() {
    this.clientEventService.initiateAudioCall(this.currentUserId, this.ws.currentConversation().id);
    this.router.navigate(['/btc/preview'], {
      state: {
        id: this.ws.currentConversation().id,
        type: CallType.AUDIO,
        title: this.ws.currentConversation().conversationName ? this.ws.currentConversation().conversationName : 'NEW'
      }
    });
  }

  // Members Dropdown Methods
  toggleMembersDropdown(): void {
    this.showMembersDropdown = !this.showMembersDropdown;
    if (!this.showMembersDropdown) {
      this.cancelCreateGroup();
    }
  }

  cancelCreateGroup(): void {
    this.showCreateGroupInput = false;
    this.newGroupName = '';
    this.newGroupMembers = [];
    this.memberSearchQuery = '';
    this.memberSearchResults = [];
  }

  getDefaultGroupName(): string {
    const participants = this.ws.currentConversation()?.participants || [];
    if (participants.length === 0) return 'New Group';

    // Get first two names
    const names = participants.slice(0, 2).map(p => p.firstName);
    const othersCount = participants.length + this.newGroupMembers.length - 2;

    if (othersCount > 0) {
      return `${names.join(', ')} +${othersCount} others`;
    }
    return names.join(', ');
  }

  onMemberSearch(): void {
    this.memberSearchSelectedIndex = -1; // Reset selection on new search
    if (!this.memberSearchQuery || this.memberSearchQuery.length < 2) {
      this.memberSearchResults = [];
      return;
    }

    // Use the existing search functionality
    this.chatService.searchUsers(this.memberSearchQuery).then(() => {
      let participants: Participant[] = [];
      if (this.ws.currentConversation() && this.ws.currentConversation().participants.length > 0) {
        participants = this.ws.currentConversation().participants;
      }

      // Filter out members who are already in the group
      const existingIds = [
        ...participants.map(p => p.userId),
        ...this.newGroupMembers.map(m => m.userId)
      ];
      this.memberSearchResults = this.chatService.searchResults()
        .filter(user => !existingIds.includes(user.userId));
    });
  }

  onMemberSearchKeydown(event: KeyboardEvent): void {
    const total = this.memberSearchResults.length;
    if (total === 0) return;

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.memberSearchSelectedIndex = Math.min(this.memberSearchSelectedIndex + 1, total - 1);
        break;

      case 'ArrowUp':
        event.preventDefault();
        this.memberSearchSelectedIndex = Math.max(this.memberSearchSelectedIndex - 1, -1);
        break;

      case 'Enter':
        event.preventDefault();
        if (this.memberSearchSelectedIndex >= 0 && this.memberSearchSelectedIndex < total) {
          this.addMemberToGroup(this.memberSearchResults[this.memberSearchSelectedIndex]);
        }
        break;

      case 'Escape':
        event.preventDefault();
        this.memberSearchQuery = '';
        this.memberSearchResults = [];
        this.memberSearchSelectedIndex = -1;
        break;
    }
  }

  addMemberToGroup(member: SearchResult): void {
    // Check if already added
    if (!this.newGroupMembers.find(m => m.conversationId === member.conversationId)) {
      this.newGroupMembers.push(member);
    }
    this.memberSearchQuery = '';
    this.memberSearchResults = [];
    this.memberSearchSelectedIndex = -1;
  }

  removeNewGroupMember(member: SearchResult): void {
    this.newGroupMembers = this.newGroupMembers.filter(m => m.conversationId !== member.conversationId);
  }

  createGroup(): void {
    const groupName = this.newGroupName.trim() || this.getDefaultGroupName();
    const newGroupMembers = this.newGroupMembers.reduce((acc, m) => [...acc, ...m.participants], []);

    let participants: Participant[] = [];
    if (this.ws.currentConversation() && this.ws.currentConversation().participants.length > 0) {
      participants = this.ws.currentConversation().participants;
    }

    const allMembers: Participant[] = [
      ...participants,
      ...newGroupMembers
    ];

    // Call API to create group
    this.chatService.createGroupConversation(this.currentUserId, groupName, this.ws.currentConversationId(), allMembers).then((res: ResponseModel) => {
      // Reset state
      if (res.IsSuccess && res.ResponseBody) {
        this.clientEventService.notifyGroupCreated(res.ResponseBody.id, this.currentUserId);
        this.cancelCreateGroup();
        this.showMembersDropdown = false;
      } else {
        alert("Failed to create group error: " + res.ResponseBody.ResponseBody);
      }
    });
  }

  // Message methods
  onScroll(event: any) {
    const element = event.target;
    // Load more when scrolled to top (for loading older messages)
    if (element.scrollTop === 0) {
      this.loadMoreMessages(false);
    }
  }

  loadMoreMessages(scrollToBottom: boolean = false) {
    if (!this.ws.currentConversation()) return;

    // Save current scroll height before loading older messages
    if (!scrollToBottom && this.messagesContainer) {
      this.previousScrollHeight = this.messagesContainer.nativeElement.scrollHeight;
    }

    this.chatService.getMessages(this.ws.currentConversation().id ?? '', this.pageIndex, 20, this.pageIndex > 1).then(() => {
      this.pageIndex = this.pageIndex + 1;
      if (scrollToBottom) {
        this.shouldScrollToBottom = true;
      } else {
        // Flag to preserve scroll position for older messages
        this.shouldPreserveScrollPosition = true;
      }
    });
  }

  sendMessage() {
    if (this.ws.currentConversation().id == null) {
      // call java to insert or create conversation channel
      this.chatService.createConversation(this.currentUserId, this.ws.currentConversation()).then((res: any) => {
        console.log("channel created", res);
        this.send(res);
      });
    } else {
      this.send(this.ws.currentConversation());
    }
  }

  private send(response: any) {
    if (this.message() != null && this.message() != '' && response.id != null) {
      var event: any = {
        conversationId: response.id,
        messageId: crypto.randomUUID(),
        senderId: this.currentUserId,
        recievedId: null,
        type: "text",
        body: this.message(),
        fileUrl: null,
        replyTo: null,
        mentions: [],
        reactions: [],
        clientType: "web",
        createdAt: new Date(),
        editedAt: null,
        status: 1
      }

      this.chatService.messages.update(msgs => [...msgs, event]);
      this.ws.sendMessage(event);
      this.message.set('');
      this.shouldScrollToBottom = true; // Scroll to bottom after sending
    }
  }

  scrollToBottom(): void {
    try {
      if (this.messagesContainer) {
        this.messagesContainer.nativeElement.scrollTop = this.messagesContainer.nativeElement.scrollHeight;
      }
    } catch (err) {
      console.error('Error scrolling to bottom:', err);
    }
  }
}
