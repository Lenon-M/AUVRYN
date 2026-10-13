# Atualizar as regras — AUVRYN 1.11.2

Esta atualização é necessária para o criador conseguir excluir um grupo por completo, inclusive os vínculos dos demais membros.

1. Firebase Console → projeto `auryn-5de2f`.
2. Banco de dados → Cloud Firestore → `(default)` → **Regras**.
3. Clique dentro do editor, pressione `Ctrl + A` e apague as regras antigas.
4. Copie todo o conteúdo do arquivo `firebase/firestore.rules` desta versão.
5. Cole no editor do Firebase.
6. Clique em **Publicar**.
7. Feche e reabra o AUVRYN 1.11.2.

Não é necessário ativar Cloud Storage nem plano Blaze.
