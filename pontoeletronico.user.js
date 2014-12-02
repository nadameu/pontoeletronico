// ==UserScript==
// @name        Ponto eletrônico
// @namespace   http://github.com/nadameu/pontoeletronico
// @description Relatório de ponto eletrônico
// @require     https://code.jquery.com/jquery-2.1.1.min.js
// @include     http://apl.jfpr.gov.br/pe/App_View/relatorio_1.aspx
// @version     2
// @grant       none
// ==/UserScript==
var button = $('<button>') .html('Analisar') .on('click', function (ev) {
  ev.preventDefault();
  var jornada = $('#ctl00_ContentPlaceHolder1_lblJornR') .get(0) .textContent;
  var [hour,
  minute,
  second] = jornada.split(':');
  jornada = (new Date(0, 0, 0, hour, minute, second)) - (new Date(0, 0, 0, 0, 0, 0));
  var periodoEmAberto = false,
  dataAnterior = '0',
  soma = 0,
  timestampAnterior,
  celulaAnterior;
  $('#ctl00_ContentPlaceHolder1_GridView1 tbody tr') .each(function (i, row) {
    if (row.cells[0].tagName.toLowerCase() == 'th') return ;
    var registro = row.cells[0].textContent;
    var tipo = row.cells[2].textContent;
    var [day,
    month,
    year,
    hour,
    minute,
    second] = registro.split(/[\/ :]/);
    var timestamp = new Date(year, month - 1, day, hour, minute, second);
    var date = timestamp.toLocaleDateString();
    if (date != dataAnterior) {
      row.style.borderTop = '2px solid black';
      periodoEmAberto = false;
      if (celulaAnterior) {
        preencherDiferenca(celulaAnterior, soma, jornada);
      }
      soma = 0;
    }
    var newCell = $('<td></td>');
    if (((!periodoEmAberto) && tipo == 'Saída') || (periodoEmAberto && tipo == 'Entrada')) {
      newCell.html('Erro!') .css({
        'background-color': 'red',
        'color': 'white'
      });
    } else if (periodoEmAberto) {
      soma += timestamp - timestampAnterior;
    }
    $(row) .append(newCell);
    periodoEmAberto = (tipo == 'Entrada');
    dataAnterior = date;
    timestampAnterior = timestamp;
    celulaAnterior = newCell;
  });
  preencherDiferenca(celulaAnterior, soma, jornada);
});
$('#ctl00_ctl02') .before(button);
function preencherDiferenca(celula, tempoEfetivo, tempoEsperado) {
  var diff = (tempoEfetivo - tempoEsperado) / 1000 / 60;
  var symbol = diff / Math.abs(diff);
  diff = Math.abs(diff);
  var hour = Math.floor(diff / 60);
  var minute = Math.floor(diff % 60);
  while (minute.toString() .length < 2) {
    minute = '0' + minute;
  }
  celula.html((symbol < 0 ? '-' : '') + hour + ':' + minute);
  if (symbol < 0) {
    celula.css('color', 'red');
  } else {
    celula.css('color', 'green');
  }
  if (diff > 15) {
    celula.css('font-weight', 'bold');
  }
}
alert('Clique no botão "Analisar" após o carregamento dos dados do relatório.');
