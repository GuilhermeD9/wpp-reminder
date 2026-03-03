require('dotenv').config();
process.env.TZ = 'America/Sao_Paulo';

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
let ALVO_SEND_ID = null;
let ALVO_CHAT_ID = null;

const CONFIG = {
    NUMERO_ALVO: process.env.NUMERO_ALVO, // FORMATO(55 + DDD + NÚMERO) 
    REMEDIOS_POR_HORARIO: {
        '12:00': 'Anticoncepcional',
        '12:30': 'Roacutan'
    }
};

const respostasPendentes = new Map();
const agendamentosAtivos = new Map();

const client = new Client({
    authStrategy: new LocalAuth({ dataPath: process.env.WWEBJS_DATA_PATH || '.wwebjs_auth' }),
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process',
            '--disable-gpu'
        ]
    }
});

client.on('qr', (qr) => {
    console.log('📱 Escaneie o QR Code:');
    qrcode.generate(qr, { small: true });
});

client.on('ready', async () => {
    console.log('---------------------------------------------------');
    console.log('✅ Robô iniciado!');
    console.log(`🕒 Hora do Sistema: ${new Date().toLocaleTimeString('pt-BR')}`);
    console.log('---------------------------------------------------');

    try {
        console.log(`🔎 Procurando o ID correto para ${CONFIG.NUMERO_ALVO}...`);
        const contato = await client.getNumberId(CONFIG.NUMERO_ALVO);

        ALVO_SEND_ID = contato?._serialized || null;
        ALVO_CHAT_ID = `${CONFIG.NUMERO_ALVO.replace(/\D/g, '')}@c.us`;
 
        if (contato) {
            console.log(`✅ Número encontrado: ${contato._serialized}`);
            console.log(`📩 Enviando mensagem de teste...`);
            await client.sendMessage(contato._serialized, 
                `🤖 *Robozildo Online!*

📅 Seus remédios agendados:
${Object.entries(CONFIG.REMEDIOS_POR_HORARIO).map(([h,r]) => `⏰ ${h} → ${r}`).join('\n')}`);
        } else {
            console.error('❌ ERRO GRAVE: O WhatsApp não encontrou esse número. Verifique se colocou o 9 na frente ou se o DDD está certo.');
        }
    } catch (e) {
        console.error('❌ Erro no teste inicial:', e);
    }

    iniciarAgendador();
});

client.on('message', async (message) => {
    const contato = message.from;
    
    if (!ALVO_CHAT_ID) return;
    if (message.from !== ALVO_CHAT_ID) return;

    const texto = message.body.toLowerCase().trim();

    if (respostasPendentes.has(contato)) {
        const estadoAtual = respostasPendentes.get(contato);

        if (estadoAtual.esperandoMinutos && !isNaN(texto) && parseInt(texto) > 0) {
            const minutos = parseInt(texto);
            await message.reply(`✅ Ok! Te lembro em ${minutos} minutos.`);
            
            respostasPendentes.delete(contato);

            setTimeout(() => {
                enviarLembrete(estadoAtual.horario, true); 
            }, minutos * 60 * 1000);
        }

        else if (['sim', 's', 'tomei', 'ja tomei', '1'].includes(texto)) {
            await message.reply('✅ Ótimo! Registrei que você tomou. <3');
            
            if (estadoAtual.timerId) clearTimeout(estadoAtual.timerId);
            respostasPendentes.delete(contato);
        } 
        else if (['adiar', 'espera', 'depois', '2'].includes(texto)) {
            await message.reply('⏰ Por quantos minutos quer adiar?\n💡 Ex: 30, 60, 120...');
            
            if (estadoAtual.timerId) clearTimeout(estadoAtual.timerId);
            respostasPendentes.set(contato, { 
                ...estadoAtual, 
                esperandoMinutos: true,
                timerId: null 
            });
        } else if (['vou tomar pela noite', 'noite', '3'].includes(texto)) {
            await message.reply('🌙 Perfeito! Registrei que vai tomar à noite.\n⏰ Te lembrarei às 19h.');
            
            if (estadoAtual.timerId) clearTimeout(estadoAtual.timerId);
            respostasPendentes.delete(contato);

            const agora = new Date();
            const noite = new Date();
            noite.setHours(19, 0, 0, 0);
            
            if (noite <= agora) {
                noite.setDate(noite.getDate() + 1);
            }
            
            const milissegundosAteNoite = noite - agora;
            
            setTimeout(() => {
                enviarLembrete(estadoAtual.horario, true); 
            }, milissegundosAteNoite);
        } else if (['adiar por 7 dias', 'intervalo', '4'].includes(texto)) {
            const agora = new Date();
            const adiamento = new Date();
            adiamento.setDate(agora.getDate() + 7);
            
            await message.reply(`⏰ Remédio adiado por 7 dias. Você será lembrada novamente dia *${adiamento.toLocaleDateString('pt-BR')}*`);
                        
            if (estadoAtual.timerId) clearTimeout(estadoAtual.timerId);
            respostasPendentes.delete(contato);
            
            agendamentosAtivos.set(estadoAtual.horario, adiamento);
            console.log(`📅 Agendamento registrado: ${estadoAtual.horario} → ${adiamento.toLocaleDateString('pt-BR')}`);
            
            const milissegundosIntervalo = adiamento - agora;
            
            setTimeout(() => {
                agendamentosAtivos.delete(estadoAtual.horario);
                console.log(`✅ Agendamento concluído: ${estadoAtual.horario}`);
                enviarLembrete(estadoAtual.horario, true); 
            }, milissegundosIntervalo);
        }
    }
});

