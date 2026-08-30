# Super Bot do Discord

Este é um bot do Discord rico em recursos, configurado com uma estrutura modular, pronto para operação 24/7.

## Instruções de Instalação

Como a configuração automatizada não pôde concluir a instalação das dependências, siga estas etapas manualmente no seu terminal:

1.  **Navegue até o diretório do bot:**
    ```bash
    cd discord-bot
    ```

2.  **Instale as dependências:**
    ```bash
    npm install
    ```

3.  **Registre os Comandos:**
    Isso envia os comandos de barra (como `/ping`, `/8ball`) para o Discord para que apareçam no seu servidor.
    ```bash
    npm run deploy
    ```

4.  **Inicie o Bot:**
    ```bash
    npm start
    ```

## Hospedagem 24/7

Para manter o bot rodando 24/7 mesmo se você fechar o terminal, recomendo usar o **PM2** (Process Manager 2).

1.  **Instale o PM2 globalmente:**
    ```bash
    npm install pm2 -g
    ```

2.  **Inicie o bot com PM2:**
    ```bash
    pm2 start index.js --name "meu-bot-discord"
    ```

3.  **Monitore o bot:**
    ```bash
    pm2 status
    pm2 logs
    ```

## Recursos

- **/ping**: Verifica a latência.
- **/user**: Obtém informações do usuário.
- **/coinflip**: Joga uma moeda (Cara/Coroa).
- **/8ball**: Faz uma pergunta para a bola mágica 8.

## Aviso de Segurança

**IMPORTANTE:** O token no seu arquivo `.env` foi exposto no chat.
1. Vá para o [Portal do Desenvolvedor Discord](https://discord.com/developers/applications).
2. Selecione sua aplicação.
3. Vá para a aba "Bot".
4. Clique em **"Reset Token"**.
5. Copie o novo token.
6. Abra o arquivo `.env` nesta pasta e substitua o token antigo pelo novo.