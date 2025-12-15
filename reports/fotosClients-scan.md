# Scan de usos de `fotosClientes`

Este relatório lista locais no código que ainda fazem leitura/gravação direta de `localStorage['fotosClientes']` ou que referenciam a key. Recomenda-se revisar cada item e migrar para `storageAdapter` ou usar `getFotosClientesSync()`.

Encontrado (amostras):

- `cadastro-evento.js`: fallback de leitura síncrona (linha aproximada: 345)
- `evento-detalhado.js`: várias leituras/gravações síncronas (linhas aproximadas: 1689, 1780, 3486, 3509)
- `lista-evento.html`: leitura síncrona (linha aproximada: 349)
- `area-cliente.js`: leitura síncrona residual (linha aproximada: 208)
- `public/api/storage-adapter.js`: contém comentários e código relacionado ao tratamento de `fotosClientes`

Recomendações rápidas:

1. Incluir `public/js/fotos-shim.js` no topo das páginas principais (antes de scripts que leem `localStorage`), ex:

```html
<script src="/public/js/fotos-shim.js"></script>
<script src="/public/api/storage-adapter.js"></script>
```

2. Preferir `await storageAdapter.getJSON('fotosClientes')` ou `await storageAdapter.preload()` seguido de `window.__FOTOS_CLIENTES_PRELOAD__` para leituras assíncronas.

3. Remover `localStorage.setItem('fotosClientes', ...)` e substituir por `storageAdapter.setJSON('fotosClientes', map)`.

4. Após deploy em staging, planejar a remoção do fallback síncrono em um PR separado com QA.

---

Gerado automaticamente como parte da tarefa de migração para armazenamento em nuvem.
