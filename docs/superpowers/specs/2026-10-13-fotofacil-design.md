# FotoFácil — Especificação de design (v1)

> Resultado do brainstorming (caminho **arquitetural**). Todas as 6 partes do design foram aprovadas
> e esta especificação escrita foi aprovada em 2026-10-13. Próximo passo: plano de implementação.

## Contexto

Hoje o fotógrafo aborda as clientes no evento e entrega uma pulseira a quem quer fotos. No fim do dia ele cria um grupo de WhatsApp com todas elas e joga centenas de fotos lá. Cada uma precisa garimpar as próprias fotos, e isso não funciona.

O **FotoFácil** resolve isso com três peças:
- um site onde a cliente, depois de pagar, encontra as fotos e vídeos dela por **reconhecimento facial**;
- uma área para o fotógrafo cadastrar as clientes, controlar quem pagou e subir os arquivos;
- uma área para o dono da plataforma (admin) gerir os fotógrafos e cobrar a comissão dele sobre as vendas.

**Sucesso significa:**
- a cliente acha as fotos dela em segundos;
- o fotógrafo controla quem pagou;
- o admin sabe exatamente quanto receber de cada fotógrafo.

**Estado do repositório:** `matheuslsf13-maker/FotoFacil` está vazio (sem commits). O trabalho vai na branch `claude/lucid-galileo-3mnmwl`.

---

## 1. Decisões tomadas

| Tema | Decisão |
|---|---|
| Plataforma | Site responsivo (mobile-first), não é app de loja |
| Perfis | Admin (login), Fotógrafo (login criado pelo admin), Cliente (sem login) |
| Unidade de venda | **Por evento**. O evento tem 1 ou mais dias. 1 pulseira + 1 pagamento = todas as fotos e vídeos dela no evento. |
| Pagamento | **PIX automático via Asaas com split** + **confirmação manual** pelo fotógrafo |
| Comissão do admin | Configurável **por fotógrafo**: percentual ou valor fixo por venda |
| Identificação da cliente | **Link universal** → lista de eventos ativos → lista de nomes ("Ana S.") → 4 últimos dígitos do celular |
| Prévia antes de pagar | **Não**. Sem pagamento, só aparecem o aviso e os botões de PIX e WhatsApp. |
| Qualidade | Otimizada no navegador antes do upload (lado maior com ~3000px, 1 a 2 MB) |
| Reconhecimento facial | **AWS Rekognition** (us-east-1), com uma coleção de rostos por evento |
| Vídeos | Quadros extraídos no navegador (1 por segundo, máx. ~120) e indexados como imagens |
| Exclusão | O admin define o prazo padrão e o prazo máximo. O fotógrafo ajusta por evento dentro do máximo. Exclusão manual: admin (qualquer evento) e fotógrafo (só os dele). |
| Volume inicial | Pequeno: 1 a 5 fotógrafos, até ~1.000 fotos por evento |
| Entrega | Fase 1 com tudo exceto o PIX automático. Fase 2 com o PIX Asaas e o split. |

## 2. Arquitetura

### Peças
- **Next.js (App Router, TypeScript, Tailwind) na Vercel:**
  - as telas das três áreas;
  - as rotas de servidor que falam com o Rekognition e o Asaas (chaves só no servidor).
- **Supabase:**
  - **Postgres com RLS:** banco de dados com regras de acesso por linha;
  - **Auth (e-mail e senha):** login do admin e dos fotógrafos;
  - **Storage:** bucket **privado** para fotos e vídeos;
  - **pg_cron + pg_net:** tarefas agendadas que chamam rotas protegidas do site.
- **AWS Rekognition** (`@aws-sdk/client-rekognition`): uma coleção por evento, com `IndexFaces`, `DetectFaces`, `SearchFacesByImage`, `DeleteFaces` e `DeleteCollection`.
- **Asaas API v3 (Fase 2):** subconta por fotógrafo, cobrança PIX com split e webhooks.
- **Bibliotecas:**
  - `libphonenumber-js`: normaliza o celular para o formato internacional (E.164);
  - `exifr`: lê a data gravada pela câmera;
  - `browser-image-compression` ou canvas próprio: compressão;
  - `client-zip`: gera o ZIP no navegador.

