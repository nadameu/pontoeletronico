// ==UserScript==
// @name        Ponto eletrônico
// @namespace   http://github.com/nadameu/pontoeletronico
// @description Relatório de ponto eletrônico
// @require     https://code.jquery.com/jquery-2.1.1.min.js
// @include     http://apl.jfpr.gov.br/pe/App_View/relatorio_1.aspx
// @version     10
// @grant       none
// ==/UserScript==

'use strict';

var MINUTOS_DE_TOLERANCIA = 15;
var PRESCRICAO = 90;
var FERIADOS = {};

$(function() {
  $('head').append('<style>' + [
    'tr.ultima { border-width: 0 0 2px 0; border-color: black; border-style: none none solid none; }',
    'span.naoUteisTrabalhados { font-weight: bold; color: #262; }',
    'span.faltas { font-weight: bold; color: #c33; }',
    'td.resultado { font-weight: bold; color: #262; border-color: #696969; }',
    'td.saldoNegativo { color: #c33; }',
    'td.saldoIgnorado { text-decoration: line-through; font-weight: normal; }',
    'td.alterado { color: #c63; border-color: #696969; }',
    'td.erro { background-color: #c33; color: white; border-color: #696969; }'
  ].join('\n') + '</style>');
});

var oldXHR = window.XMLHttpRequest;
window.XMLHttpRequest = function () {
  var xhr = new oldXHR();
  xhr.send = function () {
    var oldfn = xhr.onreadystatechange;
    xhr.onreadystatechange = function () {
      oldfn.apply(xhr, arguments);
      if (xhr.readyState === 4) {
        try {
          analisarFeriados();
          analisarRegistros();
        } catch (ex) {
          // Não está na tela que desejamos
          throw ex;
        }
      }
    };
    return oldXHR.prototype.send.apply(xhr, arguments);
  }
  return xhr;
};

function analisarFeriados() {
  analisarCalendario(1);
  analisarCalendario(2);
}

