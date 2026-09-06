export interface ResponseModel {
  accessToken: string;
  httpStatusCode: number;
  httpStatusMessage: string;
  responseBody: any;
  errorCode: string;
  errorMessage: string;
  isSuccess: boolean;
  message: string;
}

export interface ParticipantDetail {
  userId?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  avatar?: string;
  joinedAt?: any;
  role?: string;
  status?: string;
  user_id?: string;
  first_name?: string;
  last_name?: string;
  name?: string;
  participantsId?: Array<string>;
}

export interface MeetingDetail {
  meetingDetailId?: number;
  meetingId: string;
  meetingPassword: string;
  organizedBy?: number;
  agenda?: string;
  title?: string;
  startDate?: Date | string;
  durationInSecond?: number;
  endDate?: Date | string;
  startTime?: Date | string;
  endTime?: Date | string;
  organizerName?: string;
  hasQuickMeeting?: boolean;
  conversationId?: string;
  isAllDay?: boolean;
  repeatType?: number;
  participants?: string; // Stored as string for the backend, can contain JSON or CSV
  participantsId?: Array<string>;
  participantCount?: number;
  participantsDetail?: Array<ParticipantDetail>;
}


export interface User {
  isMicOn: boolean;
  isCameraOn: boolean;
  firstName?: string;
  lastName?: string;
  email?: string;
  userId?: string;
  token?: string;
  isLogin?: boolean;
  status?: 'online' | 'away' | 'busy' | 'offline';
}

export enum PresenceStatus {
  PRESENCE_STATUS_UNSPECIFIED = 0,
  ONLINE = 1,
  OFFLINE = 2,
  AWAY = 3,
  BUSY = 4,
  DO_NOT_DISTURB = 5,
  INVISIBLE = 6,
}

export function GetStatusName(status: PresenceStatus): string {
  switch (status) {
    case PresenceStatus.ONLINE:
      return "Online";
    case PresenceStatus.OFFLINE:
      return "Offline";
    case PresenceStatus.AWAY:
      return "Away";
    case PresenceStatus.BUSY:
      return "Busy";
    case PresenceStatus.DO_NOT_DISTURB:
      return "DND";
    case PresenceStatus.INVISIBLE:
      return "Invisible";
    default:
      return "Unknown";
  }
}