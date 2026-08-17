# Publicando o Aurex como produto

Objetivo: **usuário instala a extensão → faz login → usa**, sem configurar nada.

A extensão usa o **mesmo login OAuth/PKCE do `aurex-api`** (o mesmo que o Aurex CLI
usa) e aponta para um endpoint público. Hoje o `aurex-api` roda local
(`http://127.0.0.1:3030`); os passos abaixo o colocam no ar no **Railway** e fazem
a extensão usá-lo por padrão.

> **Login:** ligado por padrão (`AUREX_REQUIRE_LOGIN_DEFAULT = true` em `popup.js`).
> Na primeira mensagem (ou em Configurações ▸ Conta ▸ Conectar conta) abre o login
> real do `aurex-api`.

---

## 1. Deploy no Railway SEM expor o código (recomendado p/ seus segredos)

Como o `aurex-api` tem chaves, **não precisa ir para o GitHub**. Use o Railway CLI,
que sobe o código local direto:

```bash
npm i -g @railway/cli
railway login
cd C:\Users\User\Desktop\aurex-api
railway init           # cria o projeto
railway up             # faz deploy do diretório atual
```

Os segredos ficam só no painel do Railway (passo 3), nunca no código.

> Se um dia for para o GitHub: use repositório **privado**, `.env` no `.gitignore`,
> e **rotacione** qualquer chave que já tenha sido commitada (o histórico guarda).

---

## 2. Ajustes obrigatórios no servidor para nuvem

A nuvem injeta a porta e exige bind público. No `src/server.ts`, troque o listen
fixo (`127.0.0.1:3030`) por:

```ts
const port = Number(process.env.PORT) || 3030;
app.listen(port, "0.0.0.0", () => console.log(`Aurex API on ${port}`));
```

A resposta de `/chat/completions` deve seguir o formato OpenAI (a extensão lê
`choices[0].message` e `tool_calls`):

```json
{ "choices": [ { "message": { "role": "assistant", "content": "...", "tool_calls": [] } } ] }
```

---

## 3. Configurar Postgres + segredos no Railway

1. No projeto: **New → Database → PostgreSQL** (gera `DATABASE_URL`).
2. Aba **Variables** do serviço: adicione a chave do LLM (ex: `ANTHROPIC_API_KEY`) e
   tudo que estava no seu `.env` local. **Não** defina `PORT` (o Railway define).
3. **Settings → Networking → Generate Domain** → você recebe a URL pública, ex:
   `https://aurex-api-production.up.railway.app`.

---

## 4. Login: liberar o redirect da extensão (passo crítico)

A extensão faz OAuth via `chrome.identity.launchWebAuthFlow`. O redirect dela é:

```
https://<ID_DA_EXTENSAO>.chromiumapp.org/callback
```

Para descobrir o valor exato, no console do side panel rode:
```js
chrome.identity.getRedirectURL("callback")
```

No `aurex-api`, **adicione esse redirect à allowlist** de `redirect_uri` do OAuth
(senão o servidor recusa o login da extensão). Contrato que a extensão espera:

| Passo | Requisição | Resposta esperada |
|------|------------|-------------------|
| 1 | `GET {base}/auth/login?state=&code_challenge=&redirect_uri=` (PKCE **S256**) | redireciona para `redirect_uri?code=&state=` |
| 2 | `POST {base}/auth/token` `{ code, code_verifier, redirect_uri }` | `{ accessToken, refreshToken, expiresIn, user }` |
| 3 | `POST {base}/auth/refresh` `{ refreshToken }` | `{ accessToken, refreshToken, expiresIn, user }` |
| 4 | `POST {base}/auth/logout` `{ refreshToken }` | 200 |
| 5 | `POST {base}/chat/completions` com `Authorization: Bearer <accessToken>` | formato OpenAI |

> Se os seus endpoints/campos forem diferentes disso, me diga os nomes reais que eu
> ajusto `loginAurexChrome` / `refreshAurexAccessToken` / `getAurexAccessToken` em
> `popup.js` para baterem com o seu servidor.

> Dica: para o `<ID_DA_EXTENSAO>` ser **estável**, gere uma `key` no `manifest.json`
> (ou publique a extensão). Sem isso, o ID muda ao recarregar e o redirect cadastrado
> deixa de valer.

---

## 5. Apontar a extensão para o endpoint (1 linha)

Em `popup.js`, no topo, troque:

```js
var AUREX_PRODUCTION_API_BASE = "https://SEU-APP.up.railway.app";
```

- **Sem** `/chat/completions` e **sem** `/v1` no final — a extensão adiciona
  `/chat/completions` sozinha; os endpoints `/auth/*` são montados a partir dessa
  mesma base.

Recarregue a extensão (`chrome://extensions` → recarregar) e **feche/reabra o side
panel**.

> Configurações ▸ Geral ▸ Servidor permite sobrescrever a URL, colar uma chave de
> API, ou desligar o login para testes locais. O usuário final não precisa de nada
> disso.
