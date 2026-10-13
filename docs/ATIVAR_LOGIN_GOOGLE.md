# Ativar o login Google — AUVRYN 1.9

O botão Google depende de um projeto Firebase seu. O AUVRYN não pode receber credenciais genéricas, porque todos os usuários precisam pertencer ao seu próprio projeto.

## 1. Criar o projeto
1. Acesse o Firebase Console.
2. Clique em **Criar projeto**.
3. Dê um nome, por exemplo `AUVRYN`.
4. Conclua a criação.

## 2. Registrar o AUVRYN como app Web
1. Dentro do projeto, abra **Configurações do projeto > Geral**.
2. Em **Seus apps**, clique no ícone `</>` (Web).
3. Dê o nome `AUVRYN Web`.
4. Registre o app.
5. O Firebase mostrará um objeto `firebaseConfig`.

## 3. Ativar Google
1. Abra **Authentication**.
2. Clique em **Começar** se necessário.
3. Em **Sign-in method / Provedores**, escolha **Google**.
4. Ative o provedor.
5. Selecione um e-mail de suporte.
6. Salve.

## 4. Autorizar localhost para os testes
1. Em **Authentication > Settings / Configurações**.
2. Abra **Authorized domains / Domínios autorizados**.
3. Adicione `localhost`.

> Projetos Firebase criados após 28/04/2025 não incluem `localhost` automaticamente. Para uma publicação web real, use seu domínio HTTPS. O Google desaconselha `localhost` em produção.

## 5. Colar a configuração no AUVRYN
Abra `web/config/firebase-config.js` e substitua os campos vazios:

```js
window.AUVRYN_FIREBASE_CONFIG = {
  apiKey: "COLE_AQUI",
  authDomain: "SEU-PROJETO.firebaseapp.com",
  projectId: "SEU-PROJETO",
  storageBucket: "SEU-BUCKET",
  messagingSenderId: "COLE_AQUI",
  appId: "COLE_AQUI",
  appCheckSiteKey: ""
};
```

Não coloque `serviceAccount`, senha, chave privada ou JSON administrativo neste arquivo.

## 6. Testar
1. Feche a versão antiga do AUVRYN.
2. Abra novamente pelo launcher.
3. Na tela de login, o botão passa de **Google ainda não configurado** para **Continuar com Google**.
4. Clique nele e escolha uma conta.

## 7. Antes de publicar para outras pessoas
- Configure um domínio HTTPS para a versão web.
- Aplique `firebase/firestore.rules`. Cloud Storage não é necessário para Study Circles.
- Ative App Check quando for para produção.
- Teste criação de conta, logout e recuperação em uma conta de teste.
