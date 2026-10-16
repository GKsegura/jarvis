// Ponto de entrada: a janela principal (câmera, voz, núcleo) ou o painel de controle das outras telas
// ("Jarvis, assume as telas" abre ?view=dashboard em cada monitor extra)
const view = new URLSearchParams(location.search).get('view');
if (view === 'dashboard') void import('./dashboard');
else void import('./main');

export {};
