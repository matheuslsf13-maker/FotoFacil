const MESSAGES: Array<[string, string]> = [
  ['not_authorized', 'Você não tem permissão para isso.'],
  ['not_found', 'Registro não encontrado.'],
  ['already_registered', 'Essa cliente já recebeu pulseira neste evento.'],
  ['event_not_active', 'Este evento não está mais ativo.'],
  ['terms_required', 'Confirme que a cliente aceitou os termos.'],
  ['invalid_state', 'Essa ação não é possível na situação atual.'],
  ['undo_locked', 'Não dá para desfazer: a cliente já acessou as fotos. Fale com o administrador.'],
  ['no_sales', 'Não há vendas para fechar nesse período.'],
  ['retention_exceeds_max', 'O prazo de exclusão passa do máximo permitido.'],
  ['clients_phone_e164_key', 'Já existe uma cliente com esse celular.'],
  ['events_slug_key', 'Já existe um evento com esse endereço. Tente de novo.'],
]

export function errorMessage(err: { message?: string } | null | undefined): string {
  const text = err?.message ?? ''
  const hit = MESSAGES.find(([code]) => text.includes(code))
  return hit ? hit[1] : 'Algo deu errado. Tente de novo.'
}
