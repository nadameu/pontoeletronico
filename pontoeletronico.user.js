// ==UserScript==
// @name        Ponto eletrônico
// @namespace   http://github.com/nadameu/pontoeletronico
// @description Relatório de ponto eletrônico
// @require     https://code.jquery.com/jquery-2.1.1.min.js
// @include     http://apl.jfpr.gov.br/pe/App_View/relatorio_1.aspx
// @version     6
// @grant       none
// ==/UserScript==
var MINUTOS_DE_TOLERANCIA = 15;
var FERIADOS = {
  '*': [
    '01/01',
    '02/01',
    '03/01',
    '04/01',
    '05/01',
    '06/01',
    '02/02',
    '21/04',
    '01/05',
    '11/08',
    '07/09',
    '12/10',
    '28/10',
    '01/11',
    '02/11',
    '20/11',
    '08/12',
    '09/12',
    '20/12',
    '21/12',
    '22/12',
    '23/12',
    '24/12',
    '25/12',
    '26/12',
    '27/12',
    '28/12',
    '29/12',
    '30/12',
    '31/12'
  ],
  '2015': [
    '16/02',
    '17/02',
    '01/04',
    '02/04',
    '03/04',
    '04/06'
  ]
};
function analisar() {
  var jornada = obterJornada();
  var faltas = obterFaltas();
  var diasUteis = obterDiasUteis();
  var diasUteisTrabalhados = obterDiasUteisTrabalhados();
  var diasNaoUteis = obterDiasNaoUteis();
  var diasNaoUteisTrabalhados = 0;
  var diasTrabalhados = 0;
  var registroAnterior = {
    timestamp: null,
    data: null,
    tipo: 'S',
    celula: null
  },
  ultimaEntrada,
  somaParcial = 0,
  somaTotal = 0 - (diasUteis * jornada);
  $('#ctl00_ContentPlaceHolder1_GridView1 tbody tr') .has('th') .each(function (indice, elemento) {
    if ($(elemento) .has('#tituloColunaSaldo') .size() > 0) {
      return ;
    }
    $(elemento) .append('<th id="tituloColunaSaldo">Saldo</th>');
  }
  );
  var linhas = $('#ctl00_ContentPlaceHolder1_GridView1 tbody tr') .has('td');
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
      var saldo;
      if (ehFeriado(registro)) {
        saldo = minutos;
      } else {
        saldo = minutos - milissegundosParaMinutos(jornada.valueOf());
        somaTotal += jornada.valueOf();
        somaParcial -= jornada.valueOf();
      }
      registro.celula.textContent = formatarMinutos(saldo);
      registro.celula.style.color = (saldo < 0) ? 'red' : 'green';
      if (Math.abs(saldo) >= MINUTOS_DE_TOLERANCIA) {
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
      somaParcial = 0;
      diasTrabalhados++;
    }
    registroAnterior = registro;
    registro = proximoRegistro;
    linha = proximaLinha;
  } while (numLinha < linhas.size());
  var saldo = $('#ctl00_ContentPlaceHolder1_lblSalR');
  saldo.html(formatarMinutos(milissegundosParaMinutos(somaTotal))) .css('color', (somaTotal < 0) ? 'red' : 'green');
  saldo.parent() .html(saldo);
  saldo.after('<br/><span style="font-size: 0.8em;"> (ignorando diferenças inferiores a ' + MINUTOS_DE_TOLERANCIA + ' minutos de tolerância).</span>');
  definirDiasNaoUteisTrabalhados(diasTrabalhados - diasUteisTrabalhados);
}
function obterJornada() {
  var texto = $('#ctl00_ContentPlaceHolder1_lblJornR') .get(0) .textContent;
  var valor = textoParaData('01/01/2001 ' + texto) - textoParaData('01/01/2001 00:00:00');
  return valor;
}
function obterFaltas() {
  var elemento = $('#ctl00_ContentPlaceHolder1_lblFaltasR');
  var texto = elemento.get(0) .textContent;
  var valor = Number(texto);
  if (valor > 0) elemento.css({
    'color': 'red',
    'font-weight': 'bold'
  });
  return valor;
}
function obterDiasUteis() {
  var texto = $('#ctl00_ContentPlaceHolder1_lblDiaUR') .get(0) .textContent;
  var valor = Number(texto);
  return valor;
}
function obterDiasUteisTrabalhados() {
  var texto = $('#ctl00_ContentPlaceHolder1_lblDUTR') .get(0) .textContent;
  var valor = analisarValorTrabalhados(texto);
  return valor;
}
function obterDiasNaoUteis() {
  var texto = $('#ctl00_ContentPlaceHolder1_lblSDFPR') .get(0) .textContent;
  var valor = Number(texto);
  return valor;
}
function definirDiasNaoUteisTrabalhados(valor) {
  var estilo = '';
  if (valor > 0) {
    estilo = 'color: green; font-weight: bold;';
  }
  $('#ctl00_ContentPlaceHolder1_lblSDFR') .html('(<span style="' + estilo + '">' + valor + '</span> trabalhados)');
}
function analisarValorTrabalhados(texto) {
  var re = /^\((\d+) trabalhados\)$/;
  var resultado = re.exec(texto);
  if (resultado.length == 2) {
    return Number(resultado[1]);
  } else {
    throw new Error('Texto "' + texto + '" não formatado conforme esperado.');
  }
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
  registro.data = [
    ano,
    mes,
    dia
  ].join('-');
  registro.celula = $('.resultado', linha);
  if (registro.celula.size() == 1) {
    registro.celula = registro.celula.get(0);
  } else {
    registro.celula = $('<td class="resultado"></td>') .get(0);
    $(linha) .append(registro.celula);
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
  while (m.toString() .length < 2) {
    m = '0' + m;
  }
  return (sinal < 0 ? '-' : '') + [h,
  m].join(':');
}
function ehFeriado(registro) {
  if (registro.timestamp.getDay() == 0 || registro.timestamp.getDay() == 6) {
    return true;
  }
  var [ano,
  mes,
  dia] = registro.data.split('-'),
  data = [
    dia,
    mes
  ].join('/');
  if (FERIADOS['*'].indexOf(data) > - 1) {
    return true;
  } else if (FERIADOS[ano].indexOf(data) > - 1) {
    return true;
  }
  return false;
}

let oldXHR = window.XMLHttpRequest;
window.XMLHttpRequest = function() {
  var xhr = new oldXHR();
  xhr.send = function() {
    var oldfn = xhr.onreadystatechange;
    xhr.onreadystatechange = function() {
      oldfn.apply(xhr, arguments);
      if (xhr.readyState === 4) {
        var parts = xhr.responseText.split('|');
        if (parts[2] === 'ctl00_ContentPlaceHolder1_UpdatePanel1') {
          analisar();
        }
      }
    };
    return oldXHR.prototype.send.apply(xhr, arguments);
  }
  return xhr;
};
