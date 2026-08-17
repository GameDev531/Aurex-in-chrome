# Arquitetura de ferramentas do Aurex

```
Aurex
│
├── Browser Tools        agem NA ABA do usuário (sessão dele, login, cliques)
│   ├── dom_action       click / type / press_key / accessibility / CDP
│   │                    navigate / scroll / search_web / get_page_source
│   ├── capture_screenshot
│   └── tab_manager      criar, listar, trocar e fechar abas
│
├── Web Tools            trazem informação DE FORA, sem abrir aba
│   ├── web_search       pesquisa com fontes citadas   [precisa de chave]
│   ├── web_extract      lê uma página como texto limpo
│   └── http_request     requisição crua (APIs, download de assets)
│
├── External Tools       serviços de terceiros, com a chave do usuário
│   └── maps_places      Google Places API (New)       [precisa de chave]
│
└── Core Tools           entrega e memória
    ├── write_file       qualquer extensão, aceita subpasta
    ├── save_markdown_file
    └── task_memory
```

## Princípio: nenhuma chave acompanha o produto

O Aurex **não embute nenhuma API key**. Cada integração é plugada pelo usuário em
**Configurações ▸ Geral ▸ Chaves de API**.

Consequência de design: uma ferramenta que depende de chave **só entra na lista
enviada ao modelo quando a chave existe** (`getActiveTools()`). Sem isso o modelo
anunciaria capacidades que não consegue executar e gastaria turnos falhando.

Sem chave nenhuma o Aurex continua completo para navegação, leitura, código e
APIs públicas — só as famílias pagas ficam de fora.

## Segurança das chaves

O valor da chave **nunca entra no contexto do LLM**:

1. O modelo recebe apenas os **nomes** das chaves configuradas.
2. Ele escreve o placeholder `{{KEY:NOME}}` na URL, no header ou no body.
3. `substituteApiKeys()` troca pelo valor real **no momento do `fetch`**.
4. A URL devolvida no resultado é a original, com o placeholder — a chave
   substituída não volta para o histórico da conversa.

Chave ausente ou em branco não dispara a requisição: retorna um erro dizendo
qual chave falta e onde cadastrar.

## Como adicionar uma External Tool nova (Gmail, GitHub, Slack, Drive…)

Três passos, todos em `popup.js`:

**1. Declare a integração** em `AUREX_INTEGRATIONS`:

```js
{
  key: "GITHUB_TOKEN",                    // vira o nome do placeholder
  label: "GitHub — repositórios e issues",
  tools: ["github"],                      // tools liberadas por esta chave
  help: "github.com/settings/tokens (escopo repo)"
}
```

**2. Defina a tool** em `TOOL_DEFINITIONS` e registre o nome no grupo
`external` de `TOOL_GROUPS`.

**3. Implemente o handler** e ligue em `executeToolInBrowser`:

```js
async function executeGithub(args) {
  return executeHttpRequest({
    url: "https://api.github.com/...",
    headers: { "Authorization": "Bearer {{KEY:GITHUB_TOKEN}}" }
  });
}
```

Reutilizar `executeHttpRequest` dá de graça: timeout, substituição de chave,
tratamento de conteúdo binário, truncagem sinalizada e erro HTTP legível.

O campo `modelSetting` é opcional e cria um segundo input (usado pelo
`web_search` para escolher o modelo de pesquisa, ex: `gemini-2.5-flash`).

## Permissão por site (Zero Trust)

As Browser Tools passam por aprovação por origem, válida só na sessão do
navegador. O pedido **não bloqueia** o service worker: ele responde na hora com
`pending_permission`, o painel lateral espera a decisão do usuário e **repete a
ação automaticamente** após a aprovação. Pendências ficam em
`chrome.storage.session`, então sobrevivem ao reinício do service worker do MV3.

As Web Tools e External Tools não pedem permissão de site: não tocam a aba do
usuário.
