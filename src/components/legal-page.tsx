import type { LegalSection } from '@/lib/legal'
import { Card, PageTitle } from './ui'

export function LegalPage({ title, sections }: { title: string; sections: LegalSection[] }) {
  return (
    <div className="space-y-4">
      <PageTitle>{title}</PageTitle>
      <Card className="space-y-4">
        {sections.map(section => (
          <section key={section.title}>
            <h2 className="font-semibold">{section.title}</h2>
            <p className="text-gray-700">{section.body}</p>
          </section>
        ))}
      </Card>
    </div>
  )
}
