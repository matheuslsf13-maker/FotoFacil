import { LegalPage } from '@/components/legal-page'
import { PRIVACY_SECTIONS } from '@/lib/legal'

export default function PrivacyPage() {
  return <LegalPage title="Política de privacidade" sections={PRIVACY_SECTIONS} />
}
