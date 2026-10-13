# Ativar o AUVRYN Assistant (IA)

O AUVRYN 1.11 já funciona com um organizador local para frases simples. Para liberar a interpretação generativa com Gemini, ative **Firebase AI Logic** no mesmo projeto Firebase do AUVRYN.

## No Firebase Console
1. Abra o projeto `auryn-5de2f`.
2. Procure por **Firebase AI Logic** / **IA** e inicie a configuração.
3. Escolha **Gemini Developer API** para começar.
4. Mantenha **App Check** ativado quando o console solicitar.
5. Para testes locais (`localhost` / Desktop), siga o fluxo de depuração do App Check mostrado pelo próprio Firebase. Não coloque chaves privadas dentro do AUVRYN.

O arquivo `web/js/ai-provider.js` usa o SDK oficial Firebase AI Logic e o modelo configurado em `web/config/firebase-config.js` (`gemini-3.8-flash`). Se a IA online não estiver disponível, o app cai automaticamente para o organizador local e não perde a captura.

## Como falar com a IA
- `Tenho prova de Cardiologia dia 20 às 14h`
- `Preciso entregar o trabalho de Bioética sexta`
- `Todo dia quero beber 2 litros de água`
- `Crie projeto TCC para 30/11`
- `Adicione Duna na minha lista de livros`
- `Amanhã às 18h estudar arritmias por 40 minutos`

A IA sempre mostra uma **prévia** antes de gravar qualquer mudança.

## Importante sobre App Check
Para produção, preencha `appCheckSiteKey` com a chave pública reCAPTCHA Enterprise registrada no App Check. Para teste local, o Firebase recomenda usar o **debug provider** e registrar o token de depuração no Console. Não distribua um build com token de depuração e não publique esse token. O AUVRYN mantém `aiAppCheckDebug: false` por padrão.