### Rotas (telas)
- **Cliente (sem login):**
  - `/`: lista de eventos ativos (foto do fotógrafo, nome do evento, data; os mais recentes primeiro). É o **link universal**, e o QR code da pulseira aponta para ele.
  - `/e/[slug]`: capa do evento ("disponível até dd/mm") e lista de nomes com busca.
  - `/e/[slug]/acesso`: 4 dígitos. Depois disso: aviso de pagamento (PIX/WhatsApp) **ou** consentimento + selfie/upload.
  - `/e/[slug]/minhas-fotos`: galeria.
- **Fotógrafo:**
  - `/fotografo`: meus eventos.
  - `/fotografo/eventos/[id]`: abas Pulseiras, Fotos e vídeos, Configurações.
  - `/fotografo/perfil`.
- **Admin:**
  - `/admin`: painel.
  - `/admin/fotografos`, `/admin/clientes`, `/admin/eventos`, `/admin/fechamentos`, `/admin/configuracoes`.
- **Páginas legais:** `/termos` e `/privacidade`.

### Sessão da cliente
Depois de acertar os 4 dígitos, o servidor grava um cookie httpOnly assinado com o `registration_id`, válido por 30 dias. Todas as rotas da cliente validam esse cookie no servidor.

## 3. Modelo de dados

Valores em dinheiro são guardados em centavos (`*_cents`).

- **`settings`** (uma linha só):
  - `default_retention_days`, `max_retention_days`
  - `default_commission_type`, `default_commission_value`
  - `face_match_threshold` (padrão 90, para calibrar no piloto)
  - `daily_search_limit` (padrão 10)
- **`profiles`** (`id` = auth.users.id): `role` (`admin` | `photographer`).
- **`photographers`:**
  - dados: `profile_id`, `name`, `photo_path`, `whatsapp`, `default_price_cents`, `active`
  - comissão: `commission_type` (`percent` | `fixed`), `commission_value` (percentual em pontos-base ou centavos)
  - Fase 2: `asaas_account_id`, `asaas_wallet_id`, `asaas_api_key_encrypted`
- **`clients`:** `full_name`, `phone_e164` (**UNIQUE**), `created_by`. O cadastro é compartilhado entre fotógrafos.
- **`events`:**
  - `photographer_id`, `name`, `slug` (único), `start_date`, `end_date`, `price_cents`
  - `retention_days` e `expires_at` (= `end_date` + `retention_days`)
  - `status` (`active` | `expired`) e `rekognition_collection_id`
- **`registrations`** (a pulseira):
  - vínculo: `event_id`, `client_id`, com **UNIQUE(event_id, client_id)**
  - entrega: `terms_accepted_at`, `delivered_at`, `delivered_by`, `price_cents` (preço congelado na entrega)
  - situação: `status` (`wristband` | `paid`)
  - pagamento: `payment_method` (`manual` | `pix`), `paid_at`, `confirmed_by`, `commission_cents` (congelada no pagamento)
  - controle: `first_access_at` (primeira busca facial; **trava o desfazer**), `last_search_at`, `settlement_id`
- **`registration_log`:** `registration_id`, `action`, `actor_id`, `created_at`.
  - Ações: `delivered`, `confirmed_manual`, `undone`, `paid_pix`, `refunded`, `admin_undo`.
- **`media`:**
  - `event_id`, `type` (`photo` | `video`), `storage_path`, `thumb_path`
  - `taken_on` (data da câmera; se não houver, a data do upload; o fotógrafo pode editar)
  - `width`, `height`, `duration_s`
  - `status` (`processing` | `ready` | `error`), `attempts`, `error_msg`, `created_at`
- **`media_faces`:** `rekognition_face_id` (PK), `media_id`, `event_id`.
- **`client_matches`:** `registration_id`, `media_id`, `hidden` ("não sou eu"), `matched_at`.
- **`search_log`:** `registration_id`, `created_at`. Serve para o limite diário.
- **`payments`** (Fase 2):
  - `registration_id`, `asaas_payment_id` (UNIQUE), `value_cents`, `commission_cents`, `status`
  - `pix_copy_paste`, `pix_qr_base64`, `expires_at`, `paid_at`
