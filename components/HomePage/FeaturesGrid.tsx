// Server Component - no interactivity needed
export default function FeaturesGrid() {
  const features = [
    {
      emoji: '🎲',
      title: 'Multiple Games',
      description: 'Yahtzee, Guess the Spy, and many more games coming soon!',
      delay: '0s'
    },
    {
      emoji: '💬',
      title: 'Live Chat',
      description: 'Chat with friends in real-time while playing your favorite games',
      delay: '0.1s'
    },
    {
      emoji: '⚡',
      title: 'Real-Time Play',
      description: 'Instant updates with Socket.IO for seamless multiplayer experience',
      delay: '0.2s'
    },
    {
      emoji: '🔐',
      title: 'Private Lobbies',
      description: 'Create password-protected lobbies for you and your friends',
      delay: '0.3s'
    }
  ]

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
      {features.map((feature, index) => (
        <div 
          key={index}
          className="bg-white/10 backdrop-blur-md rounded-2xl p-6 text-white hover:bg-white/20 transition-all duration-300 hover:scale-105 animate-fade-in" 
          style={{ animationDelay: feature.delay }}
        >
          <div className="text-4xl mb-4">{feature.emoji}</div>
          <h3 className="text-xl font-bold mb-2">{feature.title}</h3>
          <p className="text-white/80 text-sm">{feature.description}</p>
        </div>
      ))}
    </div>
  )
}
