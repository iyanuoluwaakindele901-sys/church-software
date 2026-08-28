export const RECORDING_RESOLUTIONS = {
  '720p': { label: '1280 x 720', width: 1280, height: 720 },
  '1080p': { label: '1920 x 1080', width: 1920, height: 1080 },
  '1440p': { label: '2560 x 1440', width: 2560, height: 1440 },
};

export const RECORDING_QUALITIES = {
  standard: { label: 'Standard', videoBitsPerSecond: 3500000, audioBitsPerSecond: 128000 },
  high: { label: 'High', videoBitsPerSecond: 8000000, audioBitsPerSecond: 192000 },
  ultra: { label: 'Ultra', videoBitsPerSecond: 14000000, audioBitsPerSecond: 256000 },
};

const FORMAT_CANDIDATES = [
  { id: 'mp4-h264', label: 'MP4 (H.264) - Preferred', mimeType: 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', extension: 'mp4' },
  { id: 'webm-vp9', label: 'WebM (VP9)', mimeType: 'video/webm;codecs=vp9,opus', extension: 'webm' },
  { id: 'webm-vp8', label: 'WebM (VP8)', mimeType: 'video/webm;codecs=vp8,opus', extension: 'webm' },
  { id: 'webm', label: 'WebM', mimeType: 'video/webm', extension: 'webm' },
];

export function getSupportedRecordingFormats() {
  if (!globalThis.MediaRecorder) return [];
  const supported = FORMAT_CANDIDATES.filter((format) => MediaRecorder.isTypeSupported(format.mimeType));
  return supported.length ? supported : [FORMAT_CANDIDATES.at(-1)];
}

export function createRecordingFilename(extension = 'webm') {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `sola-worship-${stamp}.${extension}`;
}

export async function chooseRecordingFile(format, suggestedName) {
  if (!window.showSaveFilePicker) return null;
  return window.showSaveFilePicker({
    suggestedName,
    types: [{
      description: `${format.label} video`,
      accept: { [format.mimeType.split(';')[0]]: [`.${format.extension}`] },
    }],
  });
}

const downloadBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 30000);
};

export class SolaRecordingEngine {
  constructor(callbacks = {}) {
    this.callbacks = callbacks;
    this.status = 'idle';
    this.recorder = null;
    this.displayStream = null;
    this.combinedStream = null;
    this.chunks = [];
    this.writable = null;
    this.writeChain = Promise.resolve();
    this.bytesWritten = 0;
    this.elapsedBeforePause = 0;
    this.activeStartedAt = 0;
    this.stopping = false;
  }

  emit(status, detail = {}) {
    this.status = status;
    this.callbacks.onStatus?.(status, detail);
  }

  getElapsedMs() {
    if (this.status === 'recording') return this.elapsedBeforePause + (performance.now() - this.activeStartedAt);
    return this.elapsedBeforePause;
  }

