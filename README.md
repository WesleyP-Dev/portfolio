# Portfólio

<p align="center">
  <a href="https://wesleypie.tech"><img src="docs/banner.png" alt="Página inicial do portfólio no computador e no celular" width="100%"></a>
</p>

<p align="center">
  <a href="https://wesleypie.tech"><strong>wesleypie.tech</strong></a>
</p>

Site estático em HTML, CSS e JavaScript, com temas claro e escuro, filtros de projetos e galeria navegável por teclado. Para abrir, clique duas vezes em `index.html` ou use um servidor local na raiz do projeto.

```powershell
python -m http.server 8000 --bind 127.0.0.1
```

Abra `http://127.0.0.1:8000/` no navegador. Use `Ctrl+C` no terminal para encerrar o servidor.

## Visual

**Projetos** com filtro por categoria, selo de status, galeria e link do repositório:

![Seção de projetos](docs/projetos.png)

**Tecnologias** com ícones automáticos na cor do tema e a nota “Como uso” recolhível:

![Seção de tecnologias](docs/tecnologias.png)

**Tema escuro e claro**, com duas paletas de cores:

![Comparação entre o tema escuro e o claro](docs/temas.png)

## Administração

Abra **Administração** no rodapé. Após a configuração inicial, entre com seu e-mail e senha para editar a apresentação, a bio, os perfis, o currículo, os projetos, as tecnologias e os certificados. **Publicar alterações** salva o conteúdo compartilhado no Firestore e o torna visível para visitantes. O site começa com os exemplos de `conteudo.js`.

