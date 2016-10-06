Ponto eletrônico
================

Este é um script de usuário para o complemento Greasemonkey, do Firefox, para facilitar a utilização do _sistema antigo_ de ponto eletrônico da JFPR (http://apl.jfpr.gov.br/pe/).

Instalação
----------

É necessário utilizar o Mozilla Firefox com o complemento Greasemonkey instalado.

Para instalar o complemento Greasemonkey, clique <a href="https://addons.mozilla.org/pt-br/firefox/addon/greasemonkey/" target="_blank">aqui</a> e selecione a opção &ldquo;Add to Firefox&rdquo;.
Se necessário, reinicie o Firefox após a instalação.

Com o complemento instalado, clique <a href="https://github.com/nadameu/pontoeletronico/raw/master/pontoeletronico.user.js">aqui</a> para instalar o script.

Após instalado, o script será atualizado automaticamente sempre que houver uma versão nova.

Utilização
----------

No sistema de ponto eletrônico da JFPR, na tela de relatório, selecionar as datas desejadas.

O script informa a data inicial que deve ser selecionada, com base na prescrição das horas não utilizadas &mdash; 90 (noventa) dias.

É calculado o saldo de horas com base nas compensações realizadas e nas prescrições, descartando-se diferenças inferiores a 15 minutos de tolerância por dia (para mais ou para menos).

Eventuais erros de preenchimento &mdash; duas entradas ou duas saídas seguidas, dias com apenas um registro ou três (entrada-saída-entrada) &mdash; serão destacados com um fundo vermelho.

O script também destaca as ocasiões em que houve alteração de horário após o registro inicial.
