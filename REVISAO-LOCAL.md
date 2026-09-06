# Revisão local — 06/09/2026

Publicação autorizada em 06/09/2026. O aviso persistente de sincronização indisponível foi removido da interface. Os limites descritos abaixo continuam válidos.

## Implementado
- Recebimento parcial e quitação com taxas de cartão, saldo restante e proteção contra repetição.
- Situação de entrega separada do recebimento; marcar entregue sem lançar dinheiro.
- Cancelamento com devolução financeira, preservação dos lançamentos originais, custos efetivamente incorridos e retorno opcional ao estoque.
- Reagendamento e reaproveitamento da mensagem para WhatsApp.
- Resumo por mês do calendário e seleção de mês; histórico de ciclos anteriores preservado, sem reconstrução automática.
- Estoque disponível, reservado e falta produzir apresentados separadamente.
- Até cinco backups locais diários, download e histórico das novas operações financeiras/entrega.
- Atualizações remotas adiadas durante formulário aberto ou carrinho em uso; atualização manual em Configurações.
- Remoção das declarações duplicadas, proteção adicional de textos e cache atualizado para scripts locais.
- Ajustes gerais de tamanho dos campos e limites dos modais em telas pequenas.

## Validação
Passaram: verify-app.cjs, verify-integrity.cjs, verify-sale-costs.cjs, verify-payments.cjs e verify-operations.cjs. Verificados erros de sintaxe, diferenças de pagamentos, cartões, estoque insuficiente, repetição de estorno, custos históricos, quitação antes de entrega, retenção de taxas e limites mensais, inclusive fevereiro bissexto.

## Limites e próximos passos antes de publicar
- Não houve teste visual nem teste real em WhatsApp/celulares nesta revisão local.
- O documento único no Firebase e a resolução manual de conflitos foram mantidos. Migrar para registros independentes exige um projeto específico de migração e testes com cópia dos dados reais.
- Offline completo não está disponível: autenticação e dependências externas ainda precisam de conexão em certos fluxos.
- Backup local não protege contra perda do aparelho. Exportação externa permanece necessária.
- Vendas antigas mantêm a inferência legada dos estados e do custo; não foram inventados dados históricos.
- O histórico de alterações cobre as novas operações de pagamentos, cancelamentos, entregas e reagendamento, não todas as edições antigas.
- Nenhuma alteração ou correção retroativa foi aplicada aos dados reais da fábrica.

## Fechamento mensal — 06/09/2026

- Caixa, produção, metas e abertura dos relatórios compartilham o mês escolhido. Filtros personalizados continuam disponíveis nos relatórios.
- Relatórios > Fechamento mensal separa vendas pela data original do pedido, recebimentos/despesas pela data do lançamento e entregas pela confirmação. O saldo inicial vem dos lançamentos anteriores; resultado de caixa não representa lucro.
- Mês atual permite prévia; fechamento apenas de meses terminados e sem sincronização pendente. Revisões exigem motivo e preservam versões anteriores, com download JSON. IDs por mês/versão impedem mescla silenciosa de dois fechamentos simultâneos diferentes.
- Produções estornadas depois do mês continuam na prévia histórica. Cancelamentos posteriores respeitam a data local. Registros legados sem evidências suficientes geram avisos.
- Custo Real passa a considerar entrega confirmada, desconto proporcional, taxas e custo de ajudantes registrado. Custos originais ausentes ainda dependem do cadastro atual; parâmetros atuais de metas não são reconstrução contábil de meses antigos.
- Testes locais: verify-monthly-report, verify-app, verify-integrity, verify-sale-costs, verify-payments, verify-operations e verify-two-devices. A simulação de dois aparelhos não substitui a conferência nos celulares reais.
