# Evidências — Render OK (Auth + Buffet endpoints)

Data: 2026-01-05

Base URL: https://kgb-api.onrender.com

## Login
LOGIN_STATUS 200
LOGIN_BODY {"ok":true,"data":{"id":"kgb-admin","nome":"Administrador","email":"admin@kgb.com","perfil":"Administrador","permissoes":["*"]},"token":"kgb_1767595948788_7614"}

## /buffet/produtos (GET / PUT / GET)
GET1_STATUS 200
GET1_BODY {"ok":true,"data":[{"id":"p1","nome":"Teste-1767595911883"}]}

PUT_STATUS 200
PUT_BODY {"ok":true}

GET2_STATUS 200
GET2_BODY {"ok":true,"data":[{"id":"p1","nome":"Teste-1767595947835"}]}

## /buffet/adicionais
STATUS 200
BODY {"ok":true,"data":[]}

## /buffet/servicos
STATUS 200
BODY {"ok":true,"data":[]}

## Conclusão
- Render está executando kgb-api/server.js
- Auth mock funcional
- Endpoints /buffet/* funcionais e persistindo dados
- Base cloud liberada para migração dos módulos (remoção de localStorage)