function analisarCalendario(id) {
  var tabela = $('#ctl00_ContentPlaceHolder1_Calendar' + id);
  tabela.find('td[style="color:Red;width:14%;"] a[href]').each(function (indiceLink, link) {
    var diasDesdeDoisMil = Number(/','(\d+)'\)/.exec(link.href)[1]);
    var data = DateHelper.toISODate(DateFactory.diasDesdeDoisMil(diasDesdeDoisMil));
    FERIADOS[data] = true;
  });
}

function analisarRegistros() {

  var jornada = obterJornada();
  DiaUtil.definirJornadaPadrao(jornada);

  var dataInicio = obterDataInicio();
  var dataFim = obterDataFim();
  var intervalo = new Intervalo(dataInicio, dataFim);

  var tabela = $('#ctl00_ContentPlaceHolder1_GridView1');
  if (tabela.size() !== 1) return;

  var elementoTabela = tabela.get(0);
  var tbody = elementoTabela.createTBody();
  var proximoIrmaoTabela = elementoTabela.nextSibling;
  var paiTabela = elementoTabela.parentNode;
  paiTabela.removeChild(elementoTabela);

  tabela.find('tbody tr:has(th):not(:has(#tituloColunaSaldo))').each(function(indiceLinha, linha) {
    linha.cells[3].textContent = 'Justificativa';
    linha.deleteCell(4);
    $(linha).append('<th id="tituloColunaSaldo">Saldo</th><th>Motivo</th>')
  });

  var linhas = Array.prototype.slice.call(tabela.find('tbody tr:has(td)'));
  intervalo.analisarLinhas(linhas);
/*
  var datas = Object.keys(intervalo);
  var indice = datas.length - 1;
  var contagem = 0;
  while (contagem <= PRESCRICAO && indice > -1) {
    ++contagem;
    var dataAtual = datas[indice];
    var dia = intervalo[dataAtual];
    if (dia.compensacao || (dia.falta && (dia instanceof DiaUtil))) {
      contagem = 0;
    } else if (dia.zerado) {
      contagem = PRESCRICAO;
      break;
    }
    --indice;
  }
  var dataAConsiderar = DateFactory.deslocarDias(dia.data, contagem - PRESCRICAO);
  console.log(DateHelper.toLocaleDate(dataAConsiderar));
  
  for (var i = indice; i > -1; --i) {
    var dia = intervalo[ datas[i] ];
    dia.saldoConsiderado = 0;
    if (contagem === PRESCRICAO) {
      dia.motivo = 'Zerado';
    } else {
      dia.motivo = 'Prescrito';
    }
  }
  
  if (contagem > 0) {
    intervalo.analisarCompensacoes(dataInicio, dataFim);
  } else {
    intervalo.analisarCompensacoes(dataAConsiderar, dataFim);
  }
  */
  intervalo.analisarCompensacoes(dataInicio, dataFim);
  intervalo.inserirLinhasEm(tbody);
  
  var saldo = $('#ctl00_ContentPlaceHolder1_lblSalR');
  saldo.html(IntervalHelper.toMinutesString(intervalo.saldoConsiderado)).css('color', (intervalo.saldoConsiderado < 0) ? '#c33' : '#262');
  var tabelaSaldo = saldo.parents('table:first');
  var aviso = $('<p style="font-family: Arial; color: #696969;">Ignorando diferenças inferiores a ' + MINUTOS_DE_TOLERANCIA + ' minutos de tolerância.</p>').css({textAlign: 'right', fontSize: '0.8em'});
  tabelaSaldo.after(aviso);
  if (dataInicio.getTime() > intervalo.dataIdeal.getTime()) {
    aviso.append('<br/><span style="color: #c33;">Para cálculo do saldo correto selecione como data de início:<br/>' + DateHelper.toDateExtenso(intervalo.dataIdeal) + '.</span>');
  } else if (dataInicio.getTime() < intervalo.dataConsiderada.getTime()) {
    aviso.append('<br/>Considerando apenas registros a partir de ' + DateHelper.toLocaleDate(intervalo.dataConsiderada.getTime()));
    if (intervalo.dataConsiderada.getTime() !== intervalo.dataIdeal.getTime()) {
      aviso.append(' (saldo zerado).');
    } else {
      aviso.append(' (' + PRESCRICAO +' dias de prescrição).');
    }
  }
    
  definirDiasTrabalhados(intervalo.diasUteis, intervalo.diasUteisTrabalhados, intervalo.feriados, intervalo.feriadosTrabalhados);

  paiTabela.insertBefore(elementoTabela, proximoIrmaoTabela);

}

function obterJornada() {
  var texto = $('#ctl00_ContentPlaceHolder1_lblJornR').get(0).textContent;
  return DateFactory.hmsTexto(texto).getTime();
}

function obterDataInicio() {
  var texto = $('#ctl00_ContentPlaceHolder1_lblInicio').get(0).textContent;
  var textoData = /^Início: (\d{2}\/\d{2}\/\d{4})$/.exec(texto)[1];
  return DateFactory.dataTexto(textoData);
}

function obterDataFim() {
  var texto = $('#ctl00_ContentPlaceHolder1_lblFim').get(0).textContent;
  var textoData = /^Fim: (\d{2}\/\d{2}\/\d{4})$/.exec(texto)[1];
  return DateFactory.dataTexto(textoData);
}

function definirDiasTrabalhados(diasUteis, diasUteisTrabalhados, diasNaoUteis, diasNaoUteisTrabalhados) {
  $('#ctl00_ContentPlaceHolder1_lblDiaUR').html(diasUteis);
  $('#ctl00_ContentPlaceHolder1_lblDUTR').html('(' + diasUteisTrabalhados + ' trabalhados)');
  $('#ctl00_ContentPlaceHolder1_lblSDFPR').html(diasNaoUteis);
  var estilo = '';
  if (diasNaoUteisTrabalhados > 0) {
    estilo = 'naoUteisTrabalhados';
  }
  $('#ctl00_ContentPlaceHolder1_lblSDFR').html('(<span class="' + estilo + '">' + diasNaoUteisTrabalhados + '</span> trabalhados)');
  var faltas = diasUteis - diasUteisTrabalhados;
  var estilo = '';
  if (faltas > 0) {
    estilo = 'faltas';
  }
  $('#ctl00_ContentPlaceHolder1_lblFaltasR').html('<span class="' + estilo + '">' + faltas + '</span>');
}

/*** FUNÇÕES AUXILIARES ***/

var DateFactory = {
  dataHoraTexto: function(texto) {
    var [trash, d, m, y, h, i, s] = /(\d+)\/(\d+)\/(\d+) (\d+):(\d+):(\d+)/.exec(texto);
    return new Date(y, m - 1, d, h, i, s, 0);
  },
  dataTexto: function(texto) {
    var [trash, d, m, y] = /(\d+)\/(\d+)\/(\d+)/.exec(texto);
    return DateFactory.dmy(d, m, y);
  },
  deslocarDias: function(data, dias) {
    return DateFactory.dmy(data.getDate() + dias, data.getMonth() + 1, data.getFullYear());
  },
  diasDesdeDoisMil: function(diasDesdeDoisMil) {
    return DateFactory.deslocarDias(DateFactory.dmy(1, 1, 2000), diasDesdeDoisMil);
  },
  diaSeguinte: function(data) {
    return DateFactory.deslocarDias(data, 1);
  },
  dmy: function(d, m, y) {
    var diaAnterior = new Date(y, m - 1, d - 1, 23, 59, 59, 999);
    return new Date(diaAnterior.getTime() + 1);
  },
  hmsTexto: function(texto) {
    return new Date(Date.parse('T' + texto + 'Z'));
  }
};

var DateHelper = (function() {
  var extenso = new Intl.DateTimeFormat('pt-BR', {day: 'numeric', month: 'long', year: 'numeric'});
  var normal = new Intl.DateTimeFormat('pt-BR');
  return {
    toDateExtenso: function(data) {
      return extenso.format(data);
    },
    toISODate: function(data) {
      return data.toLocaleFormat('%Y-%m-%d');
    },
    toLocaleDate: function(data) {
      return normal.format(data);
    }
  };
})();

var IntervalHelper = {
  toMinutes: function(interval) {
    return (interval / 60 / 1000) | 0;
  },
  toMinutesString: function(interval) {
    var minutos = IntervalHelper.toMinutes(interval);
    var minutosAbsoluto = Math.abs(minutos);
    var sinal = Math.sign(minutos);
    var h = (minutosAbsoluto / 60) | 0;
    var m = minutosAbsoluto % 60;
    m = '0'.repeat(2 - m.toString().length) + m;
    return (sinal < 0 ? '-' : '') + h + ':' + m;
  }
};

/*** CLASSES ***/

function Dia(data) {
  this.data = data;
  this.registros = [];
  this.saldoConsiderado = this.saldo = 0 - this.jornadaPadrao;
}
Dia.prototype = {
  compensacao: false,
  data: null,
  falta: true,
  jornadaPadrao: 0,
  motivo: '',
  registros: null,
  saldo: 0,
  saldoConsiderado: 0,
  trabalhado: 0,
  ultimoRegistro: null,
  zerado: false,
  inserirLinhasEm: function(tbody) {
    this.getLinhas().forEach(function(linha, indiceLinha) {
      tbody.appendChild(linha);
    });
    if (this.registros.length !== 0) {
      this.ultimoRegistro.formatarUltimoRegistro(this.saldo, this.saldoConsiderado, this.motivo);
    }
  },
  inserirRegistro: function(registro) {
    var indice = this.registros.push(registro) - 1;
    registro = this.registros[indice];
    var ultimoTipo = this.ultimoRegistro ? this.ultimoRegistro.tipo : 'S';
    if (ultimoTipo === 'S') {
      if (registro.tipo === 'S') {
        registro.destacarErroTipo();
        registro.tipo = 'E';
      }
    } else if (ultimoTipo === 'E') {
      if (registro.tipo === 'E') {
        registro.destacarErroTipo();
        registro.tipo = 'S';
      }
      this.trabalhado += registro.dataHora.getTime() - this.ultimoRegistro.dataHora.getTime();
      this.saldo = this.trabalhado - this.jornadaPadrao;
      if (Math.abs(this.saldo) < MINUTOS_DE_TOLERANCIA * 60 * 1000) {
        this.saldoConsiderado = 0;
        this.motivo = '<' + MINUTOS_DE_TOLERANCIA + 'min';
      } else {
        this.saldoConsiderado = this.saldo;
      }
    }
    if (registro.dataHora.getTime() !== registro.alteracao.dataHora.getTime()) {
      registro.destacarRegistroAlterado();
    }
    if (registro.justificativa === 'Compensação por serviço extraordinário') {
      this.compensacao = true;
    } else if (/zerado/i.exec(registro.justificativa)) {
      this.zerado = true;
    }
    this.ultimoRegistro = registro;
    this.falta = false;
  }
};
Dia.prototype.constructor = Dia;
Dia.criar = function(data, textoData) {
  if (textoData in FERIADOS || data.getDay() % 6 === 0) {
    return new Feriado(data);
  } else {
    return new DiaUtil(data);
  }
};

function Feriado(data) {
  Dia.call(this, data);
}
Feriado.prototype = Object.create(Dia.prototype);
Feriado.prototype.constructor = Feriado;
Feriado.prototype.getLinhas = function() {
  if (this.falta) {
    return [];
  } else {
    return Array.map(this.registros, (registro) => registro.getLinha());
  }
};

function DiaUtil(data) {
  Dia.call(this, data);
}
DiaUtil.prototype = Object.create(Dia.prototype);
DiaUtil.prototype.constructor = DiaUtil;
DiaUtil.prototype.getLinhas = function() {
  if (this.falta) {
    this.ultimoRegistro = this.registros[this.registros.length++] = new Falta(this.data);
  }
  return Array.map(this.registros, (registro) => registro.getLinha());
};

DiaUtil.definirJornadaPadrao = function(jornadaPadrao) {
  DiaUtil.prototype.jornadaPadrao = jornadaPadrao;
};

function Intervalo(inicio, fim) {
  Object.defineProperties(this, {
    dataConsiderada: { value: null, writable: true },
    dataIdeal: { value: null, writable: true },
    diasUteis: { value: 0, writable: true },
    diasUteisTrabalhados: { value: 0, writable: true },
    feriados: { value: 0, writable: true },
    feriadosTrabalhados: { value: 0, writable: true },
    saldoConsiderado: { value: 0, writable: true }
  });
  for (var dataAtual = inicio, fimMs = fim.getTime(); dataAtual.getTime() <= fimMs; dataAtual = DateFactory.diaSeguinte(dataAtual)) {
    var textoDataAtual = DateHelper.toISODate(dataAtual);
    var dia = this[textoDataAtual] = Dia.criar(dataAtual, textoDataAtual);
    if (dia instanceof DiaUtil) {
      ++this.diasUteis;
    } else {
      ++this.feriados;
    }
  }
}
Intervalo.prototype = Object.create(null, {
  constructor: { value: Intervalo },
  dataConsiderada: { value: null },
  dataIdeal: { value: null },
  diasUteis: { value: 0 },
  diasUteisTrabalhados: { value: 0 },
  feriados: { value: 0 },
  feriadosTrabalhados: { value: 0 },
  saldoConsiderado: { value: 0 },
  analisarCompensacoes: {
    value: function(inicio, fim) {
      var datas = Object.keys(this);
      var contagemPrescricao = PRESCRICAO;
      var dataIdeal, dataConsiderada;
      for (var indice = datas.length - 1; contagemPrescricao > -1 && indice > -1; --indice) {
        var dia = this[ datas[indice] ];
        if (dia.compensacao || (dia.falta && (dia instanceof DiaUtil))) {
          contagemPrescricao = PRESCRICAO;
        } else if (dia.zerado) {
          contagemPrescricao = -2;
          dataIdeal = dia.data;
          dataConsiderada = DateFactory.diaSeguinte(dia.data);
          break;
        } else {
          --contagemPrescricao;
        }
      }
      if (contagemPrescricao === -1) {
        dataIdeal = dataConsiderada = dia.data;
      } else if (indice === -1) {
        ++contagemPrescricao;
        dataConsiderada = dia.data;
        dataIdeal = DateFactory.deslocarDias(dataConsiderada, -contagemPrescricao);
      }
      this.dataIdeal = dataIdeal;
      this.dataConsiderada = dataConsiderada;
      return;
      
      var indice, indiceCompensacao;
      indice = indiceCompensacao = datas.indexOf(DateHelper.toISODate(inicio));
      for (var len = datas.length; indice < len; ++indice) {
        var dataAtual = datas[indice];
        var dia = this[dataAtual];
//        if (dia.compensacao || (dia.falta && (dia instanceof DiaUtil))) {
        if (dia.saldoConsiderado < 0) {
          console.log('data a compensar:', DateHelper.toLocaleDate(dia.data));
          console.log('dias entre última compensação e hoje:', indice - indiceCompensacao);
          var saldo = dia.saldoConsiderado;
//          for (; saldo < 0 && indiceCompensacao < indice; ++indiceCompensacao) {
          for (; saldo < 0 && indiceCompensacao < len; ++indiceCompensacao) {
            var dataCompensacao = datas[indiceCompensacao];
            var diaCompensacao = this[dataCompensacao];
            if (diaCompensacao.saldoConsiderado > 0) {
              var diminuir = Math.min(diaCompensacao.saldoConsiderado, -saldo);

              saldo += diminuir;
              dia.motivo = 'Parcialmente compensado';

              diaCompensacao.saldoConsiderado -= diminuir;
              if (diaCompensacao.saldoConsiderado == 0) {
                diaCompensacao.motivo = 'Compensado';
                console.log('Dia', DateHelper.toLocaleDate(diaCompensacao.data),'colaborou.');
              } else {
                diaCompensacao.motivo = 'Parcialmente compensado';
                console.log('Dia', DateHelper.toLocaleDate(diaCompensacao.data),'compensou integralmente.');
                break;
              }
            }
          }
          dia.saldoConsiderado = saldo;
          if (saldo === 0) {
            dia.motivo = 'Compensado';
          }
        }
      }
      for (; indiceCompensacao < len; ++indiceCompensacao) {
        console.log('implementar prescrição dos remanescentes');
        
      }
    }
  },
  analisarLinhas: {
    value: function(linhas) {
      var datas = Object.keys(this);
      var indice = 0;
      for (var linha of linhas) {
        var registro = Registro.fromLinha(linha);
        var data = registro.textoData;
        while (data !== datas[indice]) {
          var dia = this[ datas[indice++] ];
          this.verificarDiaTrabalhado(dia);
        }
        var dia = this[data];
        dia.inserirRegistro(registro);
      }
      while (indice < datas.length) {
        var dia = this[ datas[indice++] ];
        this.verificarDiaTrabalhado(dia);
      }
      console.log(this);
    }
  },
  inserirLinhasEm: {
    value: function(tbody) {
      for (var data in this) {
        var dia = this[data];
        this.saldoConsiderado += dia.saldoConsiderado;
        dia.inserirLinhasEm(tbody);
        if (dia.zerado) {
          this.saldoConsiderado = 0;
        }
      }
    }
  },
  verificarDiaTrabalhado: {
    value: function(dia) {
      if (! dia.falta) {
        if (dia instanceof DiaUtil) {
          ++this.diasUteisTrabalhados;
        } else if (dia instanceof Feriado) {
          ++this.feriadosTrabalhados;
        }
      }
    }
  }
});

function Registro() {
  this.alteracao = {
    dataHora: null,
    usuario: ''
  };
}
Registro.prototype = {
  linha: null,
  dataHora: null,
  textoData: '',
  alteracao: null,
  tipo: 'S',
  justificativa: null,
  destacarErroTipo: function() {
     this.linha.cells[2].classList.add('erro');
  },
  destacarRegistroAlterado: function() {
     this.linha.cells[1].classList.add('alterado');
  },
  getLinha: function() {
    return this.linha;
  },
  formatarUltimoRegistro: function(saldo, saldoConsiderado, motivo) {
    this.linha.className = 'ultima';
    var celula;
    celula = this.linha.insertCell();
    celula.textContent = IntervalHelper.toMinutesString(saldo);
    var classes = ['resultado'];
    if (saldo < 0) {
      classes.push('saldoNegativo');
    }
    if (saldoConsiderado === 0) {
      classes.push('saldoIgnorado')
    }
    if (this.tipo == 'E') {
      classes.push('erro');
    }
    celula.className = classes.join(' ');
    this.linha.insertCell().textContent = motivo;
  }
};
Registro.prototype.constructor = Registro;
Registro.fromLinha = function(linha) {
  var dataHora = DateFactory.dataHoraTexto(linha.cells[0].textContent);
  var dataHoraAlteracao = DateFactory.dataHoraTexto(linha.cells[1].textContent);
  var tipo = (linha.cells[2].textContent === 'Entrada') ? 'E' : 'S';
  var justificativa = linha.cells[3].textContent.trim();
  if (justificativa === '') justificativa = linha.cells[4].textContent.trim();
  if (justificativa === '') justificativa = null;
  var usuarioAlteracao = linha.cells[5].textContent;
  
  var textoData = DateHelper.toISODate(dataHora);
  
  linha.cells[3].textContent = justificativa;
  linha.deleteCell(4);
  
  var registro = new Registro();
  registro.linha = linha;
  registro.dataHora = dataHora;
  registro.alteracao.dataHora = dataHoraAlteracao;
  registro.tipo = tipo;
  registro.justificativa = justificativa;
  registro.alteracao.usuario = usuarioAlteracao;
  registro.textoData = textoData;
  return registro;
};

function Falta(data) {
  var celulaVazia = '<td><br/></td>';
  this.linha = $('<tr class="ultima" style="font-family: Arial; font-size: 8pt;"><td>' + DateHelper.toLocaleDate(data) + '</td>' + celulaVazia + '<td class="erro">Falta</td>' + celulaVazia.repeat(2) + '</tr>').get(0);
}
Falta.prototype = Object.create(Registro.prototype);
Falta.prototype.constructor = Falta;
