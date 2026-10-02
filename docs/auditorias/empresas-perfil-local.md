# Empresas do SaaS e perfil — local

26/09/2026. Sem commit, push ou publicação.

- Gestão da plataforma renomeada para Empresas do SaaS, mantendo requireSuperAdmin.
- Compartilhamento entre empresas continua separado da contratação/cadastro SaaS. Labels de card passaram de terceirização para compartilhamento; a execução espelhada e a necessidade de conexão aceita não mudaram.
- Minha conta ampliada com Instagram, LinkedIn, site/portfólio e apresentação. Telefone e demais dados são carregados da API ao abrir, evitando substituir o telefone salvo por vazio acidentalmente.
- Validação de tamanho e protocolo http/https no servidor, com dados sempre vinculados ao usuário da sessão.
- Migration aditiva 20260926000000_perfil_social aplicada exclusivamente ao PostgreSQL local.
- Build e 615 testes aprovados. Teste real local confirmou persistência dos campos, recusa de URL javascript, isolamento de perfil, restrição de administração SaaS e UI de perfil/senha.

Conta SaaS local: plataforma@nuflow.test. Senha de demonstração igual às demais contas locais: NuFlow-Local-2026!.

Os links novos são editáveis no próprio perfil. Exibição desses dados nos detalhes de outras pessoas, página completa de conta, produtividade e gestão de sessões permanecem melhorias futuras. Nenhuma métrica de uso/cobrança foi inventada no painel SaaS.
