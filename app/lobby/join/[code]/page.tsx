import { redirect } from 'next/navigation'

export default async function LegacyLobbyJoinPage({
  params,
}: {
  params: Promise<{ code: string }>
}) {
  const { code } = await params

  redirect(`/lobby/${code}`)
}
