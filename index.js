require('dotenv').config();
process.env.TZ = 'America/Sao_Paulo';

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const db = require('./db.js');

const fs = require('fs');
const path = require('path');

/**
 * Configurações Principais do Robô
 * @property {string} NUMERO_ALVO - O número do usuário que receberá os alertas. FORMATO(55 + DDD + NÚMERO) 
 * @property {Object} REMEDIOS_POR_HORARIO - Tabela de medicamentos organizados por seus respectivos horários ('HH:MM': 'Nome').
 */
const CONFIG = {
    NUMERO_ALVO: process.env.NUMERO_ALVO,
    REMEDIOS_POR_HORARIO: {
        '12:00': 'Anticoncepcional',
        '12:30': 'Roacutan'
    }
};

/**
 * HIGIENIZAÇÃO DE LOCK DO CHROMIUM (DOCKER)
 * Evita o "Error: Failed to launch the browser process: Code 21".
 * Remove o atalho fantasma SingletonLock deixado por uma queda forçada anterior da máquina.
 */
const lockPath = path.join(__dirname, '.wwebjs_auth', 'session', 'SingletonLock');
try {
    fs.rmSync(lockPath, { force: true });
    console.log('🗑️  [SISTEMA] Lock do Chromium verificado e limpo se necessário!');
} catch (e) {
    console.error('❌ [SISTEMA] Falha técnica ao verificar lock do Chromium:', e);
}

/**
 * Inicialização do Cliente do Whatsapp.
 * Utiliza o LocalAuth para persistência da Sessão no Docker Volume sem precisar parear o QR Code várias vezes.
 */
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

/**
 * Evento: Pareamento inicial (Escaneamento)
 */
client.on('qr', (qr) => {
    console.log('📱 [AUTH] Escaneie o QR Code:');
    qrcode.generate(qr, { small: true });
});

/**
 * Evento: Conexão Bem-Sucedida
 * Disparado quando o robô inicializa os contatos e está pronto para o uso.
 */
client.on('ready', async () => {
    console.log('---------------------------------------------------');
    console.log('✅ [WHATSAPP] Robô iniciado com sucesso!');
    console.log(`🕒 [WHATSAPP] Hora do Sistema: ${new Date().toLocaleTimeString('pt-BR')}`);
    console.log('---------------------------------------------------');

    const alvoLimpo = CONFIG.NUMERO_ALVO.replace(/\D/g, '');
    const dataObj = db.readDB();
    if (dataObj.pendencias[alvoLimpo] && !Array.isArray(dataObj.pendencias[alvoLimpo])) {
        dataObj.pendencias[alvoLimpo] = [];
        db.writeDB(dataObj);
        console.log('🧹 [SISTEMA] Arquitetura antiga detectada. Arquivo purgado para o novo modelo de Fila de Pendências!');
    }

    try {
        console.log(`🔎 [SISTEMA] Procurando a chave ID para o alvo configurado: ${CONFIG.NUMERO_ALVO}...`);
        const contato = await client.getNumberId(CONFIG.NUMERO_ALVO);

        ALVO_SEND_ID = contato?._serialized || null;
        ALVO_CHAT_ID = `${CONFIG.NUMERO_ALVO.replace(/\D/g, '')}@c.us`;
 
        if (contato) {
            console.log(`✅ [SISTEMA] Número pareado: ${contato._serialized}`);
            console.log(`📩 [SISTEMA] Disparando mensagem de boas vindas...`);
            await client.sendMessage(contato._serialized, 
                `🤖 *Robozildo Online!*

📅 Seus remédios agendados:
${Object.entries(CONFIG.REMEDIOS_POR_HORARIO).map(([h,r]) => `⏰ ${h} → ${r}`).join('\n')}`);
        } else {
            console.error('❌ [ERRO] O WhatsApp não encontrou o número base. Verifique ausência do 9º dígito ou DDD.');
        }
    } catch (e) {
        console.error('❌ [ERRO] Falha no teste inicial de mensagem:', e);
    }

    iniciarAgendador();
});