  async start({ settings, audioStream, fileHandle }) {
    if (this.status !== 'idle' && this.status !== 'complete' && this.status !== 'error') return;
    if (!navigator.mediaDevices?.getDisplayMedia || !globalThis.MediaRecorder) {
      throw new Error('Screen recording is not supported in this browser. Use a current Chromium-based browser over HTTPS.');
    }

    const format = getSupportedRecordingFormats().find((item) => item.id === settings.format)
      || getSupportedRecordingFormats()[0];
    if (!format) throw new Error('This browser does not provide a supported video recording format.');
    const resolution = RECORDING_RESOLUTIONS[settings.resolution] || RECORDING_RESOLUTIONS['1080p'];
    const quality = RECORDING_QUALITIES[settings.quality] || RECORDING_QUALITIES.high;
    this.emit('selecting');

    try {
      this.displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface: 'browser',
          width: { ideal: resolution.width },
          height: { ideal: resolution.height },
          frameRate: { ideal: Number(settings.fps), max: Number(settings.fps) },
        },
        audio: false,
        preferCurrentTab: false,
        selfBrowserSurface: 'exclude',
        surfaceSwitching: 'include',
      });
      const videoTrack = this.displayStream.getVideoTracks()[0];
      if (!videoTrack) throw new Error('The selected source did not provide a video track.');
      await videoTrack.applyConstraints({
        width: { ideal: resolution.width },
        height: { ideal: resolution.height },
        frameRate: { ideal: Number(settings.fps), max: Number(settings.fps) },
      }).catch(() => {});

      const audioTracks = (audioStream?.getAudioTracks?.() || []).map((track) => track.clone());
      this.combinedStream = new MediaStream([videoTrack, ...audioTracks]);
      this.chunks = [];
      this.bytesWritten = 0;
      this.writeChain = Promise.resolve();
      this.writable = fileHandle ? await fileHandle.createWritable() : null;
      this.settings = { ...settings, format: format.id };
      this.format = format;
      this.fileHandle = fileHandle;
      this.recorder = new MediaRecorder(this.combinedStream, {
        mimeType: format.mimeType,
        videoBitsPerSecond: quality.videoBitsPerSecond,
        audioBitsPerSecond: quality.audioBitsPerSecond,
      });

      this.recorder.ondataavailable = (event) => {
        if (!event.data?.size) return;
        this.bytesWritten += event.data.size;
        if (this.writable) this.writeChain = this.writeChain.then(() => this.writable.write(event.data));
        else this.chunks.push(event.data);
      };
      this.recorder.onerror = (event) => {
        const error = event.error || new Error('The browser recorder reported an error.');
        this.emit('error', { error });
        this.callbacks.onError?.(error);
        if (this.recorder && this.recorder.state !== 'inactive') this.stop();
      };
      this.recorder.onstop = () => this.finalize();
      videoTrack.onended = () => {
        if (this.recorder && this.recorder.state !== 'inactive') this.stop();
      };

      this.elapsedBeforePause = 0;
      this.activeStartedAt = performance.now();
      this.stopping = false;
      this.recorder.start(1000);
      this.emit('recording', {
        video: videoTrack.getSettings(),
        hasAudio: audioTracks.length > 0,
        mimeType: this.recorder.mimeType,
      });
    } catch (error) {
      if (this.writable?.abort) await this.writable.abort().catch(() => {});
      this.writable = null;
      this.cleanupTracks();
      this.emit('error', { error });
      throw error;
    }
  }

  pause() {
    if (this.recorder?.state !== 'recording') return false;
    this.elapsedBeforePause += performance.now() - this.activeStartedAt;
    this.recorder.pause();
    this.emit('paused');
    return true;
  }

  resume() {
    if (this.recorder?.state !== 'paused') return false;
    this.recorder.resume();
    this.activeStartedAt = performance.now();
    this.emit('recording');
    return true;
  }

  stop() {
    if (!this.recorder || this.recorder.state === 'inactive' || this.stopping) return false;
    if (this.recorder.state === 'recording') this.elapsedBeforePause += performance.now() - this.activeStartedAt;
    this.stopping = true;
    this.emit('finalizing');
    this.recorder.stop();
    return true;
  }

  async finalize() {
    try {
      await this.writeChain;
      const filename = this.fileHandle?.name || this.settings.filename || createRecordingFilename(this.format.extension);
      if (this.writable) {
        await this.writable.close();
      } else {
        const blob = new Blob(this.chunks, { type: this.recorder?.mimeType || this.format.mimeType });
        downloadBlob(blob, filename);
      }
      const completion = {
        filename,
        bytes: this.bytesWritten,
        mimeType: this.recorder?.mimeType || this.format.mimeType,
        saveMethod: this.fileHandle ? 'chosen location' : 'browser downloads',
        durationMs: this.elapsedBeforePause,
      };
      this.emit('complete', completion);
      this.callbacks.onComplete?.(completion);
    } catch (error) {
      this.emit('error', { error });
      this.callbacks.onError?.(error);
    } finally {
      this.cleanupTracks();
      this.recorder = null;
      this.writable = null;
      this.stopping = false;
    }
  }

  cleanupTracks() {
    this.displayStream?.getTracks().forEach((track) => track.stop());
    this.combinedStream?.getTracks().forEach((track) => track.stop());
    this.displayStream = null;
    this.combinedStream = null;
  }
}
