# Filter: token

Matches: 47

First 50 entries:

- api/auth.js:31 — localStorage.getItem("token") ||
- api/auth.js:32 — sessionStorage.getItem("token"); // lê dos dois
- api/auth.js:39 — localStorage.removeItem("token");
- api/auth.js:40 — sessionStorage.removeItem("token");
- api/auth.js:50 — localStorage.removeItem("token");
- api/auth.js:51 — sessionStorage.removeItem("token");
- api/logout.js:25 — localStorage.removeItem('token');
- api/logout.js:28 — sessionStorage.removeItem('token');        // <- faltava
- api/middleware.js:5 — return localStorage.getItem('token') || sessionStorage.getItem('token');
- api/middleware.js:5 — return localStorage.getItem('token') || sessionStorage.getItem('token');
- api/proteger-pagina.js:23 — const token = localStorage.getItem('auth.token') || '';
- api/proteger-pagina.js:293 — (typeof localStorage   !== 'undefined' && localStorage.getItem('token')) ||
- api/proteger-pagina.js:293 — (typeof localStorage   !== 'undefined' && localStorage.getItem('token')) ||
- api/proteger-pagina.js:294 — (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('token')) ||
- api/proteger-pagina.js:294 — (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('token')) ||
- api/remote-adapter.js:58 — (typeof localStorage   !== 'undefined' && localStorage.getItem('token')) ||
- api/remote-adapter.js:58 — (typeof localStorage   !== 'undefined' && localStorage.getItem('token')) ||
- api/remote-adapter.js:59 — (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('token')) ||
- api/remote-adapter.js:59 — (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('token')) ||
- auditoria.js:55 — const __token  = (localStorage.getItem('auth.token') || '');
- cadastro-cliente.html:590 — const t = localStorage.getItem('token') || sessionStorage.getItem('token');
- cadastro-cliente.html:590 — const t = localStorage.getItem('token') || sessionStorage.getItem('token');
- cadastro-usuario.html:267 — const t = localStorage.getItem('token') || sessionStorage.getItem('token');
- cadastro-usuario.html:267 — const t = localStorage.getItem('token') || sessionStorage.getItem('token');
- checklist-materiais.html:595 — let token = localStorage.getItem(K) || '';
- checklist-materiais.html:599 — localStorage.setItem(K, token);
- cliente-detalhado.html:42 — if (!localStorage.getItem('auth.token')) {
- cliente-detalhado.html:43 — localStorage.setItem('auth.token', token);
- cliente-detalhado.html:47 — if (!sessionStorage.getItem('auth.token')) {
- cliente-detalhado.html:48 — sessionStorage.setItem('auth.token', token);
- cliente-detalhado.html:708 — if (!localStorage.getItem('auth.token')) {
- cliente-detalhado.html:709 — localStorage.setItem('auth.token', 'dev-token');
- formulario-cliente.html:332 — const token = localStorage.getItem("token") || sessionStorage.getItem("token");
- formulario-cliente.html:332 — const token = localStorage.getItem("token") || sessionStorage.getItem("token");
- formulario-lead.html:193 — const token = localStorage.getItem('token') || sessionStorage.getItem('token');
- formulario-lead.html:193 — const token = localStorage.getItem('token') || sessionStorage.getItem('token');
- kgb-common.js:16 — const token = localStorage.getItem("AUTH_TOKEN");
- login.html:198 — localStorage.removeItem("token");
- login.html:199 — sessionStorage.removeItem("token");
- login.html:202 — localStorage.setItem("token", tokenFake);
- login.html:203 — localStorage.setItem("auth.token", tokenFake);
- orcamento-detalhado.js:310 — console.warn("[LEAD] Erro ao salvar token no localStorage", e);
- orcamento.js:709 — sessionStorage.setItem(`proposta:${token}`, JSON.stringify({ lead: payloadLead }));
- perfis.html:367 — const t = localStorage.getItem('token') || sessionStorage.getItem('token');
- perfis.html:367 — const t = localStorage.getItem('token') || sessionStorage.getItem('token');
- permissoes.js:14 — const t = localStorage.getItem("token") || sessionStorage.getItem("token");
- permissoes.js:14 — const t = localStorage.getItem("token") || sessionStorage.getItem("token");