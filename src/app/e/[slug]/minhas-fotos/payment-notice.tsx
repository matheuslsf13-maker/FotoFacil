import { Card, buttonClass } from '@/components/ui'
import { formatBRL } from '@/lib/domain/money'

export function PaymentNotice({
  eventName,
  priceCents,
  photographerName,
  photographerPhotoUrl,
  whatsappUrl,
}: {
  eventName: string
  priceCents: number
  photographerName: string
  photographerPhotoUrl: string | null
  whatsappUrl: string
}) {
  return (
    <Card className="space-y-4 text-center">
      {photographerPhotoUrl ? <img src={photographerPhotoUrl} alt="" className="mx-auto h-20 w-20 rounded-full object-cover" /> : null}
      <h2 className="text-lg font-semibold">Pagamento ainda não confirmado pelo fotógrafo</h2>
      <p>
        Para ver suas fotos de <strong>{eventName}</strong>, o pagamento de <strong>{formatBRL(priceCents)}</strong> precisa ser
        confirmado por {photographerName}.
      </p>
      <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className={buttonClass('primary')}>
        Falar no WhatsApp
      </a>
      <p className="text-sm text-gray-600">Já pagou? Peça a confirmação pelo WhatsApp e depois volte a esta página.</p>
    </Card>
  )
}
