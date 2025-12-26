import { enviarWhatsApp } from './integracoes/whatsapp/index.js';
import { gerarBoleto, gerarPix } from './integracoes/pagamento/index.js';
import { enviarContrato } from './integracoes/zapsign/index.js';
import { criarEventoGoogleAgenda } from './integracoes/google-agenda/index.js';

export const IntegracoesAPI = {
  whatsapp: {
    enviar: enviarWhatsApp
  },
  pagamento: {
    gerarBoleto,
    gerarPix
  },
  zapsign: {
    enviarContrato
  },
  agenda: {
    criarEvento: criarEventoGoogleAgenda
  }
};
