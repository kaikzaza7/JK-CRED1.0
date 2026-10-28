# JK CRED — Painel administrativo

Painel privado de gestão de clientes, empréstimos, parcelas e recebimentos. Sem área do cliente, cadastro público ou tela de login dentro do app. A autenticação é feita pela proteção da Vercel.

## Produção

- Projeto Vercel: `jk-cred-admin`.
- Código publicado: diretório `painel` (framework Other, sem etapa de build).
- **Vercel Authentication deve permanecer ligada em TODOS os deployments e domínios**, inclusive produção. O backend confia nessa barreira de acesso. Nunca desative a proteção para tornar uma URL acessível.
- As três variáveis em `painel/.env.example` são exclusivas do servidor. O token de acesso ao gateway existe apenas nas variáveis de produção da Vercel; o banco armazena seu hash SHA-256. Previews não recebem credencial de produção.
- Nenhuma chave service role ou segredo é entregue ao navegador ou versionado.
- Acesso para colaboradores deve ser concedido pelo proprietário na Vercel. Todos os registros do painel são atribuídos à administração JK CRED, com histórico de data e operação; não há identificação individual de operadores dentro do app.

## Recursos

Dashboard com carteira, saldos, recebimentos, atrasos, gráficos de seis meses e próximos vencimentos. Cadastro com CPF validado, telefone E.164 do Brasil, nascimento, e-mail e endereço. Arquivamento de clientes preserva contratos. Nova adesão salva cadastro, contrato e parcelas atomicamente e retorna mensagem pronta para copiar ou abrir no WhatsApp. Calculadora com proposta própria para print e impressão/PDF. Datas semanais, quinzenais, 21 dias, 30 dias, mensais ou intervalo personalizado, com edição individual. Pagamentos parciais, estornos justificados, cancelamento sem pagamentos ativos e renegociação de datas. Preferências financeiras, modelo editável da mensagem e exportação CSV com proteção contra fórmulas.

## Regra financeira

`juros = arredondar(valor_em_centavos × taxa_em_basis_points / 10000)`

`total = principal + juros + acréscimo × (quantidade_de_parcelas − 1)`

O total é dividido em centavos inteiros; a diferença de arredondamento fica na última parcela. A primeira parcela não gera acréscimo. Os acréscimos integram o total e são distribuídos na divisão, como no exemplo solicitado. Não há capitalização mensal nem multa automática por atraso.

Exemplo: R$200, 30%, 3 parcelas, R$10 de acréscimo → R$60 de juros + R$20 de acréscimos → R$280. Parcelas de R$93,33, R$93,33 e R$93,34. Encargo total de 40% sobre o valor liberado.

## Banco

Migrações em `database/administrative_panel.sql` e `database/private_gateway.sql`. A migração é aditiva: copia perfis legados para contatos e preserva o banco anterior. Os dados financeiros novos usam `jk_clients`, `jk_loans`, `jk_installments`, `jk_receipts`, `jk_preferences` e `jk_events`, todos com RLS. Escritas passam por funções que verificam a administração, validam valores no banco e mantêm trilha de auditoria. Segredos ficam em schema privado, fora da Data API. Datas operacionais são exibidas no fuso America/Sao_Paulo.

Após provisionar um novo ambiente, gere uma credencial aleatória de alta entropia e insira **somente o hash** e o ID do administrador em `jk_private.server_config`; cadastre a credencial original na Vercel. Não use a base de produção em desenvolvimento compartilhado.

## Testes

`node --test tests/*.test.mjs`

Valida cálculos em centavos, juros, acréscimos, vencimentos, CPF, WhatsApp e mensagens. Testes transacionais no Supabase validaram gravação atômica, pagamento parcial, bloqueio de pagamento acima do saldo, bloqueio de cancelamento com pagamentos, estorno e remarcação de vencimentos, com rollback dos dados de teste.

## Identidade

