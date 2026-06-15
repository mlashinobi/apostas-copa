# Bolão da Copa — Firebase V4 Compat

Esta é a versão criada para resolver erro em `app.js` causado por `type="module"`, `import/export`, upload errado ou abertura local.

Diferença principal:

- Não usa `import`.
- Não usa `export`.
- Usa Firebase compat SDK com scripts normais.
- O arquivo `firebase-config.js` usa `window.firebaseConfig`.

Se o site publicado não mostrar “Firebase V4 • Sem módulos” no menu lateral, o GitHub Pages ainda está mostrando arquivo antigo.

## Como configurar

1. Crie o projeto no Firebase.
2. Crie o App Web.
3. Copie os dados do `firebaseConfig`.
4. Abra `firebase-config.js`.
5. Preencha os valores dentro de `window.firebaseConfig`.
6. Ative Authentication > Email/Password.
7. Crie Firestore Database.
8. Publique as regras do arquivo `firestore.rules`.
9. Publique tudo no GitHub Pages.
10. Abra `debug.html` e rode o diagnóstico.

## Sistema de pontuação

- Placar exato: 5
- Vencedor + diferença: 3
- Vencedor/empate: 2
- Gols de um dos times: 1
- Jogador fez gol: 2
- Pênalti: 2
- Vermelho: 2
- Total de gols exato: 3
- Total com erro de 1: 2
- Total com erro de 2: 1
