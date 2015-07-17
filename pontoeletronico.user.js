// ==UserScript==
// @name        Ponto eletrônico
// @namespace   http://github.com/nadameu/pontoeletronico
// @description Relatório de ponto eletrônico
// @require     https://code.jquery.com/jquery-2.1.1.min.js
// @include     http://apl.jfpr.gov.br/pe/App_View/relatorio_1.aspx
// @version     8
// @grant       none
// ==/UserScript==

'use strict';

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
        try {
          obterJornada();
        } catch (ex) {
          // Não está na tela que desejamos
          return;
        }
        analisarFeriados();
        analisarRegistros();
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
  var linhasPorData = obterDatasAPartirDeLinhas(linhas);
  for (var dataAtualMs = dataInicio.getTime(), dataFimMs = dataFim.getTime() + 86400000, dataAtual; dataAtualMs < dataFimMs; dataAtualMs += 86400000) {
    dataAtual = new Date(dataAtualMs);
    var textoDataAtual = formatarData(dataAtual);
    var feriado = ehFeriado(dataAtual, textoDataAtual);
    if (feriado) {
      ++diasNaoUteis;
      somaParcial = 0;
    } else {
      ++diasUteis;
      somaParcial = 0 - jornada.valueOf();
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
          somaParcial += registroAtual.timestamp.valueOf() - registroAnterior.timestamp.valueOf();
        }
        ultimoRegistro = registroAnterior = registroAtual;
      }
      ultimoRegistro.formatarUltimoRegistro(somaParcial);
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
  if (tabela.size() === 1) {
  paiTabela.insertBefore(elementoTabela, proximoIrmaoTabela);
  }
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

function obterDatasAPartirDeLinhas(linhas) {
  var datas = {};
  for (var i = 0, l = linhas.length; i < l; ++i) {
    var linha = linhas[i];
    var texto = linha.cells[0].textContent;
    var data = formatarData(textoParaDataHora(texto));
    if (! (data in datas)) {
      datas[data] = new Set();
    }
    datas[data].add(i);
  }
  return datas;
}

function formatarData(timestamp) {
  return timestamp.toLocaleFormat('%Y-%m-%d');
}

function textoParaDataHora(texto) {
  var [d, m, y, h, i, s] = texto.split(/[ :\/]/g);
  var data = new Date(y, m - 1, d, h, i, s, 0);
  return data;
}

function ehFeriado(data, texto) {
  if (FERIADOS.has(texto)) {
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

function Faltas() {
}
Faltas.prototype = Object.create(Array.prototype);
Faltas.prototype.constructor = Faltas;
Faltas.prototype.enfileirar = function(data) {
  this.push(data.toLocaleFormat('%d/%m/%Y'));
}
Faltas.prototype.gerarHTML = function(texto) {
  var celulaVazia = '<td><br/></td>';
  return '<tr class="ultima" style="font-family: Arial; font-size: 8pt;"><td>' + texto + '</td>' + celulaVazia + '<td class="erro">Falta</td>' + celulaVazia.repeat(4) + '</tr>';
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
     this.linha.cells[2].classList.add('erro');
  },
  formatarUltimoRegistro: function(somaParcial) {
    this.linha.className = 'ultima';
    var celula;
    celula = this.linha.insertCell();
    var minutos = milissegundosParaMinutos(somaParcial);
    celula.textContent = formatarMinutos(minutos);
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
  var timestamp = textoParaDataHora(linha.cells[0].textContent);
  var registro = new Registro();
  registro.linha = linha;
  registro.timestamp = timestamp;
  registro.tipo = (linha.cells[2].textContent === 'Entrada') ? 'E' : 'S';
  return registro;
};

function textoParaData(texto) {
  var [d, m, y] = texto.split(/[\/]/g);
  var data = new Date(y, m - 1, d, 0, 0, 0, 0);
  return data;
}

function milissegundosParaMinutos(ms) {
  return Math.round(ms / 1000 / 60);
}

function formatarMinutos(minutos) {
  var minutosAbsoluto = Math.abs(minutos);
  var sinal = Math.sign(minutos);
  var h = (minutosAbsoluto / 60) | 0;
  var m = minutosAbsoluto % 60;
  m = '0'.repeat(2 - m.toString().length) + m;
  return (sinal < 0 ? '-' : '') + h + ':' + m;
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
