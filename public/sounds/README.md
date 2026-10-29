# Sounds

Every sound the site plays is in `kenney/`: 60 Kenney CC0 samples, credited per pack and file in
`CREDITS.txt`, with the packs' licence text in `kenney/LICENSE-kenney-CC0.txt`.

- **Format:** MP3, mono, 44.1 kHz, 96 kbps CBR, peak-normalised to -1 dBFS, leading silence
  trimmed. MP3 is the only codec `decodeAudioData` handles on every iOS 17/18 Safari, Chrome
  and Firefox.
- **Which sample plays when, and how loud:** `lib/sound-map.ts`. Each cue lists its layers
  (sample, gain in dB, semitones, offset, pan), round-robin variants, jitter, remote level,
  min gap and load group. The test `__tests__/lib/sound-map.test.ts` checks every sample there
  exists here at the recorded size.
- **Playback:** `lib/sound-engine.ts` (Web Audio, loaded on lobby and game pages only).
  Settings: `lib/sound-settings.ts` (no audio, safe on every page).
- **Listen and tune:** run the dev server and open `/dev/sounds`.

A new sample needs its file here, an entry in `SOUND_SAMPLES` (bytes and RMS dBFS) and a line in
`CREDITS.txt`.