async function enviarLembrete(horarioAtual, isSnooze = false) {
    try {
        if (!ALVO_SEND_ID) return console.error('❌ ALVO_SEND_ID não definido');
        const remedioAtual = CONFIG.REMEDIOS_POR_HORARIO[horarioAtual]
        
        let mensagem = isSnooze 
            ? `⏰ *Soneca acabou!*\n🌙 Hora de tomar o *${remedioAtual}*`
            : `💊 *Hora do ${remedioAtual}*\n\n🤔 Já tomou?`;

        mensagem += `\n\n📝 *Responda:*\n1️⃣ Sim\n2️⃣ Adiar (diga os minutos)\n3️⃣ Tomar à noite`;

        if(remedioAtual === 'Anticoncepcional') {
            mensagem += '\n4️⃣ Adiar por 7 dias';
        }
        
        await client.sendMessage(ALVO_SEND_ID, mensagem);
        console.log(`📤 ${remedioAtual} → ${ALVO_SEND_ID}`);
        
        const timerId = setTimeout(async () => {
             if (respostasPendentes.has(ALVO_CHAT_ID)) {
                 await client.sendMessage(ALVO_SEND_ID, '👀 Esqueceu de me responder...\n💊 Já tomou o remédio?');
             }
        }, 15 * 60 * 1000);

        respostasPendentes.set(ALVO_CHAT_ID, { horario: horarioAtual, timerId });
        
        console.log(`📤 Lembrete enviado (Snooze: ${isSnooze})`);
    } catch (error) {
        console.error('❌ Erro ao enviar:', error);
    }
}

function iniciarAgendador() {
    console.log(`📅 ${Object.entries(CONFIG.REMEDIOS_POR_HORARIO).map(([h,r]) => `${h}→${r}`).join(', ')}`);
    let ultimoMinutoDisparado = "";

    setInterval(() => {
        const agora = new Date();
        const hora = agora.getHours().toString().padStart(2, '0');
        const min = agora.getMinutes().toString().padStart(2, '0');
        const horarioFormatado = `${hora}:${min}`;

        if(horarioFormatado === ultimoMinutoDisparado) {
            return;
        }
        ultimoMinutoDisparado = horarioFormatado;

        if (CONFIG.REMEDIOS_POR_HORARIO[horarioFormatado] && respostasPendentes.size === 0) {
            const agendamentoAtivo = agendamentosAtivos.get(horarioFormatado);
            
            if (agendamentoAtivo) {
                const agora = new Date();
                const dataAgendamento = new Date(agendamentoAtivo);
                
                if (agora < dataAgendamento) {
                    console.log(`⏭️ Pulando ${horarioFormatado} - agendado para ${dataAgendamento.toLocaleDateString('pt-BR')}`);
                    return;
                } else {
                    agendamentosAtivos.delete(horarioFormatado);
                    console.log(`🗑️ Removendo agendamento expirado: ${horarioFormatado}`);
                }
            }
            
            console.log(`🔥 Enviando lembrete: ${horarioFormatado}`);
            enviarLembrete(horarioFormatado, false);
        }
    }, 30 * 1000);
}

client.on('disconnected', (reason) => {
    console.log(`[${new Date().toLocaleTimeString('pt-BR')}] ❌ Cliente desconectado! Motivo:`, reason);
    console.log('♻️ Reiniciando o processo à força para o PM2 levantar de novo...');
    process.exit(1); 
});

client.on('auth_failure', msg => {
    console.error(`[${new Date().toLocaleTimeString('pt-BR')}] ❌ Falha na autenticação:`, msg);
    process.exit(1);
});

client.initialize();