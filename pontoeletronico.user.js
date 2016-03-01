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
    'tr.ultima { border-bottom: 2px solid black; }',
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
  var tabela = $('#ctl00_ContentPlaceHolder1_GridView1');
  if (tabela.size() !== 1) return;
  var elementoTabela = tabela.get(0);
  var tbody = elementoTabela.createTBody();
  var proximoIrmaoTabela = elementoTabela.nextSibling;
  var paiTabela = elementoTabela.parentNode;
  paiTabela.removeChild(elementoTabela);
  tabela.find('tbody tr:has(th):not(:has(#tituloColunaSaldo))').each((indice, elemento) => $(elemento).append('<th id="tituloColunaSaldo">Saldo</th>'));

  var linhas = Array.prototype.slice.call(tabela.find('tbody tr:has(td)'));
  var registros = Registros.fromLinhas(linhas);
  var registrosPorData = Datas.fromRegistros(registros);
  console.log('registrosPorData', registrosPorData);
  var dataInicio = obterDataInicio();
  var dataFim = obterDataFim();
  for (var dataAtual = dataInicio, timestampFim = dataFim.getTime(); dataAtual.getTime() <= timestampFim; dataAtual = DateFactory.diaSeguinte(dataAtual)) {
    var textoDataAtual = DateHelper.toISODate(dataAtual);
    var registrosDataAtual = registrosPorData[textoDataAtual];
    if (typeof registrosDataAtual !== 'undefined') {
      registrosDataAtual.forEach(function(registro, indiceRegistro) {
        if (indiceRegistro === registrosDataAtual.length - 1) {
          registro.formatarUltimoRegistro(0);
        }
        tbody.appendChild(registro.linha);
      });
    } else {
      if (! ehFeriado(dataAtual)) {
        new Falta(dataAtual).inserirEm(tbody);
      }
    }
  }
  




  paiTabela.insertBefore(elementoTabela, proximoIrmaoTabela);
  return;


  /*** FIM ***/

  var jornada = obterJornada();
  var diasUteis = 0;
  var diasUteisTrabalhados = 0;
  var diasNaoUteis = 0;
  var diasNaoUteisTrabalhados = 0;
  var somaParcial = 0;
  var somaTotal = 0;
  var faltas = new Faltas();
  var ultimoRegistro = null;
  var compensacoes = [];
  var ignorarCompensacoes = false;
  var linhasPorData = obterDatasAPartirDeLinhas(linhas);
  for (var dataAtual = dataInicio, timestampFim = dataFim.getTime(); dataAtual.getTime() <= timestampFim; dataAtual = DateFactory.diaSeguinte(dataAtual)) {
    var textoDataAtual = DateHelper.toISODate(dataAtual);
    var feriado = ehFeriado(dataAtual, textoDataAtual);
    if (feriado) {
      ++diasNaoUteis;
      somaParcial = 0;
    } else {
      ++diasUteis;
      somaParcial = 0 - jornada.getTime();
    }
    if (textoDataAtual in linhasPorData) {
      var registroAnterior = new Registro();
      var linhasDataAtual = linhasPorData[textoDataAtual];
      for (var linha of linhasDataAtual) {
        if (faltas.length) {
          faltas.inserirAntesDe(linhas[linha]);
        }
        var registroAtual = Registro.fromLinha(linhas[linha]);
        if (registroAnterior.tipo == 'S') {
          if (registroAtual.tipo == 'S') {
            registroAtual.destacarErroTipo();
            registroAtual.tipo = 'E';
          }
        } else if (registroAnterior.tipo == 'E') {
          if (registroAtual.tipo == 'E') {
            registroAtual.destacarErroTipo();
            registroAtual.tipo = 'S';
          }
          somaParcial += registroAtual.timestamp.getTime() - registroAnterior.timestamp.getTime();
        }
        if (registroAtual.timestamp - registroAtual.registroEfetivo !== 0) {
          registroAtual.destacarRegistroAlterado();
        }
        ultimoRegistro = registroAnterior = registroAtual;
      }
      ultimoRegistro.formatarUltimoRegistro(somaParcial);
      if (feriado) {
        ++diasNaoUteisTrabalhados;
      } else {
        ++diasUteisTrabalhados;
      }
      if (registroAtual.justificativa === 'Compensação por serviço extraordinário') {
        compensacoes.push(dataAtual);
      } else if (/zerado/i.exec(registroAtual.justificativa)) {
        somaParcial = 0;
        somaTotal = 0;
        ignorarCompensacoes = true;
      }
    } else {
      if (! feriado) {
        faltas.enfileirar(dataAtual);
        compensacoes.push(dataAtual);
      }
    }
    var minutosParcial = IntervalHelper.toMinutes(somaParcial);
    if (Math.abs(minutosParcial) >= MINUTOS_DE_TOLERANCIA) {
      somaTotal += somaParcial;
    }
    if (! feriado && textoDataAtual in linhasPorData) {
      ultimoRegistro.formatarUltimoRegistro(somaTotal);
    }
    somaParcial = 0;
  }
  if (faltas.length && ultimoRegistro) {
    faltas.inserirApos(ultimoRegistro.linha);
  }
  var dataAConsiderar = DateFactory.deslocarDias(dataFim, - PRESCRICAO);
  for (var i = compensacoes.length - 1; i >= 0; --i) {
    if (compensacoes[i].getTime() > dataAConsiderar.getTime()) {
      dataAConsiderar = DateFactory.deslocarDias(compensacoes[i], - PRESCRICAO);
    }
  }
  var saldo = $('#ctl00_ContentPlaceHolder1_lblSalR');
  if (ignorarCompensacoes || dataInicio.getTime() === dataAConsiderar.getTime()) {
    saldo.html(IntervalHelper.toMinutesString(somaTotal)).css('color', (somaTotal < 0) ? '#c33' : '#262');
    saldo.after('<br/><span style="font-size: 0.8em;"> (ignorando diferenças inferiores a ' + MINUTOS_DE_TOLERANCIA + ' minutos de tolerância).</span>');
  } else {
    saldo.html('Para cálculo do saldo correto selecione como data de início:<br/>' + DateHelper.toDateExtenso(dataAConsiderar)).css({'font-weight': 'normal', 'color': '#c33'});
  }
  definirDiasTrabalhados(diasUteis, diasUteisTrabalhados, diasNaoUteis, diasNaoUteisTrabalhados);
  if (tabela.size() === 1) {
    paiTabela.insertBefore(elementoTabela, proximoIrmaoTabela);
  }
}

