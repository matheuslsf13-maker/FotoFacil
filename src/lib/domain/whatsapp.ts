export function whatsappLink(e164: string, message: string): string {
  return `https://wa.me/${e164.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`
}

export function paymentRequestMessage(clientFullName: string, eventName: string): string {
  return `Oi! Sou ${clientFullName}, do evento ${eventName}. Quero confirmar o pagamento das minhas fotos.`
}
