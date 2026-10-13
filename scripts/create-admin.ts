import { createClient } from '@supabase/supabase-js'

async function main() {
  const [email, password] = process.argv.slice(2)
  if (!email || !password) {
    console.error('Uso: npm run create-admin -- <email> <senha>')
    process.exit(1)
  }
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false },
  })
  const { data, error } = await supabase.auth.admin.createUser({ email, password, email_confirm: true })
  if (error || !data.user) throw new Error(error?.message ?? 'Falha ao criar usuário')
  const { error: profileError } = await supabase.from('profiles').insert({ id: data.user.id, role: 'admin' })
  if (profileError) throw new Error(profileError.message)
  console.log(`Admin criado: ${email}`)
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
