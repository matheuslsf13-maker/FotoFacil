import { Card, PageTitle } from '@/components/ui'
import { LoginForm } from './login-form'

export default function LoginPage() {
  return (
    <div className="mx-auto max-w-sm space-y-4">
      <PageTitle>Entrar no FotoFácil</PageTitle>
      <Card>
        <LoginForm />
      </Card>
    </div>
  )
}
