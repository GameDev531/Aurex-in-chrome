# Publicando o Aurex como produto

Objetivo: **usuário instala a extensão → já usa**, sem configurar nada.

Para isso a extensão precisa apontar para um endpoint público (o `aurex-api`
rodando na nuvem). Hoje o `aurex-api` roda local (`http://127.0.0.1:3030`); os
passos abaixo o colocam no ar no **Railway** e fazem a extensão usá-lo por padrão.

> Modelo de auth atual: **sem login** (o servidor guarda a chave do LLM). A tela
> `login.html` já existe como gancho para contas/OAuth reais numa próxima etapa.

---

## 1. Subir o `aurex-api` para o GitHub

No diretório do servidor (`C:\Users\User\Desktop\aurex-api`):

```bash
git init
git add -A
git commit -m "aurex-api inicial"
# crie um repositório vazio no GitHub (ex: SEU_USUARIO/aurex-api) e:
git remote add origin https://github.com/SEU_USUARIO/aurex-api.git
git branch -M main
git push -u origin main
```

> Garanta um `.gitignore` com `node_modules` e `.env` (não suba segredos).

---

## 2. Ajustes obrigatórios no servidor para nuvem

A nuvem injeta a porta e exige bind público. No seu `src/server.ts`, troque o
listen fixo (`127.0.0.1:3030`) por:

```ts
const port = Number(process.env.PORT) || 3030;
app.listen(port, "0.0.0.0", () => {
  console.log(`Aurex API running on port ${port}`);
});
```

- **`process.env.PORT`** → o Railway define a porta automaticamente.
- **`0.0.0.0`** → sem isso o serviço fica inacessível de fora.

A resposta de `/chat/completions` deve seguir o formato OpenAI (a extensão lê
`choices[0].message` e `tool_calls`):

```json
{ "choices": [ { "message": { "role": "assistant", "content": "...", "tool_calls": [] } } ] }
```

---

## 3. Deploy no Railway

1. Acesse railway.app → **New Project → Deploy from GitHub repo** → escolha `aurex-api`.
2. **Add Postgres**: no projeto, **New → Database → PostgreSQL**. O Railway cria a
   variável `DATABASE_URL` — use-a no servidor (substitua a conexão local).
3. **Variáveis de ambiente** (aba *Variables* do serviço): adicione a chave do LLM
   que o servidor usa (ex: `ANTHROPIC_API_KEY` / `OPENAI_API_KEY`) e qualquer outra
   que o `.env` local tinha. **Não** precisa definir `PORT` (o Railway define).
4. Confirme o comando de start. Para `tsx`, um destes funciona:
   - `npm run start` apontando para `tsx src/server.ts`, ou
   - build TypeScript + `node dist/server.js` (mais robusto em produção).
5. Em **Settings → Networking → Generate Domain** para obter a URL pública, algo como
   `https://aurex-api-production.up.railway.app`.

### Testar
```bash
curl -X POST https://SEU-APP.up.railway.app/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"AurexAI","messages":[{"role":"user","content":"oi"}]}'
```
Deve voltar um JSON no formato OpenAI acima.

---

## 4. Apontar a extensão para o endpoint (1 linha)

Em `popup.js`, no topo do arquivo, troque a constante:

```js
var AUREX_PRODUCTION_API_BASE = "https://SEU-APP.up.railway.app";
```

- **Sem** `/chat/completions` e **sem** `/v1` no final — a extensão adiciona
  `/chat/completions` sozinha (seu servidor expõe a rota na raiz).
- A partir daí, quem instalar a extensão já usa direto, sem mexer em Configurações.

Recarregue a extensão (`chrome://extensions` → recarregar) e **feche/reabra o
side panel**.

> A aba **Configurações ▸ Geral ▸ Servidor** continua existindo para casos
> avançados (testar local, usar uma chave, ou ligar login). Para o usuário final,
> nada disso é necessário.

---

## 5. Próxima etapa (quando quiser): login real

- O endpoint hoje é **aberto** — qualquer um com a extensão consome o LLM (risco de
  custo/abuso). Para produto público, adicione autenticação:
  - No `aurex-api`: rotas `/auth/login`, `/auth/token`, `/auth/refresh`, `/auth/logout`
    e exigir `Authorization: Bearer` em `/chat/completions`.
  - Na extensão: ligar **Configurações ▸ Servidor ▸ Exigir login (OAuth)** (já
    implementado: usa `chrome.identity` + PKCE em `loginAurexChrome()`), ou
    conectar o botão de `login.html` ao fluxo real.