- **`settlements`:**
  - escopo: `photographer_id`, `period_type` (`event` | `month`), `event_id` ou `month`
  - totais: `sales_count`, `total_sales_cents`, `commission_pix_cents` (já recebida), `commission_manual_cents` (**a cobrar**)
  - situação: `status` (`open` | `paid`), `paid_at`

**RLS (quem acessa o quê):**
- O fotógrafo lê e escreve só os eventos, pulseiras e mídias dele.
- O admin acessa tudo.
- A cliente não acessa o banco direto: tudo passa por rotas de servidor que validam o cookie.

## 4. Regras de negócio

1. **Celular é a identidade da cliente.** Ele é normalizado para E.164 e é único. A busca do fotógrafo mostra o nome e o celular mascarado (`(71) 9****-4321`).
2. **Uma pulseira por cliente por evento.** Entregar a pulseira exige marcar "Cliente aceitou os termos (fotos + reconhecimento facial)".
3. **O preço é congelado na entrega da pulseira.** Mudar o preço do evento só afeta pulseiras novas.
4. **A comissão é congelada no pagamento**, com a regra do fotógrafo naquele momento:
   - percentual: `round(price × %)`;
   - fixa: `min(valor, price)`.
5. **PIX automático:** a comissão já foi recebida pelo split. **Manual:** a comissão fica **a cobrar** no fechamento.
6. **Desfazer confirmação manual:**
   - o fotógrafo só pode desfazer se `first_access_at` estiver vazio, ou seja, se a cliente ainda não fez a busca facial;
   - depois disso, só o admin desfaz;
   - um PIX automático nunca é desfeito pelo fotógrafo (estorno é feito pelo admin no Asaas).
   - Tudo fica registrado em `registration_log` e é visível no admin.
7. **Pagamento em dobro:** se a cliente já está paga por um meio e chega um pagamento pelo outro, o primeiro vale e o segundo fica sinalizado para o admin revisar.
8. **Uma venda só entra em um fechamento.** Fechamentos `paid` não mudam. Um estorno remove a venda de um fechamento `open`.
9. **Busca facial:** só para pulseiras `paid`, com no máximo `daily_search_limit` buscas por dia.
10. **4 dígitos do celular:** no máximo 5 tentativas erradas a cada 15 minutos, por pulseira e por IP.
11. **Lista de nomes:** mostra "Primeiro nome + inicial do sobrenome". Nomes repetidos aparecem todos, e os 4 dígitos desempatam.

## 5. Fluxos

### Fotógrafo
- **Criar evento:** nome, data de início e fim, preço (vem do padrão dele) e prazo de exclusão (vem do padrão do admin, limitado ao máximo).
- **Aba Pulseiras:**
  - busca por nome ou celular → **Entregar pulseira**;
  - se não encontrar → **Cadastrar nova** (nome completo + celular) → a pulseira sai entregue;
  - lista com situação e filtro, botões **Confirmar pagamento** e **Desfazer** (este só aparece quando permitido);
  - contadores: pulseiras, pagas e R$ vendido.
- **Aba Fotos e vídeos:**
  - upload em lote (arrastar a pasta ou escolher no celular) com fila, progresso e 3 tentativas automáticas;
  - grade com filtro por dia, edição do dia, excluir selecionadas e excluir o evento;
  - aviso 3 dias antes de expirar.
- **Perfil:** nome, foto, WhatsApp e preço padrão. A comissão aparece só para leitura.

### Cliente
`/` → escolhe o evento → escolhe o nome → 4 dígitos → então:
- **Não pagou:**
  - aviso "Pagamento ainda não confirmado pelo fotógrafo" com o valor;
  - **Pagar com PIX** (Fase 2: CPF → QR code e copia-e-cola → a tela libera sozinha);
  - **Falar no WhatsApp:** `wa.me` com mensagem pronta ("Oi, sou {nome} do evento {evento}…").
