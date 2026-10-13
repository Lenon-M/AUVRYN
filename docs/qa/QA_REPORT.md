# QA — AUVRYN 1.11.2

Verificações estruturais concluídas:

1. Study Circle possui botão de Configurações do grupo.
2. Proprietário pode editar nome/descrição.
3. Proprietário pode arquivar e reativar; convite é pausado enquanto arquivado.
4. Grupo arquivado fica em seção separada e bloqueia novas mensagens, sessões, desafios e materiais na interface.
5. Membro não proprietário pode sair do grupo.
6. Somente proprietário vê a ação de exclusão permanente.
7. Exclusão exige digitar o nome do grupo.
8. Exclusão percorre posts, sessões, desafios, materiais e membros antes de excluir o documento raiz.
9. Exclusão remove o convite e os documentos `circleMemberships` dos membros.
10. Firestore Rules permitem ao proprietário excluir memberships dos membros e impedem novas atividades em grupo arquivado.
11. `features-20.js` e `app.js` passaram em `node --check`.
12. `server.py` passou em `py_compile`.

Teste real recomendado: criar um grupo com duas contas, sair com a segunda conta, arquivar/reativar com a conta criadora e finalmente excluir um grupo de teste.
