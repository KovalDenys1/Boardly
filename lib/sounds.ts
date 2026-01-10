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
        // Try to unlock audio context by playing and immediately pausing ONE sound
        // This is enough to unlock the audio context for all sounds
        const firstSound = this.sounds.values().next().value
        if (firstSound) {
          firstSound.volume = 0
          const playPromise = firstSound.play()
          if (playPromise !== undefined) {
            playPromise.then(() => {
              firstSound.pause()
              firstSound.currentTime = 0
              firstSound.volume = 0.7
            }).catch(() => {
              // Ignore errors during unlock
              firstSound.volume = 0.7
            })
          }
        }
        
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
      try {
        const audio = new Audio()
        audio.preload = 'none' // Changed from 'auto' to prevent cache issues in production
        audio.volume = 0.7 // Set default volume to 70%
        
        // Set src after creating audio element to avoid immediate loading issues
        audio.src = path
        
        // Enhanced error handler with retry logic
        audio.addEventListener('error', (e) => {
          // Silently handle cache errors (common in production)
          const error = e.target as HTMLAudioElement
          if (error.error?.code === 4) {
            // MEDIA_ERR_SRC_NOT_SUPPORTED or cache error - try reloading
            audio.load()
          }
          // Don't spam console with cache errors in production
          if (process.env.NODE_ENV === 'development') {
            console.warn(`Failed to load sound: ${path}`, e)
          }
        })
        
        // Clean up playing state when sound ends
        audio.addEventListener('ended', () => {
          this.playingSounds.delete(key)
        })
        
        this.sounds.set(key, audio)
      } catch (error) {
        // Fail silently for individual sounds - app should continue working
        if (process.env.NODE_ENV === 'development') {
          console.warn(`Failed to create audio for ${key}:`, error)
        }
      }
    })
    
    this.initialized = true
  }

  play(soundName: string, options: { volume?: number; loop?: boolean; force?: boolean } = {}) {
    if (!this.enabled || !this.initialized) return

    const sound = this.sounds.get(soundName)
    if (!sound) {
      if (process.env.NODE_ENV === 'development') {
        console.warn(`Sound not found: ${soundName}`)
      }
      return
    }

    // Prevent overlapping sounds unless forced
    if (!options.force && this.playingSounds.has(soundName)) {
      return
    }

    try {
      // Load sound if not loaded (lazy loading to prevent cache errors)
      if (sound.readyState === 0) {
        sound.load()
      }
      
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
          
          // Only warn if it's not a user interaction or cache issue
          if (err.name !== 'NotAllowedError' && 
              err.name !== 'NotSupportedError' && 
              err.name !== 'AbortError' &&
              process.env.NODE_ENV === 'development') {
            console.warn(`Sound play failed (${soundName}):`, err.message)
          }
        })
      }
    } catch (err) {
      this.playingSounds.delete(soundName)
      if (process.env.NODE_ENV === 'development') {
        console.warn(`Sound play exception (${soundName}):`, err)
      }
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
