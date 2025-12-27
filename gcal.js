/* gcal.js — integração simples via link TEMPLATE
   - Abre o Google Calendar para criar um evento já preenchido
   - Sem OAuth: o evento abre na conta Google em que o usuário estiver logado
   - Usa fuso America/Sao_Paulo
   - Se necessário, exporte .ics (agenda.js já faz)
*/

(function(global){
  const TZ = 'America/Sao_Paulo';

  function dateTimeToGCal(dt){
    // dt: 'YYYY-MM-DDTHH:MM:SS' (local). Remove separadores -> YYYYMMDDTHHMMSS
    return String(dt||'').replace(/[-:]/g,'').replace('T','T');
  }
  function makeDatesParam(startISO, endISO){
    const a = dateTimeToGCal(startISO);
    const b = dateTimeToGCal(endISO || startISO);
    return `${a}/${b}`;
  }

  function openTemplate({ title, startISO, endISO, location, details }){
    const url = `https://calendar.google.com/calendar/render?action=TEMPLATE`+
      `&text=${encodeURIComponent(title||'Evento')}`+
      `&dates=${makeDatesParam(startISO,endISO)}`+
      `&details=${encodeURIComponent(details||'')}`+
      `&location=${encodeURIComponent(location||'')}`+
      `&ctz=${encodeURIComponent(TZ)}`;
    window.open(url, '_blank');
  }

  global.GCal = { openTemplate, makeDatesParam };
})(window);

