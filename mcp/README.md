# Servidor MCP do portfólio

Permite que um assistente de IA (como o Calisto) leia e atualize o conteúdo do portfólio sem abrir o painel de administração. O servidor fala [MCP](https://modelcontextprotocol.io) por **stdio**, não tem dependências além do Node.js e publica no mesmo documento `publico/portfolio` do Firestore que o painel usa.

O servidor entra com **a sua conta de administração** (e-mail e senha) pela API REST do Firebase Authentication. As regras de `firestore.rules` continuam valendo para toda escrita: não há conta de serviço nem Admin SDK. A senha e o token de acesso nunca aparecem nas respostas nem nos registros.

## Requisitos

- Node.js 20.6 ou superior (no Raspberry Pi: `node --version`).
- Uma cópia deste repositório. O servidor lê `catalogo.js`, `links.js` e `conteudo.js` da raiz para usar as mesmas regras do site, e `firebase-config.js` quando estiver preenchido.
- A configuração de produção do Firebase descrita no README principal (conta criada, UID nas regras).

## Variáveis de ambiente

| Variável | Uso |
| --- | --- |
| `PORTFOLIO_EMAIL` | E-mail da conta de administração. Obrigatória para publicar. |
| `PORTFOLIO_PASSWORD` | Senha dessa conta. Obrigatória para publicar. |
| `PORTFOLIO_API_KEY` | Obrigatória em produção: a chave **MCP Calisto (servidor no Pi)** do Google Cloud (*APIs e serviços → Credenciais → Exibir chave*). A chave do site em `firebase-config.js` só aceita pedidos vindos do próprio site e é recusada fora do navegador. |
| `PORTFOLIO_PROJECT_ID` | `projectId` do projeto Firebase. Opcional se `firebase-config.js` estiver preenchido. |
| `PORTFOLIO_OWNER_UID` | UID da conta dona. Opcional; por padrão usa `ownerUid` de `firebase-config.js`. Se informado, o servidor recusa outra conta antes de tentar publicar. |
| `GITHUB_TOKEN` | Opcional. Token do GitHub só para aumentar o limite de consultas de `import_github_repos`. |
| `FIREBASE_AUTH_EMULATOR_HOST`, `FIRESTORE_EMULATOR_HOST` | Só no teste local, para apontar para os emuladores. |

Sem `PORTFOLIO_EMAIL` e `PORTFOLIO_PASSWORD` o servidor ainda lê o portfólio e faz `dry_run`, mas não publica.

## Ferramentas

Toda ferramenta que altera o conteúdo aceita `dry_run: true`, que devolve o diff sem publicar, e `revisao_esperada`, que só publica se o portfólio ainda estiver na revisão lida. Cada publicação incrementa `revision` em exatamente 1, com a mesma verificação otimista do painel: se o documento mudar entre a leitura e a escrita (por exemplo, pelo painel em outra aba), a publicação é recusada e nada é sobrescrito. As respostas trazem `alteracoes` com o que mudou.

| Ferramenta | O que faz |
| --- | --- |
| `get_portfolio` | Lê o conteúdo publicado, a revisão e os valores aceitos (categoria, status, visibilidade, tipos de tecnologia). `secao` limita a resposta a `perfil`, `projetos`, `tecnologias` ou `certificados`. |
| `update_profile` | Atualiza `nome`, `introducao`, `sobre` (`titulo`, `descricao`), `redes` (`linkedin`, `github`, `email`) e `curriculo`. Só os campos enviados mudam. |
| `upsert_project` | Cria ou atualiza um projeto. Procura por `projeto` (título atual ou URL do repositório); sem ele, pelo `repositorio` e depois pelo `titulo`. `posicao` define a ordem. |
| `remove_project` | Remove um projeto pelo título ou pela URL do repositório. |
| `reorder_projects` | Coloca os projetos de `ordem` no início, nessa sequência; os demais seguem na ordem atual. |
| `upsert_skill` | Cria ou atualiza uma tecnologia. O ícone sai do nome pelo Simple Icons; use `icone` só quando o nome não bater. A resposta informa se o ícone existe. Apelidos como `node` ou `cpp` encontram a tecnologia já cadastrada. |
| `remove_skill` | Remove uma tecnologia pelo nome. |
| `upsert_certificate` | Cria ou atualiza um certificado (`titulo`, `instituicao`, `data` AAAA-MM-DD, `credencial`, `imagem`). |
| `remove_certificate` | Remove um certificado pelo nome ou pelo link da credencial. |
| `get_translations` | Lista os textos com o original em português (`pt`) e a versão em inglês (`en`). Por padrão mostra só o que falta traduzir; `faltando: false` mostra tudo. |
| `set_translations` | Grava várias traduções numa só publicação: `perfil`, `projetos` (pelo título ou repositório, com `imagens` na ordem da galeria), `tecnologias` e `certificados`. Texto vazio apaga a tradução e o site volta a mostrar o português. |
| `import_github_repos` | Busca os repositórios públicos (sem forks) de `usuario`, ou do perfil em `redes.github`, e adiciona como projetos com os textos do GitHub, como **Importar do GitHub** no painel. `repositorios` escolhe quais. Repositórios já cadastrados são ignorados. |

As validações são as do painel e das regras: até 80 itens por lista, 16 imagens por projeto, os mesmos limites de caracteres, repositório só em `https://github.com/usuario/repositorio`, links só `http`/`https` sem usuário e senha, imagens por endereço público ou `./assets/…`, e no máximo 750 KB de conteúdo. Campos desconhecidos são recusados para evitar erros de digitação. Com **Privado**, o link do repositório é omitido, como no painel.

As traduções ficam no campo `en` de cada item e são mantidas quando o item é editado em português pelas outras ferramentas.

Se o portfólio ainda não tiver sido publicado, a primeira alteração parte dos exemplos de `conteudo.js`, marcados como demonstração. Remova-os com `remove_project` quando quiser.

## Instalação no Raspberry Pi

1. Clone o repositório no Pi e confira o Node.js. Substitua o endereço pelo do seu repositório.

```bash
git clone https://github.com/SEU-USUARIO/portfolio.git ~/portfolio
node --version
```

2. Guarde as credenciais em um arquivo que só o seu usuário pode ler, fora do repositório. Ajuste os valores; `PORTFOLIO_PROJECT_ID` pode ficar de fora se `firebase-config.js` estiver preenchido no clone, mas `PORTFOLIO_API_KEY` precisa ser a chave própria do MCP.

```bash
mkdir -p ~/.config/portfolio-mcp
cat > ~/.config/portfolio-mcp/env <<'EOF'
PORTFOLIO_EMAIL=voce@exemplo.com
PORTFOLIO_PASSWORD=sua-senha
PORTFOLIO_API_KEY=chave-do-mcp
PORTFOLIO_PROJECT_ID=id-do-projeto
EOF
chmod 600 ~/.config/portfolio-mcp/env
```

3. Confira se o servidor sobe. Ele mostra `Servidor MCP do portfólio pronto (stdio).` e espera mensagens; encerre com `Ctrl+C`.

```bash
node --env-file="$HOME/.config/portfolio-mcp/env" ~/portfolio/mcp/server.mjs
```

### Registrar no cliente MCP

O cliente inicia o servidor como um processo e conversa pelo stdio. Use caminhos absolutos; troque `/home/pi` pela pasta do seu usuário. A opção `--env-file` mantém a senha fora da configuração do cliente.

Clientes com configuração em JSON (`mcpServers`), como Claude Desktop, Cursor e a maioria dos agentes:

```json
{
  "mcpServers": {
    "portfolio": {
      "command": "node",
      "args": ["--env-file=/home/pi/.config/portfolio-mcp/env", "/home/pi/portfolio/mcp/server.mjs"]
    }
  }
}
```

Hermes Agent (`~/.hermes/config.yaml`):

```yaml
mcp_servers:
  portfolio:
    command: node
    args: ["--env-file=/home/pi/.config/portfolio-mcp/env", "/home/pi/portfolio/mcp/server.mjs"]
```

Claude Code:

```bash
claude mcp add portfolio -- node --env-file=/home/pi/.config/portfolio-mcp/env /home/pi/portfolio/mcp/server.mjs
```

Se o cliente não aceitar `--env-file`, passe as variáveis no campo `env` da configuração dele. Confira na documentação do cliente o nome exato da chave. Reinicie o cliente depois de registrar e peça, por exemplo: “adicione o projeto Calisto ao portfólio, primeiro em dry_run”.

Para atualizar o servidor, rode `git pull` em `~/portfolio` e reinicie o cliente MCP.

## Teste local

Com os emuladores do README principal ativos em um terminal (`node preview-admin.mjs`), rode em outro terminal, na raiz do projeto:

```powershell
node mcp/teste-local.mjs
```

O teste limpa o Firestore do emulador, inicia o servidor e percorre todas as ferramentas com a conta fictícia `teste@example.test`: criação e edição de projetos (Calisto, EyeBridge, printVal-3d), perfil com e-mail, tecnologias com ícone automático, certificados, ordem, remoção, traduções para o inglês, `dry_run`, `revisao_esperada`, validações recusadas, importação do GitHub, senha errada, conta que não é dona, regra do Firestore recusando revisão pulada e escrita concorrente. Também confere que a senha e o token não aparecem na saída. Use `--sem-github` para pular as consultas ao GitHub e ao Simple Icons sem internet. Depois do teste, `http://127.0.0.1:4175/` mostra o conteúdo publicado pelo servidor.

Para usar o servidor à mão contra os emuladores, defina as variáveis do teste:

```powershell
$env:FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099'
$env:FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080'
$env:PORTFOLIO_API_KEY = 'local-emulator-only'
$env:PORTFOLIO_PROJECT_ID = 'demo-portfolio-local'
$env:PORTFOLIO_EMAIL = 'teste@example.test'
$env:PORTFOLIO_PASSWORD = 'PortfolioTeste123!'
node mcp/server.mjs
```
