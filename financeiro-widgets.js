const FG_KEY='financeiroGlobal';
const BRL = n => (Number(n)||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const read = k => { try{return JSON.parse(localStorage.getItem(k)||'null')}catch{return null} };
const get = () => read(FG_KEY) || { contas:[], parcelas:[], lancamentos:[], saldoPorConta:{} };

export function renderSaldoGeral(slotSel){
  const g = get();
  const total = Object.values(g.saldoPorConta||{}).reduce((a,b)=>a+Number(b||0),0);
  document.querySelector(slotSel).textContent = BRL(total);
}
export function renderMinhasContas(slotSmallSel, tableSel){
  const g = get(); const contas = g.contas||[];
  document.querySelector(slotSmallSel).textContent = `${contas.length} conta(s)`;
  const tb = document.querySelector(tableSel);
  if (!tb) return;
  tb.innerHTML = '';
  for (const c of contas){
    const tr = document.createElement('tr');
    const saldo = (g.saldoPorConta||{})[c.id] ?? c.saldoInicial ?? 0;
    tr.innerHTML = `<td>${c.nome}</td><td>${c.tipo||'-'}</td><td>${BRL(saldo)}</td>`;
    tb.appendChild(tr);
  }
}
export function renderTotalFaturas(slotSel,{mes}){
  const g = get();
  const y_m = mes;
  // faturas: parcelas pendentes de contas tipo "cartao_credito" no mês selecionado
  const cartoes = (g.contas||[]).filter(c=>c.tipo==='cartao_credito').map(c=>c.id);
  const total = (g.parcelas||[])
    .map(p=>({p, l:(g.lancamentos||[]).find(x=>x.id===p.lancamentoId)}))
    .filter(x=>x.l && cartoes.includes(x.l.contaId))
    .filter(x=>x.p.status!=='pago' && (x.p.vencimento||'').slice(0,7)===y_m)
    .reduce((s,x)=>s+Number(x.p.valor||0),0);
  document.querySelector(slotSel).textContent = BRL(total);
}
export function renderMeusCartoes(slotSel,{mes}){
  const g=get();
  const y_m = mes;
  const box = document.querySelector(slotSel);
  const cartoes = (g.contas||[]).filter(c=>c.tipo==='cartao_credito');
  box.innerHTML = cartoes.map(c=>{
    const totalMes = (g.parcelas||[])
      .map(p=>({p, l:(g.lancamentos||[]).find(x=>x.id===p.lancamentoId)}))
      .filter(x=>x.l && x.l.contaId===c.id && x.p.status!=='pago' && (x.p.vencimento||'').slice(0,7)===y_m)
      .reduce((s,x)=>s+Number(x.p.valor||0),0);
    return `<div style="display:flex;justify-content:space-between;align-items:center;">
      <div><strong>${c.nome}</strong><div style="font-size:12px;color:#6b513f;">Fatura ${y_m}</div></div>
      <div style="display:flex;gap:8px;align-items:center;">
        <div>${BRL(totalMes)}</div>
        <button class="btn-ghost" data-pagar="${c.id}" title="Pagar fatura"><i data-lucide="badge-dollar-sign"></i></button>
      </div>
    </div>`;
  }).join('');
  try{ window.lucide?.createIcons?.(); }catch{}
  box.querySelectorAll('button[data-pagar]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      // abre modal para pagar (gera um lançamento de saída para a conta do cartão)
      window.FinModal?.openNovo();
      // depois de salvar, você pode usar openBaixa se quiser marcar como pago
    });
  });
}
