class SoundManager {
  private sounds: Map<string, HTMLAudioElement> = new Map()
  private enabled: boolean = true
  private initialized: boolean = false
  private userInteracted: boolean = false
  private playingSounds: Set<string> = new Set()

  constructor() {
    if (typeof window !== 'undefined') {
      this.loadSounds()
      const saved = localStorage.getItem('soundEnabled')
      this.enabled = saved !== 'false'
      
      // Listen for first user interaction to enable audio playback
      this.setupUserInteraction()
    }
  }

  private setupUserInteraction() {
    const enableAudio = () => {
      if (!this.userInteracted) {
        this.userInteracted = true
        // Try to unlock audio context by playing silent audio
        this.sounds.forEach(sound => {
          sound.volume = 0
          sound.play().then(() => {
            sound.pause()
            sound.currentTime = 0
            sound.volume = 1
          }).catch(() => {
            // Ignore errors during unlock
          })
        })
        
        // Remove listeners after first interaction
        document.removeEventListener('click', enableAudio)
        document.removeEventListener('touchstart', enableAudio)
        document.removeEventListener('keydown', enableAudio)
      }
    }

    document.addEventListener('click', enableAudio, { once: true })
    document.addEventListener('touchstart', enableAudio, { once: true })
    document.addEventListener('keydown', enableAudio, { once: true })
  }

  private loadSounds() {
    const soundFiles = {
      diceRoll: '/sounds/dice-roll.mp3',
      click: '/sounds/click.mp3',
      win: '/sounds/win.mp3',
      turnChange: '/sounds/turn-change.mp3',
      score: '/sounds/score.mp3',
      message: '/sounds/click.mp3', // Use click sound for messages
      playerJoin: '/sounds/click.mp3',
      gameStart: '/sounds/turn-change.mp3',
      celebration: '/sounds/win.mp3',
    }

    Object.entries(soundFiles).forEach(([key, path]) => {
      const audio = new Audio(path)
      audio.preload = 'auto' // Preload fully for instant playback
      audio.volume = 0.7 // Set default volume to 70%
      
      // Add error handler to prevent console errors
      audio.addEventListener('error', (e) => {
        console.warn(`Failed to load sound: ${path}`, e)
      })
      
      // Clean up playing state when sound ends
      audio.addEventListener('ended', () => {
        this.playingSounds.delete(key)
      })
      
      this.sounds.set(key, audio)
    })
    
    this.initialized = true
  }

  play(soundName: string, options: { volume?: number; loop?: boolean; force?: boolean } = {}) {
    if (!this.enabled || !this.initialized) return

    const sound = this.sounds.get(soundName)
    if (!sound) {
      console.warn(`Sound not found: ${soundName}`)
      return
    }

    // Prevent overlapping sounds unless forced
    if (!options.force && this.playingSounds.has(soundName)) {
      return
    }

    try {
      // Reset sound to beginning
      sound.currentTime = 0
      
      // Apply options
      if (options.volume !== undefined) {
        sound.volume = Math.max(0, Math.min(1, options.volume))
      } else {
        sound.volume = 0.7 // Default volume
      }
      
      sound.loop = options.loop || false
      
      // Track playing state
      this.playingSounds.add(soundName)
      
      // Play with proper error handling
      const playPromise = sound.play()
      
      if (playPromise !== undefined) {
        playPromise.catch((err) => {
          // Remove from playing set on error
          this.playingSounds.delete(soundName)
          
          // Only warn if it's not a user interaction issue
          if (err.name !== 'NotAllowedError' && err.name !== 'NotSupportedError') {
            console.warn(`Sound play failed (${soundName}):`, err.message)
          }
        })
      }
    } catch (err) {
      this.playingSounds.delete(soundName)
      console.warn(`Sound play exception (${soundName}):`, err)
    }
  }

  stop(soundName: string) {
    const sound = this.sounds.get(soundName)
    if (sound) {
      sound.pause()
      sound.currentTime = 0
      this.playingSounds.delete(soundName)
    }
  }

  stopAll() {
    this.sounds.forEach((sound, key) => {
      sound.pause()
      sound.currentTime = 0
      this.playingSounds.delete(key)
    })
  }

  toggle() {
    this.enabled = !this.enabled
    localStorage.setItem('soundEnabled', String(this.enabled))
    
    // Stop all sounds when disabling
    if (!this.enabled) {
      this.stopAll()
    }
    
    return this.enabled
  }

  isEnabled() {
    return this.enabled
  }

  hasUserInteracted() {
    return this.userInteracted
  }
}

// Lazy singleton initialization to avoid SSR issues
let soundManagerInstance: SoundManager | null = null

export const sounds = {
  get instance(): SoundManager {
    if (typeof window === 'undefined') {
      // Return a dummy instance on server
      return {
        play: () => {},
        stop: () => {},
        stopAll: () => {},
        toggle: () => false,
        isEnabled: () => false,
        hasUserInteracted: () => false,
      } as any
    }
    
    if (!soundManagerInstance) {
      soundManagerInstance = new SoundManager()
    }
    
    return soundManagerInstance
  },
  
  // Convenience methods
  play(soundName: string, options?: Parameters<SoundManager['play']>[1]) {
    return this.instance.play(soundName, options)
  },
  
  stop(soundName: string) {
    return this.instance.stop(soundName)
  },
  
  stopAll() {
    return this.instance.stopAll()
  },
  
  toggle() {
    return this.instance.toggle()
  },
  
  isEnabled() {
    return this.instance.isEnabled()
  },
  
  hasUserInteracted() {
    return this.instance.hasUserInteracted()
  },
}

// Deprecated: Use 'sounds' instead
export const soundManager = sounds
