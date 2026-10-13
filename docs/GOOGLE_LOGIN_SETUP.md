# Login Google — AUVRYN 1.9

Veja também `ATIVAR_LOGIN_GOOGLE.md` para o passo a passo simplificado.


1. Crie/abra o projeto Firebase.
2. Authentication > Sign-in method > Google > Ativar.
3. Adicione seus domínios em Authorized domains.
4. Registre um App Web e copie `firebaseConfig` para `web/config/firebase-config.js`.
5. Publique por HTTPS para produção.
6. Para proteção adicional, configure App Check conforme `SECURITY.md`.

A mesma tela também suporta e-mail/senha quando esse provedor estiver ativado.
