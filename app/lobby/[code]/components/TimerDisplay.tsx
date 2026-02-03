interface TimerDisplayProps {
  timeLeft: number
  timerActive: boolean
  isMyTurn: boolean
  turnTimerLimit: number // Total time limit for calculating percentage
}

export default function TimerDisplay({ timeLeft, timerActive, isMyTurn, turnTimerLimit }: TimerDisplayProps) {
  if (!isMyTurn || !timerActive) return null

  const isUrgent = timeLeft <= 10
  const percentage = (timeLeft / turnTimerLimit) * 100

  return (
    <div
      className="bg-white/10 backdrop-blur-md rounded-2xl"
      style={{
        marginBottom: `clamp(12px, 1.2vh, 20px)`,
        padding: `clamp(12px, 1.2vh, 20px)`,
      }}
    >
      <div
        className="flex items-center justify-between"
        style={{ marginBottom: `clamp(6px, 0.6vh, 10px)` }}
      >
        <span
          className="text-white font-semibold"
          style={{ fontSize: `clamp(13px, 1.3vw, 16px)` }}
        >
          ⏱️ Your Turn
        </span>
        <span
          className={`font-bold ${isUrgent ? 'text-red-400 animate-pulse' : 'text-white'}`}
          style={{ fontSize: `clamp(20px, 2vw, 28px)` }}
        >
          {timeLeft}s
        </span>
      </div>
      <div
        className="w-full bg-white/20 rounded-full overflow-hidden"
        style={{ height: `clamp(6px, 0.6vh, 10px)` }}
      >
        <div
          className={`transition-all duration-1000 ease-linear ${
            isUrgent ? 'bg-red-500' : 'bg-green-500'
          }`}
          style={{
            width: `${percentage}%`,
            height: `clamp(6px, 0.6vh, 10px)`,
          }}
        />
      </div>
      {isUrgent && (
        <p
          className="text-red-300 animate-pulse"
          style={{
            fontSize: `clamp(11px, 1vw, 14px)`,
            marginTop: `clamp(6px, 0.6vh, 10px)`,
          }}
        >
          ⚠️ Hurry! Time is running out!
        </p>
      )}
    </div>
  )
}
