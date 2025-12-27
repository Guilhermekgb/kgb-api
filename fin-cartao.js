// === fin-cartao.js — núcleo de faturas ===
(() => {
  if (window.finCartao) return;

  const FG_KEY  = 'financeiroGlobal';
  const CFG_KEY = 'configFinanceiro';

  const readLS = (k, fb)=>{ try{ return JSON.parse(localStorage.getItem(k)) ?? fb; } catch{ return fb; } };
  const writeLS = (k, v)=> localStorage.setItem(k, JSON.stringify(v||{}));
  const ISO = (d=new Date()) => new Date(d).toISOString().slice(0,10);

  function __cfg(){
    const cfg = readLS(CFG_KEY, {}) || {};
    cfg.cartoes = Array.isArray(cfg.cartoes) ? cfg.cartoes : [];
    cfg.contas  = Array.isArray(cfg.contas)  ? cfg.contas  : [];
    return cfg;
  }
  function __fgLoad(){
    const g = readLS(FG_KEY, {}) || {};
    g.lancamentos = Array.isArray(g.lancamentos) ? g.lancamentos : [];
    g.parcelas    = Array.isArray(g.parcelas)    ? g.parcelas    : [];
    g.movimentos  = Array.isArray(g.movimentos)  ? g.movimentos  : [];
    g.contas      = Array.isArray(g.contas)      ? g.contas      : [];
    return g;
  }
  function __fgSave(g){
    writeLS(FG_KEY, g);
    try{ window.dispatchEvent(new CustomEvent('fin-store-changed',{detail:{reason:'fg_save'}})); }catch{}
  }

  // Detecta se a conta é um cartão (pelo ID dentro de configFinanceiro.cartoes)
  function isContaCartao(contaId){
    const cfg = __cfg();
    return !!(cfg.cartoes||[]).find(c => String(c.id)===String(contaId));
  }

  // Regras de ciclo: dado dataCompra + (fechamento/vencimento), calcula as datas das N parcelas
  function __datasParcelasCartao({ dataCompraISO, nParcelas=1, fechamento=0, vencimento=1 }){
    // Regra: compras ATÉ o dia de fechamento entram na fatura que vence no mesmo mês (dia "vencimento").
    // Compras APÓS o fechamento entram no mês seguinte.
    const [Y,M,D] = String(dataCompraISO||ISO()).split('-').map(Number);
    const compra = new Date(Y,(M||1)-1,D||1);

    // Determina o mês/ano da primeira fatura
    const base = new Date(compra.getFullYear(), compra.getMonth(), 1);
    const fechoDia = Math.max(1, Math.min(31, parseInt(fechamento||0,10)));
    const vencDia  = Math.max(1, Math.min(31, parseInt(vencimento||1,10)));

    // Se comprou depois do fechamento, primeira fatura vai para o próximo mês
    let mesFatura = new Date(base);
    if (compra.getDate() > fechoDia) mesFatura.setMonth(mesFatura.getMonth()+1);

    // Datas: cada parcela vence no "vencimento" dos meses subsequentes
    const out = [];
    for (let i=0;i<nParcelas;i++){
      const d = new Date(mesFatura);
      d.setMonth(d.getMonth()+i, 1);              // vai para o 1º dia do mês alvo
      const last = new Date(d.getFullYear(), d.getMonth()+1, 0).getDate();
      d.setDate(Math.min(vencDia, last));         // clampa dia
      const yyyy = d.getFullYear();
      const mm   = String(d.getMonth()+1).padStart(2,'0');
      const dd   = String(d.getDate()).padStart(2,'0');
      out.push(`${yyyy}-${mm}-${dd}`);
    }
    return out;
  }

  // Cria parcelas do cartão no FG (todas pendentes)
  function criarParcelasDeCartao({ g, lanc, cartaoCfg, valorTotal, nParcelas, dataCompraISO }){
    const datas = __datasParcelasCartao({
      dataCompraISO,
      nParcelas,
      fechamento: Number(cartaoCfg?.fechamento||0),
      vencimento: Number(cartaoCfg?.vencimento||1),
    });

    const valor = Number(valorTotal||0);
    const valorParc = Math.round((valor / nParcelas)*100)/100;

    for (let i=0;i<datas.length;i++){
      const p = {
        id: 'parc_'+(crypto.randomUUID?.() || (Date.now().toString(36)+Math.random().toString(36).slice(2,8))),
        lancamentoId: String(lanc.id),
        descricao: (lanc.descricao||'') + ` (${i+1}/${nParcelas})`,
        valor: valorParc,
        totalPago: 0,
        status: 'pendente',
        contaId: String(lanc.contaId||''),       // a própria conta do CARTÃO
        formaId: String(lanc.formaId||''),
        vencimentoISO: String(datas[i]),
        dataPagamentoISO: '',
        createdAt: ISO(),
        updatedAt: ISO()
      };
      g.parcelas.push(p);
    }
  }

  // Soma a fatura (parcelas pendentes) de um cartão em AAAA-MM
  function totalFaturaMes(contaCartaoId, ano, mes){
    const g = __fgLoad();
    const ym = `${ano}-${String(mes).padStart(2,'0')}`;
    const pend = (g.parcelas||[]).filter(p =>
      String(p.contaId)===String(contaCartaoId) &&
      String(p.status||'').toLowerCase()==='pendente' &&
      String(p.vencimentoISO||'').slice(0,7)===ym
    );
    const sum = pend.reduce((a,p)=> a + Number(p.valor||0), 0);
    return { total: Math.round(sum*100)/100, parcelas: pend };
  }

  // Pagar a fatura: cria um Lançamento "Pagamento fatura ..." e BAIXA as parcelas do mês
  function pagarFaturaMes({ contaCartaoId, ano, mes, contaPagamentoId, descricaoExtra='' }){
    const g = __fgLoad();
    const cfg = __cfg();

    const cartao = (cfg.cartoes||[]).find(c => String(c.id)===String(contaCartaoId));
    const nomeCartao = cartao?.nome || 'Cartão';

    const { total, parcelas } = totalFaturaMes(contaCartaoId, ano, mes);
    if (!total || !parcelas.length) return { ok:false, msg:'Não há parcelas pendentes neste mês.' };

    // Data de pagamento = dia do vencimento do mês
    const vencDia = Number(cartao?.vencimento||1);
    const d = new Date(Number(ano), Number(mes)-1, 1);
    const last = new Date(d.getFullYear(), d.getMonth()+1, 0).getDate();
    d.setDate(Math.min(vencDia, last));
    const pagISO = ISO(d);

    // 1) Lançamento de pagamento da fatura (SAÍDA) usando a conta BANCÁRIA escolhida
    const lanc = {
      id: 'fat_'+(crypto.randomUUID?.() || (Date.now().toString(36)+Math.random().toString(36).slice(2,8))),
      tipo: 'saida',
      descricao: `Pagamento fatura ${nomeCartao} ${String(mes).padStart(2,'0')}/${ano}${descricaoExtra?(' — '+descricaoExtra):''}`,
      escopo: 'empresa',
      status: 'pago',
      contaId: String(contaPagamentoId||''),    // a conta que sai o dinheiro (BANCO/CAIXA)
      formaId: '',
      valor: Number(total),
      data: pagISO,
      createdAt: ISO(),
      updatedAt: ISO()
    };
    g.lancamentos.push(lanc);

    // 2) Baixa todas as parcelas do mês (do cartão)
    for (const p of parcelas){
      p.status = 'baixado';
      p.totalPago = Number(p.valor||0);
      p.dataPagamentoISO = pagISO;
      p.updatedAt = ISO();
    }

    __fgSave(g);
    try{ window.dispatchEvent(new CustomEvent('finmodal:confirm',{detail:{reason:'pagar_fatura', contaCartaoId, ano, mes}})); }catch{}
    return { ok:true, total, qtd: parcelas.length, pagISO };
  }

  window.finCartao = {
    __cfg, __fgLoad, __fgSave,
    isContaCartao,
    criarParcelasDeCartao,
    totalFaturaMes,
    pagarFaturaMes
  };
})();