A logo fornecida foi extraída com a ferramenta de imagem, preservando o monograma dourado e as letras prateadas. O ativo otimizado está em `painel/assets/logo.svg` (PNG incorporado). A interface usa preto, dourado e branco; as propostas para o cliente usam o modelo de documento preto e dourado.

## Propostas em imagem e aparência

A calculadora e a nova adesão exibem uma arte preta e dourada preenchida com os dados atuais. `Baixar JPEG` exporta em 1080 pixels de largura. `Compartilhar JPEG` abre o compartilhamento de arquivos do dispositivo quando disponível; caso contrário, baixa a imagem e orienta a anexá-la ao WhatsApp. O botão `WhatsApp (texto)` continua preparando somente a mensagem, sem enviar automaticamente. A imagem é gerada no navegador, sem upload dos dados da proposta.

As mensagens de simulação e adesão usam emojis Unicode e preenchem dados, datas e valores automaticamente, com codificação compatível com o link do WhatsApp. Modelos de adesão personalizados salvos pela administração são preservados.

Em Configurações → Aparência, os modos claro e escuro são lembrados por navegador. O tema é aplicado antes de a interface carregar e não altera a identidade da arte do cliente.


## Repasse societário

A aba `#/society` mantém dois perfis financeiros fixos: **Juan Kelvin** (1) e **Kaik Andrade** (2). A divisão inicial é 50% / 50%; a regra pode ser alterada na própria aba, sempre com soma de 100%.

Cada recebimento, inclusive parcial, cria sua divisão no banco na mesma transação do pagamento. A porcentagem é guardada naquele recebimento: mudar a regra não recalcula o histórico. A base padrão é o valor total recebido, incluindo devolução do capital e encargos; os totais societários não são lucro líquido. Um ajuste individual pode reservar parte do recebimento fora da divisão e alterar as porcentagens sem exigir justificativa. As alterações continuam registradas no histórico de auditoria.

Os perfis mostram total atribuído, repasses já lançados e saldo. `Registrar repasse` lança um valor efetivamente pago ao sócio, com data, forma, referência e observações; não executa operação bancária. Pode ser parcial, tem identificador idempotente e é limitado ao saldo disponível, conferido no banco com bloqueio da regra para evitar repasses concorrentes acima do saldo.

Estornos de recebimentos retiram o crédito dos sócios e preservam repasses anteriores. Se isso deixar saldo negativo, o perfil mostra o valor a compensar; novos créditos reduzem a diferença. Estornar um repasse devolve o valor ao saldo e preserva seu registro. As tabelas acompanham origem dos créditos, repasses e resumo por cliente, com filtros e exportação CSV. A aba sincroniza automaticamente a cada 30 segundos quando visível.

Migrações: `database/20261024145740_society_repasses.sql`, `database/20261024160842_society_percentages_without_justification.sql` e `database/20261024162409_society_validate_rule_inside_gateway.sql`. A atualização das porcentagens usa escopo explícito para os dois sócios, compatível com a proteção `safeupdate` da API. As quatro tabelas têm RLS e leitura apenas para administradores. Novas funções de escrita ficam no schema privado e são chamadas somente pelo gateway protegido. Os testes em `tests/society.database.sql` verificam as operações e RLS em transação com rollback, sem manter cadastros ou lançamentos de teste.

A validação da soma das porcentagens é imediata, ao fim do único UPDATE que atualiza os dois sócios dentro da operação autorizada. O gatilho continua como `SECURITY INVOKER`: não há novas permissões de tabela nem acesso direto para `anon`. O gatilho adiado anterior tentava ler a tabela depois que o gateway retornava ao papel `anon`, causando `permission denied`.

O teste transacional `tests/society.gateway.database.sql` usa `SET LOCAL ROLE anon` e chama o mesmo `public.jk_gateway` utilizado pela API, incluindo a etapa de validação após o retorno. Verifica gravação e releitura de 90/10, recebimento, ajuste sem justificativa, repasse, estornos e bloqueios de escrita direta e token inválido. Um token aleatório existe apenas na transação de teste; o rollback restaura a configuração e remove todos os lançamentos.