function obterJornada() {
  var texto = $('#ctl00_ContentPlaceHolder1_lblJornR').get(0).textContent;
  return DateFactory.hmsTexto(texto);
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

function obterDatasAPartirDeLinhas(linhas) {
  var datas = {};
  for (var i = 0, l = linhas.length; i < l; ++i) {
    var linha = linhas[i];
    var texto = linha.cells[0].textContent;
    var data = DateHelper.toISODate(DateFactory.dataHoraTexto(texto));
    if (! (data in datas)) {
      datas[data] = new Set();
    }
    datas[data].add(i);
  }
  return datas;
}

function ehFeriado(data) {
  var texto = DateHelper.toISODate(data);
  if (texto in FERIADOS) {
    return true;
  }
  if (data.getDay() == 0 || data.getDay() == 6) {
    return true;
  }
  return false;
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
    return Math.round(interval / 60 / 1000);
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

function Datas() {
}
Datas.prototype = Object.create(null);
Datas.fromRegistros = function(registros) {
  var datas = new Datas();
  registros.forEach(function(registro, indiceRegistro) {
    if (! (registro.data in datas)) {
      datas[registro.data] = new Registros();
    }
    var registrosDataAtual = datas[registro.data];
    registrosDataAtual.push(registro);
  });
  return datas;
};

function Falta(data) {
  this.data = DateHelper.toLocaleDate(data);
}
Falta.prototype = {
  constructor: Falta,
  data: '',
  gerarHTML: function() {
    var celulaVazia = '<td><br/></td>';
    return '<tr class="ultima" style="font-family: Arial; font-size: 8pt;"><td>' + this.data + '</td>' + celulaVazia + '<td class="erro">Falta</td>' + celulaVazia.repeat(4) + '</tr>';
  },
  inserirEm: function(tbody) {
    var linhaNova = $(this.gerarHTML()).get(0);
    tbody.appendChild(linhaNova);
  }
};

function Registros() {
}
Registros.prototype = Object.create(Array.prototype);
Registros.prototype.constructor = Registros;
Registros.fromLinhas = function(linhas) {
  var registros = new Registros();
  linhas.forEach(function(linha, indiceLinha) {
    registros[registros.length++] = Registro.fromLinha(linha);
  });
  return registros;
}

function Registro() {
}
Registro.prototype = {
  celula: null,
  celulaTipo: null,
  data: '',
  linha: null,
  registroEfetivo: 0,
  timestamp: 0,
  tipo: 'S',
  justificativa: null,
  destacarErroTipo: function() {
     this.linha.cells[2].classList.add('erro');
  },
  destacarRegistroAlterado: function() {
     this.linha.cells[1].classList.add('alterado');
  },
  formatarUltimoRegistro: function(somaParcial) {
    this.linha.className = 'ultima';
    var celula;
    celula = this.linha.insertCell();
    var minutos = IntervalHelper.toMinutes(somaParcial);
    celula.textContent = IntervalHelper.toMinutesString(somaParcial);
    var classes = ['resultado'];
    if (minutos < 0) {
      classes.push('saldoNegativo');
    }
    if (Math.abs(minutos) < MINUTOS_DE_TOLERANCIA) {
      classes.push('saldoIgnorado')
    }
    if (this.tipo == 'E') {
      classes.push('erro');
    }
    celula.className = classes.join(' ');
  }
};
Registro.prototype.constructor = Registro;
Registro.fromLinha = function(linha) {
  var timestamp = DateFactory.dataHoraTexto(linha.cells[0].textContent);
  var data = DateHelper.toISODate(timestamp);
  var registroEfetivo = DateFactory.dataHoraTexto(linha.cells[1].textContent);
  var justificativa = linha.cells[3].textContent.trim();
  if (justificativa === '') justificativa = linha.cells[4].textContent.trim();
  if (justificativa === '') justificativa = null;
  var registro = new Registro();
  registro.linha = linha;
  registro.timestamp = timestamp;
  registro.data = data;
  registro.registroEfetivo = registroEfetivo;
  registro.tipo = (linha.cells[2].textContent === 'Entrada') ? 'E' : 'S';
  registro.justificativa = justificativa;
  return registro;
};
