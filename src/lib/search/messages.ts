import type { SearchFailure } from './search'

export const SEARCH_MESSAGES: Record<SearchFailure, string> = {
  not_found: 'Cadastro não encontrado. Volte e escolha seu nome de novo.',
  not_paid: 'Seu pagamento ainda não foi confirmado.',
  event_unavailable: 'As fotos deste evento não estão mais disponíveis.',
  no_consent: 'Marque o consentimento para continuar.',
  limit: 'Você atingiu o limite de buscas de hoje. Tente amanhã.',
  not_ready: 'As fotos deste evento ainda estão sendo enviadas. Tente mais tarde.',
  no_face: 'Não encontramos um rosto. Fique sozinha na moldura, com o rosto bem iluminado.',
  many_faces: 'Apareceu mais de um rosto. Fique sozinha na moldura, com o rosto bem iluminado.',
}
