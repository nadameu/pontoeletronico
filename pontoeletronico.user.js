// ==UserScript==
// @name        Ponto eletrônico
// @namespace   http://github.com/nadameu/pontoeletronico
// @description Relatório de ponto eletrônico
// @require     https://code.jquery.com/jquery-2.1.1.min.js
// @include     http://apl.jfpr.gov.br/pe/App_View/relatorio_1.aspx
// @version     7
// @grant       none
// ==/UserScript==

var MINUTOS_DE_TOLERANCIA = 15;
var FERIADOS = new Set();

$(function() {
  $('head').append('<style>' + [
    'tr.ultima { border-bottom: 2px solid black; }',
    'span.naoUteisTrabalhados { font-weight: bold; color: #262; }',
    'span.faltas { font-weight: bold; color: #c33; }',
    'td.resultado { font-weight: bold; color: #262; border-color: #696969; }',
    'td.saldoNegativo { color: #c33; }',
    'td.saldoIgnorado { text-decoration: line-through; font-weight: normal; }',
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
        var parts = xhr.responseText.split('|');
        if (parts[2] === 'ctl00_ContentPlaceHolder1_UpdatePanel1') {
          analisarFeriados();
          try {
            obterJornada();
          } catch (ex) {
            // Não está na tela que desejamos
            return;
          }
          analisarRegistros();
        }
      }
    };
    return oldXHR.prototype.send.apply(xhr, arguments);
  }
  return xhr;
};

function analisarRegistros() {
  var jornada = obterJornada();
  var dataInicio = obterDataInicio();
  var dataFim = obterDataFim();
  var diasUteis = 0;
  var diasUteisTrabalhados = 0;
  var diasNaoUteis = 0;
  var diasNaoUteisTrabalhados = 0;
  var somaParcial = 0;
  var somaTotal = 0;
  var faltas = new Faltas();
  var ultimoRegistro = null;
  var tabela = $('#ctl00_ContentPlaceHolder1_GridView1');
  if (tabela.size() === 1) {
    var elementoTabela = tabela.get(0);
    var proximoIrmaoTabela = elementoTabela.nextSibling;
    var paiTabela = elementoTabela.parentNode;
    paiTabela.removeChild(elementoTabela);
  }
  tabela.find('tbody tr:has(th):not(:has(#tituloColunaSaldo))').each((indice, elemento) => $(elemento).append('<th id="tituloColunaSaldo">Saldo</th>'));
  var linhas = Array.prototype.slice.call(tabela.find('tbody tr:has(td)'));
  var registros = Registros.fromLinhas(linhas);
  for (var dataAtual = dataInicio; dataAtual.valueOf() <= dataFim.valueOf(); dataAtual = proximoDia(dataAtual)) {
    var feriado = ehFeriado(dataAtual);
    var textoDataAtual = formatarData(dataAtual);
    if (feriado) {
      diasNaoUteis++;
      somaParcial = 0;
    } else {
      diasUteis++;
      somaParcial = 0 - jornada.valueOf();
    }
    if (registros.hasOwnProperty(textoDataAtual)) {
      var registroAnterior = new Registro();
      var registrosData = registros[textoDataAtual];
      for (var registroAtual of registrosData) {
        if (faltas.length) {
          faltas.inserirAntesDe(registroAtual.linha);
        }
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
          somaParcial += registroAtual.timestamp.valueOf() - registroAnterior.timestamp.valueOf();
        }
        ultimoRegistro = registroAnterior = registroAtual;
      }
      registrosData.ultimoRegistro.formatarUltimoRegistro(somaParcial);
      if (feriado) {
        diasNaoUteisTrabalhados++;
      } else {
        diasUteisTrabalhados++;
      }
    } else {
      if (! feriado) {
        faltas.enfileirar(dataAtual);
      }
    }
    var minutosParcial = milissegundosParaMinutos(somaParcial);
    if (Math.abs(minutosParcial) >= MINUTOS_DE_TOLERANCIA) {
      somaTotal += somaParcial;
    }
    somaParcial = 0;
  }
  if (faltas.length && ultimoRegistro) {
    faltas.inserirApos(ultimoRegistro.linha);
  }
  var saldo = $('#ctl00_ContentPlaceHolder1_lblSalR');
  saldo.html(formatarMinutos(milissegundosParaMinutos(somaTotal))).css('color', (somaTotal < 0) ? '#c33' : '#262');
  saldo.after('<br/><span style="font-size: 0.8em;"> (ignorando diferenças inferiores a ' + MINUTOS_DE_TOLERANCIA + ' minutos de tolerância).</span>');
  definirDiasTrabalhados(diasUteis, diasUteisTrabalhados, diasNaoUteis, diasNaoUteisTrabalhados);
  paiTabela.insertBefore(elementoTabela, proximoIrmaoTabela);
}

function obterJornada() {
  var texto = $('#ctl00_ContentPlaceHolder1_lblJornR').get(0).textContent;
  var valor = textoParaDataHora('01/01/2001 ' + texto) - textoParaDataHora('01/01/2001 00:00:00');
  return valor;
}

function obterDataInicio() {
  var texto = $('#ctl00_ContentPlaceHolder1_lblInicio').get(0).textContent;
  var textoData = /^Início: (\d{2}\/\d{2}\/\d{4})$/.exec(texto)[1];
  var valor = textoParaData(textoData);
  return valor;
}