function transitarFilaParaOProximo(alvoLimpo, dataObj) {
    if (dataObj.pendencias[alvoLimpo] && dataObj.pendencias[alvoLimpo].length > 0) {
        dataObj.pendencias[alvoLimpo].shift();
        db.writeDB(dataObj);
        
        // Verifica se sobrou algum remédio acumulado no atraso [1...] e engatilha a mensagem oculta para a frente da fila [0]
        if (dataObj.pendencias[alvoLimpo].length > 0) {
            processarFilaLembretes(alvoLimpo, true);
        }
    }
}

/**
 * Evento: Recepção de Mensagens
 * Analisa a palavra-chave enviada pelo contato e aciona ações no Banco de Dados.
 */
client.on('message', async (message) => {
    const contato = message.from;
    const alvoLimpo = CONFIG.NUMERO_ALVO.replace(/\D/g, ''); // Ex: "551199999999" (Sem arrobas e letras)
    
    if (!contato.includes(alvoLimpo.slice(-8))) return;

    const texto = message.body.toLowerCase().trim();
    const dataObj = db.readDB();
    
    if (Array.isArray(dataObj.pendencias[alvoLimpo]) && dataObj.pendencias[alvoLimpo].length > 0) {
        const estadoAtual = dataObj.pendencias[alvoLimpo][0];

        if (estadoAtual.esperandoMinutos && !isNaN(texto) && parseInt(texto) > 0) {
            const minutos = parseInt(texto);
            await message.reply(`✅ Ok! Te lembro em ${minutos} minutos.`);
            
            const executarEm = Date.now() + (minutos * 60 * 1000);
            dataObj.lembretesPontuais.push({
                horarioOriginal: estadoAtual.horario,
                executarEm
            });
            
            transitarFilaParaOProximo(alvoLimpo, dataObj);
        }

        else if (['sim', 's', 'tomei', 'ja tomei', '1'].includes(texto)) {
            await message.reply('✅ Ótimo! Registrei que você tomou. <3');
            transitarFilaParaOProximo(alvoLimpo, dataObj);
        } 

        else if (['adiar', 'espera', 'depois', '2'].includes(texto)) {
            await message.reply('⏰ Por quantos minutos quer adiar?\n💡 Ex: 30, 60, 120...');
            
            estadoAtual.esperandoMinutos = true;
            db.writeDB(dataObj);
        } 

        else if (['vou tomar pela noite', 'noite', '3'].includes(texto)) {
            await message.reply('🌙 Perfeito! Registrei que vai tomar à noite.\n⏰ Te lembrarei às 19h.');

            const agora = new Date();
            const noite = new Date();
            noite.setHours(19, 0, 0, 0);
            
            if (noite <= agora) {
                noite.setDate(noite.getDate() + 1);
            }
            
            dataObj.lembretesPontuais.push({
                horarioOriginal: estadoAtual.horario,
                executarEm: noite.getTime()
            });
            
            transitarFilaParaOProximo(alvoLimpo, dataObj);
        } 

        else if (['adiar por 7 dias', 'intervalo', '4'].includes(texto)) {
            const agora = new Date();
            const adiamento = new Date();
            adiamento.setDate(agora.getDate() + 7);
            
            await message.reply(`⏰ Remédio adiado por 7 dias. Você será lembrada novamente dia *${adiamento.toLocaleDateString('pt-BR')}*`);
            
            dataObj.agendamentosMestres[estadoAtual.horario] = adiamento.getTime();
            
            console.log(`📅 [DB] Agendamento Mestre gerado: Pular aviso das ${estadoAtual.horario} até ${adiamento.toLocaleDateString('pt-BR')}`);
            transitarFilaParaOProximo(alvoLimpo, dataObj);
        }
    }
});

/**
 * Joga o remédio na Fila do usuário silenciosamente e pede pra verificar se a esteira está travada ou deve enviar o SMS.
 * @param {string} horarioAtual - O index/hora do array CONFIG.REMEDIOS_POR_HORARIO.
 * @param {boolean} isSnooze - O conteúdo da mensagem deve ser redigido como cobrança contínua (Cochilo)?
 * @param {string} contatoAlvo - Serial (opcional). Resolve automático se vago.
 */
