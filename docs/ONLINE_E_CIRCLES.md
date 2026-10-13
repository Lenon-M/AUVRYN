# Como funciona o online — AUVRYN 1.11.2

Study Circles usam Firebase Authentication + Cloud Firestore.

- Cada usuário entra com uma conta verificada e recebe um UID.
- Dados pessoais continuam em `/users/{uid}` e não são compartilhados com o grupo.
- Um Circle possui membros, sessões de estudo, mensagens, desafios e materiais por link.
- Somente membros conseguem ler o conteúdo do Circle.
- Membros podem sair removendo apenas o próprio vínculo.
- O criador pode arquivar/reativar o grupo.
- Arquivado: histórico permanece visível, convite é pausado e novas atividades ficam bloqueadas.
- O criador pode excluir permanentemente; o app limpa conteúdo compartilhado, convite e memberships antes de apagar o grupo.

Não é necessário Cloud Storage para os Study Circles desta versão.
