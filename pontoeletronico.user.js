// ==UserScript==
// @name        Ponto eletrônico
// @namespace   http://github.com/nadameu/pontoeletronico
// @description Relatório de ponto eletrônico
// @require     https://code.jquery.com/jquery-2.1.1.min.js
// @include     http://apl.jfpr.gov.br/pe/App_View/relatorio_1.aspx
// @version     4
// @grant       none
// ==/UserScript==
var MINUTOS_DE_TOLERANCIA = 15;
function analisar() {
  var jornada = obterJornada();
  var faltas = obterFaltas();
  var registroAnterior = {
    timestamp: null,
    data: null,
    tipo: 'S',
    celula: null
  },
  ultimaEntrada,
  somaParcial = 0 - jornada.valueOf(),
  somaTotal = 0 - (faltas * jornada);
  var linhas = $('#ctl00_ContentPlaceHolder1_GridView1 tbody tr').has('td');
  var numLinha = 0;
  var linha = linhas.get(numLinha);
  var registro = linhaParaRegistro(linha);
  do {
    if (registroAnterior.tipo == 'S') {
      if (registro.tipo == 'S') {
        linha.cells[2].style.background = 'red';
        linha.cells[2].style.color = 'white';
        registro.tipo = 'E';
      }
      ultimaEntrada = registro.timestamp.valueOf();
    } else if (registroAnterior.tipo == 'E') {
      if (registro.tipo == 'E') {
        linha.cells[2].style.background = 'red';
        linha.cells[2].style.color = 'white';
        registro.tipo = 'S';
      }
      somaParcial += registro.timestamp.valueOf() - ultimaEntrada;
    }
    var ultimaLinhaDoDia = false;
    try {
      var proximaLinha = linhas.get(++numLinha);
      var proximoRegistro = linhaParaRegistro(proximaLinha);
      ultimaLinhaDoDia = registro.data != proximoRegistro.data;
    } catch (e) {
      // Nao ha mais linhas
      ultimaLinhaDoDia = true;
    }
    if (ultimaLinhaDoDia) {
      linha.style.borderBottom = '2px solid black';
      var minutos = milissegundosParaMinutos(somaParcial);
      registro.celula.textContent = formatarMinutos(minutos);
      registro.celula.style.color = (minutos < 0) ? 'red' : 'green';
      if (Math.abs(minutos) >= MINUTOS_DE_TOLERANCIA) {
        registro.celula.style.textDecoration = 'none';
        registro.celula.style.fontWeight = 'bold';
        somaTotal += somaParcial;
      } else {
        registro.celula.style.textDecoration = 'line-through';
        registro.celula.style.fontWeight = 'normal';
      }
      if (registro.tipo == 'E') {
        registro.celula.style.background = 'red';
        registro.celula.style.color = 'white';
        registro.tipo = 'S';
      }
      somaParcial = 0 - jornada.valueOf();
    }
    registroAnterior = registro;
    registro = proximoRegistro;
    linha = proximaLinha;
  } while (numLinha < linhas.size());
  var saldo = $('#ctl00_ContentPlaceHolder1_lblSalR');
  saldo.html(formatarMinutos(milissegundosParaMinutos(somaTotal))).css('color', (somaTotal < 0) ? 'red' : 'green');
  saldo.parent().html(saldo);
  saldo.after('<br/><span style="font-size: 0.8em;"> (ignorando diferenças inferiores a ' + MINUTOS_DE_TOLERANCIA + ' minutos de tolerância).</span>');
}
function obterJornada() {
  var texto = $('#ctl00_ContentPlaceHolder1_lblJornR').get(0).textContent;
  var valor = textoParaData('01/01/2001 ' + texto) - textoParaData('01/01/2001 00:00:00');
  return valor;
}
function obterFaltas() {
  var texto = $('#ctl00_ContentPlaceHolder1_lblFaltasR').get(0).textContent;
  var valor = Number(texto);
  return valor;
}
function linhaParaRegistro(linha) {
  var registro = {
    timestamp: textoParaData(linha.cells[0].textContent),
    tipo: (linha.cells[2].textContent == 'Entrada') ? 'E' : 'S'
  };
  var dia = registro.timestamp.getDate() .toString();
  var mes = (registro.timestamp.getMonth() + 1) .toString();
  var ano = registro.timestamp.getFullYear() .toString();
  while (dia.length < 2) {
    dia = '0' + dia;
  }
  while (mes.length < 2) {
    mes = '0' + mes;
  }
  registro.data = [ano, mes, dia].join('-');
  registro.celula = $('.resultado', linha);
  if (registro.celula.size() == 1) {
    registro.celula = registro.celula.get(0);
  } else {
    registro.celula = $('<td class="resultado"></td>').get(0);
    $(linha).append(registro.celula);
  }
  return registro;
}
function textoParaData(texto) {
  var [d,
  m,
  y,
  h,
  i,
  s] = texto.split(/[ :\/]/g);
  var data = new Date(y, m - 1, d, h, i, s, 0);
  return data;
}
function milissegundosParaMinutos(ms) {
  return Math.round(ms / 1000 / 60);
}
function formatarMinutos(minutos) {
  var minutosAbsoluto = Math.abs(minutos);
  var sinal = minutos / minutosAbsoluto;
  var h = Math.floor(minutosAbsoluto / 60);
  var m = Math.floor(minutosAbsoluto % 60);
  while (m.toString().length < 2) {
    m = '0' + m;
  }
  return (sinal < 0 ? '-' : '') + [h,
  m].join(':');
}
var botao = criarBotao();
anexarBotaoAoMenu(botao);
function criarBotao() {
  return $('<button></button>').html('Analisar').on('click', function (ev) {
    ev.preventDefault();
    analisar();
  });
}
function anexarBotaoAoMenu(botao) {
  var menu = $('#ctl00_ctl02');
  menu.before(botao);
}