async function adicionarLembreteNaFila(horarioAtual, isSnooze = false, contatoAlvo = null) {
    try {
        let numeroReal = contatoAlvo;
        if (!numeroReal) {
            const user = await client.getNumberId(CONFIG.NUMERO_ALVO)
            if (!user) return console.error('❌ [WHATSAPP] Falha no enfileiramento: Telefone master não encontrado.');
            numeroReal = user._serialized;
        }

        const remedioAtual = CONFIG.REMEDIOS_POR_HORARIO[horarioAtual];
        if (!remedioAtual) return;
        
        const alvoLimpo = CONFIG.NUMERO_ALVO.replace(/\D/g, '');
        const dataObj = db.readDB();
        
        if (!Array.isArray(dataObj.pendencias[alvoLimpo])) {
            dataObj.pendencias[alvoLimpo] = [];
        }

        dataObj.pendencias[alvoLimpo].push({ 
            horario: horarioAtual, 
            numeroSerializado: numeroReal,
            esperandoMinutos: false,
            dataEnvio: null,
            avisosEnviados: 0,
            isSnooze: isSnooze,
            remedioNome: remedioAtual
        });
        
        db.writeDB(dataObj);
        console.log(`📥 [FILA] ${remedioAtual} (${horarioAtual}) enfileirado para cobrança (Total na Fila: ${dataObj.pendencias[alvoLimpo].length})`);
        
        processarFilaLembretes(alvoLimpo);
    } catch (error) {
        console.error('❌ [ERRO] Evento adverso ao enfileirar Lembrete:', error);
    }
}

/**
 * Analisa a fila do usuário e Dispara se a posição 0 estiver virgêm (Não notificada ainda).
 * @param {string} alvoLimpo - Target
 * @param {boolean} isRecuperado - A Fila do bot acabou de transitar e isso era algo que estava oculto no passado esperando?
 */
async function processarFilaLembretes(alvoLimpo, isRecuperado = false) {
    const dataObj = db.readDB();
    const fila = dataObj.pendencias[alvoLimpo];

    if (!Array.isArray(fila) || fila.length === 0) return;

    const pacienteVez = fila[0]; // Operamos e cobramos sempre o mais antigo que sobrou na esteira

    if (pacienteVez.dataEnvio === null) {
        let mensagem = pacienteVez.isSnooze 
            ? `⏰ *Soneca acabou!*\n🌙 Hora de tomar o *${pacienteVez.remedioNome}*`
            : `💊 *Hora do ${pacienteVez.remedioNome}*\n\n🤔 Já tomou?`;

        if (isRecuperado) {
            mensagem = `👀 *Aproveitando...*\nVocê ainda tinha esse remédio pendente lá das ${pacienteVez.horario}:\n\n💊 *${pacienteVez.remedioNome}*\n\nJá tomou esse também?`;
        }

        mensagem += `\n\n📝 *Responda:*\n1️⃣ Sim\n2️⃣ Adiar (diga os minutos)\n3️⃣ Tomar à noite`;

        if(pacienteVez.remedioNome === 'Anticoncepcional') {
            mensagem += '\n4️⃣ Adiar por 7 dias';
        }
        
        await client.sendMessage(pacienteVez.numeroSerializado, mensagem);
        console.log(`📤 [DISPARO] ${pacienteVez.remedioNome} → Notificado ao usuário (*Snooze/Recuperado: ${pacienteVez.isSnooze || isRecuperado})`);
        
        // Liga o motorzinho interno pra que o Loop de 15min te perturbe e tranca o envio duplo
        pacienteVez.dataEnvio = Date.now();
        pacienteVez.avisosEnviados = 1;
        db.writeDB(dataObj);
    }
}

/**
 * Motor Assíncrono do Robô.
 * Roda de 30 em 30 segundos validando a linha do tempo para acionar disparo oficial ou cobrar contatos dorminhocos.
 */
