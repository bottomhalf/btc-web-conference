export type UserRole = 'Admin' | 'Moderator' | 'Host' | 'Member' | 'Guest';
export type UserStatus = 'online' | 'active' | 'away' | 'busy' | 'offline' | 'suspended' | 'invited';
export type UserDepartment = 'Engineering' | 'Product' | 'Design' | 'Marketing' | 'Sales' | 'Operations' | 'HR' | 'Executive';

export interface UserPermissions {
  canStartMeeting: boolean;
  canRecordMeeting: boolean;
  canShareScreen: boolean;
  canInviteGuests: boolean;
  canMuteParticipants: boolean;
  canManageUsers: boolean;
  canAccessAdminMonitor: boolean;
  canManageIntegrations: boolean;
}

export interface UserSessionInfo {
  sessionId: string;
  device: string;
  platform: string;
  ipAddress?: string;
  location?: string;
  lastActive: string;
  isCurrent?: boolean;
}

export interface UserActivityLog {
  id: string;
  action: string;
  description: string;
  timestamp: string;
  icon?: string;
  category: 'meeting' | 'security' | 'profile' | 'admin';
}

export interface ManagedUser {
  id: string;
  userId: string;
  username: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  avatar?: string;
  role: UserRole;
  status: UserStatus;
  department: UserDepartment;
  designation: string;
  isEmailVerified: boolean;
  isTwoFactorEnabled: boolean;
  joinedAt: string;
  lastLoginAt: string;
  totalMeetingsHosted: number;
  totalMeetingsAttended: number;
  permissions: UserPermissions;
  sessions?: UserSessionInfo[];
  recentActivities?: UserActivityLog[];
  notes?: string;
}

export interface UserStats {
  totalUsers: number;
  activeOnline: number;
  adminsCount: number;
  moderatorsCount: number;
  invitedCount: number;
  suspendedCount: number;
  growthRatePercent: number;
}

export interface UserFilterOptions {
  searchQuery: string;
  role: string;
  status: string;
  department: string;
  sortBy: 'name' | 'joinedAt' | 'lastLoginAt' | 'role' | 'status';
  sortDirection: 'asc' | 'desc';
  page: number;
  pageSize: number;
}

export interface RegisterUserRequest {
  firstName: string;
  lastName: string;
  mobile: string;
  email: string;
  password?: string;
  username: string;
  avatarUrl?: string;
}

export interface RegisteredUserResponse {
  id?: string;
  avatarUrl?: string;
  createdAt?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  status?: string;
  updatedAt?: string;
  username?: string;
}

export interface PagedResponse<T> {
  data: T[];
  totalRecords: number;
  totalPages: number;
  currentPage: number;
  pageSize: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

export interface UpdateUserRequest {
  id: string;
  userId?: number;
  firstName?: string;
  lastName?: string;
  email?: string;
  mobile?: string;
  username?: string;
  avatarUrl?: string;
  status?: string;
  password?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  pinCode?: number;
  gender?: string;
  isActive?: boolean;
}

