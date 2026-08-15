export function toggleMute(channels, id) {
  return channels.map((channel) => (channel.id === id ? { ...channel, muted: !channel.muted } : channel));
}

export function setChannelLevel(channels, id, level) {
  return channels.map((channel) => (channel.id === id ? { ...channel, level } : channel));
}

export function setChannelGain(channels, id, gain) {
  return channels.map((channel) => (channel.id === id ? { ...channel, gain } : channel));
}

export function toggleSolo(channels, id) {
  return channels.map((channel) => (channel.id === id ? { ...channel, solo: !channel.solo } : channel));
}

export function addAudioChannel(channels, channel) {
  return [...channels, channel];
}

export function removeAudioChannel(channels, id) {
  return channels.filter((c) => c.id !== id);
}

export { SolaAudioEngine } from './engine';
