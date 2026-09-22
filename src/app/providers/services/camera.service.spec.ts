import { TestBed } from '@angular/core/testing';
import { CameraService } from './camera.service';
import { Room, Track, LocalVideoTrack, LocalAudioTrack } from 'livekit-client';

describe('CameraService (Plan 06 Test Suites)', () => {
  let service: CameraService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [CameraService],
    });
    service = TestBed.inject(CameraService);
  });

  afterEach(async () => {
    await service.releaseAllMedia();
  });

  describe('Suite 1: Initialization & Device Enumeration', () => {
    it('TS1-01: should initialize with default idle state and reactive signals', () => {
      expect(service.mediaMode()).toBe('idle');
      expect(service.isCameraOn()).toBeFalse();
      expect(service.isMicOn()).toBeFalse();
      expect(service.isScreenSharing()).toBeFalse();
      expect(service.previewStream()).toBeUndefined();
      expect(service.localCameraTrack()).toBeUndefined();
      expect(service.localScreenTrack()).toBeUndefined();
    });

    it('TS1-02: should enumerate media devices through listDevices()', async () => {
      const mockDevices: MediaDeviceInfo[] = [
        { deviceId: 'cam1', kind: 'videoinput', label: 'FaceTime HD Camera', groupId: '1', toJSON: () => ({}) },
        { deviceId: 'mic1', kind: 'audioinput', label: 'Internal Microphone', groupId: '1', toJSON: () => ({}) },
        { deviceId: 'spk1', kind: 'audiooutput', label: 'Internal Speakers', groupId: '1', toJSON: () => ({}) },
      ];

      spyOn(navigator.mediaDevices, 'enumerateDevices').and.resolveTo(mockDevices);

      const result = await service.listDevices();
      expect(result.cams.length).toBe(1);
      expect(result.mics.length).toBe(1);
      expect(result.speakers.length).toBe(1);
      expect(result.cams[0].label).toBe('FaceTime HD Camera');
    });
  });

  describe('Suite 2: Preview Mode Functionality', () => {
    it('TS2-01: should initialize preview session with video and audio', async () => {
      const mockVideoTrack = {
        kind: 'video',
        stop: jasmine.createSpy('stop'),
        enabled: true,
        readyState: 'live',
      } as unknown as MediaStreamTrack;

      const mockAudioTrack = {
        kind: 'audio',
        stop: jasmine.createSpy('stop'),
        enabled: true,
        readyState: 'live',
      } as unknown as MediaStreamTrack;

      const mockStream = {
        getVideoTracks: () => [mockVideoTrack],
        getAudioTracks: () => [mockAudioTrack],
        getTracks: () => [mockVideoTrack, mockAudioTrack],
        removeTrack: jasmine.createSpy('removeTrack'),
        addTrack: jasmine.createSpy('addTrack'),
      } as unknown as MediaStream;

      spyOn(navigator.mediaDevices, 'getUserMedia').and.resolveTo(mockStream);

      const stream = await service.initPreviewSession(true, 'cam1', 'mic1');
      expect(stream).toBeDefined();
      expect(service.mediaMode()).toBe('preview');
      expect(service.isCameraOn()).toBeTrue();
      expect(service.isMicOn()).toBeTrue();
      expect(service.selectedCameraId()).toBe('cam1');
      expect(service.selectedMicId()).toBe('mic1');
    });

    it('TS2-02: should initialize audio-only preview without camera', async () => {
      const mockAudioTrack = {
        kind: 'audio',
        stop: jasmine.createSpy('stop'),
        enabled: true,
        readyState: 'live',
      } as unknown as MediaStreamTrack;

      const mockStream = {
        getVideoTracks: () => [],
        getAudioTracks: () => [mockAudioTrack],
        getTracks: () => [mockAudioTrack],
        removeTrack: jasmine.createSpy('removeTrack'),
        addTrack: jasmine.createSpy('addTrack'),
      } as unknown as MediaStream;

      spyOn(navigator.mediaDevices, 'getUserMedia').and.resolveTo(mockStream);

      const stream = await service.initPreviewSession(false, undefined, 'mic1');
      expect(stream).toBeDefined();
      expect(service.mediaMode()).toBe('preview');
      expect(service.isCameraOn()).toBeFalse();
      expect(service.isMicOn()).toBeTrue();
    });

    it('TS2-03: should toggle camera in preview mode', async () => {
      const mockVideoTrack = {
        kind: 'video',
        stop: jasmine.createSpy('stop'),
        enabled: true,
        readyState: 'live',
      } as unknown as MediaStreamTrack;

      const mockStream = {
        getVideoTracks: () => [mockVideoTrack],
        getAudioTracks: () => [],
        getTracks: () => [mockVideoTrack],
        removeTrack: jasmine.createSpy('removeTrack'),
        addTrack: jasmine.createSpy('addTrack'),
      } as unknown as MediaStream;

      spyOn(navigator.mediaDevices, 'getUserMedia').and.resolveTo(mockStream);

      await service.initPreviewSession(true);
      expect(service.isCameraOn()).toBeTrue();

      // Toggle OFF
      const stateOff = await service.toggleCamera();
      expect(stateOff).toBeFalse();
      expect(service.isCameraOn()).toBeFalse();

      // Toggle ON
      const stateOn = await service.toggleCamera();
      expect(stateOn).toBeTrue();
      expect(service.isCameraOn()).toBeTrue();
    });

    it('TS2-04: should toggle mic in preview mode', async () => {
      const mockAudioTrack = {
        kind: 'audio',
        stop: jasmine.createSpy('stop'),
        enabled: true,
        readyState: 'live',
      } as unknown as MediaStreamTrack;

      const mockStream = {
        getVideoTracks: () => [],
        getAudioTracks: () => [mockAudioTrack],
        getTracks: () => [mockAudioTrack],
        removeTrack: jasmine.createSpy('removeTrack'),
        addTrack: jasmine.createSpy('addTrack'),
      } as unknown as MediaStream;

      spyOn(navigator.mediaDevices, 'getUserMedia').and.resolveTo(mockStream);

      await service.initPreviewSession(false);
      expect(service.isMicOn()).toBeTrue();

      // Toggle OFF
      const micOff = await service.toggleMic();
      expect(micOff).toBeFalse();
      expect(service.isMicOn()).toBeFalse();
      expect(mockAudioTrack.enabled).toBeFalse();

      // Toggle ON
      const micOn = await service.toggleMic();
      expect(micOn).toBeTrue();
      expect(service.isMicOn()).toBeTrue();
      expect(mockAudioTrack.enabled).toBeTrue();
    });

    it('TS2-05: should stop preview and reset mode to idle', async () => {
      const mockTrack = {
        kind: 'video',
        stop: jasmine.createSpy('stop'),
      } as unknown as MediaStreamTrack;

      const mockStream = {
        getVideoTracks: () => [mockTrack],
        getAudioTracks: () => [],
        getTracks: () => [mockTrack],
        removeTrack: jasmine.createSpy('removeTrack'),
      } as unknown as MediaStream;

      spyOn(navigator.mediaDevices, 'getUserMedia').and.resolveTo(mockStream);

      await service.initPreviewSession(true);
      service.stopMediaPreview();

      expect(mockTrack.stop).toHaveBeenCalled();
      expect(service.previewStream()).toBeUndefined();
      expect(service.mediaMode()).toBe('idle');
    });
  });

  describe('Suite 3: In-Meeting LiveKit Media Controls', () => {
    let mockRoom: any;

    beforeEach(() => {
      mockRoom = {
        localParticipant: {
          videoTrackPublications: new Map(),
          audioTrackPublications: new Map(),
          setCameraEnabled: jasmine.createSpy('setCameraEnabled').and.resolveTo(undefined),
          setMicrophoneEnabled: jasmine.createSpy('setMicrophoneEnabled').and.resolveTo(undefined),
          publishTrack: jasmine.createSpy('publishTrack').and.resolveTo(undefined),
          unpublishTrack: jasmine.createSpy('unpublishTrack').and.resolveTo(undefined),
        },
      };
    });

    it('TS3-01: should bind room and enter in-meeting mode', () => {
      service.bindLiveKitRoom(mockRoom as unknown as Room);
      expect(service.room()).toBe(mockRoom as unknown as Room);
      expect(service.mediaMode()).toBe('in-meeting');
    });

    it('TS3-02: should disable and enable camera in room', async () => {
      service.bindLiveKitRoom(mockRoom as unknown as Room);
      service.isCameraOn.set(true);

      await service.disableCamera(mockRoom);
      expect(mockRoom.localParticipant.setCameraEnabled).toHaveBeenCalledWith(false);
      expect(service.isCameraOn()).toBeFalse();
    });

    it('TS3-03: should mute and unmute microphone in room', async () => {
      const mockAudioTrack = {
        mute: jasmine.createSpy('mute').and.resolveTo(undefined),
        unmute: jasmine.createSpy('unmute').and.resolveTo(undefined),
      };
      mockRoom.localParticipant.audioTrackPublications.set('pub1', {
        track: mockAudioTrack,
        isMuted: false,
      });

      service.bindLiveKitRoom(mockRoom as unknown as Room);

      await service.disableMic(mockRoom);
      expect(mockAudioTrack.mute).toHaveBeenCalled();
      expect(service.isMicOn()).toBeFalse();

      await service.enableMic(mockRoom);
      expect(mockAudioTrack.unmute).toHaveBeenCalled();
      expect(service.isMicOn()).toBeTrue();
    });
  });

  describe('Suite 4: Screen Share Controls', () => {
    it('TS4-01: should stop screen share and clean track references', async () => {
      const mockScreenTrack = {
        stop: jasmine.createSpy('stop'),
      } as unknown as LocalVideoTrack;

      service.localScreenTrack.set(mockScreenTrack);
      service.isScreenSharing.set(true);

      await service.stopScreenShare();

      expect(mockScreenTrack.stop).toHaveBeenCalled();
      expect(service.localScreenTrack()).toBeUndefined();
      expect(service.isScreenSharing()).toBeFalse();
    });
  });

  describe('Suite 5: Complete Teardown & Lifecycle', () => {
    it('TS5-01: should release all media and reset all state signals', async () => {
      const mockTrack = {
        stop: jasmine.createSpy('stop'),
      } as unknown as MediaStreamTrack;

      const mockStream = {
        getVideoTracks: () => [mockTrack],
        getAudioTracks: () => [mockTrack],
        getTracks: () => [mockTrack],
        removeTrack: jasmine.createSpy('removeTrack'),
      } as unknown as MediaStream;

      service.previewStream.set(mockStream);
      service.isCameraOn.set(true);
      service.isMicOn.set(true);
      service.isScreenSharing.set(true);
      service.mediaMode.set('in-meeting');

      await service.releaseAllMedia();

      expect(mockTrack.stop).toHaveBeenCalled();
      expect(service.previewStream()).toBeUndefined();
      expect(service.isCameraOn()).toBeFalse();
      expect(service.isMicOn()).toBeFalse();
      expect(service.isScreenSharing()).toBeFalse();
      expect(service.mediaMode()).toBe('idle');
    });

    it('TS5-02: should safely stop all room publications in stopAllTracks()', () => {
      const mockVideoTrack = {
        stop: jasmine.createSpy('stop'),
      };
      const mockAudioTrack = {
        stop: jasmine.createSpy('stop'),
      };

      const mockRoom: any = {
        localParticipant: {
          videoTrackPublications: new Map([['v1', { track: mockVideoTrack }]]),
          audioTrackPublications: new Map([['a1', { track: mockAudioTrack }]]),
        },
      };

      service.stopAllTracks(mockRoom as Room);

      expect(mockVideoTrack.stop).toHaveBeenCalled();
      expect(mockAudioTrack.stop).toHaveBeenCalled();
    });
  });
});
