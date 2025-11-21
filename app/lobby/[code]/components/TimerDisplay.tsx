interface TimerDisplayProps {
  timeLeft: number
  timerActive: boolean
  isMyTurn: boolean
}

export default function TimerDisplay({ timeLeft, timerActive, isMyTurn }: TimerDisplayProps) {
  if (!isMyTurn || !timerActive) return null

  const isUrgent = timeLeft <= 10
  const percentage = (timeLeft / 60) * 100

  return (
    <div className="mb-4 bg-white/10 backdrop-blur-md rounded-2xl p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-white font-semibold">⏱️ Your Turn</span>
        <span className={`text-2xl font-bold ${isUrgent ? 'text-red-400 animate-pulse' : 'text-white'}`}>
          {timeLeft}s
        </span>
      </div>
      <div className="w-full bg-white/20 rounded-full h-2 overflow-hidden">
        <div
          className={`h-full transition-all duration-1000 ease-linear ${
            isUrgent ? 'bg-red-500' : 'bg-green-500'
          }`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      {isUrgent && (
        <p className="text-red-300 text-sm mt-2 animate-pulse">
          ⚠️ Hurry! Time is running out!
        </p>
      )}
    </div>
  )
}
