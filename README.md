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

`node --test tests/core.test.mjs`

Valida cálculos em centavos, juros, acréscimos, vencimentos, CPF, WhatsApp e mensagens. Testes transacionais no Supabase validaram gravação atômica, pagamento parcial, bloqueio de pagamento acima do saldo, bloqueio de cancelamento com pagamentos, estorno e remarcação de vencimentos, com rollback dos dados de teste.

## Identidade

A logo fornecida foi extraída com a ferramenta de imagem, preservando o monograma dourado e as letras prateadas. O ativo otimizado está em `painel/assets/logo.svg` (PNG incorporado). A interface usa preto, dourado e branco; a proposta para o cliente usa fundo claro para leitura e print.
