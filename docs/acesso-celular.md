# Acesso pelo celular

Por padrão o servidor escuta só em `localhost`. Nunca faça redirecionamento de porta (port forwarding) no roteador para este app.

## Mesmo Wi-Fi, sem HTTPS

1. `npm run setup` (se ainda não definiu a senha).
2. `npm run build` e `npm run iniciar:rede`.
3. Leia o QR code no terminal ou digite o endereço mostrado (ex.: `http://192.168.0.10:3000`).

Funciona completo como site. Em HTTP por IP o navegador não instala o app nem liga o cache offline. O servidor recusa abrir na rede se não houver senha.

## Caminho recomendado: Tailscale

Dá HTTPS de verdade e acesso de fora de casa sem abrir porta no roteador. O tráfego fica numa rede privada só sua.

1. Crie uma conta e instale o Tailscale no computador e no celular; entre com a mesma conta.
2. No painel do Tailscale, ative MagicDNS e HTTPS Certificates.
3. No computador, com o sistema rodando via `npm start` (sem expor na rede), rode: `tailscale serve --bg 3000`.
4. Anote o nome que aparece (algo como `meu-pc.tailnet-1234.ts.net`) e coloque no `.env`: `ORIGENS_PERMITIDAS=meu-pc.tailnet-1234.ts.net`. Reinicie o `npm start`.
5. No celular, com o Tailscale ligado, abra `https://meu-pc.tailnet-1234.ts.net`.

O `tailscale serve` conversa com o app por `127.0.0.1` e envia `X-Forwarded-Proto: https`. O servidor só confia nesse cabeçalho vindo de `127.0.0.1`, então o cookie sai com `Secure` e o PWA pode ser instalado. Não use `tailscale funnel`: ele publica na internet aberta.

## Alternativa só na rede local: mkcert

Exige instalar a autoridade certificadora (CA) no celular.

1. Instale o mkcert no computador e rode `mkcert -install`.
2. Gere o certificado para o IP do computador: `mkcert 192.168.0.10 localhost` (cria dois arquivos `.pem`). Guarde-os fora do repositório (a pasta `data/` serve).
3. No `.env`: `HTTPS_CERT=data/192.168.0.10+1.pem` e `HTTPS_KEY=data/192.168.0.10+1-key.pem`.
4. Copie o arquivo `rootCA.pem` (mostrado por `mkcert -CAROOT`) para o celular e instale como certificado confiável:
   - Android: Configurações > Segurança > Criptografia e credenciais > Instalar certificado > Certificado de CA.
   - iPhone: abra o arquivo, instale o perfil e ative em Ajustes > Geral > Sobre > Configurações de Certificado Confiável.
5. `npm run iniciar:rede` e abra `https://192.168.0.10:3000`.

A CA instalada confia em qualquer certificado que o seu mkcert gerar. Não compartilhe o `rootCA-key.pem` e remova a CA do celular se perder o computador.

## Variáveis

`EXPOR_NA_REDE`, `HTTPS_CERT`, `HTTPS_KEY`, `ORIGENS_PERMITIDAS`: ver README. Hosts que não sejam `localhost`, IP ou estejam em `ORIGENS_PERMITIDAS` são recusados (421).
