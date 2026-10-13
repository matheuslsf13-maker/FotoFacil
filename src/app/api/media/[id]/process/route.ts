import { NextResponse } from 'next/server'
import { getFaceProvider } from '@/lib/faces'
import { processMedia } from '@/lib/media/processing'
import { createSupabaseProcessingRepo } from '@/lib/media/processing-repo'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export const maxDuration = 60

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  // RLS only returns media from events this user may access.
  const { data: media } = await supabase.from('media').select('id').eq('id', id).maybeSingle()
  if (!media) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  const result = await processMedia(id, {
    repo: createSupabaseProcessingRepo(createAdminClient()),
    faces: getFaceProvider(),
  })
  return NextResponse.json({ result })
}
