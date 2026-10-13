import { expect, test } from '@playwright/test'
import { solidPng } from './fixtures'
import { readState } from './state'

const ANA_PHOTO = solidPng(640, 480, [200, 120, 120])
const OTHER_PHOTO = solidPng(800, 600, [120, 120, 200])
const ANA_SELFIE = solidPng(640, 480, [180, 140, 130])

test('a client finds only her photos after the photographer confirms payment', async ({ browser }) => {
  const state = readState()
  const last4 = state.clientPhone.slice(-4)

  // Photographer: log in and create the event
  const photographer = await browser.newPage()
  photographer.on('dialog', dialog => void dialog.accept())
  await photographer.goto('/login')
  await photographer.getByLabel('E-mail').fill(state.email)
  await photographer.getByLabel('Senha').fill(state.password)
  await photographer.getByRole('button', { name: 'Entrar' }).click()
  await expect(photographer.getByRole('heading', { name: 'Meus eventos' })).toBeVisible()
  await photographer.getByRole('link', { name: 'Novo evento' }).click()
  await photographer.getByLabel('Nome do evento').fill(state.eventName)
  await photographer.getByRole('button', { name: 'Criar evento' }).click()
  await expect(photographer.getByRole('heading', { name: state.eventName })).toBeVisible()

  // Photographer: register a new client and deliver the wristband
  await photographer.getByLabel('Cliente aceitou os termos (fotos + reconhecimento facial)').check()
  await photographer.getByRole('button', { name: 'Cadastrar nova cliente' }).click()
  await photographer.getByLabel('Nome completo').fill('Ana Teste')
  await photographer.getByLabel('Celular', { exact: true }).fill(state.clientPhone)
  await photographer.getByRole('button', { name: 'Cadastrar e entregar pulseira' }).click()
  const row = photographer.getByTestId('registration-row').filter({ hasText: 'Ana Teste' })
  await expect(row).toContainText('Pulseira entregue')

  // Photographer: upload two photos of Ana and one of someone else
  await photographer.getByRole('link', { name: 'Fotos e vídeos' }).click()
  await photographer.getByLabel('Escolher arquivos').setInputFiles([
    { name: 'ana-1.png', mimeType: 'image/png', buffer: ANA_PHOTO },
    { name: 'ana-2.png', mimeType: 'image/png', buffer: ANA_PHOTO },
    { name: 'outra.png', mimeType: 'image/png', buffer: OTHER_PHOTO },
  ])
  await expect(photographer.getByText('3 de 3 prontos')).toBeVisible({ timeout: 90_000 })

  // Client: universal link → event → name → wrong digits → right digits → payment notice
  const client = await browser.newPage()
  await client.goto('/')
  await client.getByRole('link', { name: new RegExp(state.eventName) }).click()
  await client.getByRole('link', { name: 'Ana T.' }).click()
  await client.getByLabel('Últimos 4 dígitos do celular').fill(last4 === '0000' ? '1111' : '0000')
  await client.getByRole('button', { name: 'Entrar' }).click()
  await expect(client.getByText('Os dígitos não conferem.')).toBeVisible()
  await client.getByLabel('Últimos 4 dígitos do celular').fill(last4)
  await client.getByRole('button', { name: 'Entrar' }).click()
  await expect(client.getByText('Pagamento ainda não confirmado pelo fotógrafo')).toBeVisible()
  await expect(client.getByRole('link', { name: 'Falar no WhatsApp' })).toHaveAttribute('href', /wa\.me\/5571999990000/)

  // Photographer: confirm payment
  await photographer.getByRole('link', { name: 'Pulseiras' }).click()
  await row.getByRole('button', { name: 'Confirmar pagamento' }).click()
  await expect(row).toContainText('Pago (manual)')
  await expect(row.getByRole('button', { name: 'Desfazer' })).toBeVisible()

  // Client: consent, send a photo and see only her two photos
  await client.reload()
  await client.getByLabel('Concordo com o uso do meu rosto para encontrar minhas fotos.').check()
  await client.getByLabel('Enviar foto').setInputFiles({ name: 'selfie.png', mimeType: 'image/png', buffer: ANA_SELFIE })
  await expect(client.getByRole('heading', { name: 'Suas fotos' })).toBeVisible({ timeout: 30_000 })
  await expect(client.getByText('2 fotos e 0 vídeos')).toBeVisible()

  // Client: download everything as a ZIP
  await client.getByRole('button', { name: 'Selecionar tudo' }).click()
  const [download] = await Promise.all([
    client.waitForEvent('download'),
    client.getByRole('button', { name: 'Baixar ZIP' }).click(),
  ])
  expect(download.suggestedFilename()).toBe('fotofacil.zip')

  // Photographer: the client has seen her photos, so undo is no longer offered
  await photographer.reload()
  await expect(row).toContainText('Pago (manual)')
  await expect(row.getByRole('button', { name: 'Desfazer' })).toHaveCount(0)
})
