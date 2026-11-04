// Igual ao `npm start`, mas escutando na rede local (exige senha definida).
process.env.EXPOR_NA_REDE = '1';
await import('../servidor/index.js');