## Fundo de caixa

A aba `#/cash` registra o dinheiro disponível. O controle começa em zero, sem reaplicar os contratos e recebimentos anteriores à instalação. A administração informa o saldo disponível hoje em **Definir saldo inicial**; novos aportes podem identificar Juan Kelvin, Kaik Andrade ou outra origem e não mudam a participação societária.

Cada nova adesão debita apenas o principal liberado, na mesma transação do cliente, contrato e parcelas. Recebimentos posteriores à instalação, inclusive parciais e de contratos antigos, creditam o caixa. Repasses societários debitam o caixa e o saldo do sócio. Outras despesas e retiradas podem ser registradas como saídas manuais. Novos empréstimos podem ser cadastrados com caixa zerado, insuficiente ou negativo. O principal é sempre descontado do saldo, aumentando o negativo quando necessário. Repasses e saídas manuais continuam limitados ao saldo disponível, com verificação no banco sob bloqueio da conta.

Cancelamentos e estornos criam movimentos no sentido contrário quando a operação original tem lançamento no caixa. Operações anteriores ao início do controle não geram devoluções fictícias. Estornos preservam o extrato e podem revelar saldo negativo; esse déficit fica visível e não impede cadastrar novos empréstimos. Somente movimentos manuais podem ser estornados pela aba de caixa; contratos, recebimentos e repasses são corrigidos em suas telas de origem.

A dashboard inclui saldo disponível, entradas e saídas do mês, evolução do saldo após as últimas 20 movimentações e fluxo de caixa mensal. Os gráficos anteriores da carteira continuam disponíveis. O extrato tem filtros, busca e exportação CSV, com o saldo após cada lançamento calculado sobre todo o histórico. A atualização automática preserva os filtros e o foco.

`jk_cash_account` mantém o saldo e `jk_cash_entries` guarda o extrato em centavos inteiros e sequência monotônica. A leitura de saldo e lançamentos usa uma única consulta em `jk_cash_snapshot`, evitando versões diferentes na tela. A data de caixa corresponde ao registro da movimentação no fuso `America/Sao_Paulo`; datas financeiras retroativas continuam nos contratos e recebimentos originais. As duas tabelas têm RLS, escrita direta negada a `anon`/`authenticated` e funções privadas `SECURITY INVOKER`, acessíveis somente pelo gateway autorizado. Os gatilhos são imediatos; o bloqueio segue a ordem configuração societária → conta de caixa.

Migração: `database/20261024170133_cash_fund_and_automatic_movements.sql`. Testes: `tests/cash.test.mjs` e `tests/cash.database.sql`, além dos testes societários atualizados. O teste SQL usa o papel real `anon` e o gateway público, confirma idempotência, saldo insuficiente, estornos, cancelamento, conciliação e RLS e faz rollback de todos os dados de teste. Os lançamentos são registros de controle e não transferências bancárias.

A administração também pode autorizar uma inclusão pontual dos empréstimos anteriores no caixa. `database/import_existing_loans_into_cash.sql` registra o principal dos contratos não cancelados que ainda não têm débito no extrato, preserva os demais lançamentos e permite saldo negativo nessa inclusão. A execução é auditada e idempotente; a regra atual permite também novas liberações com saldo negativo. O script é operacional e não roda automaticamente nas migrações.

O formulário de adesão mostra o saldo previsto após liberar o principal e permite confirmar o cadastro mesmo quando esse saldo é negativo. A permissão vale também para um novo cliente e é aplicada no banco; não exige aporte nem confirmação adicional.

A permissão de empréstimos com caixa negativo está em `database/20261024173443_allow_loans_with_negative_cash.sql`. O teste de banco cobre cliente novo em déficit, repetição idempotente, recebimento parcial no negativo, liberação acima do saldo, aumento de déficit já existente e rollback de contrato com datas inválidas.


## Busca de endereço por CEP

