# Auditoria do ambiente

Data: 31 de agosto de 2026  
Diretório confirmado: `C:\larcarvalho-intelligence`

## Sistema

| Item                | Resultado                                                                 |
| ------------------- | ------------------------------------------------------------------------- |
| Sistema operacional | Microsoft Windows 11 Home Single Language, versão 10.0.26200, build 26200 |
| Arquitetura         | SO x64, computador x64, processo x64                                      |
| Memória física      | 16.849.293.312 bytes (aprox. 15,69 GiB)                                   |
| Unidade C:          | NTFS, saudável, 1.003.165.315.072 bytes totais                            |
| Espaço livre em C:  | 834.907.316.224 bytes (aprox. 777,57 GiB)                                 |
| Virtualização       | Hypervisor não detectado                                                  |

## Ferramentas

| Ferramenta            | Resultado                                                    |
| --------------------- | ------------------------------------------------------------ |
| Node.js               | v24.20.0 x64 em `C:\Program Files\nodejs`                    |
| npm                   | 11.19.0                                                      |
| npx                   | 11.19.0                                                      |
| Corepack              | 0.35.0                                                       |
| Git                   | 2.53.0.windows.4, embutido no GitHub Desktop; fora do PATH   |
| GitHub Desktop        | 3.6.4, instalado no perfil do usuário                        |
| GitHub CLI (`gh`)     | Não encontrado; não é necessário nesta etapa                 |
| Docker                | CLI 29.7.2 no perfil do usuário; fora do PATH da sessão      |
| Docker Compose        | v5.4.0; configuração YAML validada estaticamente             |
| Python                | 3.14.7 x64 (`python` e launcher `py`)                        |
| Windows PowerShell    | 5.1.26100.9168, Desktop Edition                              |
| PowerShell 7 (`pwsh`) | Não encontrado                                               |
| VS Code               | 1.135.0 x64                                                  |
| Codex CLI             | 0.151.0-alpha.7.2, fornecido pela extensão OpenAI do VS Code |
| pnpm / Yarn / Bun     | Não encontrados; não são necessários para este projeto       |
| .NET                  | Runtime host encontrado, mas nenhum SDK instalado            |
| Java                  | Java 8 Update 503, runtime 32-bit Client VM                  |
| WSL                   | Executável presente, subsistema não instalado                |
| OpenSSL CLI           | Não encontrado                                               |

## Rede e portas

As portas planejadas 3000, 3001 e 5432 estavam livres. Das portas verificadas (80, 443, 3000, 3001, 4173, 5432, 6379, 8000 e 8080), apenas uma associação HTTPS do Windows em endereço não local apareceu na porta 443; ela não conflita com o desenvolvimento planejado nas portas 3000/3001/5432.

O registro oficial npm respondeu HTTP 200 e DNS/TCP 443 funcionaram. O npm inicialmente falhou com `UNABLE_TO_VERIFY_LEAF_SIGNATURE`: o Windows confiava no certificado da rede, mas o Node não usava o repositório de CAs do sistema. A instalação foi concluída com `NODE_USE_SYSTEM_CA=1` somente na sessão, preservando a verificação TLS. Não usar `strict-ssl=false` como contorno.

## PATH e configuração

- Nenhuma entrada duplicada foi identificada no PATH efetivo.
- O PATH persistido do usuário contém Docker Desktop e o launcher do GitHub Desktop, mas o processo atual foi aberto antes da instalação e não herdou essas entradas. O launcher do GitHub Desktop não equivale ao comando `git`.
- A entrada `C:\Program Files (x86)\Common Files\Oracle\Java\javapath` não existe; o Java é resolvido por outra entrada (`java8path`).
- Windows Long Paths está desabilitado (`LongPathsEnabled=0`). Isso pode afetar árvores profundas de `node_modules` e Git no Windows.
- PowerShell usa política `RemoteSigned` em LocalMachine; os outros escopos estão indefinidos.
- O npm usa registry oficial, prefixo no perfil do usuário e cache local no perfil do usuário.
- O diretório originalmente aberto pelo ambiente, dentro do OneDrive, estava vazio. O briefing exigia o caminho na raiz de C:, que foi criado sem mover ou excluir o diretório do OneDrive.

## Compatibilidade

- Node 24 atende Next.js 16, Fastify 5 e Vitest 4 selecionados.
- O TypeScript mais novo disponível no registro era 7.0.2, mas `typescript-eslint` 8.68.0 declara suporte apenas a TypeScript abaixo de 6.1. Por isso o projeto fixa TypeScript 5.9.3.
- Python 3.14 é recente e pode não ser aceito por ferramentas Python antigas, mas não faz parte da stack proposta.
- Java 8/32-bit e ausência de .NET SDK não interferem na stack atual.

## Ações não realizadas

- Nenhuma configuração global foi alterada.
- O Git local foi inicializado na branch `main` com o Git embutido no GitHub Desktop. Nenhum commit, remoto ou push foi criado.
- O Docker Compose passou em `config --no-interpolate --quiet`. As imagens não foram construídas porque o Docker Desktop está parado na etapa de nova licença e o WSL informa que não está instalado.
- Nenhum `.env` real, segredo, banco, API externa ou repositório remoto foi criado.
- Nenhum push foi realizado.
