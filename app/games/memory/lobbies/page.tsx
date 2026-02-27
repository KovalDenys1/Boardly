import { redirect } from 'next/navigation'

export default function MemoryLobbiesPage() {
  redirect('/lobby/create?gameType=memory')
}
