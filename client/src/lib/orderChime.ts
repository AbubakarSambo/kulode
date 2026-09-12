// A short, distinct three-note chime for "new order arrived" on the kitchen/drinks ticket
// boards — synthesized with the Web Audio API instead of shipping an audio file, so there's no
// asset/licensing to manage and the sound is unique to this app rather than a generic notification
// blip. Needs a live user gesture to create/resume the AudioContext (browser autoplay policy), so
// callers must obtain the context from a click handler — see useOrderChime.

const NOTES_HZ = [880, 1108.73, 1318.51] // A5, C#6, E6 — a bright, unambiguous ascending triad

export function playOrderChime(ctx: AudioContext) {
  const now = ctx.currentTime
  NOTES_HZ.forEach((freq, i) => {
    const start = now + i * 0.12
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = freq
    gain.gain.setValueAtTime(0, start)
    gain.gain.linearRampToValueAtTime(0.35, start + 0.015)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.35)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(start)
    osc.stop(start + 0.35)
  })
}

export function createOrderChimeContext(): AudioContext {
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
  return new Ctor()
}
