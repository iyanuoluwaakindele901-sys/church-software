const dbToGain = (db) => 10 ** (Number(db || 0) / 20);

export class SolaAudioEngine {
  constructor() {
    this.context = null;
    this.master = null;
    this.programDestination = null;
    this.channels = new Map();
    this.monitoring = false;
  }

  async start() {
    if (!this.context) {
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.limiter = this.context.createDynamicsCompressor();
      this.limiter.threshold.value = -3;
      this.limiter.knee.value = 0;
      this.limiter.ratio.value = 20;
      this.limiter.attack.value = 0.003;
      this.limiter.release.value = 0.15;
      this.programDestination = this.context.createMediaStreamDestination();
      this.master.connect(this.limiter);
      this.limiter.connect(this.programDestination);
    }
    if (this.context.state === 'suspended') await this.context.resume();
    return this.programDestination.stream;
  }

  setMonitoring(enabled) {
    if (!this.context || this.monitoring === enabled) return;
    this.monitoring = enabled;
    if (enabled) this.limiter.connect(this.context.destination);
    else this.limiter.disconnect(this.context.destination);
  }

  setMasterVolume(value) {
    if (this.master) this.master.gain.setTargetAtTime(Number(value) / 100, this.context.currentTime, 0.015);
  }

  attachStream(id, stream) {
    if (!this.context || !stream?.getAudioTracks?.().length) return false;
    this.removeChannel(id);
    const source = this.context.createMediaStreamSource(stream);
    return this.createChannel(id, source, stream);
  }

  attachElement(id, element) {
    if (!this.context || !element) return false;
    this.removeChannel(id);
    const source = this.context.createMediaElementSource(element);
    return this.createChannel(id, source, null);
  }

  createChannel(id, source, stream) {
    const trim = this.context.createGain();
    const fader = this.context.createGain();
    const analyser = this.context.createAnalyser();
    analyser.fftSize = 512;
    source.connect(trim);
    trim.connect(fader);
    fader.connect(analyser);
    analyser.connect(this.master);
    this.channels.set(id, { source, trim, fader, analyser, stream, meterData: new Uint8Array(analyser.fftSize) });
    return true;
  }

  updateChannel(id, { level = 100, gain = 0, muted = false, audible = true }) {
    const channel = this.channels.get(id);
    if (!channel) return;
    channel.trim.gain.setTargetAtTime(dbToGain(gain), this.context.currentTime, 0.015);
    channel.fader.gain.setTargetAtTime(muted || !audible ? 0 : Number(level) / 100, this.context.currentTime, 0.015);
  }

  readMeter(id) {
    const channel = this.channels.get(id);
    if (!channel) return 0;
    channel.analyser.getByteTimeDomainData(channel.meterData);
    let sum = 0;
    for (const value of channel.meterData) {
      const sample = (value - 128) / 128;
      sum += sample * sample;
    }
    return Math.min(100, Math.sqrt(sum / channel.meterData.length) * 180);
  }

  getProgramStream() {
    return this.programDestination?.stream || null;
  }

  removeChannel(id) {
    const channel = this.channels.get(id);
    if (!channel) return;
    try { channel.source.disconnect(); } catch { /* already disconnected */ }
    try { channel.trim.disconnect(); } catch { /* already disconnected */ }
    try { channel.fader.disconnect(); } catch { /* already disconnected */ }
    try { channel.analyser.disconnect(); } catch { /* already disconnected */ }
    this.channels.delete(id);
  }

  close() {
    this.channels.forEach((_channel, id) => this.removeChannel(id));
    this.context?.close();
    this.context = null;
  }
}
