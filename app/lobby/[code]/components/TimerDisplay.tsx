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
    <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-4 mb-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-white/90 font-semibold text-sm">
          ⏱️ Your Turn
        </span>
        <span
          className={`font-bold text-2xl ${isUrgent ? 'text-red-400 animate-pulse' : 'text-white'}`}
        >
          {timeLeft}s
        </span>
      </div>
      <div className="w-full bg-white/10 rounded-full overflow-hidden h-2">
        <div
          className={`transition-all duration-1000 ease-linear h-2 rounded-full ${
            isUrgent ? 'bg-red-500' : 'bg-green-400'
          }`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      {isUrgent && (
        <p className="text-red-300 animate-pulse text-xs mt-2">
          ⚠️ Hurry! Time is running out!
        </p>
      )}
    </div>
  )
}
