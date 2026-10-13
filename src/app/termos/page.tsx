import { LegalPage } from '@/components/legal-page'
import { TERMS_SECTIONS } from '@/lib/legal'

export default function TermsPage() {
  return <LegalPage title="Termos de uso" sections={TERMS_SECTIONS} />
}