function iniciarAgendador() {
    console.log(`📅 [CRON] Monitorando Linha do Tempo: ${Object.entries(CONFIG.REMEDIOS_POR_HORARIO).map(([h,r]) => `${h}→${r}`).join(', ')}`);
    let ultimoMinutoDisparado = "";

    setInterval(async () => {
        const agora = new Date();
        const hora = agora.getHours().toString().padStart(2, '0');
        const min = agora.getMinutes().toString().padStart(2, '0');
        const horarioFormatado = `${hora}:${min}`; // Padrão '12:30'
        const timestampAgora = agora.getTime();

        const dataObj = db.readDB();
        let mudouDb = false;

        // TAREFA 1: Enviar os Guias Padrão Baseado no Relógio.
        if(horarioFormatado !== ultimoMinutoDisparado) {
            ultimoMinutoDisparado = horarioFormatado;

            if (CONFIG.REMEDIOS_POR_HORARIO[horarioFormatado]) {
                const agendamentoMestre = dataObj.agendamentosMestres[horarioFormatado];
                
                let podeMandar = true;
                if (agendamentoMestre) {
                    if (timestampAgora < agendamentoMestre) {
                        console.log(`⏭️ [CRON] Pulando emissão das ${horarioFormatado} - (Existe um silenciador longo de 7 dias ativo).`);
                        podeMandar = false;
                    } else {
                        delete dataObj.agendamentosMestres[horarioFormatado];
                        mudouDb = true;
                        console.log(`🗑️ [DB] Silenciador longo vencido. Retomando lembretes das ${horarioFormatado} de hoje em diante.`);
                    }
                }
                
                if (podeMandar) {
                    console.log(`🔥 [CRON] Hora detectada! Emitindo rotina das ${horarioFormatado}`);
                    adicionarLembreteNaFila(horarioFormatado, false);
                }
            }
        }

        // TAREFA 2: Sistema Anti-Ignorados (Cobrança a cada 15 min pro paciente)
        for (const [alvo, fila] of Object.entries(dataObj.pendencias)) {
            if (!Array.isArray(fila) || fila.length === 0) continue;
            
            const estado = fila[0]; // Só cobra quem está travando a porta [0]
            if (estado.esperandoMinutos || estado.dataEnvio === null) continue; 

            const tempoDecorrido = timestampAgora - estado.dataEnvio;
            const minutosDecorridos = Math.floor(tempoDecorrido / 60000);
            
            // Limitador dinâmico: Avisa até 2 vezes a cada 15m antes de desistir para evitar denúncia por Spam.
            if (minutosDecorridos >= 15 && (!estado.avisosEnviados || estado.avisosEnviados < 4)) {
                try {
                    await client.sendMessage(estado.numeroSerializado, '👀 Esqueceu de me responder...\n💊 Diz pra mim, já tomou o remédio?');
                    estado.dataEnvio = timestampAgora;
                    estado.avisosEnviados = (estado.avisosEnviados || 1) + 1;
                    mudouDb = true;
                    console.log(`🔔 [CRON] Usuário ignorou. Disparando puxão de orelha 15min: ${estado.avisosEnviados}/3`);
                } catch(e) {
                    console.error('❌ [ERRO] Falha técnica ao dar puxão de orelha:', e);
                }
            }
        }

        // TAREFA 3: Despertar de Sonecas e Agendamentos Noturnos.
        const restantes = [];
        for (const pontual of dataObj.lembretesPontuais) {
            if (timestampAgora >= pontual.executarEm) {
                console.log(`🔥 [CRON] Soneca/Noite vencida alcançada para a dose das ${pontual.horarioOriginal}`);
                adicionarLembreteNaFila(pontual.horarioOriginal, true); // Ao disparar "adiados", jogamos na fila e botamos a pessoa no cabresto novamente.
                mudouDb = true;
            } else {
                restantes.push(pontual);
            }
        }
        
        // Remove do array as sonecas que já disparamos as listando.
        if (restantes.length !== dataObj.lembretesPontuais.length) {
            dataObj.lembretesPontuais = restantes;
            mudouDb = true;
        }

        if (mudouDb) {
            db.writeDB(dataObj);
        }

    }, 30 * 1000);
}

/**
 * Interceptações vitais de falhas de autenticação do Puppeteer
 */
client.on('disconnected', (reason) => {
    console.log(`[${new Date().toLocaleTimeString('pt-BR')}] ❌ [WHATSAPP] Cliente desconectado na marra! Motivo:`, reason);
    console.log('♻️ [SISTEMA] Autodestruindo o core do Node pra que o PM2/Docker suba tudo de novo imediatamente...');
    process.exit(1); 
});

client.on('auth_failure', msg => {
    console.error(`[${new Date().toLocaleTimeString('pt-BR')}] ❌ [WHATSAPP] Falha no resgate de pareamento (Auth_failure):`, msg);
    process.exit(1);
});

client.initialize();