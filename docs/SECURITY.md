# Segurança — AUVRYN 1.11.2

- Firebase Authentication identifica cada usuário.
- Dados pessoais permanecem isolados por UID no Firestore.
- Study Circles só podem ser lidos por membros.
- Convites não podem ser listados publicamente; são consultados pelo código.
- Materiais do grupo são links externos: a privacidade do arquivo também depende das permissões configuradas no serviço de origem (ex.: Google Drive).
- O AUVRYN não exige Cloud Storage para os grupos nesta versão.
