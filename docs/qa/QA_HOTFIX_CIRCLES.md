# QA — Hotfix Circles 1.10.1

Cenário corrigido:
1. Conta A cria/abre um Study Circle.
2. Usuário troca para Conta B na mesma origem local.
3. Conta B abre Faculdade → Grupos de estudo.
4. O AUVRYN limpa o `studyCircleId` herdado e carrega apenas `users/{uid}/circleMemberships` da Conta B.
5. Se um ID antigo/inacessível aparecer, `queueCircleLoad` limpa a seleção e retorna à lista, sem loop de renderização.

Validações estruturais:
- seleção de Study/Move Circle é limpa em `onAuthStateChanged`;
- sessão de estudo local antiga é removida na troca de conta;
- erro de permissão em detalhe do Circle limpa a seleção;
- regras Firestore permanecem inalteradas.
