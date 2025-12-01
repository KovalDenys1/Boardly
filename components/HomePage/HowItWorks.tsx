// Server Component - static content
export default function HowItWorks() {
  const steps = [
    {
      number: 1,
      bgColor: 'bg-blue-500',
      title: 'Create or Join',
      description: 'Create a new lobby or join an existing one with a code'
    },
    {
      number: 2,
      bgColor: 'bg-purple-500',
      title: 'Invite Friends',
      description: 'Share the lobby code with friends to start playing'
    },
    {
      number: 3,
      bgColor: 'bg-pink-500',
      title: 'Play & Win',
      description: 'Take turns, roll dice, and compete for the highest score!'
    }
  ]

  return (
    <div className="bg-white/10 backdrop-blur-md rounded-3xl p-8 md:p-12 text-white animate-slide-in-up">
      <h2 className="text-3xl md:text-4xl font-bold text-center mb-12">How It Works</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {steps.map((step) => (
          <div key={step.number} className="text-center">
            <div className={`inline-flex items-center justify-center w-16 h-16 rounded-full ${step.bgColor} text-white font-bold text-2xl mb-4 shadow-lg`}>
              {step.number}
            </div>
            <h3 className="text-xl font-bold mb-2">{step.title}</h3>
            <p className="text-white/80">{step.description}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