- **Pagou:**
  1. marca o consentimento facial;
  2. **Tirar selfie** (câmera frontal com moldura oval e dicas de enquadramento e luz) ou **Enviar foto**;
  3. galeria.
- **Galeria:**
  - filtros: Todos, Fotos, Vídeos, e por dia;
  - seleção: tudo, dia inteiro ou uma a uma;
  - **Salvar na galeria** (Web Share API com arquivos, em lotes) e **Baixar ZIP** (gerado no navegador, até 200 arquivos por ZIP);
  - **"Não sou eu"** esconde uma foto;
  - **"Buscar fotos novas"** aparece quando existe mídia mais recente que `last_search_at`.

### Admin
- **Painel do mês:** vendas, total faturado, comissão já recebida (PIX), comissão a cobrar (manual) e alertas (confirmações desfeitas, pagamentos em dobro).
- **Cadastros:**
  - **fotógrafos:** criar e editar (e-mail, senha inicial, nome, foto, WhatsApp, preço, comissão, ativo); na Fase 2, também "Criar subconta Asaas";
  - **clientes:** criar, editar e buscar;
  - **eventos:** todos, com exclusão manual.
- **Fechamentos:** escolher fotógrafo + (evento | mês) → prévia → gerar → marcar **Pago**.
- **Configurações:** prazos, comissão padrão, nível mínimo de semelhança e limite de buscas.

## 6. Reconhecimento facial

- **Upload (navegador):**
  - lê o EXIF → comprime para ~3000px (JPEG ~85%) → gera miniatura de 400px → sobe para o Storage por URL assinada;
  - **vídeo:** sobe o arquivo, gera a capa e extrai quadros de 1280px (1/s, máx. 120) para `frames/{media_id}/`;
  - se o navegador não conseguir decodificar o vídeo (ex.: HEVC), o vídeo sobe sem reconhecimento e o fotógrafo é avisado.
- **Indexação (servidor):**
  - `POST /api/media/{id}/process` baixa a imagem do Storage e chama `IndexFaces` na coleção do evento (`ExternalImageId = media_id`);
  - grava `media_faces` e marca `ready`;
  - vídeos são processados em lotes de quadros, e os quadros são apagados depois;
  - a coleção é criada junto com o primeiro upload do evento.
- **Novas tentativas:** um pg_cron a cada 10 minutos chama a rota de retry para `processing` parados ou `error` com `attempts < 3`.
- **Busca:**
  - `DetectFaces` exige exatamente 1 rosto nítido;
  - `SearchFacesByImage` na coleção do evento, com `FaceMatchThreshold = settings.face_match_threshold` e MaxFaces alto;
  - os face_ids viram media_ids, que são gravados em `client_matches`; `first_access_at` e `last_search_at` são atualizados;
  - **a selfie nunca é gravada.**
- **Entrega dos arquivos:** URLs assinadas do Storage com validade curta (~10 minutos), geradas só para mídias em `client_matches` da pulseira paga do cookie.

## 7. Pagamentos (Fase 2: Asaas)

- **Subconta:** o admin clica em "Criar subconta Asaas" e o sistema chama `POST /v3/accounts`, guardando `walletId` e `apiKey` (criptografada). O fotógrafo completa a aprovação (KYC) no Asaas.
- **Cobrança:**
  - gerada **na subconta do fotógrafo** (com a apiKey dele): customer (nome, celular, **CPF**) + payment `billingType=PIX`, `value=price`;
  - split: `[{ walletId: admin, fixedValue: commission }]`, sempre `fixedValue` calculado pelo sistema, porque o percentual do Asaas incide sobre o valor líquido;
  - a taxa do Asaas fica na subconta do fotógrafo.
- **Confirmação:**
  - o webhook `PAYMENT_RECEIVED` / `PAYMENT_CONFIRMED` em `/api/webhooks/asaas` valida o token e é **idempotente** por `asaas_payment_id`; a pulseira vira `paid` (`pix`);
  - a tela da cliente também consulta o status a cada ~5 segundos.
- **Estorno:** feito no painel do Asaas. O webhook `PAYMENT_REFUNDED` volta a pulseira para `wristband` e tira a venda de um fechamento `open`. O split é revertido pelo Asaas.