Ao completar os 8 dígitos do CEP no cadastro ou na nova adesão, o painel consulta o ViaCEP e preenche rua, bairro, cidade e UF. Número e complemento permanecem manuais. O botão Buscar permite repetir a consulta. Um CEP geral pode informar somente cidade/UF; CEP inexistente, falha ou demora do serviço não impedem preencher o endereço manualmente.

A consulta passa por `lookup_cep` no gateway protegido da própria aplicação, mantendo a política de conexão do navegador. Apenas o CEP é enviado ao endereço fixo do ViaCEP; dados do cliente e credenciais internas não são encaminhados. O serviço tem timeout e valida a resposta. O navegador agrupa a digitação, reutiliza consultas bem-sucedidas e descarta respostas de um CEP anterior ou de um formulário já fechado. Alterações manuais feitas durante a consulta são preservadas. O envio do cadastro aguarda a consulta em andamento antes de montar os dados salvos e continua com os dados manuais em caso de falha.

A rua, bairro, cidade e UF retornados seguem o fluxo normal de gravação no banco. Nenhum cadastro existente é consultado ou alterado automaticamente ao abrir sua edição. Testes em `tests/cep.test.mjs` e `tests/gateway.test.mjs` verificam formato, CEP inexistente, falhas, CEP geral e ausência de dados/segredos na requisição externa.

## Notificações administrativas (Web Push)

Configurações → Notificações no celular: ativação individual por aparelho, nome, categorias, teste, desativação e histórico de 60 eventos. iPhone exige iOS 16.4+ e instalação na Tela de Início; Android depende de navegador compatível. O service worker não armazena páginas/dados financeiros offline. A proteção da Vercel continua em todos os endereços.

Lembretes de parcelas: 2 dias antes, amanhã, hoje e atrasos de 1, 3 e 7 dias; nome completo, número, saldo, data e contrato. Quitação, cancelamento e alteração de data são revalidados antes do envio. O clique abre o calendário na data. Empréstimos/recebimentos citam o cliente; aportes/repasses citam o sócio indicado. Aportes sem sócio são identificados como tal. Pagamentos são registros administrativos, sem confirmação bancária automática.

A outbox `jk_private.push_events` é transacional. `push_devices` e `push_deliveries` são privadas, com RLS e nenhum acesso direto de anon/authenticated. A RPC `jk_push_gateway` valida segredo de servidor e administrador. O histórico não expõe assinaturas. Endpoints Web Push são limitados aos provedores suportados, com validação das chaves no servidor.

Variáveis de produção: `JK_VAPID_PUBLIC_KEY`, `JK_VAPID_PRIVATE_KEY`, `CRON_SECRET`. Não rotacionar VAPID sem tratar assinaturas existentes. `vercel.json` agenda `/api/notification-cron` às 11h UTC (manhã brasileira; Hobby pode variar dentro da hora). O endpoint exige Bearer CRON_SECRET. Movimentações tentam despachar após o registro; o cron também processa a fila. Entrega depende de rede, provedor, permissões e aparelho; não comprova leitura. A fila usa unicidade por evento/aparelho, locks, leases, até 5 tentativas e desativação de endpoints 404/410. Tags estáveis reduzem duplicações em reentregas.

Verificação: `node --test tests/*.test.mjs` e `tests/notifications.database.sql` (rollback sob o papel anon, sem push real). Conferência no navegador: configurações, temas, celular, payload do service worker e clique. O aparelho físico deve ser confirmado pelo administrador com “Enviar teste”.

## Sinuca para os dois sócios

A aba `#/pool` tem uma mesa compartilhada para Juan Kelvin e Kaik Andrade. Cada um entra no próprio perfil. São 15 bolas numeradas, todas valendo 1 ponto (inclusive a preta). Encaçapar mantém a vez; errar ou encaçapar a branca passa a vez, sem pontuar pela branca. Ela é recolocada em um ponto livre. Ao terminar as bolas, vence o maior placar. Uma nova partida precisa dos dois votos, e quem inicia alterna entre partidas.

