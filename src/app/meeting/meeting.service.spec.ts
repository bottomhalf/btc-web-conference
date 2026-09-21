import { TestBed } from '@angular/core/testing';
import { MeetingService } from './meeting.service';
import { CameraService } from '../providers/services/camera.service';
import { RoomService } from '../providers/services/room.service';
import { LocalService } from '../providers/services/local.service';
import { iNavigation } from '../providers/services/iNavigation';
import { DeviceService } from '../layout/device.service';
import { ServerEventService } from '../providers/socket/server-events/server-event.service';
import { InitiateAudioCallService } from '../providers/socket/client-events/call/initiate-audio-call.service';
import { InviteCallEventService } from '../providers/socket/client-events/call/invite-call.service';
import { EndCallService } from '../providers/socket/client-events/call/end-call.service';
import { VideoBackgroundService } from '../providers/services/video-background.service';
import { NotificationService } from '../notifications/services/notification.service';
import { DiagnosticsService } from '../providers/services/diagnostics.service';
import { Router } from '@angular/router';
import { of } from 'rxjs';

describe('MeetingService (Plan 06 Test Suites)', () => {
  let service: MeetingService;
  let mockCameraService: jasmine.SpyObj<CameraService>;
  let mockRoomService: any;
  let mockLocalService: jasmine.SpyObj<LocalService>;
  let mockNav: jasmine.SpyObj<iNavigation>;
  let mockDeviceService: any;
  let mockServerEventService: any;
  let mockInitiateAudioCallService: any;
  let mockInviteCallEventService: any;
  let mockEndCallService: any;
  let mockVideoBackgroundService: any;
  let mockNotificationService: any;
  let mockDiagnosticsService: any;
  let mockRouter: any;

  beforeEach(() => {
    mockCameraService = jasmine.createSpyObj('CameraService', [
      'initPreviewSession',
      'stopMediaPreview',
      'enableCamera',
      'disableCamera',
      'enableMic',
      'disableMic',
      'toggleCamera',
      'toggleMic',
      'startScreenShare',
      'stopScreenShare',
      'toggleScreenShare',
      'releaseAllMedia',
    ], {
      previewStream: jasmine.createSpy('previewStream').and.returnValue(undefined),
      isCameraOn: jasmine.createSpy('isCameraOn').and.returnValue(false),
      isMicOn: jasmine.createSpy('isMicOn').and.returnValue(true),
      isScreenSharing: jasmine.createSpy('isScreenSharing').and.returnValue(false),
      localScreenTrack: jasmine.createSpy('localScreenTrack').and.returnValue(undefined),
    });

    mockRoomService = {
      incomingCommands: of(),
      remoteParticipants: jasmine.createSpy('remoteParticipants').and.returnValue(new Map()),
      activeSpeakers: jasmine.createSpy('activeSpeakers').and.returnValue(new Set()),
      lastActiveSpeaker: jasmine.createSpy('lastActiveSpeaker').and.returnValue(null),
      joinRoom: jasmine.createSpy('joinRoom').and.resolveTo({} as any),
      leaveRoom: jasmine.createSpy('leaveRoom').and.resolveTo(undefined),
    };

    mockLocalService = jasmine.createSpyObj('LocalService', ['getUser', 'isLoggedIn', 'setCameraStatus', 'setMicStatus']);
    mockNav = jasmine.createSpyObj('iNavigation', ['navigate', 'getValue']);
    mockDeviceService = { selectedMic: () => null, selectedCamera: () => null };
    mockServerEventService = { incomingCall: () => null, participantsInRoom: () => [] };
    mockInitiateAudioCallService = {};
    mockInviteCallEventService = { execute: jasmine.createSpy('execute') };
    mockEndCallService = { execute: jasmine.createSpy('execute') };
    mockVideoBackgroundService = { removeBackground: jasmine.createSpy('removeBackground').and.resolveTo(undefined) };
    mockNotificationService = { showNotification: jasmine.createSpy('showNotification') };
    mockDiagnosticsService = { start: jasmine.createSpy('start'), stop: jasmine.createSpy('stop') };
    mockRouter = { navigate: jasmine.createSpy('navigate').and.resolveTo(true) };

    TestBed.configureTestingModule({
      providers: [
        MeetingService,
        { provide: CameraService, useValue: mockCameraService },
        { provide: RoomService, useValue: mockRoomService },
        { provide: LocalService, useValue: mockLocalService },
        { provide: iNavigation, useValue: mockNav },
        { provide: DeviceService, useValue: mockDeviceService },
        { provide: ServerEventService, useValue: mockServerEventService },
        { provide: InitiateAudioCallService, useValue: mockInitiateAudioCallService },
        { provide: InviteCallEventService, useValue: mockInviteCallEventService },
        { provide: EndCallService, useValue: mockEndCallService },
        { provide: VideoBackgroundService, useValue: mockVideoBackgroundService },
        { provide: NotificationService, useValue: mockNotificationService },
        { provide: DiagnosticsService, useValue: mockDiagnosticsService },
        { provide: Router, useValue: mockRouter },
      ],
    });

    service = TestBed.inject(MeetingService);
  });

  describe('Suite 1: Meeting UI Window Modes', () => {
    it('TS1-01: should minimize and maximize meeting window state', () => {
      expect(service.isMinimized()).toBeFalse();

      service.minimize();
      expect(service.isMinimized()).toBeTrue();

      service.maximize();
      expect(service.isMinimized()).toBeFalse();
    });
  });

  describe('Suite 2: Screen Sharing Delegation', () => {
    it('TS2-01: should delegate screen share start, stop, and toggle to CameraService when room is active', async () => {
      service.room.set({} as any);

      await service.startScreenShare();
      expect(mockCameraService.startScreenShare).toHaveBeenCalled();

      await service.stopScreenShare();
      expect(mockCameraService.stopScreenShare).toHaveBeenCalled();

      await service.toggleScreenShare();
      expect(mockCameraService.toggleScreenShare).toHaveBeenCalled();
    });

    it('TS2-02: should gracefully ignore screen share start if no room is active', async () => {
      service.room.set(undefined);
      const res = await service.startScreenShare();
      expect(res).toBeUndefined();
      expect(mockCameraService.startScreenShare).not.toHaveBeenCalled();
    });
  });

  describe('Suite 3: Teardown on Leave Room', () => {
    it('TS3-01: should execute full teardown on leaveRoom()', async () => {
      service.room.set({} as any);
      mockLocalService.isLoggedIn.and.returnValue(true);

      await service.leaveRoom(true);

      expect(mockCameraService.releaseAllMedia).toHaveBeenCalled();
      expect(mockDiagnosticsService.stop).toHaveBeenCalled();
      expect(mockRoomService.leaveRoom).toHaveBeenCalled();
      expect(mockEndCallService.execute).toHaveBeenCalled();
      expect(service.room()).toBeUndefined();
      expect(service.inMeeting()).toBeFalse();
    });
  });
});
