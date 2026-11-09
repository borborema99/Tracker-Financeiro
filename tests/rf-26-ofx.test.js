import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decodificarOfx, lerOfx, parseDataOfx, parseValorOfx } from '../servidor/dominio/ofx.js';

test('RF-26: valores em centavos inteiros, com sinal, ponto ou vírgula, sem float', () => {
  assert.equal(parseValorOfx('-1234.56'), -123456);
  assert.equal(parseValorOfx('1234,5'), 123450);
  assert.equal(parseValorOfx('+10'), 1000);
  assert.equal(parseValorOfx('1.234,56'), 123456);
  assert.equal(parseValorOfx('1,234.56'), 123456);
  assert.equal(parseValorOfx('1.234.567'), 123456700);
  assert.equal(parseValorOfx('0.10'), 10);
  assert.equal(parseValorOfx('19.90'), 1990);
  assert.equal(parseValorOfx('10.500'), 1050, 'zeros além do centavo são aceitos');
  assert.equal(parseValorOfx('10.505'), null, 'não existe meio centavo');
  assert.equal(parseValorOfx('1.234'), null, 'três casas com valor: recusado, não vira milhar por chute');
  for (const ruim of ['', 'abc', '--5', '1,2,3,4x', '12e3', null, undefined]) assert.equal(parseValorOfx(ruim), null, String(ruim));
});

test('RF-26: data só com AAAAMMDD, ignora hora e fuso, recusa data impossível', () => {
  assert.equal(parseDataOfx('20260610120000[-3:BRT]'), '2026-06-10');
  assert.equal(parseDataOfx('20260610'), '2026-06-10');
  assert.equal(parseDataOfx('20261301'), null);
  assert.equal(parseDataOfx('20260230'), null);
  assert.equal(parseDataOfx('ontem'), null);
});

const SGML = `OFXHEADER:100
DATA:OFXSGML
VERSION:102
CHARSET:1252

<OFX>
<BANKMSGSRSV1><STMTTRNRS><STMTRS>
<CURDEF>BRL
<BANKACCTFROM><BANKID>0001<ACCTID>12345-6<ACCTTYPE>CHECKING</BANKACCTFROM>
<BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260610120000[-3:BRT]<TRNAMT>-45.90<FITID>A1<MEMO>MERCADO CENTRAL</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20260611<TRNAMT>3000,00<FITID>A2<NAME>SALARIO<MEMO>SALARIO JUNHO</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260612<TRNAMT>-10.00<FITID>A1<MEMO>REPETIDA</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261399<TRNAMT>-1.00<FITID>A3<MEMO>DATA RUIM</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260613<TRNAMT>0.00<FITID>A4<MEMO>ZERO</STMTTRN>
</BANKTRANLIST>
</STMTRS></STMTTRNRS></BANKMSGSRSV1>
</OFX>`;

test('RF-26: lê OFX 1.x (SGML): sinal vira receita ou despesa, descrição junta NAME e MEMO sem repetir', () => {
  const r = lerOfx(SGML);
  assert.equal(r.moeda, 'BRL');
  assert.equal(r.banco, '0001');
  assert.equal(r.conta, '12345-6');
  assert.deepEqual(r.transacoes, [
    { fitid: 'A1', data: '2026-06-10', valor_centavos: -4590, descricao: 'MERCADO CENTRAL' },
    { fitid: 'A2', data: '2026-06-11', valor_centavos: 300000, descricao: 'SALARIO JUNHO' },
  ]);
  assert.deepEqual(r.invalidas.map((i) => [i.indice, i.motivo]), [
    [3, 'Transação repetida no arquivo (mesmo FITID).'],
    [4, 'Data inválida.'],
    [5, 'Valor zero.'],
  ]);
});

test('RF-26: lê OFX 2.x (XML) com entidades', () => {
  const xml = `<?xml version="1.0"?><?OFX OFXHEADER="200" VERSION="211"?>
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><CURDEF>BRL</CURDEF><BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT</TRNTYPE><DTPOSTED>20260605</DTPOSTED><TRNAMT>-12.30</TRNAMT><FITID>X1</FITID><NAME>Padaria &amp; Cia</NAME><MEMO>Pão &#233; bom</MEMO></STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;
  const r = lerOfx(xml);
  assert.deepEqual(r.transacoes, [{ fitid: 'X1', data: '2026-06-05', valor_centavos: -1230, descricao: 'Padaria & Cia - Pão é bom' }]);
});

test('RF-26: sem FITID a chave é estável e distingue transações idênticas; moeda vem do arquivo', () => {
  const corpo = (curdef) => `<OFX><CURDEF>${curdef}<BANKTRANLIST>
<STMTTRN><DTPOSTED>20260601<TRNAMT>-5.00<MEMO>CAFE</STMTTRN>
<STMTTRN><DTPOSTED>20260601<TRNAMT>-5.00<MEMO>CAFE</STMTTRN>
</BANKTRANLIST></OFX>`;
  const a = lerOfx(corpo('BRL'));
  const b = lerOfx(corpo('BRL'));
  assert.equal(a.transacoes.length, 2);
  assert.notEqual(a.transacoes[0].fitid, a.transacoes[1].fitid);
  assert.deepEqual(a.transacoes.map((t) => t.fitid), b.transacoes.map((t) => t.fitid));
  assert.equal(lerOfx(corpo('usd')).moeda, 'USD');
});

test('RF-26: arquivo que não é OFX é recusado; a codificação segue o cabeçalho (1252) ou cai para 1252', () => {
  assert.throws(() => lerOfx('isto é só um texto'), /não parece ser um extrato OFX/);
  const latin = Buffer.from('OFXHEADER:100\nCHARSET:1252\n\n<OFX><STMTTRN><MEMO>AÇÚCAR', 'latin1');
  assert.match(decodificarOfx(latin), /AÇÚCAR/);
  const semCabecalho = Buffer.from('<OFX><STMTTRN><MEMO>AÇÚCAR', 'latin1');
  assert.match(decodificarOfx(semCabecalho), /AÇÚCAR/);
  assert.match(decodificarOfx(Buffer.from('<OFX><STMTTRN><MEMO>AÇÚCAR', 'utf8')), /AÇÚCAR/);
});