function obterDataFim() {
  var texto = $('#ctl00_ContentPlaceHolder1_lblFim').get(0).textContent;
  var textoData = /^Fim: (\d{2}\/\d{2}\/\d{4})$/.exec(texto)[1];
  var valor = textoParaData(textoData);
  return valor;
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

function proximoDia(data) {
  var proximo = new Date(data.getFullYear(), data.getMonth(), data.getDate() + 1, 0, 0, 0, 0);
  return proximo;
}

function Registros() {
}
Registros.prototype = {
}
Registros.prototype.constructor = Registros;
Registros.fromLinhas = function(linhas) {
  var registros = new Registros();
  for (var linha of linhas) {
    var registro = Registro.fromLinha(linha);
    var data = registro.data;
    if (! (data in registros)) {
      registros[data] = [];
    }
    registros[data].push(registros[data].ultimoRegistro = registro);
  };
  return registros;
};

function Registro() {
}
Registro.prototype = {
  celula: null,
  celulaTipo: null,
  data: '',
  linha: null,
  timestamp: 0,
  tipo: 'S',
  destacarErroTipo: function() {
    this.celulaTipo.classList.add('erro');
  },
  formatarUltimoRegistro: function(somaParcial) {
    this.linha.classList.add('ultima');
    var minutos = milissegundosParaMinutos(somaParcial);
    this.celula.textContent = formatarMinutos(minutos);
    if (minutos < 0) {
      this.celula.classList.add('saldoNegativo');
    }
    if (Math.abs(minutos) < MINUTOS_DE_TOLERANCIA) {
      this.celula.classList.add('saldoIgnorado')
    }
    if (this.tipo == 'E') {
      this.celula.classList.add('erro');
    }
  }
};
Registro.prototype.constructor = Registro;
Registro.fromLinha = function(linha) {
  var timestamp = textoParaDataHora(linha.cells[0].textContent);
  var registro = new Registro();
  registro.celulaTipo = linha.cells[2];
  registro.data = formatarData(timestamp);
  registro.linha = linha;
  registro.timestamp = timestamp;
  registro.tipo = (linha.cells[2].textContent === 'Entrada') ? 'E' : 'S';
  var celula = $(linha).find('.resultado');
  if (celula.size() === 1) {
    registro.celula = celula.get(0);
  } else {
    registro.celula = $('<td class="resultado"></td>').get(0);
    $(linha).append(registro.celula);
  }
  return registro;
};

function Faltas() {
}
Faltas.prototype = Object.create(Array.prototype);
Faltas.prototype.constructor = Faltas;
Faltas.prototype.enfileirar = function(data) {
  this.push(data.toLocaleFormat('%d/%m/%Y'));
}
Faltas.prototype.gerarHTML = function(texto) {
  return '<tr class="ultima" style="font-family: Arial; font-size: 8pt;"><td colspan="2">' + texto + '</td><td class="erro">Falta</td><td colspan="4"></td></tr>';
};
Faltas.prototype.inserirAntesDe = function(linha) {
  var ultimaLinha = linha;
  for (var texto of this) {
    var linhaNova = $(this.gerarHTML(texto));
    $(ultimaLinha).before(linhaNova);
    ultimaLinha = linhaNova;
  }
  this.splice(0, this.length);
};
Faltas.prototype.inserirApos = function(linha) {
  var ultimaLinha = linha;
  for (var texto of this) {
    var linhaNova = $(this.gerarHTML(texto));
    $(ultimaLinha).after(linhaNova);
    ultimaLinha = linhaNova;
  }
  this.splice(0, this.length);
};

function textoParaData(texto) {
  var [d, m, y] = texto.split(/[\/]/g);
  var data = new Date(y, m - 1, d, 0, 0, 0, 0);
  return data;
}

function textoParaDataHora(texto) {
  var [d, m, y, h, i, s] = texto.split(/[ :\/]/g);
  var data = new Date(y, m - 1, d, h, i, s, 0);
  return data;
}

function milissegundosParaMinutos(ms) {
  return Math.round(ms / 1000 / 60);
}

function formatarData(timestamp) {
  return timestamp.toLocaleFormat('%Y-%m-%d');
}

function formatarMinutos(minutos) {
  var minutosAbsoluto = Math.abs(minutos);
  var sinal = minutos / minutosAbsoluto;
  var h = Math.floor(minutosAbsoluto / 60);
  var m = Math.floor(minutosAbsoluto % 60);
  m = '0'.repeat(2 - m.toString().length) + m;
  return (sinal < 0 ? '-' : '') + [h, m].join(':');
}

function analisarFeriados() {
  analisarCalendario('ctl00_ContentPlaceHolder1_Calendar1');
  analisarCalendario('ctl00_ContentPlaceHolder1_Calendar2');
}

function analisarCalendario(id) {
  var tabela = $('#' + id);
  var nomeMes;
  tabela.find('td[style*="width:70%"]').each(function (indiceCelula, celula) {
    nomeMes = celula.textContent;
  });
  var mesAtual;
  tabela.find('a[title="Go to the previous month"]').each(function (indiceLink, link) {
    var diasMesAnteriorDesdeDoisMil = Number(link.href.match(/,'V(\d+)'\)/) [1]);
    var mesAnterior = new Date(2000, 0, 1 + diasMesAnteriorDesdeDoisMil, 0, 0, 0, 0);
    mesAtual = new Date(mesAnterior.getFullYear(), mesAnterior.getMonth() + 1, 1);
  });
  tabela.find('td[style*="width:14%"]').has('a[title$=" de ' + nomeMes + '"]').each(function (indiceCelula, celula) {
    if (celula.style.color === 'Red') {
      var dataAtual = formatarData(new Date(mesAtual.getFullYear(), mesAtual.getMonth(), Number(celula.textContent)));
      FERIADOS.add(dataAtual);
    }
  });
}

function ehFeriado(data) {
  if (data.getDay() == 0 || data.getDay() == 6) {
    return true;
  }
  if (FERIADOS.has(formatarData(data))) {
    return true;
  }
  return false;
}
