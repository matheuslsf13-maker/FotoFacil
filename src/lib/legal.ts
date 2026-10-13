export const WRISTBAND_TERMS_LABEL = 'Cliente aceitou os termos (fotos + reconhecimento facial)'

export const FACE_CONSENT_LABEL = 'Concordo com o uso do meu rosto para encontrar minhas fotos.'

export const FACE_CONSENT_TEXT =
  'Para encontrar suas fotos, comparamos o seu rosto com os rostos das fotos deste evento. ' +
  'A sua selfie é usada só nesta busca e não fica guardada. O reconhecimento é feito pela Amazon Web Services (AWS), ' +
  'em servidores fora do Brasil. Os dados de rosto das fotos são apagados junto com as fotos, no fim do prazo do evento.'

export interface LegalSection {
  title: string
  body: string
}

export const TERMS_SECTIONS: LegalSection[] = [
  {
    title: 'O que é o FotoFácil',
    body: 'O FotoFácil ajuda fotógrafos de eventos a entregar fotos e vídeos às clientes que receberam a pulseira do fotógrafo.',
  },
  {
    title: 'Pulseira e cadastro',
    body: 'Ao aceitar a pulseira, a cliente informa nome completo e celular e concorda em ser fotografada no evento e em ter as fotos organizadas por reconhecimento facial.',
  },
  {
    title: 'Pagamento e acesso',
    body: 'O pagamento é combinado diretamente com o fotógrafo. As fotos ficam disponíveis no site somente depois que o pagamento é confirmado.',
  },
  {
    title: 'Prazo de disponibilidade',
    body: 'As fotos e vídeos ficam disponíveis por um prazo definido para cada evento e depois são excluídos definitivamente. Baixe suas fotos antes do fim do prazo.',
  },
  {
    title: 'Uso das fotos',
    body: 'As fotos são para uso pessoal da cliente. Os direitos autorais continuam sendo do fotógrafo.',
  },
  {
    title: 'Contato',
    body: 'Dúvidas sobre pagamento ou fotos: fale com o fotógrafo pelo WhatsApp indicado na página do evento.',
  },
]

export const PRIVACY_SECTIONS: LegalSection[] = [
  {
    title: 'Dados que coletamos',
    body: 'Nome completo e celular (no cadastro da pulseira), as fotos e vídeos do evento e, no momento da busca, uma selfie ou foto enviada por você.',
  },
  {
    title: 'Reconhecimento facial',
    body: 'Usamos reconhecimento facial apenas para encontrar as fotos em que você aparece, e só com o seu consentimento, dado na entrega da pulseira e de novo antes da busca.',
  },
  {
    title: 'Sua selfie',
    body: 'A selfie é usada apenas durante a busca e não fica guardada.',
  },
  {
    title: 'Onde os dados são processados',
    body: 'O reconhecimento facial é feito pela Amazon Web Services (AWS), em servidores fora do Brasil.',
  },
  {
    title: 'Por quanto tempo guardamos',
    body: 'Fotos, vídeos e os dados de rosto extraídos deles são excluídos no fim do prazo de cada evento. Nome, celular e o histórico de compras são mantidos para controle financeiro.',
  },
  {
    title: 'Seus direitos (LGPD)',
    body: 'Você pode pedir acesso, correção ou exclusão dos seus dados e revogar o consentimento a qualquer momento, falando com o fotógrafo ou com a administração da plataforma.',
  },
]