- **Currículo** aceita um link público para o PDF ou a página do currículo e aparece em **Sobre mim**.
- **Repositório no GitHub** aceita o endereço do repositório do projeto. O link aparece direto no cartão e dentro dos detalhes.
- **Visibilidade do repositório** permite exibir **Público** ou **Privado** no cartão e nos detalhes, junto com **Exemplo** quando marcado. Ao publicar como privado, o painel omite o endereço do GitHub. A apresentação do projeto continua pública.
- **Status do projeto** exibe um ícone e um rótulo no canto superior direito do cartão e nos detalhes. Os ícones têm animações curtas que respeitam a preferência por movimento reduzido. Passe o mouse sobre o selo para ler a explicação. Escolha **Em andamento**, **Em beta**, **Parcialmente concluído**, **Pausado**, **Concluído** ou **Sem status**.
- **Galeria** aceita endereços públicos que abram imagens diretamente, ou imagens do seu computador pelo botão **Enviar do PC**, e um texto alternativo para cada uma. O envio reduz a imagem no navegador (WebP, até 1600 px; ícones até 256 px) e guarda no Firestore, na coleção `imagens`, sem precisar do Storage. Na galeria, **GIFs animados** de até 8 MB vão sem alteração e continuam animados; os maiores que 900 KB ficam divididos em partes na subcoleção `imagens/{id}/partes`. A primeira imagem da galeria é a prévia do cartão, então um GIF nessa posição vira uma mini prévia animada do projeto. O mesmo botão existe nos ícones de tecnologia e nas imagens de certificados. A partir da segunda imagem, aparecem os controles do carrossel.
- **Tecnologias** permitem escolher um tipo para o filtro público e, opcionalmente, detalhar a área ou especialidade. O ícone sai do nome automaticamente (Python, C++, Node.js, Proxmox…) pelo [Simple Icons](https://simpleicons.org) e sempre usa a cor do tema. Se o nome não bater, digite o identificador do Simple Icons no campo **Ícone**; a prévia aparece no próprio item. Um ícone personalizado por endereço também recebe a cor do tema, a menos que **Manter as cores originais** esteja marcado.
- **E-mail de contato** e **LinkedIn** formam a seção **Contato**. Links vazios, certificados e contato ficam ocultos para visitantes até serem preenchidos.
- **Importar do GitHub** lista os repositórios públicos de um usuário e cria rascunhos de projeto. **Cópia de segurança** baixa ou carrega todo o conteúdo em JSON. O painel avisa antes de sair com alterações não publicadas.
- **Certificados** exigem nome e instituição emissora. A data de emissão, o link público da credencial e a imagem são opcionais. Em uma instalação existente do Firebase, publique a versão atual de `firestore.rules` antes de cadastrar o primeiro certificado.

Para mudar a ordem de projetos, tecnologias e certificados, arraste pela alça ⠿ à esquerda do nome (ou foque a alça e use as setas). O catálogo mostra até seis projetos por página, com paginação conforme o filtro ativo.

Com o Firebase ativo, o site guarda no navegador a última versão publicada e a exibe enquanto busca a atual, sem mostrar os exemplos de `conteudo.js`. O site está publicado em [wesleypie.tech](https://wesleypie.tech), e `og:image` em `index.html` aponta para `https://wesleypie.tech/assets/og.jpg`; se trocar de domínio, atualize esse endereço.

### Teste local sem conta no Firebase

Com Node.js, Firebase CLI e Java 21 ou superior disponíveis, execute na raiz do projeto:

```powershell
node preview-admin.mjs
```

Abra `http://127.0.0.1:4175/admin.html` quando o endereço aparecer no terminal. Use o e-mail `teste@example.test` e a senha de teste `PortfolioTeste123!`. O script prepara uma cópia temporária do site, cria a conta fictícia e usa os emuladores locais de Hosting, Auth e Firestore. Na primeira execução, a CLI pode baixar o emulador do Firestore. O site carrega o SDK do Firebase pela internet.

Use **Ver site** para conferir o que publicou. As alterações de teste são descartadas ao encerrar com `Ctrl+C`.

### Configure sua conta de produção uma única vez

1. Use um projeto Firebase dedicado ao portfólio. No console, registre um **app da Web**, crie o banco **Cloud Firestore** padrão em modo de produção e habilite **Authentication → Sign-in method → E-mail/senha**.
2. Em **Authentication → Users**, crie sua conta com o e-mail e a senha que você escolher. Copie o **UID** exibido. A senha fica somente na conta do Firebase.
3. Em `firebase-config.js`, substitua `null` pelo objeto do exemplo. Em `firebase`, cole a configuração pública do app Web. Em `ownerUid`, informe o UID copiado. Em `firestore.rules`, troque `CONFIGURE_OWNER_UID` pelo mesmo UID. O Firestore só permite publicar com essa conta.
4. Com a Firebase CLI instalada, autentique-se com `firebase login` e publique as regras a partir da raiz do projeto. Substitua `ID-DO-PROJETO` pelo identificador do projeto Firebase.

```powershell
firebase deploy --only firestore:rules --project ID-DO-PROJETO
```

Use o servidor local ou a hospedagem para abrir o painel. Depois da configuração, as edições de conteúdo são feitas no formulário. [Configuração do app Web](https://firebase.google.com/docs/web/setup) · [Login com e-mail e senha](https://firebase.google.com/docs/auth/web/password-auth) · [Regras do Firestore](https://firebase.google.com/docs/firestore/security/rules-conditions).

## Versões no Git

O histórico local começa em `v0.1.0` com a base do portfólio. A versão `v0.2.0` preserva o site verde anterior. A `v0.3.0` acrescenta o painel, o currículo, os links de repositório e a paleta lilás. A `v0.4.0` acrescenta a paleta azul. A `v0.5.0` acrescenta o teste local do painel. A `v0.6.0` preserva as quatro paletas para comparação. A `v0.7.0` define azul com lilás como padrão e verde como alternativa. A `v0.8.0` acrescenta a transição na galeria e compacta os controles. A `v0.9.0` inclui a paginação dos projetos. A `v0.10.0` adota **Azul + violeta suave** como padrão e mantém **Verde** como alternativa, com as duas opções representadas por bolinhas no cabeçalho. A `v0.11.0` acrescenta os selos de visibilidade e o filtro de tecnologias. A `v0.12.0` acrescenta os status dos projetos. O navegador guarda a escolha junto com a preferência de tema claro ou escuro.

```powershell
git log --oneline --decorate
git diff v0.15.0 v0.16.0
git status --short
```

A `v0.13.0` dá ícones personalizados e animações aos selos de status. A `v0.14.0` adiciona certificados ao site e ao painel. A `v0.15.0` adapta o layout a monitores ultrawide e amplia os controles de toque. A `v0.16.0` anima a troca de resultados nos filtros de projetos e tecnologias.

Para enviar a primeira versão, crie um repositório vazio no GitHub e substitua `SEU-USUARIO` pelo seu usuário e `portfolio` pelo nome do repositório, se for diferente.

```powershell
git remote add origin https://github.com/SEU-USUARIO/portfolio.git
git push -u origin main
git push origin --tags
```

O Git guarda mudanças no código e no visual. O Firestore guarda o conteúdo publicado pelo painel. Para uma futura mudança de código, revise o diff, adicione os arquivos alterados e faça um commit. Crie uma tag quando quiser marcar uma versão.

```powershell
git diff
git add -- styles.css
git commit -m "Atualiza o estilo do portfólio"
git tag -a v0.17.0 -m "Novo estilo"
git push
git push origin v0.17.0
```

## Hospedagem

**GitHub Pages.** No GitHub, abra **Settings → Pages**. Selecione **Deploy from a branch**, escolha `main` e `/(root)` e salve. O site público também pode usar o Firebase para login e conteúdo com a configuração acima. [Guia oficial do GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).

**Google Cloud com Firebase Hosting.** Depois da configuração da conta, prepare e publique os arquivos estáticos no mesmo projeto Firebase. Se o projeto ainda não tiver um site padrão, a CLI pode solicitar sua criação.

```powershell
node prepare-hosting.mjs
firebase deploy --only hosting,firestore:rules --project ID-DO-PROJETO
```

Com o GitHub Actions configurado ([`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)), cada `git push` na `main` publica o site e as regras sozinho, usando a conta de serviço `github-deploy` guardada no segredo `FIREBASE_SERVICE_ACCOUNT`. Mudanças só em `mcp/` ou em arquivos `.md` não disparam o deploy. Sem o Actions, repita a preparação e o deploy à mão quando alterar código ou o visual. Para mudanças feitas pelo painel, basta usar **Publicar alterações**. [Guia do Firebase Hosting](https://firebase.google.com/docs/hosting/quickstart) · [Criação do site padrão](https://firebase.google.com/docs/hosting/default-site).

## Imagens

O [diretório `assets`](assets/) contém imagens ilustrativas geradas com o ImageGen integrado e otimizadas em WebP. Os conceitos usados nos prompts foram:

- `hero.webp` — fita tridimensional de filamentos verde-lima em fundo verde-escuro com grade sutil, sem texto ou pessoas.
- `habitos.webp` — painel verde-escuro de hábitos, com calendário de atividades e gráfico de tendência.
- `habitos-detalhe.webp` — visão semanal do painel de hábitos, com barras e anéis de progresso.
- `campus.webp` — celular com um protótipo de mapa do campus em tons de menta e oliva.
- `dados.webp` — painel azul-petróleo com métricas e gráficos de linhas e barras.
