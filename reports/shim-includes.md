Adicionados inclusões do shim `fotos-shim.js` nas páginas principais para garantir que `localStorage.fotosClientes` seja espelhado para o `storageAdapter` quando disponível.

Páginas modificadas (arquivos fora do repositório `kgb-api`):
- ../evento-detalhado.html
- ../cadastro-evento.html

Nota: Os arquivos HTML estão no diretório raiz do workspace e não fazem parte do repositório `kgb-api`. Estas inclusões foram aplicadas localmente. O shim em `public/js/fotos-shim.js` está versionado no `kgb-api` e pode ser revisado no PR `cloud-migration-backup`.