Mira: clique/toque e arraste na mesa, ou use a direção nos controles. Ajuste a força e pressione Dar tacada. Com foco na mesa, as setas ajustam direção/força e espaço dá a tacada. O botão Ampliar mesa ajuda no celular deitado. O placar e a partida são recuperados após recarregar. Use Sair da mesa para liberar o perfil. Um perfil sem contato por 2 minutos pode ser retomado em outro aparelho; as jogadas ficam pausadas enquanto falta um participante conectado.

`painel/pool/engine.mjs` contém a física determinística compartilhada. O servidor aceita apenas direção, força, versão e identificador da tacada: calcula as colisões/caçapas, placar e próximo turno. O cliente não envia resultados aceitos como verdade. As duas telas reproduzem a mesma tacada a partir de posições iniciais, força/direção e horário do servidor. A sincronização consulta somente a mesa, com intervalo adaptativo enquanto a aba está visível; não existe transmissão de dados financeiros no jogo.

A API `/api/pool` segue o acesso privado da Vercel e a validação de origem JSON do painel. A RPC `jk_pool_gateway` verifica o segredo existente do servidor e o administrador. Sala e lugares estão em `jk_private.pool_room` e `jk_private.pool_players`, com RLS e acesso direto revogado. O token aleatório de cada navegador identifica seu lugar apenas no jogo, é armazenado com hash no banco e nunca identifica ações financeiras. Os perfis são escolhidos pelos participantes autorizados. Locks, versões, bloqueio durante a animação e IDs de tacada impedem turnos simultâneos e repetições. Nenhum lançamento de caixa, empréstimo, recebimento ou repasse é criado pelo jogo.

Testes: `node --test tests/*.test.mjs`; `tests/pool.database.sql` valida o papel real anon, acesso inválido, lugares, bloqueio fora de turno, versões, idempotência, saída e confirmação de revanche em rollback. A física cobre encaçapamento, bola branca, colisões e vencedor. A conferência de navegador usa dois contextos independentes e um espectador.


### Mira compartilhada e previsão

O taco, a direção e a força do jogador da vez aparecem para os dois sócios e espectadores. Movimentos de ponteiro, teclado e controles usam a mesma fila: só a posição mais recente é enviada na próxima consulta, sem um pedido por pixel. A preparação da tacada sincroniza em intervalos de aproximadamente 220–300 ms, limitados também pela latência da rede; há interpolação curta para suavizar a mira remota e caminho angular curto ao atravessar ±180°. Espera e animação usam intervalos maiores. A consulta é suspensa com a aba oculta.

A RPC valida o lugar, o turno, a versão da partida, a fase sem movimento, os números de direção/força e a sequência do remetente. A mira tem revisão própria e não avança a versão da tacada; pacotes antigos da mesma sessão são ignorados. Saída, reinício ou tacada invalidam a mira anterior. Recarregar recupera a mira atual.

`pool/aim.mjs` calcula o primeiro contato considerando raios, caçapas, tabelas e força. A linha branca mostra apenas os primeiros 110 px da aproximação e um círculo marca a posição da branca no impacto. As setas ciano (branca após o contato) e dourada (bola atingida) são limitadas a 60 px. Só o primeiro segmento de cada direção é desenhado, sem revelar toda a trajetória ou suas reflexões. A previsão usa a mesma desaceleração e restituição da física, mas é uma ajuda aproximada.

Testes em `tests/pool-aim.test.mjs` verificam colisão direta e de lado, tabelas, caçapas, força insuficiente, bola mais próxima e validação do protocolo. `tests/pool-aim.database.sql` verifica o RPC anon em rollback, os dois sentidos de sincronização, versões, sequência, bloqueio fora da vez, limpeza da mira e preservação do fluxo de tacadas. Os testes de navegador usam mesa isolada com duas sessões e espectador, sem ocupar ou reiniciar a partida real.
