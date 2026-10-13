# AUVRYN 1.9 — ativar Study Circles e Move Circles

A versão 1.9 usa novas coleções compartilhadas do Cloud Firestore. Sem publicar as regras novas, o AUVRYN continua funcionando normalmente, mas **criar/entrar em Circles dará “permission-denied”**.

## Faça uma vez no Firebase

1. Abra seu projeto Firebase.
2. Vá em **Banco de dados → Cloud Firestore → Regras**.
3. Abra o arquivo `firestore.rules` que veio com o AUVRYN 1.9.
4. Copie **todo** o conteúdo.
5. Substitua as regras que estão no Firebase pelo conteúdo novo.
6. Clique em **Publicar**.

## O que essas regras protegem

- Dados pessoais continuam em `/users/{uid}` e só o próprio usuário pode ler/escrever.
- Um Circle só pode ser lido por pessoas que possuem um documento de membro naquele grupo.
- Convites só podem ser consultados pelo código exato; não é permitido listar todos os códigos.
- Sessões de estudo, check-ins e mensagens só podem ser criados pelo usuário autenticado que aparece como autor.
- O criador do grupo pode moderar conteúdo do próprio grupo.
- E-mail verificado continua obrigatório para dados compartilhados.

## Teste recomendado

1. Conta A cria um Study Circle e copia o código.
2. Conta B entra usando o código.
3. As duas contas devem ver membros/mensagens/sessões.
4. Conta C, sem convite, não deve conseguir ler o grupo.

Os Circles usam somente Firestore; **não é necessário ativar Firebase Storage ou plano Blaze** para grupos, mensagens, rankings e desafios de texto.