## 8. Exclusão

- **Expiração:** `expires_at = end_date + retention_days`. A cliente vê "disponível até dd/mm".
- **Exclusão automática:** um pg_cron diário (madrugada) chama `/api/cron/expire`. Para cada evento vencido:
  - apaga os arquivos do Storage;
  - chama `DeleteCollection`;
  - marca as mídias como excluídas e o evento como `expired`.
- **Exclusão manual:** o fotógrafo (eventos dele) ou o admin (qualquer evento) exclui mídias selecionadas, com `DeleteFaces` e remoção no Storage, ou o evento inteiro.
- **Nunca são apagados:** clientes, pulseiras, pagamentos, fechamentos e logs.

## 9. Segurança e LGPD

- Bucket privado, URLs assinadas curtas, RLS e segredos (AWS, Asaas, service role) só no servidor.
- Limites: 4 dígitos (regra 10), buscas por dia (regra 9) e webhook com token.
- **Consentimento:**
  - na entrega da pulseira (fotógrafo marca);
  - antes da selfie (cliente marca, com o texto: finalidade, selfie não guardada, processamento pela AWS fora do Brasil, exclusão no fim do prazo).
- Páginas `/termos` e `/privacidade`. **Recomendação: revisão por advogado antes do lançamento.**

## 10. Erros (comportamento esperado)

| Situação | Comportamento |
|---|---|
| Upload falha | 3 tentativas automáticas, depois `Erro` com "Tentar de novo" |
| Rekognition fora do ar | Fica `processing`, o retry do cron resolve |
| Selfie com 0 ou 2+ rostos | "Fique sozinha na moldura, com o rosto bem iluminado" |
| Nenhuma foto encontrada | Sugere outra selfie + botão WhatsApp |
| Webhook atrasado ou duplicado | A tela consulta sozinha; idempotência por `asaas_payment_id` |
| Evento expirado | "As fotos deste evento ficaram disponíveis até dd/mm" |

## 11. Testes

- **Vitest (unitários):** cálculo de comissão, transições de situação, regra do desfazer, totais de fechamento, cálculo de expiração, normalização do celular e formato "Ana S.".
- **Integração com Supabase local:** políticas RLS (fotógrafo A não vê os dados de B; cliente sem pagamento não recebe URL).
- **Mocks** de Rekognition e Asaas nos testes. Teste manual no **sandbox do Asaas** na Fase 2.
- **Playwright E2E:**
  - fotógrafo: cria evento → entrega pulseira → sobe fotos → confirma pagamento;
  - cliente: link universal → nome → 4 dígitos → upload de foto (no lugar da câmera) → galeria → download.
- **Piloto real** com um fotógrafo e um evento para calibrar `face_match_threshold`.

## 12. Fora do escopo (v1)

App de loja, prévia antes do pagamento, cobrança por dia, envio automático de mensagens de WhatsApp (exigiria API paga), página própria por fotógrafo e notificações por e-mail para a cliente.

## 13. Pontos a confirmar na implementação

- O Asaas exige CPF do pagador na cobrança PIX? (Assumido que sim.)
- Os preços atuais do Rekognition (referência de 2021: ~US$ 0,001 por imagem) e se a região sa-east-1 tem Rekognition (assumido us-east-1).
- Os parâmetros exatos da API de subcontas do Asaas.

---

## Próximos passos

- Gerar o plano de implementação detalhado da Fase 1 (e depois da Fase 2) a partir desta especificação. O plano é revisado e o modo de execução é escolhido antes de qualquer código.

## Verificação (do resultado final da implementação)

- `npm run lint`, `npm run typecheck` e `npm test` (Vitest) passando.
- Supabase local (`supabase start`) com migrations aplicadas e testes de RLS passando.
- Playwright E2E dos fluxos do fotógrafo e da cliente passando com mocks.
- Teste manual com fotos reais num projeto Supabase e numa conta AWS de teste: subir ~50 fotos com 3 pessoas, fazer selfie de cada uma e conferir quantas fotos foram encontradas.
- Fase 2: pagamento PIX no sandbox do Asaas liberando a cliente sozinho e split registrado.
